/**
 * Host-side debug helpers for a live graph. Paint + intent only — no Remote Operations.
 *
 * Both the test harness and the Explorer run console compose a breakpoint set and read `$.debug`
 * off the parent row. The math lives here so those hosts cannot drift, and so a widgets-layer
 * embed never has to import Explorer.
 */
import { UUIDsEqual } from '@memberjunction/global';

export type WorkflowDebugOverlayState = {
    paused: boolean;
    pausedAtTaskID: string | null;
    breakpoints: string[];
    edgeOverrides: Record<string, 'true' | 'false'>;
};

const EMPTY: WorkflowDebugOverlayState = {
    paused: false,
    pausedAtTaskID: null,
    breakpoints: [],
    edgeOverrides: {},
};

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function EmptyWorkflowDebugOverlay(): WorkflowDebugOverlayState {
    return { ...EMPTY, breakpoints: [], edgeOverrides: {} };
}

export type WorkflowInvocationRoots = {
    data?: unknown;
    context?: unknown;
};

/** The parent task id a TaskGraph step records when Submit succeeds. */
export function ParentTaskIDFromStepOutput(
    outputData: string | Record<string, unknown> | null | undefined,
): string | null {
    if (outputData == null) return null;
    if (typeof outputData === 'object' && !Array.isArray(outputData)) {
        const id = outputData['parentTaskID'];
        return typeof id === 'string' && id.length > 0 ? id : null;
    }
    if (typeof outputData !== 'string' || outputData.length === 0) return null;
    try {
        const parsed = JSON.parse(outputData) as { parentTaskID?: unknown };
        return typeof parsed?.parentTaskID === 'string' && parsed.parentTaskID.length > 0
            ? parsed.parentTaskID
            : null;
    } catch {
        return null;
    }
}

/** The flow dialect's `data` / `context` roots, from the parent bag. */
export function ParseWorkflowInvocation(raw: string | null | undefined): WorkflowInvocationRoots {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw) as { invocation?: unknown };
        if (!parsed || typeof parsed !== 'object' || !parsed.invocation || typeof parsed.invocation !== 'object') {
            return {};
        }
        const inv = parsed.invocation as Record<string, unknown>;
        const out: WorkflowInvocationRoots = {};
        if ('data' in inv) out.data = inv['data'];
        if ('context' in inv) out.context = inv['context'];
        return out;
    } catch {
        return {};
    }
}

/**
 * Reads `$.debug` from a parent task's `InputPayload`. Unparseable input is "not being
 * debugged" — never a throw.
 */
export function ParseWorkflowDebugOverlay(raw: string | null | undefined): WorkflowDebugOverlayState {
    const state = EmptyWorkflowDebugOverlay();
    if (!raw) return state;
    try {
        const parsed = JSON.parse(raw) as { debug?: unknown };
        if (!parsed || typeof parsed !== 'object' || !parsed.debug || typeof parsed.debug !== 'object') {
            return state;
        }
        const d = parsed.debug as Record<string, unknown>;
        if (d['paused'] === true || d['paused'] === 'true') state.paused = true;
        if (typeof d['pausedAtTaskID'] === 'string') state.pausedAtTaskID = d['pausedAtTaskID'];
        if (Array.isArray(d['breakpoints'])) {
            state.breakpoints = d['breakpoints'].filter(
                (b): b is string => typeof b === 'string' && UUID_SHAPE.test(b),
            );
        }
        if (d['edgeOverrides'] && typeof d['edgeOverrides'] === 'object') {
            for (const [edgeID, verdict] of Object.entries(d['edgeOverrides'] as Record<string, unknown>)) {
                if (UUID_SHAPE.test(edgeID) && (verdict === 'true' || verdict === 'false')) {
                    state.edgeOverrides[edgeID] = verdict;
                }
            }
        }
        return state;
    } catch {
        return state;
    }
}

/** Union / difference for the next `SetBreakpoints` payload. UUID-case insensitive. */
export function ComposeBreakpointSet(
    current: readonly string[],
    taskID: string,
    enabled: boolean,
): string[] {
    const has = current.some((id) => UUIDsEqual(id, taskID));
    if (enabled) return has ? [...current] : [...current, taskID];
    return current.filter((id) => !UUIDsEqual(id, taskID));
}
