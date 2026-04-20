/**
 * Persisted filter configuration for a User View.
 *
 * Stored in the `FilterState` column of the `User Views` entity. Represents a
 * composite filter tree where each node is either a leaf condition (field + operator
 * + value) or a group node (logic + nested filters). The default empty state is
 * `{ "logic": "and", "filters": [] }`.
 *
 * The runtime class `ViewFilterInfo` in MJUserViewEntityExtended transforms `logic`
 * into a `logicOperator` enum. This interface represents the raw serialized form.
 */
export interface IFilterState {
    /** Logic operator combining child filters */
    logic: 'and' | 'or';
    /** Child filter nodes — either leaf conditions or nested groups */
    filters: IFilterItem[];
}

/**
 * A single node in the {@link IFilterState} filter tree — either a leaf condition
 * or a nested composite group.
 *
 * Leaf nodes have `field`, `operator`, and `value`. Group nodes have `logic` and
 * `filters`. This recursive structure supports arbitrarily deep AND/OR expressions.
 */
export interface IFilterItem {
    /** Field name (leaf conditions) */
    field?: string;
    /** Comparison operator (leaf conditions) — e.g. 'eq', 'contains', 'isnull' */
    operator?: string;
    /** Value to compare against (leaf conditions) */
    value?: string | number | boolean | null;
    /** Logic operator for nested composite groups */
    logic?: 'and' | 'or';
    /** Nested filter nodes (composite groups) */
    filters?: IFilterItem[];
}
