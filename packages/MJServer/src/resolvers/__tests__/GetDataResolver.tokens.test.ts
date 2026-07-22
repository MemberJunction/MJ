// type-graphql decorators on the resolver class call Reflect.getMetadata, which only
// exists when this polyfill is loaded first (mirrors RealtimeBridgeResolver.test.ts).
import 'reflect-metadata';

import { describe, it, expect, vi } from 'vitest';

// This test exercises only the plain, exported token-lifecycle functions at the
// bottom of GetDataResolver.ts — NOT the `GetData`/`GetAllEntities` resolver
// methods. Those methods (and the module-level `import ... from '../index.js'`)
// pull in MJServer's entire bootstrap graph (SQL Server provider, Apollo server,
// env-driven config validation), which is both heavy and requires live DB env
// vars to even import. Mock those heavy imports out so this file stays a true,
// isolated unit test of the token-tracking logic (mirrors the mocking convention
// in RealtimeBridgeResolver.test.ts).
vi.mock('../../index.js', () => ({ getDbType: vi.fn() }));
vi.mock('@memberjunction/generic-database-provider', () => ({
  QueryCompositionEngine: vi.fn(() => ({ HasCompositionTokens: vi.fn(() => false) })),
}));
vi.mock('../../util.js', () => ({ GetReadOnlyDataSource: vi.fn(), GetReadOnlyProvider: vi.fn() }));
vi.mock('../../auth/index.js', () => ({ getSystemUser: vi.fn() }));
vi.mock('mssql', () => ({ default: { Request: vi.fn() } }));

import {
  registerAccessToken,
  deleteAccessToken,
  tokenExists,
  isTokenValid,
  recordTokenUse,
  pruneExpiredTokens,
  getAccessTokenCount,
} from '../GetDataResolver.js';

// ---------------------------------------------------------------------------
// Regression coverage for a memory leak (Memory Leak Audit Round 7, Critical):
// `__accessTokens` (module-level array backing GetDataResolver's short-lived
// access tokens) grew forever — nothing ever removed an expired token,
// `deleteAccessToken()` has no production caller, and `isTokenValid()` only
// checked expiry without pruning. `registerAccessToken()` now sweeps expired
// tokens (via `pruneExpiredTokens()`) on every call, so the array self-bounds to
// roughly "tokens registered within one lifespan window" instead of growing with
// total lifetime registrations.
//
// Each test uses a unique token (uuidv4-backed default, or an explicit unique
// string) so state from other tests sharing the same module-level array doesn't
// interfere with assertions.
// ---------------------------------------------------------------------------

let seq = 0;
const uniqueToken = () => `test-token-${Date.now()}-${++seq}`;

describe('GetDataResolver access-token lifecycle', () => {
  it('registerAccessToken() creates a token that is valid and exists', () => {
    const token = uniqueToken();
    const created = registerAccessToken(token, 60_000);
    expect(created.Token).toBe(token);
    expect(tokenExists(token)).toBe(true);
    expect(isTokenValid(token)).toBe(true);
  });

  it('registerAccessToken() throws when the same custom token is registered twice', () => {
    const token = uniqueToken();
    registerAccessToken(token, 60_000);
    expect(() => registerAccessToken(token, 60_000)).toThrow(/already exists/);
  });

  it('isTokenValid() is false for an unknown token and for an expired one', () => {
    expect(isTokenValid('never-registered-token')).toBe(false);

    const token = uniqueToken();
    registerAccessToken(token, -1); // already expired (ExpiresAt in the past)
    expect(isTokenValid(token)).toBe(false);
  });

  it('deleteAccessToken() removes a token and throws for an unknown one', () => {
    const token = uniqueToken();
    registerAccessToken(token, 60_000);
    expect(tokenExists(token)).toBe(true);

    deleteAccessToken(token);
    expect(tokenExists(token)).toBe(false);
    expect(() => deleteAccessToken(token)).toThrow(/does not exist/);
  });

  it('recordTokenUse() appends to TokenUses and throws for an unknown token', () => {
    const token = uniqueToken();
    registerAccessToken(token, 60_000);

    expect(() => recordTokenUse(token, { some: 'payload' })).not.toThrow();
    expect(() => recordTokenUse('never-registered-token', {})).toThrow(/does not exist/);
  });

  it('pruneExpiredTokens() removes only tokens whose ExpiresAt has passed', () => {
    const expiredToken = uniqueToken();
    const liveToken = uniqueToken();
    registerAccessToken(expiredToken, -1); // already expired
    registerAccessToken(liveToken, 60_000); // still valid

    pruneExpiredTokens();

    expect(tokenExists(expiredToken)).toBe(false);
    expect(tokenExists(liveToken)).toBe(true);
  });

  it('pruneExpiredTokens() accepts an injected "now" for deterministic testing', () => {
    const token = uniqueToken();
    const registeredAt = new Date('2026-01-01T00:00:00Z');
    registerAccessToken(token, 5 * 60 * 1000); // 5-minute lifespan from real "now"

    // Simulate a check far in the future — token should count as expired at that instant.
    const farFuture = new Date(registeredAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    pruneExpiredTokens(farFuture);

    expect(tokenExists(token)).toBe(false);
  });

  it('the core Round 7 regression: registering many expired tokens does not grow the array without bound', () => {
    const before = getAccessTokenCount();

    // Simulate 50 short-lived tokens that all expire immediately (e.g. a burst
    // of external calls with a near-zero lifespan, or tokens whose consumer
    // never came back before expiry — the exact shape of the leak this fix
    // addresses).
    for (let i = 0; i < 50; i++) {
      registerAccessToken(`${uniqueToken()}-burst-${i}`, -1);
    }

    // Register one more, healthy token — its registerAccessToken() call sweeps
    // all 50 expired ones out, so the count should NOT have grown by 51; it
    // should only reflect whatever was live before plus this one new token.
    const survivorToken = uniqueToken();
    registerAccessToken(survivorToken, 60_000);

    // The 50 expired burst tokens must be gone — the array self-bounded rather
    // than accumulating every registration for the life of the process.
    expect(getAccessTokenCount()).toBeLessThan(before + 51);
    expect(tokenExists(survivorToken)).toBe(true);
  });
});
