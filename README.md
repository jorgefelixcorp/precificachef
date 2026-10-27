# PrecificaChef

Protótipo web de precificação de doces e salgados. Funciona sem IA, sem servidor e sem dependências externas.

## Funcionalidades

- **Precificação:** cadastro flexível de receita, linhas de ingredientes, rendimento, energia, custos adicionais, taxas, preço de venda e margem desejada.
- **Biblioteca de ingredientes:** salva preço e conteúdo da embalagem para reutilizar em várias receitas.
- **Produtos salvos:** guarda uma fotografia dos custos no momento em que a receita foi salva.
- **Armazenamento local:** usa `localStorage` no navegador.
- **Responsivo:** interface adaptada para computador e celular.

## Como testar localmente

1. Extraia o ZIP.
2. Abra `index.html` no Chrome.
3. Cadastre ingredientes na aba **Ingredientes**.
4. Vá para **Precificação**, adicione uma linha, selecione o ingrediente e informe a quantidade utilizada.
5. Informe o rendimento e os outros custos conhecidos.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie `index.html`, `styles.css`, `app.js` e `README.md` para a raiz do repositório.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`, depois salve.
6. Aguarde a publicação e abra a URL indicada pelo GitHub Pages.

## Importante

- Esta entrega é uma **aplicação web**, não uma extensão instalável do Chrome. É o caminho mais simples para hospedar no GitHub Pages.
- Os dados ficam no `localStorage` do navegador e perfil usados. Eles não são sincronizados entre dispositivos e podem ser perdidos se os dados do site forem apagados. Faça backups antes de limpar os dados do navegador.
- Ingredientes com unidades incompatíveis (por exemplo, embalagem em gramas e uso em ml) ficam pendentes em vez de converter automaticamente.
- Campos incompletos não entram no cálculo. O resultado mostra aviso de custos parciais quando houver linhas pendentes.
- A energia é estimada como `potência (W) × tempo (min) ÷ 60.000 × tarifa (R$/kWh)`. É uma estimativa; equipamentos como forno podem ciclar a resistência.
- O preço sugerido considera custo unitário, margem desejada e taxa percentual informada. Não substitui avaliação de impostos, mão de obra, entrega, perdas ou despesas fixas que não forem cadastradas.

## Estrutura

- `index.html` — interface e abas.
- `styles.css` — aparência responsiva.
- `app.js` — armazenamento, cadastro e fórmulas.
