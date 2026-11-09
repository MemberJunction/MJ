# Filter builder, FilterState, and in-memory evaluation

**Read this before** adding a new “when does this apply?” UI, compiling filters to SQL, or evaluating a saved filter against a bag of records (prices, record processes, anything that is not a User View).

Related: [Remote Operations](REMOTE_OPERATIONS_GUIDE.md) (`Authorization.Check`), [Record Set Processing](RECORD_SET_PROCESSING_GUIDE.md) (filters as a *source*, not this JSON).

---

## 1. One JSON, three runtimes

Staff build filters in **`mj-filter-builder`** (`@memberjunction/ng-filter-builder`), and developers author them in TypeScript with **`FilterOf<T>()`** (`@memberjunction/core`). The portable payload is a Kendo **`CompositeFilterDescriptor`**:

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
| **Parameterized SQL (`RunView`)** | `RunViewParams.Filter` | `CompositeFilterSQLCompiler.Compile` → parameterized `@f0, @f1` (SQL Server) / `$1, $2` (PostgreSQL) `WHERE` clause with FLS enforcement |
| **Literal SQL (User Views)** | `MJUserViewEntityExtended.GenerateWhereClause` | `CompositeFilterSQLCompiler.CompileLiteral` → quote-safe, `LIKE`-escaped literal `WHERE` persisted on the view |
| **In-memory** | `BaseEnginePropertyConfig.Filter`, `BaseEngine.Where()`, Prices, Processes, Open Apps | `CompositeFilter.FromJSON(json).Evaluate(context)` in `@memberjunction/core` |

Do **not** invent a second tree (custom `scope` / `groups` / `rules`). Do **not** ask staff to type `SafeExpression` strings. `SafeExpressionEvaluator` (`@memberjunction/global`) stays the sandbox for *authored* JS-like expressions (Flow agents). Filter JSON is data; `CompositeFilter` walks it.

### Supported operators (`FilterOperator`)

| Operator | Value | SQL & In-Memory Semantics |
|---|---|---|
| `eq` / `neq` | scalar or `null` | `=` / `<>` (`IS NULL` / `IS NOT NULL` when value is `null`) |
| `gt` / `gte` / `lt` / `lte` | number, `Date`, or ISO string | `>`, `>=`, `<`, `<=` |
| `contains` / `doesnotcontain` | string | `LIKE '%…%'` / `NOT LIKE '%…%'` with wildcard escaping (`%`, `_`, `[`) |
| `startswith` / `endswith` | string | `LIKE '…%'` / `LIKE '%…'` with wildcard escaping |
| `isnull` / `isnotnull` | `null` | Strictly `IS NULL` / `IS NOT NULL` |
| `isempty` / `isnotempty` | `null` | `col IS NULL OR col = ''` / `col IS NOT NULL AND col <> ''` (string fields); `IS NULL` / `IS NOT NULL` (non-string fields) |
| `in` / `notin` | non-empty scalar array (max 500) | `col IN (@f0, @f1, …)` / `col NOT IN (@f0, @f1, …)` |
| `between` | `[low, high]` two-element tuple | `col BETWEEN @f0 AND @f1` (inclusive on both ends) |

### Typed authoring with `FilterOf<T>()`

Use `FilterOf<T>()` from `@memberjunction/core` to build compile-time-checked filters for `RunViewParams.Filter`, `BaseEnginePropertyConfig.Filter`, or `BaseEngine.Where()`:

```ts
import { FilterOf, RunView } from '@memberjunction/core';
import type { MJUserEntity, MJUserEntityType } from '@memberjunction/core-entities';

const f = FilterOf<MJUserEntityType>();
const rv = new RunView();
const result = await rv.RunView<MJUserEntity>({
  EntityName: 'MJ: Users',
  Filter: f.And(
    f.Eq('IsActive', true),
    f.In('Type', ['Owner', 'User']),
    f.Or(f.Contains('Email', '@example.com'), f.IsNotEmpty('Title')),
  ),
  ResultType: 'entity_object',
});
```

When both `Filter` and `ExtraFilter` are provided on `RunViewParams`, they are combined as `(<compiled Filter>) AND (<ExtraFilter>)`.

### Using structured `Filter` in `BaseEngine`

`BaseEnginePropertyConfig.Filter` accepts either a SQL string or a `CompositeFilterDescriptor` / `CompositeFilter`. When a structured `Filter` is used:
- Initial load passes `Filter` directly to `RunViewParams.Filter` (parameterized SQL).
- Live `BaseEntity` save events evaluate the structured filter in memory via `CompositeFilter.Evaluate()` — adding newly matching records, updating matching records in place, and evicting records that no longer match without a database round trip.
- Subclasses can also filter any cached array property on demand via `this.Where<T>('PropertyName', filter)`.

---

## 2. Field names: write prefix, read both

**Write (when `sources` is passed to the builder):** always `SourceKey.FieldName`. Even one source. The JSON is self-describing as multi-entity.

**Write (legacy):** if the caller still passes only `fields` (User Views today), keep bare names (`Type`). Existing `FilterState` rows stay valid.

**Read:**

```ts
CompositeFilter.ParseFilterField('Type')                      // { Source: null, Name: 'Type' }
CompositeFilter.ParseFilterField('BillToOrganization.Type')   // { Source: 'BillToOrganization', Name: 'Type' }
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
import { CompositeFilter } from '@memberjunction/core';

const filter = CompositeFilter.FromDescriptor(descriptor);
filter.SummaryText({
  Fields: [{ Name: 'BillToOrganization.Type', DisplayName: 'Type' }],
  SourceLabels: { BillToOrganization: 'Bill-to organization' },
});
// "Bill-to organization Type equals Member"
filter.SummaryHTML(options);  // highlighted HTML; host sanitizes if injecting
```

The builder accordion calls `SummaryHTML`. Grids call `SummaryText`. Do not duplicate the sentence builder in Open Apps.

---

## 5. In-memory evaluation

```ts
import { CompositeFilter } from '@memberjunction/core';

const ok = CompositeFilter.FromJSON(json).Evaluate({
  Order: { CompanyID: '…', Status: 'Open' },
  Product: { SKU: 'CONF-2027' },
  BillToOrganization: { Type: 'Member' },
  BillToPerson: null,
  ShipToOrganization: null,
  ShipToPerson: null,
});

// Or build by hand:
const built = new CompositeFilter();
built.Add({ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' });
built.Evaluate(context);
```

A missing source record makes `eq` false and `isnull` / `isempty` true. Empty `filters` is true (no restriction). Operators match the view SQL set (`eq`, `contains`, `isnull`, …).

---

## 6. Orders (thin wrap)

Product prices store this JSON in `ProductPrice.Applicability`. The resolver builds the context bag from the order (header, product, bill-to/ship-to person/org/address) and calls `CompositeFilter.FromJSON(row.Applicability).Evaluate(context)`. No second builder. No formula language.

---

## 7. Files

| Piece | Package |
|---|---|
| `CompositeFilterDescriptor` + `CompositeFilter` (`FromJSON`, `Evaluate`, `SummaryText` / `SummaryHTML`) | `@memberjunction/core` → `generic/filters/compositeFilter.ts` |
| `CompositeFilterSQLCompiler` (`Compile`, `CompileLiteral`, `AssertFieldsAllowed`) + `CanonicalCompositeFilterKey` | `@memberjunction/core` → `generic/filters/compositeFilterSQL.ts` |
| `FilterOf<T>()` typed builder | `@memberjunction/core` → `generic/filters/filterBuilder.ts` |
| UI | `@memberjunction/ng-filter-builder` |
| View SQL | `MJUserViewEntityExtended.GenerateWhereClause` (delegates to `CompositeFilterSQLCompiler.CompileLiteral`) |
| Authored JS expressions | `@memberjunction/global` `SafeExpressionEvaluator` — **not** this JSON |
