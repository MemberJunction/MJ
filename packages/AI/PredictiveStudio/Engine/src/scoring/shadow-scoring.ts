/**
 * @module scoring/shadow-scoring
 *
 * The live challenger of a bound `'ML Model'` Record Process (#6180's shadow scoring, absorbed by D-069, §5.8.3 step 5).
 *
 * {@link ShadowScoringCoordinator} is `ScoringService`'s {@link IChallengerSource}: it reads the binding's Record Process
 * `ChallengerConfiguration` and, when it names an enabled `'ML Model'` challenger, returns that model with the run's
 * per-record sample. `ScoringService` scores the sampled records of each batch with the challenger, on the champion's
 * assembled features, and writes them as `Source = 'Model'`, `Role = 'Challenger'` rows under the challenger's own
 * `MJ: ML Scoring Runs` row, in the batch's transaction beside the champion's rows. The coordinator writes nothing.
 *
 * Sampling keeps #6180's rule — an enabled configuration with a finite numeric `SampleRate` above 0 and a challenger
 * model; a rate of 1 or more takes every record, a lower rate a draw in [0, 1) below it — with a draw that is a pure
 * function of the binding, the record and the as-of date ({@link ShadowScoringCoordinator.DeterministicDraw}): batches
 * scored at once share no sampling state, and a same-day re-run samples, and so replaces, the same records.
 *
 * A stored configuration's `MaxLatencyMs` is the `'Infer'` (prompt) challenger's time budget; the in-transaction mirror
 * has none and does not read it.
 */
import { createHash } from 'node:crypto';
import type {
  MJMLModelScoringBindingEntity,
  MJRecordProcessEntity,
  MJRecordProcessEntity_IRecordProcessChallengerConfig,
} from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import type { ChallengerSelection, IChallengerSource } from './scoring-seams';

/** A challenger configuration as the Record Process stores it. */
export type ChallengerConfiguration = MJRecordProcessEntity_IRecordProcessChallengerConfig;

/** What one record's sample draw is a function of. */
export interface ShadowSampleKey {
  /** The binding being scored. */
  readonly BindingID: string;
  /** The record (its primary key value). */
  readonly RecordID: string;
  /** The run's as-of instant; only its UTC date is read. */
  readonly AsOf: Date;
}

/** A sample draw in [0, 1) for one record. */
export type ShadowDraw = (key: ShadowSampleKey) => number;

/** Where a binding's challenger configuration comes from. */
export interface IChallengerConfigSource {
  /** The binding's challenger configuration, or null when the binding has none. */
  ChallengerConfiguration(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): Promise<ChallengerConfiguration | null>;
}

/**
 * The production {@link IChallengerConfigSource}: the `ChallengerConfiguration` of the binding's Record Process, read as
 * the caller. A binding without a Record Process has none.
 */
export class RecordProcessChallengerConfigSource implements IChallengerConfigSource {
  /** @inheritdoc */
  public async ChallengerConfiguration(binding: MJMLModelScoringBindingEntity, ctx: RegistryContext): Promise<ChallengerConfiguration | null> {
    if (!binding.RecordProcessID) return null;
    const read = await StoredRowReads.Run<MJRecordProcessEntity>({
      EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${EscapeSQLString(binding.RecordProcessID)}'`, ResultType: 'entity_object', MaxRows: 1, // pk-filter-ok: MJ: Record Processes is an MJ core entity keyed by ID
    }, ctx);
    if (!read.Success) {
      throw new Error(`ShadowScoringCoordinator: reading Record Process '${binding.RecordProcessID}' of binding '${binding.ID}' failed: ${read.ErrorMessage}`);
    }
    return read.Results[0]?.ChallengerConfigurationObject || null;
  }
}

/** Options for {@link ShadowScoringCoordinator}. */
export interface ShadowScoringCoordinatorOptions {
  /** Where the binding's configuration is read; defaults to {@link RecordProcessChallengerConfigSource}. */
  readonly Configs?: IChallengerConfigSource;
  /** The per-record draw; defaults to {@link ShadowScoringCoordinator.DeterministicDraw}. */
  readonly Draw?: ShadowDraw;
}

/** The 32-bit range a draw's hash prefix is scaled from. */
const DRAW_RANGE = 0x1_0000_0000;

/** The challenger source of a binding run: its Record Process's configured challenger and the run's sample. */
export class ShadowScoringCoordinator implements IChallengerSource {
  private readonly configs: IChallengerConfigSource;
  private readonly draw: ShadowDraw;

  constructor(options: ShadowScoringCoordinatorOptions = {}) {
    this.configs = options.Configs || new RecordProcessChallengerConfigSource();
    this.draw = options.Draw || ShadowScoringCoordinator.DeterministicDraw;
  }

  /**
   * Whether a configuration can mirror any record: enabled (`true`), work type `'ML Model'`, a finite numeric
   * `SampleRate` above 0 (a string from unvalidated JSON is refused) and a non-blank `ChallengerModelID`. Pure.
   */
  public static CanSample(config: ChallengerConfiguration | null | undefined): config is ChallengerConfiguration & { ChallengerModelID: string } {
    if (!config || config.Enabled !== true || config.WorkType !== 'ML Model') return false;
    if (typeof config.SampleRate !== 'number' || !Number.isFinite(config.SampleRate) || config.SampleRate <= 0) return false;
    return typeof config.ChallengerModelID === 'string' && config.ChallengerModelID.trim().length > 0;
  }

  /**
   * The production draw: the first 32 bits of the SHA-256 of the lower-cased binding ID, the lower-cased record ID and
   * the as-of UTC date, scaled to [0, 1). Pure.
   */
  public static DeterministicDraw(key: ShadowSampleKey): number {
    const text = `${key.BindingID.trim().toLowerCase()}|${key.RecordID.trim().toLowerCase()}|${key.AsOf.toISOString().slice(0, 10)}`;
    return createHash('sha256').update(text).digest().readUInt32BE(0) / DRAW_RANGE;
  }

  /** Whether `config` mirrors the record `key` names: #6180's rule with this coordinator's draw. */
  public ShouldSample(config: ChallengerConfiguration | null | undefined, key: ShadowSampleKey): boolean {
    if (!ShadowScoringCoordinator.CanSample(config)) return false;
    return config.SampleRate >= 1 || this.draw(key) < config.SampleRate;
  }

  /**
   * The challenger of the binding's run as of `asOf`: the configured `ChallengerModelID` with the per-record sample, or
   * null when the binding's configuration cannot sample.
   */
  public async Challenger(binding: MJMLModelScoringBindingEntity, asOf: Date, ctx: RegistryContext): Promise<ChallengerSelection | null> {
    const config = await this.configs.ChallengerConfiguration(binding, ctx);
    if (!ShadowScoringCoordinator.CanSample(config)) return null;
    return {
      ModelID: config.ChallengerModelID.trim(),
      Sampled: (recordId: string) => this.ShouldSample(config, { BindingID: binding.ID, RecordID: recordId, AsOf: asOf }),
    };
  }
}
