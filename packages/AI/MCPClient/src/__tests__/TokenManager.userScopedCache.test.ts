/**
 * @fileoverview The in-memory token cache is keyed by connection AND user. A token one user loaded
 * must never be served to another user from the cache: every user's first load runs the lookup as
 * that user, so their own permissions and the credential access audit apply.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';

const { state } = vi.hoisted(() => ({
    state: {
        lookups: [] as Array<string | undefined>,
        credentialReads: [] as Array<string | undefined>,
        /** Users the token row is visible to. */
        visibleTo: new Set<string>(),
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class FakeRunView {
        async RunView(_params: unknown, user?: UserInfo) {
            state.lookups.push(user?.ID);
            const visible = state.visibleTo.has(user?.ID ?? '');
            return {
                Success: true,
                Results: visible
                    ? [{ CredentialID: 'cred-1', TokenType: 'Bearer', ExpiresAt: new Date(Date.now() + 3600_000), Scope: null, IssuerURL: 'https://issuer', LastRefreshAt: null, RefreshCount: 0 }]
                    : [],
            };
        }
    }
    return { ...actual, RunView: FakeRunView, LogStatus: () => undefined, LogError: () => undefined };
});

vi.mock('@memberjunction/credentials', () => ({
    CredentialEngine: {
        Instance: {
            Config: vi.fn(),
            getCredential: vi.fn(async (_name: string, options: { contextUser?: UserInfo }) => {
                state.credentialReads.push(options.contextUser?.ID);
                return { values: { accessToken: 'access-token-for-connection' } };
            }),
        },
    },
}));

import { TokenManager } from '../oauth/TokenManager.js';

const CONNECTION_ID = 'C0000000-0000-0000-0000-000000000001';
const ALICE = { ID: 'A0000000-0000-0000-0000-00000000000A' } as UserInfo;
const BOB = { ID: 'B0000000-0000-0000-0000-00000000000B' } as UserInfo;

describe('TokenManager token cache is scoped to the user', () => {
    beforeEach(() => {
        state.lookups = [];
        state.credentialReads = [];
        state.visibleTo = new Set([ALICE.ID]);
    });

    it("does not serve one user's cached tokens to another user", async () => {
        const manager = new TokenManager();
        expect(await manager.LoadTokens(CONNECTION_ID, ALICE)).not.toBeNull();

        const forBob = await manager.LoadTokens(CONNECTION_ID, BOB);

        expect(forBob).toBeNull();
        expect(state.lookups).toEqual([ALICE.ID, BOB.ID]);
    });

    it("runs the credential read, and so its audit, as each user on that user's first load", async () => {
        state.visibleTo = new Set([ALICE.ID, BOB.ID]);
        const manager = new TokenManager();
        await manager.LoadTokens(CONNECTION_ID, ALICE);
        await manager.LoadTokens(CONNECTION_ID, BOB);

        expect(state.credentialReads).toEqual([ALICE.ID, BOB.ID]);
    });

    it('serves a repeat load by the same user from the cache', async () => {
        const manager = new TokenManager();
        await manager.LoadTokens(CONNECTION_ID, ALICE);
        await manager.LoadTokens(CONNECTION_ID, ALICE);

        expect(state.lookups).toEqual([ALICE.ID]);
    });

    it('never caches a load made without a user ID', async () => {
        state.visibleTo = new Set(['']);
        const manager = new TokenManager();
        const anonymous = {} as UserInfo;
        await manager.LoadTokens(CONNECTION_ID, anonymous);
        await manager.LoadTokens(CONNECTION_ID, anonymous);

        expect(state.lookups).toEqual([undefined, undefined]);
    });
});
