import { afterEach, describe, expect, it } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import {
  EVALUATE_DRIFT_DRIVER_CLASS,
  EvaluateFeatureAndPredictionDriftAction,
  type IDriftAlertEmitter,
} from '../evaluate-drift.action';
import type { FeatureAndPredictionDriftReport } from '../../maintenance/psi-drift-detector';

const TEST_USER = { ID: 'user-drift-test', Name: 'Drift Tester' } as UserInfo;

function buildRunParams(
  entries: Record<string, { value: unknown; type?: 'Input' | 'Output' | 'Both' }>,
): RunActionParams {
  const params: ActionParam[] = Object.entries(entries).map(([name, spec]) => ({
    Name: name,
    Value: spec.value,
    Type: spec.type ?? 'Input',
  }));
  return {
    Action: { ID: 'action-drift', Name: 'Evaluate Feature and Prediction Drift' } as RunActionParams['Action'],
    ContextUser: TEST_USER,
    Filters: [],
    Params: params,
  };
}

function getOutput(params: RunActionParams, name: string): unknown {
  return params.Params.find(
    (p) => p.Name.toLowerCase() === name.toLowerCase() && p.Type === 'Output',
  )?.Value;
}

describe('EvaluateFeatureAndPredictionDriftAction', () => {
  afterEach(() => {
    EvaluateFeatureAndPredictionDriftAction.SetDefaultAlertEmitter(null);
  });

  describe('Registration and default alert emission (D9)', () => {
    it('should register under PredictiveStudioEvaluateDriftAction and emit alerts on fresh ClassFactory instances', async () => {
      expect(EVALUATE_DRIFT_DRIVER_CLASS).toBe('PredictiveStudioEvaluateDriftAction');

      const emittedReports: FeatureAndPredictionDriftReport[] = [];
      const defaultEmitter: IDriftAlertEmitter = {
        EmitDriftAlert: async (report) => {
          emittedReports.push(report);
          return { AlertID: 'alert-default-1', Emitted: true };
        },
      };
      EvaluateFeatureAndPredictionDriftAction.SetDefaultAlertEmitter(defaultEmitter);

      const action = MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(
        BaseAction,
        EVALUATE_DRIFT_DRIVER_CLASS,
      );
      expect(action).toBeInstanceOf(EvaluateFeatureAndPredictionDriftAction);

      const baseline = Array.from({ length: 150 }, (_, i) => (i % 10) * 10);
      const evaluation = Array.from({ length: 150 }, () => 95);
      const runParams = buildRunParams({
        ModelID: { value: 'model-1' },
        NumericFeatures: {
          value: {
            EngagementScore: { Baseline: baseline, Evaluation: evaluation, Bins: 10 },
          },
        },
      });

      const result = await action!.Run(runParams);
      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(getOutput(runParams, 'OverallSeverity')).toBe('Critical');
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
      expect(getOutput(runParams, 'AlertID')).toBe('alert-default-1');
      expect(emittedReports).toHaveLength(1);
    });
  });

  describe('Loading windows from MJ: Feature Values by RecordProcessID (D9)', () => {
    it('should load Champion and Challenger rows from MJ: Feature Values via RunView when RecordProcessID is supplied without inline arrays', async () => {
      const rows = [
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `c-b-${i}`,
          RecordProcessID: 'rp-maint-1',
          ProcessRunID: 'run-1',
          EntityID: 'ent-members',
          RecordID: `rec-${i}`,
          FeatureName: 'RenewalProb',
          Role: 'Champion',
          AIModelID: 'model-champ',
          ValueNumeric: (i % 10) / 10,
          ValueText: null,
          Confidence: 0.9,
          Reasoning: null,
          ComputedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        })),
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `c-e-${i}`,
          RecordProcessID: 'rp-maint-1',
          ProcessRunID: 'run-2',
          EntityID: 'ent-members',
          RecordID: `rec-e-${i}`,
          FeatureName: 'RenewalProb',
          Role: 'Champion',
          AIModelID: 'model-champ',
          ValueNumeric: 0.02,
          ValueText: null,
          Confidence: 0.45,
          Reasoning: null,
          ComputedAt: new Date(Date.UTC(2026, 0, 2, 0, i)).toISOString(),
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          ID: `sh-${i}`,
          RecordProcessID: 'rp-maint-1',
          ProcessRunID: 'run-2',
          EntityID: 'ent-members',
          RecordID: `rec-e-${i}`,
          FeatureName: 'RenewalProb',
          Role: 'Challenger',
          AIModelID: 'model-chall',
          ValueNumeric: 0.92,
          ValueText: null,
          Confidence: 0.88,
          Reasoning: null,
          ComputedAt: new Date(Date.UTC(2026, 0, 2, 0, i)).toISOString(),
        })),
      ];

      const savedNotifications: Array<{ UserID: string; Title: string; Message: string }> = [];
      const fakeProvider = {
        RunView: async (_params: RunViewParams): Promise<RunViewResult> => ({
          Success: true,
          Results: rows,
          RowCount: rows.length,
          TotalRowCount: rows.length,
          ExecutionTime: 1,
          ErrorMessage: '',
        }),
        GetEntityObject: async <T>(entityName: string) => {
          expect(entityName).toBe('MJ: User Notifications');
          const notif = {
            ID: 'notif-alert-99',
            UserID: '',
            Title: '',
            Message: '',
            Unread: false,
            LatestResult: null,
            NewRecord: () => true,
            Save: async () => {
              savedNotifications.push({
                UserID: notif.UserID,
                Title: notif.Title,
                Message: notif.Message,
              });
              return true;
            },
          };
          return notif as T;
        },
      } as Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        RecordProcessID: { value: 'rp-maint-1' },
      });
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'OverallSeverity')).toBe('Critical');
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
      expect(getOutput(runParams, 'AlertID')).toBe('notif-alert-99');
      expect(savedNotifications).toHaveLength(1);
    });
  });

  describe('Preserving missing/null values and threshold validation (D8, D12)', () => {
    it('should preserve null evaluation values in NumericFeatures and classify 100% missingness as Critical', async () => {
      const action = new EvaluateFeatureAndPredictionDriftAction();
      const baseline = Array.from({ length: 200 }, (_, i) => i);
      const evaluation = Array.from({ length: 200 }, () => null);
      const runParams = buildRunParams({
        NumericFeatures: {
          value: {
            BrokenUpstreamCol: { Baseline: baseline, Evaluation: evaluation },
          },
        },
        EmitAlertOnDrift: { value: false },
      });

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'OverallSeverity')).toBe('Critical');
    });

    it('should return INVALID_PARAMETER when WarningPSIThreshold >= CriticalPSIThreshold', async () => {
      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        PrebinnedFeatures: {
          value: {
            Band: {
              BaselineProportions: [0.5, 0.5],
              EvaluationProportions: [0.5, 0.5],
            },
          },
        },
        WarningPSIThreshold: { value: 0.4 },
        CriticalPSIThreshold: { value: 0.2 },
      });

      const result = await action.Run(runParams);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('INVALID_PARAMETER');
    });

    it('should return MISSING_PARAMETER when neither RecordProcessID/ModelID nor inline features are supplied', async () => {
      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({});
      const result = await action.Run(runParams);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });
  });
});
