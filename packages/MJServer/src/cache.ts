import { LRUCache } from 'lru-cache';
import type jwt from 'jsonwebtoken';

const oneHourMs = 60 * 60 * 1000;

export const AuthCache = new LRUCache<string, jwt.JwtPayload | boolean>({
  max: 50000,
  ttl: oneHourMs,
  ttlAutopurge: false,
});

/** @deprecated Use {@link AuthCache}. */
export const authCache = AuthCache;

