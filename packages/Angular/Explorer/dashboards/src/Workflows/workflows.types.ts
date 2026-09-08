/**
 * @fileoverview Shapes the Workflows front door works in.
 *
 * **Vocabulary is load-bearing here (D18).** Nothing a user reads says *graph*, *DAG*, *node* or
 * *Flow Agent* — those survive in metadata and dev docs only. The type names below follow the same
 * rule, because a name that leaks into a template is a name that leaks into the product.
 *
 * @module @memberjunction/ng-dashboards
 */

/**
 * How an author starts a workflow.
 *
 * Three doors, and the order matters: `describe` is pre-selected because it is the only one that
 * needs no prior knowledge of the product. `blank` assumes you already know the shape you want, and
 * `past-run` assumes a good run already happened.
 */
export type WorkflowStartMode = 'blank' | 'describe' | 'past-run';

/** One of the three entry tiles on the front door. */
export type WorkflowStartOption = {
    Mode: WorkflowStartMode;
    Icon: string;
    Title: string;
    /** The one-line promise. */
    Blurb: string;
    /** When this door is the right one — shown smaller, below the blurb. */
    Meta: string;
};

/**
 * The three doors, in the locked order from `mockups/workflow-ux/front-door-v1.html`.
 *
 * Exported so the Playwright structure check asserts against the same source the UI renders from,
 * rather than a second copy that can drift from it.
 */
export const WORKFLOW_START_OPTIONS: readonly WorkflowStartOption[] = [
    {
        Mode: 'blank',
        Icon: 'fa-solid fa-table-cells-large',
        Title: 'Blank canvas',
        Blurb: 'Add steps and connect them yourself.',
        Meta: 'Best when you already know the shape.',
    },
    {
        Mode: 'describe',
        Icon: 'fa-solid fa-wand-magic-sparkles',
        Title: 'Describe it',
        Blurb: 'Say what you want done. We draft the steps; you refine them on the canvas.',
        Meta: 'Nothing is saved until you approve it.',
    },
    {
        Mode: 'past-run',
        Icon: 'fa-solid fa-rotate',
        Title: 'From a past run',
        Blurb: 'Promote something an agent already worked out.',
        Meta: 'Only runs that finished are listed.',
    },
] as const;

/** The door the front door opens on. See {@link WorkflowStartMode}. */
export const DEFAULT_WORKFLOW_START_MODE: WorkflowStartMode = 'describe';

/**
 * A past run offered for promotion.
 *
 * `IsSettled` is carried rather than inferred at render time because it decides *selectability*, and
 * a list that lets you pick an in-flight run would invite promoting a shape that may still change
 * under a retry or a recovery branch — the saved workflow would not be the one that ran.
 */
export type PromotableRun = {
    ID: string;
    Name: string;
    /** Steps in the run — "4 steps". */
    StepCount: number;
    /** Human-readable age — "finished 2 days ago". */
    Age: string;
    /** Who ran it. */
    AgentName: string;
    /** Terminal status text shown on the chip. */
    Status: string;
    IsSettled: boolean;
    /** Present when a step is still waiting on a person — "1 waiting on a person". */
    WaitingNote?: string;
};

/** A saved workflow, as the list shows it. */
export type WorkflowListItem = {
    ID: string;
    Name: string;
    Description: string | null;
    /** `Active` fires; anything else is saved but dormant. */
    Status: string;
    /** How it starts — "On demand" until someone gives it a schedule. */
    TriggerSummary: string;
    UpdatedAt: Date | null;
};

/**
 * What the front door hands back when the author commits.
 *
 * A plain value rather than a persisted row: the front door's whole job is to get someone to the
 * canvas, and "nothing is saved until you approve it" is a promise the tile makes explicitly.
 */
export type WorkflowDraftRequest = {
    Mode: WorkflowStartMode;
    Name: string;
    /** The natural-language brief, for `describe`. */
    Description?: string;
    /** The run being promoted, for `past-run`. */
    SourceRunID?: string;
    /**
     * Steps an agent drafted from {@link Description}, when drafting succeeded.
     *
     * Typed loosely as the graph contract rather than imported here so this file stays free of a
     * dependency on the AI package — the host passes it straight to the canvas.
     */
    Draft?: { workflowName: string; reasoning?: string; tasks: unknown[] };
};
