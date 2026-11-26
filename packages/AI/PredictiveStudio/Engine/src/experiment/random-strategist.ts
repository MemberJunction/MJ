/**
 * @module experiment/random-strategist
 *
 * Seeded-random wave strategist (`SeededRandomWaveStrategist`, PR 5 §5.2.5 / B4).
 *
 * Default {@link IWaveStrategist} for {@link ExperimentOrchestrator}: draws experiments deterministically
 * from the remaining candidate pool using a 32-bit seeded PRNG (`mulberry32`), so identical seeds repeat
 * the exact candidate draw order while distinct seeds explore distinct permutations at equal compute.
 */
import { SearchPolicy } from '@memberjunction/predictive-studio-core';
import type { IWaveStrategist, ProposedExperiment, WaveStrategistContext } from './types';

/** Bitmask forcing unsigned 32-bit integer arithmetic. */
const UINT32_MASK = 0xffffffff;

/** Weyl-sequence increment used by Mulberry32 PRNG. */
const MULBERRY_INCREMENT = 0x6d2b79f5;

/** First shift width in Mulberry32 output mixer. */
const MIX_SHIFT_A = 15;

/** Second shift width in Mulberry32 output mixer. */
const MIX_SHIFT_B = 7;

/** Final shift width in Mulberry32 output mixer. */
const MIX_SHIFT_C = 14;

/** Constant multiplier in Mulberry32 mixer. */
const MIX_MULT_A = 61;

/** Divisor normalizing uint32 into [0, 1). */
const UINT32_RANGE = 4294967296;

/** Per-wave salt mixed with the session seed so consecutive waves stay independent while deterministic. */
const WAVE_SALT = 0x9e3779b1;

/** One-based wave offset ensuring wave 0 receives a non-zero salt factor. */
const WAVE_OFFSET = 1;

/**
 * Deterministic seeded-random {@link IWaveStrategist}.
 */
export class SeededRandomWaveStrategist implements IWaveStrategist {
  /** Default deterministic search seed matching standard Predictive Studio W-world baselines. */
  public static readonly DefaultSeed = 42;

  /** Canonical name recognized by {@link SearchPolicy.Decide} under `random` protocols. */
  public readonly Name = SearchPolicy.SeededRandomStrategistName;

  /** Unsigned 32-bit session seed. */
  public readonly Seed: number;

  /** @param seed numeric seed stored on the session */
  public constructor(seed: number) {
    this.Seed = SeededRandomWaveStrategist.NormalizeSeed(seed);
  }

  /** Coerces a finite number into an unsigned 32-bit integer seed. Pure. */
  public static NormalizeSeed(seed: number): number {
    return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  }

  /** Draws up to `maxWaveSize` experiments from `context.remaining` in seeded-random order. */
  public proposeNextWave(context: WaveStrategistContext): ProposedExperiment[] {
    const count = Math.min(Math.max(0, context.maxWaveSize), context.remaining.length);
    if (count === 0) return [];

    const pool = [...context.remaining];
    const waveSeed = (this.Seed ^ Math.imul(context.waveIndex + WAVE_OFFSET, WAVE_SALT)) & UINT32_MASK;
    const rng = SeededRandomWaveStrategist.createMulberry32(waveSeed);

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }

    return pool.slice(0, count);
  }

  private static createMulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + MULBERRY_INCREMENT) | 0;
      let t = Math.imul(state ^ (state >>> MIX_SHIFT_A), 1 | state);
      t = (t + Math.imul(t ^ (t >>> MIX_SHIFT_B), MIX_MULT_A | t)) ^ t;
      return ((t ^ (t >>> MIX_SHIFT_C)) >>> 0) / UINT32_RANGE;
    };
  }
}
