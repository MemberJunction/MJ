/**
 * In-memory evaluation of CompositeFilterDescriptor.
 * Views still use GenerateWhereClause (SQL). This is for prices, processes, and anything
 * that is not a single-table WHERE.
 *
 * Context is a bag of records keyed by source (`BillToOrganization`, `Order`, …).
 * Bare field names (no dot) read from `context['']` so single-entity callers can pass `{ '': row }`.
 */
import {
    isCompositeFilter,
    parseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
    type FilterOperator,
} from './filter.types';

export type FilterEvalContext = Record<string, Record<string, unknown> | null | undefined>;

export function evaluateFilter(
    filter: CompositeFilterDescriptor | FilterDescriptor | null | undefined,
    context: FilterEvalContext,
): boolean {
    if (!filter) return true;
    if (isCompositeFilter(filter)) {
        const parts = (filter.filters ?? []).filter((f) => f != null);
        if (parts.length === 0) return true;
        if (filter.logic === 'or') {
            return parts.some((p) => evaluateFilter(p as CompositeFilterDescriptor, context));
        }
        return parts.every((p) => evaluateFilter(p as CompositeFilterDescriptor, context));
    }
    return evaluateRule(filter, context);
}

function evaluateRule(rule: FilterDescriptor, context: FilterEvalContext): boolean {
    if (!rule?.field) return true;
    const actual = readValue(context, rule.field);
    return compare(actual, rule.operator, rule.value);
}

function readValue(context: FilterEvalContext, field: string): unknown {
    const { source, name } = parseFilterField(field);
    const rec = context[source ?? ''];
    if (rec == null) return undefined;
    if (name.includes('.')) {
        return name.split('.').reduce<unknown>((acc, part) => {
            if (acc == null || typeof acc !== 'object') return undefined;
            return (acc as Record<string, unknown>)[part];
        }, rec);
    }
    return rec[name];
}

function compare(actual: unknown, operator: FilterOperator, expected: unknown): boolean {
    switch (operator) {
        case 'isnull':
        case 'isempty':
            return actual == null || actual === '';
        case 'isnotnull':
        case 'isnotempty':
            return actual != null && actual !== '';
        case 'eq':
            return equals(actual, expected);
        case 'neq':
            return !equals(actual, expected);
        case 'gt':
            return num(actual) > num(expected);
        case 'gte':
            return num(actual) >= num(expected);
        case 'lt':
            return num(actual) < num(expected);
        case 'lte':
            return num(actual) <= num(expected);
        case 'contains':
            return str(actual).includes(str(expected));
        case 'doesnotcontain':
            return !str(actual).includes(str(expected));
        case 'startswith':
            return str(actual).startsWith(str(expected));
        case 'endswith':
            return str(actual).endsWith(str(expected));
        default:
            return false;
    }
}

function equals(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    if (typeof a === 'boolean' || typeof b === 'boolean') {
        return Boolean(a) === Boolean(b === true || b === 'true' || b === 1 || b === '1');
    }
    if (typeof a === 'number' || typeof b === 'number') {
        return num(a) === num(b);
    }
    return str(a) === str(b);
}

function str(v: unknown): string {
    if (v == null) return '';
    return String(v).toLowerCase();
}

function num(v: unknown): number {
    if (v instanceof Date) return v.getTime();
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
}
