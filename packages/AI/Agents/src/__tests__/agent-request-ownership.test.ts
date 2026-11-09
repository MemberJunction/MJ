/**
 * MJAIAgentRequestEntityServer — an agent request is private to the user it is for.
 *
 * The UI role may create and update `MJ: AI Agent Requests` (metadata grant), so this guard
 * keeps the rows per-user: a non-Owner-type user may create a request only for themselves and
 * may update only a request that was already theirs (the PRE-save RequestForUserID). Owner-type
 * users, which include the scheduler's system user, are exempt, so cross-user paths such as
 * Send Inter-Agent Request keep working under an administrator or system context.
 */
import { describe, it, expect, vi } from 'vitest';
import { ValidationResult } from '@memberjunction/global';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { get Instance() { return { Config: vi.fn(async () => undefined), AgentTypes: [] }; } },
}));

interface FieldState {
    Dirty?: boolean;
    OldValue?: unknown;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    class MockMJAIAgentRequestEntity {
        public RequestForUserID: string | null = null;
        public Status = 'Requested';
        public ResponseByUserID: string | null = null;
        public OriginatingTaskID: string | null = null;
        public OriginatingAgentRunID: string | null = null;
        public ResumingAgentRunID: string | null = null;
        public AgentID: string | null = null;
        public ID = 'QQQQQQQQ-0000-0000-0000-00000000000Q';
        public IsSaved = false;
        public ContextCurrentUser: { ID: string; Type: string | null } | null = null;
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
        /** As `BaseEntity.Save`: validates, and writes only when that passes. */
        public async Save(): Promise<boolean> {
            return this.Validate().Success;
        }
    }
    return { ...actual, MJAIAgentRequestEntity: MockMJAIAgentRequestEntity };
});

import { MJAIAgentRequestEntityServer } from '../MJAIAgentRequestEntityServer';

interface MockHooks {
    IsSaved: boolean;
    ContextCurrentUser: { ID: string; Type: string | null } | null;
    SetFieldState(name: string, state: FieldState): void;
}

const ME = 'AAAAAAAA-0000-0000-0000-00000000000A';
const THEM = 'BBBBBBBB-0000-0000-0000-00000000000B';

function makeRequest(): MJAIAgentRequestEntityServer & MockHooks {
    return new MJAIAgentRequestEntityServer() as MJAIAgentRequestEntityServer & MockHooks;
}

describe('MJAIAgentRequestEntityServer.Validate — ownership', () => {
    it('lets a user create a request for themselves', () => {
        const r = makeRequest();
        r.RequestForUserID = ME.toLowerCase();
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(true);
    });

    it('blocks a non-Owner-type user from creating a request for someone else', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        const result = r.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['RequestForUserID']);
    });

    it('blocks a non-Owner-type user from updating a request that is not theirs, judged by the PRE-save owner', () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.SetFieldState('RequestForUserID', { Dirty: true, OldValue: THEM });
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(false);
    });

    it('lets a user resolve their own request', () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.ContextCurrentUser = { ID: ME, Type: 'User' };
        expect(r.Validate().Success).toBe(true);
    });

    it('exempts Owner-type users (administrators and the scheduler system user)', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = { ID: ME, Type: 'Owner' };
        expect(r.Validate().Success).toBe(true);
    });

    it('skips the gate with no context user', () => {
        const r = makeRequest();
        r.RequestForUserID = THEM;
        r.ContextCurrentUser = null;
        expect(r.Validate().Success).toBe(true);
    });
});

describe('MJAIAgentRequestEntityServer — who answered', () => {
    /** A task-graph request for ME, answered by this save. */
    function answered(opts: { saved: boolean; user: { ID: string; Type: string | null } }): MJAIAgentRequestEntityServer & MockHooks {
        const r = makeRequest();
        r.IsSaved = opts.saved;
        r.RequestForUserID = ME;
        r.OriginatingTaskID = 'task-1';
        r.Status = 'Approved';
        if (opts.saved) r.SetFieldState('Status', { Dirty: true, OldValue: 'Requested' });
        r.ResponseByUserID = THEM;
        r.ContextCurrentUser = opts.user;
        return r;
    }

    it('records the user who answers as the responder, whatever the caller wrote', async () => {
        const r = answered({ saved: true, user: { ID: ME, Type: 'User' } });
        expect(await r.Save()).toBe(true);
        expect(r.ResponseByUserID).toBe(ME);
    });

    it('records the creator as the responder of a request created already answered', async () => {
        const r = answered({ saved: false, user: { ID: ME, Type: 'User' } });
        expect(await r.Save()).toBe(true);
        expect(r.ResponseByUserID).toBe(ME);
    });

    it("refuses changing an answered request's responder, an Owner-type user's change included", () => {
        const r = makeRequest();
        r.IsSaved = true;
        r.RequestForUserID = ME;
        r.Status = 'Approved';
        r.SetFieldState('Status', { Dirty: false, OldValue: 'Approved' });
        r.ResponseByUserID = ME;
        r.SetFieldState('ResponseByUserID', { Dirty: true, OldValue: THEM });
        r.ContextCurrentUser = { ID: THEM, Type: 'Owner' };
        const result = r.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source)).toEqual(['ResponseByUserID']);
    });
});
