import { WorkQueueConfigurationError } from './errors';
import type { FilterGroup, FilterOperator, FilterRule, FilterSupport, SubscriptionFilter } from './filterTypes';
import { ATTRIBUTE_KEY_PATTERN } from './validation';

const ALL_OPERATORS: FilterOperator[] = ['eq', 'neq', 'startswith', 'isnull', 'isnotnull'];
const VALUELESS_OPERATORS: FilterOperator[] = ['isnull', 'isnotnull'];

/** What the Database transport accepts; cloud drivers narrow it. */
export const WORK_QUEUE_FILTER_SUPPORT: FilterSupport = {
    Operators: ALL_OPERATORS,
    SingleFieldOrGroups: true,
    MaxFields: 5,
    MaxValues: 50,
};

/** Parses a subscription's Filter column. Null or blank text means "match everything". */
export function ParseSubscriptionFilter(json: string | null, support: FilterSupport): SubscriptionFilter | null {
    if (json === null || json.trim() === '') {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new WorkQueueConfigurationError('Filter is not valid JSON');
    }
    return ValidateSubscriptionFilter(parsed, support);
}

/** Checks an already-parsed CompositeFilterDescriptor against the queue's subset and this transport's support. */
export function ValidateSubscriptionFilter(value: unknown, support: FilterSupport): SubscriptionFilter {
    if (!isGroup(value)) {
        throw new WorkQueueConfigurationError(
            'Filter must be a CompositeFilterDescriptor object: { "logic": "and", "filters": [...] }',
        );
    }
    if (value.logic !== 'and') {
        throw new WorkQueueConfigurationError("Filter root logic must be 'and'; OR is only allowed inside a single-field group");
    }
    const filters = value.filters.map((entry) => (isGroup(entry) ? validateGroup(entry, support) : validateRule(entry, support)));
    const constrained = new Set<string>();
    for (const entry of filters) {
        const field = entryField(entry);
        if (constrained.has(field)) {
            throw new WorkQueueConfigurationError(
                `Filter field '${field}' is constrained more than once; combine the conditions into a single rule or one OR group`,
            );
        }
        constrained.add(field);
    }
    const result: SubscriptionFilter = { logic: 'and', filters };
    const fields = FilterFields(result);
    if (fields.length > support.MaxFields) {
        throw new WorkQueueConfigurationError(`Filter may reference at most ${support.MaxFields} fields; got ${fields.length}`);
    }
    const values = countValues(result);
    if (values > support.MaxValues) {
        throw new WorkQueueConfigurationError(`Filter may have at most ${support.MaxValues} values in total; got ${values}`);
    }
    return result;
}

/** AND across the root's entries; OR inside a single-field group. Case-sensitive (spec 03 §4.3). */
export function MatchesFilter(filter: SubscriptionFilter | null, attributes: Record<string, string>): boolean {
    if (filter === null || filter.filters.length === 0) {
        return true;
    }
    return matchesGroup(filter, attributes);
}

/** Distinct field names, in first-seen order. */
export function FilterFields(filter: SubscriptionFilter | null): string[] {
    if (filter === null) {
        return [];
    }
    const seen: string[] = [];
    walkRules(filter, (rule) => {
        if (!seen.includes(rule.field)) {
            seen.push(rule.field);
        }
    });
    return seen;
}

function matchesGroup(group: FilterGroup, attributes: Record<string, string>): boolean {
    const results = group.filters.map((entry) =>
        isGroup(entry) ? matchesGroup(entry, attributes) : matchesRule(entry, attributes),
    );
    return group.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function matchesRule(rule: FilterRule, attributes: Record<string, string>): boolean {
    const present = Object.prototype.hasOwnProperty.call(attributes, rule.field);
    const value = present ? attributes[rule.field] : undefined;
    if (rule.operator === 'isnull') {
        return !present;
    }
    if (rule.operator === 'isnotnull') {
        return present;
    }
    if (value === undefined) {
        return false;
    }
    const expected = String(rule.value ?? '');
    switch (rule.operator) {
        case 'eq':
            return value === expected;
        case 'neq':
            return value !== expected;
        default:
            return value.startsWith(expected);
    }
}

function validateGroup(group: FilterGroup, support: FilterSupport): FilterGroup {
    if (!support.SingleFieldOrGroups) {
        throw new WorkQueueConfigurationError('This transport does not support OR groups in a subscription filter');
    }
    if (group.logic !== 'or') {
        throw new WorkQueueConfigurationError("A nested filter group must use logic 'or'");
    }
    if (group.filters.some(isGroup)) {
        throw new WorkQueueConfigurationError('Filter nesting is limited to one OR group inside the root');
    }
    const rules = group.filters.map((entry) => validateRule(entry, support));
    const fields = new Set(rules.map((rule) => rule.field));
    if (fields.size !== 1) {
        throw new WorkQueueConfigurationError(`An OR group must test a single field; got ${[...fields].join(', ')}`);
    }
    const offender = rules.find((rule) => rule.operator !== 'eq');
    if (offender) {
        throw new WorkQueueConfigurationError(
            `An OR group may use only 'eq'; field '${offender.field}' uses '${offender.operator}'`,
        );
    }
    return { logic: 'or', filters: rules };
}

function validateRule(value: unknown, support: FilterSupport): FilterRule {
    if (!isPlainObject(value) || typeof value['field'] !== 'string' || typeof value['operator'] !== 'string') {
        throw new WorkQueueConfigurationError('Each filter entry must be { field, operator, value? } or a nested group');
    }
    const field = value['field'];
    const operator = value['operator'];
    if (field.includes('.')) {
        throw new WorkQueueConfigurationError(
            `Filter field '${field}' is not supported: use a bare attribute name, not the dotted source.field form`,
        );
    }
    if (!ATTRIBUTE_KEY_PATTERN.test(field)) {
        throw new WorkQueueConfigurationError(`Filter field '${field}' is not a valid attribute name`);
    }
    if (!isOperator(operator) || !support.Operators.includes(operator)) {
        throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' is not supported by this transport`);
    }
    const raw = value['value'];
    if (VALUELESS_OPERATORS.includes(operator)) {
        if (raw !== undefined && raw !== null) {
            throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' takes no value`);
        }
        return { field, operator };
    }
    if (raw === undefined || raw === null || raw === '') {
        throw new WorkQueueConfigurationError(`Filter operator '${operator}' on field '${field}' requires a value`);
    }
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
        throw new WorkQueueConfigurationError(`Filter value for field '${field}' must be a string, number or boolean`);
    }
    return { field, operator, value: String(raw) };
}

/** The field a validated root entry constrains; a group is single-field by construction. */
function entryField(entry: FilterRule | FilterGroup): string {
    if (!isGroup(entry)) {
        return entry.field;
    }
    const first = entry.filters[0];
    return isGroup(first) ? '' : first.field;
}

function countValues(filter: SubscriptionFilter): number {
    let count = 0;
    walkRules(filter, (rule) => {
        if (rule.value !== undefined) {
            count += 1;
        }
    });
    return count;
}

function walkRules(group: FilterGroup, visit: (rule: FilterRule) => void): void {
    for (const entry of group.filters) {
        if (isGroup(entry)) {
            walkRules(entry, visit);
        } else {
            visit(entry);
        }
    }
}

function isOperator(value: string): value is FilterOperator {
    return (ALL_OPERATORS as string[]).includes(value);
}

function isGroup(value: unknown): value is FilterGroup {
    return isPlainObject(value) && typeof value['logic'] === 'string' && Array.isArray(value['filters']);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
