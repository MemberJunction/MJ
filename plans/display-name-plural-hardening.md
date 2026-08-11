# DisplayNamePlural — Hardening Plan (the 5 improvements)

**Status:** Migration authored (this branch). Runtime completion **blocked on migration + CodeGen being applied locally** — the stored fields don't exist in generated types until then, and per the repo rule we don't write code against not-yet-generated fields.
**Context:** `DisplayNamePlural` began as a runtime getter delegating to `generatePluralName` (a CodeGen-era utility). Moving a build-time helper onto the render hot path changes its requirements — these five items address that.

---

## Where this stands

- ✅ **Migration authored** — `migrations/v5/V202607041200__v5.45.x__Entity_DisplayNamePlural.sql` adds `Entity.DisplayNamePlural NVARCHAR(255) NULL` + `Entity.AutoUpdateDisplayNamePlural BIT NOT NULL DEFAULT 1`, with extended properties. Mirrors the existing `DisplayName` / `AutoUpdateDescription` pattern already on the table.
- ⏳ **Everything below waits for the human to:** pull this branch, apply the migration, run `mj codegen` (regenerates `vwEntities`, the `EntityField` rows, the `spCreate/spUpdate` Entity procs, and `entity_subclasses.ts`), then hand back to complete the runtime code against the now-generated fields.

The two ideas that are **independent of the migration** (#3 algorithm, #4 golden tests, #5 irregulars) can be executed **any time** — they live entirely in `@memberjunction/global` and are fully buildable/testable in isolation. They're sequenced here with #1 only for narrative coherence; say the word and I'll do them without waiting.

---

## Idea #1 — Store the plural in metadata (the headline)

**Goal:** stored value wins, algorithmic plural is the fallback. Gives admin/LLM override, non-English support, and (with #2) zero runtime compute.

### 1a. Migration — ✅ DONE (authored)
See the file above. No code depends on it until CodeGen runs.

### 1b. CodeGen emitter — populate `DisplayNamePlural` during codegen
Mirror exactly how CodeGen derives/sets `Entity.DisplayName` and honors an auto-update lock (the entity already has `AutoUpdateDescription` as the precedent for a lock flag). The emitter should, for each entity where `AutoUpdateDisplayNamePlural = 1`:
- compute the plural (via `generatePluralName(DisplayNameOrName)` at minimum; optionally the codegen LLM for better results), and
- write it to `Entity.DisplayNamePlural`,
- and **never** overwrite when the flag is `0` (human-locked).

> **Exact seam to edit:** _pending the CodeGen investigation_ — the function that assigns `Entity.DisplayName` during a run and the `AutoUpdate*` guard around it. Fill this in with the confirmed file/function before executing. (If CodeGen derives DisplayName purely algorithmically, mirror that; if via LLM, add plural to the same prompt/pass.)

### 1c. Runtime — `EntityInfo` (in `packages/MJCore/src/generic/entityInfo.ts`)
Once the columns are generated, mirror the `DisplayName` / `DisplayNameOrName` shape:

```typescript
// Raw stored value (populated from metadata by BaseInfo, like DisplayName):
public DisplayNamePlural: string = null;
public AutoUpdateDisplayNamePlural: boolean = true;

// The accessor consumers call — stored wins, algorithm is the fallback:
get DisplayNamePluralOrComputed(): string {
    if (this.DisplayNamePlural) return this.DisplayNamePlural;
    return this._displayNamePluralComputed ??= generatePluralName(this.DisplayNameOrName); // memoized — see #2
}
```

**Naming decision (resolve on execute):** the current shipped getter is named `DisplayNamePlural` and returns the computed value. Since the DB column is also `DisplayNamePlural`, the raw field and a same-named getter collide. Two options:
- **(A) Mirror `DisplayName`/`DisplayNameOrName` exactly** — raw field `DisplayNamePlural`, accessor `DisplayNamePluralOrComputed`. Most consistent with the existing idiom; requires renaming the shipped getter + updating the 3 entity-viewer consumers + the fallback expression + the MJCore test. **Recommended.**
- **(B) Keep the getter name `DisplayNamePlural`**, name the stored column/field `DisplayNamePluralOverride`. Zero consumer churn, stable public API, but diverges slightly from the `DisplayName` naming precedent. (If chosen, the migration's column name must change to `DisplayNamePluralOverride`.)

Recommendation: **(A)** for consistency — the churn is ~5 sites, all on this branch.

### 1d. Consumers + tests
- Update the three entity-viewer bindings (`entity-viewer` `NoRecordsTitle`, `entity-cards`, `entity-data-grid`) and the fallback expressions to call the accessor.
- Update `entityInfo.displayNamePlural.test.ts`: the computed path becomes "stored is null → falls back to computed"; add cases for "stored value wins" and "AutoUpdate lock is carried."

---

## Idea #2 — Memoize the computed fallback
Template getters run on **every** change-detection cycle; recomputing the regex+table+casing pipeline each time is waste on a hot path (CodeGen never cared — it ran once). Cache the computed value on the instance, following the existing `_nameFieldCache` precedent in `EntityInfo`:

```typescript
private _displayNamePluralComputed?: string;   // lazy, cleared naturally on metadata reload (instance is rebuilt)
```

Only the **computed fallback** needs memoizing; when a stored value exists there's nothing to compute. Safe because `DisplayName` is immutable per metadata load (same assumption `_nameFieldCache` relies on).

---

## Idea #3 — Harden `generatePluralName` (in `@memberjunction/global/src/util.ts`)
Independent of the migration; buildable + testable now.

1. **Consult the irregular table BEFORE the "already-plural?" heuristic (correctness bug fix).** Today `generatePluralName` calls `getSingularForm` first; for `-is`/`-us` words (`analysis`, `radius`, `cactus`, `focus`, `diagnosis`, …) that heuristic strips the trailing `s`, decides the input "is already plural," and bails — so the ~30 Latin/Greek entries already in `__irregularPlurals` are **currently unreachable**. Reordering so `getIrregularPlural(singularName)` is checked first fixes `analysis → analyses`, `radius → radii`, `cactus → cacti`, etc.
2. **Pluralize the LAST word of a multi-word name.** Split on whitespace, pluralize the final token, rejoin. Common cases already work (suffix rules coincide with the last word), but this correctly handles an irregular *tail* — e.g. `Data Analysis → Data Analyses` — which whole-string irregular lookup misses.
3. **Skip acronyms / ALL-CAPS tokens.** If the (last) token is all-uppercase (length ≥ 2), just append `s` (`API → APIs`, `URL → URLs`) instead of applying the `-es` rule to a trailing `S`/`X`.

**Determinism caveat (important):** `generatePluralName` is also a CodeGen consumer. Changing it can change generated plural identifiers on the next codegen run. All three changes above are strict *corrections* (they fix words that are currently wrong or unchanged), and CodeGen regenerates consistently — but the PR should call this out, and #4 exists precisely to lock the contract so neither consumer drifts silently.

---

## Idea #4 — Shared golden test set for `generatePluralName`
Now that **two** subsystems depend on it (CodeGen artifacts + runtime display), add a table-driven vitest suite in `@memberjunction/global` pinning input → expected plural: the regular rules, every irregular in the table (regression-guarding the #3 reorder), idempotence (already-plural in → unchanged out), multi-word, and acronym cases. This is the safety net that lets #3/#5 evolve without silently changing generated code or UI copy.

---

## Idea #5 — Expand the irregular table
`__irregularPlurals` is already good, but common data-model words are missing or (per #3.1) unreachable. Add and verify via #4: `axis → axes`, `basis → bases`, `ellipsis → ellipses`, `hypothesis → hypotheses`, `parenthesis → parentheses`, `oasis → oases`, `synopsis → synopses`, `series → series`, `species → species`, `quiz → quizzes`. Deliberately **under-invest** here — with #1's stored override in place, edge cases have an escape hatch, so chasing algorithmic perfection has diminishing returns and real regression risk.

---

## Execution order when unblocked
1. (Now, migration-independent) #3 + #4 + #5 in `@memberjunction/global` — one PR-able unit, fully verifiable.
2. (After human applies migration + `mj codegen`) #1c/#1d + #2 in MJCore + entity-viewer, against the now-generated fields.
3. (During #1) #1b CodeGen emitter — confirm the seam, mirror the `DisplayName` derivation + lock.

## Explicitly NOT doing yet
Per the human's call: only the migration is authored in this pass. The runtime code that references the new fields waits until the fields exist locally (migration + CodeGen), to honor the "no code against not-yet-generated fields" rule.
