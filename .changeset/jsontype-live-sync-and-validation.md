---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/ai-agents": minor
"@memberjunction/computer-use-engine": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/ng-entity-viewer": minor
---

JSONType accessors are now live views, and JSONTypes can opt in to validation.

**Bug fix (silent data loss).** The generated `<Field>Object` accessor parsed the JSON once and only re-serialized in its setter, so `rec.ConfigObject.Pct = 5` or `rec.ItemsObject.push(x)` edited a throwaway copy and `Save()` wrote nothing. Accessors now delegate to new `BaseEntity.GetJSONFieldObject` / `SetJSONFieldObject` (backed by `JSONFieldBinding`): in-place edits at any depth dirty the raw field and persist, no-op writes stay clean, references re-parse and detach when the raw text is replaced by `Load`/`Set`/`Revert`, and a pre-`Validate()`/`Save()` flush catches edits made through the caller's own reference after assignment.

**`ToPlainJSON<T>`** (`@memberjunction/core`) returns a plain deep copy. `structuredClone`, `postMessage` and IndexedDB reject a live value, so `MJComputerUse` `LoadScript` and `BaseAgent.cloneSubAgentPayload` now use it (the latter falls back to a JSON clone instead of returning the original).

**Opt-in validation (CodeGen).** `@mjValidate [warn]` on a JSONType's root interface emits a structural Zod schema and a generated `Validate()` check; JSON-Schema-style tags (`@minimum`, `@pattern`, `@format`, ...) and `@CHECK ts:(...)` / `@CHECK (SQL)` rules refine it. SQL rules are translated by the new `CodeGen: JSON Check Parser` prompt, compile-checked, and cached in `GeneratedCode` under the new `CodeGen: JSON Validators` category. Untagged JSONTypes generate exactly what they did, apart from the accessor delegation.

Ships new metadata (prompt, template, GeneratedCode category) and two integration tests (IT97, IT96). See `guides/JSONTYPE_GUIDE.md`.

**Hardening from local verification.** Opted-in schemas compile in non-strict packages (`z.lazy(...) as z.ZodType<T>`; MJCoreEntities builds without `strictNullChecks`, where the annotation form failed). `@CHECK ts:` expressions are type-checked at CodeGen time and skipped with an error instead of breaking the build. Enum references are prefixed. Shared helper schemas and a definition bound to both an opted-in and an untagged root are emitted once. An invalid `@pattern` is reported at CodeGen time. The test-case sandbox bounds microtasks. The translation cache key includes the value's shape (and the entity for `row.` rules). A newly translated rule is emitted in the same full run.

**`SQLServerDataProvider.Refresh()` now really reloads.** It was a silent no-op while any save was in flight, so a caller refreshing right after a fire-and-forget save kept stale metadata. Refresh now waits (bounded) for in-flight saves, saves are counted instead of toggling one flag, and `DatabaseProviderBase.Save` resumes exactly once per suspend.

**Entity viewer:** grid state handed to the grid and config panel is a detached copy, so reordering aggregates no longer dirties the view on Cancel.
