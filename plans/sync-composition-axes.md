# Metadata Sync + Loom: first-class composition axes

**Branch:** `an-dev-sync-composition-axes`  
**Status:** proposal, rev 2 (post-review) — one implementation phase, five PRs. Cheese is the test.  
**Owner:** MJ Core (`@memberjunction/core` + `@memberjunction/metadata-sync`) + Orders + Loom + more-cheese  
**Depends on:** Entity companions & graph save (`plans/base-entity-composite-graph.md`, shipped); Embedded records (`plans/embedded-records.md`); IsA parent/child on `BaseEntity`

This is **one phase**, not a staged rollout. Five PRs land together:

| PR | Repo | Job |
|---|---|---|
| **MJ core** | MemberJunction/MJ | **Prospective subtype resolution** — `EntitySubtypeResolver` via `ClassFactory`, `Entity.SubtypeSelector`, `BaseEntity.ResolveSubtypeEntityName()` / `EnsureISAChild()` (§4.4). Dependency for everything below |
| **MJ sync** | MemberJunction/MJ | First-class `collections` / `embeds` / `extension` in mj sync JSON; graph apply then one Save. **No discriminator logic** |
| **Orders** | bizapps-orders | Register one resolver (or just declare the selector); delete the six re-derivations of the same rule |
| **Loom** | Loom | Domain `composition` + emit that JSON; validate IsA/collections/embeds from `SubtypeSelector` metadata |
| **Cheese** | more-cheese | World model uses the new shape; **this PR is the test** (workshop order shows Event details / Person = ShipTo; no SQL IsA inserts) |

Loom is the producer. MJ is the consumer. Cheese proves both. Event Order Lines are an exemplar, not a one-off.

> **What changed in rev 2, in one line:** conditional IsA turned out not to be a sync feature at all — it is the missing *prospective* half of MJ's IsA axis (§2.1), so resolution moves into core, six copies of the rule in Orders collapse to one, and `@memberjunction/metadata-sync` stops needing to know that `ProductType` exists. Full rationale in §11.

---

## 1. What mj sync JSON is today

A record is `RecordData` (`packages/MetadataSync/src/lib/sync-engine.ts`):

```ts
interface RecordData {
  primaryKey?: Record<string, any>;
  fields: Record<string, any>;
  relatedEntities?: Record<string, RecordData[]>;  // keyed by entity name
  sync?: { lastModified: string; checksum: string };
  deleteRecord?: { delete: boolean; deletedAt?: string; notFound?: boolean };
}
```

Reserved keys: `fields`, `relatedEntities`, `primaryKey`, `sync`, `__mj_sync_notes`, `deleteRecord`.

`relatedEntities` is the only nesting. Example (Actions → Action Params):

```json
{
  "fields": { "Name": "Issue Portal Magic Link" },
  "primaryKey": { "ID": "76A41213-…" },
  "relatedEntities": {
    "MJ: Action Params": [
      {
        "fields": {
          "ActionID": "@parent:ID",
          "Name": "SessionID"
        },
        "primaryKey": { "ID": "6761E4F1-…" }
      }
    ]
  }
}
```

Push **flattens** that tree into independent `FlattenedRecord`s (`record-dependency-analyzer.ts`). Nested rows share a `graphId` so they use one provider/TX (PR #4290). Each flattened row is still:

1. `GetEntityObject(entityName)`
2. `Set` each field (`@lookup` / `@parent` / `@file` resolved)
3. `entity.Save()`

The parent object is **not** holding the child when the child saves. `@parent:ID` is a string substitution from batch context after the parent save. `ParentID` in JSON is an ordinary field (self-FK on categories, AI runs, etc.) — it is **not** IsA.

Pull’s `relatedEntities` config is the inverse: extra RunViews keyed by FK, stuffed back under `relatedEntities` by **entity name**.

That design predates the three BaseEntity composition axes. It is correct for **lookup children with their own PK** (Action Params, Prompt Models). It is the wrong machine for IsA, collections, embeds, and **conditional** subtypes.

---

## 2. The three axes already on BaseEntity (runtime)

Documented in `plans/embedded-records.md`. Sync does not use them.

| Axis | Join | Save order | Declared on | Runtime API |
|---|---|---|---|---|
| **IsA** | Shared PK; child table is leaf columns only | Root then leaf | `Entity.ParentID` | `InitializeParentEntity` / `FindISAChildEntities`; Orders also `line.Extension.EnsureEntity` + `persistExtension` |
| **Related collection** | FK **on the child** | Owner first, stamp child FK | `EntityRelationship.RelatedRecordCollection` | `order.Lines.Create()` / `Load()` / `Remove()` |
| **Embedded** | FK **on the owner** | **Peer first**, stamp owner FK | `EntityField.EmbeddedRecord` | `order.ShipToAddressID_Object` / `_EnsureObject()` |

Lookups (`EventOrderLine.PersonID → Person`) stay FKs. They are not composition.

### 2.1 IsA today is **retrospective only** — and that is the whole gap

This is the fact the rest of the plan turns on, so it is stated before the JSON.

MJ already models the IsA *shape*. `Entity.ParentID` is set for both Orders cases today — `bizapps-orders/migrations/V202607061432__v0.1.x__Tables_and_Objects.sql:51334` (Event Products → Products) and `:51340` (Event Order Lines → Order Lines). So `EntityInfo.ChildEntities` (`entityInfo.ts:2717`) and `IsParentType` (`:2765`) already resolve, generically, with no app knowledge.

The two directions are asymmetric:

| Direction | Resolved by | When | Works for a **new** record? |
|---|---|---|---|
| child → parent (`InitializeParentEntity`) | metadata `Entity.ParentID`, at `GetEntityObject` time | construction | ✅ |
| parent → child (`InitializeChildEntity`) | `FindISAChildEntity` — a **UNION ALL data probe** over `ChildEntities` (`databaseProviderBase.ts:681`) | after `Load()`, PK required | ❌ nothing to probe |

So on an **existing** line, core already does the whole job: probe finds the `EventOrderLine` row, `createAndLinkChildEntity` chains it, `line.ISAChild` is a live `EventOrderLineEntity`. **Zero new code needed for that path**, and it is already generic over one child or many (`FindISAChildEntities`).

On a **new** record there is no row to probe. Worse than returning null: `createAndLinkChildEntity` **explicitly unlinks and bails when `InnerLoad` returns false** (`baseEntity.ts:1456-1461`) — hand it the correct entity name today and it still discards the child, because that path was written for discovery, not creation.

**Conditional IsA is therefore not a fourth axis and not a new runtime mechanism. It is the missing prospective half of an axis MJ already has**: nothing can answer *“which subtype **should** this record have?”* the way `FindISAChildEntity` answers *“which subtype **does** exist?”*

And with `ChildEntities.length === 1` on both Order Lines and Products, the question is narrower still. It is not *selection among N*; it is **existence** — a t-shirt line has no extension, a workshop line does. That degrades cleanly:

| Case | Answer | Config needed |
|---|---|---|
| `ChildEntities.length === 0` | no subtype | none |
| exactly one child, unconditional (Company → Accounting Company Profile) | that one | **none** |
| conditional existence, or more than one child | needs a rule | ← the only real gap |

### 2.2 Because core cannot answer it, every consumer re-derives it

The rule “read `ProductType.OrderLineExtensionEntity` off the product, then `EnsureEntity(name)`” exists in **six places in bizapps-orders alone**: `CheckoutSessionService.ts:527`, `:927`, `:1343`; `order-lines-editor.component.ts:165, 395, 465-471, 492, 510`. And the drift has already happened — `product-form.component.ts:91` reads the metadata column, hardcodes the expected value `'MJ_BizApps_Orders: Event Products'`, **and** falls back to string-matching the type name:

```ts
return typeName.toLowerCase().includes('event') || typeName.toLowerCase().includes('conference')
    || typeName.toLowerCase().includes('summit') || this.record?.ISAChild != null;
```

A second product extension type silently misfires that getter today. Implementing §4.2 as a ladder inside `@memberjunction/metadata-sync` would make sync **copy #7**, and would put the app-specific column names `ProductExtensionEntity` / `OrderLineExtensionEntity` into MJ core, which is clean of them today. §4.4 is the fix.

---

## 3. The gap

| What we have | What happens on push | What the runtime needs |
|---|---|---|
| Nested `relatedEntities` | Flatten → separate `GetEntityObject` + `Save` | Child attached **on the parent object** before `Save` |
| Shared PK + sibling file/dir | Two records, two Saves; IsA parent not wired | `EnsureEntity` / IsA child on the **same instance**, then one graph Save |
| SQL `INSERT` into `EventOrderLine` | Row in table/view; companion never built | Form hydrates `line.Extension` via `InnerLoad` **and** future saves go through `persistExtension` |
| `@parent:ID` | String after parent is already saved | Collection `Create()` stamps FK; IsA copies parent PK; embed does not use `@parent` at all |
| A **new** record that should carry a conditional IsA child | Nothing — the probe has no row to find, and `createAndLinkChildEntity` unlinks on `InnerLoad` miss (`baseEntity.ts:1456-1461`) | A **prospective** resolver: “which subtype should this record have?” (§4.4) |

Cheese Event Order Lines showed this: 7,714 rows in `vwEventOrderLines`, order form still empty, because the object graph the form uses was never constructed.

Loom’s delivery invariant (metadata JSON → `mj sync push`, no SQL) is the right one. The JSON and the pusher have to speak composition, or Loom will keep emitting sibling tables.

---

## 4. Proposed JSON (additive)

Keep `relatedEntities` **unchanged** for independent children with their own identity (Action Params). Add three reserved keys that mean “apply onto the live object, then save the graph once.”

```json
{
  "primaryKey": { "ID": "3DBE87DE-…" },
  "fields": {
    "OrderNumber": "ORD-E-REG-…",
    "Status": "Confirmed",
    "CompanyID": "E8A1D92C-…",
    "BillToPersonID": "71E5C046-…",
    "ShipToPersonID": "71E5C046-…"
  },
  "embeds": {
    "ShipToAddressID": {
      "fields": {
        "AddressLine1": "12 Affineur Way",
        "City": "Madison",
        "StateProvince": "WI",
        "PostalCode": "53703"
      }
    }
  },
  "collections": {
    "Lines": [
      {
        "primaryKey": { "ID": "5F62834D-…" },
        "fields": {
          "ProductID": "@lookup:MJ_BizApps_Orders: Products.SKU=PROD-EVT-WORKSHOP",
          "Quantity": 1,
          "UnitPrice": 150
        },
        "extension": {
          "fields": {
            "PersonID": "@owner:ShipToPersonID"
          }
        }
      }
    ]
  }
}
```

Product with a type extension:

```json
{
  "primaryKey": { "ID": "24ABF9A9-…" },
  "fields": {
    "SKU": "PROD-EVT-WORKSHOP",
    "Name": "Workshop Registration",
    "ProductTypeID": "@lookup:MJ_BizApps_Orders: Product Types.Code=Event"
  },
  "extension": {
    "fields": {
      "EventStartsAt": "2026-11-19T12:00:00.000Z",
      "VenueName": "ICF Workshop",
      "Capacity": 40,
      "RequiresAttendeeInfo": true
    }
  }
}
```

Unconditional IsA (profile **is** the company):

```json
{
  "primaryKey": { "ID": "E8A1D92C-…" },
  "fields": { "Name": "International Cheese Federation" },
  "extension": {
    "fields": {
      "EntityType": "LegalEntity",
      "CompanyCode": "ICF",
      "FunctionalCurrencyCode": "USD"
    }
  }
}
```

### 4.1 Key semantics

| Key | Map | Child identity |
|---|---|---|
| `collections` | Collection **property name** (`Lines`), not entity name | Child has own PK; FK on child set by `Create()`, not by authoring `@parent:ID` |
| `embeds` | Owner **FK field** (`ShipToAddressID`) | Peer has own PK; owner FK stamped after peer exists |
| `extension` | Conditional or unconditional IsA / companion | **Shared PK with owner.** JSON does **not** invent a new ID. Two accepted forms — see below |

**Collection membership semantics live in `.mj-sync.json`, not in the record file** — `upsert`
(default) or `authoritative`, declared per collection. A record file's `collections` value is always a
**bare array**; there is no per-record mode wrapper. Full rules and riders: §8.1(a).

`extension` accepts **two shapes**, because MJ supports both disjoint and overlapping subtypes and the singular form cannot express the latter:

```json
// shorthand — disjoint. Type resolved per §4.2.
"extension": { "fields": { … } }

// explicit map — the key IS the assertion. Required for overlapping subtypes
// (Entity.AllowMultipleSubtypes = true), where _childEntities is a LIST and
// ISAChild returns null (baseEntity.ts:1060-1071).
"extension": {
  "MJ_BizApps_Common: Members":  { "fields": { … } },
  "MJ_BizApps_Common: Speakers": { "fields": { … } }
}
```

The map form subsumes the old `"entity"` assertion key, which is therefore **not** introduced. Disambiguation is positional: a child object containing `fields` is the shorthand; anything else is read as an entity-name map. **Pull always emits the map form when the owner is an overlapping parent, and the shorthand otherwise** — never “map only when currently ambiguous,” which would silently rewrite a file whenever an unrelated app adds a subtype.

`bizapps-common`'s `Person` is the family's IsA parent and `bizapps-sales` KI-1 already tracks flipping it to `AllowMultipleSubtypes = true`. Reserving this shape now is free; changing it later is breaking.

`extension.fields` are **leaf-owned columns only**. Inherited Order Line / Product columns do not belong here. Sync must reject them (same rule as `SelectSimpleExtensionFields` using `ParentEntityFieldNames`).

New `@owner:Field` (and keep `@parent` / `@root` for `relatedEntities`): read from the **in-memory owner object** this node is attached to, not from batch context after a prior Save. `@owner:ShipToPersonID` on a line extension is the header’s ShipTo, because the line’s owner in a nested `collections.Lines[]` is the header. For a nested extension, `@owner` is the line; `@root` is the JSON-root entity.

### 4.2 Resolving `extension` (conditional IsA)

**Sync does not resolve this. It asks core.** After `fields` are applied, push calls `owner.ResolveSubtypeEntityName()` (§4.4) and passes the answer to `owner.EnsureISAChild(name)`. `@memberjunction/metadata-sync` contains **no** discriminator ladder and names **no** app columns.

Core's resolution order, once, for every consumer — sync, the Angular line editor, checkout, CodeGen, agents:

1. **Explicit map key.** `extension` in the entity-name map form (§4.1) — the key is the answer, asserted against metadata (must be a declared IsA child of this entity, else fail loud).
2. **Registered resolver**, if one is registered for this entity — `ClassFactory` key = entity name (§4.4). Wins over the metadata selector, so an app can override a shipped rule without a migration.
3. **`Entity.SubtypeSelector`** metadata path, if declared (§4.4).
4. **Exactly one child, no selector, no resolver** ⇒ that child. Unconditional IsA (Company → Accounting Company Profile) needs **no configuration at all**.
5. **Otherwise** `null` ⇒ no subtype. `extension` present in the JSON is then a **hard error**, naming the entity and what it checked.

Steps 1–3 returning empty string / null also mean “no subtype,” and `extension` present is the same hard error. A resolver or selector that returns an entity which is **not** a declared IsA child of the owner is a hard error, not a silent skip.

**The inverse is a warning, not an error**: a selector resolves a subtype and the JSON has no `extension`. That is the cheese bug expressed at validate time — the one check that would have caught it before the push instead of in the UI — but a partial seed is a legitimate thing to author, so it must not block.

### 4.3 Consistency check the retrospective half enables

Because core now has *both* halves, on `Load()` it can compare them: the probe found child `X`, the selector resolves `Y`. Today nothing can even notice — a Product whose type changed after its extension row was written is undetectable. With both, it is a reportable inconsistency.

Scope for this phase: **detect and surface, never auto-repair.** `mj sync validate` reports it; push does not silently delete or re-point an extension row. Auto-migration of a flipped discriminator is explicitly out of scope (§10).

### 4.4 Core framework additions (MJ, `@memberjunction/core`)

Two layers, because the two have different reach and both are needed.

**Layer 1 — declarative: `Entity.SubtypeSelector` (new nullable JSONType column on `__mj.Entity`).**

```jsonc
// Entity 'MJ_BizApps_Orders: Order Lines'
{ "Path": "ProductID.ProductTypeID.OrderLineExtensionEntity" }
// Entity 'MJ_BizApps_Orders: Products'
{ "Path": "ProductTypeID.ProductExtensionEntity" }
```

A dotted FK-dereference path ending at a column whose **value is an MJ entity name**. Empty / null ⇒ no subtype.

This layer is not optional, and the reason is reach, not taste: **a registered resolver only exists where app code is loaded.** That is the Angular UI ✅ and MJAPI ✅ and `mj sync push` ✅ (via `dynamicPackages`). It is **not** Loom — a generator with no MJ runtime, which §7 requires to validate “child exists iff `when`” — and it is not CodeGen. A code-only answer serves the consumers in this plan and leaves the producer blind.

**Layer 2 — runtime override: `ClassFactory`, keyed by entity name.** No bespoke registry; MJ already resolves behavior this way.

```ts
// @memberjunction/core
export abstract class EntitySubtypeResolver {
    /** Sync return is FIRST-CLASS, not a convenience — see the N+1 note below. */
    public abstract Resolve(record: BaseEntity): string | null | Promise<string | null>;
}

// @mj-biz-apps/orders-entities — the SHARED package, so browser and server both get it
@RegisterClassEx(EntitySubtypeResolver, {
    key: 'MJ_BizApps_Orders: Order Lines',
    metadata: { entity: 'MJ_BizApps_Orders: Order Lines', kind: 'subtype-selector' },
})
export class OrderLineSubtypeResolver extends EntitySubtypeResolver { … }
```

Three notes that are load-bearing:

- **Dispatch on the `key`, not on `metadata`.** `GetRegistration` is memoized per `baseClassName|normalizedKey` (`ClassFactory.ts:101`), so keyed lookup is O(1) on a hot path. `metadata` is for *discovery* only (`GetAllRegistrationsByMetadata`) so tooling can enumerate which entities have a resolver.
- **Resolve with `TryCreateInstance`, never `CreateInstance`.** `CreateInstance` falls back to `new BaseClass(...)` for an unregistered key (`ClassFactory.ts:50-54`) — on an abstract base that is exactly the documented trap. “No resolver registered” must be an explicit miss, not an instance that answers wrongly.
- **`priority` gives override-an-app's-rule for free**, and registration is a side effect of import, so the anti-tree-shaking manifest already covers it.

**The two public methods on `BaseEntity`** — a thin facade over the above, so callers never touch `ClassFactory` directly:

```ts
/** Prospective counterpart to FindISAChildEntity. Order per §4.2. Null = no subtype. */
public async ResolveSubtypeEntityName(): Promise<string | null>;

/**
 * Create-safe. Unlike createAndLinkChildEntity, does NOT unlink when InnerLoad
 * finds no row — that is the create case. Idempotent. Defaults to
 * ResolveSubtypeEntityName() when no name is passed.
 */
public async EnsureISAChild(entityName?: string): Promise<BaseEntity | null>;
```

`EnsureISAChild` is what makes step 5 of §5 implementable at all: `replaceChildParentChain` is **private** (`baseEntity.ts:1503`), so no package outside `MJCore` can wire a shared-PK child today, and the only existing path that does discards the child on the create case.

**Performance — design for it now, not after.** Resolution is per record. Cheese is 17,075 order lines × (Product → ProductType); async-only would guarantee an N+1 in exactly the bulk path this feature exists to serve. Therefore:

- `Resolve` **may return synchronously**, and core must not wrap every call in an await-chain that defeats that.
- The built-in `Path` walker prefers `BaseEngineRegistry.FindCachedEntity()` — the same mechanism `RelatedRecordCollection` uses for `Source: 'cache'` — degrading to a query on a miss. ProductTypes is tiny and cheese has 16 Products; this should cost zero queries.
- Core memoizes per (entity, FK value) for the life of a push run.

**This is a core capability, not an Orders workaround.** It is what makes MJ's ORM able to say “this record is of type X because the data says so,” in the browser and on the server, from one declaration — which server-only ORMs do not do.

### 4.5 Old `relatedEntities`: **diagnose, never re-route**

Earlier drafts had push silently reinterpret a `relatedEntities` payload as an `extension` or a collection when the shape matched. That is implicit migration: files that push correctly today would change transaction boundary and `RecordChange` output on upgrade, with no opt-in and no message — and the second rule made an app adding a `DeclareRelatedRecords` change how unrelated metadata files push.

**Push behaviour follows what the file says. Full stop.** Existing `relatedEntities` keeps today's independent `GetEntityObject` + `Save` + `@parent:ID`, forever, unchanged.

The detection is still worth having — as a **diagnostic**, in `mj sync validate` and as a push warning:

- child `primaryKey` equals parent PK **and** `Child.ParentID` is this entity → *"`relatedEntities['X']` looks like an IsA child (shared PK). Use `extension` — see §4.1."*
- a `RelatedRecordCollection` exists whose related entity is that child → *"…could be `collections['Lines']`."*

Author changes the file; the machine never changes it for them. If auto-adoption is ever wanted it gets an explicit `.mj-sync.json` flag and logs every record it touched.

---

## 5. Push: apply onto the object, then one Save

For a JSON **root** that uses `collections` / `embeds` / `extension` (or inferred composition):

1. `GetEntityObject` / load-or-new as today (graph-scoped provider).
2. `Set` `fields`.
3. **Embeds** (peer first): for each `embeds[fkField]`, `{fkField}_EnsureObject()`, recurse apply, do **not** Save the peer yet — `EntitySavePlan` already orders embed-before-owner.
4. **Collections:** `owner.Lines.Create()` (or load existing by PK into the collection), recurse apply on the child entity. Do **not** `child.Save()` here.
5. **Extension:** `const child = await owner.EnsureISAChild(name?)` (§4.4), then `Set` the leaf fields on `child`. Still no independent Save.

   That is the whole step. Sync does **not** branch on `OrderLineEntity`, does **not** duck-type an `Extension` property, and does **not** know that `OrderLineExtensionCompanion` exists — all three would put an app convention inside `@memberjunction/metadata-sync`. `null` from `EnsureISAChild` when the JSON supplied an `extension` is a **hard error**, never a skip; a silent skip is the original bug (rows land, Save succeeds, form empty).
6. **`await owner.Save()` once.** Companions / `persistExtension` / collection plan persist the graph. RecordChange, validation, and IsA parent hydration run.

`relatedEntities` that remain “independent children” still flatten to later levels on the same `graphId` (Action Params). Mix is allowed: an Action can have `relatedEntities` Params **and** someday a collection.

Dirty detection: graph Save is dirty if the owner **or any attached companion** is dirty (already true on `EntitySavePlan`). Checksums stay per JSON record; extension/collection/embed bytes participate in the root checksum so a PersonID-only change on the line extension still pushes.

Dry-run: build the object graph, skip Save, still register batch context for `@owner` / `@parent`.

### 5.1 What PushService must not do

- Flatten `extension` / `collections` / `embeds` into sibling `FlattenedRecord`s that `GetEntityObject`+`Save` themselves.
- SQL-insert IsA tables.
- `GetEntityObject('Event Order Lines')` as if it were unrelated to the line.
- Require authors to put inherited virtuals (`OrderHeaderID`, `Quantity`, …) on the extension payload.
- Name **any** app column, entity, or companion class. `ProductExtensionEntity` / `OrderLineExtensionEntity` / `Extension` must not appear anywhere in `@memberjunction/metadata-sync` or `@memberjunction/core`. Core is clean of them today; §4.4 is what keeps it that way.
- Silently ignore an unrecognised top-level key. `json-write-helper.ts:42` hardcodes `knownKeys` and preserves unknown keys as-is, and `ValidationService` only checks that `fields` exists (`:254-265`) — so `"colections"` pushes green and does nothing, which is the same green-run failure this plan exists to fix. The three new keys go in `knownKeys`, **and** `validate` rejects unknown top-level keys with a did-you-mean (the codebase already does this for `field` → `fields` at `ValidationService.ts:264`).

---

## 6. Pull

Pull writes the same shape it reads.

- Collections: if `RelatedRecordCollection` is declared, emit `collections[Name]` from `owner.Lines` (load explicit collections). Do not also dump those rows as a sibling entity directory unless the entity is also a sync root.
- Extension: if an IsA child exists (or companion is configured and `InnerLoad` succeeds), emit `extension.fields` (leaf only). Include `"entity"` when more than one child type is possible.
- Embeds: emit `embeds[fkField]` from `{Field}_Object` when loaded / present.
- Continue emitting `relatedEntities` for relationships that are **not** collections (Prompt Models, Action Params).

Checksums: hash `fields` + composition payloads, excluding `sync`.

Two rules the bullets above leave open:

- **Round-trip is a test, not an intention.** `pull` after `push` of the same file must produce byte-identical composition (modulo `sync`). Without it enforced, the same relationship ends up as `relatedEntities` in some repos and `collections` in others, permanently, because nobody rewrites working metadata.
- **No double ownership.** An entity is a collection member **or** its own sync root, never both — otherwise the same row is writable from two files and push resolves it last-writer-wins with no complaint. Cheese's `order-lines/` is a sync root with 17,075 records today, so this decides §8.1(b). `validate` must reject a `primaryKey` claimed by two files. And a `Load: 'never'` collection must be **skipped with a stated reason** on pull, never emitted as `[]` — an empty array is indistinguishable from "no lines" and would delete them on the next push under authoritative mode.

---

## 7. Loom (producer contract — implemented in Loom, consumed here)

Loom domain grows a `composition` block that **maps onto this JSON**, not onto SQL:

- `isA` + optional `when` path (e.g. `ProductType.OrderLineExtensionEntity` equals this entity’s MJ name) → emit `extension` on the parent record, shared PK, leaf fields only. Causal rules (PersonID := Order.ShipToPersonID) stay Loom `relationalRules`.
- `collections` → emit `collections[Name]`.
- `embeds` → emit `embeds[fkField]`.
- Ordinary FKs stay `fields` + `@lookup`.

`createDomainConfigFromMJEntities` must read `ParentID`, `RelatedRecordCollection`, `EmbeddedRecord`, and **`Entity.SubtypeSelector`** (§4.4) so cheese `domain.json` adds almost nothing. It must **not** read `ProductType.OrderLineExtensionEntity` directly — that is the app column the selector exists to abstract, and hardcoding it in Loom recreates the divergence in the producer.

**Loom is why the selector must be metadata and not only a registered resolver.** Loom has no MJ runtime, so it cannot execute an `EntitySubtypeResolver`; it can only read `__mj.Entity`. An entity whose subtype rule lives *only* in a registered resolver is one Loom cannot validate — that must be a **named, explicit** Loom warning ("subtype rule for X is runtime-only; cannot validate"), never a silent pass.

Two consumers in Loom that this plan previously did not mention, and both fail quietly:

- **`readEntityMetadata()` (`packages/engine/src/emitters/metadata.ts:196`) is the accumulation read path.** It requires `{ primaryKey, fields }` and flattens by spread — a record carrying `extension`/`collections`/`embeds` still has both keys, so it will not throw; it will **silently drop the composition**, and the next accumulation cycle diverges on rows it cannot see. Fail loud first, then support the keys.
- **`checkpoint.json.activeEntityIds` is keyed by entity name** (`packages/contracts/src/state.ts:6`). Any child that stops being emitted as its own entity directory must still register its IDs there, or continuity loses them and the next cycle re-mints. Part-file chunking (5,000 records per entity) has the same problem: nesting moves chunking to per-root and every boundary shifts.

If cheese keeps order lines as a flat sync root (see §8.1), none of these three arise.

Also state what happens when `domain.json` and MJ metadata **disagree** (domain says `isA`, metadata has no `ParentID`). Generating confidently-wrong composition against a stale metadata snapshot is this contract's most expensive failure, because the output is well-formed and MJ's fail-loud only fires at push, long after 20 MB has been regenerated. Loom must fail at load, not emit.

Loom still does not call `BaseEntity.Save` during generation. Intelligence is: **the emitted graph is the runtime graph**, so this push path can `EnsureEntity` / `Lines.Create` / `_EnsureObject` and Save once.

Validation in Loom (not MJ): IsA child PK = parent PK; child exists iff `when`; collection FK/sequence; required embed present. MJ push still fail-loud if metadata disagrees.

---

## 8. One phase, five PRs

No MJ-only slice, no “Loom later,” no cheese SQL leftover. Implement the full contract in one go:

**MJ core PR** (new, and it is the dependency for everything else) — `EntitySubtypeResolver` + `ClassFactory` seam, `BaseEntity.ResolveSubtypeEntityName()` / `EnsureISAChild()`, `Entity.SubtypeSelector` column + migration + CodeGen + `EntityInfo` accessor, cached path walker. **§10's old claim that no IsA runtime API changes was wrong** — this completes the prospective half of an axis that only ever shipped its retrospective half.

**MJ sync PR** — `RecordData` keys, push graph apply (embeds, collections, `extension` via `EnsureISAChild`), pull emits the same shape, `validate` rejects unknown top-level keys, `relatedEntities` diagnostics (§4.5), unit tests in §9. Contains **zero** discriminator logic.

**Orders PR** (new) — register one `OrderLineSubtypeResolver` / `ProductSubtypeResolver` (or just declare `SubtypeSelector` and register nothing), then delete the six re-derivations: `CheckoutSessionService.ts:527/927/1343` and `order-lines-editor.component.ts`. `product-form.component.ts:91`'s `HasEventExtension` — hardcoded entity name plus `includes('event')`/`'conference'`/`'summit'` string matching — goes away entirely; it is drift that already happened. While in there, `CheckoutSessionService.ts:532` uses `md.Entities.find(e => e.Name === …)` where the case- and whitespace-insensitive `EntityByName` is required.

**Loom PR** — `composition` on the domain contract, generate/emit/validate per §7, `createDomainConfigFromMJEntities` reads MJ metadata. Emits only the new JSON (no sibling IsA directories, no SQL).

**Cheese PR** — `domain.json` + generated metadata in the new shape; delete `scripts/emit-catalog-completeness.mjs` IsA dumps and any `EventOrderLine` SQL. **This PR is the integration test:** `mj sync push` of cheese generated data, then Explorer: workshop order Event details, Person = ShipTo, confirm still books. If cheese fails, none of the three merge. **Scope per §8.1(b): `collections`/`embeds` on `committee-meetings`, `extension` flat on `order-lines`. Orders are not nested.**

Product **prices** stay a normal entity (`ProductPrice` is not IsA). They can remain `relatedEntities` or become a collection if Orders declares one.

Stack them: **MJ core → MJ sync → Loom → cheese**, with Orders landing any time after MJ core. Reviewed as one change; cheese does not ship until the rest are on the same bits.

### 8.1 Resolved decisions (rev 3) — the builder has no discretion here

Both questions rev 2 left open were the plan owner's to call. They are answered. A builder implements
these as written; neither is a default to be re-litigated at the keyboard.

#### (a) Collection membership: `upsert` by default, `authoritative` opt-in, mode declared in `.mj-sync.json`

**There are two modes, not three.** Rev 2 framed this as authoritative vs additive, but "additive" was
hiding two different things: additive-*with*-load (match by PK, upsert, leave unlisted rows alone —
idempotent) and additive-*without*-load (blind append — duplicates on every push). The second is not a
mode anyone would choose; it is the bug. The real choice is `upsert` vs `authoritative`.

| mode | loads the collection | rows listed in the file | rows in the DB but absent from the file |
|---|---|---|---|
| `upsert` (**default**) | yes | inserted or updated | **left alone** |
| `authoritative` (opt-in) | yes | inserted or updated | **deleted**, via the Phase-0 audit |

**`upsert` is the default for two reasons.** The failure modes are asymmetric: authoritative-wrong is
silent data loss needing a restore, while upsert-wrong is duplicates — visible in the data and
recoverable. Default to the recoverable failure. And `upsert` is what `relatedEntities` does today, so a
file moving from `relatedEntities` to `collections` is behavior-preserving. That matters because §4.5
already forbids silently re-routing the old key: if the two carried different membership semantics, any
later migration between them would become a data-loss event.

**The mode is declared per collection in `.mj-sync.json`, never in a record file.** Membership semantics
are a property of the *relationship*, not of any one record. A per-record mode lets two files describing
the same collection disagree — which is incoherent — and lets a hand-edit escalate a single file into a
delete. Record files therefore keep `collections` values as **bare arrays**; there is no per-record
`{ "mode": …, "items": [ … ] }` wrapper.

```json
// .mj-sync.json for the orders directory
{
  "entity": "MJ_BizApps_Orders: Orders",
  "collections": {
    "Lines":    { "mode": "upsert" },
    "Payments": { "mode": "authoritative" }
  }
}
```

Five riders, all required:

1. **`deleteRecord` inside a collection item works in both modes.** This is the load-bearing piece: if a
   file can say "delete this one" explicitly, it rarely needs "delete everything I did not mention,"
   which is what keeps `authoritative` rare rather than routine.
2. **Authoritative-implied deletes route through the Phase-0 deletion audit + confirmation**
   (`PushService.ts:2117`), and the confirmation **names the collection and the row count**. An implied
   delete is more dangerous than an explicit one, so it cannot carry less ceremony.
3. **Bulk rail.** `authoritative` refuses when the computed delete set exceeds
   `maxImpliedDeletePercent` (default **20%**) of the loaded collection, unless `--allow-bulk-delete` is
   passed. A file that is empty or drastically short is nearly always a generator bug, not an intent to
   delete thousands of rows.
4. **`Load: 'never'` fails loud under both modes.** No special case is needed: both modes require the
   loaded set — `upsert` to match PKs, `authoritative` to compute the delete set. It must never fall
   through to append.
5. **An unknown `mode` value is a `validate` error**, never a silent fallback to the default.

#### (b) Cheese is the full gate, and the nesting is scoped

Cheese proves **all three keys on real generated data** — no synthetic fixture stands in for any axis.
It does that without nesting the orders path. Measured from `more-cheese/generated`:

| cluster | roots | children | on disk |
|---|---|---|---|
| `orders` → `order-lines` | 15,420 | 17,075 | 20.5 MB |
| **`committee-meetings`** → agenda-items / attendance / motions / votes | **294** | 4,216 | **1.4 MB** |
| `form-responses` → `form-answers` | 869 | 2,760 | 1.3 MB |
| `events` → `event-registrations` | 98 | 16,875 | 5.8 MB |

- **`collections` + `embeds` → `committee-meetings`.** Better than orders on the merits, not merely
  cheaper: it is a **multi-child** composition — four distinct collections under one root — where orders
  is a single-child nest, and the ownership is unambiguous. Nobody edits an agenda item independently of
  its meeting, which is exactly the question `collections` vs `relatedEntities` exists to answer. 294
  roots against 15,420 is 52× fewer graphs. `form-responses` → `form-answers` is the second case if a
  single-child shape is wanted alongside it.
- **`extension` → `order-lines`, flat, at its full 17,075 rows.** That is the axis that fixes the
  reported bug — Event Order Line is an IsA child of Order Line — and it needs no nesting whatsoever.
- **Orders are not nested.** Folding line bytes into an order's root checksum makes a one-line edit
  re-push a whole order, which defeats `--incremental`.
- **Do not reach for `events` → `event-registrations`.** It looks like the obvious nest and is not: 98
  roots holding 16,875 registrations is ~172 children per root — semantically a clean composition,
  pathological in shape. Fan-out decides, not ownership alone.


---

## 9. Tests (MJ)

- Order header JSON with `collections.Lines[]` + `extension.fields.PersonID` → mock `OrderLineEntity.Extension.EnsureEntity` called with `MJ_BizApps_Orders: Event Order Lines` **before** `Save`; child `ID` equals line `ID`; **no** second `GetEntityObject`+`Save` for the child.
- Product JSON with `extension` and ProductType Event → `Event Product` companion/IsA attached before Product `Save`.
- Company JSON with `extension` → Accounting Company Profile, shared PK, no “Name cannot be null” parent-create (the Company object **is** the parent).
- Header `embeds.ShipToAddressID` → address `EnsureObject` before header Save; FK stamped.
- Action + `relatedEntities` Params still independent-saves (regression).
- `extension.fields.Quantity` (parent-owned) rejected.
- Product type with null `OrderLineExtensionEntity` + `extension` in JSON → error.
- `@owner:ShipToPersonID` resolves from header in memory, not batch context after Save; `@owner` with no owner (root level, or inside `relatedEntities`) is an error, not `undefined` written as null.

**Core (`@memberjunction/core`), §4.4:**

- `EnsureISAChild` on a **new** owner with no existing child row **keeps the link** — the direct regression against `createAndLinkChildEntity`'s unlink-on-`InnerLoad`-miss (`baseEntity.ts:1456-1461`).
- `EnsureISAChild` is idempotent: twice → one child instance, same object.
- Resolution order (§4.2): map key > registered resolver > `SubtypeSelector` > single-child > null. A registered resolver overrides a declared selector.
- Unregistered key resolves to an explicit miss — asserts `TryCreateInstance` is used, **not** `CreateInstance` (which would return `new EntitySubtypeResolver()` per `ClassFactory.ts:50-54`).
- A resolver returning an entity that is not a declared IsA child of the owner → hard error.
- A **synchronous** `Resolve` is not wrapped into an extra microtask per record; the `Path` walker issues **zero** queries when the target entity is in a loaded `BaseEngine` cache.
- Overlapping parent (`AllowMultipleSubtypes = true`): the map form attaches N children; the shorthand form errors with a message naming the map form.

**Failure and idempotency — the class of bug this plan exists to fix:**

- **Re-push idempotency.** Push the same file twice → zero changes, no duplicate collection rows, no churned child IDs, stable `sync.checksum`. Highest-value test in the set.
- Unknown top-level key (`"colections"`, `"extensions"`) → `validate` error with a did-you-mean, not a green no-op push.
- Selector resolves a subtype, JSON omits `extension` → **warning**; JSON has `extension`, selector resolves null → **error**.
- Deletion: item removed from `collections.Lines[]`; `deleteRecord` inside a collection item; collection-implied deletes still hit the Phase-0 audit + confirmation.

**Collection membership (§8.1(a)) — every one of these is a silent-failure guard:**

- `upsert` (default): DB has 5 lines, file lists 2 → both updated, **3 untouched**, **zero** deletes issued.
- `authoritative`, same file → 3 deleted, and the delete set reaches the Phase-0 audit with the
  collection name and the count in the confirmation text.
- `authoritative` with a delete set over `maxImpliedDeletePercent` and no `--allow-bulk-delete` →
  refuses and changes **nothing** (not a partial apply).
- `deleteRecord` inside a collection item removes exactly that row — asserted in **both** modes.
- `Load: 'never'` collection under either mode → hard error naming the collection; never an append.
- Unknown `mode` value in `.mj-sync.json` → `validate` error, not a fallback to `upsert`.
- A record file carrying a per-record `{ "mode": … }` wrapper → `validate` error; mode is directory-level only.
- Discriminator flip on an existing record (Product Event → non-Event with an extension row present) → **reported, never auto-repaired** (§4.3).
- Mid-graph failure (line 3 of 5 fails validation) → whole root rolls back **and** the file's `sync` block is left untouched, so a retry is clean. A half-saved graph with an updated checksum is unrecoverable by retry.
- Dry-run builds the graph and resolves `@owner` / the subtype without saving.

**Cheese PR (the test, not a follow-on):** load a workshop order → Event details shows Person = ShipTo. Confirm still books. No raw `EventOrderLine` INSERT in the seed path.

**Make that gate mechanical.** A human looking at a screen cannot tell you the second push doubled the lines. The gate is a script that pushes, loads through the same object path the form uses (`LoadWithLines` → the line's IsA child / `Extension.Entity`), asserts the child hydrated and `PersonID === header.ShipToPersonID` — then **runs the push a second time and asserts a no-op**. That green run is the merge gate for all PRs in §8.

---

## 10. Out of scope

- ~~Changing IsA or companion runtime APIs (already shipped).~~ **Wrong, and corrected in §4.4.** The retrospective half shipped; the prospective half never existed. Adding it is the point of the MJ core PR.
- Auto-repairing a flipped discriminator (§4.3 detects and reports; it never re-points or deletes an extension row).
- Auto-migrating existing `relatedEntities` files to the new keys (§4.5 diagnoses only).
- Teaching Loom `OrderLineExtensionCompanion` class names.
- Flattening ProductPrice into IsA.
- SQL seed of composition children.

---

## 11. Decision log

- **2026-09-08 (rev 1):** One phase, three PRs (Loom / MJ / cheese). Cheese is the test. No staged MJ-only rollout.
- **2026-09-08 (rev 2, post-review):** Conditional IsA reclassified. It is **not** a sync concern and not a fourth axis — it is the **missing prospective half of MJ's IsA axis** (§2.1). `Entity.ParentID` is already set for both Orders cases, and the retrospective probe already works generically on existing records; only the new-record path is unserved. Consequences:
  - Resolution moves **out of `metadata-sync` and into `@memberjunction/core`** (§4.4). Sync calls `EnsureISAChild` and contains no ladder. No app column name may appear in core — it is clean of them today.
  - **Two layers, both required**: `Entity.SubtypeSelector` metadata (readable offline by Loom and CodeGen) plus a `ClassFactory`-registered `EntitySubtypeResolver` keyed by entity name for override. Runtime-only rules are invisible to the producer, so metadata cannot be skipped.
  - Registration uses **`RegisterClassEx` + `TryCreateInstance`**, not a bespoke registry. Dispatch on `key`; `metadata` is for discovery only.
  - Sync resolution is **synchronous-capable and cache-first** — 17k records is the target path, not the edge case.
  - `extension` gains an **entity-name map form** so overlapping subtypes are expressible; the `"entity"` assertion key is dropped as redundant.
  - §4.5 inference **downgraded to a diagnostic** — no silent reinterpretation of files that push correctly today.
  - A **fourth PR** (MJ core) is added ahead of MJ sync, and one for Orders to delete its six re-derivations.
  - §10's "no IsA runtime API changes" was **wrong** and is corrected.
  - Two decisions deliberately left open for the owner in **§8.1**: collection membership semantics, and whether cheese nests or only adds `extension`.
- **2026-09-08 (rev 3, owner decisions):** both questions rev 2 left open in §8.1 are **resolved**; the
  section is now normative rather than a list of choices.
  - **(a) Collection membership — `upsert` default, `authoritative` opt-in, mode declared per collection
    in `.mj-sync.json` and never in a record file.** "Additive" was concealing two behaviors;
    additive-without-load is a bug, not a mode. `upsert` wins the default on asymmetry of harm — silent
    data loss versus recoverable duplicates — and because it preserves today's `relatedEntities`
    semantics, so a file migrating between the two keys does not change meaning (§4.5 already forbids
    silent re-routing; differing semantics would have made any later migration a data-loss event).
    Membership is a property of the relationship, so a per-record mode would let two files disagree and
    let a hand-edit escalate one file into a delete. `deleteRecord` per item works in both modes, which
    is what keeps `authoritative` rare. Bulk rail, Phase-0 audit, `Load: 'never'` and unknown-mode
    handling are riders, not options.
  - **(b) Cheese is the full gate, with the nesting scoped.** `collections`/`embeds` are proven on
    `committee-meetings` (294 roots, four child collections, 1.4 MB) and `extension` on flat
    `order-lines` at its full 17,075 rows. Orders are **not** nested — folding line bytes into the root
    checksum defeats `--incremental`. This supersedes rev 2's "prove `collections` on something small":
    committee-meetings is real generated cheese data, not a fixture, so every axis is proven on the real
    corpus. `events` → `event-registrations` is explicitly rejected as a nesting candidate at ~172
    children per root.
