# Metadata Sync + Loom: first-class composition axes

**Branch:** `an-dev-sync-composition-axes`  
**Status:** proposal — edit this file in place; implementation follows the git diff  
**Owner:** MJ Core (`@memberjunction/metadata-sync`) + Loom consume contract  
**Depends on:** Entity companions & graph save (`plans/base-entity-composite-graph.md`, shipped); Embedded records (`plans/embedded-records.md`); IsA parent/child on `BaseEntity`

This is one MJ change. Loom is a **producer** of the JSON this change defines. Cheese Event Order Lines are the first consumer, not the design.

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

**Conditional IsA** is metadata, not a fourth axis. `ProductType.ProductExtensionEntity` and `ProductType.OrderLineExtensionEntity` name which IsA child (if any) this product or line must carry. Event Order Line is an Order Line when the product type says so. Event Product is a Product the same way. Accounting Company Profile is unconditional IsA of Company (no discriminator).

Lookups (`EventOrderLine.PersonID → Person`) stay FKs. They are not composition.

---

## 3. The gap

| What we have | What happens on push | What the runtime needs |
|---|---|---|
| Nested `relatedEntities` | Flatten → separate `GetEntityObject` + `Save` | Child attached **on the parent object** before `Save` |
| Shared PK + sibling file/dir | Two records, two Saves; IsA parent not wired | `EnsureEntity` / IsA child on the **same instance**, then one graph Save |
| SQL `INSERT` into `EventOrderLine` | Row in table/view; companion never built | Form hydrates `line.Extension` via `InnerLoad` **and** future saves go through `persistExtension` |
| `@parent:ID` | String after parent is already saved | Collection `Create()` stamps FK; IsA copies parent PK; embed does not use `@parent` at all |

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
| `extension` | Conditional or unconditional IsA / companion | **Shared PK with owner.** JSON does **not** invent a new ID. Optional `"entity": "MJ_BizApps_Orders: Event Order Lines"` is an **assertion** — fail if metadata resolves a different type |

`extension.fields` are **leaf-owned columns only**. Inherited Order Line / Product columns do not belong here. Sync must reject them (same rule as `SelectSimpleExtensionFields` using `ParentEntityFieldNames`).

New `@owner:Field` (and keep `@parent` / `@root` for `relatedEntities`): read from the **in-memory owner object** this node is attached to, not from batch context after a prior Save. `@owner:ShipToPersonID` on a line extension is the header’s ShipTo, because the line’s owner in a nested `collections.Lines[]` is the header. For a nested extension, `@owner` is the line; `@root` is the JSON-root entity.

### 4.2 Resolving `extension` (conditional IsA)

After `fields` are applied (so `ProductID` / `ProductTypeID` exist on the object):

1. If `extension.entity` is set, use it (assert against metadata).
2. Else if this entity has exactly one IsA child type (`Entity.ChildEntities.length === 1` and not overlapping), use that (Company → Accounting Company Profile).
3. Else if a related **Product** (or declared discriminator path) is set, load `ProductType.ProductExtensionEntity` or `ProductType.OrderLineExtensionEntity` (which field depends on whether the owner is a Product or an Order Line). Empty string/null ⇒ **no extension**; `extension` in JSON is then an error.
4. Else fail loud: cannot resolve extension type.

This is the general discriminator: **metadata on a related type names the IsA entity.** Not Event-specific.

### 4.3 Inference for old `relatedEntities` (compat, not the Loom target)

When flattening `relatedEntities[ChildName]`:

- If `Child.ParentID` is this entity **and** child `primaryKey` equals parent PK → treat as `extension` (do not independent-Save).
- Else if this entity has a `RelatedRecordCollection` whose related entity is `ChildName` → treat as that collection.
- Else today’s behavior (independent GetEntityObject + Save, `@parent:ID`).

Loom **emits the new keys**. Inference exists so older Action/Prompt files keep working and so a mistaken Event Order Line sibling dir can be diagnosed instead of silently double-saved.

---

## 5. Push: apply onto the object, then one Save

For a JSON **root** that uses `collections` / `embeds` / `extension` (or inferred composition):

1. `GetEntityObject` / load-or-new as today (graph-scoped provider).
2. `Set` `fields`.
3. **Embeds** (peer first): for each `embeds[fkField]`, `{fkField}_EnsureObject()`, recurse apply, do **not** Save the peer yet — `EntitySavePlan` already orders embed-before-owner.
4. **Collections:** `owner.Lines.Create()` (or load existing by PK into the collection), recurse apply on the child entity. Do **not** `child.Save()` here.
5. **Extension:** resolve type (§4.2). If the owner is an `OrderLineEntity` (or any subclass with `Extension` companion), `await owner.Extension.EnsureEntity(resolvedName)` and `Set` leaf fields on `owner.Extension.Entity`. Otherwise use IsA: `GetEntityObject` child, bind shared PK, replace parent chain with this owner (`replaceChildParentChain`), set leaf fields, attach as `_childEntity`. Still no independent Save.
6. **`await owner.Save()` once.** Companions / `persistExtension` / collection plan persist the graph. RecordChange, validation, and IsA parent hydration run.

`relatedEntities` that remain “independent children” still flatten to later levels on the same `graphId` (Action Params). Mix is allowed: an Action can have `relatedEntities` Params **and** someday a collection.

Dirty detection: graph Save is dirty if the owner **or any attached companion** is dirty (already true on `EntitySavePlan`). Checksums stay per JSON record; extension/collection/embed bytes participate in the root checksum so a PersonID-only change on the line extension still pushes.

Dry-run: build the object graph, skip Save, still register batch context for `@owner` / `@parent`.

### 5.1 What PushService must not do

- Flatten `extension` / `collections` / `embeds` into sibling `FlattenedRecord`s that `GetEntityObject`+`Save` themselves.
- SQL-insert IsA tables.
- `GetEntityObject('Event Order Lines')` as if it were unrelated to the line.
- Require authors to put inherited virtuals (`OrderHeaderID`, `Quantity`, …) on the extension payload.

---

## 6. Pull

Pull writes the same shape it reads.

- Collections: if `RelatedRecordCollection` is declared, emit `collections[Name]` from `owner.Lines` (load explicit collections). Do not also dump those rows as a sibling entity directory unless the entity is also a sync root.
- Extension: if an IsA child exists (or companion is configured and `InnerLoad` succeeds), emit `extension.fields` (leaf only). Include `"entity"` when more than one child type is possible.
- Embeds: emit `embeds[fkField]` from `{Field}_Object` when loaded / present.
- Continue emitting `relatedEntities` for relationships that are **not** collections (Prompt Models, Action Params).

Checksums: hash `fields` + composition payloads, excluding `sync`.

---

## 7. Loom (producer contract — implemented in Loom, consumed here)

Loom domain grows a `composition` block that **maps onto this JSON**, not onto SQL:

- `isA` + optional `when` path (e.g. `ProductType.OrderLineExtensionEntity` equals this entity’s MJ name) → emit `extension` on the parent record, shared PK, leaf fields only. Causal rules (PersonID := Order.ShipToPersonID) stay Loom `relationalRules`.
- `collections` → emit `collections[Name]`.
- `embeds` → emit `embeds[fkField]`.
- Ordinary FKs stay `fields` + `@lookup`.

`createDomainConfigFromMJEntities` must read `ParentID`, `RelatedRecordCollection`, `EmbeddedRecord`, and the two ProductType extension columns so cheese `domain.json` only adds `when` and path-match rules.

Loom still does not call `BaseEntity.Save` during generation. Intelligence is: **the emitted graph is the runtime graph**, so this push path can `EnsureEntity` / `Lines.Create` / `_EnsureObject` and Save once.

Validation in Loom (not MJ): IsA child PK = parent PK; child exists iff `when`; collection FK/sequence; required embed present. MJ push still fail-loud if metadata disagrees.

---

## 8. Phasing

1. **JSON + RecordData + docs** — reserved keys, validation (unknown collection name, extension fields that are parent-owned, missing discriminator).
2. **Push graph apply** — embeds, collections, unconditional extension; unit tests with fakes of `Lines.Create` / `Extension.EnsureEntity` / `DeclareEmbeddedRecord`.
3. **Conditional extension** — ProductType `*ExtensionEntity` resolution; Event Product + Event Order Line fixtures.
4. **Pull** emits the new shape.
5. **Compat inference** for `relatedEntities` that are actually IsA/collections; warn when a sibling Event Order Line dir should have been `extension`.
6. **Loom** consumes the contract (separate Loom PR). Cheese deletes SQL/emitter IsA dumps.

Product **prices** stay a normal entity (`ProductPrice` is not IsA). They can remain `relatedEntities` or become a collection if Orders declares one.

---

## 9. Tests (MJ)

- Order header JSON with `collections.Lines[]` + `extension.fields.PersonID` → mock `OrderLineEntity.Extension.EnsureEntity` called with `MJ_BizApps_Orders: Event Order Lines` **before** `Save`; child `ID` equals line `ID`; **no** second `GetEntityObject`+`Save` for the child.
- Product JSON with `extension` and ProductType Event → `Event Product` companion/IsA attached before Product `Save`.
- Company JSON with `extension` → Accounting Company Profile, shared PK, no “Name cannot be null” parent-create (the Company object **is** the parent).
- Header `embeds.ShipToAddressID` → address `EnsureObject` before header Save; FK stamped.
- Action + `relatedEntities` Params still independent-saves (regression).
- `extension.fields.Quantity` (parent-owned) rejected.
- Product type with null `OrderLineExtensionEntity` + `extension` in JSON → error.
- `@owner:ShipToPersonID` resolves from header in memory, not batch context after Save.

Cheese / Explorer: load a workshop order → Event details shows Person = ShipTo. Confirm still books. No raw `EventOrderLine` INSERT in the seed path.

---

## 10. Out of scope

- Changing IsA or companion runtime APIs (already shipped).
- Teaching Loom `OrderLineExtensionCompanion` class names.
- Flattening ProductPrice into IsA.
- SQL seed of composition children.

---

## 11. Decision log (edit here)

_Leave blank for review edits. Implementation starts after this section is stable._
