/**
 * @file JsonRemapEngine.ts
 * Path-based JSON key remapping, regeneration, and container cleanup.
 * Client-safe with built-in presets for dashboard UI configs and scheduled jobs.
 * @see plans/record-cloning/README.md §7.6, §13.1
 */

import { CloneWarning } from './types';

export type JsonRemapMode = 'remap' | 'reuse' | 'regenerate' | 'null' | 'drop';

export interface JsonRemapRule {
    Path: string;
    Mode: JsonRemapMode;
    TargetEntityName?: string;
    OnMissing?: 'reuse' | 'drop';
    CleanEmptyContainers?: boolean;
}

export interface JsonRemapOptions {
    Rules?: JsonRemapRule[];
    Preset?: 'dashboard-ui-config' | 'scheduled-job-configuration';
    KeyMap?: Record<string, string>;
    OnMalformed?: 'block' | 'copy' | 'null';
    CleanEmptyContainers?: boolean;
}

export interface JsonRemapResult {
    Success: boolean;
    Output: unknown;
    JsonString: string;
    DropCount: number;
    PathsModified: string[];
    Blocked: boolean;
    Warning?: CloneWarning;
}

export function GenerateUUID(): string {
    if (
        typeof globalThis !== 'undefined' &&
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === 'function'
    ) {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Built-in presets for common MemberJunction JSON columns.
 */
export const JSON_REMAP_PRESETS: Record<string, JsonRemapRule[]> = {
    'dashboard-ui-config': [
        { Path: 'content[*].id', Mode: 'regenerate' },
        { Path: 'content[*].content[*].id', Mode: 'regenerate' },
        { Path: 'content[*].componentState.config.viewId', Mode: 'remap', OnMissing: 'reuse' },
        { Path: 'content[*].componentState.config.queryId', Mode: 'remap', OnMissing: 'reuse' },
        { Path: 'content[*].content[*].componentState.config.viewId', Mode: 'remap', OnMissing: 'reuse' },
        { Path: 'content[*].content[*].componentState.config.queryId', Mode: 'remap', OnMissing: 'reuse' },
    ],
    'scheduled-job-configuration': [
        { Path: 'ConversationID', Mode: 'null' },
        { Path: 'ActionParamID', Mode: 'remap', OnMissing: 'reuse' },
        { Path: 'Params[*].ActionParamID', Mode: 'remap', OnMissing: 'reuse' },
        { Path: 'Params[*].ParamID', Mode: 'remap', OnMissing: 'reuse' },
    ],
};

/**
 * Parses and executes JSON remap rules on an input JSON string or object.
 */
export function ApplyJsonRemap(
    input: string | Record<string, unknown> | unknown[],
    options: JsonRemapOptions
): JsonRemapResult {
    const onMalformed = options.OnMalformed || 'block';
    let data: unknown;
    const isStringInput = typeof input === 'string';

    if (isStringInput) {
        if (!input || input.trim() === '') {
            return {
                Success: true,
                Output: input,
                JsonString: input,
                DropCount: 0,
                PathsModified: [],
                Blocked: false,
            };
        }
        try {
            data = JSON.parse(input);
        } catch (err) {
            if (onMalformed === 'copy') {
                return {
                    Success: true,
                    Output: input,
                    JsonString: input,
                    DropCount: 0,
                    PathsModified: [],
                    Blocked: false,
                    Warning: {
                        Code: 'PAYLOAD_DROPPED',
                        Severity: 'Warning',
                        Message: 'Malformed JSON copied as-is per OnMalformed="copy".',
                    },
                };
            }
            if (onMalformed === 'null') {
                return {
                    Success: true,
                    Output: null,
                    JsonString: 'null',
                    DropCount: 0,
                    PathsModified: [],
                    Blocked: false,
                    Warning: {
                        Code: 'PAYLOAD_DROPPED',
                        Severity: 'Warning',
                        Message: 'Malformed JSON nulled per OnMalformed="null".',
                    },
                };
            }
            return {
                Success: false,
                Output: input,
                JsonString: input,
                DropCount: 0,
                PathsModified: [],
                Blocked: true,
                Warning: {
                    Code: 'PAYLOAD_DROPPED',
                    Severity: 'Error',
                    Message: `Payload is malformed JSON and cannot be remapped: ${String(err)}`,
                },
            };
        }
    } else {
        // Clone input object so we don't mutate caller's state
        data = JSON.parse(JSON.stringify(input));
    }

    // Assemble rules from preset and explicit rules
    let rules: JsonRemapRule[] = [];
    if (options.Preset && JSON_REMAP_PRESETS[options.Preset]) {
        rules.push(...JSON_REMAP_PRESETS[options.Preset]);
    }
    if (options.Rules) {
        rules.push(...options.Rules);
    }

    let dropCount = 0;
    const pathsModified = new Set<string>();
    const keyMap = options.KeyMap || {};
    const globalCleanEmpty = options.CleanEmptyContainers ?? true;

    for (const rule of rules) {
        const segments = rule.Path.split('.');
        const ruleCleanEmpty = rule.CleanEmptyContainers ?? globalCleanEmpty;

        const processSegments = (current: unknown, segIdx: number, currentPath: string): { modified: boolean; dropped: boolean } => {
            if (current === null || current === undefined || typeof current !== 'object') {
                return { modified: false, dropped: false };
            }

            const segment = segments[segIdx];
            const isLast = segIdx === segments.length - 1;
            const isArraySegment = segment.endsWith('[*]');
            const propName = isArraySegment ? segment.slice(0, -3) : segment;

            if (isLast) {
                if (isArraySegment) {
                    const arr = (current as Record<string, unknown>)[propName];
                    if (Array.isArray(arr)) {
                        let anyModified = false;
                        for (let i = arr.length - 1; i >= 0; i--) {
                            const item = arr[i];
                            const itemResult = evaluateTerminal(item, rule, keyMap);
                            if (itemResult.action === 'drop') {
                                arr.splice(i, 1);
                                dropCount++;
                                anyModified = true;
                                pathsModified.add(`${currentPath}.${propName}[${i}]`);
                            } else if (itemResult.action === 'update') {
                                arr[i] = itemResult.newValue;
                                anyModified = true;
                                pathsModified.add(`${currentPath}.${propName}[${i}]`);
                            }
                        }
                        if (ruleCleanEmpty && arr.length === 0) {
                            delete (current as Record<string, unknown>)[propName];
                            pathsModified.add(`${currentPath}.${propName}`);
                        }
                        return { modified: anyModified, dropped: false };
                    }
                } else {
                    const obj = current as Record<string, unknown>;
                    if (propName in obj) {
                        const val = obj[propName];
                        const itemResult = evaluateTerminal(val, rule, keyMap);
                        if (itemResult.action === 'drop') {
                            delete obj[propName];
                            dropCount++;
                            pathsModified.add(`${currentPath}.${propName}`);
                            return { modified: true, dropped: true };
                        } else if (itemResult.action === 'update') {
                            obj[propName] = itemResult.newValue;
                            pathsModified.add(`${currentPath}.${propName}`);
                            return { modified: true, dropped: false };
                        }
                    }
                }
                return { modified: false, dropped: false };
            }

            // Intermediate segment
            if (isArraySegment) {
                const arr = (current as Record<string, unknown>)[propName];
                if (Array.isArray(arr)) {
                    let anyModified = false;
                    for (let i = arr.length - 1; i >= 0; i--) {
                        const nextPath = `${currentPath}.${propName}[${i}]`;
                        const res = processSegments(arr[i], segIdx + 1, nextPath);
                        if (res.dropped) {
                            arr.splice(i, 1);
                            anyModified = true;
                        } else if (res.modified) {
                            anyModified = true;
                        }
                    }
                    if (ruleCleanEmpty && arr.length === 0) {
                        delete (current as Record<string, unknown>)[propName];
                        pathsModified.add(`${currentPath}.${propName}`);
                    }
                    return { modified: anyModified, dropped: false };
                }
            } else {
                const obj = current as Record<string, unknown>;
                if (propName in obj && obj[propName] !== null && typeof obj[propName] === 'object') {
                    const nextPath = `${currentPath}.${propName}`;
                    const res = processSegments(obj[propName], segIdx + 1, nextPath);
                    if (ruleCleanEmpty && Object.keys(obj[propName] as Record<string, unknown>).length === 0) {
                        delete obj[propName];
                        pathsModified.add(`${currentPath}.${propName}`);
                        return { modified: true, dropped: true };
                    }
                    return res;
                }
            }

            return { modified: false, dropped: false };
        };

        processSegments(data, 0, '$');
    }

    const outputJson = JSON.stringify(data);
    return {
        Success: true,
        Output: data,
        JsonString: outputJson,
        DropCount: dropCount,
        PathsModified: Array.from(pathsModified),
        Blocked: false,
    };
}

function evaluateTerminal(
    val: unknown,
    rule: JsonRemapRule,
    keyMap: Record<string, string>
): { action: 'keep' | 'update' | 'drop'; newValue?: unknown } {
    const mode = rule.Mode;

    if (mode === 'reuse') {
        return { action: 'keep' };
    }

    if (mode === 'null') {
        return { action: 'update', newValue: null };
    }

    if (mode === 'drop') {
        return { action: 'drop' };
    }

    if (mode === 'regenerate') {
        return { action: 'update', newValue: GenerateUUID() };
    }

    if (mode === 'remap') {
        if (typeof val === 'string' && val in keyMap) {
            return { action: 'update', newValue: keyMap[val] };
        }
        if (rule.OnMissing === 'drop') {
            return { action: 'drop' };
        }
        return { action: 'keep' };
    }

    return { action: 'keep' };
}
