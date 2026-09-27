import type { TaskOptions } from '@memberjunction/queue';
import type { WorkJson } from '@memberjunction/work-queue-core';

/** Message payload for a legacy queue task routed to the work queue. */
export type LegacyQueueTaskPayload = {
    queueTypeName: string;
    data: WorkJson;
    options: WorkJson;
    /** ID of the user who called QueueManager.AddTask; the handler runs the driver as this user. */
    userID: string | null;
};

/** Plain-JSON copy of a value, or undefined when it holds anything JSON cannot round-trip faithfully. */
export function ToWorkJson(value: unknown): WorkJson | undefined {
    return toWorkJson(value, new Set<object>());
}

export function BuildLegacyQueueTaskPayload(
    queueTypeName: string,
    data: unknown,
    options: unknown,
    userID: string | null,
): LegacyQueueTaskPayload | null {
    const jsonData = data === undefined ? null : ToWorkJson(data);
    const jsonOptions = options === undefined ? null : ToWorkJson(options);
    if (jsonData === undefined || jsonOptions === undefined) {
        return null;
    }
    return { queueTypeName, data: jsonData, options: jsonOptions, userID };
}

export function IsLegacyQueueTaskPayload(value: unknown): value is LegacyQueueTaskPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    const userID = candidate.userID;
    return typeof candidate.queueTypeName === 'string'
        && 'data' in candidate
        && 'options' in candidate
        && (userID === undefined || userID === null || typeof userID === 'string');
}

export function ToTaskOptions(options: WorkJson): TaskOptions {
    if (typeof options !== 'object' || options === null || Array.isArray(options)) {
        return {};
    }
    const priority = options.priority;
    return typeof priority === 'number' ? { priority } : {};
}

function toWorkJson(value: unknown, ancestors: Set<object>): WorkJson | undefined {
    if (value === null) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value !== 'object') {
        return undefined;
    }
    if (ancestors.has(value)) {
        return undefined;
    }
    ancestors.add(value);
    try {
        return Array.isArray(value) ? arrayToWorkJson(value, ancestors) : objectToWorkJson(value, ancestors);
    } finally {
        ancestors.delete(value);
    }
}

function arrayToWorkJson(values: unknown[], ancestors: Set<object>): WorkJson | undefined {
    const items: WorkJson[] = [];
    for (const item of values) {
        const json = toWorkJson(item, ancestors);
        if (json === undefined) {
            return undefined;
        }
        items.push(json);
    }
    return items;
}

function objectToWorkJson(value: object, ancestors: Set<object>): WorkJson | undefined {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        return undefined;
    }
    const result: { [key: string]: WorkJson } = {};
    for (const [key, item] of Object.entries(value)) {
        if (item === undefined) {
            continue;
        }
        const json = toWorkJson(item, ancestors);
        if (json === undefined) {
            return undefined;
        }
        result[key] = json;
    }
    return result;
}
