/**
 * Parent-bag readers and breakpoint-set math for the workflow run console.
 *
 * Lives here — not in `@memberjunction/task-graph` — because that package is the engine and this
 * surface is a widgets/surface host. The shape matches `TaskGraphDebugState` / the invocation
 * envelope on the parent `InputPayload`. Unparseable input is "not being debugged", never a throw.
 */
import { UUIDsEqual } from '@memberjunction/global';

export type WorkflowRunDebugState = {
    paused: boolean;
    pausedReason: 'user' | 'breakpoint' | null;
    pausedAtTaskID: string | null;
    breakpoints: string[];
    edgeOverrides: Record<string, 'true' | 'false'>;
};

export type WorkflowRunInvocation = {
    data?: unknown;
    context?: unknown;
};

export type WorkflowRunParentBag = {
    debug: WorkflowRunDebugState;
    invocation: WorkflowRunInvocation;
};

export type WorkflowStall = {
    kind: 'held' | 'worker-lost' | 'step-refused' | 'control-error';
    message: string;
    taskName?: string;
    taskID?: string;
    edgeID?: string;
    conditionText?: string;
    reason?: string;
};

const EMPTY_DEBUG: WorkflowRunDebugState = {
    paused: false,
    pausedReason: null,
    pausedAtTaskID: null,
    breakpoints: [],
    edgeOverrides: {},
};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EmptyDebugState(): WorkflowRunDebugState {
    return { ...EMPTY_DEBUG, breakpoints: [], edgeOverrides: {} };
}

export function ParseWorkflowRunParentBag(raw: string | null | undefined): WorkflowRunParentBag {
    const empty: WorkflowRunParentBag = { debug: EmptyDebugState(), invocation: {} };
    if (!raw) return empty;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return empty;
        return {
            debug: readDebug(parsed['debug']),
            invocation: readInvocation(parsed['invocation']),
        };
    } catch {
        return empty;
    }
}

export function ComposeBreakpointSet(
    current: readonly string[],
    taskID: string,
    enabled: boolean,
): string[] {
    const has = current.some((id) => UUIDsEqual(id, taskID));
    if (enabled) return has ? [...current] : [...current, taskID];
    return current.filter((id) => !UUIDsEqual(id, taskID));
}

export function TryParseJsonObject(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    const trimmed = text.trim();
    if (!trimmed) return { ok: true, value: {} };
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, error: 'Input must be a JSON object.' };
        }
        return { ok: true, value: parsed as Record<string, unknown> };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
    }
}

function readDebug(raw: unknown): WorkflowRunDebugState {
    const state = EmptyDebugState();
    if (!raw || typeof raw !== 'object') return state;
    const d = raw as Record<string, unknown>;
    if (d['paused'] === true || d['paused'] === 'true') state.paused = true;
    if (d['pausedReason'] === 'user' || d['pausedReason'] === 'breakpoint') state.pausedReason = d['pausedReason'];
    if (typeof d['pausedAtTaskID'] === 'string') state.pausedAtTaskID = d['pausedAtTaskID'];
    if (Array.isArray(d['breakpoints'])) {
        state.breakpoints = d['breakpoints'].filter((b): b is string => typeof b === 'string' && UUID_SHAPE.test(b));
    }
    if (d['edgeOverrides'] && typeof d['edgeOverrides'] === 'object') {
        for (const [edgeID, verdict] of Object.entries(d['edgeOverrides'] as Record<string, unknown>)) {
            if (UUID_SHAPE.test(edgeID) && (verdict === 'true' || verdict === 'false')) {
                state.edgeOverrides[edgeID] = verdict;
            }
        }
    }
    return state;
}

function readInvocation(raw: unknown): WorkflowRunInvocation {
    if (!raw || typeof raw !== 'object') return {};
    const inv = raw as Record<string, unknown>;
    const out: WorkflowRunInvocation = {};
    if ('data' in inv) out.data = inv['data'];
    if ('context' in inv) out.context = inv['context'];
    return out;
}
