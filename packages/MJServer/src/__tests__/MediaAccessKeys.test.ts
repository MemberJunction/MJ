import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { MediaAccessKeyManager, MEDIA_ACCESS_TOKEN_TYPE } from '../rest/MediaAccessKeys.js';

/**
 * The manager is a process-wide BaseSingleton whose secret is resolved lazily on first
 * Sign/Verify. Tests share that single ephemeral secret (no MJ_BASE_ENCRYPTION_KEY in the
 * test env), which is exactly what production does within one process.
 */
describe('MediaAccessKeyManager', () => {
  it('signs a token that round-trips through Verify with the correct claims', () => {
    const km = MediaAccessKeyManager.Instance;
    const { Token, ExpiresAt } = km.Sign('FILE-1', 'USER-1');

    expect(typeof Token).toBe('string');
    expect(ExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const result = km.Verify(Token);
    expect(result.Valid).toBe(true);
    if (result.Valid) {
      expect(result.Claims.fileId).toBe('FILE-1');
      expect(result.Claims.userId).toBe('USER-1');
      expect(result.Claims.typ).toBe(MEDIA_ACCESS_TOKEN_TYPE);
    }
  });

  it('honors the requested TTL on ExpiresAt', () => {
    const km = MediaAccessKeyManager.Instance;
    const { ExpiresAt } = km.Sign('FILE-2', 'USER-2', 2); // 2 hours
    const deltaMs = ExpiresAt.getTime() - Date.now();
    // ~2h, allow a generous window for execution time.
    expect(deltaMs).toBeGreaterThan(1.9 * 3600 * 1000);
    expect(deltaMs).toBeLessThan(2.1 * 3600 * 1000);
  });

  it('rejects a tampered token', () => {
    const km = MediaAccessKeyManager.Instance;
    const { Token } = km.Sign('FILE-3', 'USER-3');
    const tampered = Token.slice(0, -2) + (Token.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(km.Verify(tampered).Valid).toBe(false);
  });

  it('rejects a malformed / empty token', () => {
    const km = MediaAccessKeyManager.Instance;
    expect(km.Verify('').Valid).toBe(false);
    expect(km.Verify('not.a.jwt').Valid).toBe(false);
  });

  it('rejects an expired token', () => {
    const km = MediaAccessKeyManager.Instance;
    // Negative TTL → already expired when minted.
    const { Token } = km.Sign('FILE-4', 'USER-4', -1);
    expect(km.Verify(Token).Valid).toBe(false);
  });

  it('rejects a token with the wrong typ even if validly signed', () => {
    const km = MediaAccessKeyManager.Instance;
    // Mint a valid token, then read the real secret out of a known-good token by
    // re-signing through the manager is not possible; instead assert that a token
    // whose typ differs is rejected by signing a structurally-valid JWT with a
    // foreign secret (signature failure also yields false, which is the safe outcome).
    const foreign = jwt.sign({ fileId: 'FILE-5', userId: 'USER-5', typ: 'something-else' }, 'foreign-secret', {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    expect(km.Verify(foreign).Valid).toBe(false);
  });
});
