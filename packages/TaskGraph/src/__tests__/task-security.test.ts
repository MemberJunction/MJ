import { describe, it, expect } from 'vitest';
import { UserInfo, UserRoleInfo, type IMetadataProvider } from '@memberjunction/core';
import { SerializeTaskSecurityEnvelope, TASK_SECURITY_ENVELOPE_VERSION } from '@memberjunction/ai-core-plus';
import {
    CloneUserWithTenantContext,
    ComputeNodeInputTaint,
    EnvelopeConstrains,
    HumanReviewClearsTaint,
    RecordedOutputTaint,
    ResolveStoredNodeSecurity,
    UpstreamCarriesTaint,
    WithInputTaint,
    type UpstreamTaskTaintFields,
} from '../task-security';

const provider = {} as IMetadataProvider;

function upstream(fields: Partial<UpstreamTaskTaintFields>): UpstreamTaskTaintFields {
    return { ID: 'aaaaaaaa-0000-4000-8000-000000000099', StepType: 'Action', UserID: null, Status: 'Complete', Configuration: null, ...fields };
}

/** A prerequisite lookup: each task ID to the rows it depends on. */
function lookup(prereqs: Record<string, UpstreamTaskTaintFields[]>): (id: string) => UpstreamTaskTaintFields[] | undefined {
    return (id) => prereqs[id];
}

const ranTainted = JSON.stringify({ runtime: { isOutputTainted: true } });
const ranClean = JSON.stringify({ runtime: { isOutputTainted: false } });
/** The graph's submitter: the user its work runs as, and the assignee of its Human steps. */
const RUN_USER = 'aaaaaaaa-0000-4000-8000-0000000000a1';
/** Another Human step assignee. */
const REVIEWER = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const completedBy = (userID: string): string => JSON.stringify({ runtime: { completedByUserID: userID } });
/** A Human step its assignee completed. */
const reviewed = (fields: Partial<UpstreamTaskTaintFields> = {}): UpstreamTaskTaintFields =>
    upstream({ StepType: 'Human', UserID: REVIEWER, Configuration: completedBy(REVIEWER), ...fields });

describe('CloneUserWithTenantContext', () => {
    it('stamps the clone, keeps identity and roles, and leaves the shared user untouched', () => {
        const shared = new UserInfo(provider, {
            ID: '00000000-0000-4000-8000-000000000001',
            Name: 'Shared',
            Email: 'shared@example.com',
            IsActive: true,
            UserRoles: [new UserRoleInfo({ UserID: '00000000-0000-4000-8000-000000000001', RoleID: 'R1', Role: 'Admin' })],
        });
        const clone = CloneUserWithTenantContext(shared, { TenantID: 'org-A', Source: 'header' }, provider);

        expect(clone).not.toBe(shared);
        expect(clone.ID).toBe(shared.ID);
        expect(clone.Email).toBe('shared@example.com');
        expect(clone.UserRoles.map((r) => r.Role)).toEqual(['Admin']);
        expect(clone.TenantContext).toEqual({ TenantID: 'org-A', Source: 'header' });
        expect(shared.TenantContext).toBeUndefined();
    });
});

describe('HumanReviewClearsTaint', () => {
    it('clears taint when the assignee completed the step', () => {
        expect(HumanReviewClearsTaint(reviewed())).toBe(true);
    });

    it('does not when someone other than the assignee completed it', () => {
        expect(HumanReviewClearsTaint(reviewed({ Configuration: completedBy('aaaaaaaa-0000-4000-8000-0000000000c3') }))).toBe(false);
    });

    it("clears taint when the assignee is the graph's submitter, as in every real graph", () => {
        expect(HumanReviewClearsTaint(reviewed({ UserID: RUN_USER, Configuration: completedBy(RUN_USER) }))).toBe(true);
    });

    it('does not when nobody is recorded as completing it (the row was edited to Complete without the server stamp)', () => {
        expect(HumanReviewClearsTaint(reviewed({ Configuration: null }))).toBe(false);
        expect(HumanReviewClearsTaint(reviewed({ Configuration: ranClean }))).toBe(false);
    });

    it("counts only StepType 'Human': not a row with a null StepType and a UserID, and not one that is not Complete", () => {
        expect(HumanReviewClearsTaint(reviewed({ StepType: null }))).toBe(false);
        expect(HumanReviewClearsTaint(reviewed({ Status: 'In Progress' }))).toBe(false);
    });
});

describe('UpstreamCarriesTaint', () => {
    it('never carries taint through a Human step its assignee completed', () => {
        expect(UpstreamCarriesTaint(reviewed(), true)).toBe(false);
    });

    it('carries it through a Human step anyone other than its assignee completed', () => {
        expect(UpstreamCarriesTaint(reviewed({ Configuration: completedBy(RUN_USER) }), true)).toBe(true);
        expect(UpstreamCarriesTaint(upstream({ StepType: null, UserID: REVIEWER, Configuration: completedBy(REVIEWER) }), true)).toBe(true);
    });

    it("carries the graph's taint through a step that never ran", () => {
        expect(UpstreamCarriesTaint(upstream({ Status: 'Skipped' }), true)).toBe(true);
        // A Human step that never completed reviewed nothing.
        expect(UpstreamCarriesTaint(reviewed({ Status: 'Skipped' }), true)).toBe(true);
    });

    it('never reads a step that recorded nothing as clean when what could reach it is unknown', () => {
        expect(UpstreamCarriesTaint(upstream({ Status: 'Skipped' }), false)).toBe(true);
    });

    it('follows a step that recorded nothing back to what it depends on, transitively', () => {
        const fetch = upstream({ ID: 'fetch', Configuration: ranTainted });
        const clean = upstream({ ID: 'clean', Configuration: ranClean });
        const decision = upstream({ ID: 'decision', StepType: 'Decision' });
        const skipped = upstream({ ID: 'skipped', Status: 'Skipped' });
        const prereqs = lookup({ decision: [fetch], skipped: [decision], 'clean-decision': [clean], root: [] });

        expect(UpstreamCarriesTaint(decision, false, prereqs)).toBe(true);
        expect(UpstreamCarriesTaint(skipped, false, prereqs)).toBe(true);
        expect(UpstreamCarriesTaint(upstream({ ID: 'clean-decision', StepType: 'Decision' }), false, prereqs)).toBe(false);
        expect(UpstreamCarriesTaint(upstream({ ID: 'root', Status: 'Skipped' }), false, prereqs)).toBe(false);
        // A dependency the lookup does not know reads as tainted.
        expect(UpstreamCarriesTaint(upstream({ ID: 'orphan', StepType: 'Decision' }), false, prereqs)).toBe(true);
    });

    it("stops at an assignee's review on the way back, not at anyone else's, and fails closed on a cycle", () => {
        const fetch = upstream({ ID: 'fetch', Configuration: ranTainted });
        const decision = upstream({ ID: 'decision', StepType: 'Decision' });
        expect(UpstreamCarriesTaint(decision, false, lookup({ decision: [reviewed({ ID: 'review' })], review: [fetch] }))).toBe(false);
        const othersReview = reviewed({ ID: 'review', Configuration: completedBy(RUN_USER) });
        expect(UpstreamCarriesTaint(decision, false, lookup({ decision: [othersReview], review: [fetch] }))).toBe(true);

        const a = upstream({ ID: 'a', Status: 'Skipped' });
        const b = upstream({ ID: 'b', Status: 'Skipped' });
        expect(UpstreamCarriesTaint(a, false, lookup({ a: [b], b: [a] }))).toBe(true);
    });

    it('carries what a step that ran recorded', () => {
        expect(UpstreamCarriesTaint(upstream({ Configuration: ranTainted }), false)).toBe(true);
        expect(UpstreamCarriesTaint(upstream({ Configuration: ranClean }), true)).toBe(false);
    });
});

describe('ComputeNodeInputTaint', () => {
    it("gives a root node the envelope's taint", () => {
        expect(ComputeNodeInputTaint({ EnvelopeTainted: true, IsCompensation: false, Upstream: [] })).toBe(true);
    });

    it('taints a node whose only prerequisite is a Decision fed by tainted output', () => {
        const fetch = upstream({ ID: 'fetch', Configuration: ranTainted });
        const decision = upstream({ ID: 'decision', StepType: 'Decision' });
        expect(ComputeNodeInputTaint({
            EnvelopeTainted: false, IsCompensation: false, Upstream: [decision], UpstreamOf: lookup({ decision: [fetch] }),
        })).toBe(true);
    });

    it('lets a compensation task keep the taint it inherited from its forward task', () => {
        expect(ComputeNodeInputTaint({ EnvelopeTainted: true, IsCompensation: true, Upstream: [upstream({ Configuration: ranClean })] })).toBe(true);
        expect(ComputeNodeInputTaint({ EnvelopeTainted: true, IsCompensation: false, Upstream: [upstream({ Configuration: ranClean })] })).toBe(false);
    });
});

describe('RecordedOutputTaint', () => {
    it('tells "ran clean" from "never recorded"', () => {
        expect(RecordedOutputTaint(ranClean)).toBe(false);
        expect(RecordedOutputTaint(JSON.stringify({ runtime: {} }))).toBeUndefined();
        expect(RecordedOutputTaint('not json')).toBeUndefined();
    });
});

describe('ResolveStoredNodeSecurity / WithInputTaint / EnvelopeConstrains', () => {
    it('refuses an unreadable column on either row', () => {
        expect('Refusal' in ResolveStoredNodeSecurity('{', null)).toBe(true);
        expect('Refusal' in ResolveStoredNodeSecurity(null, '{"Version":3,"IsRunTainted":false}')).toBe(true);
    });

    it('merges the two columns', () => {
        const parent = SerializeTaskSecurityEnvelope({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true });
        const resolved = ResolveStoredNodeSecurity(parent, null);
        expect('Envelope' in resolved && resolved.Envelope?.IsRunTainted).toBe(true);
    });

    it('builds a taint-only envelope and treats it as a constraint', () => {
        const env = WithInputTaint(undefined, true);
        expect(env).toEqual({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: true });
        expect(EnvelopeConstrains(env)).toBe(true);
        expect(WithInputTaint(undefined, false)).toBeUndefined();
        expect(EnvelopeConstrains({ Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false })).toBe(false);
    });
});
