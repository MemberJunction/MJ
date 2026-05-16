import { beforeEach, describe, expect, it } from 'vitest';

import {
  ComputeSourceSignature,
  DeltaTokenVerificationError,
  SetDeltaTokenSecret,
  SignDeltaToken,
  TOKEN_TTL_MS,
  VerifyDeltaToken,
  type DeltaTokenPayload,
} from '../deltaToken';

const TEST_SECRET = 'unit-test-delta-secret-do-not-use-in-prod';

function makePayload(overrides: Partial<DeltaTokenPayload> = {}): DeltaTokenPayload {
  return {
    v: 1,
    tid: 'list-abc',
    ssig: 'abc123',
    m: 'Additive',
    iat: Date.now(),
    ...overrides,
  };
}

describe('deltaToken', () => {
  beforeEach(() => {
    SetDeltaTokenSecret(TEST_SECRET);
  });

  describe('ComputeSourceSignature', () => {
    it('returns the same hash regardless of input order', () => {
      const a = ComputeSourceSignature(['c', 'a', 'b']);
      const b = ComputeSourceSignature(['a', 'b', 'c']);
      expect(a).toBe(b);
    });

    it('produces a different hash for different inputs', () => {
      expect(ComputeSourceSignature(['a', 'b'])).not.toBe(ComputeSourceSignature(['a', 'c']));
    });

    it('handles the empty set deterministically', () => {
      const a = ComputeSourceSignature([]);
      const b = ComputeSourceSignature([]);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Sign + Verify roundtrip', () => {
    it('verifies a token signed with the same secret', () => {
      const payload = makePayload();
      const token = SignDeltaToken(payload);
      const verified = VerifyDeltaToken(token);
      expect(verified).toMatchObject(payload);
    });

    it('rejects a token whose signature does not match', () => {
      const token = SignDeltaToken(makePayload());
      const tampered = token.slice(0, -2) + 'AA';
      expect(() => VerifyDeltaToken(tampered)).toThrow(DeltaTokenVerificationError);
    });

    it('rejects a token whose payload has been swapped', () => {
      const tokenA = SignDeltaToken(makePayload({ tid: 'list-A' }));
      const tokenB = SignDeltaToken(makePayload({ tid: 'list-B' }));
      const [payloadA] = tokenA.split('.');
      const [, sigB] = tokenB.split('.');
      const frankenToken = `${payloadA}.${sigB}`;
      expect(() => VerifyDeltaToken(frankenToken)).toThrow(DeltaTokenVerificationError);
    });

    it('rejects a malformed token', () => {
      expect(() => VerifyDeltaToken('not-a-token')).toThrow(DeltaTokenVerificationError);
      expect(() => VerifyDeltaToken('only-one-part.')).toThrow(DeltaTokenVerificationError);
    });

    it('rejects an expired token', () => {
      const payload = makePayload({ iat: Date.now() - TOKEN_TTL_MS - 1000 });
      const token = SignDeltaToken(payload);
      expect(() => VerifyDeltaToken(token)).toThrow(DeltaTokenVerificationError);
      try {
        VerifyDeltaToken(token);
      } catch (e) {
        expect((e as DeltaTokenVerificationError).Code).toBe('EXPIRED_TOKEN');
      }
    });

    it('accepts a token right at the TTL boundary', () => {
      const issuedAt = Date.now();
      const token = SignDeltaToken(makePayload({ iat: issuedAt }));
      // Just under the TTL window from issuance.
      expect(() => VerifyDeltaToken(token, issuedAt + TOKEN_TTL_MS - 1)).not.toThrow();
    });

    it('rejects a token signed with a different secret', () => {
      const tokenA = SignDeltaToken(makePayload());
      SetDeltaTokenSecret('different-secret');
      expect(() => VerifyDeltaToken(tokenA)).toThrow(DeltaTokenVerificationError);
    });
  });

  describe('secret resolution', () => {
    it('throws when no secret is configured', () => {
      SetDeltaTokenSecret(undefined);
      const original = process.env.MJ_LIST_DELTA_SECRET;
      delete process.env.MJ_LIST_DELTA_SECRET;
      try {
        expect(() => SignDeltaToken(makePayload())).toThrow(/MJ_LIST_DELTA_SECRET/);
      } finally {
        if (original !== undefined) process.env.MJ_LIST_DELTA_SECRET = original;
      }
    });

    it('falls back to env var when no injected secret', () => {
      SetDeltaTokenSecret(undefined);
      process.env.MJ_LIST_DELTA_SECRET = 'env-secret';
      try {
        const token = SignDeltaToken(makePayload());
        expect(() => VerifyDeltaToken(token)).not.toThrow();
      } finally {
        delete process.env.MJ_LIST_DELTA_SECRET;
      }
    });
  });
});
