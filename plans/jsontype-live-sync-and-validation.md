# JSONType: live object↔string sync, structural Zod, and opt-in validation (`@mjValidate` / `@CHECK`)

Status: **implemented in this PR, awaiting review** (integration bundles IT99/IT100 authored but not yet executed against a database). Owner: Amith Nagarajan.

## Why

JSONType fields (`EntityField.JSONType` / `JSONTypeIsArray` / `JSONTypeDefinition`) give a
generated `BaseEntity` subclass a typed `<Field>Object` accessor over a JSON text column. Three
gaps:

1. **Silent data loss (bug).** The accessor caches the parsed object and only re-serializes in its
   setter. An in-place edit — `rec.ConfigObject.Pct = 5`, `rec.ItemsObject.push(x)` — changes the
   cached object but never the raw string: the field is not dirty and `Save()` writes the old JSON.
   The getter then keeps returning the mutated object, so the record *looks* edited. Verified by
   running the generated accessor verbatim. No current caller mutates in place (all read, or assign a
   whole object), which is why it has not been seen — but nothing prevents it and the doc comment
   does not warn.
2. **No shape validation.** The Zod schema emits `z.any()` for JSONType fields ("full Zod schema
   generation is a future phase"), so `<Entity>EntityType` / `GetAll()` type them as `any`, and at
   runtime `EntityField.Validate()` only checks that the text parses as JSON (`ExtendedType='JSON'`).
   Any shape saves.
3. **No rule language.** Table columns get CHECK constraints → value lists or LLM-generated
   `Validate()` code. JSON members have nothing equivalent.

## Design

### A. Live sync (fixes 1) — `@memberjunction/core`

A new, framework-level helper — not per-entity generated logic — owns the object↔string link.

- **`JSONFieldBinding`** (new file `packages/MJCore/src/generic/jsonFieldBinding.ts`), one per
  JSONType field per entity instance, lazily created through a protected `BaseEntity` method
  (e.g. `protected GetJSONFieldObject<T>(fieldName)` / `SetJSONFieldObject<T>(fieldName, value)`).
  Generated accessors become one-line delegations — logic lives once in core, not N times in
  generated code.
- **Object → string, on the fly.** The getter returns a `Proxy` over the parsed value. Nested
  values are wrapped lazily on read (so every reference obtained from the root — however deep, or
  held in a local variable — is tracked), with a `WeakMap` cache so `obj.a === obj.a`. `set` /
  `deleteProperty` / `defineProperty` traps apply the change then re-serialize the root through the
  normal `Set(fieldName, raw)` path, so dirty tracking and change events work unchanged. Only
  **plain objects and arrays** are wrapped (prototype `Object.prototype`, `null`, or `Array`) —
  wrapping exotic objects (`Date`, `Map`, class instances) breaks their internal slots.
  Re-serialize eagerly on every mutation (config blobs are small; a `push` costs two serializations —
  index + `length`). Suppress no-op writes: if the new raw equals the current raw, don't call `Set`.
- **String → object.** When the raw value changes by any other route (`Load`, `LoadFromData`,
  `Set`/string setter, `NewRecord`, revert), the next object read re-parses; references handed out
  before that are detached from the entity (documented). Invalidation must key off the raw value,
  as today, so no hook in every write path is required. A write *originating from the proxy* must
  not invalidate the proxy it came from.
- **Safety net.** An object assigned into the tree and then mutated through the caller's *original*
  (unproxied) reference is invisible to the proxy. Before `Validate()` and inside the save path
  (before dirty evaluation / SQL build), `BaseEntity` asks each materialized binding to re-serialize
  its current object and `Set` if it differs. Cheap: only bindings whose object was actually read.
- **Typing.** `Proxy` preserves `T` (`new Proxy<T>`), so the accessor stays `T` at every depth.
- **Known limits (document them):** `structuredClone`/`postMessage`/IndexedDB of a proxied value
  throws `DataCloneError` (verified in Node 22 and Chromium). Core exports a typed
  `ToPlainJSON<T>(value: T): T` deep-plain-copy helper as THE way to clone/transfer/store these
  values. Existing callers that break and must be fixed in this PR:
  `MJComputerUse/src/test-driver/script-store.ts` `LoadScript` (`structuredClone` of
  `ConfigurationObject.ReplayScript`), and `AI/Agents/src/base-agent.ts` `cloneSubAgentPayload`
  (its catch returns the original object — must fall back to a JSON clone instead). Identity: the
  proxy is not `===` the raw parsed object (nobody else has that object anyway).
- **Runtime support:** `Proxy`/`Reflect`/`WeakMap` are ES2015 — all evergreen browsers and every
  supported Node. Angular template / `ngModel` writes go through the set trap, so they update the entity.
- Null handling: `null`/empty raw → accessor returns `null`; assigning `null` sets raw `null`.
  Primitive JSON roots (a JSONType whose value is a string/number) are returned unwrapped.

### B. Structural Zod (fixes 2, typing) — `@memberjunction/codegen-lib`

For **opted-in** JSONTypes only (see C), CodeGen converts the JSONTypeDefinition's TypeScript AST
into a Zod schema and uses it in place of `z.any()` in `<Entity>Schema`. `<Entity>EntityType` then
carries the real interface type.

- Supported: interfaces, type aliases, optional members, `string|number|boolean|null`, string /
  number / boolean literal types and unions, arrays (`T[]`, `Array<T>`), nested/referenced local
  types (recursion via `z.lazy`), `Record<string, T>`, index signatures, `unknown`/`any`.
- Anything unsupported → `z.unknown()` for **that sub-tree only** + a CodeGen warning. Never fail the run.
- Emit order must respect references (or use `z.lazy` uniformly for local type refs). Output must be
  deterministic (drift gate).
- Untagged JSONTypes: output **byte-identical** to today (`z.any()`, no new members) — this is the
  back-compat guarantee and must have a test.

### C. Opt-in + rules (fixes 3)

Rules are **JSDoc tags** — TypeScript decorators are illegal on interface members (hard parse error;
the existing `ValidateJSONTypeDefinition` would then silently demote the field to a plain string).

- **`@mjValidate`** on the root interface (the one named by `EntityField.JSONType`) opts the whole
  type in; nested types are reached from the root. `@mjValidate warn` → emit results as
  `ValidationErrorType.Warning` instead of `Failure`. A shared interface (e.g. `IAISecondaryScopes`)
  opts in everywhere it is bound.
- **Standard JSON-Schema-style tags** (ts-json-schema-generator vocabulary) map straight to Zod:
  `@minimum` `@maximum` `@exclusiveMinimum` `@exclusiveMaximum` `@minLength` `@maxLength`
  `@pattern` `@minItems` `@maxItems` `@uniqueItems` `@format` (email|uri|uuid|date-time|date) `@multipleOf`.
- **`@CHECK <expr>`** — MJ-specific, repeatable.
  - `@CHECK ts:(<TypeScript boolean expression>)` — compiled directly, no LLM. `value` is the object
    the tag is scoped to (see scope rules); `row` is the owning entity (read-only use).
  - `@CHECK (<SQL boolean expression>)` — translated to TypeScript by an LLM exactly like table
    CHECK constraints, then cached (see D).
  - **Scope:** on a *property* → names resolve against the enclosing object (like a column CHECK);
    on an *interface* → object-level (like a table CHECK); on an *array-typed* property → applied to
    each element. `row.<Column>` references the owning entity's columns.
  - **NULL semantics (SQL):** a SQL CHECK passes when the predicate is UNKNOWN. Generated code must
    pass when a referenced optional member is `null`/`undefined`. This must be stated in the prompt
    and covered by tests. `ts:` expressions are taken literally (author's responsibility).
- Validation errors carry a path source: `Configuration.Items[2].EndHour`.

### D. SQL `@CHECK` → TypeScript (LLM), cached like table CHECKs

- New prompt `CodeGen: JSON Check Parser` (metadata under `metadata/prompts/`, template under
  `metadata/prompts/templates/codegen/`), modelled on `CodeGen: Check Constraint Parser`, given the
  interface property list + types instead of table columns, the scope, and the NULL rule.
- New `AdvancedGeneration.ParseJSONCheck(...)`, gated by the same `ParseCheckConstraints` feature flag.
- Persist results in `__mj.GeneratedCode` under a **new category** `CodeGen: JSON Validators` (seeded
  via metadata, hardcoded UUID), keyed on **JSONType name + property path + normalized check text** —
  *not* the entity field — so a shared interface generates once and edits are detected by text, as
  the table path does. Reads are unconditional (no AI flag) so `--no-ai` preserves committed code,
  mirroring the fix documented in `manage-metadata.ts` near the table-CHECK loop.
- LLM-produced code is emitted only when parsed/validated by the TS compiler API; otherwise skip that
  rule with a CodeGen error (never emit broken code).

### E. Emission into the entity class

- Generalize `GenerateValidateFunction` so the generated `Validate()` override is produced when
  **either** table-CHECK validators **or** opted-in JSON validators exist. Order: `super.Validate()`
  → table CHECK validators → JSON validators (structural Zod `safeParse` first, then tag/`@CHECK`
  rules). One helper in core (e.g. `ValidateJSONField(field, schema, rules, severity, result)`) maps
  Zod issues to `ValidationErrorInfo` with path sources, so generated code stays thin.
- Validate a JSON field **only when dirty or the record is new** — opting a type in must not block
  unrelated edits to existing rows.
- Invalid JSON text on an opted-in field → one clear error, skip shape/rule checks for that field.
- `ValidateAsync` is **out of scope** (future: referential rules such as "this ID exists").

### F. Docs & tests (required in this PR)

- Docs: new `guides/JSONTYPE_GUIDE.md` (accessor semantics incl. live sync and its limits, opt-in,
  tag vocabulary, `@CHECK` scope + NULL rules, examples) indexed in `guides/README.md`; update the
  JSONType section of `guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md`; update affected package READMEs.
- Unit tests (vitest):
  - core: the three failing scenarios from the investigation (in-place edit, reassign-then-mutate,
    held reference), deep nesting (≥6 levels), array methods (`push/splice/sort/length`), `delete`,
    new subtree then edit, exotic objects not wrapped, no-op writes not dirtying, string→object
    re-parse after `Set`/`LoadFromData`, detached old references, the save/validate safety net,
    null/empty roots, arrays as root, `ValidateJSONField` issue→path mapping, dirty-only validation.
  - codegen: untagged output byte-identical; opted-in emits schema + validators; TS→Zod mapping for
    every supported construct; unsupported → `z.unknown()` + warning; JSDoc tag → Zod mapping;
    `@CHECK ts:` emission; `@CHECK` SQL path with a stubbed LLM (cache hit, cache miss, `--no-ai`,
    changed text → regenerate, invalid LLM output skipped); deterministic output; type-name prefix
    rewrite does not corrupt tag bodies (read tags from the AST before renaming, or rename via AST).

## Not in this PR

- Regenerating `MJCoreEntities` / `MJServer` / Angular generated output — done by a CodeGen run with a
  database after merge. Until then the checked-in generated accessors keep today's behaviour.
- Running the real LLM for SQL `@CHECK` (no model access here) — covered by stubbed tests.
- `ValidateAsync` referential rules.
- Opting any existing JSONType in.

## Implementation notes (deviations and decisions)

- **Binding design.** `JSONFieldBinding` keeps a per-generation `WeakMap` proxy cache and a canonical
  snapshot for no-op suppression. When the raw text changes but parses to the same canonical value (a
  formatting-only change) the tree is kept. Proxies from a discarded generation are *detached*: a write
  through one throws rather than silently vanishing. `Revert`, `NewRecord`, `Hydrate`, `From`, `LoadFromData`
  and loads always discard bindings (even when the raw text is identical) so a stale adopted tree cannot
  survive.
- **`ToPlainJSON`** is exported from core (not on the entity). `LoadScript` and `cloneSubAgentPayload` were
  fixed; `cloneSubAgentPayload` tries `structuredClone`, then `ToPlainJSON`, then logs and returns the original.
- **Opt-in tags are read from the AST** (`json-type-model.ts`); the historical regex prefix rewrite is kept
  only for untagged definitions so their output stays byte-identical (golden test).
- **Same-line JSDoc after `{`** is not attached to a member by TypeScript. It cannot be fixed, so CodeGen
  warns about orphaned tag comments; authors must put tags on their own lines.
- **Unsupported constructs** degrade to `z.custom<T>()` (plus warning) for that sub-tree. Required
  `unknown`/`any` members force the schema const to `z.ZodTypeAny` (a `z.ZodType<T>` annotation cannot hold them).
- **Rule engine.** `ValidateJSONFieldValue` runs structural `safeParse` first, then `@CHECK` rules only when the
  structure is valid, via a type-graph walk emitted as `JSONFieldRuleSet`. `Test(value,row)` returns true when valid.
  Warn severity produces Warning-typed errors that do not fail the save.
- **SQL `@CHECK` cache** key is `JSONType|Path|NormalizedText` in `GeneratedCode.Source`, category
  `CodeGen: JSON Validators` (seeded under `metadata/generated-code-categories/`). Old rows are not deleted when
  a rule's text changes. LLM bodies are compile-checked (syntax, `return`, no `${`, type-check against the interface).
- **Entity Zod stays `z.any()` (decision, replaces an earlier draft).** The column's value everywhere (Get,
  GetAll, LoadFromData, GraphQL, raw rows) is JSON TEXT, so the `<Entity>Schema` column entry for an opted-in
  field is exactly what an untagged field emits. The structural schema consts are emitted at module scope,
  EXPORTED, and used only by the generated `Validate()` (and by consumers who want `z.infer`/`safeParse`).
  Opted-in declarations are rewritten with `export` so the exported consts never name a private type.
- **Re-assigning the live object** (`SetValue`): a proxy of the current generation's root is a no-op plus `sync()`
  (nothing detaches); a proxy of a nested node becomes the root as an independent copy; a proxy of another record
  or a detached generation is copied.
- **`ValidateJSONField`** flushes before its dirty check.
- **SQL `@CHECK` self-check.** The prompt now requires `TestCases`; CodeGen executes them in a `vm` context
  (250 ms limit) and rejects a translation with none, with a failing case, or (when the value type has
  optional/nullable members) without an absent/null case. This is self-consistency, not proof of equivalence with
  the SQL; reviewers should still read translated rules.
- **Inherited property rules** re-key per derived declaration.
- **Integration bundles** `jsontype-live-sync` (IT99, seq 49) and `jsontype-live-sync-client` (IT100, seq 71) use a
  test-only `MJ: Tests` subclass with a `LiveConfig` accessor over `Configuration`. Not executed.
- **MJCore has no `README.md`** (its file is `readme.md`); that file and the CodeGenLib README were updated.
