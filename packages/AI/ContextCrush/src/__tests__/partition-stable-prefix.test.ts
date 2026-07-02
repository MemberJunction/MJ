import { describe, it, expect } from 'vitest';
import { PartitionStablePrefix } from '../partition-stable-prefix';

interface Msg {
  id: number;
  volatile?: boolean;
}

const isStable = (m: Msg): boolean => !m.volatile;

describe('PartitionStablePrefix', () => {
  it('splits a leading stable run from the volatile tail', () => {
    const messages: Msg[] = [{ id: 0 }, { id: 1 }, { id: 2, volatile: true }, { id: 3, volatile: true }];
    const { Stable, Volatile, Boundary } = PartitionStablePrefix(messages, isStable);
    expect(Boundary).toBe(2);
    expect(Stable.map((m) => m.id)).toEqual([0, 1]);
    expect(Volatile.map((m) => m.id)).toEqual([2, 3]);
  });

  it('treats everything after the first non-stable message as volatile, even later stable ones', () => {
    const messages: Msg[] = [{ id: 0 }, { id: 1, volatile: true }, { id: 2 }];
    const { Stable, Volatile, Boundary } = PartitionStablePrefix(messages, isStable);
    expect(Boundary).toBe(1);
    expect(Stable.map((m) => m.id)).toEqual([0]);
    expect(Volatile.map((m) => m.id)).toEqual([1, 2]);
  });

  it('returns an all-stable partition when nothing is volatile', () => {
    const messages: Msg[] = [{ id: 0 }, { id: 1 }];
    const { Stable, Volatile, Boundary } = PartitionStablePrefix(messages, isStable);
    expect(Boundary).toBe(2);
    expect(Stable).toHaveLength(2);
    expect(Volatile).toHaveLength(0);
  });

  it('returns an all-volatile partition when the first message is volatile', () => {
    const messages: Msg[] = [{ id: 0, volatile: true }, { id: 1 }];
    const { Stable, Volatile, Boundary } = PartitionStablePrefix(messages, isStable);
    expect(Boundary).toBe(0);
    expect(Stable).toHaveLength(0);
    expect(Volatile).toHaveLength(2);
  });

  it('handles an empty list', () => {
    const { Stable, Volatile, Boundary } = PartitionStablePrefix([] as Msg[], isStable);
    expect(Boundary).toBe(0);
    expect(Stable).toHaveLength(0);
    expect(Volatile).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const messages: Msg[] = [{ id: 0 }, { id: 1, volatile: true }];
    const snapshot = [...messages];
    PartitionStablePrefix(messages, isStable);
    expect(messages).toEqual(snapshot);
  });

  it('passes the index to the predicate', () => {
    const messages: Msg[] = [{ id: 0 }, { id: 1 }, { id: 2 }];
    // Stable only for index < 2.
    const { Boundary } = PartitionStablePrefix(messages, (_m, i) => i < 2);
    expect(Boundary).toBe(2);
  });
});
