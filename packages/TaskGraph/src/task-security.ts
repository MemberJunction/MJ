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
import { IsHumanTask } from './task-predicates';

/** A node's stored constraints, or why they cannot be enforced (the node is then refused). */
export type NodeSecurity =
    | { readonly Envelope: TaskSecurityEnvelope | undefined }
    | { readonly Refusal: string };

/** The task columns {@link UpstreamCarriesTaint} reads. */
export type UpstreamTaskTaintFields = Pick<MJTaskEntity, 'StepType' | 'UserID' | 'Status' | 'Configuration'>;

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
 * A completed `Human` step never does: a person reviewed what flowed through it, which is the only
 * thing that clears taint inside a graph. Any other node carries what it recorded when it ran
 * (`Configuration.runtime.isOutputTainted`); a node that never recorded it — skipped, or never run —
 * carries the graph's own taint, so a branch that was not taken cannot launder it.
 */
export function UpstreamCarriesTaint(upstream: UpstreamTaskTaintFields, graphTainted: boolean): boolean {
    if (IsHumanTask(upstream) && upstream.Status === 'Complete') {
        return false;
    }
    const recorded = RecordedOutputTaint(upstream.Configuration);
    return recorded ?? graphTainted;
}

/** The output taint a node recorded when it ran, or `undefined` when it recorded none. */
export function RecordedOutputTaint(configuration: string | null | undefined): boolean | undefined {
    if (!configuration) return undefined;
    try {
        const parsed: unknown = JSON.parse(configuration);
        if (!isRecord(parsed) || !isRecord(parsed.runtime)) return undefined;
        const flag = parsed.runtime.isOutputTainted;
        return typeof flag === 'boolean' ? flag : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Whether a node's input is tainted. A node with no prerequisites reads only what the (possibly
 * tainted) run wrote into the graph, so it takes the envelope's taint. A node with prerequisites is
 * tainted when any of them carries taint ({@link UpstreamCarriesTaint}); a compensation task also
 * keeps the taint it inherited from the forward task it undoes.
 */
export function ComputeNodeInputTaint(args: {
    EnvelopeTainted: boolean;
    IsCompensation: boolean;
    Upstream: readonly UpstreamTaskTaintFields[];
}): boolean {
    if (args.Upstream.length === 0) {
        return args.EnvelopeTainted;
    }
    const fromUpstream = args.Upstream.some((u) => UpstreamCarriesTaint(u, args.EnvelopeTainted));
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
