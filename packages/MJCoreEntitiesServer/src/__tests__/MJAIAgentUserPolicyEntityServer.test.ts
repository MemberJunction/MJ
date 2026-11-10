/**
 * MJAIAgentUserPolicyEntityServer — a user's agent policy is private to that user.
 *
 * The UI role may create and update `MJ: AI Agent User Policies` (metadata grant), so this
 * subclass is the guard: a non-Owner-type user may only save the policy row whose UserID is
 * their own, compared against the PRE-save owner so reassigning UserID cannot bypass it.
 * Owner-type users (administrators, the scheduler's system user) are exempt. First save
 * defaults UserID to the context user when unset.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class MockMJAIAgentUserPolicyEntity {
        public UserID: string | null = null;
        public AgentID: string | null = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';
        public Status: 'Active' | 'Paused' | 'Revoked' = 'Active';
        public CoordinationMode: 'Observer' | 'Advisor' | 'Assisted' | 'Autonomous' = 'Assisted';
        public DefaultDataAccessMode: 'UserCeiling' | 'ReadOnly' | 'AllowListOnly' = 'ReadOnly';
        public EmailChannelMode: 'Disabled' | 'DraftOnly' | 'SendAsAgent' | 'SendAsUser' = 'DraftOnly';
        public CalendarChannelMode: 'Disabled' | 'DraftOnly' | 'RespondOnly' | 'FullAccess' = 'DraftOnly';
        public AllowInternalMessaging = true;
        public AllowInterAgentCoordination = true;
        public RequireApprovalForExternalComms = true;
        public MaxAutoActionsPerRun: number | null = 10;
        public ActionRules: string | null = null;
        public ActionRulesObject: unknown = null;
        public EntityAccessRules: string | null = null;
        public EntityAccessRulesObject: unknown = null;
        public AllowedEmailDomainList: string | null = null;
        public AllowedEmailDomainListObject: unknown = null;
        public BlockedEmailAddressList: string | null = null;
        public BlockedEmailAddressListObject: unknown = null;
        public ID = 'PPPPPPPP-0000-0000-0000-00000000000P';
        public IsSaved = false;
        public ContextCurrentUser: { ID: string; Type: string | null } | null = null;
        public SuperSaveCalled = false;
        private fieldState: Record<string, FieldState> = {};
        public SetFieldState(name: string, state: FieldState): void {
            this.fieldState[name] = state;
        }
        public GetFieldByName(name: string): FieldState {
            return this.fieldState[name] ?? { Dirty: false, OldValue: null };
        }
        public Validate(): ValidationResult {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }
    }
    return { ...actual, MJAIAgentUserPolicyEntity: MockMJAIAgentUserPolicyEntity };
});

import { MJAIAgentUserPolicyEntityServer } from '../custom/MJAIAgentUserPolicyEntityServer.server';

interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: { ID: string; Type: string | null } | null;
    SuperSaveCalled: boolean;
    SetFieldState(name: string, state: FieldState): void;
}

const OWNER = 'AAAAAAAA-0000-0000-0000-00000000000A';
const OTHER = 'BBBBBBBB-0000-0000-0000-00000000000B';

function makeEntity(): MJAIAgentUserPolicyEntityServer & MockHooks {
    return new MJAIAgentUserPolicyEntityServer() as MJAIAgentUserPolicyEntityServer & MockHooks;
}

describe('MJAIAgentUserPolicyEntityServer.Validate — ownership', () => {
    it('blocks a non-Owner-type user from saving a policy that belongs to someone else', () => {
        const e = makeEntity();
        e.UserID = OWNER;
        e.ContextCurrentUser = { ID: OTHER, Type: 'User' };
        const r = e.Validate();
        expect(r.Success).toBe(false);
        expect(r.Errors.map((x) => x.Source)).toEqual(['UserID']);
    });

    it('compares against the PRE-save owner, so reassigning UserID to yourself does not bypass the gate', () => {
        const e = makeEntity();
        e.IsSaved = true;
        e.UserID = OTHER;
        e.SetFieldState('UserID', { Dirty: true, OldValue: OWNER });
        e.ContextCurrentUser = { ID: OTHER, Type: 'User' };
        expect(e.Validate().Success).toBe(false);
    });

    it('lets a user save their own policy, comparing UUIDs case-insensitively', () => {
        const e = makeEntity();
        e.UserID = OWNER.toLowerCase();
        e.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        expect(e.Validate().Success).toBe(true);
    });

    it('exempts Owner-type users', () => {
        const e = makeEntity();
        e.UserID = OWNER;
        e.ContextCurrentUser = { ID: OTHER, Type: 'Owner' };
        expect(e.Validate().Success).toBe(true);
    });

    it('skips the gate with no context user (system path)', () => {
        const e = makeEntity();
        e.UserID = OWNER;
        e.ContextCurrentUser = null;
        expect(e.Validate().Success).toBe(true);
    });
});

describe('MJAIAgentUserPolicyEntityServer.Save', () => {
    it('defaults UserID to the context user on first save when unset', async () => {
        const e = makeEntity();
        e.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        await e.Save();
        expect(e.UserID).toBe(OWNER);
        expect(e.SuperSaveCalled).toBe(true);
    });

    it('leaves an explicit UserID alone', async () => {
        const e = makeEntity();
        e.UserID = OTHER;
        e.ContextCurrentUser = { ID: OWNER, Type: 'Owner' };
        await e.Save();
        expect(e.UserID).toBe(OTHER);
    });
});

describe('MJAIAgentUserPolicyEntityServer.Validate — agent context non-widening', () => {
    const AGENT_A = 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00';
    const AGENT_B = 'BBBBBBBB-4C11-4E8A-9B01-1A2B3C4D5E99';

    it('refuses cross-agent policy modifications when ExecutingAgentID is set', () => {
        const e = makeEntity();
        e.UserID = OWNER;
        e.AgentID = AGENT_B;
        e.ExecutingAgentID = AGENT_A;
        e.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        const r = e.Validate();
        expect(r.Success).toBe(false);
        expect(r.Errors.some((err) => err.Source === 'AgentID')).toBe(true);
    });

    it('refuses self-widening when ExecutingAgentID is set on an existing policy', () => {
        const e = makeEntity();
        e.IsSaved = true;
        e.UserID = OWNER;
        e.AgentID = AGENT_A;
        e.ExecutingAgentID = AGENT_A;
        e.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        e.RequireApprovalForExternalComms = false;
        e.SetFieldState('RequireApprovalForExternalComms', { Dirty: true, OldValue: true });
        const r = e.Validate();
        expect(r.Success).toBe(false);
        expect(r.Errors.some((err) => /cannot widen privileges/i.test(err.Message))).toBe(true);
    });

    it('allows self-narrowing when ExecutingAgentID is set on an existing policy', () => {
        const e = makeEntity();
        e.IsSaved = true;
        e.UserID = OWNER;
        e.AgentID = AGENT_A;
        e.ExecutingAgentID = AGENT_A;
        e.ContextCurrentUser = { ID: OWNER, Type: 'User' };
        e.RequireApprovalForExternalComms = true;
        e.SetFieldState('RequireApprovalForExternalComms', { Dirty: true, OldValue: false });
        const r = e.Validate();
        expect(r.Success).toBe(true);
    });
});
