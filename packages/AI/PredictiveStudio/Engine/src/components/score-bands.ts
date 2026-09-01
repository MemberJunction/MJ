/**
 * @module components/score-bands
 *
 * Score bands + transition detection — the `Output → Score Band` component's executable logic,
 * ported near-verbatim from Sonar (donation item 6: `ScoringEngine.assignBand`,
 * `scoreTrend.detectBandTransition`/`trendDirection`). Bands turn a float into a word people act
 * on; crossing one is an event worth reacting to.
 */

/** One qualitative tier over the score scale. */
export interface ScoreBandDef {
  Label: string;
  MinScore: number;
  MaxScore: number;
  Severity?: string;
  ColorHex?: string;
}

/** A detected band crossing, with the direction of the underlying score move. */
export interface BandTransition {
  FromBand: string | null;
  ToBand: string | null;
  Direction: 'Improving' | 'Worsening';
}

/**
 * Assign a score to its band. Bands are half-open `[Min, Max)` and must tile the scale
 * contiguously; on a correctly-tiled set assignment is deterministic regardless of band order.
 * The sole exception is the TOP band, which includes its own MaxScore so the maximum possible
 * score still bands. Returns `undefined` for an empty set or an off-scale score.
 */
export function assignBand(bands: ScoreBandDef[], score: number): ScoreBandDef | undefined {
  if (bands.length === 0) return undefined;
  const topMax = Math.max(...bands.map((b) => b.MaxScore));
  return bands.find(
    (b) => score >= b.MinScore && (score < b.MaxScore || (score === b.MaxScore && b.MaxScore === topMax)),
  );
}

/**
 * Up / Flat / Down from a score delta. A ±`deadband` (default 0.5 on a 0–100 scale) keeps
 * float noise from reading as movement.
 */
export function trendDirection(delta: number | null, deadband: number = 0.5): 'Up' | 'Down' | 'Flat' {
  if (delta == null) return 'Flat';
  if (delta > deadband) return 'Up';
  if (delta < -deadband) return 'Down';
  return 'Flat';
}

/**
 * Whether a rescore crossed a band, and which way. A transition is recorded only when the record
 * was already scored (`hadPrior`) AND its band actually changed — a brand-new record or a
 * same-band rescore produces none. Direction comes from the score move, defaulting a null delta
 * to "held" (Improving), so a band change with no measurable prior score still records a
 * direction rather than throwing.
 */
export function detectBandTransition(
  priorBand: string | null,
  newBand: string | null,
  hadPrior: boolean,
  delta: number | null,
): BandTransition | null {
  if (!hadPrior || priorBand === newBand) return null;
  return {
    FromBand: priorBand,
    ToBand: newBand,
    Direction: (delta ?? 0) >= 0 ? 'Improving' : 'Worsening',
  };
}
