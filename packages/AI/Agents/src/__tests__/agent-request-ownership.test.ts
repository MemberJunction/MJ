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
