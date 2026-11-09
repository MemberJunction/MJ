import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { ResourceTypeEngine, type MJResourceTypeEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal } from '@memberjunction/global';
import {
  EVALUATE_DRIFT_DRIVER_CLASS,
  EvaluateFeatureAndPredictionDriftAction,
  type IDriftAlertEmitter,
} from '../evaluate-drift.action';
import type { FeatureAndPredictionDriftReport } from '../../maintenance/psi-drift-detector';
import { RunFeatureValueView, type FeatureValueDoubleRow } from '../../__tests__/feature-value-view-double';

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
  let byNameSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // Alerts resolve the Records resource type by name; no test loads the real engine.
    vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
    byNameSpy = vi
      .spyOn(ResourceTypeEngine.Instance, 'ByName')
      .mockImplementation((name: string) => (name === 'Records' ? ({ ID: 'rt-records', Name: 'Records' } as MJResourceTypeEntity) : undefined));
  });
  afterEach(() => {
    vi.restoreAllMocks();
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
        // The alert reads its Record Process by ID; this caller cannot see it.
        RunView: async (): Promise<RunViewResult> => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' }),
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => views.map((v) => RunFeatureValueView(rows, v)),
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
      } as Partial<IMetadataProvider> as IMetadataProvider;

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
          // The first read is the sweep's; an alert then reads its own process by ID.
          capturedProcessQuery ??= viewParams;
          const idMatch = /^ID = '([^']+)'$/.exec(String(viewParams.ExtraFilter ?? ''));
          const processes = [
            { ID: 'rp-ml-1', Name: 'Alpha ML Scorer', WorkType: 'ML Model', Status: 'Active' },
            { ID: 'rp-infer-2', Name: 'Beta Infer Pipeline', WorkType: 'Infer', Status: 'Active' },
          ].filter((p) => !idMatch || p.ID === idMatch[1]);
          return {
            Success: true,
            Results: processes,
            RowCount: processes.length,
            TotalRowCount: processes.length,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return RunFeatureValueView([...driftedRows, ...stableRows], viewParams);
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
      } as unknown as IMetadataProvider;

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
      // Only the drifted process ('rp-ml-1') emits an alert, titled from its stored name
      expect(savedNotifications).toHaveLength(1);
      expect(savedNotifications[0].Title).toBe("Predictive Drift Alert (Critical): Record Process 'Alpha ML Scorer'");

      const processResults = getOutput(runParams, 'ProcessResults') as Array<{
        RecordProcessID: string;
        OverallSeverity: string;
        Truncated: boolean;
      }>;
      expect(processResults).toHaveLength(2);
      expect(processResults[0]?.RecordProcessID).toBe('rp-ml-1');
      expect(processResults[0]?.OverallSeverity).toBe('Critical');
      expect(processResults[1]?.RecordProcessID).toBe('rp-infer-2');
      expect(processResults[1]?.OverallSeverity).toBe('None');
      expect(processResults.map((p) => p.Truncated)).toEqual([false, false]);
      // Both processes' Feature Values (two windows each) come from one batched RunViews, never a read per process.
      expect(runViewsBatchSizes).toEqual([4]);
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
      } as unknown as IMetadataProvider;

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

    it('passes MaxRows to the drift loader as a per-window cap, fetching one row over it (S9, P2)', async () => {
      const captured: RunViewParams[] = [];
      const fakeProvider = {
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => {
          captured.push(...views);
          return views.map((v) => RunFeatureValueView([], v));
        },
      } as Partial<IMetadataProvider> as IMetadataProvider;

      const action = new EvaluateFeatureAndPredictionDriftAction();
      const runParams = buildRunParams({
        RecordProcessID: { value: 'rp-maxrows-test' },
        MaxRows: { value: 5000 },
        EmitAlertOnDrift: { value: false },
      });
      runParams.Provider = fakeProvider;

      await action.Run(runParams);
      expect(captured.map((v) => v.MaxRows)).toEqual([5001, 5001]);
    });

    it('rejects MaxRows <= 0 with INVALID_PARAMETER, for one process and for the sweep (P2)', async () => {
      const fakeProvider = {
        RunView: async (): Promise<RunViewResult> => ({
          Success: true,
          Results: [{ ID: 'rp-1', Name: 'One', WorkType: 'ML Model', Status: 'Active' }],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        }),
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => views.map((v) => RunFeatureValueView([], v)),
      } as Partial<IMetadataProvider> as IMetadataProvider;

      for (const target of [{ RecordProcessID: { value: 'rp-1' } }, {}]) {
        const runParams = buildRunParams({ ...target, MaxRows: { value: 0 }, EmitAlertOnDrift: { value: false } });
        runParams.Provider = fakeProvider;
        const result = await new EvaluateFeatureAndPredictionDriftAction().Run(runParams);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_PARAMETER');
      }
    });

    it('reports a process whose window exceeded MaxRows as Truncated on its process result (P2)', async () => {
      const nowMs = Date.now();
      const row = (rp: string, id: string, computedAt: number) => ({
        ID: id, RecordProcessID: rp, EntityID: 'ent-1', RecordID: id, FeatureName: 'Score', Role: 'Champion',
        Source: 'Pipeline', ValueNumeric: 0.5, ValueText: null, Confidence: 0.9, Reasoning: null,
        ComputedAt: new Date(computedAt).toISOString(),
      });
      const rows = [
        ...Array.from({ length: 31 }, (_, i) => row('rp-big', `big-${i}`, nowMs - 2 * 86_400_000 + i * 60_000)),
        ...Array.from({ length: 30 }, (_, i) => row('rp-full', `full-${i}`, nowMs - 2 * 86_400_000 + i * 60_000)),
      ];
      const fakeProvider = {
        RunView: async (): Promise<RunViewResult> => ({
          Success: true,
          Results: [
            { ID: 'rp-big', Name: 'Big', WorkType: 'ML Model', Status: 'Active' },
            { ID: 'rp-full', Name: 'Exactly Full', WorkType: 'Infer', Status: 'Active' },
          ],
          RowCount: 2,
          TotalRowCount: 2,
          ExecutionTime: 1,
          ErrorMessage: '',
        }),
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => views.map((v) => RunFeatureValueView(rows, v)),
      } as Partial<IMetadataProvider> as IMetadataProvider;

      const runParams = buildRunParams({ MaxRows: { value: 30 }, EmitAlertOnDrift: { value: false } });
      runParams.Provider = fakeProvider;
      const result = await new EvaluateFeatureAndPredictionDriftAction().Run(runParams);
      expect(result.Success).toBe(true);
      const processResults = getOutput(runParams, 'ProcessResults') as Array<{ RecordProcessID: string; Truncated: boolean }>;
      expect(processResults.map((p) => [p.RecordProcessID, p.Truncated])).toEqual([
        ['rp-big', true],
        ['rp-full', false],
      ]);
    });
  });

  describe('Alert routing and content (P1)', () => {
    const SYSTEM = new UserInfo(null, { ID: UserCache.Instance.SYSTEM_USER_ID, Name: 'System', Type: 'User', IsActive: true });
    const OWNER = new UserInfo(null, { ID: 'owner-1', Name: 'Org Owner', Email: 'owner@example.com', Type: 'Owner', IsActive: true });
    const MEMBER = new UserInfo(null, { ID: 'member-1', Name: 'Regular Member', Email: 'member@example.com', Type: 'User', IsActive: true });
    const TARGET = new UserInfo(null, { ID: 'admin-target-uuid', Name: 'Alert Admin', Email: 'admin@example.com', Type: 'User', IsActive: true });
    const INACTIVE = new UserInfo(null, { ID: 'inactive-1', Name: 'Gone', Email: 'gone@example.com', Type: 'User', IsActive: false });
    // Named and emailed "system", but not the system user.
    const NAMED_SYSTEM = new UserInfo(null, { ID: 'named-system-1', Name: 'System', Email: 'system', Type: 'User', IsActive: true });

    interface SavedNotification {
      UserID: string;
      Title: string;
      Message: string;
      ResourceTypeID: string | null;
      ResourceRecordID: string | null;
      ResourceConfiguration: string | null;
    }
    interface StoredRows {
      Processes?: Array<{ ID: string; Name: string }>;
      Models?: Array<{ ID: string; Pipeline: string; Version: number }>;
    }

    /** 120 baseline rows at 0.1 and 120 evaluation rows at 0.99 of one record process / model: Critical drift. */
    function driftingRows(recordProcessId: unknown, mlModelId: unknown): Array<FeatureValueDoubleRow> {
      const nowMs = Date.now();
      const row = (id: string, value: number, computedAt: number) => ({
        ID: id, RecordProcessID: String(recordProcessId), MLModelID: mlModelId === undefined ? null : String(mlModelId), EntityID: 'ent-1', RecordID: id, FeatureName: 'Score', Role: 'Champion',
        Source: 'Pipeline', ValueNumeric: value, ValueText: null, Confidence: 0.9, Reasoning: null,
        ComputedAt: new Date(computedAt).toISOString(),
      });
      return [
        ...Array.from({ length: 120 }, (_, i) => row(`b-${i}`, 0.1, nowMs - 14 * 86_400_000 + i * 60_000)),
        ...Array.from({ length: 120 }, (_, i) => row(`e-${i}`, 0.99, nowMs - 2 * 86_400_000 + i * 60_000)),
      ];
    }

    /** Serves the stored Record Process / ML Model rows (by `ID = '…'`) and drifting Feature Values; captures saved notifications. */
    function alertProvider(
      stored: StoredRows,
      featureValues: FeatureValueDoubleRow[],
      saved: SavedNotification[],
      readsAs: Array<string | undefined>,
    ): IMetadataProvider {
      const view = async (v: RunViewParams, user?: UserInfo): Promise<RunViewResult> => {
        // Reads by `ID = '…'` or `ID IN ('…', …)`
        const ids = [...String(v.ExtraFilter ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
        const byId = <T extends { ID: string }>(rows: T[]): T[] => rows.filter((r) => ids.includes(r.ID.toLowerCase()));
        let results: unknown[] = [];
        if (v.EntityName === 'MJ: Record Processes') {
          readsAs.push(user?.ID);
          results = byId(stored.Processes ?? []);
        } else if (v.EntityName === 'MJ: ML Models') {
          readsAs.push(user?.ID);
          results = byId(stored.Models ?? []);
        } else if (v.EntityName === 'MJ: Feature Values') {
          results = RunFeatureValueView(featureValues, v).Results;
        }
        return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 1, ErrorMessage: '' };
      };
      return {
        RunView: view,
        RunViews: async (views: RunViewParams[], user?: UserInfo) => Promise.all(views.map((v) => view(v, user))),
        GetEntityObject: async <T>() => {
          const notif = {
            ID: `notif-${saved.length + 1}`,
            UserID: '',
            Title: '',
            Message: '',
            ResourceTypeID: null as string | null,
            ResourceRecordID: null as string | null,
            ResourceConfiguration: null as string | null,
            Unread: false,
            LatestResult: null,
            NewRecord: () => true,
            Save: async () => {
              saved.push({
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
      } as unknown as IMetadataProvider;
    }

    async function runAlert(
      caller: UserInfo,
      inputs: Record<string, { value: unknown }>,
      stored: StoredRows = { Processes: [{ ID: 'rp-alert-1', Name: 'Customer Churn Predictor' }] },
    ) {
      const saved: SavedNotification[] = [];
      const readsAs: Array<string | undefined> = [];
      const runParams = buildRunParams(inputs);
      runParams.ContextUser = caller;
      runParams.Provider = alertProvider(
        stored,
        driftingRows(inputs['RecordProcessID']?.value, inputs['ModelID']?.value),
        saved,
        readsAs,
      );
      const result = await new EvaluateFeatureAndPredictionDriftAction().Run(runParams);
      expect(result.Success).toBe(true);
      expect(getOutput(runParams, 'ShouldAlert')).toBe(true);
      return { saved, readsAs, runParams };
    }

    beforeEach(() => {
      UserCache.Instance.SetUsers([SYSTEM, OWNER, MEMBER, TARGET, INACTIVE, NAMED_SYSTEM]);
    });
    afterEach(() => {
      UserCache.Instance.SetUsers([]);
    });

    it('routes the alert to NotifyUserID when an Owner runs it, titled from the stored Record Process name and linked through the Records resource type', async () => {
      const { saved, readsAs } = await runAlert(OWNER, {
        RecordProcessID: { value: 'rp-alert-1' },
        NotifyUserID: { value: TARGET.ID },
      });
      expect(saved).toHaveLength(1);
      expect(saved[0].UserID).toBe(TARGET.ID);
      expect(saved[0].Title).toBe("Predictive Drift Alert (Critical): Record Process 'Customer Churn Predictor'");
      expect(saved[0].Message).toContain("Drift detected for Record Process 'Customer Churn Predictor'.");
      expect(saved[0].ResourceTypeID).toBe('rt-records');
      expect(byNameSpy).toHaveBeenCalledWith('Records');
      expect(saved[0].ResourceRecordID).toBe('rp-alert-1');
      expect(JSON.parse(saved[0].ResourceConfiguration ?? '{}')).toEqual({ EntityName: 'MJ: Record Processes', RecordID: 'rp-alert-1' });
      // The stored name is read as the caller.
      expect(readsAs).toEqual([OWNER.ID]);
    });

    it('routes the alert to NotifyUserID when the system user runs it (the scheduled job)', async () => {
      const { saved } = await runAlert(SYSTEM, { RecordProcessID: { value: 'rp-alert-1' }, NotifyUserID: { value: TARGET.ID } });
      expect(saved.map((n) => n.UserID)).toEqual([TARGET.ID]);
    });

    it('ignores NotifyUserID from a caller who is neither the system user nor an Owner, and notifies the caller', async () => {
      const { saved, runParams } = await runAlert(MEMBER, {
        RecordProcessID: { value: 'rp-alert-1' },
        NotifyUserID: { value: TARGET.ID },
      });
      expect(saved.map((n) => n.UserID)).toEqual([MEMBER.ID]);
      expect(getOutput(runParams, 'AlertEmitted')).toBe(true);
    });

    it('treats a user named and emailed "system" as an ordinary user: their NotifyUserID is ignored and they are notified themselves', async () => {
      const { saved } = await runAlert(NAMED_SYSTEM, {
        RecordProcessID: { value: 'rp-alert-1' },
        NotifyUserID: { value: TARGET.ID },
      });
      expect(saved.map((n) => n.UserID)).toEqual([NAMED_SYSTEM.ID]);
    });

    it('suppresses the alert for the system user without NotifyUserID, or with one naming no active user', async () => {
      const withoutTarget = await runAlert(SYSTEM, { RecordProcessID: { value: 'rp-alert-1' } });
      expect(withoutTarget.saved).toHaveLength(0);
      expect(getOutput(withoutTarget.runParams, 'AlertEmitted')).toBe(false);

      const inactiveTarget = await runAlert(SYSTEM, { RecordProcessID: { value: 'rp-alert-1' }, NotifyUserID: { value: INACTIVE.ID } });
      expect(inactiveTarget.saved).toHaveLength(0);

      const unknownTarget = await runAlert(SYSTEM, { RecordProcessID: { value: 'rp-alert-1' }, NotifyUserID: { value: 'no-such-user' } });
      expect(unknownTarget.saved).toHaveLength(0);
    });

    it('never puts input text in the title: a ModelID the caller cannot read gives a generic title and no link', async () => {
      const { saved } = await runAlert(MEMBER, { ModelID: { value: 'Click <a href="http://x">here</a>' } }, { Models: [] });
      expect(saved).toHaveLength(1);
      expect(saved[0].Title).toBe('Predictive Drift Alert (Critical): Predictive Studio');
      expect(saved[0].Message).not.toContain('Click');
      expect(saved[0].ResourceTypeID).toBeNull();
      expect(saved[0].ResourceRecordID).toBeNull();
    });

    it('titles a model-only alert from the stored ML Model row', async () => {
      const { saved } = await runAlert(MEMBER, { ModelID: { value: 'model-7' } }, {
        Models: [{ ID: 'model-7', Pipeline: 'Member Renewal', Version: 3 }],
      });
      expect(saved[0].Title).toBe("Predictive Drift Alert (Critical): ML Model 'Member Renewal' v3");
      expect(JSON.parse(saved[0].ResourceConfiguration ?? '{}')).toEqual({ EntityName: 'MJ: ML Models', RecordID: 'model-7' });
    });

    it('leaves the link off when no Records resource type is seeded', async () => {
      byNameSpy.mockReturnValue(undefined);
      const { saved } = await runAlert(MEMBER, { RecordProcessID: { value: 'rp-alert-1' } });
      expect(saved).toHaveLength(1);
      expect(saved[0].ResourceTypeID).toBeNull();
      expect(saved[0].ResourceRecordID).toBeNull();
      expect(saved[0].ResourceConfiguration).toBeNull();
    });
  });
});
