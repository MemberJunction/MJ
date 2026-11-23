import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';

/** Keep parity with the WorkQueue cloud filter combination cap. */
export const GCP_MAX_FILTER_COMBINATIONS = 150;

function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
    return 'logic' in node && node.logic !== undefined;
}

function escapePubSubString(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function fieldRef(field: string): string {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field) ? `attributes.${field}` : `attributes.${escapePubSubString(field)}`;
}

function hasKeyRef(field: string): string {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field) ? `attributes:${field}` : `attributes:${escapePubSubString(field)}`;
}

function requiredValue(rule: FilterRule): string {
    if (rule.value === null || rule.value === undefined) {
        throw new WorkQueueConfigurationError(`Filter rule on '${rule.field}' with operator '${rule.operator}' has no value`);
    }
    return String(rule.value);
}

/** Renders a single rule into a Google Cloud Pub/Sub subscription filter expression over message attributes. */
function ruleExpression(rule: FilterRule): { Field: string; Clause: string; ValueCount: number } {
    const col = fieldRef(rule.field);
    const hasKey = hasKeyRef(rule.field);
    switch (rule.operator) {
        case 'eq':
            return { Field: rule.field, Clause: `${col} = ${escapePubSubString(requiredValue(rule))}`, ValueCount: 1 };
        case 'neq':
            return { Field: rule.field, Clause: `${hasKey} AND ${col} != ${escapePubSubString(requiredValue(rule))}`, ValueCount: 1 };
        case 'startswith':
            return { Field: rule.field, Clause: `hasPrefix(${col}, ${escapePubSubString(requiredValue(rule))})`, ValueCount: 1 };
        case 'isnotnull':
            return { Field: rule.field, Clause: hasKey, ValueCount: 1 };
        case 'isnull':
            return { Field: rule.field, Clause: `NOT ${hasKey}`, ValueCount: 1 };
        default:
            throw new WorkQueueConfigurationError(
                `Operator '${String(rule.operator)}' on '${rule.field}' has no Google Cloud Pub/Sub filter form`,
            );
    }
}

/** A nested group is only ever an OR of eq rules on a single field. */
function groupExpression(group: FilterGroup): { Field: string; Clause: string; ValueCount: number } {
    if (group.logic !== 'or' || group.filters.length === 0) {
        throw new WorkQueueConfigurationError('A nested filter group must be a non-empty OR of eq rules on a single field');
    }
    const values: string[] = [];
    let field: string | null = null;
    for (const member of group.filters) {
        if (isGroup(member) || member.operator !== 'eq') {
            throw new WorkQueueConfigurationError('A nested filter group must be an OR of eq rules on a single field');
        }
        if (field !== null && member.field !== field) {
            throw new WorkQueueConfigurationError(
                `An OR group must stay on a single field; '${field}' is mixed with '${member.field}'`,
            );
        }
        field = member.field;
        values.push(requiredValue(member));
    }
    const resolvedField = field ?? '';
    const uniqueValues = [...new Set(values)].sort();
    const col = fieldRef(resolvedField);
    const clause = uniqueValues.length === 1
        ? `${col} = ${escapePubSubString(uniqueValues[0])}`
        : `(${uniqueValues.map((val) => `${col} = ${escapePubSubString(val)}`).join(' OR ')})`;
    return { Field: resolvedField, Clause: clause, ValueCount: uniqueValues.length };
}

/** Renders a SubscriptionFilter as a Google Cloud Pub/Sub subscription filter expression, sorted deterministically by field name. */
export function ToGcpPubSubFilter(filter: SubscriptionFilter): string {
    if (filter.logic !== 'and') {
        throw new WorkQueueConfigurationError("A subscription filter's top level must use AND");
    }
    if (filter.filters.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no Google Cloud Pub/Sub filter; omit the filter instead');
    }
    const clausesByField = new Map<string, { Clause: string; ValueCount: number }>();
    for (const node of filter.filters) {
        const entry = isGroup(node) ? groupExpression(node) : ruleExpression(node);
        if (clausesByField.has(entry.Field)) {
            throw new WorkQueueConfigurationError(
                `Filter constrains '${entry.Field}' more than once; combine the conditions into a single rule or one OR group`,
            );
        }
        clausesByField.set(entry.Field, { Clause: entry.Clause, ValueCount: entry.ValueCount });
    }
    const sorted = [...clausesByField.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const combinations = sorted.reduce((product, [, entry]) => product * Math.max(1, entry.ValueCount), 1);
    if (combinations > GCP_MAX_FILTER_COMBINATIONS) {
        throw new WorkQueueConfigurationError(
            `Filter produces ${combinations} value combinations; at most ${GCP_MAX_FILTER_COMBINATIONS} are allowed`,
        );
    }
    return sorted.map(([, entry]) => entry.Clause).join(' AND ');
}

export function GcpPubSubFilterFor(filter: SubscriptionFilter | null): string | null {
    return filter === null || filter.filters.length === 0 ? null : ToGcpPubSubFilter(filter);
}

/** Normalizes a Google Cloud Pub/Sub subscription filter expression for drift comparison (treats empty as null). */
export function NormalizeGcpPubSubFilter(expression: string | null | undefined): string | null {
    if (expression === null || expression === undefined) {
        return null;
    }
    const collapsed = expression.trim().replace(/\s+/g, ' ');
    return collapsed === '' ? null : collapsed;
}
