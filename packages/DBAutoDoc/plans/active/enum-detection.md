# DBAutoDoc Enum / Value-List Detection Plan

## Status: Draft
## Created: 2026-05-02
## Branch: `claude/add-enum-detection-Xq7E8`

---

## Problem

DBAutoDoc already analyzes columns statistically (distinct counts, sample values, value distributions) and feeds those signals to the LLM during table analysis. However, when DBAutoDoc identifies that a column is *effectively* an enumerated list of values, that finding currently dies inside the state file:

- The state model has `ColumnDefinition.possibleValues`, populated from `valueDistribution`.
- The LLM sees the distinct values and is even nudged in the prompt: *"If column has low cardinality (< 20 distinct values), those are likely enum/category values."*
- But the LLM is **never asked to commit to an enum verdict**, and even if it did, the `additionalSchemaInfo.json` output shape has **no per-column section** to carry that verdict downstream.
- CodeGen populates `EntityFieldValue` rows **only from CHECK constraints** ([`packages/CodeGenLib/src/Database/manage-metadata.ts:3332`](../../../CodeGenLib/src/Database/manage-metadata.ts)). For imported / third-party schemas where CHECK constraints don't exist, MJ never gets the enum metadata, so generated UIs render plain text inputs instead of dropdowns.

The CHECK-constraint path is fine for our own schemas. The motivation here is **schemas we don't own** — data we're importing where the source system enforces enums in app code (or not at all) and the database is left without `CHECK ... IN (...)` declarations.

---

## Scope

### In scope
- Adding an LLM-driven enum detection step inside the existing table-analysis prompt.
- Pre-filtering candidates with deterministic gates (data type, length, cardinality) before the LLM ever sees them as enum candidates.
- Extending `additionalSchemaInfo.json` with an optional per-column `Fields[]` section.
- Adding a CodeGen pass that consumes `Fields[]` and routes through the existing `syncEntityFieldValues` helper.
- A confidence threshold knob mirroring the existing `confidenceThreshold` option.

### Out of scope (explicitly)
- Replacing or competing with the CHECK-constraint path. CHECK constraints are authoritative; this feature **defers to them**.
- Detecting enums in numeric columns. (See open questions — could be a v2.)
- Detecting bitmask / flag enums.
- Inferring display labels different from raw values (`Code` will mirror `Value`, same as the CHECK-constraint pass).
- Multi-language / localized value lists.

---

## Architecture Overview

Three layers, each a thin extension of an existing extension point:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 1 — DBAutoDoc / Phase 1 LLM Analysis                           │
│   • Deterministic pre-filter on column metadata                      │
│   • New optional `valueList` block in LLM response schema            │
│   • New ColumnDescriptionResult.valueList field on AnalysisResult    │
│   • Persisted on ColumnDefinition.valueListVerdict                   │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 2 — AdditionalSchemaInfoGenerator                              │
│   • New TableSchemaInfo.Fields[] entry shape                         │
│   • Emits when ColumnDefinition.valueListVerdict.confidence ≥ thresh │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Layer 3 — CodeGen / manage-metadata.ts                               │
│   • New applyValueListConfig() pass, runs AFTER CHECK pass           │
│   • Skips fields where EntityFieldValue rows already exist (CHECK)   │
│   • Reuses existing syncEntityFieldValues() helper                   │
│   • Sets EntityField.ValueListType per LLM verdict ('List' or        │
│     'ListOrUserEntry')                                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — DBAutoDoc Detection

### 1.1 Deterministic pre-filter

Before a column is even shown to the LLM as an enum candidate, gate on:

| Gate | Rule | Rationale |
|---|---|---|
| **Data type** | Must be `char`, `nchar`, `varchar`, `nvarchar`, or equivalents (e.g. `text` only if length-bounded). Skip numeric, date, GUID, blob, bool. | Numeric "enums" (status codes) are common but high false-positive risk; punt to v2. Bools are already binary. |
| **Declared length** | Column max length ≤ 50 characters. | Prevents accidentally classifying `Address`, `Description`, `Notes` as enums. |
| **Distinct count** | `distinctCount` ≥ 2 AND `distinctCount` ≤ 50. | Single-value columns aren't enums. > 50 is unlikely to be a closed list. |
| **Cardinality ratio** | `distinctCount / totalRows` ≤ 0.05 (i.e. each value used ≥ 20× on average) **OR** `totalRows < 100`. | Small samples bypass the ratio rule (LLM gets to reason about it instead). |
| **Row volume** | `totalRows` ≥ 50 to even consider applying the cardinality ratio gate. Below that, low cardinality is statistical noise. | Avoids the **Customer.State problem**: a brand-new system with 4 customers all from California shouldn't lock `State` to 1 value. |
| **Pattern** | `dataPattern !== 'sequential' && dataPattern !== 'guid' && dataPattern !== 'composite'`. | Exclude key-shaped columns. |

Implemented as a new `EnumCandidateGate` in `src/discovery/`, returning either `null` (not a candidate) or an `EnumCandidate { values: string[]; rowCount: number; sampleSize: number; reasoning: string }` to feed into the prompt.

### 1.2 Prompt extension

Modify [`prompts/table-analysis.md`](../../prompts/table-analysis.md):

**Per-column context** — when a column passes the pre-filter, append a new context block alongside the existing `Possible Values` line:

```
- Enum Candidate: Yes (pre-filter passed: distinctCount={n}, totalRows={N},
  cardinality={pct}, dataType={t}({len}))
- Candidate Values: [list]
```

**Response schema** — extend `columnDescriptions[]` with an optional `valueList` object:

```json
{
  "columnName": "Status",
  "description": "...",
  "reasoning": "...",
  "valueList": {
    "isEnum": true,
    "type": "List",
    "confidence": 0.92,
    "values": ["Active", "Inactive", "Pending"],
    "reasoning": "Three lifecycle states observed across 12,400 rows. Naming, distribution (45/40/15), and column name 'Status' all consistent with a closed status enum."
  }
}
```

`type` is one of `"List"` (closed) or `"ListOrUserEntry"` (open / extensible). `null` or omitted `valueList` means "not an enum."

**Prompt guidance** added near line 179 (where the existing low-cardinality nudge lives):

> When the per-column context says "Enum Candidate: Yes", evaluate whether the column genuinely represents a finite, closed (or near-closed) set of values, OR whether it merely *happens* to have low cardinality at this point in time.
>
> Examples that are NOT enums even with low cardinality:
> - `Customer.State` in a system with only a few customers — the universe of US states is 50, not 3.
> - `LastName` where a sample shows 8 distinct values across 8 rows.
> - `City`, `Country`, `Department` for small organizations.
> - Free-text `Comment` / `Note` fields where users happened to repeat phrases.
>
> Examples that ARE enums:
> - `Status` / `State` columns on workflow records (`Active`, `Inactive`, `Pending`).
> - `Type` discriminators (`Individual`, `Corporate`, `Student`).
> - `Severity`, `Priority`, `Tier` ratings.
>
> Use the column name, the *semantic* meaning of the values, the row volume, and the distribution to decide. **When in doubt, set `isEnum: false`.** A false positive locks a UI to a dropdown that won't accept legitimate new values; a false negative just leaves the field as free text — much lower cost.

### 1.3 State persistence

Add to [`ColumnDefinition`](../../src/types/state.ts):

```typescript
export interface ColumnDefinition {
  // ... existing fields
  valueListVerdict?: ValueListVerdict;
}

export interface ValueListVerdict {
  isEnum: boolean;
  type: 'List' | 'ListOrUserEntry';
  confidence: number;            // 0–1
  values: string[];
  reasoning: string;
  source: 'llm' | 'check_constraint' | 'user_override';
  /** distinctCount/totalRows at decision time — for audit on re-run */
  cardinalityAtDecision?: { distinct: number; total: number };
  decidedAt: string;             // ISO timestamp
  modelUsed?: string;
}
```

Add to [`AnalysisResult.columnDescriptions[]`](../../src/types/analysis.ts) the matching `valueList?: ValueListResult` shape so the orchestrator can persist it.

### 1.4 Wiring

- `DiscoveryEngine` already collects everything we need; **no DB changes**.
- `AnalysisEngine.buildTableContext()` (around line 650) gets the gate output added to the per-column context map.
- The LLM response parser (in `AnalysisEngine`) maps `valueList` from the response into `ColumnDefinition.valueListVerdict`.
- A new orchestrator step `applyEnumVerdicts()` runs at the end of Phase 1 to consolidate verdicts (e.g., one column may be reanalyzed across multiple iterations — keep the highest-confidence verdict).

---

## Layer 2 — AdditionalSchemaInfo Extension

### 2.1 Schema change

Extend [`AdditionalSchemaInfoGenerator`](../../src/generators/AdditionalSchemaInfoGenerator.ts) output:

```typescript
interface FieldValueListEntry {
  FieldName: string;
  ValueListType: 'List' | 'ListOrUserEntry';
  PossibleValues: string[];
  /** Optional — surfaced to humans reviewing the file */
  Description?: string;
  /** Confidence at emission time, 0–100. Useful for audit / re-tuning thresholds. */
  Confidence?: number;
}

interface TableSchemaInfo {
  TableName: string;
  PrimaryKey?: SoftPKEntry[];
  ForeignKeys?: SoftFKEntry[];
  Fields?: FieldValueListEntry[];   // NEW
}
```

### 2.2 Emission rules

- Only emit a `Fields[]` entry when `verdict.isEnum === true`.
- Only emit when `verdict.confidence * 100 >= options.valueListConfidenceThreshold` (new option, default `85`).
- Skip if `options.confirmedOnly` is set and the column doesn't have a user-approved description.
- Sort values alphabetically (matches CHECK-constraint pass behavior — see [manage-metadata.ts:3367](../../../CodeGenLib/src/Database/manage-metadata.ts)).

### 2.3 New options

```typescript
interface AdditionalSchemaInfoOptions {
  // ... existing
  /** Min confidence (0–100) for value-list / enum entries. Default 85. */
  valueListConfidenceThreshold?: number;
  /** If true, skip emitting Fields[] entirely. Default false. */
  excludeValueLists?: boolean;
}
```

---

## Layer 3 — CodeGen Consumption

### 3.1 New parser

Add alongside `extractTablesFromConfig()` in [`manage-metadata.ts`](../../../CodeGenLib/src/Database/manage-metadata.ts):

```typescript
export interface SoftFieldValueListConfig {
  FieldName: string;
  ValueListType: 'List' | 'ListOrUserEntry';
  PossibleValues: string[];
  Description?: string;
  Confidence?: number;
}

protected extractFieldValueLists(config: Record<string, unknown>): Map<string /* schema.table */, SoftFieldValueListConfig[]> {
  // Walk schema → tables → table.Fields
  // Same merge / case-insensitive matching as soft PK/FK extraction.
}
```

### 3.2 New apply pass

`applyValueListConfig()` runs **after** `manageEntityFieldValuesAndValidatorFunctions()` (so CHECK-derived values are already in the database):

```typescript
protected async applyValueListConfig(pool: CodeGenConnection): Promise<boolean> {
  const config = ManageMetadataBase.getSoftPKFKConfig();
  if (!config) return true;

  const fieldLists = this.extractFieldValueLists(config);
  const allEntityFieldValues = await this.loadAllEntityFieldValues(pool);

  for (const [schemaTable, fields] of fieldLists) {
    for (const fieldCfg of fields) {
      const ef = await this.lookupEntityField(pool, schemaTable, fieldCfg.FieldName);
      if (!ef) continue;

      // RULE: Defer to CHECK-constraint-derived values. If any EntityFieldValue
      // rows already exist for this field, skip — CHECK is authoritative.
      const existing = allEntityFieldValues.filter(efv => efv.EntityFieldID === ef.ID);
      if (existing.length > 0 && ef.ValueListType !== 'None') {
        // Already populated by CHECK pass — do not touch.
        continue;
      }

      const sortedValues = [...fieldCfg.PossibleValues].sort();
      await this.syncEntityFieldValues(pool, ef.ID, sortedValues, allEntityFieldValues);
      await this.updateValueListType(pool, ef.ID, fieldCfg.ValueListType);
    }
  }
  return true;
}
```

### 3.3 Idempotency contract

This is critical to get right because the source-of-truth file can change between runs:

| Scenario | Behavior |
|---|---|
| File adds new value to existing soft enum | `syncEntityFieldValues` inserts the new `EntityFieldValue` row. ✓ already handled. |
| File removes a value | `syncEntityFieldValues` deletes the row. ✓ already handled. |
| File switches `List` → `ListOrUserEntry` | `applyValueListConfig` updates `EntityField.ValueListType`. |
| File removes the entire `Fields[]` entry for a column | **Open question — see below.** |
| User adds a CHECK constraint to a previously-soft enum field | Next CodeGen run, CHECK pass populates first; soft pass sees existing rows and bails. ✓ |
| User manually edited `EntityFieldValue` rows in MJ | If the field has rows, soft pass bails (precedence rule above). User edits preserved. ✓ |

### 3.4 Wire-up

In `manage-metadata.ts:2446` (`applySoftPKFKConfig` is called there), add:

```typescript
if (! await this.applyValueListConfig(pool)) {
  return false;
}
```

…run *after* `manageEntityFieldValuesAndValidatorFunctions` so the CHECK-constraint path always wins.

---

## Edge Cases & Mitigations

### The Customer.State problem
Even with the prompt guidance, the LLM may misclassify. Mitigations layered:
1. **Pre-filter row volume gate** — `totalRows < 50` skips the cardinality ratio test, but the LLM still sees the column as a candidate. The prompt explicitly calls out this case.
2. **Confidence threshold** — default `85` is intentionally cautious. A wobbly LLM verdict won't make it into the file.
3. **Output explicitness** — include `Confidence` in the emitted JSON so reviewers can sort and sanity-check borderline calls.
4. **`ListOrUserEntry` as the safer default** when the LLM is uncertain — UI still gets a dropdown but accepts new values. Plan to instruct the LLM: *"If you're between 70% and 90% confident, prefer `ListOrUserEntry`."*

### Value normalization
Discovered values come from raw data and may have:
- Trailing whitespace (`"Active "` vs `"Active"`)
- Case variants (`"active"` vs `"Active"`)
- Empty strings or null-like sentinels (`""`, `"NULL"`, `"-"`)

Normalization happens in the gate, not at LLM time:
- Trim whitespace.
- Drop empty strings.
- **Do not** case-normalize — case differences may be meaningful (`USD` vs `usd`), and we want the LLM to flag the inconsistency in `reasoning` rather than silently merge.
- If after trimming we end up with `< 2` distinct values, drop the candidate.

### Multi-iteration analysis
A table may be reanalyzed during backpropagation. Strategy:
- Persist all verdicts in a `verdicts[]` history on the column (mirrors `descriptionIterations`).
- The "active" verdict is the highest-confidence one OR a user-override if present.
- Document this in the verdict schema.

### Performance / token cost
- Pre-filter happens in JS, costs nothing.
- Per-column context grows by ~1 line of prompt for candidates only.
- Response schema grows by ~5 fields per enum column, optional everywhere else.
- Estimated overhead: < 5% on tables with no enum candidates, ~10–15% on enum-heavy tables. Acceptable.

---

## Configuration

New `mj.config.cjs` / DBAutoDoc config option:

```javascript
{
  enumDetection: {
    enabled: true,                          // default true
    confidenceThreshold: 0.85,              // emit at ≥85%
    maxColumnLength: 50,                    // string length cap
    maxDistinctValues: 50,                  // cardinality cap
    minTotalRows: 50,                       // below this, skip ratio gate
    excludeColumnNamePatterns: [            // regex list — opt-out
      'Notes?$',
      'Description$',
      'Comment$',
      'Address',
    ],
  }
}
```

CodeGen side reads `additionalSchemaInfo.json` `Fields[]` unconditionally — the gating happens at emission time, not consumption time. Adding a CodeGen flag to disable the soft-enum pass is trivial if needed later.

---

## Implementation Phases

Each phase is independently mergeable.

### Phase 1 — Discovery + state (DBAutoDoc only)
1. `EnumCandidateGate` class in `src/discovery/EnumCandidateGate.ts`.
2. Extend `ColumnDefinition` and `AnalysisResult` types.
3. Update `table-analysis.md` prompt.
4. Wire candidate context into `AnalysisEngine.buildTableContext()`.
5. Parse and persist `valueList` from LLM response.
6. **Tests:** unit tests for the gate (synthetic stats objects), snapshot test for prompt output, integration test against a state file.

### Phase 2 — AdditionalSchemaInfo emission
1. Extend `TableSchemaInfo` and `AdditionalSchemaInfoOptions`.
2. Emit `Fields[]` per the rules above.
3. **Tests:** unit tests on generator output for confidence threshold, exclusion, sort order.

### Phase 3 — CodeGen consumption
1. `extractFieldValueLists()` parser in `manage-metadata.ts`.
2. `applyValueListConfig()` apply pass.
3. Wire-up in `applySoftPKFKConfig` ordering.
4. **Tests:** integration test using a fixture `additionalSchemaInfo.json` with `Fields[]` against a test database. Verify CHECK precedence with a seeded CHECK-bearing column.

### Phase 4 — Documentation + recipe
1. Update `packages/DBAutoDoc/docs/USER_GUIDE.md` with the new feature.
2. Update `packages/DBAutoDoc/docs/ARCHITECTURE.md` with the data flow.
3. Add a worked example to `packages/DBAutoDoc/docs/API_USAGE.md`.
4. Update `packages/CodeGenLib/CLAUDE.md` (if it mentions `additionalSchemaInfo`) with the new section.

---

## Success Criteria

- On a benchmark schema (e.g., a sanitized customer import schema with no CHECK constraints), DBAutoDoc identifies ≥ 80% of the obvious enum columns (Status, Type, Priority, etc.) at confidence ≥ 0.85.
- False-positive rate on free-text columns (Notes, Description, City) is 0% at default thresholds across the benchmark.
- The Customer.State scenario (small N, low cardinality, but real-world large universe) is correctly classified as `isEnum: false` by the LLM in ≥ 90% of test cases.
- After CodeGen runs, generated Angular forms render the affected columns as dropdowns / combo-boxes per `ValueListType`.
- Re-running CodeGen with no DBAutoDoc changes produces zero `EntityFieldValue` diffs (idempotent).
- Adding a CHECK constraint to a previously-soft enum field causes the soft-enum row to be untouched on next CodeGen run (precedence preserved).

---

## Open Questions

1. **What if the file removes a `Fields[]` entry for a column?** Two interpretations:
   - (a) "DBAutoDoc no longer thinks this is an enum" → CodeGen should drop the `EntityFieldValue` rows.
   - (b) "The user is editing the file by hand and just deleted the entry" → drop is destructive.
   
   **Proposal:** track which rows were created by the soft pass (e.g., a sentinel in `Code` or a sibling `Source` column on `EntityFieldValue` if we want to be precise — schema change). For v1, take the conservative read: if a field's `Fields[]` entry disappears, **leave existing rows alone** and log a warning. The user can `DELETE` manually if intended.

2. **Numeric "code" enums** (e.g., `Status` = 1/2/3). Common in legacy schemas. Out of scope for v1, but worth designing the pre-filter so a v2 expansion is purely additive.

3. **Should we surface the LLM's `reasoning` text into the EntityField record** somehow (e.g., appended to `Description`)? Would help reviewers triage the soft-enum verdicts inside MJ. **Proposal:** no — keep it in the `additionalSchemaInfo.json` audit trail only. Description text is already AI-generated and conflating sources gets messy.

4. **Cross-column / compound enums** (e.g., `(Type, SubType)` always paired). Flag for v2; orthogonal to single-column enum detection.

5. **Should the LLM be allowed to *narrow* a discovered list** (e.g., data shows `["Active", "active", "ACTIVE"]` and LLM proposes `["Active"]` with a normalization note)? Probably not for v1 — we don't want LLM-driven data mutations leaking into metadata. Surface the inconsistency in `reasoning` and let the human fix the data.

---

## Non-Goals (locked in)

- We are **not** writing data-cleansing routines.
- We are **not** generating CHECK constraints from discovered enums (that's a different feature — schema migration suggestions).
- We are **not** replacing `parseCheckConstraintValues` or any existing path. CHECK wins.
- We are **not** building a UI for reviewing soft-enum verdicts inside MJExplorer (could be a follow-up; the file is reviewable in any text editor for now).
