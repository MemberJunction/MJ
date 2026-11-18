import { describe, it, expect } from 'vitest';
import type { TenantContext } from '@memberjunction/core';
import {
    ApplyTaskSecurityEnvelopeToParams,
    BuildTaskSecurityEnvelope,
    MergeTaskSecurityEnvelopes,
    ParseTaskSecurityEnvelope,
    SerializeTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    TenantContextCarryProblem,
    type TaskSecurityEnvelope,
} from '../task-graph/task-security-envelope';

const ACTION_A = 'AAAAAAAA-0000-4000-8000-000000000001';
const ACTION_B = 'BBBBBBBB-0000-4000-8000-000000000002';
const READER = 'CCCCCCCC-0000-4000-8000-000000000003';
const SCOPE_1 = 'DDDDDDDD-0000-4000-8000-000000000004';
const SCOPE_2 = 'DDDDDDDD-0000-4000-8000-000000000005';

function envelope(parts: Partial<TaskSecurityEnvelope> = {}): TaskSecurityEnvelope {
    return { Version: TASK_SECURITY_ENVELOPE_VERSION, IsRunTainted: false, ...parts };
}

describe('ParseTaskSecurityEnvelope', () => {
    it('reads an absent column as Absent', () => {
        expect(ParseTaskSecurityEnvelope(null).Status).toBe('Absent');
        expect(ParseTaskSecurityEnvelope(undefined).Status).toBe('Absent');
        expect(ParseTaskSecurityEnvelope('   ').Status).toBe('Absent');
    });

    it('round-trips every part of a built envelope', () => {
        const built = BuildTaskSecurityEnvelope({
            BoundActionParams: { [ACTION_A]: { OrganizationID: 'org-1' } },
            AudienceReaderUserIDs: [READER],
            RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-1', SecondaryScopes: { Region: 'eu' }, SearchScopeIDs: [SCOPE_1] },
            CallerTenantContext: { TenantID: 'org-1', Source: 'header' },
            IsRunTainted: true,
        });
        const parsed = ParseTaskSecurityEnvelope(SerializeTaskSecurityEnvelope(built));
        expect(parsed).toEqual({ Status: 'Valid', Envelope: built });
    });

    // Each of these used to parse as "no envelope", which runs the node with no constraints at all.
    it.each([
        ['malformed JSON', '{not json'],
        ['a JSON array', '[]'],
        ['an unknown version', JSON.stringify({ Version: 2, IsRunTainted: false })],
        ['a missing version', JSON.stringify({ IsRunTainted: false, RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-1', SecondaryScopes: null } })],
        ['an unknown key', JSON.stringify({ Version: 1, IsRunTainted: false, AllowEverything: true })],
        ['a non-boolean taint bit', JSON.stringify({ Version: 1, IsRunTainted: 'no' })],
        ['an empty audience', JSON.stringify({ Version: 1, IsRunTainted: false, Audience: { ReaderUserIDs: [] } })],
        ['an empty search-scope list', JSON.stringify({ Version: 1, IsRunTainted: false, RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [] } })],
        ['a run scope with an unknown key', JSON.stringify({ Version: 1, IsRunTainted: false, RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-1', SecondaryScopes: null, Tenant: 'x' } })],
        ['a tenant context with no TenantID', JSON.stringify({ Version: 1, IsRunTainted: false, CallerTenantContext: { Source: 'header' } })],
        ['bound params that are not objects', JSON.stringify({ Version: 1, IsRunTainted: false, BoundActionParams: { [ACTION_A]: 'org-1' } })],
    ])('fails closed on %s', (_label, raw) => {
        const parsed = ParseTaskSecurityEnvelope(raw);
        expect(parsed.Status).toBe('Invalid');
    });
});

describe('BuildTaskSecurityEnvelope', () => {
    it('returns undefined for a run with no constraint', () => {
        expect(BuildTaskSecurityEnvelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null } })).toBeUndefined();
    });

    it('carries host-assigned search scopes even when the run has no tenant', () => {
        const built = BuildTaskSecurityEnvelope({
            RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [SCOPE_1] },
        });
        expect(built?.RunScope?.SearchScopeIDs).toEqual([SCOPE_1]);
    });
});

describe('TenantContextCarryProblem', () => {
    it('accepts a plain tenant context, including a subtype with extra JSON fields', () => {
        expect(TenantContextCarryProblem({ TenantID: 'org-1', Source: 'header' })).toBeNull();
        const extended: TenantContext & { OrganizationName: string } = { TenantID: 'org-1', Source: 'custom', OrganizationName: 'Acme' };
        expect(TenantContextCarryProblem(extended)).toBeNull();
    });

    it('refuses a tenant context JSON would change', () => {
        const withDate: TenantContext & { Since: Date } = { TenantID: 'org-1', Source: 'custom', Since: new Date() };
        expect(TenantContextCarryProblem(withDate)).not.toBeNull();
    });
});

describe('MergeTaskSecurityEnvelopes', () => {
    it('intersects host-assigned search scopes instead of unioning them', () => {
        const a = envelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [SCOPE_1, SCOPE_2] } });
        const b = envelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [SCOPE_2.toLowerCase()] } });
        const merged = MergeTaskSecurityEnvelopes(a, b);
        expect(merged.Success).toBe(true);
        expect(merged.Success && merged.Envelope?.RunScope?.SearchScopeIDs).toEqual([SCOPE_2]);
    });

    it('refuses search scopes with nothing in common rather than widening to none assigned', () => {
        const a = envelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [SCOPE_1] } });
        const b = envelope({ RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null, SearchScopeIDs: [SCOPE_2] } });
        expect(MergeTaskSecurityEnvelopes(a, b).Success).toBe(false);
    });

    it('refuses two different tenants', () => {
        const a = envelope({ RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-1', SecondaryScopes: null } });
        const b = envelope({ RunScope: { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-2', SecondaryScopes: null } });
        expect(MergeTaskSecurityEnvelopes(a, b).Success).toBe(false);
    });

    it('refuses one parameter bound to two values', () => {
        const a = envelope({ BoundActionParams: { [ACTION_A]: { OrganizationID: 'org-1' } } });
        const b = envelope({ BoundActionParams: { [ACTION_A.toLowerCase()]: { organizationid: 'org-2' } } });
        expect(MergeTaskSecurityEnvelopes(a, b).Success).toBe(false);
    });

    it('adds up readers, bindings and dimensions, and ORs taint', () => {
        const a = envelope({ Audience: { ReaderUserIDs: [READER] }, BoundActionParams: { [ACTION_A]: { X: 1 } } });
        const b = envelope({ IsRunTainted: true, BoundActionParams: { [ACTION_B]: { Y: 2 } }, RunScope: { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-1', SecondaryScopes: { Region: 'eu' } } });
        const merged = MergeTaskSecurityEnvelopes(a, undefined, b);
        expect(merged.Success).toBe(true);
        if (!merged.Success) return;
        expect(merged.Envelope?.IsRunTainted).toBe(true);
        expect(merged.Envelope?.Audience?.ReaderUserIDs).toEqual([READER]);
        expect(Object.keys(merged.Envelope?.BoundActionParams ?? {})).toHaveLength(2);
        expect(merged.Envelope?.RunScope?.SecondaryScopes).toEqual({ Region: 'eu' });
    });
});

describe('ApplyTaskSecurityEnvelopeToParams', () => {
    const env = envelope({ BoundActionParams: { [ACTION_A]: { OrganizationID: 'org-real' } } });

    it('restores a bound value the input tried to replace in another casing', () => {
        const result = ApplyTaskSecurityEnvelopeToParams({ organizationid: 'org-spoofed', Note: 'x' }, env, ACTION_A.toLowerCase());
        expect(result.Params).toEqual({ OrganizationID: 'org-real', Note: 'x' });
        expect(result.OverriddenKeys).toEqual(['OrganizationID']);
    });

    it("never applies one action's bindings to another action", () => {
        const result = ApplyTaskSecurityEnvelopeToParams({ Note: 'x' }, env, ACTION_B);
        expect(result.Params).toEqual({ Note: 'x' });
    });
});
