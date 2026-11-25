/**
 * @fileoverview Shapes the Workflows app works in.
 *
 * **Vocabulary is load-bearing here (D18).** Nothing a user reads says *graph*, *DAG*, *node* or
 * *Flow Agent* — those survive in metadata and dev docs only.
 *
 * @module @memberjunction/ng-dashboards
 */
import type { MJAIAgentEntity, MJTaskEntity } from '@memberjunction/core-entities';
import type { BlueprintSvgLayout, RunSparkBar } from './workflow-blueprint.util';

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

/** The door the front door opens on. */
export const DEFAULT_WORKFLOW_START_MODE: WorkflowStartMode = 'describe';

/** Starter recipe chip on the Create Front Door (pure D18 vocabulary). */
export type WorkflowStarterRecipe = {
    ID: string;
    Label: string;
    Icon: string;
    Name: string;
    Prompt: string;
};

export const WORKFLOW_STARTER_RECIPES: readonly WorkflowStarterRecipe[] = [
    {
        ID: 'support-digest',
        Label: 'Weekly Support Digest',
        Icon: 'fa-solid fa-inbox',
        Name: 'Weekly Support Digest',
        Prompt: 'Pull the last 7 days of support tickets, cluster the top recurring themes with an AI step, ask a team lead to review via a person step, and send the summary email.',
    },
    {
        ID: 'invoice-approval',
        Label: 'Invoice Approval',
        Icon: 'fa-solid fa-file-invoice-dollar',
        Name: 'Invoice Approval Pipeline',
        Prompt: 'Extract vendor and line items from an incoming invoice, verify amounts against purchase orders, route invoices over $5,000 to a finance manager person step, and post approved entries to accounting.',
    },
    {
        ID: 'lead-enrichment',
        Label: 'Lead Enrichment',
        Icon: 'fa-solid fa-user-plus',
        Name: 'Lead Enrichment & Routing',
        Prompt: 'Enrich new inbound leads with company profile details, score fit against our ideal customer rubric, and route high-priority leads to the territory owner while archiving low-fit entries.',
    },
    {
        ID: 'incident-triage',
        Label: 'Incident Triage',
        Icon: 'fa-solid fa-shield-halved',
        Name: 'Incident Triage & Escalation',
        Prompt: 'Collect recent error logs, classify severity and root-cause hypothesis, page on-call for critical issues after a quick person verification step, and open a tracked follow-up item.',
    },
] as const;

/** A past run offered for promotion. */
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
    Status: MJTaskEntity['Status'] | string;
    IsSettled: boolean;
    /** Present when a step is still waiting on a person — "1 waiting on a person". */
    WaitingNote?: string;
    /** Elapsed duration string. */
    Duration?: string;
};

/** Catalog view mode persisted via UserInfoEngine. */
export type WorkflowsCatalogViewMode = 'blueprints' | 'table';

/** How a workflow is started (reconciled from real Scheduled Jobs / Entity Actions). */
export type WorkflowTriggerKind = 'manual' | 'schedule' | 'event';

/** A saved workflow, enriched for both Blueprint Gallery cards and Ops Table rows. */
export type WorkflowListItem = {
    ID: string;
    Name: string;
    Description: string | null;
    /** Derived from MJAIAgentEntity['Status']. `Active` fires; others stay dormant. */
    Status: MJAIAgentEntity['Status'];
    /** How it starts — reconciled from Scheduled Jobs / Entity Actions, or "On demand". */
    TriggerSummary: string;
    TriggerKind?: WorkflowTriggerKind;
    UpdatedAt: Date | null;
    IconClass?: string;
    StepCount?: number;
    HasHumanStep?: boolean;
    HasLoop?: boolean;
    RecentBars?: RunSparkBar[];
    HealthPercent?: number | null;
    P50Duration?: string;
    LastRunStatus?: MJTaskEntity['Status'] | null;
    BlueprintSvg?: BlueprintSvgLayout;
    ExposeAsAction?: boolean;
};

/** One open Person step surfaced in the conditional "Needs Your Decision" banner. */
export type PendingPersonDecision = {
    TaskID: string;
    ParentTaskID: string;
    StepName: string;
    WorkflowName: string;
    StartedAt: Date | null;
};

/** What the front door hands back when the author approves and commits. */
export type WorkflowDraftRequest = {
    Mode: WorkflowStartMode;
    Name: string;
    /** The natural-language brief, for `describe`. */
    Description?: string;
    /** The run being promoted, for `past-run`. */
    SourceRunID?: string;
    /** Drafted or projected steps ready for saving into the studio. */
    Draft?: { workflowName: string; reasoning?: string; tasks: unknown[] };
};
