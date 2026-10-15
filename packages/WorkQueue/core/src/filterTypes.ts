/**
 * Subscription filters are MJ's `CompositeFilterDescriptor` JSON (the shape `mj-filter-builder` edits and user views
 * persist), restricted to what every transport can express — spec 03 §4. `field` is an envelope attribute name.
 */
export type FilterOperator = 'eq' | 'neq' | 'startswith' | 'isnull' | 'isnotnull';

export interface FilterRule {
    field: string;
    operator: FilterOperator;
    /** Normalised to a string when parsed; absent for isnull/isnotnull. */
    value?: string | number | boolean | null;
}

export interface FilterGroup {
    logic: 'and' | 'or';
    filters: (FilterRule | FilterGroup)[];
}

export type SubscriptionFilter = FilterGroup;

/** What one transport accepts; drivers publish this as `TransportCapabilities.Filters` (spec 03 §4.1). */
export interface FilterSupport {
    Operators: FilterOperator[];
    /** A nested group may only be a single-field OR of `eq`. */
    SingleFieldOrGroups: boolean;
    MaxFields: number;
    MaxValues: number;
}
