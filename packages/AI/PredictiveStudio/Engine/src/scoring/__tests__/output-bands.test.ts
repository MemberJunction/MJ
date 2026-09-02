/**
 * Bands at scoring time — the word behind the number, and the crossing worth reacting to.
 *
 * The validation tests carry the weight: a band set with a gap or an overlap silently mis-labels
 * records (`assignBand` returns nothing for a score in a gap), and an un-banded record looks
 * identical to a model that simply had nothing to say about it.
 */

import { describe, it, expect } from 'vitest';

import { bandOutcome, parseScoreBandSpec, type ScoreBandSpec } from '../output-bands';

const BANDS: ScoreBandSpec = {
  Bands: [
    { Label: 'At Risk', MinScore: 0, MaxScore: 40, Severity: 'High', ColorHex: '#CC3311' },
    { Label: 'Watch', MinScore: 40, MaxScore: 70 },
    { Label: 'Healthy', MinScore: 70, MaxScore: 100 },
  ],
  DeadbandDelta: 0.5,
  PriorScoreColumn: 'PriorScore',
  PriorBandColumn: 'PriorBand',
};

describe('parseScoreBandSpec', () => {
  it('returns null for a model with no bands, which is the normal case', () => {
    expect(parseScoreBandSpec(null)).toBeNull();
    expect(parseScoreBandSpec('')).toBeNull();
    expect(parseScoreBandSpec('   ')).toBeNull();
  });

  it('parses a well-formed spec, keeping only the fields it understands', () => {
    const parsed = parseScoreBandSpec(JSON.stringify({ ...BANDS, Nonsense: true }));
    expect(typeof parsed).not.toBe('string');
    const spec = parsed as ScoreBandSpec;
    expect(spec.Bands.map((b) => b.Label)).toEqual(['At Risk', 'Watch', 'Healthy']);
    expect(spec.DeadbandDelta).toBe(0.5);
    expect(spec.PriorBandColumn).toBe('PriorBand');
    expect(spec).not.toHaveProperty('Nonsense');
  });

  it('refuses a set with a gap, naming both sides of it', () => {
    const spec = { Bands: [
      { Label: 'Low', MinScore: 0, MaxScore: 40 },
      { Label: 'High', MinScore: 60, MaxScore: 100 },
    ] };
    const problem = parseScoreBandSpec(JSON.stringify(spec));
    expect(problem).toContain("gap between 'Low' (ends 40) and 'High' (starts 60)");
  });

  it('refuses an overlapping set, because assignment would depend on band order', () => {
    const spec = { Bands: [
      { Label: 'Low', MinScore: 0, MaxScore: 60 },
      { Label: 'High', MinScore: 40, MaxScore: 100 },
    ] };
    expect(parseScoreBandSpec(JSON.stringify(spec))).toContain('overlap between 40 and 60');
  });

  it.each([
    ['not json at all', 'not valid JSON'],
    [JSON.stringify({ Bands: [] }), 'no Bands'],
    [JSON.stringify({ Bands: [{ MinScore: 0, MaxScore: 1 }] }), 'needs a Label'],
    [JSON.stringify({ Bands: [{ Label: 'X', MinScore: 0 }] }), 'numeric MinScore and MaxScore'],
    [JSON.stringify({ Bands: [{ Label: 'X', MinScore: 10, MaxScore: 10 }] }), 'ends at or before it starts'],
  ])('refuses a malformed spec (%#)', (raw, message) => {
    expect(parseScoreBandSpec(raw)).toContain(message);
  });
});

describe('bandOutcome', () => {
  it('bands a score, carrying the presentation the operator configured', () => {
    const out = bandOutcome(BANDS, 12);
    expect(out.Band?.Label).toBe('At Risk');
    expect(out.Band?.Severity).toBe('High');
    expect(out.Transition).toBeUndefined();
  });

  it('includes the very top of the scale', () => {
    expect(bandOutcome(BANDS, 100).Band?.Label).toBe('Healthy');
  });

  it('reports no band for a score off the configured scale', () => {
    // Better than clamping it into the nearest band, which would read as a real assessment.
    expect(bandOutcome(BANDS, 140).Band).toBeUndefined();
  });

  it('reports no transition on a first-ever score', () => {
    // Nothing to have crossed FROM. Inventing one would fire every alert on the first run.
    const out = bandOutcome(BANDS, 80, { PriorScore: null, PriorBand: null });
    expect(out.Band?.Label).toBe('Healthy');
    expect(out.Transition).toBeUndefined();
  });

  it('detects a crossing and its direction', () => {
    const out = bandOutcome(BANDS, 75, { PriorScore: 55, PriorBand: 'Watch' });
    expect(out.Transition).toEqual({ FromBand: 'Watch', ToBand: 'Healthy', Direction: 'Improving' });
  });

  it('calls a downward crossing Worsening', () => {
    const out = bandOutcome(BANDS, 30, { PriorScore: 55, PriorBand: 'Watch' });
    expect(out.Transition).toEqual({ FromBand: 'Watch', ToBand: 'At Risk', Direction: 'Worsening' });
  });

  it('reports no transition when the band did not change', () => {
    expect(bandOutcome(BANDS, 65, { PriorScore: 45, PriorBand: 'Watch' }).Transition).toBeUndefined();
  });

  it('ignores a crossing that is inside the deadband', () => {
    // 39.8 → 40.1 crosses At Risk/Watch, but by 0.3 on a 0–100 scale: float noise, not a move.
    const out = bandOutcome(BANDS, 40.1, { PriorScore: 39.8, PriorBand: 'At Risk' });
    expect(out.Band?.Label).toBe('Watch');
    expect(out.Transition).toBeUndefined();
  });

  it('still reports a crossing when the prior SCORE is unreadable but the prior BAND is known', () => {
    // Direction defaults to Improving rather than throwing — a band change with no measurable
    // prior score is still a band change worth surfacing.
    const out = bandOutcome(BANDS, 80, { PriorBand: 'Watch' });
    expect(out.Transition).toEqual({ FromBand: 'Watch', ToBand: 'Healthy', Direction: 'Improving' });
  });

  it('reads a prior score stored as a string', () => {
    const out = bandOutcome(BANDS, 30, { PriorScore: '55', PriorBand: 'Watch' });
    expect(out.Transition?.Direction).toBe('Worsening');
  });

  it('reports no transition when the spec names no prior columns', () => {
    const noPrior: ScoreBandSpec = { Bands: BANDS.Bands };
    expect(bandOutcome(noPrior, 80, { PriorBand: 'Watch' }).Transition).toBeUndefined();
  });
});
