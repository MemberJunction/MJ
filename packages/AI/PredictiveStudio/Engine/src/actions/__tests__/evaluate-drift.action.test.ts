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

  describe('Loading windows from MJ: Feature Values by RecordProcessID (D9, R4)', () => {
    it('should load Champion and Challenger rows from MJ: Feature Values via RunView when RecordProcessID is supplied without inline arrays', async () => {
      const nowMs = Date.now();
      const fourteenDaysAgoMs = nowMs - 14 * 86_400_000;
      const twoDaysAgoMs = nowMs - 2 * 86_400_000;

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
          ComputedAt: new Date(fourteenDaysAgoMs + i * 60_000).toISOString(),
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
          ComputedAt: new Date(twoDaysAgoMs + i * 60_000).toISOString(),
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
          ComputedAt: new Date(twoDaysAgoMs + i * 60_000).toISOString(),
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
      expect(Reflect.get(action, 'SetAlertEmitter')).toBeUndefined();

      const runParams = buildRunParams({
        RecordProcessID: { value: 'rp-maint-1' },
      });
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'OverallSeverity')).toBe('Critical');
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      expect(getOutput(runParams, 'InsufficientData')).toBe(false);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
      expect(getOutput(runParams, 'AlertID')).toBe('notif-alert-99');
      expect(savedNotifications).toHaveLength(1);
    });

    it('sweeps active "ML Model" and "Infer" Record Processes when invoked with no target parameters (as ActionScheduledJobDriver does) and outputs ProcessResults (R2)', async () => {
      const nowMs = Date.now();
      const fourteenDaysAgoMs = nowMs - 14 * 86_400_000;
      const twoDaysAgoMs = nowMs - 2 * 86_400_000;

      const driftedRows = [
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `ml-b-${i}`,
          RecordProcessID: 'rp-ml-1',
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
          ComputedAt: new Date(fourteenDaysAgoMs + i * 60_000).toISOString(),
        })),
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `ml-e-${i}`,
          RecordProcessID: 'rp-ml-1',
          ProcessRunID: 'run-2',
          EntityID: 'ent-members',
          RecordID: `rec-e-${i}`,
          FeatureName: 'RenewalProb',
          Role: 'Champion',
          AIModelID: 'model-champ',
          ValueNumeric: 0.99,
          ValueText: null,
          Confidence: 0.9,
          Reasoning: null,
          ComputedAt: new Date(twoDaysAgoMs + i * 60_000).toISOString(),
        })),
      ];

      const stableRows = [
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `inf-b-${i}`,
          RecordProcessID: 'rp-infer-2',
          ProcessRunID: 'run-1',
          EntityID: 'ent-contacts',
          RecordID: `rec-${i}`,
          FeatureName: 'SeniorityScore',
          Role: 'Champion',
          AIModelID: 'model-llm',
          ValueNumeric: (i % 10) / 10,
          ValueText: null,
          Confidence: 0.9,
          Reasoning: null,
          ComputedAt: new Date(fourteenDaysAgoMs + i * 60_000).toISOString(),
        })),
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `inf-e-${i}`,
          RecordProcessID: 'rp-infer-2',
          ProcessRunID: 'run-2',
          EntityID: 'ent-contacts',
          RecordID: `rec-e-${i}`,
          FeatureName: 'SeniorityScore',
          Role: 'Champion',
          AIModelID: 'model-llm',
          ValueNumeric: (i % 10) / 10,
          ValueText: null,
          Confidence: 0.9,
          Reasoning: null,
          ComputedAt: new Date(twoDaysAgoMs + i * 60_000).toISOString(),
        })),
      ];

      let capturedProcessQuery: RunViewParams | undefined;
      const savedNotifications: Array<{ Title: string; Message: string }> = [];
      const runViewsBatchSizes: number[] = [];

      const runView = async (viewParams: RunViewParams): Promise<RunViewResult> => {
        if (viewParams.EntityName === 'MJ: Record Processes') {
          capturedProcessQuery = viewParams;
          const processes = [
            { ID: 'rp-ml-1', Name: 'Alpha ML Scorer', WorkType: 'ML Model', Status: 'Active' },
            { ID: 'rp-infer-2', Name: 'Beta Infer Pipeline', WorkType: 'Infer', Status: 'Active' },
          ];
          return {
            Success: true,
            Results: processes,
            RowCount: processes.length,
            TotalRowCount: processes.length,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        const filter = String(viewParams.ExtraFilter ?? '');
        const results = filter.includes("'rp-ml-1'") ? driftedRows : stableRows;
        return {
          Success: true,
          Results: results,
          RowCount: results.length,
          TotalRowCount: results.length,
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      };

      const fakeProvider = {
        RunView: runView,
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => {
          runViewsBatchSizes.push(views.length);
          return Promise.all(views.map((v) => runView(v)));
        },
        GetEntityObject: async <T>() => {
          const notif = {
            ID: `notif-sweep-${savedNotifications.length + 1}`,
            UserID: '',
            Title: '',
            Message: '',
            Unread: false,
            LatestResult: null,
            NewRecord: () => true,
            Save: async () => {
              savedNotifications.push({ Title: notif.Title, Message: notif.Message });
              return true;
            },
          };
          return notif as T;
        },
      } as Pick<IMetadataProvider, 'RunView' | 'RunViews' | 'GetEntityObject'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({});
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(capturedProcessQuery).toBeDefined();
      expect(capturedProcessQuery?.ExtraFilter).toBe("Status = 'Active' AND WorkType IN ('ML Model', 'Infer')");
      expect(capturedProcessQuery?.OrderBy).toBe('Name ASC, ID ASC');

      expect(getOutput(runParams, 'OverallSeverity')).toBe('Critical');
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
      expect(getOutput(runParams, 'AlertID')).toBe('notif-sweep-1');
      // Only the drifted process ('rp-ml-1') emits an alert
      expect(savedNotifications).toHaveLength(1);

      const processResults = getOutput(runParams, 'ProcessResults') as Array<{
        RecordProcessID: string;
        OverallSeverity: string;
      }>;
      expect(processResults).toHaveLength(2);
      expect(processResults[0]?.RecordProcessID).toBe('rp-ml-1');
      expect(processResults[0]?.OverallSeverity).toBe('Critical');
      expect(processResults[1]?.RecordProcessID).toBe('rp-infer-2');
      expect(processResults[1]?.OverallSeverity).toBe('None');
      // Both processes' Feature Values come from one batched RunViews, never a read per process.
      expect(runViewsBatchSizes).toEqual([2]);
    });

    it('keeps sweeping when one record process cannot be read, and reports that process as not evaluated', async () => {
      const fakeProvider = {
        RunView: async (viewParams: RunViewParams): Promise<RunViewResult> => {
          const processes = [
            { ID: 'rp-broken', Name: 'Broken', WorkType: 'ML Model', Status: 'Active' },
            { ID: 'rp-ok', Name: 'Healthy', WorkType: 'Infer', Status: 'Active' },
          ];
          return { Success: true, Results: viewParams.EntityName === 'MJ: Record Processes' ? processes : [], RowCount: 2, TotalRowCount: 2, ExecutionTime: 1, ErrorMessage: '' };
        },
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> =>
          views.map((v) =>
            String(v.ExtraFilter ?? '').includes("'rp-broken'")
              ? { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: 'timeout' }
              : { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' },
          ),
      } as Pick<IMetadataProvider, 'RunView' | 'RunViews'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({ EmitAlertOnDrift: { value: false } });
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      const processResults = getOutput(runParams, 'ProcessResults') as Array<{ RecordProcessID: string; ErrorMessage?: string }>;
      expect(processResults.map((p) => p.RecordProcessID)).toEqual(['rp-broken', 'rp-ok']);
      expect(processResults[0]?.ErrorMessage).toContain('timeout');
      expect(processResults[1]?.ErrorMessage).toBeUndefined();
      expect(String(getOutput(runParams, 'Summary'))).toContain('ProcessesFailed=1');
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

    it('should return MISSING_PARAMETER when an explicit target parameter (RecordProcessID or ModelID) is passed with a blank value (R2)', async () => {
      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        RecordProcessID: { value: '   ' },
      });
      const result = await action.Run(runParams);
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('routes alerts to NotifyUserID when provided and populates process name/ID and resource fields (S3)', async () => {
      const savedNotifications: Array<{
        UserID: string;
        Title: string;
        Message: string;
        ResourceTypeID?: string;
        ResourceRecordID?: string;
        ResourceConfiguration?: string;
      }> = [];

      const fakeProvider = {
        RunView: async (viewParams: RunViewParams): Promise<RunViewResult> => {
          if (viewParams.EntityName === 'MJ: Record Processes') {
            return {
              Success: true,
              Results: [{ ID: 'rp-alert-1', Name: 'Customer Churn Predictor', WorkType: 'ML Model', Status: 'Active' }],
              RowCount: 1,
              TotalRowCount: 1,
              ExecutionTime: 1,
              ErrorMessage: '',
            };
          }
          // Return drifting rows so alert is triggered
          return {
            Success: true,
            Results: [
              ...Array.from({ length: 120 }, (_, i) => ({
                ID: `b-${i}`,
                RecordProcessID: 'rp-alert-1',
                ProcessRunID: 'run-1',
                EntityID: 'ent-1',
                RecordID: `r-${i}`,
                FeatureName: 'Score',
                Role: 'Champion',
                AIModelID: 'model-1',
                ValueNumeric: 0.1,
                ValueText: null,
                Confidence: 0.9,
                Reasoning: null,
                ComputedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
              })),
              ...Array.from({ length: 120 }, (_, i) => ({
                ID: `e-${i}`,
                RecordProcessID: 'rp-alert-1',
                ProcessRunID: 'run-2',
                EntityID: 'ent-1',
                RecordID: `r-e-${i}`,
                FeatureName: 'Score',
                Role: 'Champion',
                AIModelID: 'model-1',
                ValueNumeric: 0.99,
                ValueText: null,
                Confidence: 0.9,
                Reasoning: null,
                ComputedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
              })),
            ],
            RowCount: 240,
            TotalRowCount: 240,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        },
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> =>
          Promise.all(views.map((v) => fakeProvider.RunView(v))),
        GetEntityObject: async <T>() => {
          const notif = {
            ID: 'notif-admin-1',
            UserID: '',
            Title: '',
            Message: '',
            ResourceTypeID: '',
            ResourceRecordID: '',
            ResourceConfiguration: '',
            Unread: false,
            LatestResult: null,
            NewRecord: () => true,
            Save: async () => {
              savedNotifications.push({
                UserID: notif.UserID,
                Title: notif.Title,
                Message: notif.Message,
                ResourceTypeID: notif.ResourceTypeID,
                ResourceRecordID: notif.ResourceRecordID,
                ResourceConfiguration: notif.ResourceConfiguration,
              });
              return true;
            },
          };
          return notif as T;
        },
      } as Pick<IMetadataProvider, 'RunView' | 'RunViews' | 'GetEntityObject'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        NotifyUserID: { value: 'admin-target-uuid' },
      });
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
      expect(savedNotifications).toHaveLength(1);
      const notif = savedNotifications[0];
      expect(notif.UserID).toBe('admin-target-uuid');
      expect(notif.Title).toContain('Predictive Drift Alert');
      expect(notif.Title).toContain('Customer Churn Predictor (rp-alert-1)');
      expect(notif.Message).toContain('Customer Churn Predictor (rp-alert-1)');
      expect(notif.ResourceTypeID).toBe('DAAFCCEC-6A37-EF11-86D4-000D3A4E707E');
      expect(notif.ResourceRecordID).toBe('rp-alert-1');
      expect(JSON.parse(notif.ResourceConfiguration || '{}')).toEqual({
        EntityName: 'MJ: Record Processes',
        RecordID: 'rp-alert-1',
      });
    });

    it('suppresses alerts when executed by system user without NotifyUserID and logs warning (S3)', async () => {
      const savedNotifications: Array<{ UserID: string }> = [];

      const fakeProvider = {
        RunView: async (): Promise<RunViewResult> => ({
          Success: true,
          Results: [
            ...Array.from({ length: 120 }, (_, i) => ({
              ID: `b-${i}`,
              RecordProcessID: 'rp-alert-2',
              ProcessRunID: 'run-1',
              EntityID: 'ent-1',
              RecordID: `r-${i}`,
              FeatureName: 'Score',
              Role: 'Champion',
              AIModelID: 'model-1',
              ValueNumeric: 0.1,
              ValueText: null,
              Confidence: 0.9,
              Reasoning: null,
              ComputedAt: new Date(Date.now() - 14 * 86_400_000).toISOString(),
            })),
            ...Array.from({ length: 120 }, (_, i) => ({
              ID: `e-${i}`,
              RecordProcessID: 'rp-alert-2',
              ProcessRunID: 'run-2',
              EntityID: 'ent-1',
              RecordID: `r-e-${i}`,
              FeatureName: 'Score',
              Role: 'Champion',
              AIModelID: 'model-1',
              ValueNumeric: 0.99,
              ValueText: null,
              Confidence: 0.9,
              Reasoning: null,
              ComputedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            })),
          ],
          RowCount: 240,
          TotalRowCount: 240,
          ExecutionTime: 1,
          ErrorMessage: '',
        }),
        GetEntityObject: async <T>() => {
          const notif = {
            ID: 'notif-sys',
            UserID: '',
            NewRecord: () => true,
            Save: async () => {
              savedNotifications.push({ UserID: notif.UserID });
              return true;
            },
          };
          return notif as T;
        },
      } as Pick<IMetadataProvider, 'RunView' | 'GetEntityObject'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        RecordProcessID: { value: 'rp-alert-2' },
      });
      // System user as context user without NotifyUserID
      runParams.ContextUser = { ID: 'system-user-uuid', Name: 'System', Type: 'System' } as unknown as UserInfo;
      runParams.Provider = fakeProvider;

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(false);
      expect(savedNotifications).toHaveLength(0);
    });

    it('passes MaxRows to the drift loader (S9)', async () => {
      let capturedMaxRows: number | undefined;

      const fakeProvider = {
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
          capturedMaxRows = params.MaxRows;
          return {
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        },
      } as Pick<IMetadataProvider, 'RunView'> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        RecordProcessID: { value: 'rp-maxrows-test' },
        MaxRows: { value: 5000 },
        EmitAlertOnDrift: { value: false },
      });
      runParams.Provider = fakeProvider;

      await action.Run(runParams);
      expect(capturedMaxRows).toBe(5000);
    });
  });
});
