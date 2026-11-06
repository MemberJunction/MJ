import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { WorkJson } from '@memberjunction/work-queue-core';
import { IsWorkJson } from '../json';
import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';

export interface FieldIssue {
    Field: string;
    Message: string;
    Value: string | number | null;
}

const TOPIC_NAME_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** Parses a JSON-object column. Null or blank text is an empty object. */
export function ParseJsonObject(json: string | null, subject: string): Record<string, WorkJson> {
    if (json === null || json.trim() === '') {
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        throw new WorkQueueConfigurationError(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !IsWorkJson(parsed)) {
        throw new WorkQueueConfigurationError(`${subject} must be a JSON object`);
    }
    const result: Record<string, WorkJson> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (IsWorkJson(value)) {
            result[key] = value;
        }
    }
    return result;
}

/** Field rules that need no transport driver; everything that does is `WorkQueueEngine.ValidateTopology`. */
export function ValidateTransportFields(row: TransportRow): FieldIssue[] {
    return JsonObjectIssue('Configuration', row.Configuration, `Transport ${row.Name} Configuration`);
}

export function ValidateTopicFields(row: TopicRow): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (!TOPIC_NAME_PATTERN.test(row.Name ?? '')) {
        issues.push({ Field: 'Name', Message: 'Topic names are dotted lowercase words, for example email.events', Value: row.Name });
    }
    issues.push(...JsonObjectIssue('BindingConfig', row.BindingConfig, `Topic ${row.Name} BindingConfig`));
    return issues;
}

export function ValidateSubscriptionFields(row: SubscriptionRow): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (row.HostType === 'MJWorker' && (row.HandlerKey ?? '').trim() === '') {
        issues.push({ Field: 'HandlerKey', Message: 'MJWorker subscriptions require a HandlerKey', Value: row.HandlerKey });
    }
    try {
        // Structural check only: the whole queue-wide subset (03 §4.1). ValidateTopologyRows re-parses with the
        // target transport's FilterSupport, so a filter the broker cannot express is caught there, not here.
        ParseSubscriptionFilter(row.Filter, WORK_QUEUE_FILTER_SUPPORT);
    } catch (error) {
        issues.push({ Field: 'Filter', Message: error instanceof Error ? error.message : String(error), Value: row.Filter });
    }
    if (row.BackoffMaxSeconds < row.BackoffBaseSeconds) {
        issues.push({ Field: 'BackoffMaxSeconds', Message: 'BackoffMaxSeconds must be at least BackoffBaseSeconds', Value: row.BackoffMaxSeconds });
    }
    if (row.MaxProcessingSeconds !== null && row.MaxProcessingSeconds <= 0) {
        issues.push({ Field: 'MaxProcessingSeconds', Message: 'MaxProcessingSeconds must be positive when set', Value: row.MaxProcessingSeconds });
    }
    issues.push(...JsonObjectIssue('BindingConfig', row.BindingConfig, `Subscription ${row.Name} BindingConfig`));
    return issues;
}

function JsonObjectIssue(field: string, json: string | null, subject: string): FieldIssue[] {
    try {
        ParseJsonObject(json, subject);
        return [];
    } catch (error) {
        return [{ Field: field, Message: error instanceof Error ? error.message : String(error), Value: json }];
    }
}
