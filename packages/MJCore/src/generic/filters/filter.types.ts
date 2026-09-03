/**
 * Portable filter JSON — the same Kendo-shaped tree User Views persist as FilterState.
 * When a field contains a dot, the first segment is a source key (`BillToOrganization.Type`).
 * Bare names are the legacy single-entity form (`Type`).
 */

export type FilterOperator =
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'doesnotcontain'
    | 'startswith'
    | 'endswith'
    | 'isnull'
    | 'isnotnull'
    | 'isempty'
    | 'isnotempty';

export type FilterLogic = 'and' | 'or';

export interface FilterDescriptor {
    field: string;
    operator: FilterOperator;
    value: unknown;
}

export interface CompositeFilterDescriptor {
    logic: FilterLogic;
    filters: (FilterDescriptor | CompositeFilterDescriptor)[];
}

export function isCompositeFilter(
    filter: FilterDescriptor | CompositeFilterDescriptor,
): filter is CompositeFilterDescriptor {
    return filter != null && typeof filter === 'object' && 'logic' in filter && 'filters' in filter;
}

export function isSimpleFilter(
    filter: FilterDescriptor | CompositeFilterDescriptor,
): filter is FilterDescriptor {
    return filter != null && typeof filter === 'object' && 'field' in filter && 'operator' in filter;
}

/** First segment before `.` is the source; the rest is the field. Bare names have source null. */
export function parseFilterField(field: string): { source: string | null; name: string } {
    const raw = (field ?? '').trim();
    const dot = raw.indexOf('.');
    if (dot <= 0 || dot === raw.length - 1) {
        return { source: null, name: raw };
    }
    return { source: raw.slice(0, dot), name: raw.slice(dot + 1) };
}

/** Always writes `source.name`. Callers that still use a flat field list omit this and store a bare name. */
export function formatFilterField(source: string, name: string): string {
    return `${source}.${name}`;
}
