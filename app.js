(() => {
  "use strict";
  const STORAGE_KEY = "precificachef_v1";
  const $ = (id) => document.getElementById(id);
  const state = loadState();
  let lines = [];
  let nextLineId = 1;
  let lastCalculation = null;
  let toastTimer;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn("Não foi possível ler os dados locais.", e); }
    return { ingredients: [], products: [] };
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { showToast("Não foi possível salvar. Verifique o espaço disponível no navegador."); }
  }
  function parseMoney(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let s = String(value ?? "").trim().replace(/\s/g, "").replace(/^R\$/i, "");
    if (!s) return null;
    // Accept Brazilian 1.250,99 and plain decimal 5.99.
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function num(id) {
    const value = $(id).value.trim();
    if (!value) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function money(n) {
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  }
  function fmt(n, digits = 3) {
    return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: digits });
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2800);
  }
  function switchTab(tab) {
    document.querySelectorAll(".nav").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== `tab-${tab}`));
    if (tab === "ingredientes") renderIngredients();
    if (tab === "produtos") renderProducts();
  }
  document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  function addLine(data = {}) {
    lines.push({
      id: nextLineId++,
      ingredientId: data.ingredientId || "",
      name: data.name || "",
      quantity: data.quantity ?? "",
      unit: data.unit || "g",
      freePrice: data.freePrice ?? "",
      packSize: data.packSize ?? "",
      packUnit: data.packUnit || data.unit || "g",
      mode: data.mode || "ingredient",
      directCost: data.directCost ?? ""
    });
    renderLines();
  }
  function updateLine(id, key, value) {
    const line = lines.find(x => x.id === id);
    if (!line) return;
    line[key] = value;
    if (key === "ingredientId" && value) {
      const ing = state.ingredients.find(x => x.id === value);
      if (ing) {
        line.name = ing.name;
        line.unit = ing.unit;
        line.packUnit = ing.unit;
        line.freePrice = String(ing.price);
        line.packSize = String(ing.content);
        line.mode = "ingredient";
      }
    }
    if (key === "mode" && value === "direct") line.ingredientId = "";
    renderLines();
    calculate();
  }
  function lineCost(line) {
    const q = parseMoney(line.quantity);
    if (line.mode === "direct") {
      const c = parseMoney(line.directCost);
      return c === null || q === null ? null : c * q;
    }
    const price = parseMoney(line.freePrice);
    const pack = parseMoney(line.packSize);
    if (q === null || price === null || pack === null || pack <= 0) return null;
    if (line.unit !== line.packUnit) return null;
    return price * q / pack;
  }
  function renderLines() {
    const root = $("linhas-ingredientes");
    root.innerHTML = "";
    $("linhas-vazias").classList.toggle("hidden", lines.length > 0);
    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "ingredient-row";
      const options = state.ingredients.map(i => `<option value="${escapeHtml(i.id)}"${line.ingredientId === i.id ? " selected" : ""}>${escapeHtml(i.name)} — ${money(i.price)} / ${fmt(i.content)} ${escapeHtml(i.unit)}</option>`).join("");
      row.innerHTML = `
        <label>Ingrediente / descrição
          <select data-key="ingredientId"><option value="">Linha livre / escolher ingrediente</option>${options}</select>
          <input data-key="name" value="${escapeHtml(line.name)}" placeholder="Nome ou descrição">
        </label>
        <label>Quantidade usada
          <input data-key="quantity" type="number" min="0" step="any" value="${escapeHtml(line.quantity)}" placeholder="Ex.: 50">
        </label>
        <label>Unidade
          <select data-key="unit">${unitOptions(line.unit)}</select>
        </label>
        <label>${line.mode === "direct" ? "Custo por unidade (R$)" : "Preço embalagem (R$)"}
          <input data-key="${line.mode === "direct" ? "directCost" : "freePrice"}" inputmode="decimal" value="${escapeHtml(line.mode === "direct" ? line.directCost : line.freePrice)}" placeholder="${line.mode === "direct" ? "0,50" : "5,99"}">
          ${line.mode !== "direct" ? `<input data-key="packSize" type="number" min="0" step="any" value="${escapeHtml(line.packSize)}" placeholder="Conteúdo da embalagem">` : ""}
          ${line.mode !== "direct" ? `<select data-key="packUnit">${unitOptions(line.packUnit)}</select>` : ""}
          <button class="text-toggle" type="button" data-action="toggle-mode">${line.mode === "direct" ? "Usar preço de embalagem" : "Usar custo direto por unidade"}</button>
          ${line.mode !== "direct" ? `<button class="btn btn-light save-line-ingredient" type="button" data-action="save-ingredient">＋ Salvar nos ingredientes</button>` : ""}
        </label>
        <div><div class="line-cost">${lineCost(line) === null ? "Pendente" : money(lineCost(line))}</div><button type="button" class="icon-btn" data-action="remove" title="Remover linha" aria-label="Remover linha">×</button></div>`;
      row.querySelectorAll("[data-key]").forEach(input => {
        input.addEventListener("change", () => updateLine(line.id, input.dataset.key, input.value));
        if (input.tagName === "INPUT") input.addEventListener("input", () => {
          const found = lines.find(x => x.id === line.id);
          if (found) found[input.dataset.key] = input.value;
          calculate();
          const costEl = row.querySelector(".line-cost");
          const cost = lineCost(found);
          if (costEl) costEl.textContent = cost === null ? "Pendente" : money(cost);
        });
      });
      row.querySelector('[data-action="remove"]').addEventListener("click", () => {
        lines = lines.filter(x => x.id !== line.id); renderLines(); calculate();
      });
      row.querySelector('[data-action="toggle-mode"]').addEventListener("click", () => {
        updateLine(line.id, "mode", line.mode === "direct" ? "ingredient" : "direct");
      });
      const saveIngredientButton = row.querySelector('[data-action="save-ingredient"]');
      if (saveIngredientButton) saveIngredientButton.addEventListener("click", () => saveLineIngredient(line.id));
      root.appendChild(row);
    }
    calculate();
  }
  function saveLineIngredient(lineId) {
    const line = lines.find(x => x.id === lineId);
    if (!line) return;
    const name = String(line.name || "").trim();
    const price = parseMoney(line.freePrice);
    const content = parseMoney(line.packSize);
    const unit = line.packUnit || line.unit || "g";
    if (!name || price === null || content === null || content <= 0) {
      showToast("Preencha nome, preço da embalagem e conteúdo antes de salvar."); return;
    }
    const normalized = unit === "kg" ? { unit: "g", content: content * 1000 } : unit === "L" ? { unit: "ml", content: content * 1000 } : { unit, content };
    const existing = state.ingredients.find(i => i.name.trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
    if (existing && !confirm(`Já existe “${existing.name}” nos ingredientes. Deseja atualizar o cadastro com estes dados?`)) return;
    const ingredient = { id: existing ? existing.id : crypto.randomUUID(), name, brand: existing?.brand || "", price, content: normalized.content, unit: normalized.unit, notes: existing?.notes || "", updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, ingredient); else state.ingredients.push(ingredient);
    persist(); renderIngredients(); renderLines();
    showToast(existing ? "Ingrediente atualizado na biblioteca." : "Ingrediente salvo na biblioteca.");
  }

  function unitOptions(selected) {
    return [["g","Gramas (g)"],["kg","Quilogramas (kg)"],["ml","Mililitros (ml)"],["L","Litros (L)"],["un","Unidades (un.)"]]
      .map(([v,l]) => `<option value="${v}"${selected === v ? " selected" : ""}>${l}</option>`).join("");
  }
  $("adicionar-linha").addEventListener("click", () => addLine());
  $("limpar-receita").addEventListener("click", () => {
    if (!confirm("Limpar os campos da receita atual? Os ingredientes salvos não serão apagados.")) return;
    ["produto-nome","rendimento","tempo-preparo","produto-observacoes","potencia","tempo-equipamento","tarifa","outros-custos","taxas","preco-venda","margem-desejada"].forEach(id => $(id).value = "");
    $("produto-categoria").value = "Doce";
    $("equipamento").value = "Forno elétrico";
    lines = []; renderLines(); showToast("Formulário limpo.");
  });
  ["rendimento","potencia","tempo-equipamento","tarifa","outros-custos","taxas","preco-venda","margem-desejada"].forEach(id => {
    $(id).addEventListener("input", calculate);
    $(id).addEventListener("change", calculate);
  });

  function calculate() {
    const yieldCount = num("rendimento");
    let ingredientTotal = 0, pending = 0;
    const details = [];
    lines.forEach(line => {
      if (!line.name.trim() && !line.ingredientId && !line.quantity && !line.freePrice && !line.directCost) return;
      const cost = lineCost(line);
      if (cost === null) { pending++; details.push({ label: line.name || "Linha sem descrição", value: "Dados incompletos / unidade incompatível" }); }
      else { ingredientTotal += cost; details.push({ label: line.name || "Custo sem descrição", value: money(cost) }); }
    });
    const watts = num("potencia"), minutes = num("tempo-equipamento"), tariff = parseMoney($("tarifa").value);
    let energy = null;
    if (watts !== null && minutes !== null && tariff !== null) energy = watts * minutes / 60000 * tariff;
    const other = parseMoney($("outros-custos").value);
    const knownTotal = ingredientTotal + (energy ?? 0) + (other ?? 0);
    const allCostInputsKnown = pending === 0;
    const total = knownTotal;
    const unitCost = yieldCount !== null && yieldCount > 0 ? total / yieldCount : null;
    const taxRate = (num("taxas") ?? 0) / 100;
    const sale = parseMoney($("preco-venda").value);
    const profit = unitCost !== null && sale !== null ? sale * (1-taxRate) - unitCost : null;
    const margin = num("margem-desejada");
    const suggested = unitCost !== null && margin !== null && margin < 100 && taxRate < 1 ? unitCost / (1 - margin/100 - taxRate) : null;

    $("res-total").textContent = money(total);
    $("res-total-note").textContent = `${pending ? `${pending} linha(s) pendente(s)` : "Custos preenchidos"}${energy === null ? " · energia não calculada" : ""}`;
    $("res-unidade").textContent = unitCost === null ? "—" : money(unitCost);
    $("res-lucro").textContent = profit === null ? "—" : money(profit);
    $("res-sugerido").textContent = suggested === null || !Number.isFinite(suggested) || suggested < 0 ? "—" : money(suggested);
    $("res-lucro").style.color = profit !== null && profit < 0 ? "var(--danger)" : "var(--green)";
    const breakdown = [];
    details.forEach(d => breakdown.push([d.label, d.value]));
    breakdown.push(["Subtotal dos ingredientes / custos diretos", money(ingredientTotal)]);
    breakdown.push([`Energia${energy === null ? " (não informada completamente)" : ` — ${$("equipamento").value}`}`, energy === null ? "Não calculada" : money(energy)]);
    breakdown.push(["Gás e outros custos por fornada", other === null ? "Não informado" : money(other)]);
    breakdown.push(["Custo conhecido por fornada", money(total)]);
    breakdown.push(["Rendimento", yieldCount !== null && yieldCount > 0 ? `${fmt(yieldCount, 0)} unidade(s)` : "Não informado"]);
    breakdown.push(["Custo conhecido por unidade", unitCost === null ? "Não calculado" : money(unitCost)]);
    breakdown.push(["Taxas sobre a venda", `${fmt(num("taxas") ?? 0, 2)}%`]);
    breakdown.push(["Preço de venda informado", sale === null ? "Não informado" : money(sale)]);
    breakdown.push(["Lucro estimado por unidade", profit === null ? "Não calculado" : money(profit)]);
    breakdown.push(["Preço sugerido para margem desejada", suggested === null || !Number.isFinite(suggested) || suggested < 0 ? "Informe uma margem válida" : money(suggested)]);
    $("detalhamento").innerHTML = breakdown.map(([a,b]) => `<div class="breakdown-row"><span>${escapeHtml(a)}</span><strong>${escapeHtml(b)}</strong></div>`).join("") +
      (pending ? `<p class="footnote">Atenção: ${pending} linha(s) não entraram no total porque faltam dados ou as unidades não coincidem. O total exibido é parcial.</p>` : "");
    lastCalculation = { ingredientTotal, energy, other, total, unitCost, profit, suggested, yieldCount, pending, taxRate, sale };
  }

  $("form-ingrediente").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("ingrediente-id").value;
    const name = $("ingrediente-nome").value.trim();
    const brand = $("ingrediente-marca").value.trim();
    const price = parseMoney($("ingrediente-preco").value);
    const content = Number($("ingrediente-conteudo").value);
    const unit = $("ingrediente-unidade").value;
    if (!name || price === null || !Number.isFinite(content) || content <= 0) {
      showToast("Informe nome, preço válido e conteúdo maior que zero."); return;
    }
    const ingredient = { id: id || crypto.randomUUID(), name, brand, price, content, unit, notes: $("ingrediente-notas").value.trim(), updatedAt: new Date().toISOString() };
    if (id) {
      const idx = state.ingredients.findIndex(x => x.id === id);
      if (idx >= 0) state.ingredients[idx] = ingredient; else state.ingredients.push(ingredient);
      showToast("Ingrediente atualizado.");
    } else {
      state.ingredients.push(ingredient); showToast("Ingrediente salvo.");
    }
    persist(); resetIngredientForm(); renderIngredients(); renderLines();
  });
  function resetIngredientForm() {
    $("form-ingrediente").reset(); $("ingrediente-id").value = "";
    $("form-ingrediente-titulo").textContent = "Adicionar ingrediente";
    $("cancelar-edicao").classList.add("hidden");
  }
  $("cancelar-edicao").addEventListener("click", resetIngredientForm);
  function editIngredient(id) {
    const i = state.ingredients.find(x => x.id === id); if (!i) return;
    $("ingrediente-id").value = i.id; $("ingrediente-nome").value = i.name; $("ingrediente-marca").value = i.brand || "";
    $("ingrediente-preco").value = String(i.price).replace(".", ","); $("ingrediente-conteudo").value = i.content;
    $("ingrediente-unidade").value = i.unit; $("ingrediente-notas").value = i.notes || "";
    $("form-ingrediente-titulo").textContent = "Editar ingrediente"; $("cancelar-edicao").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function renderIngredients() {
    const query = $("buscar-ingrediente").value.trim().toLocaleLowerCase("pt-BR");
    const items = state.ingredients.filter(i => `${i.name} ${i.brand} ${i.notes}`.toLocaleLowerCase("pt-BR").includes(query));
    $("lista-ingredientes").innerHTML = items.map(i => `
      <div class="saved-item"><div><h4>${escapeHtml(i.name)} ${i.brand ? `<span class="muted">· ${escapeHtml(i.brand)}</span>` : ""}</h4>
      <p>Embalagem: ${money(i.price)} por ${fmt(i.content)} ${escapeHtml(i.unit)} · Custo unitário: ${money(i.price/i.content)} por ${escapeHtml(i.unit)}${i.notes ? `<br>${escapeHtml(i.notes)}` : ""}</p></div>
      <div class="saved-actions"><span class="cost-tag">${money(i.price)}</span><button class="btn btn-light" data-edit="${escapeHtml(i.id)}">Editar</button><button class="btn btn-light" data-delete="${escapeHtml(i.id)}">Excluir</button></div></div>`).join("");
    $("ingredientes-vazios").classList.toggle("hidden", items.length > 0);
    $("lista-ingredientes").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editIngredient(b.dataset.edit)));
    $("lista-ingredientes").querySelectorAll("[data-delete]").forEach(b => b.addEventListener("click", () => {
      const i = state.ingredients.find(x => x.id === b.dataset.delete);
      if (!i || !confirm(`Excluir "${i.name}" da biblioteca? Receitas já salvas não serão apagadas.`)) return;
      state.ingredients = state.ingredients.filter(x => x.id !== i.id); persist(); renderIngredients(); renderLines(); showToast("Ingrediente excluído.");
    }));
  }
  $("buscar-ingrediente").addEventListener("input", renderIngredients);

  $("salvar-produto").addEventListener("click", () => {
    const name = $("produto-nome").value.trim();
    if (!name) { showToast("Informe o nome do produto antes de salvar."); $("produto-nome").focus(); return; }
    calculate();
    const product = {
      id: crypto.randomUUID(), name, category: $("produto-categoria").value,
      yieldCount: num("rendimento"), prepMinutes: num("tempo-preparo"), notes: $("produto-observacoes").value.trim(),
      lines: lines.map(l => ({ ...l })), equipment: $("equipamento").value, watts: num("potencia"),
      equipmentMinutes: num("tempo-equipamento"), tariff: parseMoney($("tarifa").value), otherCosts: parseMoney($("outros-custos").value),
      taxes: num("taxas"), salePrice: parseMoney($("preco-venda").value), desiredMargin: num("margem-desejada"),
      calculation: { ...lastCalculation }, savedAt: new Date().toISOString()
    };
    state.products.unshift(product); persist(); renderProducts(); showToast("Produto salvo no histórico.");
  });
  function renderProducts() {
    const root = $("lista-produtos");
    root.innerHTML = state.products.map(p => {
      const c = p.calculation || {};
      return `<div class="saved-item"><div><h4>${escapeHtml(p.name)} <span class="muted">· ${escapeHtml(p.category || "Produto")}</span></h4>
      <p>Salvo em ${new Date(p.savedAt).toLocaleDateString("pt-BR")} · Rendimento: ${p.yieldCount || "não informado"} · Custo/fornada: ${money(c.total)} · Custo/unidade: ${money(c.unitCost)} · Venda: ${p.salePrice == null ? "não informada" : money(p.salePrice)}</p>
      ${p.notes ? `<p>${escapeHtml(p.notes)}</p>` : ""}</div><div class="saved-actions"><button class="btn btn-light" data-load="${escapeHtml(p.id)}">Carregar</button><button class="btn btn-light" data-delete-product="${escapeHtml(p.id)}">Excluir</button></div></div>`;
    }).join("");
    $("produtos-vazios").classList.toggle("hidden", state.products.length > 0);
    root.querySelectorAll("[data-load]").forEach(b => b.addEventListener("click", () => loadProduct(b.dataset.load)));
    root.querySelectorAll("[data-delete-product]").forEach(b => b.addEventListener("click", () => {
      if (!confirm("Excluir este produto salvo?")) return;
      state.products = state.products.filter(p => p.id !== b.dataset.deleteProduct); persist(); renderProducts(); showToast("Produto removido.");
    }));
  }
  function loadProduct(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    $("produto-nome").value = p.name; $("produto-categoria").value = p.category || "Doce";
    $("rendimento").value = p.yieldCount ?? ""; $("tempo-preparo").value = p.prepMinutes ?? "";
    $("produto-observacoes").value = p.notes || ""; $("equipamento").value = p.equipment || "Forno elétrico";
    $("potencia").value = p.watts ?? ""; $("tempo-equipamento").value = p.equipmentMinutes ?? "";
    $("tarifa").value = p.tariff ?? ""; $("outros-custos").value = p.otherCosts ?? "";
    $("taxas").value = p.taxes ?? ""; $("preco-venda").value = p.salePrice ?? ""; $("margem-desejada").value = p.desiredMargin ?? "";
    lines = (p.lines || []).map(l => ({ ...l, id: nextLineId++ })); renderLines(); switchTab("precificacao"); showToast("Produto carregado para edição.");
  }

  function readDraft() {
    return {
      name: $("produto-nome").value, category: $("produto-categoria").value,
      yieldCount: $("rendimento").value, prepMinutes: $("tempo-preparo").value,
      notes: $("produto-observacoes").value, equipment: $("equipamento").value,
      watts: $("potencia").value, equipmentMinutes: $("tempo-equipamento").value,
      tariff: $("tarifa").value, otherCosts: $("outros-custos").value,
      taxes: $("taxas").value, salePrice: $("preco-venda").value,
      desiredMargin: $("margem-desejada").value, lines: lines.map(l => ({ ...l }))
    };
  }
  function applyDraft(draft) {
    if (!draft || typeof draft !== "object") return;
    $("produto-nome").value = draft.name ?? ""; $("produto-categoria").value = draft.category || "Doce";
    $("rendimento").value = draft.yieldCount ?? ""; $("tempo-preparo").value = draft.prepMinutes ?? "";
    $("produto-observacoes").value = draft.notes ?? ""; $("equipamento").value = draft.equipment || "Forno elétrico";
    $("potencia").value = draft.watts ?? ""; $("tempo-equipamento").value = draft.equipmentMinutes ?? "";
    $("tarifa").value = draft.tariff ?? ""; $("outros-custos").value = draft.otherCosts ?? "";
    $("taxas").value = draft.taxes ?? ""; $("preco-venda").value = draft.salePrice ?? ""; $("margem-desejada").value = draft.desiredMargin ?? "";
    lines = Array.isArray(draft.lines) ? draft.lines.map(l => ({ ...l, id: nextLineId++ })) : [];
    renderLines();
  }
  $("exportar-dados").addEventListener("click", () => {
    const backup = { app: "PrecificaChef", version: 1, exportedAt: new Date().toISOString(), state, draft: readDraft() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `precificachef-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    showToast("Backup exportado. Guarde o arquivo JSON em local seguro.");
  });
  $("importar-dados").addEventListener("click", () => $("arquivo-backup").click());
  $("arquivo-backup").addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.app !== "PrecificaChef" || !imported.state || !Array.isArray(imported.state.ingredients) || !Array.isArray(imported.state.products)) {
        throw new Error("Arquivo não reconhecido como backup válido do PrecificaChef.");
      }
      if (!confirm("Importar este backup substituirá os ingredientes e produtos salvos neste navegador. Exporte os dados atuais antes, se quiser mantê-los. Continuar?")) return;
      state.ingredients = imported.state.ingredients;
      state.products = imported.state.products;
      persist();
      if (imported.draft) applyDraft(imported.draft);
      renderIngredients(); renderProducts(); renderLines();
      showToast("Backup importado com sucesso.");
    } catch (error) {
      showToast(error.message || "Não foi possível importar esse arquivo JSON.");
    } finally {
      event.target.value = "";
    }
  });

  // Small input helper for the line editor.
  const style = document.createElement("style");
  style.textContent = ".text-toggle{border:0;background:transparent;color:#54765d;padding:3px 0;text-align:left;font-size:10px;cursor:pointer;text-decoration:underline}";
  document.head.appendChild(style);

  renderIngredients();
  renderProducts();
  addLine();
})();
