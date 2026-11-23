import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';

/** Keep parity with the WorkQueue cloud filter combination cap. */
export const AZURE_MAX_FILTER_COMBINATIONS = 150;

function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
    return 'logic' in node && node.logic !== undefined;
}

function escapeSqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function escapeLikePrefix(value: string): string {
    return `${value.replace(/'/g, "''").replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]')}%`;
}

function fieldRef(field: string): string {
    return `user.[${field}]`;
}

function requiredValue(rule: FilterRule): string {
    if (rule.value === null || rule.value === undefined) {
        throw new WorkQueueConfigurationError(`Filter rule on '${rule.field}' with operator '${rule.operator}' has no value`);
    }
    return String(rule.value);
}

/** Renders a single rule into an Azure Service Bus SQL92 predicate over application properties. */
function ruleExpression(rule: FilterRule): { Field: string; Clause: string; ValueCount: number } {
    const col = fieldRef(rule.field);
    switch (rule.operator) {
        case 'eq':
            return { Field: rule.field, Clause: `${col} = ${escapeSqlLiteral(requiredValue(rule))}`, ValueCount: 1 };
        case 'neq':
            return { Field: rule.field, Clause: `(EXISTS(${col}) AND ${col} <> ${escapeSqlLiteral(requiredValue(rule))})`, ValueCount: 1 };
        case 'startswith':
            return { Field: rule.field, Clause: `${col} LIKE ${escapeSqlLiteral(escapeLikePrefix(requiredValue(rule)))}`, ValueCount: 1 };
        case 'isnotnull':
            return { Field: rule.field, Clause: `EXISTS(${col})`, ValueCount: 1 };
        case 'isnull':
            return { Field: rule.field, Clause: `NOT EXISTS(${col})`, ValueCount: 1 };
        default:
            throw new WorkQueueConfigurationError(
                `Operator '${String(rule.operator)}' on '${rule.field}' has no Azure Service Bus SQL filter form`,
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
        ? `${col} = ${escapeSqlLiteral(uniqueValues[0])}`
        : `${col} IN (${uniqueValues.map(escapeSqlLiteral).join(', ')})`;
    return { Field: resolvedField, Clause: clause, ValueCount: uniqueValues.length };
}

/** Renders a SubscriptionFilter as an Azure Service Bus SqlRuleFilter expression, sorted deterministically by field name. */
export function ToAzureSqlFilter(filter: SubscriptionFilter): string {
    if (filter.logic !== 'and') {
        throw new WorkQueueConfigurationError("A subscription filter's top level must use AND");
    }
    if (filter.filters.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no Azure Service Bus SQL filter; omit the filter instead');
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
    if (combinations > AZURE_MAX_FILTER_COMBINATIONS) {
        throw new WorkQueueConfigurationError(
            `Filter produces ${combinations} value combinations; at most ${AZURE_MAX_FILTER_COMBINATIONS} are allowed`,
        );
    }
    return sorted.map(([, entry]) => entry.Clause).join(' AND ');
}

export function AzureSqlFilterFor(filter: SubscriptionFilter | null): string | null {
    return filter === null || filter.filters.length === 0 ? null : ToAzureSqlFilter(filter);
}

/** Normalizes a Service Bus SQL rule expression for drift comparison (treats default '1=1' / empty as null). */
export function NormalizeAzureSqlFilter(expression: string | null | undefined): string | null {
    if (expression === null || expression === undefined) {
        return null;
    }
    const collapsed = expression.trim().replace(/\s+/g, ' ');
    if (collapsed === '' || collapsed === '1=1' || collapsed === '1 = 1' || collapsed.toUpperCase() === 'TRUE') {
        return null;
    }
    return collapsed;
}
