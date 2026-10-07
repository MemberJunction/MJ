/**
 * @fileoverview Type guards for the host-supplied extras that ride `ExecuteAgentParams.data` into a bridged
 * realtime session (`realtimeHostTools`, `realtimeHostFraming`, `realtimePriorTranscript`, `conversationId`).
 *
 * `data` is an open bag, so a value of the wrong shape is possible (a host bug, a stale caller). A malformed
 * value is ignored and logged rather than thrown on, so one bad optional extra cannot fail a call.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { LogError } from '@memberjunction/core';
import type { RealtimeToolDefinition } from '@memberjunction/ai';

/** Whether a value is a well-formed tool definition (a name, a description, and an object parameter schema). */
function isToolDefinition(value: unknown): value is RealtimeToolDefinition {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const candidate = value as Partial<Record<keyof RealtimeToolDefinition, unknown>>;
    return (
        typeof candidate.Name === 'string' &&
        candidate.Name.trim().length > 0 &&
        typeof candidate.Description === 'string' &&
        typeof candidate.ParametersSchema === 'object' &&
        candidate.ParametersSchema !== null &&
        !Array.isArray(candidate.ParametersSchema)
    );
}

/**
 * Reads `data.realtimeHostTools`. Absent yields `undefined`; a value that is not an array of well-formed tool
 * definitions is ignored (logged) as a whole, so the model never sees a half-valid tool set.
 */
export function ReadHostTools(value: unknown): RealtimeToolDefinition[] | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!Array.isArray(value) || !value.every(isToolDefinition)) {
        LogError('[BridgeRealtime] ignoring malformed realtimeHostTools (expected an array of { Name, Description, ParametersSchema }).');
        return undefined;
    }
    return value.length > 0 ? value : undefined;
}

/**
 * Reads a trimmed, non-empty string from the data bag. Absent or blank yields `undefined`; a non-string value is
 * ignored and logged under `name`.
 */
export function ReadTrimmedString(value: unknown, name: string): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== 'string') {
        LogError(`[BridgeRealtime] ignoring ${name}: expected a string, got ${typeof value}.`);
        return undefined;
    }
    return value.trim() || undefined;
}
