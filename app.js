(() => {
  "use strict";

  function init() {
    // =====================================================
    // 1. CONFIGURAÇÃO E ESTADO
    // =====================================================

    const STORAGE_KEY = "precificachef_v1";
    const STORAGE_SCHEMA_VERSION = 2;
    const BACKUP_VERSION = 2;
    const MAX_IMPORT_SIZE = 10 * 1024 * 1024;
    const MAX_RECORDS = 5000;

    const $ = (id) => document.getElementById(id);

    const ALLOWED_UNITS = new Set(["g", "kg", "ml", "L", "un"]);

    const AVAILABLE_THEMES = [
      "vanilla",
      "vanilla-dark",
      "rosa",
      "laranja",
      "roxo"
    ];

    const THEME_STORAGE_KEY = "precificachef_theme_v1";

    const THEME_COLORS = {
      vanilla: "#76543f",
      "vanilla-dark": "#6d5747",
      rosa: "#b84574",
      laranja: "#a95a27",
      roxo: "#7956ac"
    };

    let lines = [];
    let nextLineId = 1;
    let lastCalculation = null;
    let toastTimer = null;
    let loadNotice = null;

    const state = loadState();

    // =====================================================
    // 2. FUNÇÕES UTILITÁRIAS
    // =====================================================

    function createId(prefix = "id") {
      try {
        if (
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
        ) {
          return crypto.randomUUID();
        }

        if (
          typeof crypto !== "undefined" &&
          typeof crypto.getRandomValues === "function"
        ) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);

          return `${prefix}-${Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("")}`;
        }
      } catch (error) {
        console.warn("Usando alternativa para geração de ID.", error);
      }

      return `${prefix}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 12)}`;
    }

    function textValue(value, fallback = "") {
      if (typeof value === "string") {
        return value.slice(0, 20000);
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }

      if (typeof value === "boolean") {
        return String(value);
      }

      return fallback;
    }

    function nonNegativeNumber(value) {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      const number = typeof value === "number" ? value : Number(value);

      return Number.isFinite(number) && number >= 0 ? number : null;
    }

    function finiteNumberOrNull(value) {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      const number = typeof value === "number" ? value : Number(value);

      return Number.isFinite(number) ? number : null;
    }

    function parseMoney(value) {
      if (typeof value === "number") {
        return Number.isFinite(value) && value >= 0 ? value : null;
      }

      let text = String(value ?? "")
        .trim()
        .replace(/[\s\u00a0]/g, "")
        .replace(/^R\$/i, "");

      if (!text) return null;

      // Formatos brasileiros: 1.250,99 e 5,99.
      // Decimal simples: 5.99.
      if (text.includes(",")) {
        text = text.replace(/\./g, "").replace(",", ".");
      }

      const number = Number(text);

      return Number.isFinite(number) && number >= 0
        ? number
        : null;
    }

    function num(id) {
      const element = $(id);
      if (!element) return null;

      const value = element.value.trim();
      if (!value) return null;

      const number = Number(value);

      return Number.isFinite(number) && number >= 0
        ? number
        : null;
    }

    function money(number) {
      return typeof number === "number" && Number.isFinite(number)
        ? number.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
          })
        : "—";
    }

    function fmt(number, digits = 3) {
      return typeof number === "number" && Number.isFinite(number)
        ? number.toLocaleString("pt-BR", {
            maximumFractionDigits: digits
          })
        : "—";
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]);
    }

    function validDate(value) {
      const timestamp = Date.parse(textValue(value));

      return Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : new Date().toISOString();
    }

    function uniqueRecordId(value, usedIds, prefix) {
      let id = textValue(value).trim();

      if (
        !/^[a-zA-Z0-9_-]{1,120}$/.test(id) ||
        usedIds.has(id)
      ) {
        id = createId(prefix);

        while (usedIds.has(id)) {
          id = createId(prefix);
        }
      }

      usedIds.add(id);

      return id;
    }

    function safeUnit(value, fallback = "g") {
      return ALLOWED_UNITS.has(value) ? value : fallback;
    }

    function setValue(id, value) {
      const element = $(id);
      if (!element) return;

      element.value = textValue(value);
    }

    function setSelectValue(id, value, fallback) {
      const element = $(id);
      if (!element) return;

      const desired = textValue(value);

      const exists = Array.from(element.options).some(
        (option) => option.value === desired
      );

      if (exists) {
        element.value = desired;
        return;
      }

      const fallbackExists = Array.from(element.options).some(
        (option) => option.value === fallback
      );

      element.value = fallbackExists ? fallback : "";
    }

    function on(id, eventName, callback) {
      const element = $(id);

      if (!element) {
        console.warn(`Elemento HTML não encontrado: #${id}`);
        return null;
      }

      element.addEventListener(eventName, callback);

      return element;
    }

    function showToast(message, duration = 2800) {
      const toast = $("toast");
      if (!toast) {
        console.info(message);
        return;
      }

      toast.textContent = message;
      toast.classList.remove("hidden");

      clearTimeout(toastTimer);

      toastTimer = setTimeout(() => {
        toast.classList.add("hidden");
      }, duration);
    }

    // =====================================================
    // 3. NORMALIZAÇÃO E VALIDAÇÃO DOS DADOS
    // =====================================================

    function normalizeIngredient(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
      ) {
        return null;
      }

      const name = textValue(input.name).trim();
      const price = parseMoney(input.price);
      const content = parseMoney(input.content);

      if (
        !name ||
        price === null ||
        content === null ||
        content <= 0
      ) {
        return null;
      }

      return {
        id: "",
        name: name.slice(0, 200),
        brand: textValue(input.brand).trim().slice(0, 200),
        price,
        content,
        unit: safeUnit(input.unit),
        notes: textValue(input.notes).trim().slice(0, 5000),
        updatedAt: validDate(input.updatedAt)
      };
    }

    function normalizeLineData(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
      ) {
        input = {};
      }

      const unit = safeUnit(input.unit);
      const packUnit = safeUnit(input.packUnit, unit);
      const mode = input.mode === "direct" ? "direct" : "ingredient";

      return {
        ingredientId: textValue(input.ingredientId).slice(0, 120),
        name: textValue(input.name).trim().slice(0, 500),
        quantity: textValue(input.quantity).slice(0, 100),
        unit,
        freePrice: textValue(input.freePrice).slice(0, 100),
        packSize: textValue(input.packSize).slice(0, 100),
        packUnit,
        mode,
        directCost: textValue(input.directCost).slice(0, 100)
      };
    }

    function normalizeCalculation(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
      ) {
        return null;
      }

      return {
        ingredientTotal: finiteNumberOrNull(input.ingredientTotal),
        energy: finiteNumberOrNull(input.energy),
        other: finiteNumberOrNull(input.other),
        packaging: finiteNumberOrNull(input.packaging),
        total: finiteNumberOrNull(input.total),
        unitCost: finiteNumberOrNull(input.unitCost),
        profit: finiteNumberOrNull(input.profit),
        suggested: finiteNumberOrNull(input.suggested),
        yieldCount: finiteNumberOrNull(input.yieldCount),
        pending: Math.max(
          0,
          Math.floor(nonNegativeNumber(input.pending) ?? 0)
        ),
        taxRate: finiteNumberOrNull(input.taxRate),
        sale: finiteNumberOrNull(input.sale)
      };
    }

    function normalizeProduct(input) {
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
      ) {
        return null;
      }

      const name = textValue(input.name).trim();

      if (!name) return null;

      const sourceLines = Array.isArray(input.lines)
        ? input.lines.slice(0, 500)
        : [];

      return {
        id: "",
        name: name.slice(0, 200),
        category: textValue(input.category, "Doce").slice(0, 100),
        yieldCount: nonNegativeNumber(input.yieldCount),
        prepMinutes: nonNegativeNumber(input.prepMinutes),
        notes: textValue(input.notes).slice(0, 10000),
        lines: sourceLines.map(normalizeLineData),
        equipment: textValue(
          input.equipment,
          "Forno elétrico"
        ).slice(0, 200),
        watts: nonNegativeNumber(input.watts),
        equipmentMinutes: nonNegativeNumber(input.equipmentMinutes),
        tariff: parseMoney(input.tariff),
        otherCosts: parseMoney(input.otherCosts),
        packaging: parseMoney(input.packaging),
        taxes: nonNegativeNumber(input.taxes),
        salePrice: parseMoney(input.salePrice),
        desiredMargin: nonNegativeNumber(input.desiredMargin),
        calculation: normalizeCalculation(input.calculation),
        savedAt: validDate(input.savedAt)
      };
    }

    function normalizeState(source, diagnostics = null) {
      const rawIngredients = Array.isArray(source.ingredients)
        ? source.ingredients
        : [];

      const rawProducts = Array.isArray(source.products)
        ? source.products
        : [];

      const ingredients = [];
      const products = [];

      const ingredientIds = new Set();
      const productIds = new Set();

      const ingredientSource = rawIngredients.slice(0, MAX_RECORDS);
      const productSource = rawProducts.slice(0, MAX_RECORDS);

      let invalidIngredients = rawIngredients.length - ingredientSource.length;
      let invalidProducts = rawProducts.length - productSource.length;

      for (const raw of ingredientSource) {
        const ingredient = normalizeIngredient(raw);

        if (!ingredient) {
          invalidIngredients++;
          continue;
        }

        ingredient.id = uniqueRecordId(
          raw.id,
          ingredientIds,
          "ingredient"
        );

        ingredients.push(ingredient);
      }

      for (const raw of productSource) {
        const product = normalizeProduct(raw);

        if (!product) {
          invalidProducts++;
          continue;
        }

        product.id = uniqueRecordId(raw.id, productIds, "product");

        products.push(product);
      }

      if (diagnostics) {
        diagnostics.invalidIngredients = invalidIngredients;
        diagnostics.invalidProducts = invalidProducts;
      }

      return { ingredients, products };
    }

    // =====================================================
    // 4. PERSISTÊNCIA LOCAL E COMPATIBILIDADE
    // =====================================================

    function loadState() {
      const empty = () => ({ ingredients: [], products: [] });
      let raw = null;

      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (error) {
        console.warn("Armazenamento do navegador indisponível.", error);

        loadNotice =
          "O navegador bloqueou o armazenamento local. Seus dados não serão mantidos ao fechar esta página.";

        return empty();
      }

      if (!raw) return empty();

      try {
        const parsed = JSON.parse(raw);

        // Compatível com o formato antigo e com o formato versionado.
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.ingredients) &&
          Array.isArray(parsed.products)
        ) {
          return normalizeState(parsed);
        }

        console.warn(
          "Os dados locais não possuem uma estrutura reconhecida."
        );
      } catch (error) {
        console.warn("Não foi possível ler os dados locais.", error);
      }

      keepUnreadableCopy(raw);

      return empty();
    }

    // Antes de começar vazio, guarda uma cópia do que não pôde ser lido.
    // Sem isso, o próximo salvamento apagaria esses dados para sempre.
    function keepUnreadableCopy(raw) {
      try {
        localStorage.setItem(
          `${STORAGE_KEY}_ilegivel_${Date.now()}`,
          raw
        );

        loadNotice =
          "Os dados salvos neste navegador não puderam ser lidos. Uma cópia foi mantida e o app começou vazio.";
      } catch (error) {
        loadNotice =
          "Os dados salvos neste navegador não puderam ser lidos e podem ser sobrescritos ao salvar.";
      }
    }

    function persist() {
      try {
        const data = {
          schemaVersion: STORAGE_SCHEMA_VERSION,
          ingredients: state.ingredients,
          products: state.products
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

        return true;
      } catch (error) {
        console.error("Não foi possível salvar os dados.", error);

        showToast(
          "Não foi possível salvar. Exporte um backup e verifique o espaço do navegador."
        );

        return false;
      }
    }

    // Aplica uma alteração e a desfaz se o navegador não conseguir salvar,
    // para a tela nunca mostrar dados que não foram gravados.
    function commit(mutate) {
      const before = JSON.parse(
        JSON.stringify({
          ingredients: state.ingredients,
          products: state.products
        })
      );

      mutate();

      if (persist()) return true;

      state.ingredients = before.ingredients;
      state.products = before.products;

      return false;
    }

    // =====================================================
    // 5. NAVEGAÇÃO
    // =====================================================

    function switchTab(tab) {
      const allowedTabs = new Set([
        "precificacao",
        "ingredientes",
        "produtos"
      ]);

      if (!allowedTabs.has(tab)) return;

      document.querySelectorAll(".nav").forEach((button) => {
        const isActive = button.dataset.tab === tab;

        button.classList.toggle("active", isActive);

        if (isActive) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });

      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle(
          "hidden",
          panel.id !== `tab-${tab}`
        );
      });

      if (tab === "ingredientes") renderIngredients();
      if (tab === "produtos") renderProducts();
    }

    document.querySelectorAll(".nav").forEach((button) => {
      button.addEventListener("click", () => {
        switchTab(button.dataset.tab);
      });
    });

    // =====================================================
    // 6. UNIDADES E CONVERSÃO
    // =====================================================

    function unitOptions(selected) {
      const options = [
        ["g", "Gramas (g)"],
        ["kg", "Quilogramas (kg)"],
        ["ml", "Mililitros (ml)"],
        ["L", "Litros (L)"],
        ["un", "Unidades (un.)"]
      ];

      return options.map(([value, label]) => {
        return `<option value="${value}"${
          selected === value ? " selected" : ""
        }>${label}</option>`;
      }).join("");
    }

    function convertQuantity(value, fromUnit, toUnit) {
      if (!Number.isFinite(value)) return null;

      if (fromUnit === toUnit) return value;

      const conversion = {
        g: { dimension: "mass", factor: 1 },
        kg: { dimension: "mass", factor: 1000 },
        ml: { dimension: "volume", factor: 1 },
        L: { dimension: "volume", factor: 1000 },
        un: { dimension: "count", factor: 1 }
      };

      const from = conversion[fromUnit];
      const to = conversion[toUnit];

      if (!from || !to || from.dimension !== to.dimension) {
        return null;
      }

      const converted = value * from.factor / to.factor;

      return Number.isFinite(converted) ? converted : null;
    }

    // =====================================================
    // 7. LINHAS DE INGREDIENTES DA RECEITA
    // =====================================================

    function createLine(data = {}) {
      return {
        id: nextLineId++,
        ...normalizeLineData(data)
      };
    }

    function addLine(data = {}) {
      lines.push(createLine(data));
      renderLines();
    }

    function updateLine(id, key, value) {
      const line = lines.find((item) => item.id === id);
      if (!line) return;

      line[key] = value;

      if (key === "ingredientId" && value) {
        const ingredient = state.ingredients.find(
          (item) => item.id === value
        );

        if (ingredient) {
          line.name = ingredient.name;
          line.unit = ingredient.unit;
          line.packUnit = ingredient.unit;
          line.freePrice = String(ingredient.price);
          line.packSize = String(ingredient.content);
          line.mode = "ingredient";
        }
      }

      if (key === "mode" && value === "direct") {
        line.ingredientId = "";
      }

      renderLines();
      calculate();
    }

    function lineCost(line) {
      if (!line) return null;

      const quantity = parseMoney(line.quantity);

      if (quantity === null) return null;

      if (line.mode === "direct") {
        const directCost = parseMoney(line.directCost);

        return directCost === null
          ? null
          : directCost * quantity;
      }

      const price = parseMoney(line.freePrice);
      const packSize = parseMoney(line.packSize);

      if (
        price === null ||
        packSize === null ||
        packSize <= 0
      ) {
        return null;
      }

      const packSizeInLineUnit = convertQuantity(
        packSize,
        line.packUnit,
        line.unit
      );

      if (
        packSizeInLineUnit === null ||
        packSizeInLineUnit <= 0
      ) {
        return null;
      }

      return price * quantity / packSizeInLineUnit;
    }

    function renderLines() {
      const root = $("linhas-ingredientes");
      const empty = $("linhas-vazias");

      if (!root || !empty) return;

      root.replaceChildren();

      empty.classList.toggle("hidden", lines.length > 0);

      for (const line of lines) {
        // Limpa referências a ingredientes que já foram removidos.
        if (
          line.ingredientId &&
          !state.ingredients.some(
            (ingredient) => ingredient.id === line.ingredientId
          )
        ) {
          line.ingredientId = "";
        }

        const row = document.createElement("div");
        row.className = "ingredient-row";

        const options = state.ingredients.map((ingredient) => {
          return `<option value="${escapeHtml(ingredient.id)}"${
            line.ingredientId === ingredient.id ? " selected" : ""
          }>${escapeHtml(ingredient.name)} — ${money(ingredient.price)} / ${fmt(ingredient.content)} ${escapeHtml(ingredient.unit)}</option>`;
        }).join("");

        const isDirect = line.mode === "direct";
        const cost = lineCost(line);

        row.innerHTML = `
          <label>Ingrediente / descrição
            <select data-key="ingredientId">
              <option value="">Linha livre / escolher ingrediente</option>
              ${options}
            </select>
            <input
              data-key="name"
              aria-label="Nome ou descrição do ingrediente"
              value="${escapeHtml(line.name)}"
              placeholder="Nome ou descrição"
              autocomplete="off"
            >
          </label>

          <label>Quantidade usada
            <input
              data-key="quantity"
              type="number"
              min="0"
              step="any"
              value="${escapeHtml(line.quantity)}"
              placeholder="Ex.: 50"
              inputmode="decimal"
            >
          </label>

          <label>Unidade usada
            <select data-key="unit">
              ${unitOptions(line.unit)}
            </select>
          </label>

          <label>
            ${isDirect
              ? "Custo por unidade (R$)"
              : "Preço embalagem (R$)"}

            <input
              data-key="${isDirect ? "directCost" : "freePrice"}"
              inputmode="decimal"
              value="${escapeHtml(
                isDirect ? line.directCost : line.freePrice
              )}"
              placeholder="${isDirect ? "0,50" : "5,99"}"
            >

            ${!isDirect ? `
              <input
                data-key="packSize"
                aria-label="Conteúdo da embalagem"
                type="number"
                min="0"
                step="any"
                value="${escapeHtml(line.packSize)}"
                placeholder="Conteúdo da embalagem"
                inputmode="decimal"
              >

              <select data-key="packUnit" aria-label="Unidade da embalagem">
                ${unitOptions(line.packUnit)}
              </select>
            ` : ""}

            <button
              class="text-toggle"
              type="button"
              data-action="toggle-mode"
            >${isDirect
              ? "Usar preço de embalagem"
              : "Usar custo direto por unidade"}</button>

            ${!isDirect ? `
              <button
                class="btn btn-light save-line-ingredient"
                type="button"
                data-action="save-ingredient"
              >＋ Salvar nos ingredientes</button>
            ` : ""}
          </label>

          <div>
            <div class="line-cost">${
              cost === null ? "Pendente" : money(cost)
            }</div>

            <button
              type="button"
              class="icon-btn"
              data-action="remove"
              title="Remover linha"
              aria-label="Remover linha"
            >×</button>
          </div>
        `;

        // Atualiza o estado sem recriar a linha. Recriar no "change"
        // fazia o campo seguinte perder o foco e o valor digitado,
        // principalmente ao tocar de um campo para outro no celular.
        const syncField = (input) => {
          const found = lines.find((item) => item.id === line.id);

          if (!found) return;

          found[input.dataset.key] = input.value;

          calculate();

          const costElement = row.querySelector(".line-cost");
          const currentCost = lineCost(found);

          if (costElement) {
            costElement.textContent =
              currentCost === null
                ? "Pendente"
                : money(currentCost);
          }
        };

        row.querySelectorAll("[data-key]").forEach((input) => {
          if (input.tagName === "INPUT") {
            input.addEventListener("input", () => syncField(input));
            input.addEventListener("change", () => syncField(input));
            return;
          }

          input.addEventListener("change", () => {
            // Só escolher um ingrediente salvo altera os outros campos.
            if (input.dataset.key === "ingredientId") {
              updateLine(line.id, "ingredientId", input.value);
            } else {
              syncField(input);
            }
          });
        });

        row.querySelector('[data-action="remove"]')
          .addEventListener("click", () => {
            lines = lines.filter((item) => item.id !== line.id);
            renderLines();
            calculate();
          });

        row.querySelector('[data-action="toggle-mode"]')
          .addEventListener("click", () => {
            updateLine(
              line.id,
              "mode",
              isDirect ? "ingredient" : "direct"
            );
          });

        const saveButton = row.querySelector(
          '[data-action="save-ingredient"]'
        );

        if (saveButton) {
          saveButton.addEventListener("click", () => {
            saveLineIngredient(line.id);
          });
        }

        root.appendChild(row);
      }

      calculate();
    }

    // Dados de ingrediente a partir de uma linha da receita (ou null).
    // Conteúdos em kg e L são convertidos para g e ml.
    function ingredientFromLine(line) {
      if (!line || line.mode === "direct") return null;

      const name = textValue(line.name).trim();
      const price = parseMoney(line.freePrice);
      const content = parseMoney(line.packSize);
      const unit = safeUnit(line.packUnit || line.unit);

      if (
        !name ||
        price === null ||
        content === null ||
        content <= 0
      ) {
        return null;
      }

      let normalized = { unit, content };

      if (unit === "kg") {
        normalized = { unit: "g", content: content * 1000 };
      } else if (unit === "L") {
        normalized = { unit: "ml", content: content * 1000 };
      }

      if (
        !Number.isFinite(normalized.content) ||
        normalized.content <= 0
      ) {
        return null;
      }

      return {
        name: name.slice(0, 200),
        price,
        content: normalized.content,
        unit: normalized.unit
      };
    }

    // Pergunta o que fazer com um ingrediente que já existe.
    // Resolve com { choice: "replace" | "add" | "skip", all: boolean }.
    function askConflict(name, remaining) {
      const dialog = $("dialogo-conflito");

      if (!dialog || typeof dialog.showModal !== "function") {
        // Navegadores sem <dialog>: pergunta simples.
        return Promise.resolve({
          choice: confirm(
            `Já existe "${name}" nos ingredientes. Substituir o cadastro?`
          ) ? "replace" : "skip",
          all: false
        });
      }

      const allBox = $("dlg-todos");

      $("dlg-texto").textContent =
        `"${name}" já está nos ingredientes com outro preço ou conteúdo. O que deseja fazer?`;

      allBox.checked = false;
      $("dlg-todos-label").classList.toggle("hidden", remaining < 1);

      return new Promise((resolve) => {
        const finish = (choice) => {
          dialog.removeEventListener("cancel", onCancel);

          if (dialog.open) dialog.close();

          resolve({ choice, all: allBox.checked });
        };

        // Esc ou voltar do celular = ignorar.
        const onCancel = (event) => {
          event.preventDefault();
          finish("skip");
        };

        dialog.addEventListener("cancel", onCancel);

        dialog.querySelectorAll("[data-choice]").forEach((button) => {
          button.onclick = () => finish(button.dataset.choice);
        });

        dialog.showModal();
        $("dlg-substituir").focus();
      });
    }

    let savingToLibrary = false;

    async function saveLinesToLibrary(lineIds) {
      if (savingToLibrary) return;

      savingToLibrary = true;

      try {
        const targets = lineIds
          .map((id) => lines.find((line) => line.id === id))
          .filter(Boolean);

        // Trabalha numa cópia e só grava no fim, de uma vez.
        const working = JSON.parse(JSON.stringify(state.ingredients));
        const now = () => new Date().toISOString();
        const sameName = (a, b) =>
          a.trim().toLocaleLowerCase("pt-BR") ===
          b.trim().toLocaleLowerCase("pt-BR");

        const result = {
          added: 0,
          replaced: 0,
          skipped: 0,
          unchanged: 0,
          incomplete: 0
        };

        let remembered = null;

        for (let i = 0; i < targets.length; i++) {
          const line = targets[i];
          const data = ingredientFromLine(line);

          if (!data) {
            const hasData = Boolean(
              line.name ||
              line.ingredientId ||
              line.quantity ||
              line.freePrice ||
              line.directCost ||
              line.packSize
            );

            if (hasData) result.incomplete++;
            continue;
          }

          const matches = working.filter((item) =>
            sameName(item.name, data.name)
          );

          if (matches.length === 0) {
            working.push({
              id: createId("ingredient"),
              ...data,
              brand: "",
              notes: "",
              updatedAt: now()
            });

            result.added++;
            continue;
          }

          const identical = matches.some((item) =>
            item.price === data.price &&
            item.content === data.content &&
            item.unit === data.unit
          );

          if (identical) {
            result.unchanged++;
            continue;
          }

          let choice = remembered;

          if (!choice) {
            const answer = await askConflict(
              matches[0].name,
              targets.length - i - 1
            );

            choice = answer.choice;

            if (answer.all) remembered = choice;
          }

          if (choice === "replace") {
            Object.assign(matches[0], { ...data, updatedAt: now() });
            result.replaced++;
          } else if (choice === "add") {
            working.push({
              id: createId("ingredient"),
              ...data,
              brand: "",
              notes: "",
              updatedAt: now()
            });

            result.added++;
          } else {
            result.skipped++;
          }
        }

        const parts = [];

        if (result.added) parts.push(`${result.added} adicionado(s)`);
        if (result.replaced) parts.push(`${result.replaced} substituído(s)`);
        if (result.skipped) parts.push(`${result.skipped} ignorado(s)`);
        if (result.unchanged) parts.push(`${result.unchanged} já estava(m) igual`);
        if (result.incomplete) parts.push(`${result.incomplete} linha(s) incompleta(s) não salva(s)`);

        const summary = parts.length
          ? `Ingredientes: ${parts.join(", ")}.`
          : "Nenhuma linha com dados para salvar.";

        if (result.added + result.replaced > 0) {
          const saved = commit(() => {
            state.ingredients = working;
          });

          if (!saved) return;

          renderIngredients();
          renderLines();
        }

        showToast(summary, 4500);
      } finally {
        savingToLibrary = false;
      }
    }

    function saveLineIngredient(lineId) {
      const line = lines.find((item) => item.id === lineId);

      if (!line) return;

      if (!ingredientFromLine(line)) {
        showToast(
          "Preencha nome, preço da embalagem e conteúdo antes de salvar."
        );
        return;
      }

      saveLinesToLibrary([lineId]);
    }

    on("salvar-todos-ingredientes", "click", () => {
      if (lines.length === 0) {
        showToast("Adicione linhas à receita primeiro.");
        return;
      }

      saveLinesToLibrary(lines.map((line) => line.id));
    });

    on("adicionar-linha", "click", () => addLine());

    on("limpar-receita", "click", () => {
      if (
        !confirm(
          "Limpar os campos da receita atual? Os ingredientes salvos não serão apagados."
        )
      ) {
        return;
      }

      [
        "produto-nome",
        "rendimento",
        "tempo-preparo",
        "produto-observacoes",
        "potencia",
        "tempo-equipamento",
        "tarifa",
        "outros-custos",
        "embalagem",
        "taxas",
        "preco-venda",
        "margem-desejada"
      ].forEach((id) => {
        const element = $(id);
        if (element) element.value = "";
      });

      setSelectValue("produto-categoria", "Doce", "Doce");
      setSelectValue("equipamento", "Forno elétrico", "Forno elétrico");

      lines = [];
      renderLines();

      showToast("Formulário limpo.");
    });

    // =====================================================
    // 8. CÁLCULOS FINANCEIROS
    // =====================================================

    [
      "rendimento",
      "potencia",
      "tempo-equipamento",
      "tarifa",
      "outros-custos",
      "embalagem",
      "taxas",
      "preco-venda",
      "margem-desejada"
    ].forEach((id) => {
      on(id, "input", calculate);
      on(id, "change", calculate);
    });

    function calculate() {
      const yieldCount = num("rendimento");

      let ingredientTotal = 0;
      let pending = 0;

      const details = [];

      lines.forEach((line) => {
        const name = textValue(line.name).trim();

        const hasData = Boolean(
          name ||
          line.ingredientId ||
          line.quantity ||
          line.freePrice ||
          line.directCost ||
          line.packSize
        );

        if (!hasData) return;

        const cost = lineCost(line);

        if (cost === null) {
          pending++;

          details.push({
            label: name || "Linha sem descrição",
            value: "Dados incompletos ou unidades incompatíveis"
          });
        } else {
          ingredientTotal += cost;

          details.push({
            label: name || "Custo sem descrição",
            value: money(cost)
          });
        }
      });

      const watts = num("potencia");
      const minutes = num("tempo-equipamento");
      const tariff = parseMoney($("tarifa")?.value);

      let energy = null;

      if (
        watts !== null &&
        minutes !== null &&
        tariff !== null
      ) {
        energy = watts * minutes / 60000 * tariff;

        if (!Number.isFinite(energy)) {
          energy = null;
        }
      }

      const other = parseMoney($("outros-custos")?.value);

      // Embalagem: custo por unidade vendida. Só entra na fornada
      // quando o rendimento é conhecido.
      const packagingPerUnit = parseMoney($("embalagem")?.value);

      const packagingTotal =
        packagingPerUnit !== null &&
        yieldCount !== null &&
        yieldCount > 0
          ? packagingPerUnit * yieldCount
          : null;

      const total =
        ingredientTotal +
        (energy ?? 0) +
        (other ?? 0) +
        (packagingTotal ?? 0);

      const unitCost = yieldCount !== null && yieldCount > 0
        ? total / yieldCount
        : null;

      const taxPercent = num("taxas");
      const taxRate = (taxPercent ?? 0) / 100;
      const taxRateValid =
        taxPercent === null || taxPercent <= 100;

      const sale = parseMoney($("preco-venda")?.value);
      const margin = num("margem-desejada");

      // Evita apresentar lucro ou preço sugerido baseado em
      // ingredientes pendentes ou em taxas inválidas.
      const profit =
        pending === 0 &&
        taxRateValid &&
        unitCost !== null &&
        sale !== null
          ? sale * (1 - taxRate) - unitCost
          : null;

      const denominator =
        margin !== null
          ? 1 - margin / 100 - taxRate
          : null;

      const suggested =
        pending === 0 &&
        taxRateValid &&
        unitCost !== null &&
        margin !== null &&
        margin < 100 &&
        denominator !== null &&
        denominator > 0
          ? unitCost / denominator
          : null;

      const totalElement = $("res-total");
      const totalNoteElement = $("res-total-note");
      const unitElement = $("res-unidade");
      const profitElement = $("res-lucro");
      const suggestedElement = $("res-sugerido");
      const unitNoteElement = $("res-unidade-note");

      if (totalElement) totalElement.textContent = money(total);

      if (totalNoteElement) {
        totalNoteElement.textContent =
          `${pending
            ? `${pending} linha(s) pendente(s) — total parcial`
            : "Custos preenchidos"}${
            energy === null ? " · energia não calculada" : ""
          }`;
      }

      if (unitElement) {
        unitElement.textContent =
          unitCost === null ? "—" : money(unitCost);
      }

      if (unitNoteElement) {
        unitNoteElement.textContent = pending > 0
          ? "Parcial: há linhas pendentes"
          : "Com base no rendimento informado";
      }

      if (profitElement) {
        profitElement.textContent =
          profit === null ? "—" : money(profit);

        profitElement.style.color =
          profit !== null && profit < 0
            ? "var(--danger)"
            : "var(--brand-text)";
      }

      if (suggestedElement) {
        suggestedElement.textContent =
          suggested === null || !Number.isFinite(suggested)
            ? "—"
            : money(suggested);
      }

      const breakdown = [];

      details.forEach((detail) => {
        breakdown.push([detail.label, detail.value]);
      });

      breakdown.push([
        "Subtotal dos ingredientes / custos diretos",
        money(ingredientTotal)
      ]);

      breakdown.push([
        `Energia${
          energy === null
            ? " (não informada completamente)"
            : ` — ${textValue($("equipamento")?.value)}`
        }`,
        energy === null ? "Não calculada" : money(energy)
      ]);

      breakdown.push([
        "Gás e outros custos por fornada",
        other === null ? "Não informado" : money(other)
      ]);

      breakdown.push([
        "Embalagem (por unidade × rendimento)",
        packagingPerUnit === null
          ? "Não informada"
          : packagingTotal === null
            ? `${money(packagingPerUnit)} por unidade (informe o rendimento para somar)`
            : `${money(packagingPerUnit)} × ${fmt(yieldCount, 2)} = ${money(packagingTotal)}`
      ]);

      breakdown.push(["Custo conhecido por fornada", money(total)]);

      breakdown.push([
        "Rendimento",
        yieldCount !== null && yieldCount > 0
          ? `${fmt(yieldCount, 2)} unidade(s)`
          : "Não informado"
      ]);

      breakdown.push([
        "Custo conhecido por unidade",
        unitCost === null ? "Não calculado" : money(unitCost)
      ]);

      breakdown.push([
        "Taxas sobre a venda",
        `${fmt(taxPercent ?? 0, 2)}%`
      ]);

      breakdown.push([
        "Preço de venda informado",
        sale === null ? "Não informado" : money(sale)
      ]);

      breakdown.push([
        "Lucro estimado por unidade",
        profit === null ? "Não calculado" : money(profit)
      ]);

      breakdown.push([
        "Preço sugerido para margem desejada",
        suggested === null || !Number.isFinite(suggested)
          ? "Verifique rendimento, pendências, taxas e margem"
          : money(suggested)
      ]);

      const warnings = [];

      if (pending > 0) {
        warnings.push(
          `Atenção: ${pending} linha(s) não entraram integralmente no cálculo. O total por fornada e por unidade pode estar parcial.`
        );
      }

      if (packagingPerUnit !== null && packagingTotal === null) {
        warnings.push(
          "A embalagem só entra no custo quando o rendimento (unidades prontas) for informado."
        );
      }

      if (!taxRateValid) {
        warnings.push(
          "A taxa informada ultrapassa 100%. Revise esse percentual antes de calcular lucro ou preço sugerido."
        );
      }

      const breakdownElement = $("detalhamento");

      if (breakdownElement) {
        breakdownElement.innerHTML =
          breakdown.map(([label, value]) => {
            return `<div class="breakdown-row">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>`;
          }).join("") +
          warnings.map((warning) => {
            return `<p class="footnote">${escapeHtml(warning)}</p>`;
          }).join("");
      }

      lastCalculation = {
        ingredientTotal,
        energy,
        other,
        packaging: packagingTotal,
        total,
        unitCost,
        profit,
        suggested,
        yieldCount,
        pending,
        taxRate,
        sale
      };

      return lastCalculation;
    }

    // =====================================================
    // 9. CADASTRO DE INGREDIENTES
    // =====================================================

    on("form-ingrediente", "submit", (event) => {
      event.preventDefault();

      const id = $("ingrediente-id")?.value || "";
      const name = $("ingrediente-nome")?.value.trim() || "";
      const brand = $("ingrediente-marca")?.value.trim() || "";
      const price = parseMoney($("ingrediente-preco")?.value);
      const content = Number($("ingrediente-conteudo")?.value);
      const unit = safeUnit($("ingrediente-unidade")?.value);

      if (
        !name ||
        price === null ||
        !Number.isFinite(content) ||
        content <= 0
      ) {
        showToast(
          "Informe nome, preço válido e conteúdo maior que zero."
        );
        return;
      }

      const ingredient = {
        id: id || createId("ingredient"),
        name: name.slice(0, 200),
        brand: brand.slice(0, 200),
        price,
        content,
        unit,
        notes: ($("ingrediente-notas")?.value || "").trim().slice(0, 5000),
        updatedAt: new Date().toISOString()
      };

      const saved = commit(() => {
        if (id) {
          const index = state.ingredients.findIndex(
            (item) => item.id === id
          );

          if (index >= 0) {
            state.ingredients[index] = ingredient;
          } else {
            state.ingredients.push(ingredient);
          }
        } else {
          state.ingredients.push(ingredient);
        }
      });

      // Em caso de falha o formulário é mantido para o usuário tentar de novo.
      if (!saved) return;

      showToast(id ? "Ingrediente atualizado." : "Ingrediente salvo.");

      resetIngredientForm();
      renderIngredients();
      renderLines();
    });

    function resetIngredientForm() {
      const form = $("form-ingrediente");

      if (form) form.reset();

      if ($("ingrediente-id")) {
        $("ingrediente-id").value = "";
      }

      const title = $("form-ingrediente-titulo");
      if (title) title.textContent = "Adicionar ingrediente";

      $("cancelar-edicao")?.classList.add("hidden");
    }

    on("cancelar-edicao", "click", resetIngredientForm);

    function editIngredient(id) {
      const ingredient = state.ingredients.find(
        (item) => item.id === id
      );

      if (!ingredient) return;

      setValue("ingrediente-id", ingredient.id);
      setValue("ingrediente-nome", ingredient.name);
      setValue("ingrediente-marca", ingredient.brand);
      setValue(
        "ingrediente-preco",
        String(ingredient.price).replace(".", ",")
      );
      setValue("ingrediente-conteudo", ingredient.content);

      setSelectValue(
        "ingrediente-unidade",
        ingredient.unit,
        "g"
      );

      setValue("ingrediente-notas", ingredient.notes);

      const title = $("form-ingrediente-titulo");
      if (title) title.textContent = "Editar ingrediente";

      $("cancelar-edicao")?.classList.remove("hidden");

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }

    function renderIngredients() {
      const query = ($("buscar-ingrediente")?.value || "")
        .trim()
        .toLocaleLowerCase("pt-BR");

      const items = state.ingredients.filter((ingredient) => {
        return [
          ingredient.name,
          ingredient.brand,
          ingredient.notes
        ].join(" ").toLocaleLowerCase("pt-BR").includes(query);
      });

      const root = $("lista-ingredientes");
      const empty = $("ingredientes-vazios");

      if (!root || !empty) return;

      root.innerHTML = items.map((ingredient) => {
        const unitCost = ingredient.price / ingredient.content;

        return `
          <div class="saved-item">
            <div>
              <h4>
                ${escapeHtml(ingredient.name)}
                ${ingredient.brand
                  ? `<span class="muted">· ${escapeHtml(ingredient.brand)}</span>`
                  : ""}
              </h4>

              <p>
                Embalagem: ${money(ingredient.price)} por
                ${fmt(ingredient.content)} ${escapeHtml(ingredient.unit)}
                · Custo unitário: ${money(unitCost)} por
                ${escapeHtml(ingredient.unit)}
                ${ingredient.notes
                  ? `<br>${escapeHtml(ingredient.notes)}`
                  : ""}
              </p>
            </div>

            <div class="saved-actions">
              <span class="cost-tag">${money(ingredient.price)}</span>

              <button
                type="button"
                class="btn btn-light"
                data-edit="${escapeHtml(ingredient.id)}"
              >Editar</button>

              <button
                type="button"
                class="btn btn-light"
                data-delete="${escapeHtml(ingredient.id)}"
              >Excluir</button>
            </div>
          </div>`;
      }).join("");

      empty.classList.toggle("hidden", items.length > 0);

      root.querySelectorAll("[data-edit]").forEach((button) => {
        button.addEventListener("click", () => {
          editIngredient(button.dataset.edit);
        });
      });

      root.querySelectorAll("[data-delete]").forEach((button) => {
        button.addEventListener("click", () => {
          const ingredient = state.ingredients.find(
            (item) => item.id === button.dataset.delete
          );

          if (!ingredient) return;

          if (
            !confirm(
              `Excluir "${ingredient.name}" da biblioteca? As receitas salvas não serão apagadas.`
            )
          ) {
            return;
          }

          const removed = commit(() => {
            state.ingredients = state.ingredients.filter(
              (item) => item.id !== ingredient.id
            );
          });

          if (!removed) return;

          renderIngredients();
          renderLines();

          showToast("Ingrediente excluído.");
        });
      });
    }

    on("buscar-ingrediente", "input", renderIngredients);

    // =====================================================
    // 10. SALVAR E EXIBIR PRODUTOS
    // =====================================================

    on("salvar-produto", "click", () => {
      const name = $("produto-nome")?.value.trim() || "";

      if (!name) {
        showToast("Informe o nome do produto antes de salvar.");
        $("produto-nome")?.focus();
        return;
      }

      calculate();

      const product = {
        id: createId("product"),
        name: name.slice(0, 200),
        category: $("produto-categoria")?.value || "Doce",
        yieldCount: num("rendimento"),
        prepMinutes: num("tempo-preparo"),
        notes: ($("produto-observacoes")?.value || "").trim(),
        lines: lines.map((line) => normalizeLineData(line)),
        equipment: $("equipamento")?.value || "Forno elétrico",
        watts: num("potencia"),
        equipmentMinutes: num("tempo-equipamento"),
        tariff: parseMoney($("tarifa")?.value),
        otherCosts: parseMoney($("outros-custos")?.value),
        packaging: parseMoney($("embalagem")?.value),
        taxes: num("taxas"),
        salePrice: parseMoney($("preco-venda")?.value),
        desiredMargin: num("margem-desejada"),
        calculation: { ...lastCalculation },
        savedAt: new Date().toISOString()
      };

      if (!commit(() => state.products.unshift(product))) return;

      renderProducts();

      showToast("Produto salvo no histórico.");
    });

    function renderProducts() {
      const root = $("lista-produtos");
      const empty = $("produtos-vazios");

      if (!root || !empty) return;

      root.innerHTML = state.products.map((product) => {
        const calculation = product.calculation || {};

        const savedDate = new Date(product.savedAt)
          .toLocaleDateString("pt-BR");

        const partial = calculation.pending > 0 ? " (parcial)" : "";

        const yieldLabel =
          product.yieldCount !== null
            ? fmt(product.yieldCount, 2)
            : "não informado";

        return `
          <div class="saved-item">
            <div>
              <h4>
                ${escapeHtml(product.name)}
                <span class="muted">· ${escapeHtml(product.category || "Produto")}</span>
              </h4>

              <p>
                Salvo em ${escapeHtml(savedDate)}
                · Rendimento: ${escapeHtml(yieldLabel)}
                · Custo/fornada: ${money(calculation.total)}${partial}
                · Custo/unidade: ${money(calculation.unitCost)}${partial}
                · Venda: ${
                  product.salePrice === null
                    ? "não informada"
                    : money(product.salePrice)
                }
              </p>

              ${product.notes
                ? `<p>${escapeHtml(product.notes)}</p>`
                : ""}
            </div>

            <div class="saved-actions">
              <button
                type="button"
                class="btn btn-light"
                data-load="${escapeHtml(product.id)}"
              >Carregar</button>

              <button
                type="button"
                class="btn btn-light"
                data-delete-product="${escapeHtml(product.id)}"
              >Excluir</button>
            </div>
          </div>`;
      }).join("");

      empty.classList.toggle("hidden", state.products.length > 0);

      root.querySelectorAll("[data-load]").forEach((button) => {
        button.addEventListener("click", () => {
          loadProduct(button.dataset.load);
        });
      });

      root.querySelectorAll("[data-delete-product]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!confirm("Excluir este produto salvo?")) return;

          const removed = commit(() => {
            state.products = state.products.filter(
              (product) => product.id !== button.dataset.deleteProduct
            );
          });

          if (!removed) return;

          renderProducts();

          showToast("Produto removido.");
        });
      });
    }

    function hasRecipeData() {
      const filled = [
        "produto-nome",
        "rendimento",
        "tempo-preparo",
        "produto-observacoes",
        "potencia",
        "tempo-equipamento",
        "tarifa",
        "outros-custos",
        "taxas",
        "preco-venda",
        "margem-desejada"
      ].some((id) => ($(id)?.value || "").trim() !== "");

      const filledLine = lines.some((line) => {
        return Boolean(
          line.name ||
          line.ingredientId ||
          line.quantity ||
          line.freePrice ||
          line.directCost ||
          line.packSize
        );
      });

      return filled || filledLine;
    }

    function loadProduct(id) {
      const product = state.products.find(
        (item) => item.id === id
      );

      if (!product) return;

      if (
        hasRecipeData() &&
        !confirm(
          "Carregar este produto vai substituir a receita que está em edição. Continuar?"
        )
      ) {
        return;
      }

      setValue("produto-nome", product.name);
      setSelectValue(
        "produto-categoria",
        product.category,
        "Doce"
      );

      setValue("rendimento", product.yieldCount ?? "");
      setValue("tempo-preparo", product.prepMinutes ?? "");
      setValue("produto-observacoes", product.notes);

      setSelectValue(
        "equipamento",
        product.equipment,
        "Forno elétrico"
      );

      setValue("potencia", product.watts ?? "");
      setValue("tempo-equipamento", product.equipmentMinutes ?? "");
      setValue("tarifa", product.tariff ?? "");
      setValue("outros-custos", product.otherCosts ?? "");
      setValue("embalagem", product.packaging ?? "");
      setValue("taxas", product.taxes ?? "");
      setValue("preco-venda", product.salePrice ?? "");
      setValue("margem-desejada", product.desiredMargin ?? "");

      lines = product.lines.map(createLine);

      renderLines();
      switchTab("precificacao");

      showToast("Produto carregado para edição.");
    }

    // =====================================================
    // 11. RASCUNHO DA RECEITA ATUAL
    // =====================================================

    function readDraft() {
      return {
        name: $("produto-nome")?.value || "",
        category: $("produto-categoria")?.value || "Doce",
        yieldCount: $("rendimento")?.value || "",
        prepMinutes: $("tempo-preparo")?.value || "",
        notes: $("produto-observacoes")?.value || "",
        equipment: $("equipamento")?.value || "Forno elétrico",
        watts: $("potencia")?.value || "",
        equipmentMinutes: $("tempo-equipamento")?.value || "",
        tariff: $("tarifa")?.value || "",
        otherCosts: $("outros-custos")?.value || "",
        packaging: $("embalagem")?.value || "",
        taxes: $("taxas")?.value || "",
        salePrice: $("preco-venda")?.value || "",
        desiredMargin: $("margem-desejada")?.value || "",
        lines: lines.map(normalizeLineData)
      };
    }

    function applyDraft(draft) {
      if (
        !draft ||
        typeof draft !== "object" ||
        Array.isArray(draft)
      ) {
        return;
      }

      setValue("produto-nome", draft.name);
      setSelectValue(
        "produto-categoria",
        draft.category || "Doce",
        "Doce"
      );

      setValue("rendimento", draft.yieldCount);
      setValue("tempo-preparo", draft.prepMinutes);
      setValue("produto-observacoes", draft.notes);

      setSelectValue(
        "equipamento",
        draft.equipment || "Forno elétrico",
        "Forno elétrico"
      );

      setValue("potencia", draft.watts);
      setValue("tempo-equipamento", draft.equipmentMinutes);
      setValue("tarifa", draft.tariff);
      setValue("outros-custos", draft.otherCosts);
      setValue("embalagem", draft.packaging);
      setValue("taxas", draft.taxes);
      setValue("preco-venda", draft.salePrice);
      setValue("margem-desejada", draft.desiredMargin);

      lines = Array.isArray(draft.lines)
        ? draft.lines.slice(0, 500).map(createLine)
        : [];

      renderLines();
    }

    // =====================================================
    // 12. EXPORTAR BACKUP
    // =====================================================

    on("exportar-dados", "click", () => {
      try {
        const backup = {
          app: "PrecificaChef",
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          state: {
            schemaVersion: STORAGE_SCHEMA_VERSION,
            ingredients: state.ingredients,
            products: state.products
          },
          draft: readDraft()
        };

        const blob = new Blob(
          [JSON.stringify(backup, null, 2)],
          { type: "application/json;charset=utf-8" }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download =
          `precificachef-backup-${new Date().toISOString().slice(0, 10)}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        // Dá tempo ao navegador de iniciar o download.
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast(
          "Backup exportado. Guarde o arquivo JSON em local seguro."
        );
      } catch (error) {
        console.error("Erro ao exportar backup.", error);
        showToast("Não foi possível exportar o backup.");
      }
    });

    on("importar-dados", "click", () => {
      $("arquivo-backup")?.click();
    });

    // =====================================================
    // 13. IMPORTAR E VALIDAR BACKUP
    // =====================================================

    on("arquivo-backup", "change", async (event) => {
      const input = event.target;
      const file = input.files && input.files[0];

      if (!file) return;

      try {
        if (file.size > MAX_IMPORT_SIZE) {
          throw new Error(
            "O arquivo ultrapassa o limite de 10 MB."
          );
        }

        let imported;

        try {
          imported = JSON.parse(await file.text());
        } catch (error) {
          throw new Error(
            "O arquivo não é um JSON válido. Escolha um backup exportado pelo PrecificaChef."
          );
        }

        // Formato atual: { app, version, state, draft }.
        // Também aceita arquivos que guardavam { ingredients, products }
        // diretamente. Todo registro é validado de qualquer forma.
        let source = null;

        if (
          imported &&
          typeof imported === "object" &&
          !Array.isArray(imported)
        ) {
          if (
            imported.app === "PrecificaChef" &&
            imported.state &&
            typeof imported.state === "object"
          ) {
            if (
              Number.isInteger(imported.version) &&
              imported.version > BACKUP_VERSION
            ) {
              throw new Error(
                "Este backup foi criado por uma versão mais nova do PrecificaChef. Atualize o app e tente de novo."
              );
            }

            if (
              Number.isInteger(imported.version) &&
              imported.version >= 1
            ) {
              source = imported.state;
            }
          } else if (
            Array.isArray(imported.ingredients) &&
            Array.isArray(imported.products)
          ) {
            source = imported;
          }
        }

        if (
          !source ||
          !Array.isArray(source.ingredients) ||
          !Array.isArray(source.products)
        ) {
          throw new Error(
            "Arquivo não reconhecido como backup válido do PrecificaChef."
          );
        }

        const diagnostics = {};

        const importedState = normalizeState(source, diagnostics);

        const totalInFile =
          source.ingredients.length + source.products.length;

        const totalValid =
          importedState.ingredients.length +
          importedState.products.length;

        // Nunca substitui os dados atuais por um arquivo sem nenhum
        // registro aproveitável.
        if (totalInFile > 0 && totalValid === 0) {
          throw new Error(
            "O arquivo não contém registros válidos para importar."
          );
        }

        const droppedCount =
          diagnostics.invalidIngredients +
          diagnostics.invalidProducts;

        let message =
          "Importar este backup vai SUBSTITUIR os dados atuais deste navegador.\n\n";

        message +=
          `Atualmente: ${state.ingredients.length} ingrediente(s) e ${state.products.length} produto(s).\n`;

        message +=
          `No arquivo: ${importedState.ingredients.length} ingrediente(s) e ${importedState.products.length} produto(s).\n`;

        if (droppedCount > 0) {
          message +=
            `${droppedCount} registro(s) inválido(s) serão ignorados.\n`;
        }

        message +=
          "\nExporte os dados atuais antes se quiser guardar uma cópia. Continuar?";

        if (!confirm(message)) return;

        const saved = commit(() => {
          state.ingredients = importedState.ingredients;
          state.products = importedState.products;
        });

        // Se o navegador não conseguiu gravar, nada foi alterado.
        if (!saved) return;

        if (imported.draft) {
          applyDraft(imported.draft);
        }

        renderIngredients();
        renderProducts();
        renderLines();

        showToast("Backup importado com sucesso.");
      } catch (error) {
        console.error("Erro ao importar backup.", error);

        showToast(
          error.message ||
          "Não foi possível importar esse arquivo JSON.",
          5000
        );
      } finally {
        input.value = "";
      }
    });

    // =====================================================
    // 14. TEMAS VISUAIS
    // =====================================================

    function applyTheme(theme) {
      const validTheme = AVAILABLE_THEMES.includes(theme)
        ? theme
        : "vanilla";

      document.body.dataset.theme = validTheme;

      const selector = $("theme-select");

      if (selector) {
        selector.value = validTheme;
      }

      const themeColorMeta = document.querySelector(
        'meta[name="theme-color"]'
      );

      if (themeColorMeta) {
        themeColorMeta.content = THEME_COLORS[validTheme];
      }

      return validTheme;
    }

    function initThemeSelector() {
      let savedTheme = "vanilla";

      try {
        savedTheme =
          localStorage.getItem(THEME_STORAGE_KEY) || "vanilla";
      } catch (error) {
        console.warn(
          "Não foi possível recuperar o tema salvo.",
          error
        );
      }

      applyTheme(savedTheme);

      const selector = $("theme-select");
      if (!selector) return;

      selector.addEventListener("change", () => {
        const selectedTheme = applyTheme(selector.value);

        try {
          localStorage.setItem(
            THEME_STORAGE_KEY,
            selectedTheme
          );
        } catch (error) {
          console.warn(
            "Não foi possível salvar a preferência de tema.",
            error
          );

          showToast(
            "Tema alterado, mas a preferência não pôde ser salva."
          );
        }
      });
    }

    // =====================================================
    // 15. INICIALIZAÇÃO
    // =====================================================

    initThemeSelector();

    renderIngredients();
    renderProducts();
    addLine();

    if (loadNotice) showToast(loadNotice, 9000);
  }

  // Funciona mesmo se o script for movido para o <head>.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();
