/**
 * Gate G7.7 "W1 -> C3.2" (owner PR 5 B4):
 * - On W1-signal and C1, only random search is enabled by default; enabling bayesian without a passing equal-cost
 *   comparison row is refused by MJMLEvaluationProtocolEntityServer AND ExperimentOrchestrator, 1 of 1.
 * - Attack 3 live check across every writer of `Passed` on `MJ: ML Search Strategy Comparisons`:
 *   GraphQL create with `Passed = true` and `LowerBoundMin = -0.1` is refused and stores nothing;
 *   valid create with `LowerBoundMin = -0.1` stores `Passed = false`;
 *   GraphQL update flipping `Passed = true` is refused and leaves stored `Passed = false`;
 *   `Update Record` Action flipping `Passed = true` is refused and leaves stored `Passed = false`.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLSearchStrategyComparisonEntity } from '@memberjunction/core-entities';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { EvaluationProtocolRules, type Actor, type HoldoutSplit, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { ExperimentOrchestrator, SearchPolicyRefusedError } from '@memberjunction/predictive-studio';
import type { TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';

const UPDATE_RECORD_ACTION = 'Update Record';
const COMPARISON_ENTITY_NAME = 'MJ: ML Search Strategy Comparisons';
const MISSING_COMPARISON_ID = 'D4444444-4444-4444-8444-444444444444';

interface GraphQLAttempt {
  readonly Saved: boolean;
  readonly Message: string;
  readonly CreatedId?: string;
}

class SearchComparisonWriters {
  public static AuthHeaders(provider: GraphQLDataProvider): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cfg = provider.ConfigData;
    if (cfg.Token) headers['Authorization'] = `Bearer ${cfg.Token}`;
    if (cfg.MJAPIKey) headers['x-mj-api-key'] = cfg.MJAPIKey;
    return headers;
  }

  public static async GraphQLCreate(
    provider: GraphQLDataProvider,
    input: {
      readonly Method: string;
      readonly ComputeBudgetSecondsPerArm: number;
      readonly Datasets: string;
      readonly PairedDifference: string;
      readonly LowerBoundMin: number;
      readonly Passed: boolean;
      readonly ComparedAt: string;
      readonly ComparedByUserID: string;
    },
  ): Promise<GraphQLAttempt> {
    const query = `mutation CreateMJMLSearchStrategyComparison($input: CreateMJMLSearchStrategyComparisonInput!) {
      CreateMJMLSearchStrategyComparison(input: $input) { ID Passed LowerBoundMin }
    }`;
    const response = await fetch(provider.ConfigData.URL, {
      method: 'POST',
      headers: SearchComparisonWriters.AuthHeaders(provider),
      body: JSON.stringify({ query, variables: { input } }),
    });
    const body = (await response.json()) as {
      data?: { CreateMJMLSearchStrategyComparison?: { ID?: string; Passed?: boolean } | null };
      errors?: Array<{ message?: string }>;
    };
    const created = body.data?.CreateMJMLSearchStrategyComparison;
    const message = (body.errors ?? []).map((e) => e.message ?? '').join('; ');
    return {
      Saved: response.ok && Boolean(created?.ID) && (body.errors?.length ?? 0) === 0,
      Message: message,
      CreatedId: created?.ID,
    };
  }

  public static async GraphQLUpdatePassed(provider: GraphQLDataProvider, id: string, passed: boolean): Promise<GraphQLAttempt> {
    const query = `mutation UpdateMJMLSearchStrategyComparison($input: UpdateMJMLSearchStrategyComparisonInput!) {
      UpdateMJMLSearchStrategyComparison(input: $input) { ID Passed }
    }`;
    const response = await fetch(provider.ConfigData.URL, {
      method: 'POST',
      headers: SearchComparisonWriters.AuthHeaders(provider),
      body: JSON.stringify({ query, variables: { input: { ID: id, Passed: passed } } }),
    });
    const body = (await response.json()) as {
      data?: { UpdateMJMLSearchStrategyComparison?: { ID?: string; Passed?: boolean } | null };
      errors?: Array<{ message?: string }>;
    };
    const updated = body.data?.UpdateMJMLSearchStrategyComparison;
    const message = (body.errors ?? []).map((e) => e.message ?? '').join('; ');
    return {
      Saved: response.ok && Boolean(updated?.ID) && (body.errors?.length ?? 0) === 0,
      Message: message,
    };
  }

  public static async UpdateRecordActionPassed(h: TruthHarness, id: string, passed: boolean): Promise<GraphQLAttempt> {
    const rv = await RunView.FromMetadataProvider(h.Provider).RunView<{ ID: string; Name: string }>(
      { EntityName: 'MJ: Actions', ExtraFilter: `Name='${EscapeSQLString(UPDATE_RECORD_ACTION)}'`, Fields: ['ID', 'Name'], ResultType: 'simple' },
      h.User,
    );
    const actionId = rv.Results[0]?.ID;
    if (!rv.Success || !actionId) {
      throw new Error(`G7.7: Action '${UPDATE_RECORD_ACTION}' not found`);
    }
    const r = await new GraphQLActionClient(h.Provider).RunAction(
      actionId,
      [
        { Name: 'EntityName', Value: COMPARISON_ENTITY_NAME, Type: 'Input' },
        { Name: 'PrimaryKey', Value: JSON.stringify({ ID: id }), Type: 'Input' },
        { Name: 'Fields', Value: JSON.stringify({ Passed: passed }), Type: 'Input' },
      ],
      true,
    );
    return { Saved: r.Success, Message: r.Success ? '' : r.Message || 'Update Record failed without message' };
  }

  public static async ReadStoredPassed(h: TruthHarness, id: string): Promise<boolean> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLSearchStrategyComparisonEntity, 'ID' | 'Passed'>>(
      { EntityName: COMPARISON_ENTITY_NAME, ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID', 'Passed'], ResultType: 'simple', BypassCache: true },
      h.User,
    );
    if (!r.Success || !r.Results[0]) {
      throw new Error(`G7.7: failed to read comparison ${id}: ${r.ErrorMessage || 'missing row'}`);
    }
    return Boolean(r.Results[0].Passed);
  }
}

export const PsGateW1C32Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-c3-2.G7.7',
    Name: 'G7.7 W1 -> C3.2: only random is enabled on W1-signal and C1; enabling bayesian without a passing comparison -> refused, and Passed cannot be forged',
    RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      if (!(h.Provider instanceof GraphQLDataProvider)) {
        throw new Error('G7.7 requires a GraphQLDataProvider');
      }

      const datasetsJson = JSON.stringify([
        { Dataset: 'W1-signal', Seeds: [42, 43] },
        { Dataset: 'C1', Seeds: [1, 2] },
      ]);
      const failingPairedJson = JSON.stringify({
        'W1-signal': { value: -0.05, ci: [-0.1, 0.0], beats: false },
        'C1': { value: 0.04, ci: [0.02, 0.06], beats: true },
      });

      const createdComparisonIds: string[] = [];
      let createdProtocolId: string | null = null;
      try {
        // 1. Attack 3: GraphQL create with Passed=true and LowerBoundMin=-0.1 must be refused and store nothing.
        const forgedCreate = await SearchComparisonWriters.GraphQLCreate(h.Provider, {
          Method: 'bayesian',
          ComputeBudgetSecondsPerArm: 120,
          Datasets: datasetsJson,
          PairedDifference: failingPairedJson,
          LowerBoundMin: -0.1,
          Passed: true,
          ComparedAt: new Date().toISOString(),
          ComparedByUserID: h.User.ID,
        });
        if (forgedCreate.CreatedId) createdComparisonIds.push(forgedCreate.CreatedId);

        // 2. Valid create with LowerBoundMin=-0.1 and Passed=false stores Passed=false.
        const validCreate = await SearchComparisonWriters.GraphQLCreate(h.Provider, {
          Method: 'bayesian',
          ComputeBudgetSecondsPerArm: 120,
          Datasets: datasetsJson,
          PairedDifference: failingPairedJson,
          LowerBoundMin: -0.1,
          Passed: false,
          ComparedAt: new Date().toISOString(),
          ComparedByUserID: h.User.ID,
        });
        if (!validCreate.Saved || !validCreate.CreatedId) {
          throw new Error(`G7.7: baseline failing comparison row create failed: ${validCreate.Message}`);
        }
        const compId = validCreate.CreatedId;
        createdComparisonIds.push(compId);

        const storedAfterCreate = await SearchComparisonWriters.ReadStoredPassed(h, compId);

        // 3. Attack 3: GraphQL update flipping Passed=true must be refused and leave stored Passed=false.
        const gqlUpdate = await SearchComparisonWriters.GraphQLUpdatePassed(h.Provider, compId, true);
        const storedAfterGqlUpdate = await SearchComparisonWriters.ReadStoredPassed(h, compId);

        // 4. Attack 3: Update Record Action flipping Passed=true must be refused and leave stored Passed=false.
        const actionUpdate = await SearchComparisonWriters.UpdateRecordActionPassed(h, compId, true);
        const storedAfterActionUpdate = await SearchComparisonWriters.ReadStoredPassed(h, compId);

        // 5. G7.7: Enabling bayesian on W1-signal and C1 without a passing comparison -> refused on protocol save & orchestrator.
        const human: Actor = { kind: 'human', userId: h.User.ID };
        const seeded: HoldoutSplit = { kind: 'seeded-random', fraction: 0.25 };
        const w1Unit: PredictionUnitSpec = {
          id: 'U-G77',
          lineageRootId: 'U-G77',
          version: 1,
          name: 'w1-g77',
          rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] },
          label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 31, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
          censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2020-12-31' } },
          history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
          groupKey: null,
          temporal: null,
          decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
          incumbent: { kind: 'none' },
          authoredBy: human,
        };
        const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({
          Unit: w1Unit,
          Holdout: seeded,
          Candidates: 2,
          Seed: 42,
          Name: `G7.7 Protocol ${h.RunID}`,
        });
        const cols = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
          { ...draft, search: { kind: 'guided', method: 'bayesian', equalCostComparisonId: compId } },
          { ID: MISSING_COMPARISON_ID, LineageRootID: MISSING_COMPARISON_ID, Version: 1, AuthoredBy: human },
        );
        const protocolEntity = await h.Provider.GetEntityObject<MJMLEvaluationProtocolEntity>('MJ: ML Evaluation Protocols', h.User);
        protocolEntity.Name = cols.Name;
        protocolEntity.Version = 1;
        protocolEntity.Holdout = cols.Holdout;
        protocolEntity.InnerValidation = cols.InnerValidation;
        protocolEntity.PrimaryScore = cols.PrimaryScore;
        protocolEntity.Calibration = cols.Calibration;
        protocolEntity.Baselines = cols.Baselines;
        protocolEntity.Promotion = cols.Promotion;
        protocolEntity.LeakageAudit = cols.LeakageAudit;
        protocolEntity.Exclusions = cols.Exclusions;
        protocolEntity.Intervals = cols.Intervals;
        protocolEntity.Slices = cols.Slices;
        protocolEntity.PredictionIntervals = cols.PredictionIntervals;
        protocolEntity.ResidualDiagnostics = cols.ResidualDiagnostics;
        protocolEntity.RetrainTriggers = cols.RetrainTriggers;
        protocolEntity.SearchStrategy = cols.SearchStrategy;
        protocolEntity.Budgets = cols.Budgets;
        protocolEntity.MinMinorityClassRows = cols.MinMinorityClassRows;
        protocolEntity.GuardFieldsEditableBy = draft.guardFieldsEditableBy;
        protocolEntity.AuthoredBy = cols.AuthoredBy;
        const protocolSaved = await protocolEntity.Save();
        if (protocolSaved) {
          createdProtocolId = protocolEntity.ID;
        }

        // Verify ExperimentOrchestrator refuses guided bayesian against the live provider as well.
        let orchestratorRefused = false;
        try {
          await new ExperimentOrchestrator().runSession(
            {
              Goal: 'G7.7 gate refusal check',
              TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'roc_auc' },
              CandidateSources: [],
              CandidateFeatures: [],
              LeakageNotes: [],
              ProposedExperiments: [
                { Label: 'E1', AlgorithmName: 'logistic_regression', FeatureSet: [], Hyperparameters: {}, Priority: 1, Rationale: 'h' },
              ],
              ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
              ProposedBudget: {},
              Approved: true,
            },
            {
              entityFactory: { getEntityObject: (name, user) => h.Provider.GetEntityObject(name, user) },
              trainer: { train: async () => { throw new Error('trainer must not be called when search policy refuses'); } },
              clock: { now: () => Date.now() },
              contextUser: h.User,
              provider: h.Provider,
            },
            { searchStrategy: { kind: 'guided', method: 'bayesian', equalCostComparisonId: compId } },
          );
        } catch (err) {
          orchestratorRefused = err instanceof SearchPolicyRefusedError && err.Refusal.kind === 'comparison-not-passed';
        }

        const passed =
          !forgedCreate.Saved &&
          storedAfterCreate === false &&
          !gqlUpdate.Saved &&
          storedAfterGqlUpdate === false &&
          !actionUpdate.Saved &&
          storedAfterActionUpdate === false &&
          !protocolSaved &&
          orchestratorRefused;

        PsGate.Assert({
          Passed: passed,
          Measured: {
            forgedCreateRefused: !forgedCreate.Saved,
            storedAfterCreate,
            gqlUpdateRefused: !gqlUpdate.Saved,
            storedAfterGqlUpdate,
            actionUpdateRefused: !actionUpdate.Saved,
            storedAfterActionUpdate,
            protocolSaved,
            orchestratorRefused,
          },
          Detail: `G7.7: forgedCreateRefused=${!forgedCreate.Saved}, gqlUpdateRefused=${!gqlUpdate.Saved}, actionUpdateRefused=${!actionUpdate.Saved}, protocolRefused=${!protocolSaved}, orchestratorRefused=${orchestratorRefused}`,
        });
      } finally {
        if (createdProtocolId) {
          const p = await h.Provider.GetEntityObject<MJMLEvaluationProtocolEntity>('MJ: ML Evaluation Protocols', h.User);
          if (await p.Load(createdProtocolId)) await p.Delete();
        }
        for (const id of createdComparisonIds) {
          const c = await h.Provider.GetEntityObject<MJMLSearchStrategyComparisonEntity>(COMPARISON_ENTITY_NAME, h.User);
          if (await c.Load(id)) await c.Delete();
        }
      }
    },
  },
];

for (const c of PsGateW1C32Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-c3-2', PsGate.Lifecycle);
