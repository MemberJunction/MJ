/**
 * Parent-bag readers and breakpoint-set math for the workflow run console.
 *
 * Lives here — not in `@memberjunction/task-graph` — because that package is the engine and this
 * surface is a widgets/surface host. The shape matches `TaskGraphDebugState` / the invocation
 * envelope on the parent `InputPayload`. Unparseable input is "not being debugged", never a throw.
 */
export type WorkflowRunDebugState = {
    paused: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    pausedReason: 'user' | 'breakpoint' | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    pausedAtTaskID: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    breakpoints: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    edgeOverrides: Record<string, 'true' | 'false'>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type WorkflowRunInvocation = {
    data?: unknown;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    context?: unknown;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type WorkflowRunParentBag = {
    Debug: WorkflowRunDebugState;
    Invocation: WorkflowRunInvocation;
};

export type WorkflowStall = {
    kind: 'held' | 'worker-lost' | 'step-refused' | 'control-error';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    message: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    taskName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    taskID?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    edgeID?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    conditionText?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    reason?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
    const empty: WorkflowRunParentBag = { Debug: EmptyDebugState(), Invocation: {} };
    if (!raw) return empty;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object') return empty;
        return {
            Debug: readDebug(parsed['debug']),
            Invocation: readInvocation(parsed['invocation']),
        };
    } catch {
        return empty;
    }
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
