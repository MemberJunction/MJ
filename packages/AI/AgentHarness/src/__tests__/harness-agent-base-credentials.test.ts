/**
 * Coverage for how HarnessAgentBase turns an `MJ: AI Agent Credentials` grant into an environment
 * variable.
 *
 * The defect these lock in: the grant's credential was loaded with `GetEntityObject` + `Load` and its
 * raw `Values` column — a JSON blob of EVERY field of the credential — was injected wholesale as the
 * variable's value, bypassing CredentialEngine (so no decryption audit, no LastUsedAt, no expiry
 * check). The harness saw `{"apiKey":"sk-..."}` where it expected `sk-...`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const engine = vi.hoisted(() => ({
    Config: vi.fn(),
    GetCredentialById: vi.fn(),
    GetCredential: vi.fn(),
}));
const runViewState = vi.hoisted(() => ({
    grants: [] as Array<{ CredentialID: string; EnvVariableName: string | null }>,
}));

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: { Instance: engine },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        public async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: runViewState.grants };
        }
    }
    return { ...actual, RunView: FakeRunView, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { LogError } from '@memberjunction/core';
import { HarnessAgentBase } from '../HarnessAgentBase';

const SECRET = 'sk-ant-the-real-secret';

interface Resolver {
    resolveGrantedEnvironment(contextUser?: unknown): Promise<Record<string, string>>;
}

function makeAgent(driverClass = 'ClaudeCodeCliAdapter'): Resolver {
    const agent = new HarnessAgentBase();
    const internals = agent as unknown as {
        _executeParams: { agent: { ID: string } };
        harnessRow: { Name: string; DriverClass: string };
    };
    internals._executeParams = { agent: { ID: 'agent-42' } };
    internals.harnessRow = { Name: 'Claude Code', DriverClass: driverClass };
    return agent as unknown as Resolver;
}

const credential = (over: Record<string, unknown> = {}) => ({
    ID: 'cred-1',
    Name: 'Anthropic Prod',
    IsActive: true,
    ExpiresAt: null,
    ...over,
});

function mockCredential(values: Record<string, string>, over: Record<string, unknown> = {}): void {
    engine.GetCredentialById.mockReturnValue(credential(over));
    engine.GetCredential.mockResolvedValue({ credential: credential(over), values, source: 'database' });
}

describe('HarnessAgentBase credential injection', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.clearAllMocks();
        engine.Config.mockResolvedValue(undefined);
        runViewState.grants = [{ CredentialID: 'cred-1', EnvVariableName: 'ANTHROPIC_API_KEY' }];
        delete process.env.ANTHROPIC_API_KEY;
    });
    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('resolves through CredentialEngine with the agent subsystem, the credential id and the context user', async () => {
        mockCredential({ apiKey: SECRET });
        const user = { ID: 'user-1' };
        await makeAgent().resolveGrantedEnvironment(user);

        expect(engine.GetCredential).toHaveBeenCalledWith('Anthropic Prod', {
            contextUser: user,
            credentialId: 'cred-1',
            subsystem: 'AgentHarness',
        });
        // Third argument is the agent's metadata provider (undefined in this bare test harness).
        expect(engine.Config.mock.calls[0].slice(0, 2)).toEqual([false, user]);
    });

    it('injects the single secret value, NOT the JSON blob', async () => {
        mockCredential({ apiKey: SECRET });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({ ANTHROPIC_API_KEY: SECRET });
    });

    it('picks the api key out of a multi-field credential and leaves the other fields behind', async () => {
        mockCredential({ apiKey: SECRET, endpoint: 'https://internal.example.com' });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env.ANTHROPIC_API_KEY).toBe(SECRET);
        expect(JSON.stringify(env)).not.toContain('internal.example.com');
    });

    it('skips an ambiguous credential, logs it by name and agent, and never injects the blob', async () => {
        mockCredential({ accessKeyId: 'AKIA', secretAccessKey: 'shh', region: 'us-east-1' });
        const env = await makeAgent().resolveGrantedEnvironment();

        expect(env).toEqual({});
        const logged = vi.mocked(LogError).mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toContain('Anthropic Prod');
        expect(logged).toContain('agent-42');
        expect(logged).toContain('ambiguous');
        expect(logged).not.toContain('shh');
        expect(logged).not.toContain('AKIA');
    });

    it('does not fall back to the server env var when a granted credential is ambiguous', async () => {
        process.env.ANTHROPIC_API_KEY = 'server-held-key';
        mockCredential({ username: 'u', password: 'p' });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({});
    });

    it('refuses an inactive credential', async () => {
        mockCredential({ apiKey: SECRET }, { IsActive: false });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({});
        expect(engine.GetCredential).not.toHaveBeenCalled();
        expect(String(vi.mocked(LogError).mock.calls[0][0])).toContain('inactive');
    });

    it('refuses an expired credential — the engine itself does not enforce expiry', async () => {
        mockCredential({ apiKey: SECRET }, { ExpiresAt: new Date(Date.now() - 60_000) });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({});
        expect(engine.GetCredential).not.toHaveBeenCalled();
        expect(String(vi.mocked(LogError).mock.calls[0][0])).toContain('expired');
    });

    it('accepts a credential whose expiry is in the future', async () => {
        mockCredential({ apiKey: SECRET }, { ExpiresAt: new Date(Date.now() + 3_600_000) });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env.ANTHROPIC_API_KEY).toBe(SECRET);
    });

    it('refreshes the engine once when the credential is not cached, then proceeds', async () => {
        engine.GetCredentialById.mockReturnValueOnce(undefined).mockReturnValue(credential());
        engine.GetCredential.mockResolvedValue({ credential: credential(), values: { apiKey: SECRET }, source: 'database' });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env.ANTHROPIC_API_KEY).toBe(SECRET);
        expect(engine.Config.mock.calls.map((c) => c[0])).toEqual([false, true]);
    });

    it('falls back to the server environment variable only when the credential cannot be found at all', async () => {
        process.env.ANTHROPIC_API_KEY = 'server-held-key';
        engine.GetCredentialById.mockReturnValue(undefined);
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({ ANTHROPIC_API_KEY: 'server-held-key' });
    });

    it('falls back to the server environment when the engine throws', async () => {
        process.env.ANTHROPIC_API_KEY = 'server-held-key';
        engine.Config.mockRejectedValue(new Error('db down'));
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({ ANTHROPIC_API_KEY: 'server-held-key' });
    });

    it('does not apply the zero-config vendor-key fallback over a rejected grant', async () => {
        process.env.AI_VENDOR_API_KEY__CLAUDECODECLIADAPTER = 'vendor-key-from-server';
        mockCredential({ accessKeyId: 'AKIA', secretAccessKey: 'shh' });
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({});
    });

    it('still applies the vendor-key fallback when the agent has no grants at all', async () => {
        process.env.AI_VENDOR_API_KEY__CLAUDECODECLIADAPTER = 'vendor-key-from-server';
        runViewState.grants = [];
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({ ANTHROPIC_API_KEY: 'vendor-key-from-server' });
    });

    it('skips a grant that names no environment variable', async () => {
        runViewState.grants = [{ CredentialID: 'cred-1', EnvVariableName: null }];
        const env = await makeAgent().resolveGrantedEnvironment();
        expect(env).toEqual({});
        expect(engine.GetCredential).not.toHaveBeenCalled();
    });
});
