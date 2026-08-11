/**
 * @fileoverview Pane sizes and panel visibility for a run surface — pure, so it can be checked.
 *
 * **Why this is not a handful of fields on the component.** Every rule here fails quietly when it is
 * wrong: a stored size that no longer makes sense restores a pane the user cannot find, a close and
 * reopen silently discards the width they dragged to, and a size written from an auto-sized area
 * fails validation on the next read and resets the layout for good. None of that throws, and none of
 * it is visible in a screenshot — it shows up days later as "why does this keep resetting".
 *
 * Angular is deliberately absent so the rules can be exercised in a node test rather than through a
 * TestBed, which would test Angular instead.
 */

/** Where preferences live. Injected so the rules can be tested without the settings engine. */
export type LayoutSettingsPort = {
    Get(key: string): string | undefined;
    Set(key: string, value: string): void;
};

/** A two-pane split, as percentages. */
export type SizePair = [number, number];

/**
 * Preference keys.
 *
 * `mj.<feature>.<pref>` per the repo convention, versioned because the shape may change and a future
 * reader needs to be able to tell an old value from a new one rather than mis-parsing it.
 */
export const WORKFLOW_RUN_LAYOUT_KEYS = {
    Split: 'mj.workflowRuns.splitSizes.v1',
    StepSplit: 'mj.workflowRuns.stepSplitSizes.v1',
    StepPanelOpen: 'mj.workflowRuns.stepPanelOpen.v1',
    ShowLegend: 'mj.workflowRuns.showLegend.v1',
} as const;

/** A pane narrower than this is one the user cannot get hold of again. */
const MIN_USABLE_PERCENT = 5;

/**
 * A stored size pair, or null when it is absent or unusable.
 *
 * Validated rather than trusted. A stored value can predate a layout change or have been hand-edited,
 * and restoring a pane to 0% — or to NaN — leaves someone with no obvious way to recover it. Falling
 * back to the default is always recoverable, so an unreadable preference is treated as no preference.
 */
export function ReadSizePair(raw: string | undefined): SizePair | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length !== 2) return null;
        const [a, b] = parsed as unknown[];
        if (typeof a !== 'number' || typeof b !== 'number') return null;
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        if (a < MIN_USABLE_PERCENT || b < MIN_USABLE_PERCENT) return null;
        return [a, b];
    } catch {
        return null;
    }
}

/**
 * A drag's reported sizes as a storable pair, or null.
 *
 * angular-split reports `'*'` for an area with no explicit size. Storing that produces a value that
 * fails {@link ReadSizePair} on the next visit — so the layout would appear to save and then reset,
 * which is worse than not saving at all.
 */
export function ToSizePair(sizes: readonly (number | '*')[]): SizePair | null {
    if (sizes.length !== 2) return null;
    const [a, b] = sizes;
    return typeof a === 'number' && typeof b === 'number' ? [a, b] : null;
}

/**
 * The Runs surface's layout, and its persistence.
 *
 * Size and openness are stored **separately** on purpose: closing the step panel and reopening it
 * must return the pane to the width someone dragged it to, not to a default. Resetting a size the
 * user chose is the small betrayal that stops people using a control at all.
 */
export class WorkflowRunLayout {
    /** [list, detail] percentages. */
    public SplitSizes: SizePair = [40, 60];
    /** [canvas, step JSON] percentages, remembered even while the panel is closed. */
    public StepSplitSizes: SizePair = [60, 40];
    public StepPanelOpen = true;
    /**
     * Whether the canvas legend shows. **Off by default in a run.**
     *
     * The legend explains the authoring vocabulary — what a conditional edge means, what a duplicate
     * default looks like — which is what someone drawing a graph needs. A run view answers a
     * different question, "what happened", which the legend helps with not at all while covering a
     * corner of the canvas the graph is usually occupying.
     */
    public ShowLegend = false;

    constructor(private readonly settings: LayoutSettingsPort) {}

    /** Applies the saved layout, ignoring anything no longer usable. */
    public Restore(): void {
        this.SplitSizes = ReadSizePair(this.settings.Get(WORKFLOW_RUN_LAYOUT_KEYS.Split)) ?? this.SplitSizes;
        this.StepSplitSizes = ReadSizePair(this.settings.Get(WORKFLOW_RUN_LAYOUT_KEYS.StepSplit)) ?? this.StepSplitSizes;
        // Absent means open — the panel is the point of selecting a step, so the default is to show
        // it and only a recorded "closed" hides it.
        this.StepPanelOpen = this.settings.Get(WORKFLOW_RUN_LAYOUT_KEYS.StepPanelOpen) !== 'false';
        this.ShowLegend = this.settings.Get(WORKFLOW_RUN_LAYOUT_KEYS.ShowLegend) === 'true';
    }

    public OnSplitDragEnd(sizes: readonly (number | '*')[]): void {
        const pair = ToSizePair(sizes);
        if (!pair) return;
        this.SplitSizes = pair;
        this.settings.Set(WORKFLOW_RUN_LAYOUT_KEYS.Split, JSON.stringify(pair));
    }

    public OnStepSplitDragEnd(sizes: readonly (number | '*')[]): void {
        const pair = ToSizePair(sizes);
        if (!pair) return;
        this.StepSplitSizes = pair;
        this.settings.Set(WORKFLOW_RUN_LAYOUT_KEYS.StepSplit, JSON.stringify(pair));
    }

    public ToggleStepPanel(): void {
        this.SetStepPanelOpen(!this.StepPanelOpen);
    }

    /** Opens or closes the panel. The size is untouched — see the class note. */
    public SetStepPanelOpen(open: boolean): void {
        this.StepPanelOpen = open;
        this.settings.Set(WORKFLOW_RUN_LAYOUT_KEYS.StepPanelOpen, String(open));
    }

    public ToggleLegend(): void {
        this.ShowLegend = !this.ShowLegend;
        this.settings.Set(WORKFLOW_RUN_LAYOUT_KEYS.ShowLegend, String(this.ShowLegend));
    }
}
