import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';
import { RUNTIME_PROPERTIES } from './properties';

/** Rule name every MJ subscription uses; replacing the service's $Default rule keeps the subscription to one rule. */
export const SERVICE_BUS_RULE_NAME = '$Default';
const LIKE_ESCAPE = '\\';
const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
    return (node as FilterGroup).logic !== undefined;
}

function requiredValue(rule: FilterRule): string {
    if (rule.value === null || rule.value === undefined) {
        throw new WorkQueueConfigurationError(`Filter rule on '${rule.field}' with operator '${rule.operator}' has no value`);
    }
    return String(rule.value);
}

/** Service Bus SQL string literal: single quotes doubled. */
export function SqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Attribute keys are [A-Za-z0-9_-]; a key that is not a plain identifier (it contains '-' or starts with a digit) is bracket-delimited. */
export function SqlIdentifier(field: string): string {
    return PLAIN_IDENTIFIER.test(field) ? field : `[${field.replace(/\]/g, ']]')}]`;
}

/** LIKE pattern for a prefix match: the escape character and the wildcards inside the value are escaped. */
function likePrefix(value: string): string {
    const escaped = value.replace(/[\\%_[]/g, (char) => `${LIKE_ESCAPE}${char}`);
    return `${escaped}%`;
}

/** One rule → its SQL condition (03 §4.1; 09a "Filter translation"). */
function ruleSql(rule: FilterRule): string {
    const field = SqlIdentifier(rule.field);
    switch (rule.operator) {
        case 'eq':
            return `${field} = ${SqlLiteral(requiredValue(rule))}`;
        case 'neq':
            // Explicit EXISTS: a missing attribute must fail every operator except isnull (03 §4.3).
            return `(EXISTS(${field}) AND ${field} <> ${SqlLiteral(requiredValue(rule))})`;
        case 'startswith':
            return `${field} LIKE ${SqlLiteral(likePrefix(requiredValue(rule)))} ESCAPE ${SqlLiteral(LIKE_ESCAPE)}`;
        case 'isnotnull':
            return `EXISTS(${field})`;
        case 'isnull':
            return `NOT EXISTS(${field})`;
        default:
            throw new WorkQueueConfigurationError(`Operator '${String(rule.operator)}' on '${rule.field}' has no Service Bus SQL form`);
    }
}

/** A nested group is only ever an OR of eq on a single field (03 §4.1) → `field IN (...)`. */
function groupSql(group: FilterGroup): { Field: string; Sql: string } {
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
            throw new WorkQueueConfigurationError(`An OR group must stay on a single field; '${field}' is mixed with '${member.field}'`);
        }
        field = member.field;
        values.push(SqlLiteral(requiredValue(member)));
    }
    return { Field: field as string, Sql: `${SqlIdentifier(field as string)} IN (${values.join(', ')})` };
}

/** The subscription filter as a Service Bus SQL filter expression (without the targeting clause). */
export function ToServiceBusSqlFilter(filter: SubscriptionFilter): string {
    if (filter.logic !== 'and') {
        throw new WorkQueueConfigurationError("A subscription filter's top level must use AND (03 §4.1)");
    }
    if (filter.filters.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no SQL form; omit the filter instead');
    }
    const seen = new Set<string>();
    const conditions = filter.filters.map((node) => {
        const entry = isGroup(node) ? groupSql(node) : { Field: node.field, Sql: ruleSql(node) };
        if (seen.has(entry.Field)) {
            throw new WorkQueueConfigurationError(`Filter constrains '${entry.Field}' more than once; combine the conditions into one rule or one OR group`);
        }
        seen.add(entry.Field);
        return entry.Sql;
    });
    return conditions.join(' AND ');
}

/** The clause that keeps retry and replay copies (which carry mj_target) to the one subscription they are for. */
export function TargetingClause(subscriptionName: string): string {
    const target = SqlIdentifier(RUNTIME_PROPERTIES.Target);
    return `(NOT EXISTS(${target}) OR ${target} = ${SqlLiteral(subscriptionName)})`;
}

/** The complete rule SQL for a subscription: targeting clause AND the translated filter (or the clause alone). */
export function ServiceBusRuleSqlFor(filter: SubscriptionFilter | null, subscriptionName: string): string {
    const targeting = TargetingClause(subscriptionName);
    return filter === null || filter.filters.length === 0 ? targeting : `${targeting} AND (${ToServiceBusSqlFilter(filter)})`;
}

/** Whitespace-insensitive form for comparing a live rule with the expected one. */
export function NormalizeRuleSql(sql: string | null | undefined): string | null {
    if (sql === null || sql === undefined) {
        return null;
    }
    const collapsed = sql.replace(/\s+/g, ' ').trim();
    return collapsed === '' ? null : collapsed;
}
