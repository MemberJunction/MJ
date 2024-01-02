import { LRUCache } from 'lru-cache';

const oneHourMs = 60 * 60 * 1000;

export const authCache = new LRUCache({
  max: 50000,
  ttl: oneHourMs,
  ttlAutopurge: false,
});

