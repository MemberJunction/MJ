/**
 * @module actions/evaluate-drift.action
 *
 * **Evaluate Feature and Prediction Drift** action (`WS-4.4`) — the thin Action boundary
 * over {@link EvaluateFeatureAndPredictionDrift} so scheduled maintenance workflows,
 * agents, or administrative runs can compute Population Stability Index (PSI),
 * confidence-floor degradation, and champion-vs-challenger divergence metrics, and
 * emit a drift alert when thresholds are breached.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { BasePredictiveStudioAction, type JsonObject } from './base-predictive-studio.action';
import { EVALUATE_DRIFT_DRIVER_CLASS } from './driver-classes';
import {
  EvaluateFeatureAndPredictionDrift,
  type ChampionChallengerPair,
  type ConfidenceAndDivergenceInput,
  type FeatureAndPredictionDriftInput,
  type FeatureAndPredictionDriftReport,
} from '../maintenance/psi-drift-detector';

export { EVALUATE_DRIFT_DRIVER_CLASS } from './driver-classes';

/**
 * Injectable seam for emitting a drift alert (e.g., creating an `MJ: AI Agent Requests`
 * HITL review or notification record) when `report.ShouldAlert` is `true`.
 */
export interface IDriftAlertEmitter {
  EmitDriftAlert(
    report: FeatureAndPredictionDriftReport,
    params: RunActionParams,
  ): Promise<{ readonly AlertID?: string; readonly Emitted: boolean }>;
}

/**
 * Evaluates feature PSI across numeric, categorical, and pre-binned features along with
 * confidence-floor and champion-vs-challenger divergence metrics.
 */
@RegisterClass(BaseAction, EVALUATE_DRIFT_DRIVER_CLASS)
export class EvaluateFeatureAndPredictionDriftAction extends BasePredictiveStudioAction {
  private alertEmitter: IDriftAlertEmitter | null = null;

  /**
   * Configure an optional {@link IDriftAlertEmitter} seam for emitting drift notifications
   * or HITL requests when `ShouldAlert` is triggered.
   */
  public SetAlertEmitter(emitter: IDriftAlertEmitter | null): void {
    this.alertEmitter = emitter;
  }

  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const modelId = this.getStringParam(params, 'ModelID');
      const recordProcessId = this.getStringParam(params, 'RecordProcessID');

      const numericFeatures = this.parseNumericFeatures(this.getJsonObjectParam(params, 'NumericFeatures'));
      const categoricalFeatures = this.parseCategoricalFeatures(
        this.getJsonObjectParam(params, 'CategoricalFeatures'),
      );
      const prebinnedFeatures = this.parsePrebinnedFeatures(
        this.getJsonObjectParam(params, 'PrebinnedFeatures'),
      );
      const confidenceAndDivergence = this.parseConfidenceAndDivergence(
        this.getJsonObjectParam(params, 'ConfidenceAndDivergence'),
      );

      const hasAnyInput =
        numericFeatures !== undefined ||
        categoricalFeatures !== undefined ||
        prebinnedFeatures !== undefined ||
        confidenceAndDivergence !== undefined;

      if (!hasAnyInput) {
        return this.fail(
          'MISSING_PARAMETER',
          'At least one of NumericFeatures, CategoricalFeatures, PrebinnedFeatures, or ConfidenceAndDivergence must be provided.',
        );
      }

      const driftInput: FeatureAndPredictionDriftInput = {
        ModelID: modelId,
        RecordProcessID: recordProcessId,
        NumericFeatures: numericFeatures,
        CategoricalFeatures: categoricalFeatures,
        PrebinnedFeatures: prebinnedFeatures,
        ConfidenceAndDivergence: confidenceAndDivergence,
        WarningPSIThreshold: this.getNumericParam(params, 'WarningPSIThreshold'),
        CriticalPSIThreshold: this.getNumericParam(params, 'CriticalPSIThreshold'),
        Epsilon: this.getNumericParam(params, 'Epsilon'),
      };

      const report = EvaluateFeatureAndPredictionDrift(driftInput);
      const emitAlertOnDrift = this.getBooleanParam(params, 'EmitAlertOnDrift', true);

      let alertEmitted = false;
      let alertId: string | undefined;
      if (report.ShouldAlert && emitAlertOnDrift && this.alertEmitter) {
        const alertOutcome = await this.alertEmitter.EmitDriftAlert(report, params);
        alertEmitted = alertOutcome.Emitted;
        alertId = alertOutcome.AlertID;
      }

      this.addOutputParam(params, 'OverallSeverity', report.OverallSeverity);
      this.addOutputParam(params, 'MaxPSI', report.MaxPSI);
      this.addOutputParam(params, 'DriftedFeatures', report.DriftedFeatures);
      this.addOutputParam(params, 'FeatureResults', report.FeatureResults);
      this.addOutputParam(params, 'DivergenceMetrics', report.DivergenceMetrics);
      this.addOutputParam(params, 'ShouldAlert', report.ShouldAlert);
      this.addOutputParam(params, 'AlertEmitted', alertEmitted);
      if (alertId) {
        this.addOutputParam(params, 'AlertID', alertId);
      }
      this.addOutputParam(params, 'Summary', report.Summary);

      return this.ok(params, report.Summary);
    } catch (error: unknown) {
      LogError(error);
      return this.fail(
        'UNEXPECTED_ERROR',
        `Drift evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private parseNumericFeatures(
    raw: JsonObject | undefined,
  ): FeatureAndPredictionDriftInput['NumericFeatures'] | undefined {
    if (!raw) {
      return undefined;
    }
    const result: Record<string, { Baseline: number[]; Evaluation: number[]; Bins?: number }> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toNumberArray(rec['Baseline']);
        const evaluation = this.toNumberArray(rec['Evaluation']);
        const bins = typeof rec['Bins'] === 'number' ? rec['Bins'] : undefined;
        result[key] = { Baseline: baseline, Evaluation: evaluation, Bins: bins };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private parseCategoricalFeatures(
    raw: JsonObject | undefined,
  ): FeatureAndPredictionDriftInput['CategoricalFeatures'] | undefined {
    if (!raw) {
      return undefined;
    }
    const result: Record<string, { Baseline: string[]; Evaluation: string[] }> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toStringArray(rec['Baseline']);
        const evaluation = this.toStringArray(rec['Evaluation']);
        result[key] = { Baseline: baseline, Evaluation: evaluation };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private parsePrebinnedFeatures(
    raw: JsonObject | undefined,
  ): FeatureAndPredictionDriftInput['PrebinnedFeatures'] | undefined {
    if (!raw) {
      return undefined;
    }
    const result: Record<string, { BaselineProportions: number[]; EvaluationProportions: number[] }> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toNumberArray(rec['BaselineProportions']);
        const evaluation = this.toNumberArray(rec['EvaluationProportions']);
        result[key] = { BaselineProportions: baseline, EvaluationProportions: evaluation };
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  private parseConfidenceAndDivergence(
    raw: JsonObject | undefined,
  ): ConfidenceAndDivergenceInput | undefined {
    if (!raw) {
      return undefined;
    }
    const pairsRaw = Array.isArray(raw['Pairs']) ? raw['Pairs'] : [];
    const pairs: ChampionChallengerPair[] = [];
    for (const item of pairsRaw) {
      if (typeof item === 'object' && item !== null) {
        const rec = item as Record<string, unknown>;
        pairs.push({
          RecordID: typeof rec['RecordID'] === 'string' ? rec['RecordID'] : undefined,
          ChampionScore: typeof rec['ChampionScore'] === 'number' ? rec['ChampionScore'] : undefined,
          ChallengerScore: typeof rec['ChallengerScore'] === 'number' ? rec['ChallengerScore'] : undefined,
          ChampionLabel: typeof rec['ChampionLabel'] === 'string' ? rec['ChampionLabel'] : undefined,
          ChallengerLabel: typeof rec['ChallengerLabel'] === 'string' ? rec['ChallengerLabel'] : undefined,
          ChampionLatencyMs: typeof rec['ChampionLatencyMs'] === 'number' ? rec['ChampionLatencyMs'] : undefined,
          ChallengerLatencyMs: typeof rec['ChallengerLatencyMs'] === 'number' ? rec['ChallengerLatencyMs'] : undefined,
        });
      }
    }

    return {
      BaselineConfidences: Array.isArray(raw['BaselineConfidences'])
        ? this.toNumberArray(raw['BaselineConfidences'])
        : undefined,
      EvaluationConfidences: Array.isArray(raw['EvaluationConfidences'])
        ? this.toNumberArray(raw['EvaluationConfidences'])
        : undefined,
      ConfidenceFloor: typeof raw['ConfidenceFloor'] === 'number' ? raw['ConfidenceFloor'] : undefined,
      MaxBelowFloorRate: typeof raw['MaxBelowFloorRate'] === 'number' ? raw['MaxBelowFloorRate'] : undefined,
      MaxMeanConfidenceDrop: typeof raw['MaxMeanConfidenceDrop'] === 'number' ? raw['MaxMeanConfidenceDrop'] : undefined,
      Pairs: pairs.length > 0 ? pairs : undefined,
      MinAgreementRate: typeof raw['MinAgreementRate'] === 'number' ? raw['MinAgreementRate'] : undefined,
      MaxMeanAbsoluteScoreDelta:
        typeof raw['MaxMeanAbsoluteScoreDelta'] === 'number' ? raw['MaxMeanAbsoluteScoreDelta'] : undefined,
      MaxP95LatencyRatio: typeof raw['MaxP95LatencyRatio'] === 'number' ? raw['MaxP95LatencyRatio'] : undefined,
    };
  }

  private toNumberArray(val: unknown): number[] {
    if (!Array.isArray(val)) {
      return [];
    }
    return val.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  }

  private toStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) {
      return [];
    }
    return val.map((v) => String(v));
  }
}
