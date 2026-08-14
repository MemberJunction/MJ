/**
 * VS Code VARIABLES-style tree for a step's input / output / invocation.
 *
 * Pure: hosts pass JSON strings or already-parsed values; this never fetches.
 */
export type DebugVariableKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export type DebugVariable = {
    Name: string;
    Preview: string;
    Kind: DebugVariableKind;
    Children: DebugVariable[];
};

export type DebugVariableScope = {
    Name: string;
    Variables: DebugVariable[];
};

const MAX_DEPTH = 6;
const MAX_CHILDREN = 80;
const PREVIEW_CHARS = 80;

/** Parse a payload column. A string that is JSON becomes the value; anything else stays a string. */
export function DecodePayload(raw: string | null | undefined): unknown {
    if (raw == null || raw === '') return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

export function BuildVariableScopes(args: {
    input?: unknown;
    output?: unknown;
    invocation?: { data?: unknown; context?: unknown } | null;
}): DebugVariableScope[] {
    const scopes: DebugVariableScope[] = [];
    const inputVars = asObjectVars(args.input);
    if (inputVars.length > 0) scopes.push({ Name: 'Input', Variables: inputVars });
    const outputVars = asObjectVars(args.output);
    if (outputVars.length > 0) scopes.push({ Name: 'Output', Variables: outputVars });
    const inv = args.invocation;
    if (inv && (inv.data !== undefined || inv.context !== undefined)) {
        scopes.push({
            Name: 'Invocation',
            Variables: [
                toVariable('data', inv.data, 0),
                toVariable('context', inv.context, 0),
            ],
        });
    }
    return scopes;
}

function asObjectVars(value: unknown): DebugVariable[] {
    if (value == null) return [];
    if (typeof value === 'object' && !Array.isArray(value)) {
        return Object.entries(value as Record<string, unknown>).map(([k, v]) => toVariable(k, v, 0));
    }
    return [toVariable('(value)', value, 0)];
}

function toVariable(name: string, value: unknown, depth: number): DebugVariable {
    const kind = kindOf(value);
    return {
        Name: name,
        Preview: previewOf(value, kind),
        Kind: kind,
        Children: depth >= MAX_DEPTH ? [] : childrenOf(value, kind, depth + 1),
    };
}

function kindOf(value: unknown): DebugVariableKind {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
}

function previewOf(value: unknown, kind: DebugVariableKind): string {
    switch (kind) {
        case 'null':
            return value === undefined ? 'undefined' : 'null';
        case 'boolean':
        case 'number':
            return String(value);
        case 'string': {
            const text = String(value);
            return text.length > PREVIEW_CHARS ? `"${text.slice(0, PREVIEW_CHARS)}…"` : `"${text}"`;
        }
        case 'array':
            return `Array(${(value as unknown[]).length})`;
        case 'object': {
            const keys = Object.keys(value as Record<string, unknown>);
            return `{${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}`;
        }
    }
}

function childrenOf(value: unknown, kind: DebugVariableKind, depth: number): DebugVariable[] {
    if (kind === 'array') {
        const items = value as unknown[];
        return items.slice(0, MAX_CHILDREN).map((item, i) => toVariable(String(i), item, depth));
    }
    if (kind === 'object') {
        return Object.entries(value as Record<string, unknown>)
            .slice(0, MAX_CHILDREN)
            .map(([k, v]) => toVariable(k, v, depth));
    }
    return [];
}
