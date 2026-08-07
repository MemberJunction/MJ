/**
 * @fileoverview `WorkflowSpec` — one object binding WHAT runs to WHEN it runs.
 *
 * **The last missing piece of the program's model.** `TaskGraphSpec` answers *what* a workflow does;
 * the scheduling and entity-action substrates answer *when* something fires. Until now nothing
 * expressed both at once, so "a workflow" was not a thing you could hand to anyone — it was a graph
 * plus a separately-configured trigger that only a human knew were related.
 *
 * **`graph` is `TaskGraphSpec` verbatim, not a copy of it.** That is the whole reason this composes:
 * a graph authored in the canvas, emitted by an agent, or promoted from a past run is *already* this
 * shape, so binding a trigger to it requires no translation. A parallel graph type here would have
 * re-created the drift Phase 4 spent itself removing.
 *
 * **No new run or graph storage.** A `WorkflowSpec` is an authoring surface, not a parallel engine.
 * Persisting one reconciles the substrates that already exist — an Entity Action binding, a
 * Scheduled Job, the Flow agent behind the graph — exactly the way `MJRecordProcessEntityServer`
 * already reconciles its owned Scheduled Job. Inventing a `Workflow` table would create a second
 * definition of a scheduled thing, and the scheduler would then have two masters.
 *
 * **Publish-No-Break applies.** Once an OpenApp publishes against this shape it may only grow
 * additively, so every field here is deliberate and the union arms are closed rather than open
 * strings — a new trigger kind is a reviewed addition, not something a caller can invent.
 *
 * @module @memberjunction/ai-core-plus
 */
import type { TaskGraphSpec } from './task-graph-spec';

/**
 * Fires when a record changes.
 *
 * Scope is optional and narrowing: without it the trigger watches the whole entity, with it a single
 * record. `filter` narrows further by predicate. All three exist because "notify me when any invoice
 * changes", "when THIS invoice changes", and "when any invoice crosses 90 days" are genuinely
 * different subscriptions, and collapsing them would force the workflow to re-check conditions the
 * trigger layer can already evaluate.
 */
export type WorkflowEntityEventTrigger = {
    type: 'EntityEvent';
    entityName: string;
    /** `Create` | `Update` | `Delete` — matched against the Entity Action invocation type. */
    invocationType: string;
    /** Optional predicate, in the same grammar edge conditions use. */
    filter?: string;
    /** Narrow to one entity's records. */
    scopeEntityName?: string;
    /** Narrow to a single record. */
    scopeRecordID?: string;
};

/** Fires on a schedule. `cron` and `timezone` map straight onto `MJ: Scheduled Jobs`. */
export type WorkflowScheduleTrigger = {
    type: 'Schedule';
    cron: string;
    /** IANA zone. Absent means the job's own default, not UTC — the scheduler owns that decision. */
    timezone?: string;
};

/**
 * Fires only when something asks it to.
 *
 * The default for a workflow saved from a chat plan card: at the moment of capture the user is
 * recording *what* worked, not committing to *when* it should repeat. Requiring a schedule there
 * would turn a two-second save into a configuration task.
 */
export type WorkflowOnDemandTrigger = { type: 'OnDemand' };

export type WorkflowTrigger =
    | WorkflowEntityEventTrigger
    | WorkflowScheduleTrigger
    | WorkflowOnDemandTrigger;

/** Who hears about a run, and when. */
export type WorkflowNotifications = {
    condition: 'Always' | 'OnFailure' | 'OnChange';
    /** User IDs. Empty means the workflow's owner only. */
    recipients: string[];
};

/** A complete, persistable workflow definition. */
export type WorkflowSpec = {
    name: string;
    description?: string;
    /**
     * `Draft` is the default rather than `Active`, deliberately: a workflow that starts firing the
     * instant it is saved gives its author no chance to look at it first, and the authoring surfaces
     * (the canvas, the chat card, an agent's MCP call) all produce something the user has not yet
     * reviewed running against real data.
     */
    status: 'Active' | 'Paused' | 'Draft';
    /** The WHAT — `TaskGraphSpec` verbatim (D16). A one-node graph still constant-folds (D9). */
    graph: TaskGraphSpec;
    /** The WHEN. Empty is legal and means the same as a single `OnDemand` trigger. */
    triggers: WorkflowTrigger[];
    notifications?: WorkflowNotifications;
};

/** One reason a spec was rejected. Machine-readable so callers can branch without parsing prose. */
export type WorkflowSpecValidationError = {
    Code:
        | 'MissingName'
        | 'MissingGraph'
        | 'InvalidGraph'
        | 'UnknownTriggerType'
        | 'MissingEntityName'
        | 'MissingInvocationType'
        | 'MissingCron'
        | 'DuplicateTrigger'
        | 'ScopeWithoutEntity';
    Message: string;
    /** Index of the offending trigger, when the failure is trigger-specific. */
    TriggerIndex?: number;
};

export type WorkflowSpecValidationResult = {
    Valid: boolean;
    Errors: WorkflowSpecValidationError[];
};

/** Normalizes an absent/empty trigger list to the explicit on-demand case. */
export function NormalizeTriggers(spec: WorkflowSpec): WorkflowTrigger[] {
    return spec.triggers?.length ? spec.triggers : [{ type: 'OnDemand' }];
}

/** A stable identity for a trigger, used to detect duplicates and to reconcile owned rows. */
export function TriggerKey(trigger: WorkflowTrigger): string {
    switch (trigger.type) {
        case 'EntityEvent':
            return [
                'EntityEvent',
                trigger.entityName,
                trigger.invocationType,
                trigger.scopeRecordID ?? '',
                trigger.filter ?? '',
            ].join('|');
        case 'Schedule':
            // Timezone is part of the identity: the same cron in two zones is two different schedules,
            // and treating them as one would silently drop the second.
            return ['Schedule', trigger.cron, trigger.timezone ?? ''].join('|');
        case 'OnDemand':
            return 'OnDemand';
    }
}

/** True when the workflow should be firing right now. */
export function IsWorkflowLive(spec: WorkflowSpec): boolean {
    return spec.status === 'Active';
}
