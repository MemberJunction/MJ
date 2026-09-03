# Filter builder, FilterState, and in-memory evaluation

**Read this before** adding a new “when does this apply?” UI, compiling filters to SQL, or evaluating a saved filter against a bag of records (prices, record processes, anything that is not a User View).

Related: [Remote Operations](REMOTE_OPERATIONS_GUIDE.md) (`Authorization.Check`), [Record Set Processing](RECORD_SET_PROCESSING_GUIDE.md) (filters as a *source*, not this JSON).

---

## 1. One JSON, two runtimes

Staff build filters in **`mj-filter-builder`** (`@memberjunction/ng-filter-builder`). The portable payload is a Kendo **`CompositeFilterDescriptor`**:

```json
{
  "logic": "and",
  "filters": [
    { "field": "BillToOrganization.Type", "operator": "eq", "value": "Member" }
  ]
}
```

| Runtime | Who | How |
|---|---|---|
| **SQL** | User Views | `MJUserViewEntityExtended.GenerateWhereClause` → `WHERE` on **one** entity |
| **In-memory** | Prices, processes, Open Apps | `evaluateFilter(descriptor, context)` in `@memberjunction/core` |

Do **not** invent a second tree (custom `scope` / `groups` / `rules`). Do **not** ask staff to type `SafeExpression` strings. `SafeExpressionEvaluator` (`@memberjunction/global`) stays the sandbox for *authored* JS-like expressions (Flow agents). Filter JSON is data; `evaluateFilter` walks it.

---

## 2. Field names: write prefix, read both

**Write (when `sources` is passed to the builder):** always `SourceKey.FieldName`. Even one source. The JSON is self-describing as multi-entity.

**Write (legacy):** if the caller still passes only `fields` (User Views today), keep bare names (`Type`). Existing `FilterState` rows stay valid.

**Read:**

```ts
parseFilterField('Type')                      // { source: null, name: 'Type' }
parseFilterField('BillToOrganization.Type')   // { source: 'BillToOrganization', name: 'Type' }
```

- SQL views: `GenerateWhereClause` uses the **name** part (the view is one table). Prefixed `Organizations.Type` and bare `Type` both become `[Type]`.
- In-memory: prefixed fields read `context[source][name]`. Bare fields read `context[''][name]` so a single-record caller passes `{ '': row }`.

Source keys have **no dots** (`BillToOrganization`, `Order`, `Product`). MJ entity names with colons (`MJ_BizApps_Common: Organizations`) are `FilterSource.entityName`, not the JSON prefix.

---

## 3. Builder UX

```html
<mj-filter-builder
  [fields]="orgFields"
  [filter]="filter"
  (filterChange)="onChange($event)">
</mj-filter-builder>

<mj-filter-builder
  [sources]="priceSources"
  [filter]="filter"
  [showSummary]="true"
  (filterChange)="onChange($event)">
</mj-filter-builder>
```

| `sources` | Picker | JSON `field` |
|---|---|---|
| omitted | Flat list (views, as today) | Bare `Type` |
| one source | Flat list of that source’s fields | Always `Key.Type` |
| several sources | Two-pane picker (source list \| fields). Closed row: source chip + field label | Always `Key.Type` |

AND/OR, Add Condition, Add Group, typed operators, lookup/value-list editors — unchanged.

`FilterSource`:

```ts
{
  key: 'BillToOrganization',          // JSON prefix
  label: 'Bill-to organization',      // chip / pane
  entityName: 'MJ_BizApps_Common: Organizations',
  fields: [{ name: 'Type', displayName: 'Type', type: 'string', valueList: [...] }]
}
```

---

## 4. Summary helper (no Angular)

The accordion “View Filter Expression” is **not** shown by default (`showSummary`). The same wording belongs on a pricing grid cell.

```ts
import { FilterSummary, evaluateFilter } from '@memberjunction/core';

const summary = new FilterSummary({
  fields: [{ name: 'BillToOrganization.Type', displayName: 'Type' }],
  sourceLabels: { BillToOrganization: 'Bill-to organization' },
});
summary.text(filter);  // "Bill-to organization Type equals Member"
summary.html(filter);  // highlighted HTML; host sanitizes if injecting
```

The builder accordion calls `FilterSummary.html`. Grids call `.text`. Do not duplicate the sentence builder in Open Apps.

---

## 5. In-memory evaluation

```ts
import { evaluateFilter } from '@memberjunction/core';

const ok = evaluateFilter(filter, {
  Order: { CompanyID: '…', Status: 'Open' },
  Product: { SKU: 'CONF-2027' },
  BillToOrganization: { Type: 'Member' },
  BillToPerson: null,
  ShipToOrganization: null,
  ShipToPerson: null,
});
```

A missing source record makes `eq` false and `isnull` / `isempty` true. Empty `filters` is true (no restriction). Operators match the view SQL set (`eq`, `contains`, `isnull`, …).

---

## 6. Orders (thin wrap)

Product prices store this JSON in `ProductPrice.Applicability`. The resolver builds the context bag from the order (header, product, bill-to/ship-to person/org/address) and calls `evaluateFilter`. No second builder. No formula language.

---

## 7. Files

| Piece | Package |
|---|---|
| Types, parse/format, `evaluateFilter`, `FilterSummary` | `@memberjunction/core` → `generic/filters/` |
| UI | `@memberjunction/ng-filter-builder` |
| View SQL | `MJUserViewEntityExtended.GenerateWhereClause` (strips prefix) |
| Authored JS expressions | `@memberjunction/global` `SafeExpressionEvaluator` — **not** this JSON |
