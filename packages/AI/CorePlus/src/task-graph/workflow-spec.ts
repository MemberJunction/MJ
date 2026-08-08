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
    /**
     * When it fires. Either a platform invocation-type name (`AfterCreate`, `AfterUpdate`,
     * `AfterDelete`) or the shorthand `Create` / `Update` / `Delete`, which
     * {@link NormalizeInvocationType} resolves to the **After** form.
     *
     * **Only the After forms are accepted here**, and the reason is not stylistic. `Validate` and
     * `Before*` run *inside* the save — synchronously, inside the held transaction, with the power
     * to veto it. A workflow bound there would put an unbounded agent run in the middle of a user's
     * save. Nobody asking for "when an invoice changes, do X" is asking for that, and the friendlier
     * an authoring API is, the less it should let someone reach that hazard by accident.
     */
    invocationType: string;
    /**
     * Optional predicate narrowing which changes fire the trigger.
     *
     * A **JavaScript boolean expression** evaluated against the change, reconciled onto an
     * `ActionFilter` row bound to the trigger's own binding. The names in scope are the ones an
     * Action Filter always has, plus the change contract:
     *
     * - `DidFieldChange('Status')` — the field's value actually differs across this save
     * - `DidFieldChangeToValue('Status', 'Approved')` — *and* its new value is that one
     * - `OldValues` / `NewValues` — both sides, by field name
     * - `ActionFilterContext` — the full context, for anything the shorthands do not cover
     *
     * Write the transition, not the state: `Status === 'Approved'` is true on every subsequent save
     * too, whereas `DidFieldChangeToValue('Status','Approved')` fires once, when it becomes that.
     *
     * Evaluation is **fail-closed** — a predicate that throws prevents the run rather than allowing
     * it, because a workflow runs an agent and over-firing costs real money. The expression is
     * syntax-checked at validation time so that failure surfaces while authoring, not as a trigger
     * that silently never fires.
     */
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
        | 'UnknownInvocationType'
        | 'UnsupportedInvocationType'
        | 'InvalidFilter'
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

/**
 * Entity-action invocation types the platform actually fires.
 *
 * Derived from `GenericDatabaseProvider.HandleEntityActions`, which composes them as
 * `Validate` or `<Before|After><Create|Update|Delete>`. Restating them here rather than importing
 * is deliberate — this module is dependency-free — but it means a change there is a change here,
 * which the integration tier pins.
 */
export const ENTITY_INVOCATION_TYPES = [
    'Validate',
    'BeforeCreate', 'AfterCreate',
    'BeforeUpdate', 'AfterUpdate',
    'BeforeDelete', 'AfterDelete',
] as const;

export type EntityInvocationType = typeof ENTITY_INVOCATION_TYPES[number];

/**
 * The invocation types a workflow trigger may bind to.
 *
 * The After forms only. `Validate` and `Before*` are part of the save itself — synchronous, inside
 * the transaction, able to abort it — so binding an agent run there means an unbounded LLM call
 * holding a user's save open. That hazard should not be one field away in the friendliest API the
 * program exposes. Everything a workflow legitimately wants ("when an invoice changes, do X") is an
 * After.
 */
export const WORKFLOW_TRIGGER_INVOCATION_TYPES = ['AfterCreate', 'AfterUpdate', 'AfterDelete'] as const;

export type WorkflowTriggerInvocationType = typeof WORKFLOW_TRIGGER_INVOCATION_TYPES[number];

/** True when an invocation type runs after the save has committed, rather than inside it. */
export function IsAfterInvocationType(type: EntityInvocationType): type is WorkflowTriggerInvocationType {
    return (WORKFLOW_TRIGGER_INVOCATION_TYPES as readonly string[]).includes(type);
}

/** Shorthand an author is likely to write, resolved to the safe (After) form. */
const INVOCATION_SHORTHAND: Record<string, EntityInvocationType> = {
    create: 'AfterCreate',
    update: 'AfterUpdate',
    delete: 'AfterDelete',
    validate: 'Validate',
};

/**
 * Resolves a trigger's `invocationType` to a name the platform will match.
 *
 * Returns null for anything unrecognized rather than guessing: a trigger bound to an invocation type
 * that does not exist is a workflow that never fires, and silently picking a nearby one would be
 * worse — it would fire at a moment the author did not ask for.
 */
export function NormalizeInvocationType(raw: string): EntityInvocationType | null {
    const trimmed = raw?.trim();
    if (!trimmed) return null;

    const exact = ENTITY_INVOCATION_TYPES.find((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (exact) return exact;

    return INVOCATION_SHORTHAND[trimmed.toLowerCase()] ?? null;
}

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

/**
 * Wraps a trigger's filter expression as the body of an `ActionFilter.Code`.
 *
 * Shared by the validator (which compiles the result to prove it parses) and by the reconciler
 * (which persists it), so the thing checked and the thing stored can never be two different
 * programs — the failure mode where a spec validates and then fails closed forever at runtime.
 *
 * The shorthands are destructured from the context rather than injected as separate function
 * arguments, so an author's expression sees exactly the names the field's documentation promises
 * and nothing else leaks in.
 */
export function BuildTriggerFilterCode(filter: string): string {
    return [
        '// Generated from a workflow trigger filter. Edit the workflow, not this row —',
        '// re-saving the workflow overwrites this code.',
        'const { OldValues, NewValues, DidFieldChange, DidFieldChangeToValue } = ActionFilterContext;',
        `return (${filter.trim()});`,
    ].join('\n');
}

/**
 * Whether a trigger's filter expression parses.
 *
 * Compiles but never invokes, so nothing in the expression can run here. `EvalError` is treated as
 * "cannot tell" rather than "invalid": under a Content-Security-Policy that forbids `new Function`,
 * every filter would otherwise be reported as broken in the browser while working perfectly on the
 * server that actually evaluates it.
 */
export function IsTriggerFilterParseable(filter: string): { Parseable: boolean; Message?: string } {
    try {
        new Function('ActionFilterContext', BuildTriggerFilterCode(filter));
        return { Parseable: true };
    } catch (e) {
        if (e instanceof EvalError) return { Parseable: true };
        return { Parseable: false, Message: e instanceof Error ? e.message : String(e) };
    }
}
