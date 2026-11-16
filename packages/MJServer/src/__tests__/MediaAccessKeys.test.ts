import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { GetGlobalObjectStore } from '@memberjunction/global';
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

  it('rejects a token with the wrong typ even when validly signed with the real secret', () => {
    const km = MediaAccessKeyManager.Instance;
    const uploadToken = km.SignUpload('USER-5').Token;
    expect(km.Verify(uploadToken).Valid).toBe(false);

    const mediaToken = km.Sign('FILE-5', 'USER-5').Token;
    expect(km.VerifyUpload(mediaToken).Valid).toBe(false);
  });

  it('derives a domain-separated HS256 signing key from MJ_BASE_ENCRYPTION_KEY and rejects tokens signed with the raw master key', () => {
    const store = GetGlobalObjectStore();
    const savedStoreSecret = store?.['___MEDIA_ACCESS_SECRET___'];
    const savedEnvKey = process.env.MJ_BASE_ENCRYPTION_KEY;
    const rawMasterKey = 'test-master-encryption-key-do-not-use-directly';

    try {
      if (store) {
        delete store['___MEDIA_ACCESS_SECRET___'];
      }
      process.env.MJ_BASE_ENCRYPTION_KEY = rawMasterKey;

      const isolatedKm = new MediaAccessKeyManager();
      const { Token } = isolatedKm.Sign('FILE-KEY-SEP', 'USER-KEY-SEP');

      // Round-trips through the manager using the derived subkey
      const verified = isolatedKm.Verify(Token);
      expect(verified.Valid).toBe(true);

      // Matches the documented HMAC-SHA256 key derivation label
      const expectedDerivedSecret = createHmac('sha256', rawMasterKey)
        .update('mj-media-access-token-signing-v1')
        .digest('base64');
      const decoded = jwt.verify(Token, expectedDerivedSecret, { algorithms: ['HS256'] });
      expect(typeof decoded).toBe('object');

      // A JWT signed directly with the raw MJ_BASE_ENCRYPTION_KEY MUST be rejected
      const forgedWithRawMasterKey = jwt.sign(
        { fileId: 'FILE-KEY-SEP', userId: 'USER-KEY-SEP', typ: MEDIA_ACCESS_TOKEN_TYPE },
        rawMasterKey,
        { algorithm: 'HS256', expiresIn: 3600 },
      );
      expect(isolatedKm.Verify(forgedWithRawMasterKey).Valid).toBe(false);
    } finally {
      if (savedEnvKey === undefined) {
        delete process.env.MJ_BASE_ENCRYPTION_KEY;
      } else {
        process.env.MJ_BASE_ENCRYPTION_KEY = savedEnvKey;
      }
      if (store) {
        if (savedStoreSecret === undefined) {
          delete store['___MEDIA_ACCESS_SECRET___'];
        } else {
          store['___MEDIA_ACCESS_SECRET___'] = savedStoreSecret;
        }
      }
    }
  });
});
