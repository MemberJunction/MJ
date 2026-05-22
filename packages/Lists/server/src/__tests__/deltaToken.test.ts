import { beforeEach, describe, expect, it } from 'vitest';

import {
  ComputeSourceSignature,
  DeltaTokenVerificationError,
  SetDeltaTokenSecret,
  SignDeltaToken,
  VerifyDeltaToken,
} from '../deltaToken';
import { TOKEN_TTL_MS, type DeltaTokenPayload } from '@memberjunction/lists-base';

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
    it('returns the same hash regardless of input order', async () => {
      const a = await ComputeSourceSignature(['c', 'a', 'b']);
      const b = await ComputeSourceSignature(['a', 'b', 'c']);
      expect(a).toBe(b);
    });

    it('produces a different hash for different inputs', async () => {
      expect(await ComputeSourceSignature(['a', 'b'])).not.toBe(await ComputeSourceSignature(['a', 'c']));
    });

    it('handles the empty set deterministically', async () => {
      const a = await ComputeSourceSignature([]);
      const b = await ComputeSourceSignature([]);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Sign + Verify roundtrip', () => {
    it('verifies a token signed with the same secret', async () => {
      const payload = makePayload();
      const token = await SignDeltaToken(payload);
      const verified = await VerifyDeltaToken(token);
      expect(verified).toMatchObject(payload);
    });

    it('rejects a token whose signature does not match', async () => {
      const token = await SignDeltaToken(makePayload());
      const tampered = token.slice(0, -2) + 'AA';
      await expect(VerifyDeltaToken(tampered)).rejects.toBeInstanceOf(DeltaTokenVerificationError);
    });

    it('rejects a token whose payload has been swapped', async () => {
      const tokenA = await SignDeltaToken(makePayload({ tid: 'list-A' }));
      const tokenB = await SignDeltaToken(makePayload({ tid: 'list-B' }));
      const [payloadA] = tokenA.split('.');
      const [, sigB] = tokenB.split('.');
      const frankenToken = `${payloadA}.${sigB}`;
      await expect(VerifyDeltaToken(frankenToken)).rejects.toBeInstanceOf(DeltaTokenVerificationError);
    });

    it('rejects a malformed token', async () => {
      await expect(VerifyDeltaToken('not-a-token')).rejects.toBeInstanceOf(DeltaTokenVerificationError);
      await expect(VerifyDeltaToken('only-one-part.')).rejects.toBeInstanceOf(DeltaTokenVerificationError);
    });

    it('rejects an expired token', async () => {
      const payload = makePayload({ iat: Date.now() - TOKEN_TTL_MS - 1000 });
      const token = await SignDeltaToken(payload);
      try {
        await VerifyDeltaToken(token);
        throw new Error('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(DeltaTokenVerificationError);
        expect((e as DeltaTokenVerificationError).Code).toBe('EXPIRED_TOKEN');
      }
    });

    it('accepts a token right at the TTL boundary', async () => {
      const issuedAt = Date.now();
      const token = await SignDeltaToken(makePayload({ iat: issuedAt }));
      // Just under the TTL window from issuance.
      await expect(VerifyDeltaToken(token, issuedAt + TOKEN_TTL_MS - 1)).resolves.toBeDefined();
    });

    it('rejects a token signed with a different secret', async () => {
      const tokenA = await SignDeltaToken(makePayload());
      SetDeltaTokenSecret('different-secret');
      await expect(VerifyDeltaToken(tokenA)).rejects.toBeInstanceOf(DeltaTokenVerificationError);
    });
  });

  describe('secret resolution', () => {
    it('throws when no secret is configured', async () => {
      SetDeltaTokenSecret(undefined);
      const original = process.env.MJ_LIST_DELTA_SECRET;
      delete process.env.MJ_LIST_DELTA_SECRET;
      try {
        await expect(SignDeltaToken(makePayload())).rejects.toThrow(/MJ_LIST_DELTA_SECRET/);
      } finally {
        if (original !== undefined) process.env.MJ_LIST_DELTA_SECRET = original;
      }
    });

    it('falls back to env var when no injected secret', async () => {
      SetDeltaTokenSecret(undefined);
      process.env.MJ_LIST_DELTA_SECRET = 'env-secret';
      try {
        const token = await SignDeltaToken(makePayload());
        await expect(VerifyDeltaToken(token)).resolves.toBeDefined();
      } finally {
        delete process.env.MJ_LIST_DELTA_SECRET;
      }
    });
  });
});
