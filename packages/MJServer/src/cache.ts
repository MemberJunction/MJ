import { LRUCache } from 'lru-cache';

const oneHourMs = 60 * 60 * 1000;

export const AuthCache = new LRUCache({
  max: 50000,
  ttl: oneHourMs,
  ttlAutopurge: false,
});

/** @deprecated Use {@link AuthCache}. */
export const authCache = AuthCache;

