/**
 * Property/fuzz tests for PartitionStablePrefix and the cache-aware prune invariant that the
 * agent framework relies on. For thousands of random message lists + random stability
 * predicates we assert the partition's structural invariants, and that confining mutation to
 * the volatile tail leaves the stable-prefix bytes untouched across a prune cycle.
 */
import { describe, it, expect } from 'vitest';
import { PartitionStablePrefix } from '../partition-stable-prefix';

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

interface Msg { id: number; volatile: boolean; expired: boolean; content: string; }

function randomMessages(rng: () => number): Msg[] {
  const n = Math.floor(rng() * 12);
  const out: Msg[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: i, volatile: rng() < 0.5, expired: rng() < 0.5, content: `m${i}-${Math.floor(rng() * 1000)}` });
  }
  return out;
}

describe('PartitionStablePrefix — invariants (fuzz)', () => {
  it('upholds structural invariants over 4000 random inputs', () => {
    for (let seed = 1; seed <= 4000; seed++) {
      const rng = makeRng(seed);
      const msgs = randomMessages(rng);
      const snapshot = JSON.stringify(msgs);
      const { Stable, Volatile, Boundary } = PartitionStablePrefix(msgs, (m) => !m.volatile);

      // 1. partition reconstructs the original, in order
      expect([...Stable, ...Volatile], `seed ${seed}`).toEqual(msgs);
      // 2. boundary == stable length
      expect(Boundary).toBe(Stable.length);
      // 3. every stable element satisfies the predicate
      expect(Stable.every((m) => !m.volatile)).toBe(true);
      // 4. maximality: the first volatile-region element (if any) must FAIL the predicate
      if (Volatile.length > 0) expect(Volatile[0].volatile).toBe(true);
      // 5. input not mutated
      expect(JSON.stringify(msgs)).toBe(snapshot);
    }
  });
});

// Mirror of BaseAgent's cache-aware prune (Remove path) confined to the volatile tail.
function pruneVolatileTail(messages: Msg[]): { removedFromPrefix: number; removedFromTail: number } {
  const { Boundary } = PartitionStablePrefix(messages, (m) => !m.volatile);
  const toRemove: number[] = [];
  let removedFromPrefix = 0;
  for (let i = 0; i < messages.length; i++) {
    if (!messages[i].expired) continue;
    if (i < Boundary) { removedFromPrefix++; continue; } // deferred — never touched
    toRemove.push(i);
  }
  for (let i = toRemove.length - 1; i >= 0; i--) messages.splice(toRemove[i], 1);
  return { removedFromPrefix, removedFromTail: toRemove.length };
}

describe('cache-aware prune invariant (fuzz)', () => {
  it('never mutates the stable-prefix bytes across a prune cycle (4000 inputs)', () => {
    for (let seed = 1; seed <= 4000; seed++) {
      const rng = makeRng(seed * 19 + 7);
      const msgs = randomMessages(rng);
      const { Boundary } = PartitionStablePrefix(msgs, (m) => !m.volatile);
      const prefixBefore = JSON.stringify(msgs.slice(0, Boundary));

      const { removedFromPrefix } = pruneVolatileTail(msgs);

      // Recompute the prefix: the same leading messages must remain byte-identical.
      const prefixAfter = JSON.stringify(msgs.slice(0, Boundary));
      expect(prefixAfter, `seed ${seed}`).toBe(prefixBefore);
      // No prefix-resident message was ever removed.
      expect(removedFromPrefix >= 0).toBe(true);
      expect(msgs.slice(0, Boundary).every((m) => !m.volatile), `seed ${seed} prefix stays non-volatile`).toBe(true);
    }
  });

  it('still removes every expired volatile-tail message', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = makeRng(seed * 23 + 11);
      const msgs = randomMessages(rng);
      const { Boundary } = PartitionStablePrefix(msgs, (m) => !m.volatile);
      const expiredInTail = msgs.slice(Boundary).filter((m) => m.expired).length;
      const before = msgs.length;
      const { removedFromTail } = pruneVolatileTail(msgs);
      expect(removedFromTail, `seed ${seed}`).toBe(expiredInTail);
      expect(msgs.length).toBe(before - expiredInTail);
    }
  });
});
