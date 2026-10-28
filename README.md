# PrecificaChef

Protótipo web de precificação de doces e salgados. Funciona sem IA, sem servidor e sem dependências externas.

## Funcionalidades

- **Precificação:** cadastro flexível de receita, linhas de ingredientes, rendimento, energia, custos adicionais, taxas, preço de venda e margem desejada.
- **Biblioteca de ingredientes:** salva preço e conteúdo da embalagem para reutilizar em várias receitas.
- **Produtos salvos:** guarda uma fotografia dos custos no momento em que a receita foi salva.
- **Armazenamento local:** usa `localStorage` no navegador.
- **Backup portátil:** exporta/importa ingredientes, produtos salvos e a receita atualmente em edição em um arquivo JSON.
- **Salvar ingredientes pela receita:** salva uma linha (ou todas de uma vez) na biblioteca. Se o ingrediente já existir com outro preço ou conteúdo, pergunta se deseja **substituir**, **adicionar como novo** ou **ignorar**.
- **Embalagem (opcional):** custo de embalagem por unidade, somado ao custo da fornada quando o rendimento é informado.
- **Categorias:** Doce, Salgado, Pães e Outro.
- **Temas:** cinco temas, cada um com papel de parede e detalhes próprios.
- **Responsivo:** interface adaptada para computador e celular.

## Como testar localmente

1. Extraia o ZIP.
2. Abra `index.html` no Chrome.
3. Cadastre ingredientes na aba **Ingredientes**.
4. Vá para **Precificação**, adicione uma linha, preencha os dados ou selecione um ingrediente e informe a quantidade utilizada.
5. Para reutilizar um ingrediente preenchido na própria receita, clique em **＋ Salvar nos ingredientes**.
6. Use **Exportar backup** para baixar os dados em JSON e **Importar backup** em outro dispositivo ou navegador.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie `index.html`, `styles.css`, `app.js` e `README.md` para a raiz do repositório.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`, depois salve.
6. Aguarde a publicação e abra a URL indicada pelo GitHub Pages.

## Importante

- Esta entrega é uma **aplicação web**, não uma extensão instalável do Chrome. É o caminho mais simples para hospedar no GitHub Pages.
- Os dados ficam no `localStorage` do navegador e perfil usados. Eles não são sincronizados automaticamente entre dispositivos; transfira-os manualmente com **Exportar backup** e **Importar backup**.
- Importar um backup substitui os ingredientes e produtos salvos no navegador de destino. O app mostra quantos registros existem hoje e quantos há no arquivo antes de pedir confirmação. Arquivos inválidos, sem registros aproveitáveis ou cancelados não alteram nada, e se o navegador não conseguir gravar, a importação é desfeita e não é anunciada como concluída.
- Aceita backups das versões 1 e 2 e arquivos antigos no formato `{ "ingredients": [...], "products": [...] }`.
- O backup inclui os ingredientes, os produtos salvos e a receita atualmente em edição.
- Ingredientes com unidades incompatíveis (por exemplo, embalagem em gramas e uso em ml) ficam pendentes em vez de converter automaticamente.
- Campos incompletos não entram no cálculo. O resultado mostra aviso de custos parciais quando houver linhas pendentes.
- A energia é estimada como `potência (W) × tempo (min) ÷ 60.000 × tarifa (R$/kWh)`. É uma estimativa; equipamentos como forno podem ciclar a resistência.
- O preço sugerido considera custo unitário, margem desejada e taxa percentual informada. Não substitui avaliação de impostos, mão de obra, entrega, perdas ou despesas fixas que não forem cadastradas.

## Salvar um ingrediente diretamente da receita

Na aba **Precificação**, preencha o nome/descrição, o preço da embalagem e o conteúdo. Clique em **＋ Salvar nos ingredientes** (na linha) ou em **＋ Salvar itens nos ingredientes** (para todas as linhas). Se já existir um ingrediente com o mesmo nome e dados diferentes, aparece a pergunta: substituir, adicionar como novo ou ignorar (com a opção de repetir a escolha para os próximos). Linhas idênticas ao cadastro não geram pergunta. Conteúdos em kg e L são convertidos para g e ml na biblioteca.

## Custo de embalagem

O campo **Embalagem por unidade (R$)** fica junto dos custos de energia e é opcional. O valor é multiplicado pelo rendimento e somado ao custo da fornada. Sem o rendimento informado, a embalagem não entra no cálculo e o detalhamento avisa isso.

## Estrutura

- `index.html` — interface e abas.
- `styles.css` — aparência responsiva e temas.
- `app.js` — armazenamento, cadastro e fórmulas.
- `manifest.webmanifest` — permite "adicionar à tela inicial" com o ícone do app.
- `icons/` — ícones:
  - `icon.svg` — ícone principal (chapéu de chef, livro de receitas e pena), usado como favicon e no cabeçalho;
  - `icon-maskable.svg` — mesma arte com margem de segurança para ícones adaptativos do Android;
  - `png/` — versões prontas: `favicon-16.png`, `favicon-32.png`, `apple-touch-icon-180.png` (iPhone), `icon-192.png`, `icon-512.png` e `icon-maskable-512.png`.

## Testes

Os testes ficam em `tests/` e não fazem parte do site publicado.

- `node tests/contrast.test.mjs` — confere o contraste (4,5:1) dos cinco temas. Não precisa de dependências.
- `node tests/e2e.test.mjs` — abre o app no Chromium e testa fórmulas, ingredientes, receitas, backup, temas, telas de 320/375/390 px, teclado e escape de HTML. Requer `npm install --no-save playwright` e `npx playwright install chromium`.
