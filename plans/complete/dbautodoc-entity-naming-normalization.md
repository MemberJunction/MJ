# DBAutoDoc + CodeGen: Entity Naming Normalization

## Problem

When CodeGen discovers new tables (especially from legacy databases with ALL CAPS naming), the generated entity names are ugly and collision-prone:

- `PAYMENT` → `PAYMENTs` (no case normalization)
- `INDIVIDUALDESIGNATION` → `INDIVIDUALDESIGNATIONs` (compound word not split)
- `CRM.CATEGORY` and `AWARD.CATEGORY` → `CATEGORYs` + `CATEGORYs__CRM` (collision fallback)
- `CUSTOMERID` field → `CUSTOMERID` (not `Customer ID`)

## Design Principles

1. **Configurable** — all normalization rules are opt-in/opt-out via `mj.config.cjs`
2. **No baked-in prefixes** — schema prefixes come from DBAutoDoc output via `additionalSchemaInfo.json`, not hardcoded in CodeGen
3. **Sensible defaults** — normalization ON by default (new behavior), but easy to disable for backward compat
4. **Leverage existing infrastructure** — CodeGen already reads `additionalSchemaInfo.json` and SchemaInfo; DBAutoDoc already knows schema semantics from LLM analysis

---

## Part 1: CodeGen Configuration (`mj.config.cjs`)

### New Config Section

```js
// mj.config.cjs
module.exports = {
  entityNaming: {
    // Normalize ALL CAPS table/entity names to Title Case
    // PAYMENT → Payment, INVOICEORDER → Invoice Order
    // Default: true
    normalizeAllCaps: true,

    // Attempt to split compound ALL CAPS words using dictionary matching
    // INDIVIDUALDESIGNATION → Individual Designation
    // CUSTOMFIELDVALUE → Custom Field Value
    // When false, single-word ALL CAPS names just get title-cased: Individualdesignation
    // Default: true
    splitCompoundWords: true,

    // Normalize ALL CAPS column/field names the same way
    // CUSTOMERID → Customer ID, PARENTLINEITEMID → Parent Line Item ID
    // Default: true
    normalizeFieldNames: true,

    // Additional domain-specific words for the compound word splitter
    // These supplement the built-in English dictionary
    // Useful for industry acronyms and domain terms the splitter might miss
    additionalDomainWords: [],
    // Example: ['CRM', 'AutoCare', 'SKU', 'UPC', 'MSRP', 'VIN']
  },

  // Existing config — no changes needed
  additionalSchemaInfo: './path/to/additionalSchemaInfo.json',
};
```

### Config Types

```typescript
// In @memberjunction/config or codegen-lib types
interface EntityNamingConfig {
  normalizeAllCaps?: boolean;        // default: true
  splitCompoundWords?: boolean;      // default: true
  normalizeFieldNames?: boolean;     // default: true
  additionalDomainWords?: string[];  // default: []
}
```

---

## Part 2: Compound Word Splitter

### Algorithm: Greedy Longest-Match

For ALL CAPS compound words without delimiters (e.g., `INDIVIDUALDESIGNATION`):

1. Lowercase the input: `individualdesignation`
2. Starting from position 0, find the longest dictionary word that matches
3. Consume that word, advance position, repeat
4. If no dictionary match at current position, consume single character and continue
5. Title-case each segment and join with spaces

### Dictionary Sources (in priority order)

1. **User-provided domain words** (`additionalDomainWords` config)
2. **DBAutoDoc-derived terms** — if `additionalSchemaInfo.json` contains LLM descriptions, extract key nouns
3. **Built-in common words** — a curated list of ~500 common English words relevant to databases:
   - Business: customer, invoice, order, payment, account, merchant, product, price, etc.
   - Technical: id, type, code, name, date, status, flag, count, amount, etc.
   - Domain: individual, organization, membership, subscription, registration, etc.

### Edge Cases

| Input | Output | Notes |
|-------|--------|-------|
| `PAYMENT` | `Payment` | Single word, just title-case |
| `INDIVIDUALDESIGNATION` | `Individual Designation` | Two dictionary words |
| `CUSTOMFIELDVALUE` | `Custom Field Value` | Three dictionary words |
| `CUSTOMERID` | `Customer ID` | `ID` recognized as acronym |
| `LINEITEMEDUCATIONCREDIT` | `Line Item Education Credit` | Four words |
| `CUSTOMFIELDAVAILABLEVALUES` | `Custom Field Available Values` | Five words |
| `XYZABC123` | `Xyzabc123` | No matches, fallback to title-case whole string |
| `AI_COMMERCE_CONTEXT` | `AI Commerce Context` | Underscore-delimited, split normally |

### Acronym Handling

Maintain a list of known acronyms that should stay uppercase:
- `ID`, `URL`, `API`, `SQL`, `CRM`, `AI`, `FK`, `PK`, `UUID`, `SKU`, `UPC`, `VIN`, `MSRP`
- Configurable via `additionalDomainWords` (all-caps entries treated as acronyms)

---

## Part 3: DBAutoDoc Schema Prefix Output

### Enhanced `additionalSchemaInfo.json`

DBAutoDoc already emits this file with PK/FK data. Add a `schemas` section:

```json
{
  "schemas": [
    {
      "name": "ACCOUNTING",
      "entityNamePrefix": "Accounting: ",
      "entityNameSuffix": "",
      "description": "Financial accounting and transaction management"
    },
    {
      "name": "CRM",
      "entityNamePrefix": "CRM: ",
      "entityNameSuffix": "",
      "description": "Customer relationship management"
    },
    {
      "name": "AI_COMMERCE_CONTEXT",
      "entityNamePrefix": "AI Commerce: ",
      "entityNameSuffix": "",
      "description": "AI-driven commerce analytics context"
    }
  ],
  "tables": [
    // ... existing PK/FK data unchanged ...
  ]
}
```

### Prefix Generation Rules in DBAutoDoc

The LLM already understands each schema's purpose. When generating `additionalSchemaInfo.json`:

1. For short, recognizable acronyms (CRM, AI, HR): keep as-is → `CRM: `
2. For readable names: title-case → `ACCOUNTING` → `Accounting: `
3. For compound names: normalize → `AI_COMMERCE_CONTEXT` → `AI Commerce: `
4. For single-schema databases: no prefix (empty string)
5. Always include trailing space + colon in prefix for readability

### CodeGen Consumption

CodeGen already reads `additionalSchemaInfo.json` for PK/FK data. Extend the reader to:

1. Parse the `schemas` array
2. For each schema, update/insert the corresponding SchemaInfo record's `EntityNamePrefix` and `EntityNameSuffix`
3. These flow into the existing `markupEntityName()` → `getNewEntityNameRule()` pipeline
4. Config-file rules (`mj.config.cjs` → `newEntityDefaults.NameRulesBySchema`) still take priority (existing behavior)

---

## Part 4: Field Name Normalization

Same compound word splitter applies to column names when `normalizeFieldNames: true`:

| Column Name | Display Name | Code Name |
|-------------|-------------|-----------|
| `CUSTOMERID` | `Customer ID` | `CustomerID` |
| `PARENTLINEITEMID` | `Parent Line Item ID` | `ParentLineItemID` |
| `PRICETYPEID` | `Price Type ID` | `PriceTypeID` |
| `RECOGNIZEPERIODID` | `Recognize Period ID` | `RecognizePeriodID` |
| `PRODUCTPRICEID` | `Product Price ID` | `ProductPriceID` |
| `__mj_CreatedAt` | `Created At` | `__mj_CreatedAt` (skip __ prefix fields) |

### Where Field Names Are Set

Field display names are set in `manage-metadata.ts` during entity field creation. The same `createDisplayName()` function is used — it just needs the ALL CAPS awareness added.

---

## Part 5: Implementation Plan

### Files to Modify

| File | Change | Effort |
|------|--------|--------|
| `packages/MJGlobal/src/util.ts` | Add ALL CAPS detection + compound word splitter to `createDisplayName()` | Medium |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Read `entityNaming` config, pass to `createDisplayName()` | Small |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Read `schemas` from `additionalSchemaInfo.json`, apply to SchemaInfo | Small |
| `packages/DBAutoDoc/src/generators/AdditionalSchemaInfoGenerator.ts` | Add `schemas` section with prefix/suffix | Small |
| `@memberjunction/config` types | Add `EntityNamingConfig` interface | Small |

### Implementation Order

1. **Compound word splitter** in MJGlobal/util.ts (standalone, testable)
2. **Unit tests** for the splitter with all edge cases
3. **ALL CAPS detection** in `createDisplayName()` — gated by config flag
4. **Config reading** in CodeGen manage-metadata.ts
5. **Schema prefix output** in DBAutoDoc AdditionalSchemaInfoGenerator
6. **Schema prefix consumption** in CodeGen additionalSchemaInfo reader
7. **Field name normalization** — same path as entity names, gated by config flag

### Backward Compatibility

- All normalization is **off by default for existing entities** — only applies to newly created entities
- Existing entity names are never modified (CodeGen only names new entities)
- Config defaults to `true` for new installs, but existing `mj.config.cjs` files won't have the section (undefined = use defaults)
- The `__SCHEMA` collision suffix still works as fallback when prefixes aren't configured

### Testing

- Unit tests for compound word splitter (MJGlobal)
- Unit tests for ALL CAPS createDisplayName path
- Integration test: run CodeGen against a test schema with ALL CAPS tables, verify names
- Regression test: ensure existing mixed-case table names still produce identical output

---

## Part 6: DBAutoDoc Word Hints (Future Enhancement)

When DBAutoDoc analyzes a table and the LLM produces a description, it already understands the word boundaries:
- LLM describes `INDIVIDUALDESIGNATION` as "individual designation records"
- We can extract these word boundaries and include them in `additionalSchemaInfo.json`

```json
{
  "tables": [
    {
      "schemaName": "CRM",
      "tableName": "INDIVIDUALDESIGNATION",
      "wordBoundaries": ["Individual", "Designation"],
      "suggestedEntityName": "Individual Designations",
      "primaryKeys": [...],
      "foreignKeys": [...]
    }
  ]
}
```

This gives CodeGen a pre-computed, LLM-verified word split — no dictionary guessing needed. The compound word splitter becomes the fallback for tables not analyzed by DBAutoDoc.
