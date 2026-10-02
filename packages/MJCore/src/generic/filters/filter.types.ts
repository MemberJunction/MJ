/**
 * Portable filter JSON — the same Kendo-shaped tree User Views persist as FilterState.
 * When a field contains a dot, the first segment is a source key (`BillToOrganization.Type`).
 * Bare names are the legacy single-entity form (`Type`).
 *
 * This file is the data shape only. Evaluation, summary, and construction live on
 * {@link CompositeFilter}.
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

export function IsCompositeFilter(
    filter: FilterDescriptor | CompositeFilterDescriptor,
): filter is CompositeFilterDescriptor {
    return filter != null && typeof filter === 'object' && 'logic' in filter && 'filters' in filter;
}

export function IsSimpleFilter(
    filter: FilterDescriptor | CompositeFilterDescriptor,
): filter is FilterDescriptor {
    return filter != null && typeof filter === 'object' && 'field' in filter && 'operator' in filter;
}

/** First segment before `.` is the source; the rest is the field. Bare names have source null. */
export function ParseFilterField(field: string): { Source: string | null; Name: string } {
    const raw = (field ?? '').trim();
    const dot = raw.indexOf('.');
    if (dot <= 0 || dot === raw.length - 1) {
        return { Source: null, Name: raw };
    }
    return { Source: raw.slice(0, dot), Name: raw.slice(dot + 1) };
}

/** Always writes `source.name`. Callers that still use a flat field list omit this and store a bare name. */
export function FormatFilterField(source: string, name: string): string {
    return `${source}.${name}`;
}
