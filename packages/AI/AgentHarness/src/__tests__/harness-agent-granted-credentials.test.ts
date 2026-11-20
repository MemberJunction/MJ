/**
 * The harness resolves granted credentials and the user's own delegated GitHub token through the
 * server-side credential engine, so a context user who cannot read `MJ: Credentials` still gets
 * what the agent was granted, and nothing else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { HarnessAgentBase } from '../HarnessAgentBase';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

interface FakeCredential {
    ID: string;
    Name: string;
    Values: string;
    IsActive: boolean;
    ExpiresAt: Date | null;
}

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const GRANTED_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const NOT_GRANTED_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

/** In-memory stand-in for CredentialEngine: holds every row and checks the owner of delegated rows. */
const { store, fakeEngine } = vi.hoisted(() => {
    const rows: FakeCredential[] = [];
    const engine = {
        Config: async (): Promise<void> => undefined,
        async GetCredential(name: string, options: { credentialId?: string; contextUser?: UserInfo }) {
            const credential = rows.find((c) => c.ID === options.credentialId || c.Name === name);
            if (!credential) {
                throw new Error('not found');
            }
            const parsed = JSON.parse(credential.Values) as Record<string, string>;
            if (parsed.ownerUserId && parsed.ownerUserId.toLowerCase() !== options.contextUser?.ID.toLowerCase()) {
                throw new Error('owner mismatch');
            }
            return { credential, values: parsed, source: 'database' };
        },
        async GetUserDelegatedCredential(providerName: string, contextUser: UserInfo) {
            const name = `UserOAuth3LO:${providerName}:${contextUser.ID.toLowerCase()}`;
            const match = rows.find((c) => c.Name === name && c.IsActive);
            return match ? engine.GetCredential(name, { credentialId: match.ID, contextUser }) : null;
        },
    };
    return { store: rows, fakeEngine: engine };
});

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: { Instance: fakeEngine },
}));

function user(id: string): UserInfo {
    return { ID: id, Name: 'Test User', Email: 'user@example.com' } as UserInfo;
}

function delegatedRow(ownerId: string, token: string): FakeCredential {
    return {
        ID: `bbbbbbbb-0000-0000-0000-${ownerId.slice(-12)}`,
        Name: `UserOAuth3LO:GitHub:${ownerId}`,
        Values: JSON.stringify({ ownerUserId: ownerId, accessToken: token }),
        IsActive: true,
        ExpiresAt: null,
    };
}

/** Grants come back for the agent; `MJ: Credentials` is denied, as for a UI-only user. */
function stubRunViewAsUiUser(grants: Array<{ CredentialID: string; EnvVariableName: string }>): void {
    vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params: RunViewParams) => {
        if (params.EntityName === 'MJ: AI Agent Credentials') {
            return { Success: true, Results: grants } as RunViewResult;
        }
        return { Success: false, ErrorMessage: 'no read permission', Results: [] } as RunViewResult;
    });
}

function makeAgent(): HarnessAgentBase {
    const agent = new HarnessAgentBase();
    const internals = agent as unknown as {
        _executeParams: { agent: { ID: string } };
        _activeProvider: { GetEntityObject: () => Promise<{ Load: () => Promise<boolean> }> };
    };
    internals._executeParams = { agent: { ID: 'agent-1' } };
    internals._activeProvider = { GetEntityObject: async () => ({ Load: async () => false }) };
    return agent;
}

function resolveEnvironment(agent: HarnessAgentBase, contextUser: UserInfo): Promise<Record<string, string>> {
    return (agent as unknown as {
        resolveGrantedEnvironment(u: UserInfo): Promise<Record<string, string>>;
    }).resolveGrantedEnvironment(contextUser);
}

describe('HarnessAgentBase granted credentials for a user who cannot read MJ: Credentials', () => {
    beforeEach(() => {
        store.length = 0;
        vi.stubEnv('TEST_API_KEY', '');
        vi.stubEnv('OTHER_API_KEY', '');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('resolves a granted credential and leaves out a credential that is not granted', async () => {
        store.push(
            { ID: GRANTED_ID, Name: 'Granted', Values: '{"apiKey":"granted-marker"}', IsActive: true, ExpiresAt: null },
            { ID: NOT_GRANTED_ID, Name: 'Other', Values: '{"apiKey":"other-marker"}', IsActive: true, ExpiresAt: null },
        );
        stubRunViewAsUiUser([{ CredentialID: GRANTED_ID, EnvVariableName: 'TEST_API_KEY' }]);

        const env = await resolveEnvironment(makeAgent(), user(USER_A));

        expect(env.TEST_API_KEY).toBe('granted-marker');
        expect(Object.values(env)).not.toContain('other-marker');
    });

    it("resolves the user's own delegated GitHub token and never another user's", async () => {
        store.push(delegatedRow(USER_A, 'own-token-marker'), delegatedRow(USER_B, 'other-user-token-marker'));
        stubRunViewAsUiUser([]);

        const env = await resolveEnvironment(makeAgent(), user(USER_A));

        expect(env.GH_TOKEN).toBe('own-token-marker');
        expect(Object.values(env)).not.toContain('other-user-token-marker');
    });

    it('does not resolve a granted credential that is a different user\'s delegated token', async () => {
        const other = delegatedRow(USER_B, 'other-user-token-marker');
        store.push(other, { ID: GRANTED_ID, Name: 'Granted', Values: '{"apiKey":"granted-marker"}', IsActive: true, ExpiresAt: null });
        stubRunViewAsUiUser([
            { CredentialID: other.ID, EnvVariableName: 'OTHER_API_KEY' },
            { CredentialID: GRANTED_ID, EnvVariableName: 'TEST_API_KEY' },
        ]);

        const env = await resolveEnvironment(makeAgent(), user(USER_A));

        expect(env.TEST_API_KEY).toBe('granted-marker');
        expect(env.OTHER_API_KEY).toBeUndefined();
        expect(Object.values(env)).not.toContain('other-user-token-marker');
    });
});
