/**
 * Breakpoints a person keeps across runs of one workflow (#3798).
 *
 * A run's breakpoints are task IDs, which are new on every run. What survives a re-run is the step's
 * spec `tempId`, stamped on each task as `Configuration.stepId` at submit. The remembered set is a list
 * of those step IDs, per user and per workflow, in one `MJ: User Settings` key; the host passes it as
 * `taskGraphDebug.breakpointStepIDs` when it starts a debug run, and Submit maps it to the new task IDs.
 */

/** The user-setting key for one workflow (the workflow agent's ID). */
export function RememberedBreakpointsKey(workflowAgentID: string): string {
    return `TaskGraph.Breakpoints/${workflowAgentID.toLowerCase()}`;
}

/** The remembered step IDs from a stored setting; empty for missing or unreadable values. */
export function ParseRememberedBreakpoints(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    } catch {
        return [];
    }
}

/** Adds or removes one step ID, keeping order and never duplicating. */
export function ToggleRememberedStep(current: readonly string[], stepID: string, remember: boolean): string[] {
    const without = current.filter((id) => id !== stepID);
    return remember ? [...without, stepID] : without;
}

/** The stable step ID a task row carries in its `Configuration` JSON, or null. */
export function StepIDOfTask(configuration: string | null | undefined): string | null {
    if (!configuration) return null;
    try {
        const parsed = JSON.parse(configuration) as { stepId?: unknown };
        return typeof parsed?.stepId === 'string' && parsed.stepId.length > 0 ? parsed.stepId : null;
    } catch {
        return null;
    }
}

/** The settings surface the store needs — `UserInfoEngine` in a host, a fake in tests. */
export type RememberedBreakpointsSettingsPort = {
    Get(key: string): string | undefined;
    Set(key: string, value: string): void;
};

/** Reads and writes one workflow's remembered breakpoints through a settings port. */
export class RememberedBreakpointsStore {
    constructor(private readonly settings: RememberedBreakpointsSettingsPort) {}

    public Load(workflowAgentID: string): string[] {
        return ParseRememberedBreakpoints(this.settings.Get(RememberedBreakpointsKey(workflowAgentID)));
    }

    public Toggle(workflowAgentID: string, stepID: string, remember: boolean): string[] {
        const next = ToggleRememberedStep(this.Load(workflowAgentID), stepID, remember);
        this.settings.Set(RememberedBreakpointsKey(workflowAgentID), JSON.stringify(next));
        return next;
    }
}
