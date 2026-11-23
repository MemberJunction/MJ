import { describe, it, expect } from 'vitest';
import {
    CreateScopeCommonReachAudience,
    IsStructuralCommonReachAudience,
    ValidateAgentRunAudience,
    type AgentRunAudience,
} from '../agent-types';
import {
    BuildTaskSecurityEnvelope,
    MergeTaskSecurityEnvelopes,
    ParseTaskSecurityEnvelope,
    SerializeTaskSecurityEnvelope,
    TASK_SECURITY_ENVELOPE_VERSION,
    type TaskSecurityEnvelope,
} from '../task-graph/task-security-envelope';

const READER_A = 'AAAAAAAA-0000-4000-8000-0000000000A1';
const READER_B = 'BBBBBBBB-0000-4000-8000-0000000000B2';
const SCOPE_1 = 'CCCCCCCC-0000-4000-8000-0000000000C1';
const ACTION_1 = 'DDDDDDDD-0000-4000-8000-0000000000D1';

describe('AgentRunAudience structural common-reach mode', () => {
    it('creates and identifies ScopeCommonReach audience in O(1) without reader IDs', () => {
        const audience = CreateScopeCommonReachAudience();
        expect(audience).toEqual({ Mode: 'ScopeCommonReach', ScopeAsserted: true });
        expect(IsStructuralCommonReachAudience(audience)).toBe(true);
        expect(ValidateAgentRunAudience(audience)).toBeNull();
        expect(ValidateAgentRunAudience({ Mode: 'ScopeCommonReach' })).toBeNull();
        expect(IsStructuralCommonReachAudience({ Mode: 'ScopeCommonReach' })).toBe(true);
    });

    it('keeps ScopeCommonReach explicitly distinct from an empty enumerated Intersection array (fail-closed)', () => {
        const emptyIntersection: AgentRunAudience = { Mode: 'Intersection', UserIDs: [] };
        expect(IsStructuralCommonReachAudience(emptyIntersection)).toBe(false);
        expect(ValidateAgentRunAudience(emptyIntersection)).toMatch(/at least one ID/);
    });

    it('rejects ScopeCommonReach when UserIDs are provided or ScopeAsserted is false', () => {
        expect(ValidateAgentRunAudience({ Mode: 'ScopeCommonReach', UserIDs: [] })).toMatch(/takes no UserIDs/);
        expect(ValidateAgentRunAudience({ Mode: 'ScopeCommonReach', UserIDs: [READER_A] })).toMatch(/takes no UserIDs/);
        expect(ValidateAgentRunAudience({ Mode: 'ScopeCommonReach', ScopeAsserted: false })).toMatch(/ScopeAsserted to be true/);
    });

    it('preserves full backwards compatibility for Caller and enumerated Intersection audiences', () => {
        const callerOnly: AgentRunAudience = { Mode: 'Caller' };
        const callerEmpty: AgentRunAudience = { Mode: 'Caller', UserIDs: [] };
        const enumerated: AgentRunAudience = { Mode: 'Intersection', UserIDs: [READER_A, READER_B] };

        expect(IsStructuralCommonReachAudience(callerOnly)).toBe(false);
        expect(IsStructuralCommonReachAudience(callerEmpty)).toBe(false);
        expect(IsStructuralCommonReachAudience(enumerated)).toBe(false);
        expect(IsStructuralCommonReachAudience(undefined)).toBe(false);

        expect(ValidateAgentRunAudience(undefined)).toBeNull();
        expect(ValidateAgentRunAudience(callerOnly)).toBeNull();
        expect(ValidateAgentRunAudience(callerEmpty)).toBeNull();
        expect(ValidateAgentRunAudience(enumerated)).toBeNull();
        expect(ValidateAgentRunAudience({ Mode: 'Caller', UserIDs: [READER_A] })).toMatch(/takes no UserIDs/);
    });

    it('rejects inherited Object.prototype property names as Mode', () => {
        for (const protoMode of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
            expect(ValidateAgentRunAudience({ Mode: protoMode })).toMatch(/Mode must be/);
            expect(IsStructuralCommonReachAudience({ Mode: protoMode })).toBe(false);
        }
    });
});

describe('TaskSecurityEnvelope with ScopeCommonReach', () => {
    it('serializes constant-size ScopeCommonReach audience metadata without reader IDs', () => {
        const built = BuildTaskSecurityEnvelope({
            AudienceMode: 'ScopeCommonReach',
            AudienceReaderUserIDs: [],
            BoundActionParams: { [ACTION_1]: { TenantID: 't-1' } },
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: 'org-1',
                SecondaryScopes: { Region: 'us' },
                SearchScopeIDs: [SCOPE_1],
            },
            IsRunTainted: true,
        });

        expect(built).toBeDefined();
        expect(built?.Audience).toEqual({ Mode: 'ScopeCommonReach' });
        expect(built?.IsRunTainted).toBe(true);
        const raw = SerializeTaskSecurityEnvelope(built);
        expect(raw).not.toBeNull();
        expect(raw!.length).toBeLessThan(512);

        const parsed = ParseTaskSecurityEnvelope(raw);
        expect(parsed).toEqual({ Status: 'Valid', Envelope: built });
    });

    it('fails closed on malformed ScopeCommonReach envelopes carrying extra keys or empty ReaderUserIDs', () => {
        const withExtraKey = JSON.stringify({
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            IsRunTainted: false,
            Audience: { Mode: 'ScopeCommonReach', ReaderUserIDs: [READER_A] },
        });
        expect(ParseTaskSecurityEnvelope(withExtraKey).Status).toBe('Invalid');

        const emptyReaders = JSON.stringify({
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            IsRunTainted: false,
            Audience: { ReaderUserIDs: [] },
        });
        expect(ParseTaskSecurityEnvelope(emptyReaders).Status).toBe('Invalid');
    });

    it('merges ScopeCommonReach envelopes consistently and refuses mixing ScopeCommonReach with enumerated readers', () => {
        const structural: TaskSecurityEnvelope = {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            Audience: { Mode: 'ScopeCommonReach' },
            IsRunTainted: false,
        };
        const tainted: TaskSecurityEnvelope = {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            Audience: { Mode: 'ScopeCommonReach' },
            IsRunTainted: true,
        };
        const enumerated: TaskSecurityEnvelope = {
            Version: TASK_SECURITY_ENVELOPE_VERSION,
            Audience: { ReaderUserIDs: [READER_A] },
            IsRunTainted: false,
        };

        const mergedSame = MergeTaskSecurityEnvelopes(structural, tainted);
        expect(mergedSame.Success).toBe(true);
        if (mergedSame.Success) {
            expect(mergedSame.Envelope?.Audience).toEqual({ Mode: 'ScopeCommonReach' });
            expect(mergedSame.Envelope?.IsRunTainted).toBe(true);
        }

        const mergedMixed = MergeTaskSecurityEnvelopes(structural, enumerated);
        expect(mergedMixed.Success).toBe(false);
    });
});
