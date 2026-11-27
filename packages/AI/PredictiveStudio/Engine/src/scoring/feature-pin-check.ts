/**
 * @module scoring/feature-pin-check
 *
 * `FeaturePinCheck` — pin enforcement at scoring and training (PR 5 §5.2.3, G7.6, F-FP-11, D5-31).
 *
 * A model reads each Feature Value feature at the pin its training resolved (stored in its lineage): a Feature Pipeline
 * version, or a scoring binding's predictions by one model. Scoring refuses, before any record is read, a model whose
 * pinned version is not the pipeline's Active version, or whose prediction pin names a model other than the binding's
 * pipeline's current Published model (`feature-version-mismatch`): the values it would read were computed by something
 * the model was not trained on, so it is retrained first. Training refuses a pin whose version row is gated and has no
 * passing golden-set result (`MJFeaturePipelineVersionEntityExtended.IsActivated`); an ungated version is activated.
 * Every read runs on the caller's provider as the caller, past the RunView cache.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeaturePipelineVersionEntity, MJMLModelEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { MJFeaturePipelineVersionEntityExtended } from '@memberjunction/feature-pipelines';
import { EscapeSQLString, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import {
  FeatureValuePins,
  type AssemblyRefusal,
  type FeatureValuePin,
  type FeatureVersionPin,
  type PredictionFeaturePin,
  type ScoringRefusal,
} from '@memberjunction/predictive-studio-core';

import { UnitModelLineageParser } from '../training/unit-model-lineage';

/** A model's Feature Value column and the pin it reads. */
export interface NamedFeaturePin {
  readonly Name: string;
  readonly Pin: FeatureValuePin;
}

/** The version-row columns the checks read. */
type VersionRow = Pick<MJFeaturePipelineVersionEntity, 'RecordProcessID' | 'Version' | 'Status' | 'PromptVersionHash' | 'AIModelID' | 'ParametersHash'
  | 'Gated' | 'Threshold' | 'ResultValue' | 'GoldenSetTestRunID' | 'ResultDetails'>;
/** The binding columns a prediction pin is compared through. */
type BindingRow = Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName' | 'MLTrainingPipelineID'>;

/** The version in use of a Feature Pipeline (`MJ: Feature Pipeline Versions.Status`). */
const ACTIVE_VERSION: MJFeaturePipelineVersionEntity['Status'] = 'Active';
/** The model a pipeline serves (`MJ: ML Models.Status`). */
const PUBLISHED_MODEL: MJMLModelEntity['Status'] = 'Published';

/** Pin enforcement at scoring and training. */
export class FeaturePinCheck {
  /** The Feature Value columns a stored unit-model lineage pins; empty for an empty lineage or a pre-unit model's (it has none). */
  public static PinsOf(lineageText: string | null | undefined): NamedFeaturePin[] {
    if (!lineageText) return [];
    const lineage = UnitModelLineageParser.ParseUnitModelLineage(lineageText);
    if (lineage.Ok === false) return [];
    return lineage.Value.featureSpec.flatMap((c) => (c.source.kind === 'feature-value' && c.source.pin !== null ? [{ Name: c.name, Pin: c.source.pin }] : []));
  }

  /** {@link Compare} over the pins of `model`'s lineage, each refusal naming its column. */
  public static async ForModel(model: Pick<MJMLModelEntity, 'Lineage'>, provider: IMetadataProvider, contextUser: UserInfo): Promise<ScoringRefusal | null> {
    const named = FeaturePinCheck.PinsOf(model.Lineage);
    return FeaturePinCheck.Compare(named.map((n) => n.Pin), provider, contextUser, (_pin, i) => named[i].Name);
  }

  /**
   * The first pin that is not the one in use, as `feature-version-mismatch`; null when every pin is.
   *
   * @param featureNameOf the model column a pin feeds, for the refusal; by default a prediction pin's binding feature, a
   *   version pin's Record Process ID
   * @throws Error when a read fails (a failed read is not a mismatch)
   */
  public static async Compare(pins: readonly (FeatureVersionPin | PredictionFeaturePin)[], provider: IMetadataProvider, contextUser: UserInfo,
    featureNameOf?: (pin: FeatureVersionPin | PredictionFeaturePin, index: number) => string): Promise<ScoringRefusal | null> {
    if (pins.length === 0) return null;
    const active = await FeaturePinCheck.activeVersions(pins, provider, contextUser);
    const served = await FeaturePinCheck.servedModels(pins, provider, contextUser);
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      const current = FeatureValuePins.IsPrediction(pin) ? FeaturePinCheck.predictionInUse(pin, served) : FeaturePinCheck.versionInUse(pin, active);
      if (FeaturePinCheck.samePin(pin, current.Pin)) continue;
      const featureName = featureNameOf ? featureNameOf(pin, i) : current.FeatureName;
      return { kind: 'feature-version-mismatch', featureName, pinned: pin, active: current.Pin };
    }
    return null;
  }

  /**
   * Training's golden-set rule: the first Feature Pipeline pin whose version row is gated and does not pass
   * `HasPassingResult` (or is gone), refused as `unpinned-feature-version` (training may pin only an activated version,
   * PR 5 D5-B3-3); null when every version pin is activated. A prediction pin has no version row.
   *
   * @throws Error when a read fails
   */
  public static async TrainingActivation(pins: readonly NamedFeaturePin[], provider: IMetadataProvider, contextUser: UserInfo): Promise<AssemblyRefusal | null> {
    const versionPins = pins.filter((p): p is { Name: string; Pin: FeatureVersionPin } => !FeatureValuePins.IsPrediction(p.Pin) && p.Pin.pipelineVersion !== null);
    if (versionPins.length === 0) return null;
    const rows = await FeaturePinCheck.VersionRows(versionPins.map((p) => p.Pin.featurePipelineRecordProcessId), null, provider, contextUser);
    for (const p of versionPins) {
      const row = rows.find((r) => UUIDsEqual(r.RecordProcessID, p.Pin.featurePipelineRecordProcessId) && r.Version === p.Pin.pipelineVersion);
      if (!row || !MJFeaturePipelineVersionEntityExtended.IsActivated(row)) return { kind: 'unpinned-feature-version', featureName: p.Name };
    }
    return null;
  }

  /** The version rows of `processIds` (only the Active ones when `status` is given). */
  public static async VersionRows(processIds: readonly string[], status: MJFeaturePipelineVersionEntity['Status'] | null, provider: IMetadataProvider, contextUser: UserInfo): Promise<VersionRow[]> {
    const ids = [...new Set(processIds.map((id) => id.toUpperCase()))].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    return FeaturePinCheck.read<VersionRow>(provider, contextUser, 'MJ: Feature Pipeline Versions',
      `RecordProcessID IN (${ids})${status === null ? '' : ` AND Status='${status}'`}`,
      ['RecordProcessID', 'Version', 'Status', 'PromptVersionHash', 'AIModelID', 'ParametersHash', 'Gated', 'Threshold', 'ResultValue', 'GoldenSetTestRunID', 'ResultDetails']);
  }

  /** The Active version row of each pinned Feature Pipeline, by Record Process. */
  private static async activeVersions(pins: readonly FeatureValuePin[], provider: IMetadataProvider, contextUser: UserInfo): Promise<UUIDMap<VersionRow>> {
    const processIds = pins.flatMap((p) => (FeatureValuePins.IsPrediction(p) ? [] : [p.featurePipelineRecordProcessId]));
    const byProcess = new UUIDMap<VersionRow>();
    if (processIds.length === 0) return byProcess;
    for (const row of await FeaturePinCheck.VersionRows(processIds, ACTIVE_VERSION, provider, contextUser)) byProcess.Set(row.RecordProcessID, row);
    return byProcess;
  }

  /** Each pinned binding and its pipeline's Published model (null when it has none). */
  private static async servedModels(pins: readonly FeatureValuePin[], provider: IMetadataProvider, contextUser: UserInfo): Promise<UUIDMap<{ Binding: BindingRow; ModelID: string | null }>> {
    const bindingIds = pins.flatMap((p) => (FeatureValuePins.IsPrediction(p) ? [p.mlModelScoringBindingId] : []));
    const out = new UUIDMap<{ Binding: BindingRow; ModelID: string | null }>();
    if (bindingIds.length === 0) return out;
    const bindings = await FeaturePinCheck.read<BindingRow>(provider, contextUser, 'MJ: ML Model Scoring Bindings',
      `ID IN (${FeaturePinCheck.inList(bindingIds)})`, ['ID', 'FeatureName', 'MLTrainingPipelineID']); // pk-filter-ok: MJ core entity keyed by ID
    const pipelineIds = bindings.map((b) => b.MLTrainingPipelineID).filter((id): id is string => !!id);
    const models = pipelineIds.length === 0 ? [] : await FeaturePinCheck.read<Pick<MJMLModelEntity, 'ID' | 'PipelineID'>>(provider, contextUser, 'MJ: ML Models',
      `PipelineID IN (${FeaturePinCheck.inList(pipelineIds)}) AND Status='${PUBLISHED_MODEL}'`, ['ID', 'PipelineID']);
    for (const b of bindings) {
      const model = models.find((m) => !!b.MLTrainingPipelineID && UUIDsEqual(m.PipelineID, b.MLTrainingPipelineID));
      out.Set(b.ID, { Binding: b, ModelID: model ? model.ID : null });
    }
    return out;
  }

  /** The pin a version pin's pipeline is at now: its Active version, or a pin with no version when it has none. */
  private static versionInUse(pin: FeatureVersionPin, active: UUIDMap<VersionRow>): { Pin: FeatureVersionPin; FeatureName: string } {
    const row = active.Get(pin.featurePipelineRecordProcessId);
    const inUse: FeatureVersionPin = row
      ? { featurePipelineRecordProcessId: pin.featurePipelineRecordProcessId, pipelineVersion: row.Version, promptVersionHash: row.PromptVersionHash || null, aiModelId: row.AIModelID || null, parametersHash: row.ParametersHash || null }
      : { featurePipelineRecordProcessId: pin.featurePipelineRecordProcessId, pipelineVersion: null, promptVersionHash: null, aiModelId: null, parametersHash: null };
    return { Pin: inUse, FeatureName: pin.featurePipelineRecordProcessId };
  }

  /** The pin a prediction pin's binding serves now: its pipeline's Published model (an empty ID when it has none). */
  private static predictionInUse(pin: PredictionFeaturePin, served: UUIDMap<{ Binding: BindingRow; ModelID: string | null }>): { Pin: PredictionFeaturePin; FeatureName: string } {
    const s = served.Get(pin.mlModelScoringBindingId);
    return { Pin: { mlModelScoringBindingId: pin.mlModelScoringBindingId, mlModelId: s?.ModelID ?? '' }, FeatureName: s?.Binding.FeatureName ?? pin.mlModelScoringBindingId };
  }

  /** True when two pins name the same version (a version pin by its number, a prediction pin by its model). */
  private static samePin(pinned: FeatureValuePin, inUse: FeatureValuePin): boolean {
    if (FeatureValuePins.IsPrediction(pinned) || FeatureValuePins.IsPrediction(inUse)) {
      return FeatureValuePins.IsPrediction(pinned) && FeatureValuePins.IsPrediction(inUse) && !!inUse.mlModelId && UUIDsEqual(pinned.mlModelId, inUse.mlModelId);
    }
    if (inUse.pipelineVersion === null) return false;
    return pinned.pipelineVersion === inUse.pipelineVersion;
  }

  private static inList(ids: readonly string[]): string {
    return [...new Set(ids.map((id) => id.toUpperCase()))].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
  }

  /** One read as the caller, past the RunView cache; a failed read throws (an infrastructure failure, not a refusal). */
  private static async read<T>(provider: IMetadataProvider, contextUser: UserInfo, entityName: string, filter: string, fields: string[]): Promise<T[]> {
    const r = await RunView.FromMetadataProvider(provider).RunView<T>({ EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true }, contextUser);
    if (!r.Success) throw new Error(`FeaturePinCheck: reading ${entityName} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results || [];
  }
}
