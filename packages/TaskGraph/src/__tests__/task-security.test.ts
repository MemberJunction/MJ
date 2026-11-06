import { describe, it, expect } from 'vitest';
import { UserInfo, UserRoleInfo, type IMetadataProvider } from '@memberjunction/core';
import { SerializeTaskSecurityEnvelope, TASK_SECURITY_ENVELOPE_VERSION } from '@memberjunction/ai-core-plus';
import {
    CloneUserWithTenantContext,
    ComputeNodeInputTaint,
    EnvelopeConstrains,
    RecordedOutputTaint,
    ResolveStoredNodeSecurity,
    UpstreamCarriesTaint,
    WithInputTaint,
    type UpstreamTaskTaintFields,
} from '../task-security';

const provider = {} as IMetadataProvider;

function upstream(fields: Partial<UpstreamTaskTaintFields>): UpstreamTaskTaintFields {
    return { StepType: 'Action', UserID: null, Status: 'Complete', Configuration: null, ...fields };
}

const ranTainted = JSON.stringify({ runtime: { isOutputTainted: true } });
const ranClean = JSON.stringify({ runtime: { isOutputTainted: false } });

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

describe('UpstreamCarriesTaint', () => {
    it('never carries taint through a completed Human step', () => {
        expect(UpstreamCarriesTaint(upstream({ StepType: 'Human', UserID: 'u', Configuration: ranTainted }), true)).toBe(false);
    });

    it("carries the graph's taint through a step that never ran", () => {
        expect(UpstreamCarriesTaint(upstream({ Status: 'Skipped' }), true)).toBe(true);
        expect(UpstreamCarriesTaint(upstream({ Status: 'Skipped' }), false)).toBe(false);
        // A Human step that never completed reviewed nothing.
        expect(UpstreamCarriesTaint(upstream({ StepType: 'Human', UserID: 'u', Status: 'Skipped' }), true)).toBe(true);
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
