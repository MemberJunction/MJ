import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    ApplyGitHubEnvironmentConventions,
    ExtractHarnessCredentialSecret,
} from '../HarnessCredentialResolver.js';

const TEST_RSA = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('HarnessCredentialResolver', () => {
    it('extracts scalar token/apiKey values from MJ: Credentials.Values JSON instead of leaking raw JSON', async () => {
        const patJson = JSON.stringify({
            token: 'ghp_pat_secret_123',
            defaultOwner: 'MemberJunction',
            allowMerge: false,
        });
        expect(await ExtractHarnessCredentialSecret(patJson)).toBe('ghp_pat_secret_123');

        const apiKeyJson = JSON.stringify({ apiKey: 'sk-ant-api03-xyz' });
        expect(await ExtractHarnessCredentialSecret(apiKeyJson)).toBe('sk-ant-api03-xyz');

        const oauthJson = JSON.stringify({
            accessToken: 'gho_user_token_999',
            refreshToken: 'ghr_refresh_111',
        });
        expect(await ExtractHarnessCredentialSecret(oauthJson)).toBe('gho_user_token_999');
    });

    it('mints a short-lived installation token for GitHub App credentials without exposing the PEM key', async () => {
        let capturedUrl = '';
        let capturedBody: Record<string, unknown> = {};

        const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
            capturedUrl = String(input);
            capturedBody = JSON.parse(String(init?.body ?? '{}'));
            return new Response(
                JSON.stringify({
                    token: 'ghs_short_lived_sandbox_token_777',
                    expires_at: '2026-11-05T15:00:00Z',
                }),
                { status: 201 }
            );
        }) as typeof fetch;

        const githubAppValues = JSON.stringify({
            appId: '112233',
            installationId: '998877',
            privateKey: TEST_RSA.privateKey,
            allowedRepositories: 'MemberJunction/MJ, MemberJunction/Integrations',
        });

        const token = await ExtractHarnessCredentialSecret(githubAppValues, {
            EnvVariableName: 'GH_TOKEN',
            FetchImpl: mockFetch,
        });

        expect(token).toBe('ghs_short_lived_sandbox_token_777');
        expect(token).not.toContain('BEGIN PRIVATE KEY');
        expect(capturedUrl).toBe('https://api.github.com/app/installations/998877/access_tokens');
        expect(capturedBody).toEqual({
            repositories: ['MJ', 'Integrations'],
        });
    });

    it('mirrors GH_TOKEN <-> GITHUB_TOKEN and sets non-interactive git/gh identity env vars', () => {
        const env: Record<string, string> = {
            GH_TOKEN: 'ghs_sandbox_token_abc',
        };
        ApplyGitHubEnvironmentConventions(env, 'Code Review Bot');

        expect(env.GH_TOKEN).toBe('ghs_sandbox_token_abc');
        expect(env.GITHUB_TOKEN).toBe('ghs_sandbox_token_abc');
        expect(env.GH_PROMPT_DISABLED).toBe('1');
        expect(env.GIT_TERMINAL_PROMPT).toBe('0');
        expect(env.GIT_AUTHOR_NAME).toBe('Code Review Bot (MJ Agent)');
        expect(env.GIT_AUTHOR_EMAIL).toBe('code-review-bot@agents.memberjunction.local');
        expect(env.GIT_COMMITTER_NAME).toBe('Code Review Bot (MJ Agent)');
        expect(env.GIT_COMMITTER_EMAIL).toBe('code-review-bot@agents.memberjunction.local');
    });

    it('enforces strict per-user ownership on 3LO credentials and attributes Git author to the user', async () => {
        const aliceId = '11111111-2222-3333-4444-555555555555';
        const bobId = '99999999-8888-7777-6666-555555555555';
        const alice3LOCredential = JSON.stringify({
            ownerUserId: aliceId,
            provider: 'GitHub',
            accessToken: 'gho_alice_personal_oauth_token',
        });

        // Alice can resolve her own 3LO credential
        const aliceToken = await ExtractHarnessCredentialSecret(alice3LOCredential, {
            ContextUserId: aliceId,
        });
        expect(aliceToken).toBe('gho_alice_personal_oauth_token');

        // Bob is strictly blocked from resolving Alice's 3LO credential
        await expect(
            ExtractHarnessCredentialSecret(alice3LOCredential, { ContextUserId: bobId })
        ).rejects.toThrow(/3LO credential ownership mismatch/);

        // When operating in 3LO mode, Git author is Alice while committer is the MJ Agent
        const env: Record<string, string> = { GH_TOKEN: aliceToken! };
        ApplyGitHubEnvironmentConventions(env, 'Claude Code', {
            IsUserDelegated: true,
            UserName: 'Alice Developer',
            UserEmail: 'alice@example.com',
        });
        expect(env.GIT_AUTHOR_NAME).toBe('Alice Developer');
        expect(env.GIT_AUTHOR_EMAIL).toBe('alice@example.com');
        expect(env.GIT_COMMITTER_NAME).toBe('Claude Code (MJ Agent)');
        expect(env.GIT_COMMITTER_EMAIL).toBe('claude-code@agents.memberjunction.local');
    });
});
