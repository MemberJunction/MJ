import { describe, it, expect, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BasePgCredentialProvider,
    BuildPgPasswordSource,
    CachingPgCredentialProvider,
    PgCredentialProviders,
    PgCredentialRequest,
    ResolvePgAuthMode,
} from '../pgCredentials.js';

const request: PgCredentialRequest = { Host: 'db.example.com', Port: 5432, User: 'app', Database: 'mj' };

/** Hands out token-1, token-2, … each valid for `lifetimeMs`. */
class CountingProvider extends CachingPgCredentialProvider {
    public Fetches = 0;
    public constructor(private readonly lifetimeMs: number) {
        super();
    }
    protected override get RefreshMarginMs(): number {
        return 1000;
    }
    protected async FetchToken(): Promise<{ Token: string; ExpiresAt: number }> {
        this.Fetches++;
        return { Token: `token-${this.Fetches}`, ExpiresAt: Date.now() + this.lifetimeMs };
    }
}

@RegisterClass(BasePgCredentialProvider, 'test-token-mode')
class RegisteredTestProvider extends CachingPgCredentialProvider {
    protected async FetchToken(): Promise<{ Token: string; ExpiresAt: number }> {
        return { Token: 'registered-token', ExpiresAt: Date.now() + 3_600_000 };
    }
}

describe('CachingPgCredentialProvider', () => {
    it('reuses a token until it is within the refresh margin of expiring', async () => {
        vi.useFakeTimers();
        try {
            const provider = new CountingProvider(60_000);
            expect(await provider.GetPassword(request)).toBe('token-1');
            vi.advanceTimersByTime(30_000);
            expect(await provider.GetPassword(request)).toBe('token-1');
            vi.advanceTimersByTime(29_500); // inside the 1s margin
            expect(await provider.GetPassword(request)).toBe('token-2');
            expect(provider.Fetches).toBe(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('shares one fetch between concurrent callers', async () => {
        const provider = new CountingProvider(60_000);
        const tokens = await Promise.all([provider.GetPassword(request), provider.GetPassword(request), provider.GetPassword(request)]);
        expect(tokens).toEqual(['token-1', 'token-1', 'token-1']);
        expect(provider.Fetches).toBe(1);
    });

    it('caches per login', async () => {
        const provider = new CountingProvider(60_000);
        await provider.GetPassword(request);
        await provider.GetPassword({ ...request, User: 'other' });
        expect(provider.Fetches).toBe(2);
    });

    it('requires TLS', () => {
        expect(new CountingProvider(1).RequiresTls).toBe(true);
    });
});

describe('ResolvePgAuthMode', () => {
    it('prefers PG_AUTH_MODE, then config, then password', () => {
        expect(ResolvePgAuthMode('azure-entra', { PG_AUTH_MODE: 'aws-rds-iam' })).toBe('aws-rds-iam');
        expect(ResolvePgAuthMode('azure-entra', {})).toBe('azure-entra');
        expect(ResolvePgAuthMode(undefined, {})).toBe('password');
    });
});

describe('BuildPgPasswordSource', () => {
    it('returns undefined for password mode, so the configured password is used', () => {
        expect(BuildPgPasswordSource('password', request)).toBeUndefined();
    });

    it('resolves a registered provider and calls it for each connection', async () => {
        expect(RegisteredTestProvider).toBeDefined();
        const source = BuildPgPasswordSource('test-token-mode', request);
        expect(await source?.()).toBe('registered-token');
    });

    it('fails clearly when no provider is registered for the mode', () => {
        expect(() => PgCredentialProviders.Instance.Get('no-such-mode')).toThrow(/no PostgreSQL credential provider is registered/);
    });
});
