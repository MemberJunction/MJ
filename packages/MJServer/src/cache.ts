import { createHash } from 'node:crypto';
import { LRUCache } from 'lru-cache';
import type jwt from 'jsonwebtoken';

const oneHourMs = 60 * 60 * 1000;

/**
 * Computes a fixed-size SHA-256 hex digest for a raw bearer/JWT token so {@link AuthCache}
 * stores 64-byte hash keys instead of multi-kilobyte raw token strings.
 */
export function HashAuthToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const AuthCache = new LRUCache<string, jwt.JwtPayload | boolean>({
  max: 50000,
  ttl: oneHourMs,
  ttlAutopurge: false,
});

/** @deprecated Use {@link AuthCache}. */
export const authCache = AuthCache;

