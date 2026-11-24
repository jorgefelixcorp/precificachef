# Graph Report - precificachef-BETA  (2026-11-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 50 nodes · 143 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- renderProducts
- textValue
- init
- renderLines
- saveLinesToLibrary
- normalizeCalculation
- initThemeSelector
- loadState

## God Nodes (most connected - your core abstractions)
1. `init()` - 49 edges
2. `renderLines()` - 16 edges
3. `renderIngredients()` - 12 edges
4. `renderProducts()` - 10 edges
5. `textValue()` - 10 edges
6. `calculate()` - 10 edges
7. `loadProduct()` - 9 edges
8. `saveLinesToLibrary()` - 9 edges
9. `normalizeProduct()` - 8 edges
10. `showToast()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `readDraft()` --indirect_call--> `normalizeLineData()`  [INFERRED]
  app.js → app.js  _Bridges community 1 → community 2_
- `init()` --indirect_call--> `calculate()`  [INFERRED]
  app.js → app.js  _Bridges community 2 → community 3_
- `addLine()` --calls--> `renderLines()`  [EXTRACTED]
  app.js → app.js  _Bridges community 0 → community 3_
- `createLine()` --calls--> `normalizeLineData()`  [EXTRACTED]
  app.js → app.js  _Bridges community 0 → community 1_
- `loadProduct()` --calls--> `showToast()`  [EXTRACTED]
  app.js → app.js  _Bridges community 0 → community 4_

## Import Cycles
- None detected.

## Communities (8 total, 2 thin omitted)

### Community 0 - "renderProducts"
Cohesion: 0.29
Nodes (10): addLine(), applyDraft(), createLine(), editIngredient(), hasRecipeData(), loadProduct(), renderProducts(), setSelectValue() (+2 more)

### Community 1 - "textValue"
Cohesion: 0.40
Nodes (10): ingredientFromLine(), normalizeIngredient(), normalizeLineData(), normalizeProduct(), normalizeState(), parseMoney(), safeUnit(), textValue() (+2 more)

### Community 2 - "init"
Cohesion: 0.25
Nodes (5): init(), convertQuantity(), num(), readDraft(), unitOptions()

### Community 3 - "renderLines"
Cohesion: 0.54
Nodes (8): calculate(), escapeHtml(), fmt(), lineCost(), money(), renderIngredients(), renderLines(), updateLine()

### Community 4 - "saveLinesToLibrary"
Cohesion: 0.38
Nodes (7): askConflict(), commit(), createId(), persist(), saveLineIngredient(), saveLinesToLibrary(), showToast()

### Community 5 - "normalizeCalculation"
Cohesion: 0.67
Nodes (3): finiteNumberOrNull(), nonNegativeNumber(), normalizeCalculation()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `init()` connect `init` to `renderProducts`, `textValue`, `renderLines`, `saveLinesToLibrary`, `normalizeCalculation`, `initThemeSelector`, `loadState`?**
  _High betweenness centrality (0.799) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `init()` (e.g. with `app.js` and `calculate()`) actually correct?**
  _`init()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Why does `renderLines()` connect `renderLines` to `renderProducts`, `init`, `saveLinesToLibrary`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `textValue()` connect `textValue` to `renderProducts`, `init`, `renderLines`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._