import { WorkQueueConfigurationError, type FilterGroup, type FilterRule, type SubscriptionFilter } from '@memberjunction/work-queue-core';

/** SNS limit on value combinations across a policy's keys. Verify against current AWS quotas. */
export const SNS_MAX_FILTER_COMBINATIONS = 150;

type PolicyValue = string | { prefix: string } | { exists: boolean } | { 'anything-but': string[] };

interface FieldEntry {
    Field: string;
    Values: PolicyValue[];
}

function isGroup(node: FilterRule | FilterGroup): node is FilterGroup {
    return (node as FilterGroup).logic !== undefined;
}

function requiredValue(rule: FilterRule): string {
    if (rule.value === null || rule.value === undefined) {
        throw new WorkQueueConfigurationError(`Filter rule on '${rule.field}' with operator '${rule.operator}' has no value`);
    }
    return String(rule.value);
}

/** One rule → the values SNS matches for that attribute (03 §4.1). */
function ruleEntry(rule: FilterRule): FieldEntry {
    switch (rule.operator) {
        case 'eq':
            return { Field: rule.field, Values: [requiredValue(rule)] };
        case 'neq':
            return { Field: rule.field, Values: [{ 'anything-but': [requiredValue(rule)] }] };
        case 'startswith':
            return { Field: rule.field, Values: [{ prefix: requiredValue(rule) }] };
        case 'isnotnull':
            return { Field: rule.field, Values: [{ exists: true }] };
        case 'isnull':
            return { Field: rule.field, Values: [{ exists: false }] };
        default:
            throw new WorkQueueConfigurationError(
                `Operator '${String(rule.operator)}' on '${rule.field}' has no SNS filter-policy form`,
            );
    }
}

/** A nested group is only ever an OR of eq on a single field (03 §4.1). */
function groupEntry(group: FilterGroup): FieldEntry {
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
    return { Field: field as string, Values: values };
}

/** JSON with object keys sorted at every level; arrays keep their order. */
function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function ToSnsFilterPolicy(filter: SubscriptionFilter): string {
    if (filter.logic !== 'and') {
        throw new WorkQueueConfigurationError("A subscription filter's top level must use AND (03 §4.1)");
    }
    if (filter.filters.length === 0) {
        throw new WorkQueueConfigurationError('An empty filter has no SNS filter policy; omit the policy instead');
    }
    const policy: Record<string, PolicyValue[]> = {};
    for (const node of filter.filters) {
        const entry = isGroup(node) ? groupEntry(node) : ruleEntry(node);
        if (policy[entry.Field] !== undefined) {
            throw new WorkQueueConfigurationError(
                `Filter constrains '${entry.Field}' more than once; SNS reads an attribute's values as OR, so two AND rules on one attribute cannot be expressed`,
            );
        }
        policy[entry.Field] = entry.Values;
    }
    const combinations = Object.values(policy).reduce((product, values) => product * Math.max(1, values.length), 1);
    if (combinations > SNS_MAX_FILTER_COMBINATIONS) {
        throw new WorkQueueConfigurationError(
            `Filter produces ${combinations} value combinations; SNS allows at most ${SNS_MAX_FILTER_COMBINATIONS}`,
        );
    }
    return canonicalJson(policy);
}

export function SnsFilterPolicyFor(filter: SubscriptionFilter | null): string | null {
    return filter === null || filter.filters.length === 0 ? null : ToSnsFilterPolicy(filter);
}

export function NormalizeSnsFilterPolicy(json: string | null | undefined): string | null {
    if (json === null || json === undefined || json.trim() === '') {
        return null;
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
        return null;
    }
    return canonicalJson(parsed);
}
