/**
 * @module actions/evaluate-drift.action
 *
 * **Evaluate Feature and Prediction Drift** action (`WS-4.4`) — the thin Action boundary
 * over {@link EvaluateFeatureAndPredictionDrift} and {@link LoadFeatureAndPredictionDriftFromFeatureValues}
 * so scheduled maintenance workflows, agents, or administrative runs can compute
 * Population Stability Index (PSI), confidence-floor degradation, and
 * champion-vs-challenger divergence metrics, and emit a drift alert when thresholds are breached.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata, RunView, WellKnownUserSource, type IMetadataProvider } from '@memberjunction/core';
import type { MJRecordProcessEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';

import { BasePredictiveStudioAction, type JsonObject } from './base-predictive-studio.action';
import { EVALUATE_DRIFT_DRIVER_CLASS } from './driver-classes';
import {
  DEFAULT_DRIFT_MAX_ROWS,
  EvaluateFeatureAndPredictionDrift,
  LoadFeatureAndPredictionDriftForRecordProcesses,
  LoadFeatureAndPredictionDriftFromFeatureValues,
  type ChampionChallengerPair,
  type ConfidenceAndDivergenceInput,
  type ConfidenceAndDivergenceMetrics,
  type DriftSeverity,
  type FeatureAndPredictionDriftInput,
  type FeatureAndPredictionDriftReport,
  type FeaturePSIResult,
} from '../maintenance/psi-drift-detector';

export { EVALUATE_DRIFT_DRIVER_CLASS } from './driver-classes';

type ActiveRecordProcessRow = Pick<MJRecordProcessEntity, 'ID' | 'Name' | 'WorkType' | 'Status'>;

export interface ProcessDriftSummaryItem {
  readonly RecordProcessID: string;
  readonly ProcessName?: string;
  readonly WorkType?: MJRecordProcessEntity['WorkType'];
  readonly OverallSeverity: DriftSeverity;
  readonly MaxPSI: number;
  readonly ShouldAlert: boolean;
  readonly InsufficientData: boolean;
  readonly AlertEmitted: boolean;
  readonly AlertID?: string;
  /** This process's confidence-floor and champion-vs-challenger metrics; absent when its load failed. */
  readonly DivergenceMetrics?: ConfidenceAndDivergenceMetrics;
  /** Why this process could not be evaluated (its Feature Values failed to load); the sweep goes on. */
  readonly ErrorMessage?: string;
  readonly Summary: string;
}

const SEVERITY_RANK: Record<DriftSeverity, number> = {
  None: 0,
  Warning: 1,
  Critical: 2,
};

/**
 * Injectable seam for emitting a drift alert (e.g., creating an `MJ: User Notifications`
 * or `MJ: AI Agent Requests` record) when `report.ShouldAlert` is `true`.
 */
export interface IDriftAlertEmitter {
  EmitDriftAlert(
    report: FeatureAndPredictionDriftReport,
    params: RunActionParams,
    contextInfo?: {
      recordProcessId?: string;
      recordProcessName?: string;
    },
  ): Promise<{ readonly AlertID?: string; readonly Emitted: boolean }>;
}

/**
 * Production {@link IDriftAlertEmitter} that persists an `MJ: User Notifications` alert
 * for `params.ContextUser` (or `NotifyUserID` when specified or run under scheduled jobs)
 * when a metadata provider is available.
 */
export class DefaultDriftAlertEmitter implements IDriftAlertEmitter {
  constructor(private readonly provider?: IMetadataProvider) {}

  public async EmitDriftAlert(
    report: FeatureAndPredictionDriftReport,
    params: RunActionParams,
    contextInfo?: {
      recordProcessId?: string;
      recordProcessName?: string;
    },
  ): Promise<{ readonly AlertID?: string; readonly Emitted: boolean }> {
    const provider = this.provider ?? params.Provider ?? Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts)
    if (!provider) {
      return { Emitted: false };
    }

    const notifyParam = params.Params?.find(
      (p) => p.Name?.trim().toLowerCase() === 'notifyuserid',
    );
    const notifyUserId =
      typeof notifyParam?.Value === 'string' && notifyParam.Value.trim().length > 0
        ? notifyParam.Value.trim()
        : undefined;

    const isSystem =
      WellKnownUserSource.Instance.IsSystemUser(params.ContextUser) ||
      (params.ContextUser as { Type?: string; IsSystem?: boolean } | undefined)?.Type?.toLowerCase() === 'system' ||
      (params.ContextUser as { Type?: string; IsSystem?: boolean } | undefined)?.IsSystem === true ||
      params.ContextUser?.Email?.toLowerCase() === 'system' ||
      params.ContextUser?.Name?.toLowerCase() === 'system';
    const targetUserId = notifyUserId ?? (isSystem ? undefined : params.ContextUser?.ID);

    if (!targetUserId) {
      if (isSystem && !notifyUserId) {
        LogError(
          'DefaultDriftAlertEmitter: drift alert suppressed — action was executed by system user and no NotifyUserID parameter was provided.',
        );
      }
      return { Emitted: false };
    }

    try {
      const notification = await provider.GetEntityObject<MJUserNotificationEntity>(
        'MJ: User Notifications',
        params.ContextUser,
      );
      notification.NewRecord();
      notification.UserID = targetUserId;

      const recordProcessId = contextInfo?.recordProcessId ?? report.RecordProcessID;
      const recordProcessName = contextInfo?.recordProcessName;
      const processLabel = recordProcessName
        ? `${recordProcessName} (${recordProcessId ?? 'unknown'})`
        : (recordProcessId ?? report.ModelID ?? 'Predictive Studio');

      notification.Title = `Predictive Drift Alert (${report.OverallSeverity}): ${processLabel}`;
      notification.Message = `Drift detected for Record Process: ${processLabel}\n\n${report.Summary}`;
      notification.Unread = true;

      if (recordProcessId) {
        notification.ResourceTypeID = 'DAAFCCEC-6A37-EF11-86D4-000D3A4E707E';
        notification.ResourceRecordID = recordProcessId;
        notification.ResourceConfiguration = JSON.stringify({
          EntityName: 'MJ: Record Processes',
          RecordID: recordProcessId,
        });
      }

      const saved = await notification.Save();
      if (!saved) {
        LogError(
          `DefaultDriftAlertEmitter: failed to save drift notification: ${notification.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
        return { Emitted: false };
      }
      return { AlertID: notification.ID || undefined, Emitted: true };
    } catch (error: unknown) {
      LogError(error);
      return { Emitted: false };
    }
  }
}

/**
 * Evaluates feature PSI across numeric, categorical, and pre-binned features along with
 * confidence-floor and champion-vs-challenger divergence metrics.
 */
@RegisterClass(BaseAction, EVALUATE_DRIFT_DRIVER_CLASS)
export class EvaluateFeatureAndPredictionDriftAction extends BasePredictiveStudioAction {
  private static defaultAlertEmitter: IDriftAlertEmitter | null = null;

  /**
   * Configure a process-wide default {@link IDriftAlertEmitter} used by fresh action
   * instances instantiated through `ActionEngineServer` / `ClassFactory`.
   */
  public static SetDefaultAlertEmitter(emitter: IDriftAlertEmitter | null): void {
    EvaluateFeatureAndPredictionDriftAction.defaultAlertEmitter = emitter;
  }

  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const modelId = this.getStringParam(params, 'ModelID');
      const recordProcessId = this.getStringParam(params, 'RecordProcessID');
      const maxRows = this.getNumericParam(params, 'MaxRows') ?? DEFAULT_DRIFT_MAX_ROWS;

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

      const hasInlineFeatures =
        numericFeatures !== undefined ||
        categoricalFeatures !== undefined ||
        prebinnedFeatures !== undefined ||
        confidenceAndDivergence !== undefined;

      const warningThreshold = this.getNumericParam(params, 'WarningPSIThreshold');
      const criticalThreshold = this.getNumericParam(params, 'CriticalPSIThreshold');
      const epsilon = this.getNumericParam(params, 'Epsilon');
      const minSampleSize = this.getNumericParam(params, 'MinSampleSize');
      const provider = params.Provider || Metadata.Provider; // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts)

      let driftInput: FeatureAndPredictionDriftInput;
      if (hasInlineFeatures) {
        driftInput = {
          ModelID: modelId,
          RecordProcessID: recordProcessId,
          NumericFeatures: numericFeatures,
          CategoricalFeatures: categoricalFeatures,
          PrebinnedFeatures: prebinnedFeatures,
          ConfidenceAndDivergence: confidenceAndDivergence,
          WarningPSIThreshold: warningThreshold,
          CriticalPSIThreshold: criticalThreshold,
          Epsilon: epsilon,
          MinSampleSize: minSampleSize,
        };
      } else if (recordProcessId || modelId) {
        driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
          RecordProcessID: recordProcessId,
          ModelID: modelId,
          BaselineWindowEnd: this.getStringParam(params, 'BaselineWindowEnd'),
          EvaluationWindowStart: this.getStringParam(params, 'EvaluationWindowStart'),
          Provider: provider,
          ContextUser: params.ContextUser,
          WarningPSIThreshold: warningThreshold,
          CriticalPSIThreshold: criticalThreshold,
          Epsilon: epsilon,
          MinSampleSize: minSampleSize,
          MaxRows: maxRows,
        });
      } else {
        const explicitTargetParam = (params.Params ?? []).some((p) => {
          const normalized = p.Name?.trim().toLowerCase();
          return (
            p.Type !== 'Output' &&
            (normalized === 'recordprocessid' || normalized === 'modelid')
          );
        });
        if (explicitTargetParam) {
          return this.fail(
            'MISSING_PARAMETER',
            'At least one of RecordProcessID, ModelID, NumericFeatures, CategoricalFeatures, PrebinnedFeatures, or ConfidenceAndDivergence must be provided.',
          );
        }
        return await this.runScheduledProcessSweep(params, provider, {
          warningThreshold,
          criticalThreshold,
          epsilon,
          minSampleSize,
          maxRows,
        });
      }

      const report = EvaluateFeatureAndPredictionDrift(driftInput);
      const emitAlertOnDrift = this.getBooleanParam(params, 'EmitAlertOnDrift', true);

      let alertEmitted = false;
      let alertId: string | undefined;
      if (report.ShouldAlert && emitAlertOnDrift) {
        const activeEmitter =
          EvaluateFeatureAndPredictionDriftAction.defaultAlertEmitter ??
          new DefaultDriftAlertEmitter(provider);
        const alertOutcome = await activeEmitter.EmitDriftAlert(report, params, {
          recordProcessId,
        });
        alertEmitted = alertOutcome.Emitted;
        alertId = alertOutcome.AlertID;
      }

      this.addOutputParam(params, 'OverallSeverity', report.OverallSeverity);
      this.addOutputParam(params, 'MaxPSI', report.MaxPSI);
      this.addOutputParam(params, 'DriftedFeatures', report.DriftedFeatures);
      this.addOutputParam(params, 'FeatureResults', report.FeatureResults);
      this.addOutputParam(params, 'DivergenceMetrics', report.DivergenceMetrics);
      this.addOutputParam(params, 'ShouldAlert', report.ShouldAlert);
      this.addOutputParam(params, 'InsufficientData', report.InsufficientData);
      this.addOutputParam(params, 'AlertEmitted', alertEmitted);
      if (alertId) {
        this.addOutputParam(params, 'AlertID', alertId);
      }
      this.addOutputParam(params, 'Summary', report.Summary);

      return this.ok(params, report.Summary);
    } catch (error: unknown) {
      LogError(error);
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('INVALID_PARAMETER:')) {
        return this.fail('INVALID_PARAMETER', message);
      }
      return this.fail('UNEXPECTED_ERROR', `Drift evaluation failed: ${message}`);
    }
  }

  private async runScheduledProcessSweep(
    params: RunActionParams,
    provider: IMetadataProvider,
    thresholds: {
      warningThreshold?: number;
      criticalThreshold?: number;
      epsilon?: number;
      minSampleSize?: number;
      maxRows?: number;
    },
  ): Promise<ActionResultSimple> {
    const rv = RunView.FromMetadataProvider(provider);
    const processesRes = await rv.RunView<ActiveRecordProcessRow>(
      {
        EntityName: 'MJ: Record Processes',
        ExtraFilter: "Status = 'Active' AND WorkType IN ('ML Model', 'Infer')",
        Fields: ['ID', 'Name', 'WorkType', 'Status'],
        OrderBy: 'Name ASC, ID ASC',
        ResultType: 'simple',
      },
      params.ContextUser,
    );

    if (!processesRes.Success) {
      throw new Error(
        `Failed to load active MJ: Record Processes for drift sweep: ${processesRes.ErrorMessage ?? 'unknown error'}`,
      );
    }

    const activeProcesses = processesRes.Results ?? [];
    const baselineWindowEnd = this.getStringParam(params, 'BaselineWindowEnd');
    const evaluationWindowStart = this.getStringParam(params, 'EvaluationWindowStart');
    const emitAlertOnDrift = this.getBooleanParam(params, 'EmitAlertOnDrift', true);
    const activeEmitter =
      EvaluateFeatureAndPredictionDriftAction.defaultAlertEmitter ??
      new DefaultDriftAlertEmitter(provider);

    let overallSeverity: DriftSeverity = 'None';
    let maxPSI = 0;
    const driftedFeatures: FeaturePSIResult[] = [];
    const featureResults: FeaturePSIResult[] = [];
    const processResults: ProcessDriftSummaryItem[] = [];
    let shouldAlert = false;
    let insufficientData = activeProcesses.length === 0;
    let alertEmitted = false;
    let firstAlertId: string | undefined;
    let failedCount = 0;

    const loads = await LoadFeatureAndPredictionDriftForRecordProcesses(
      activeProcesses.map((proc) => proc.ID),
      {
        BaselineWindowEnd: baselineWindowEnd,
        EvaluationWindowStart: evaluationWindowStart,
        Provider: provider,
        ContextUser: params.ContextUser,
        WarningPSIThreshold: thresholds.warningThreshold,
        CriticalPSIThreshold: thresholds.criticalThreshold,
        Epsilon: thresholds.epsilon,
        MinSampleSize: thresholds.minSampleSize,
        MaxRows: thresholds.maxRows,
      },
    );

    for (const [i, proc] of activeProcesses.entries()) {
      const load = loads[i];
      if (!load?.Input) {
        const message = load?.ErrorMessage ?? 'no load result';
        LogError(`Drift sweep: record process '${proc.Name}' (${proc.ID}) was not evaluated: ${message}`);
        failedCount++;
        processResults.push({
          RecordProcessID: proc.ID,
          ProcessName: proc.Name,
          WorkType: proc.WorkType,
          OverallSeverity: 'None',
          MaxPSI: 0,
          ShouldAlert: false,
          InsufficientData: true,
          AlertEmitted: false,
          ErrorMessage: message,
          Summary: `Not evaluated: ${message}`,
        });
        continue;
      }
      const report = EvaluateFeatureAndPredictionDrift(load.Input);

      if (SEVERITY_RANK[report.OverallSeverity] > SEVERITY_RANK[overallSeverity]) {
        overallSeverity = report.OverallSeverity;
      }
      if (report.MaxPSI > maxPSI) {
        maxPSI = report.MaxPSI;
      }
      driftedFeatures.push(...report.DriftedFeatures);
      featureResults.push(...report.FeatureResults);
      if (report.ShouldAlert) {
        shouldAlert = true;
      }
      if (report.InsufficientData) {
        insufficientData = true;
      }

      let procAlertEmitted = false;
      let procAlertId: string | undefined;
      if (report.ShouldAlert && emitAlertOnDrift) {
        const alertOutcome = await activeEmitter.EmitDriftAlert(report, params, {
          recordProcessId: proc.ID,
          recordProcessName: proc.Name,
        });
        procAlertEmitted = alertOutcome.Emitted;
        procAlertId = alertOutcome.AlertID;
        if (procAlertEmitted) {
          alertEmitted = true;
          firstAlertId = firstAlertId ?? procAlertId;
        }
      }

      processResults.push({
        RecordProcessID: proc.ID,
        ProcessName: proc.Name,
        WorkType: proc.WorkType,
        OverallSeverity: report.OverallSeverity,
        MaxPSI: report.MaxPSI,
        ShouldAlert: report.ShouldAlert,
        InsufficientData: report.InsufficientData,
        AlertEmitted: procAlertEmitted,
        AlertID: procAlertId,
        DivergenceMetrics: report.DivergenceMetrics,
        Summary: report.Summary,
      });
    }

    const summary =
      `ProcessesEvaluated=${processResults.length - failedCount}, ProcessesFailed=${failedCount}, ` +
      `OverallSeverity=${overallSeverity}, MaxPSI=${maxPSI.toFixed(4)}, DriftedFeatures=${driftedFeatures.length}`;

    this.addOutputParam(params, 'OverallSeverity', overallSeverity);
    this.addOutputParam(params, 'MaxPSI', maxPSI);
    this.addOutputParam(params, 'DriftedFeatures', driftedFeatures);
    this.addOutputParam(params, 'FeatureResults', featureResults);
    // DivergenceMetrics is per process in a sweep: see each ProcessResults entry.
    this.addOutputParam(params, 'ShouldAlert', shouldAlert);
    this.addOutputParam(params, 'InsufficientData', insufficientData);
    this.addOutputParam(params, 'AlertEmitted', alertEmitted);
    if (firstAlertId) {
      this.addOutputParam(params, 'AlertID', firstAlertId);
    }
    this.addOutputParam(params, 'ProcessResults', processResults);
    this.addOutputParam(params, 'Summary', summary);

    return this.ok(params, summary);
  }

  private parseNumericFeatures(
    raw: JsonObject | undefined,
  ): FeatureAndPredictionDriftInput['NumericFeatures'] | undefined {
    if (!raw) {
      return undefined;
    }
    const result: Record<
      string,
      { Baseline: (number | null)[]; Evaluation: (number | null)[]; Bins?: number }
    > = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toNullableNumberArray(rec['Baseline']);
        const evaluation = this.toNullableNumberArray(rec['Evaluation']);
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
    const result: Record<string, { Baseline: (string | null)[]; Evaluation: (string | null)[] }> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toNullableStringArray(rec['Baseline']);
        const evaluation = this.toNullableStringArray(rec['Evaluation']);
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
    const result: Record<
      string,
      {
        BaselineProportions: number[];
        EvaluationProportions: number[];
        BaselineSampleCount?: number;
        EvaluationSampleCount?: number;
      }
    > = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>;
        const baseline = this.toNumberArray(rec['BaselineProportions']);
        const evaluation = this.toNumberArray(rec['EvaluationProportions']);
        const baseSampleCount =
          typeof rec['BaselineSampleCount'] === 'number' ? rec['BaselineSampleCount'] : undefined;
        const evalSampleCount =
          typeof rec['EvaluationSampleCount'] === 'number' ? rec['EvaluationSampleCount'] : undefined;
        result[key] = {
          BaselineProportions: baseline,
          EvaluationProportions: evaluation,
          BaselineSampleCount: baseSampleCount,
          EvaluationSampleCount: evalSampleCount,
        };
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
          TimedOut: typeof rec['TimedOut'] === 'boolean' ? rec['TimedOut'] : undefined,
          ErrorMessage: typeof rec['ErrorMessage'] === 'string' ? rec['ErrorMessage'] : undefined,
        });
      }
    }

    const problemType =
      raw['ProblemType'] === 'classification' || raw['ProblemType'] === 'regression'
        ? raw['ProblemType']
        : undefined;

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
      ProblemType: problemType,
      ScoreAgreementTolerance:
        typeof raw['ScoreAgreementTolerance'] === 'number' ? raw['ScoreAgreementTolerance'] : undefined,
      MinSampleSize: typeof raw['MinSampleSize'] === 'number' ? raw['MinSampleSize'] : undefined,
    };
  }

  private toNumberArray(val: unknown): number[] {
    if (!Array.isArray(val)) {
      return [];
    }
    return val.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  }

  private toNullableNumberArray(val: unknown): (number | null)[] {
    if (!Array.isArray(val)) {
      return [];
    }
    return val.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null));
  }

  private toNullableStringArray(val: unknown): (string | null)[] {
    if (!Array.isArray(val)) {
      return [];
    }
    return val.map((v) => (v === null || v === undefined ? null : String(v)));
  }
}
