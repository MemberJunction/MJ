/**
 * Unit tests for the realtime overlay's PROGRESSIVE DISCLOSURE engine — the
 * framework-free levels/milestones model behind the pure-audio-first call UX
 * (persisted per-user via UserInfoEngine under `mj.realtimeVoice.uxMilestones.v1`).
 */
import { describe, it, expect } from 'vitest';
import {
  ClampUxLevel,
  DefaultUxMilestones,
  EffectiveBaseLevel,
  ParseUxMilestones,
  RatchetedMilestones,
  RealtimeDisclosureModel,
  SerializeUxMilestones,
  REALTIME_UX_MAX_LEVEL,
  REALTIME_UX_PREF_KEY,
  REALTIME_UX_PRO_CALLS
} from '../lib/components/realtime/realtime-disclosure';

describe('pref key', () => {
  it('uses the versioned mj.* naming convention', () => {
    expect(REALTIME_UX_PREF_KEY).toBe('mj.realtimeVoice.uxMilestones.v1');
  });
});

describe('ClampUxLevel', () => {
  it('passes valid levels through and clamps the band edges', () => {
    expect(ClampUxLevel(0)).toBe(0);
    expect(ClampUxLevel(3)).toBe(3);
    expect(ClampUxLevel(-2)).toBe(0);
    expect(ClampUxLevel(9)).toBe(REALTIME_UX_MAX_LEVEL);
  });

  it('rounds fractional and zeroes non-finite levels', () => {
    expect(ClampUxLevel(2.6)).toBe(3);
    expect(ClampUxLevel(NaN)).toBe(0);
    expect(ClampUxLevel(Infinity)).toBe(0);
  });
});

describe('ParseUxMilestones / SerializeUxMilestones', () => {
  it('round-trips milestones', () => {
    const m = { Level: 3, Calls: 7, Density: 'pro' as const };
    expect(ParseUxMilestones(SerializeUxMilestones(m))).toEqual(m);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['blank', ''],
    ['malformed JSON', '{level:'],
    ['non-object', '"3"'],
    ['JSON null', 'null']
  ])('falls back to defaults (never throws) for %s', (_label, raw) => {
    expect(ParseUxMilestones(raw as string | null | undefined)).toEqual(DefaultUxMilestones());
  });

  it('repairs field-wise: bad level/calls/density fall back individually', () => {
    expect(ParseUxMilestones('{"level":"high","calls":2,"density":"standard"}'))
      .toEqual({ Level: 0, Calls: 2, Density: 'standard' });
    expect(ParseUxMilestones('{"level":3,"calls":-4,"density":"ultra"}'))
      .toEqual({ Level: 3, Calls: 0, Density: 'auto' });
    expect(ParseUxMilestones('{"level":99,"calls":1.7,"density":"simple"}'))
      .toEqual({ Level: REALTIME_UX_MAX_LEVEL, Calls: 2, Density: 'simple' });
  });
});

describe('EffectiveBaseLevel', () => {
  it('day one: a brand-new user starts at PURE AUDIO (level 0)', () => {
    expect(EffectiveBaseLevel(DefaultUxMilestones())).toBe(0);
  });

  it('auto density follows the earned ratchet', () => {
    expect(EffectiveBaseLevel({ Level: 2, Calls: 1, Density: 'auto' })).toBe(2);
  });

  it(`auto density promotes to the full console after ${REALTIME_UX_PRO_CALLS} completed calls`, () => {
    expect(EffectiveBaseLevel({ Level: 1, Calls: REALTIME_UX_PRO_CALLS, Density: 'auto' })).toBe(REALTIME_UX_MAX_LEVEL);
    expect(EffectiveBaseLevel({ Level: 1, Calls: REALTIME_UX_PRO_CALLS - 1, Density: 'auto' })).toBe(1);
  });

  it('manual density overrides win outright (the escape hatch)', () => {
    const earned = { Level: 4, Calls: 10, Density: 'simple' as const };
    expect(EffectiveBaseLevel(earned)).toBe(0);
    expect(EffectiveBaseLevel({ ...earned, Density: 'standard' })).toBe(2);
    expect(EffectiveBaseLevel({ Level: 0, Calls: 0, Density: 'pro' })).toBe(REALTIME_UX_MAX_LEVEL);
  });
});

describe('RatchetedMilestones (call end)', () => {
  it('increments calls and ratchets the level to the session peak', () => {
    expect(RatchetedMilestones({ Level: 1, Calls: 1, Density: 'auto' }, 3))
      .toEqual({ Level: 3, Calls: 2, Density: 'auto' });
  });

  it('a completed first call always earns at least level 1 (text next time)', () => {
    expect(RatchetedMilestones(DefaultUxMilestones(), 0))
      .toEqual({ Level: 1, Calls: 1, Density: 'auto' });
  });

  it('NEVER lowers the earned level (ratchet)', () => {
    expect(RatchetedMilestones({ Level: 4, Calls: 5, Density: 'auto' }, 0).Level).toBe(4);
  });

  it('preserves the density override', () => {
    expect(RatchetedMilestones({ Level: 0, Calls: 0, Density: 'simple' }, 2).Density).toBe('simple');
  });
});

describe('RealtimeDisclosureModel', () => {
  it('Load resets the session level to the effective base', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(SerializeUxMilestones({ Level: 2, Calls: 1, Density: 'auto' }));
    expect(m.SessionLevel).toBe(2);
    expect(m.ShowThread).toBe(true);
    expect(m.ShowComposer).toBe(true);
    expect(m.ShowPanel).toBe(true);
    expect(m.PowerLevel).toBe(false);
  });

  it('day one exposes NOTHING beyond pure audio', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(null);
    expect(m.SessionLevel).toBe(0);
    expect(m.ShowThread).toBe(false);
    expect(m.ShowComposer).toBe(false);
    expect(m.ShowPanel).toBe(false);
    expect(m.ShowGear).toBe(false);
  });

  it('Raise only raises — and reports whether anything changed', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(null);
    expect(m.Raise('engaged')).toBe(true);
    expect(m.SessionLevel).toBe(2);
    expect(m.Raise('text')).toBe(false); // lower event after a higher one: no-op
    expect(m.SessionLevel).toBe(2);
    expect(m.Raise('channel')).toBe(true);
    expect(m.SessionLevel).toBe(3);
  });

  it('emits Changed$ on raises that change the level (and not on no-ops)', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(null);
    let emissions = 0;
    m.Changed$.subscribe(() => emissions++);
    m.Raise('text');
    m.Raise('text');
    expect(emissions).toBe(1);
  });

  it('BeginSession resets the volatile level back to the base', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(null);
    m.Raise('channel');
    m.BeginSession();
    expect(m.SessionLevel).toBe(0);
  });

  it('SetDensity applies immediately — simple retracts even a mid-call console', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(SerializeUxMilestones({ Level: 4, Calls: 9, Density: 'auto' }));
    expect(m.SessionLevel).toBe(4);
    m.SetDensity('simple');
    expect(m.SessionLevel).toBe(0);
    expect(m.Milestones.Density).toBe('simple');
    m.SetDensity('pro');
    expect(m.SessionLevel).toBe(REALTIME_UX_MAX_LEVEL);
  });

  it('RatchetOnSessionEnd replaces milestones and returns the persistable payload', () => {
    const m = new RealtimeDisclosureModel();
    m.Load(null);
    m.Raise('channel');
    const serialized = m.RatchetOnSessionEnd();
    expect(m.Milestones).toEqual({ Level: 3, Calls: 1, Density: 'auto' });
    expect(ParseUxMilestones(serialized)).toEqual(m.Milestones);
  });
});
