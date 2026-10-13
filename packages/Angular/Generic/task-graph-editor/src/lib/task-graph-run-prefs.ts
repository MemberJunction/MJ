/**
 * One persisted bag for the run-view chrome the person can resize.
 *
 * A single `MJ: User Settings` key holds a JSON object so adding a field later is a merge, not a
 * new key — and every field is typed. Size and openness stay separate properties on purpose:
 * minimizing the data pane and opening it again must restore the width they dragged to.
 */
import { AsPaneSizePair, type PaneSizePair } from './pane-split';

export const TASK_GRAPH_RUN_PREFS_KEY = 'mj.taskGraphRun.prefs.v1';

export interface TaskGraphRunPrefs {
    /** Left invocation / output pane is expanded. Default minimized. */
    InvocationOpen: boolean;
    /** `[invocation, canvas]` percentages while the left pane is open. */
    InvocationSplit: PaneSizePair;
}

export const DEFAULT_TASK_GRAPH_RUN_PREFS: TaskGraphRunPrefs = {
    InvocationOpen: false,
    InvocationSplit: [22, 78],
};

export type TaskGraphRunPrefsSettingsPort = {
    Get(key: string): string | undefined;
    Set(key: string, value: string): void;
};

function copyDefaults(): TaskGraphRunPrefs {
    return {
        InvocationOpen: DEFAULT_TASK_GRAPH_RUN_PREFS.InvocationOpen,
        InvocationSplit: [...DEFAULT_TASK_GRAPH_RUN_PREFS.InvocationSplit],
    };
}

/** Merge a stored bag onto defaults. Unknown or partial JSON is never fatal. */
export function ParseTaskGraphRunPrefs(raw: string | undefined): TaskGraphRunPrefs {
    const next = copyDefaults();
    if (!raw) return next;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return next;
        const obj = parsed as Record<string, unknown>;
        if (typeof obj['InvocationOpen'] === 'boolean') {
            next.InvocationOpen = obj['InvocationOpen'];
        }
        const split = AsPaneSizePair(obj['InvocationSplit']);
        if (split) next.InvocationSplit = split;
        return next;
    } catch {
        return next;
    }
}

export function SerializeTaskGraphRunPrefs(prefs: TaskGraphRunPrefs): string {
    return JSON.stringify(prefs);
}

/** Restore / write the bag through a settings port so the rules can be unit-tested. */
export class TaskGraphRunPrefsStore {
    public Value: TaskGraphRunPrefs = copyDefaults();

    constructor(private readonly settings: TaskGraphRunPrefsSettingsPort) {}

    public Restore(): void {
        this.Value = ParseTaskGraphRunPrefs(this.settings.Get(TASK_GRAPH_RUN_PREFS_KEY));
    }

    public SetInvocationOpen(open: boolean): void {
        this.Value = { ...this.Value, InvocationOpen: open };
        this.persist();
    }

    public SetInvocationSplit(pair: PaneSizePair): void {
        this.Value = { ...this.Value, InvocationSplit: pair };
        this.persist();
    }

    private persist(): void {
        this.settings.Set(TASK_GRAPH_RUN_PREFS_KEY, SerializeTaskGraphRunPrefs(this.Value));
    }
}
