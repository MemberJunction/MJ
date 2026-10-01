# JSONType Fields: Live Typed Objects and Opt-In Validation

A **JSONType** field is a text column that stores JSON, declared on `EntityField` with
`JSONType` (the interface name), `JSONTypeIsArray`, and `JSONTypeDefinition` (the TypeScript source
of the interface). CodeGen turns it into a typed `<Field>Object` accessor on the generated entity
class. This guide covers what that accessor does, its limits, and the opt-in validation layer
(`@mjValidate`, JSON-Schema-style tags, `@CHECK`).

Setting a JSONType on a field is a metadata step — see
[Migration → CodeGen Workflow § The JSONType Pattern](MIGRATION_CODEGEN_WORKFLOW_GUIDE.md).

---

## 1. The accessor is a live view

```typescript
const rec = await md.GetEntityObject<WidgetEntity>('Widgets', user);
await rec.Load(id);

rec.SettingsObject.Features[0].Enabled = true;   // in-place, any depth
rec.SettingsObject.Features.push({ Name: 'x', Enabled: false });
delete rec.SettingsObject.NotificationEmail;
await rec.Save();                                // all three edits are persisted
```

Before this behavior existed the accessor parsed the text once, cached the object, and only
re-serialized in its setter. An in-place edit changed a throwaway copy and `Save()` **silently wrote
nothing**. The accessor now returns a live view backed by `JSONFieldBinding`
(`@memberjunction/core`, `packages/MJCore/src/generic/jsonFieldBinding.ts`), reached through two
protected `BaseEntity` helpers, `GetJSONFieldObject` / `SetJSONFieldObject`. Generated accessors are
one-line delegations to them; the logic lives once, in core.

### Semantics

| Situation | Behavior |
|---|---|
| Mutate at any depth (`o.a.b = 1`, `arr.push(x)`, `splice`, `sort`, `delete o.k`) | Raw field is updated through `Set()`, so it is dirty, change events fire, `Save()` persists it |
| Read the same member twice | Same reference (`o.a === o.a`) |
| Assign a plain object/array | Adopted; later edits through *your own* reference are still picked up (see safety net) |
| Assign the live object back (`rec.X = rec.X`, or `const c = rec.X; c.A = 1; rec.X = c; c.B = 2`) | No new generation: nothing is detached, no-op when nothing changed, later edits through `c` still persist |
| Assign a nested node as the new root (`rec.X = rec.X.Child`) | Stored as an independent **copy**; the old document's references detach |
| Assign a live object from another record | Copied |
| A write that changes nothing (`o.x = o.x`) | No `Set()`, record stays clean |
| Raw text changes by another route (`Load`, `LoadFromData`, `Set`, `Revert`, `NewRecord`) | Next accessor read **re-parses**; references you obtained earlier are **detached** |
| Write through a detached reference | **Throws** — a silent no-op would lose the write |
| Text differs only in formatting (whitespace/key order) after a reload | Tree is kept; references stay live |
| Reference held across `Save()` | Stays live |
| `null` / empty raw value | Accessor returns `null`; assigning `null` clears the field |
| JSON array root | Returned as an array proxy |
| Primitive JSON root (`"abc"`, `5`) | Returned unwrapped |
| Invalid JSON text | Reading the accessor throws |

Only **plain objects and arrays** are wrapped. `Date`, `Map`, class instances etc. are left alone
(wrapping breaks their internal slots), which cannot occur in parsed JSON anyway.

### The safety net

An object you assign into the tree and then mutate through your **original** reference is invisible
to the proxy. `BaseEntity` therefore flushes every materialized JSON object (re-serialize, `Set()` on
difference) before `Validate()` and at the start of `Save()`. Only fields whose accessor was read are
visited, so entities without JSONType fields pay nothing.

### Limits — read these

1. **`structuredClone`, `postMessage`, IndexedDB, and `Object.freeze` on a live value.**
   `structuredClone(proxy)` throws `DataCloneError`. Use
   `ToPlainJSON(value)` from `@memberjunction/core` — a typed deep plain copy — whenever a value from
   an accessor leaves the entity:

   ```typescript
   import { ToPlainJSON } from '@memberjunction/core';
   const copy = structuredClone(ToPlainJSON(rec.SettingsObject));
   worker.postMessage(ToPlainJSON(rec.SettingsObject));
   ```

   Do not `Object.freeze` a live view (or `Object.isFrozen`-guard on one): freeze a `ToPlainJSON`
   copy instead so the entity's own tree is never frozen.
2. **Identity.** The view is not `===` the raw parsed object. Nobody else holds that object.
3. **Detached references.** After `Load`/`Revert`/`Set` replaced the data, re-read from the accessor.
4. **Angular.** `[(ngModel)]="rec.SettingsObject.Name"` writes go through the proxy's `set` trap, so
   they update the entity and dirty it. Do not copy the object into component state expecting edits to
   flow back; bind to the entity.
5. **Cost.** Each mutation re-serializes the field (config blobs are small). A bulk edit loop of
   thousands of writes is fine but not free; batch into a plain copy and assign once if it matters.

---

## 2. Opt-in validation

Nothing validates JSONType content unless you opt in. Untagged JSONTypes generate exactly the code
they always did (`z.any()`, no new `Validate()` members) apart from the accessor delegation above.

Opt in with a JSDoc tag on the **root** interface (the one named by `EntityField.JSONType`):

```typescript
/**
 * @mjValidate
 */
export interface IScheduleConfig {
    Version: number;
    Windows: IWindow[];
}
```

`@mjValidate warn` reports every problem as a **Warning** — surfaced to the user, but the save is not
blocked. Nested types are reached from the root; a shared interface is opted in everywhere it is
bound.

> **Tags are JSDoc, not decorators.** TypeScript forbids decorators on interface members, and a
> parse error would silently demote the field to a plain string. Put the tag comment on its **own
> lines** immediately before the declaration or member. A comment on the *same line* as the opening
> `{` is not attached to anything by the TypeScript parser; CodeGen warns about such orphaned tags.

### What gets generated

1. **Exported structural Zod schema consts** (`<Entity>Entity_<Type>Schema`, module scope), used by the
   generated `Validate()` and available to consumers to `z.infer` / `safeParse` the object shape. The
   field's own column entry in `<Entity>Schema` **stays `z.any()`** exactly as for an untagged field:
   the column's value everywhere (`Get`, `GetAll`, `LoadFromData`, GraphQL, raw rows) is JSON *text*, so
   typing it as the interface would be a lie and would break anything that parses row data with the
   schema. The typed object view is the `<Field>Object` accessor. Opted-in declarations are always
   emitted with `export` (the exported consts name them).
2. A `Validate()` override (generalized: emitted when table CHECKs **or** opted-in JSON validators
   exist) that runs `super.Validate()`, table-CHECK validators, then for each opted-in field: the
   structural `safeParse`, then — only if the structure is valid — the tag and `@CHECK` rules.

A field is validated only when it is **dirty or the record is new**, so opting a type in never blocks
unrelated edits of existing rows. Invalid JSON text produces one clear error and skips the rest.
Errors carry path sources: `Configuration.Windows[2].EndHour`.

### Structural mapping

Supported: interfaces, type aliases, optional members, `string | number | boolean | null`, string /
number / boolean literal types and unions, arrays (`T[]`, `Array<T>`), nested and referenced local
types (recursion is handled lazily), `Record<string, T>`, index signatures, `unknown`/`any`, and
interface `extends`. Anything unsupported becomes a permissive schema for **that sub-tree only**
plus a CodeGen warning — CodeGen never fails the run over it. Output is deterministic.

### JSON-Schema-style tags

| Tag | Applies to | Effect |
|---|---|---|
| `@minimum` `@maximum` `@exclusiveMinimum` `@exclusiveMaximum` `@multipleOf` | number | numeric bound |
| `@minLength` `@maxLength` `@pattern` | string | length / regex |
| `@format email\|uri\|uuid\|date-time\|date` | string | format check |
| `@minItems` `@maxItems` `@uniqueItems` | array | size / uniqueness |

### `@CHECK` rules

Repeatable. Two forms:

* `@CHECK ts:(<TypeScript boolean expression>)` — compiled as written, no model involved. `value` is
  the object the tag is scoped to (see **Scope** below: on a scalar property that is the *enclosing*
  object, so write `value.EndHour >= 0`, not `value >= 0`); `row` is the owning entity (read only).
  `ts:` expressions are taken literally: null handling is yours. Each expression is type-checked
  against its value type at CodeGen time; one that does not compile is skipped with a CodeGen error.
* `@CHECK (<SQL boolean expression>)` — translated to TypeScript by the `CodeGen: JSON Check Parser`
  prompt exactly the way table CHECK constraints are, then cached (below). The model must also return
  `TestCases` (`{ Value, Row?, Expected }`); CodeGen **executes them** against the compiled body in a
  separate `vm` context with a time limit (microtasks included) and discards a translation that fails any, that returns none,
  or — when the value type has optional/nullable members — that has no case with such a member absent
  or null. The `vm` context is a correctness guard, **not a security boundary**: the same body is
  emitted into the entity class and runs in-process there, so review it like any generated code.

**Scope** mirrors SQL: on a **property**, names resolve against the enclosing object (like a column
CHECK); on an **interface**, the rule is object-level (like a table CHECK); on an **array-typed
property**, it is applied to **each element**. `row.<Column>` refers to the owning entity's columns.

**NULL semantics (SQL form).** A SQL CHECK passes when its predicate is UNKNOWN. The prompt tells the
model that generated code must pass when a referenced optional member is `null`/`undefined`.

```typescript
/**
 * @mjValidate
 */
export interface IWindow {
    StartHour: number;
    /**
     * @minimum 0
     * @maximum 23
     * @CHECK ts:(value.EndHour >= value.StartHour)
     */
    EndHour: number;
    Days?: string[];
}

/**
 * @mjValidate warn
 * @CHECK (StartHour < EndHour)
 */
export interface ISlot {
    StartHour: number;
    EndHour: number;
}
```

### Regenerating after a definition change

A JSONType definition lives in metadata, so editing it (members, `@mjValidate`, tags) changes no
database column. After `mj sync push`, run **`mj codegen --skipdb`** to re-emit the entity classes: a
full `mj codegen` only rebuilds schemas whose entities changed in its database phase (see
[CodeGen large-schema guide § dirty-schema scoped regen](CODEGEN_LARGE_SCHEMA_GUIDE.md)). The one
exception it handles itself: when a full run newly translates a SQL `@CHECK`, the entities bound to that
type are rebuilt in the same run.

### SQL `@CHECK` caching

Translations are stored in `__mj.GeneratedCode` under the category **`CodeGen: JSON Validators`**,
keyed by `JSONType name | property path | normalized check text | hash of the value's shape` (its
members' names, optionality and types) — **not** by entity field. A shared interface generates once;
editing the tag text (not merely re-flowing whitespace) or the members the rule sees regenerates, and two
entities declaring a same-named type differently get separate translations. A rule that reads
`row.<Column>` is also keyed by the owning entity, since its columns differ per entity. Reads
are unconditional, so `--no-ai` runs preserve committed validators; only *generation* is gated by the
`ParseCheckConstraints` feature. LLM output is emitted only after it passes a compile check (parses,
returns a value, no `${` placeholders, type-checks against the interface); otherwise the rule is
skipped with a CodeGen error — CodeGen never writes code that breaks the package build. Old cache
rows are left in place when a rule's text changes.

### Things to know

* **SQL→TS NULL semantics are NOT verified mechanically.** They are enforced by the prompt, the compile
  check, and the model's own `TestCases` (a self-consistency guard: the body must agree with the cases
  its author wrote, including an absent-optional case). That catches a body that does not do what its
  author says; it cannot prove the cases themselves match the SQL. **Review every translated rule in the
  PR that introduces it** — `GeneratedCode` rows in the `CodeGen: JSON Validators` category and the
  emitted `Validate()` body are both reviewable. Use `@CHECK ts:(…)` when you need exact semantics.
* `ValidateAsync` is out of scope: referential rules ("this ID exists") are not expressible.
* Inherited interface properties carrying rules re-key per derived declaration.
* Prefix rewriting of type names for opted-in types is AST-based, so tag bodies and member names
  that coincide with a type name are not corrupted.

---

## 3. Testing your JSONType

* Core behavior: `packages/MJCore/src/__tests__/baseEntity.jsonField*.test.ts`.
* Generated code: `packages/CodeGenLib/src/__tests__/entity-subclass-jsontype*.test.ts`.
* Live database: the `jsontype-live-sync` integration bundles (IT95 server, IT96 client wire), which
  prove edit → `Save()` → fresh load through a real provider.
