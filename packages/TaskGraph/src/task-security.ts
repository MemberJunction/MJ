/**
 * @fileoverview How the dispatcher reads and applies a node's security envelope.
 *
 * The envelope itself (`TaskSecurityEnvelope`, `@memberjunction/ai-core-plus`) is the submitting
 * run's constraints. This module answers the three questions the dispatcher asks of it for one node:
 * which constraints apply (the parent's and the node's stored envelopes, merged), whether the node's
 * input is tainted, and which user the node runs as.
 *
 * @module @memberjunction/task-graph
 */
import {
    MergeTaskSecurityEnvelopes,
    ParseTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import { type IMetadataProvider, type TenantContext, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';

/** A node's stored constraints, or why they cannot be enforced (the node is then refused). */
export type NodeSecurity =
    | { readonly Envelope: TaskSecurityEnvelope | undefined }
    | { readonly Refusal: string };

/** The task columns {@link UpstreamCarriesTaint} reads. */
export type UpstreamTaskTaintFields = Pick<MJTaskEntity, 'ID' | 'StepType' | 'UserID' | 'Status' | 'Configuration'>;

/**
 * The rows a task depends on, by that task's ID: how the taint check looks past a node that recorded
 * no taint to what could have reached it. Returns `undefined` when they are not known.
 */
export type UpstreamTaintLookup = (taskID: string) => readonly UpstreamTaskTaintFields[] | undefined;

/**
 * The constraints a node runs under: its graph parent's stored envelope merged with its own, keeping
 * the stricter of each part. An envelope that does not parse, is of an unknown version, or conflicts
 * with the other refuses the node — it never runs as though it had no envelope.
 */
export function ResolveStoredNodeSecurity(
    parentColumn: string | null | undefined,
    nodeColumn: string | null | undefined,
): NodeSecurity {
    const parent = ParseTaskSecurityEnvelope(parentColumn);
    if (parent.Status === 'Invalid') return { Refusal: `On the workflow: ${parent.Reason}` };
    const node = ParseTaskSecurityEnvelope(nodeColumn);
    if (node.Status === 'Invalid') return { Refusal: node.Reason };
    const merged = MergeTaskSecurityEnvelopes(
        parent.Status === 'Valid' ? parent.Envelope : undefined,
        node.Status === 'Valid' ? node.Envelope : undefined,
    );
    if ('Reason' in merged) {
        return { Refusal: `The task's security envelope cannot be enforced: ${merged.Reason}.` };
    }
    return { Envelope: merged.Envelope };
}

/**
 * Whether a finished node's output carries taint into the nodes that depend on it.
 *
 * A `Human` step that its assignee completed in person never does: a person reviewed what flowed
 * through it, which is the only thing that clears taint inside a graph ({@link HumanReviewClearsTaint}).
 * Any other node carries what it recorded when it ran (`Configuration.runtime.isOutputTainted`, which
 * every node the dispatcher runs writes as its input taint OR its own). A node `Complete` with nothing
 * recorded and no person recorded as completing it is tainted: it was completed outside the dispatcher
 * (forced, or saved or answered by code), so its output is nobody's vouched-for result, and what ran
 * before it may not have run yet. Any other node that recorded nothing (a Human step a person other than
 * its assignee completed, skipped, failed before recording) is never read as clean: it is tainted when the graph is, or when anything it depends on
 * could be (followed through `upstreamOf`, transitively), and tainted outright when what it depends on
 * is not known. So a Decision, a skipped branch or a failed step between an untrusted fetch and an
 * egress action cannot launder the fetch's taint.
 */
export function UpstreamCarriesTaint(
    upstream: UpstreamTaskTaintFields,
    graphTainted: boolean,
    upstreamOf?: UpstreamTaintLookup,
): boolean {
    return carriesTaint(upstream, newTaintWalk(graphTainted, upstreamOf));
}

function newTaintWalk(graphTainted: boolean, upstreamOf: UpstreamTaintLookup | undefined): TaintWalk {
    return { GraphTainted: graphTainted, UpstreamOf: upstreamOf, Known: new UUIDMap(), Visiting: new UUIDSet() };
}

/** One taint walk's inputs and memo: each unrecorded node is resolved once, and a cycle fails closed. */
type TaintWalk = {
    GraphTainted: boolean;
    UpstreamOf: UpstreamTaintLookup | undefined;
    Known: UUIDMap<boolean>;
    Visiting: UUIDSet;
};

/**
 * Whether a node is a Human step whose review clears taint: `StepType` is `Human` (a row with a null
 * `StepType` and a `UserID` is not enough), it is `Complete`, and the server recorded a person's
 * completion (`Configuration.runtime.completedByUserID`) as made by its assignee.
 *
 * The record is what tells a person's review apart from code: it is written only for a completion
 * that came from a person, never for one made by server code such as an agent or action run (which
 * runs as the same user as the graph's submitter, the step's assignee). `MJTaskEntityServer` writes
 * it for a save that arrives as a direct client CRUD request (the Tasks UI) and records nothing for
 * any other, and the dispatcher writes it from an answered request's server-recorded responder. Any
 * other write of it is refused. A completion by someone other than the assignee does not count.
 */
export function HumanReviewClearsTaint(node: Pick<UpstreamTaskTaintFields, 'StepType' | 'UserID' | 'Status' | 'Configuration'>): boolean {
    if (node.StepType !== 'Human' || node.Status !== 'Complete' || !node.UserID) {
        return false;
    }
    const completedBy = runtimeOf(node.Configuration)?.completedByUserID;
    return typeof completedBy === 'string' && UUIDsEqual(completedBy, node.UserID);
}

/**
 * Whether the server recorded a person as completing this Human step. `completedByUserID` is written only for
 * a person: the user whose own client request completed the step, or the responder of the request a person
 * answered (`MJTaskEntityServer`, `MJAIAgentRequestEntityServer`).
 */
function completedByAPerson(node: Pick<UpstreamTaskTaintFields, 'StepType' | 'Configuration'>): boolean {
    return node.StepType === 'Human' && typeof runtimeOf(node.Configuration)?.completedByUserID === 'string';
}

function carriesTaint(node: UpstreamTaskTaintFields, walk: TaintWalk): boolean {
    if (HumanReviewClearsTaint(node)) {
        return false;
    }
    const recorded = RecordedOutputTaint(node.Configuration);
    if (recorded !== undefined) {
        return recorded;
    }
    if (node.Status === 'Complete' && !completedByAPerson(node)) {
        // Complete with nothing recorded and no person recorded as completing it: it did not finish through the
        // dispatcher, which records every run's taint. Its output (forced from the debugger, saved by code, or an
        // answer server code gave) is untrusted whatever ran before it, which may not have run yet. A Human step
        // a person other than its assignee completed (a delegated approval) cleared nothing, but its answer is
        // that person's own, so it passes on what fed it, below.
        return true;
    }
    if (walk.GraphTainted) {
        return true;
    }
    const known = walk.Known.Get(node.ID);
    if (known !== undefined) {
        return known;
    }
    const inputs = walk.UpstreamOf?.(node.ID);
    if (inputs === undefined || walk.Visiting.Has(node.ID)) {
        return true;
    }
    walk.Visiting.Add(node.ID);
    const tainted = inputs.some((input) => carriesTaint(input, walk));
    walk.Visiting.Delete(node.ID);
    walk.Known.Set(node.ID, tainted);
    return tainted;
}

/** The output taint a node recorded when it ran, or `undefined` when it recorded none. */
export function RecordedOutputTaint(configuration: string | null | undefined): boolean | undefined {
    const flag = runtimeOf(configuration)?.isOutputTainted;
    return typeof flag === 'boolean' ? flag : undefined;
}

/** The `runtime` object of a serialized `Task.Configuration`, or `undefined` when it has none or does not parse. */
function runtimeOf(configuration: string | null | undefined): Record<string, unknown> | undefined {
    if (!configuration) return undefined;
    try {
        const parsed: unknown = JSON.parse(configuration);
        return isRecord(parsed) && isRecord(parsed.runtime) ? parsed.runtime : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Whether a node's input is tainted. A node with no prerequisites reads only what the (possibly
 * tainted) run wrote into the graph, so it takes the envelope's taint. A node with prerequisites is
 * tainted when any of them carries taint ({@link UpstreamCarriesTaint}, which follows `UpstreamOf`
 * past a prerequisite that recorded none); a compensation task also keeps the taint it inherited
 * from the forward task it undoes.
 */
export function ComputeNodeInputTaint(args: {
    EnvelopeTainted: boolean;
    IsCompensation: boolean;
    Upstream: readonly UpstreamTaskTaintFields[];
    /** The graph's prerequisites by task, for prerequisites that recorded no taint. Omitted: they read as tainted. */
    UpstreamOf?: UpstreamTaintLookup;
}): boolean {
    if (args.Upstream.length === 0) {
        return args.EnvelopeTainted;
    }
    const walk = newTaintWalk(args.EnvelopeTainted, args.UpstreamOf);
    const fromUpstream = args.Upstream.some((u) => carriesTaint(u, walk));
    return fromUpstream || (args.IsCompensation && args.EnvelopeTainted);
}

/**
 * The envelope a node's runners receive: its stored constraints with the taint bit set to the node's
 * input taint. `undefined` when the node has neither constraints nor taint.
 */
export function WithInputTaint(envelope: TaskSecurityEnvelope | undefined, inputTainted: boolean): TaskSecurityEnvelope | undefined {
    if (!envelope && !inputTainted) return undefined;
    return { ...(envelope ?? { Version: TASK_SECURITY_ENVELOPE_VERSION }), IsRunTainted: inputTainted };
}

/** Whether an envelope constrains anything a runner must enforce. */
export function EnvelopeConstrains(envelope: TaskSecurityEnvelope | undefined): boolean {
    if (!envelope) return false;
    return envelope.IsRunTainted
        || envelope.Audience !== undefined
        || envelope.RunScope !== undefined
        || envelope.CallerTenantContext !== undefined
        || (envelope.BoundActionParams !== undefined && Object.keys(envelope.BoundActionParams).length > 0);
}

/**
 * A per-task copy of `user` carrying the caller's tenant context. The user a node runs as is the
 * process-wide `UserCache` instance or the dispatcher's own user, and every other task — and every
 * request — shares it; stamping the context onto it would pin it to this tenant for the life of the
 * process. So the input is never stamped: this follows MJServer's `CloneUserForSessionContext`
 * (spread the backing fields, hand the roles over explicitly, then stamp the clone).
 */
export function CloneUserWithTenantContext(user: UserInfo, tenant: TenantContext, provider: IMetadataProvider): UserInfo {
    const clone = new UserInfo(provider, { ...user, _UserRoles: undefined, UserRoles: user.UserRoles });
    clone.MagicLinkScope = user.MagicLinkScope;
    clone.ReturningVisitorContext = user.ReturningVisitorContext;
    clone.WidgetGuestContext = user.WidgetGuestContext;
    clone.IsMagicLinkAnonymous = user.IsMagicLinkAnonymous;
    clone.AnonymousVisitorID = user.AnonymousVisitorID;
    clone.APIKeyActingContext = user.APIKeyActingContext;
    clone.APIKeyRowFilters = user.APIKeyRowFilters;
    clone.TenantContext = { ...tenant };
    return clone;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
