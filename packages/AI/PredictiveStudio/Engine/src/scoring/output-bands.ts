/**
 * @module scoring/output-bands
 *
 * Bands at **scoring** time — turning the model's float into the word people actually act on, and
 * noticing when a record crosses from one word to another.
 *
 * `components/score-bands.ts` holds the arithmetic (ported from Sonar). This module is the part
 * that makes it reachable from a live scoring run: where a model's bands are stored, how they are
 * validated, and how a crossing is detected against the record's previous state.
 *
 * **Bands live on a component, not a column.** A model's bands are an `MJ: ML Components` row of
 * type `Score Band` whose `Spec` is validated against that type's `SpecSchema` on save. That is the
 * point of the typed-component model: an output contract is a component, so it can be inherited,
 * reused across models, narrated, and browsed — none of which a JSON column on the scoring binding
 * would allow.
 */

import { RunView, LogError } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

import { assignBand, detectBandTransition, type BandTransition, type ScoreBandDef } from '../components/score-bands';
import type { SourceRow } from '../feature-assembly';

/** A model's band configuration, as stored on its `Score Band` component's `Spec`. */
export interface ScoreBandSpec {
  /** Half-open `[Min, Max)` tiers that tile the score scale; the top band is inclusive. */
  Bands: ScoreBandDef[];
  /** Minimum score movement before a crossing is reported. Defaults to 0.5. */
  DeadbandDelta?: number;
  /**
   * Column on the scored record holding the PREVIOUS score, when write-back persists one. Without
   * it a transition cannot be detected — a first-ever score and a crossing look identical.
   */
  PriorScoreColumn?: string;
  /** Column holding the previously-assigned band label. */
  PriorBandColumn?: string;
}

/** The band facts for one prediction. */
export interface BandOutcome {
  /** The band this score falls in, or `undefined` when it falls outside every band. */
  Band?: ScoreBandDef;
  /** The crossing, when the record had a prior band and this score is in a different one. */
  Transition?: BandTransition;
}

/** Why a stored band spec was rejected. Each message is written to be shown verbatim. */
export type BandSpecProblem = string;

/**
 * Parse and validate a stored band spec.
 *
 * Returns `null` for "no bands configured" (the common case — most models have none), a spec when
 * it is usable, or a problem when it is present but wrong. A malformed spec is **refused, not
 * ignored**: banding a score against a set with a gap in it would silently label some records and
 * not others, and the un-banded ones would look like a model that simply had nothing to say.
 */
export function parseScoreBandSpec(raw: string | null | undefined): ScoreBandSpec | BandSpecProblem | null {
  if (!raw || raw.trim() === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return `Score band spec is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
  }
  const bands = (parsed as { Bands?: unknown })?.Bands;
  if (!Array.isArray(bands) || bands.length === 0) {
    return 'Score band spec has no Bands.';
  }
  for (const b of bands) {
    const band = b as Partial<ScoreBandDef>;
    if (typeof band.Label !== 'string' || band.Label.trim() === '') {
      return 'Every score band needs a Label.';
    }
    if (typeof band.MinScore !== 'number' || typeof band.MaxScore !== 'number') {
      return `Score band '${String(band.Label)}' needs numeric MinScore and MaxScore.`;
    }
    if (band.MaxScore <= band.MinScore) {
      return `Score band '${band.Label}' ends at or before it starts (${band.MinScore}–${band.MaxScore}).`;
    }
  }
  const tiling = describeTilingProblem(bands as ScoreBandDef[]);
  if (tiling) {
    return tiling;
  }
  const spec = parsed as ScoreBandSpec;
  return {
    Bands: bands as ScoreBandDef[],
    DeadbandDelta: typeof spec.DeadbandDelta === 'number' ? spec.DeadbandDelta : undefined,
    PriorScoreColumn: typeof spec.PriorScoreColumn === 'string' ? spec.PriorScoreColumn : undefined,
    PriorBandColumn: typeof spec.PriorBandColumn === 'string' ? spec.PriorBandColumn : undefined,
  };
}

/**
 * The gap or overlap in a band set, or `null` when it tiles cleanly.
 *
 * `assignBand` is order-independent *given* a contiguous tiling; without one it silently returns
 * nothing for a score in a gap, so the check belongs here, once, at load.
 */
function describeTilingProblem(bands: ScoreBandDef[]): BandSpecProblem | null {
  const sorted = [...bands].sort((a, b) => a.MinScore - b.MinScore);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.MinScore > prev.MaxScore) {
      return `Score bands leave a gap between '${prev.Label}' (ends ${prev.MaxScore}) and '${next.Label}' (starts ${next.MinScore}); a score in the gap would be left unbanded.`;
    }
    if (next.MinScore < prev.MaxScore) {
      return `Score bands '${prev.Label}' and '${next.Label}' overlap between ${next.MinScore} and ${prev.MaxScore}; which one a score lands in would depend on their order.`;
    }
  }
  return null;
}

/**
 * Band a score, and detect a crossing against the record's previous state.
 *
 * A transition needs a prior band to have crossed FROM. When the spec names no prior columns — or
 * the record has no prior value in them — the outcome carries a band and no transition, which is
 * the honest reading of a first-ever score.
 */
export function bandOutcome(spec: ScoreBandSpec, score: number, priorRow?: SourceRow): BandOutcome {
  const band = assignBand(spec.Bands, score);
  const priorBand = readPriorBand(spec, priorRow);
  if (priorBand === null) {
    return { Band: band };
  }
  const priorScore = readPriorScore(spec, priorRow);
  const delta = priorScore === null ? null : score - priorScore;
  if (delta !== null && Math.abs(delta) <= (spec.DeadbandDelta ?? 0.5)) {
    // Movement inside the deadband is float noise, not a change worth reacting to.
    return { Band: band };
  }
  const transition = detectBandTransition(priorBand, band?.Label ?? null, true, delta);
  return transition ? { Band: band, Transition: transition } : { Band: band };
}

/** The record's previously-assigned band label, or `null` when there is none to compare against. */
function readPriorBand(spec: ScoreBandSpec, priorRow?: SourceRow): string | null {
  if (!spec.PriorBandColumn || !priorRow) {
    return null;
  }
  const value = priorRow[spec.PriorBandColumn];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** The record's previous score, or `null` when it is absent or unreadable. */
function readPriorScore(spec: ScoreBandSpec, priorRow?: SourceRow): number | null {
  if (!spec.PriorScoreColumn || !priorRow) {
    return null;
  }
  const value = priorRow[spec.PriorScoreColumn];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const asNumber = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(asNumber) ? asNumber : null;
}

/** Seam that resolves a model's band spec. Injected so scoring unit-tests need no provider. */
export interface IScoreBandLoader {
  /** The model's bands, or `null` when it has none. Never throws — bands are an enhancement. */
  load(modelId: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<ScoreBandSpec | null>;
}

/**
 * Reads a model's bands off its `Score Band` component instance.
 *
 * A model has at most one; more than one is a configuration mistake, so the first by `Sequence` is
 * used and the rest are reported rather than silently averaged away.
 */
export class RunViewScoreBandLoader implements IScoreBandLoader {
  /** @inheritdoc */
  public async load(modelId: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<ScoreBandSpec | null> {
    try {
      const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
      const result = await rv.RunView<{ ID: string; Spec: string | null; Sequence: number }>(
        {
          EntityName: 'MJ: ML Components',
          ExtraFilter: `MLModelID='${modelId}' AND ComponentType='Score Band'`,
          Fields: ['ID', 'Spec', 'Sequence'],
          OrderBy: 'Sequence ASC',
          ResultType: 'simple',
        },
        contextUser,
      );
      if (!result.Success) {
        LogError(`RunViewScoreBandLoader: could not read bands for model '${modelId}': ${result.ErrorMessage}`);
        return null;
      }
      if (result.Results.length === 0) {
        return null;
      }
      if (result.Results.length > 1) {
        LogError(
          `RunViewScoreBandLoader: model '${modelId}' has ${result.Results.length} Score Band components; using the first by Sequence.`,
        );
      }
      const parsed = parseScoreBandSpec(result.Results[0].Spec);
      if (typeof parsed === 'string') {
        LogError(`RunViewScoreBandLoader: model '${modelId}' has unusable bands — ${parsed}`);
        return null;
      }
      return parsed;
    } catch (err) {
      LogError(`RunViewScoreBandLoader: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
