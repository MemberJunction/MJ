import { describe, it, expect } from 'vitest';
import { ExpiryCloseReason, ParseSessionDeadlineMs, VerifyTimeLimitClaim } from '../agentSessions/sessionDeadline.js';

const T = Date.parse('2026-10-29T12:00:00Z');
const MIN = 60_000;
const row = (lastActive: number | null, deadline?: number): { LastActiveAt: Date | string | null; Config_: string } => ({
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
  it('nowMs exactly at the deadline → TimeLimit', () => expect(ExpiryCloseReason(row(T - MIN, T), T, 15 * MIN)).toBe('TimeLimit'));
  it('a string LastActiveAt past the threshold → Idle', () => {
    const r = { ...row(null), LastActiveAt: new Date(T - 16 * MIN).toISOString() };
    expect(ExpiryCloseReason(r, T, 15 * MIN)).toBe('Idle');
  });
  it('an invalid LastActiveAt string is never Idle, TimeLimit still works', () => {
    expect(ExpiryCloseReason({ ...row(null), LastActiveAt: 'garbage' }, T, 15 * MIN)).toBeNull();
    expect(ExpiryCloseReason({ ...row(null, T - MIN), LastActiveAt: 'garbage' }, T, 15 * MIN)).toBe('TimeLimit');
  });
  it('a non-finite closeThresholdMs is never Idle', () => expect(ExpiryCloseReason(row(T - 99 * MIN), T, Number.NaN)).toBeNull());
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

describe('VerifyTimeLimitClaim', () => {
  it('deadline passed → TimeLimit', () => expect(VerifyTimeLimitClaim(row(T - MIN, T - MIN), T)).toBe('TimeLimit'));
  it('50 s ahead (inside the skew) → TimeLimit', () => expect(VerifyTimeLimitClaim(row(T - MIN, T + 50_000), T)).toBe('TimeLimit'));
  it('10 min ahead → Explicit', () => expect(VerifyTimeLimitClaim(row(T - MIN, T + 10 * MIN), T)).toBe('Explicit'));
  it('no stored deadline → Explicit', () => expect(VerifyTimeLimitClaim(row(T - MIN), T)).toBe('Explicit'));
  it('Config_ null → Explicit', () => expect(VerifyTimeLimitClaim({ LastActiveAt: new Date(T), Config_: null }, T)).toBe('Explicit'));
  it('a long-idle session is never promoted to TimeLimit by idleness', () => expect(VerifyTimeLimitClaim(row(T - 999 * MIN), T)).toBe('Explicit'));
});
