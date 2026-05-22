# Typed JSON Extensions — Implementation Plan

Branch: `claude/amazing-ptolemy-z2AyM` · Mockups: [`mockups/index.html`](mockups/index.html)

> **HOW TO USE THIS PLAN.** This document is the source of truth for the Typed JSON Extensions work. The implementing agent (and human reviewer) **MUST work through the [Punch List](#9-punch-list)** in order. Every task has explicit Exit Criteria — do not mark a task complete unless all criteria are met. If a session is interrupted, the next agent resumes at the first non-complete task. Testing is part of each phase's exit criteria, not a phase at the end.
>
> **Mockups are visual intent only.** Implement with the real MJ design system (`_tokens.scss` semantic tokens, `@memberjunction/ng-ui-components`, AG Grid, `DynamicFormFieldComponent`). The HTML mockups hardcode colors *only* because they are standalone files; production code MUST use design tokens.

---

## 1. Goals & Non-Goals

**Goals.** Give MemberJunction a **general, reusable capability** to attach a runtime-defined JSON Schema to any JSON column, and from that schema:
1. **Render** the value as a rich interactive form (typed fields) instead of raw JSON — at create/edit time.
2. **Validate** the value server-side against the schema on `Save()`.
3. **Surface** selected JSON sub-fields as **first-class columns in User View grids**, and **filter** on them.

**Lists are the first consumer.** A new **List Type** entity carries two schemas — one for List-level extended attributes, one for List Detail-level attributes — proving the general machinery end to end.

**Non-Goals.**
- Not replacing app-specific detail tables. Heavy, relationally-queried, FK-integrity data still belongs in real tables/related entities. JSON extensions are for *lightweight, per-type-varying* attributes.
- Not changing the build-time `EntityField.JSONType` / `JSONTypeDefinition` mechanism (that stays as-is for CodeGen-emitted strong typing). This feature is the **runtime, data-driven** sibling and is named distinctly to avoid confusion.
- Not making Lists dynamic, and not adding multi-entity Lists.

## 2. Two Binding Modes (the core abstraction)

The engine must support both from the start:

| Mode | Schema source | Uniform per row? | First example |
|---|---|---|---|
| **Fixed** | `EntityField.ValueJSONSchema` — one schema for a JSON column, all rows of the entity | Yes | Any entity's typed JSON column |
| **Polymorphic** | A discriminator FK selects the schema per row (e.g. `List.ListTypeID` → `ListType.ListExtendedDataSchema`) | No | Lists |

Everything downstream (form rendering, validation, virtual columns, filtering) is written against an **abstract `ResolvedSchema`** so it doesn't care which mode produced it. Polymorphic + grid columns has a documented constraint (see §6).

## 3. Architectural Principles

Strict layering — each layer is a thin pass-through over the one below.

1. **Runtime engine** — new framework-agnostic package `@memberjunction/json-schema-forms`. Pure TS, zero Angular/GraphQL deps. Owns: schema parse + **ajv** validation (ajv 8 is already a dependency — see `packages/Credentials/Engine`), `schema → FormQuestion[]` mapping, and virtual-field enumeration. This is the de-risking core and is 100% unit-testable.
2. **Reusable Angular components** — `@memberjunction/ng-json-schema-forms` (or folded into an existing generic package): `<mj-schema-form>` (render+edit a value from a schema) and `<mj-schema-editor>` (author a schema — generalized from the existing `credential-type-edit-panel`). Both reuse the **already-built** `DynamicFormFieldComponent` (14+ control types) and `FormQuestion` interface.
3. **Data model** — additive migrations + CodeGen (see §4).
4. **Server validation** — `ListEntityServer` / `ListDetailEntityServer` in `MJCoreEntitiesServer/src/custom/`, validating in `ValidateAsync` per the BaseEntity server patterns guide.
5. **View integration** — extend `ViewGridColumnSetting`, the filter builder, and `convertFilterToSQL` to understand virtual fields, emitting `dialect.JsonExtract()` (already implemented for SQL Server `JSON_VALUE` and Postgres `->>`).

## 4. Data Model (all additive → complies with the no-break policy)

**New entity `MJ: List Types`**
| Column | Type | Notes |
|---|---|---|
| ID | uniqueidentifier | PK |
| Name | nvarchar(100) | |
| Description | nvarchar(MAX) NULL | |
| ListExtendedDataSchema | nvarchar(MAX) NULL | draft-07 JSON Schema for List-level attrs |
| ListDetailExtendedDataSchema | nvarchar(MAX) NULL | draft-07 JSON Schema for Detail-level attrs |
| IsDefault | bit NOT NULL DEFAULT 0 | |

**`List`** (additive)
- `ListTypeID uniqueidentifier NULL` → FK `MJ: List Types` (nullable; existing lists stay untyped)
- `ExtendedData nvarchar(MAX) NULL` — JSON values for List-level attributes (no such column today)

**`ListDetail`** (reuse)
- **Reuse the existing `AdditionalData nvarchar(MAX)`** for Detail-level attribute values. No rename → stays additive.

**`EntityField`** (additive — the generalization hook)
- `ValueJSONSchema nvarchar(MAX) NULL` — fixed-binding schema for any entity's JSON column. Distinct from `JSONTypeDefinition` (build-time TS). Add `sp_addextendedproperty` description.

Seed default List Types via **metadata files** under `/metadata/list-types/` (NOT SQL inserts), per repo convention.

## 5. `schema → FormQuestion[]` Mapping (the missing bridge)

| JSON Schema | FormQuestion.type |
|---|---|
| `string` | `text` |
| `string` + long / `format: textarea` | `textarea` |
| `string` + `enum` | `dropdown` (options from enum) |
| `string` + `format: date` | `date` |
| `string` + `format: date-time` | `datetime` |
| `string` + `format: email` | `email` |
| `number` / `integer` | `number` |
| `number` + `x-mj-format: currency` | `currency` |
| `boolean` | `checkbox` |
Carry `title`→label, `description`→helpText, `required[]`→required, `default`→defaultValue, `x-mj-width`→widthHint. Unknown/object/array types fall back to a raw JSON code-editor field so nothing is unrenderable.

## 6. View Virtual Columns & Filtering (the higher-risk, general piece)

Today the grid/filter/SQL stack is **name-coupled to real `EntityField`s**: `GridState.columnSettings[].Name` matches `EntityInfo.Fields`; `convertFilterToSQL()` throws on unknown fields. Changes:

- **`ViewGridColumnSetting`** gains optional `jsonColumn` + `jsonPath` (+ resolved `dataType`, `label`).
- **Display (client-side, no server change):** `buildAgColumnDefsFromGridState` uses an AG Grid `valueGetter` that parses the JSON column on the row and extracts `jsonPath`. Formatting follows the resolved type.
- **Filter builder:** schema-derived virtual fields are merged into `FilterFieldInfo[]` alongside real fields, visually grouped under their source column.
- **WHERE generation:** `convertFilterToSQL` detects a virtual field and emits `dialect.JsonExtract(col, path)` with a type-cast for numeric/date comparisons, instead of throwing.
- **Field discovery:** virtual fields come from the **fixed** schema on `EntityField.ValueJSONSchema`. **Constraint:** polymorphic columns (e.g. a Lists grid mixing multiple List Types) have heterogeneous schemas — virtual columns are only offered when the view is scoped to a single type (e.g. filtered to one `ListTypeID`). Document this in the column picker UX.
- **Performance note:** `JSON_VALUE`/`->>` predicates are not index-backed; fine at view scale. Flag a future computed-column+index path if a given path gets hot.

## 7. Phasing

- **Phase 0 — Runtime engine** (`@memberjunction/json-schema-forms`): parse+validate (ajv), `schema→FormQuestion[]`, virtual-field enumerator. No DB changes. Exit: full unit-test coverage incl. every type mapping + invalid-schema handling.
- **Phase 1 — Reusable UX**: `<mj-schema-form>` + `<mj-schema-editor>`. Exit: render/edit round-trips a value against a draft-07 schema; schema editor authors + rebuilds a schema; unit + component tests.
- **Phase 2 — Data model**: List Types entity, `List.ListTypeID`, `List.ExtendedData`, `EntityField.ValueJSONSchema`; migration + CodeGen; metadata-seeded default List Types. Exit: migration applies on SQL Server + Postgres, CodeGen regenerates, types compile.
- **Phase 3 — Lists consumer**: server validation subclasses; List form renders `<mj-schema-form>` for `ExtendedData`; List Detail grid edits Detail attributes. Exit: create/edit/validate a typed list end to end; server rejects schema-invalid saves.
- **Phase 4 — View virtual columns + filtering** (independent, gated on `EntityField.ValueJSONSchema`): column picker offers JSON paths; grid renders them; filter builder + WHERE support them on SQL Server + Postgres. Exit: a view shows + filters a JSON sub-field on both platforms; perf test on AssociationDB.

## 8. Risks / Open Items
- ajv bundle size in the Angular path — confirm tree-shaking; engine is framework-agnostic so server reuse is free.
- Polymorphic + grid columns constraint (above) — must be clear in UX, not a silent empty list.
- Unindexed JSON predicates — acceptable now; note the computed-column escape hatch.
- Keep naming unambiguous: **"JSON value schema"** (this feature, runtime) vs **"JSONType definition"** (existing, build-time).
- Multi-provider correctness — schema resolution and validation must use the provider in hand (`this` / passed provider), never `new Metadata()`, per CLAUDE.md.

## 9. Punch List
- [ ] **P0.1** Scaffold `@memberjunction/json-schema-forms`; ajv validator wrapper + tests.
- [ ] **P0.2** `schema → FormQuestion[]` mapper covering every row in §5 + fallback; tests.
- [ ] **P0.3** Virtual-field enumerator (`ResolvedSchema` → `(jsonPath, dataType, label)[]`); tests.
- [ ] **P1.1** `<mj-schema-form>` over `DynamicFormFieldComponent`; round-trip tests.
- [ ] **P1.2** `<mj-schema-editor>` generalized from `credential-type-edit-panel`.
- [ ] **P2.1** Migration: `MJ: List Types`, `List.ListTypeID`, `List.ExtendedData`, `EntityField.ValueJSONSchema` (+ extended properties). Single consolidated `ALTER TABLE` per table.
- [ ] **P2.2** Run migration + CodeGen on SQL Server and Postgres; verify generated types.
- [ ] **P2.3** Seed default List Types via `/metadata/list-types/`.
- [ ] **P3.1** `ListEntityServer` / `ListDetailEntityServer` `ValidateAsync` schema validation.
- [ ] **P3.2** List form: ListType picker + `<mj-schema-form>` for `ExtendedData`.
- [ ] **P3.3** List Detail grid: editable Detail attributes.
- [ ] **P4.1** Extend `ViewGridColumnSetting`; column picker offers JSON paths (single-type guard).
- [ ] **P4.2** Grid `valueGetter` rendering for `jsonPath` columns.
- [ ] **P4.3** Filter builder + `convertFilterToSQL` virtual-field support via `JsonExtract` (both dialects).
- [ ] **P4.4** Perf test on AssociationDB; document indexing guidance.
