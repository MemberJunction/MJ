import { describe, it, expect } from 'vitest';
import { ExpiryCloseReason, ParseSessionDeadlineMs } from '../agentSessions/sessionDeadline.js';

const T = Date.parse('2026-10-29T12:00:00Z');
const MIN = 60_000;
const row = (lastActive: number | null, deadline?: number) => ({
  LastActiveAt: lastActive === null ? null : new Date(lastActive),
  Config_: deadline === undefined ? '{}' : JSON.stringify({ maxSessionDeadlineIso: new Date(deadline).toISOString() }),
});

describe('ExpiryCloseReason', () => {
  it('deadline passed, recently active → TimeLimit', () => expect(ExpiryCloseReason(row(T - MIN, T - MIN), T, 15 * MIN)).toBe('TimeLimit'));
  it('idle past threshold, no deadline → Idle', () => expect(ExpiryCloseReason(row(T - 16 * MIN), T, 15 * MIN)).toBe('Idle'));
  it('both passed, idle moment earlier → Idle', () => expect(ExpiryCloseReason(row(T - 20 * MIN, T - 2 * MIN), T, 15 * MIN)).toBe('Idle'));
  it('both passed, deadline moment earlier → TimeLimit', () => expect(ExpiryCloseReason(row(T - 16 * MIN, T - 5 * MIN), T, 15 * MIN)).toBe('TimeLimit'));
  it('same instant → TimeLimit', () => expect(ExpiryCloseReason(row(T - 15 * MIN, T), T, 15 * MIN)).toBe('TimeLimit'));
  it('nothing passed → null', () => expect(ExpiryCloseReason(row(T - MIN, T + MIN), T, 15 * MIN)).toBeNull());
  it('a row without LastActiveAt is never Idle', () => {
    expect(ExpiryCloseReason(row(null), T, 15 * MIN)).toBeNull();
    expect(ExpiryCloseReason(row(null, T - MIN), T, 15 * MIN)).toBe('TimeLimit');
  });
});

describe('ParseSessionDeadlineMs', () => {
  it('reads an ISO deadline', () => expect(ParseSessionDeadlineMs(JSON.stringify({ maxSessionDeadlineIso: '2026-10-29T12:00:00Z' }))).toBe(T));
  it('treats a malformed deadline as absent', () => {
    expect(ParseSessionDeadlineMs(JSON.stringify({ maxSessionDeadlineIso: 'soon' }))).toBeNull();
    expect(ParseSessionDeadlineMs(JSON.stringify({ maxSessionDeadlineIso: 42 }))).toBeNull();
    expect(ParseSessionDeadlineMs('not json')).toBeNull();
    expect(ParseSessionDeadlineMs(null)).toBeNull();
  });
});
