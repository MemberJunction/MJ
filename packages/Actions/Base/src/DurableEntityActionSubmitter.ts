/**
 * @fileoverview The seam that lets an `After*` entity action run durably.
 *
 * **Why a seam and not a call.** After-hooks are dispatched by `GenericDatabaseProvider`, which sits
 * near the bottom of the dependency graph — every consumer of the entity layer loads it. The durable
 * substrate (`@memberjunction/task-graph`) sits well above it, holding the dispatcher, the claim
 * protocol and the entity layer itself. Importing one from the other would invert the graph and drag
 * durable execution into every context that merely saves a record, including DB-less unit tests. So
 * the provider depends on this interface, the host registers an implementation at boot, and a host
 * that registers nothing simply keeps today's inline behaviour.
 *
 * **Why durability is opt-in.** It costs a Task row per dispatch, a dispatcher hop of latency, and
 * it persists the action's parameters at rest. Charging every After* binding on every installation
 * for that would be a large, silent change to systems that never asked for it — so
 * `EntityAction.RunMode` defaults to `Inline` and an operator opts a binding in.
 *
 * @module @memberjunction/actions-base
 */
import { UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';

/** One durable dispatch: which binding, on which record, with what already-redacted inputs. */
export type DurableEntityActionRequest = {
    /** The `MJ: Entity Actions` binding that fired. */
    EntityActionID: string;
    /** The action it dispatches to — resolved here so the submitter needs no metadata lookup. */
    ActionID: string;
    /** Human-readable name of that action, used for the task's name. */
    ActionName: string;
    /** The entity whose save fired this. */
    EntityID: string;
    /** Name of that entity, for a task description a person can read. */
    EntityName: string;
    /** The record, in MJ's canonical serialized form (`ToConcatenatedString()`). */
    RecordID: string;
    /** Which lifecycle event fired — `AfterCreate` / `AfterUpdate` / `AfterDelete`. */
    InvocationType: string;
    /**
     * The action's input parameters, **already redacted**.
     *
     * Typed as JSON-safe rather than as `ActionParam[]` deliberately: `Task.InputPayload` is
     * persistent, user-visible storage, and the #3408 §5.7 invariant is that no path writes a raw
     * `ActionParam[]` there. Taking the redacted shape at the boundary is what makes violating it
     * require changing this type rather than forgetting a call.
     */
    RedactedParams: Record<string, unknown>;
    ContextUser: UserInfo;
};

/** What came of a durable submission. */
export type DurableEntityActionSubmission = {
    Success: boolean;
    /** The parent task row representing the graph, when one was created. */
    ParentTaskID?: string;
    ErrorMessage?: string;
};

/**
 * Submits one entity-action dispatch as durable work.
 *
 * Implemented by the host over `TaskGraphService.Submit` — per D14, "run this action durably with
 * retry" is a single-node durable graph, not a new queue.
 */
export type DurableEntityActionSubmitter = {
    Submit(request: DurableEntityActionRequest): Promise<DurableEntityActionSubmission>;
};

/**
 * Where the host registers its submitter, and where the dispatch path looks for one.
 *
 * A `BaseSingleton` rather than a module-level variable because bundlers duplicate modules across
 * execution paths: a plain `let` would give the registering host and the reading provider two
 * different slots, and durability would appear configured while every dispatch silently ran inline.
 */
export class DurableEntityActionRegistry extends BaseSingleton<DurableEntityActionRegistry> {
    private _submitter: DurableEntityActionSubmitter | null = null;

    protected constructor() { super(); }

    public static get Instance(): DurableEntityActionRegistry {
        return super.getInstance<DurableEntityActionRegistry>('DurableEntityActionRegistry');
    }

    /** Registers the host's durable submitter. Called once at boot. */
    public Register(submitter: DurableEntityActionSubmitter): void {
        this._submitter = submitter;
    }

    /**
     * The registered submitter, or null on a host that has none.
     *
     * Null is an ordinary answer, not an error: a CLI, a test, or a client-side provider has no
     * dispatcher to hand work to. What the caller must NOT do with a null is skip the work — see
     * {@link DurableDispatchOutcome}.
     */
    public get Submitter(): DurableEntityActionSubmitter | null {
        return this._submitter;
    }

    /** Clears the registration. Exists for tests, which must not leak a submitter across cases. */
    public Clear(): void {
        this._submitter = null;
    }
}

/** What a dispatch path did with a binding that asked for durability. */
export type DurableDispatchOutcome =
    /** Handed to the durable substrate; the caller must not also run it. */
    | { Kind: 'Submitted'; ParentTaskID?: string }
    /**
     * Not submitted — no submitter registered, or submission failed. The caller **runs it inline**.
     *
     * Falling back rather than dropping is the whole posture: `RunMode='Durable'` asks for the work
     * to be harder to lose, so refusing to run it when the durable path is unavailable would make
     * the opt-in *less* reliable than leaving it off. The reason travels so the fallback is visible
     * in logs rather than looking like a binding that was never durable.
     */
    | { Kind: 'RunInline'; Reason: string };
