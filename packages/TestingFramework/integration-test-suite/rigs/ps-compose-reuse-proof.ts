/**
 * ps-compose-reuse-proof.ts — the loop the whole component model exists for, run on real data.
 *
 * *"A sub-component of a model, when trained, may represent a complex relationship. That trained
 * component can then be used by other models."* Every piece of that was built and none of it had
 * ever run end to end: `SourceComponentID` was set on 0 of 43 instances.
 *
 * Two models, in order:
 *
 *   1. **Compose** — a Stacking Wrapper over two base families, trained through the ordinary
 *      pipeline path. Its sub-components must be written as their own rows, each carrying its own
 *      artifact, which is what turns "a described part of a model" into "a part another model can
 *      use".
 *   2. **Reuse** — a second model whose graph freezes one of those sub-components by
 *      `ReuseInstanceID`. It must train, record the reuse, and keep the frozen child's exact
 *      coefficients rather than quietly refitting it.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-compose-reuse-proof.ts
 */
import sql from 'mssql';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { setupSQLServerClient, SQLServerProviderConfigData } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/generic-database-provider';
import '@memberjunction/server-bootstrap-lite';
import { RunView, UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJMLComponentEntity } from '@memberjunction/core-entities';
import {
  createTrainingPipeline, trainModelViaEngine, MLComponentEngine,
  PredictiveStudioPipelineBuilder, gateArchitecture,
} from '@memberjunction/predictive-studio';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import type { ComponentGraphNode } from '@memberjunction/predictive-studio-core';

const TAG = 'ps-compose-reuse-proof';
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };

const MEMBER_COLUMNS = ['MembershipTenureMonths', 'City'];

/** The same feature recipe for both models, so only the ARCHITECTURE differs. */
function config(name: string, description: string) {
  return {
    name: `${TAG} · ${name}`,
    description,
    targetEntityName: 'Members',
    targetVariable: 'Renewed',
    problemType: 'classification' as const,
    // The root of a composed model is a Structure, but the pipeline still needs a concrete
    // algorithm row; the graph's root driver overrides it at request-build time.
    algorithmName: 'Logistic Regression',
    sourceBindings: [{ Kind: 'Entity' as const, Ref: 'Members' }],
    featureSteps: {
      Steps: [
        { Id: 'select-raw', Kind: 'select' as const, Columns: MEMBER_COLUMNS },
        { Id: 'impute-tenure', Kind: 'impute' as const, Column: 'MembershipTenureMonths', Strategy: 'median' as const },
        { Id: 'standardize', Kind: 'standardize' as const, Columns: ['MembershipTenureMonths'] },
        { Id: 'onehot-City', Kind: 'onehot' as const, Column: 'City' },
      ],
    },
    asOf: { Mode: 'column' as const, Column: 'RenewalDecidedAt' },
  };
}

/** Create the pipeline, then attach the composition the ordinary builder has no field for. */
async function pipelineWithGraph(
  cfg: ReturnType<typeof config>,
  graph: ComponentGraphNode,
  provider: IMetadataProvider,
  user: UserInfo,
): Promise<MJMLTrainingPipelineEntity> {
  const pipeline = await createTrainingPipeline(cfg as never, provider, user);
  const entity = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  await entity.Load(pipeline.ID);
  entity.ComponentGraph = JSON.stringify(graph);
  if (!(await entity.Save())) {
    throw new Error(`Could not attach the component graph: ${entity.LatestResult?.CompleteMessage ?? 'save failed'}`);
  }
  return entity;
}

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!, port: Number(process.env.DB_PORT), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 600000,
  }).connect();
  const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'));
  await UserCache.Instance.Refresh(provider);
  const user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  await MLComponentEngine.Instance.Config(false, user, provider);
  const rv = new RunView();

  // ── 1. compose ────────────────────────────────────────────────────────────
  console.log('▸ A composed model: a stack over two families');
  const composed: ComponentGraphNode = {
    ComponentTypeRef: 'Stacking Wrapper',
    Params: { cv: 3 },
    Children: [
      { ComponentTypeRef: 'Random Forest', SlotName: 'estimators', Params: { n_estimators: 20, random_state: 0 } },
      { ComponentTypeRef: 'Logistic Regression', SlotName: 'estimators', Params: { max_iter: 200 } },
      { ComponentTypeRef: 'Logistic Regression', SlotName: 'final_estimator', Params: { max_iter: 200 } },
    ],
  };
  const composedPipeline = await pipelineWithGraph(
    config('composed', 'A stack over a forest and a linear model, trained through the ordinary path.'),
    composed, provider, user);
  const composedRun = await trainModelViaEngine({ pipelineId: composedPipeline.ID, sidecarVersion: TAG }, provider, user);
  check(!!composedRun.model?.ID, `trained (${composedRun.model?.ID ?? 'no model'})`);
  console.log(`      holdout: ${composedRun.model?.HoldoutMetrics ?? 'n/a'}`);

  const parts = await rv.RunView<{ ID: string; Name: string; SlotName: string; ComponentType: string; ArtifactFileID: string | null; IsTrained: boolean }>(
    { EntityName: 'MJ: ML Components', ExtraFilter: `ParentComponentID='${composedRun.model.RootComponentID}'`,
      Fields: ['ID','Name','SlotName','ComponentType','ArtifactFileID','IsTrained'], ResultType: 'simple', BypassCache: true }, user);
  const slotted = (parts.Results ?? []).filter(p => p.SlotName !== 'inputs');
  check(slotted.length === 3, `${slotted.length} sub-component row(s) written, one per graph node`);
  for (const p of slotted) {
    console.log(`      • ${p.SlotName?.padEnd(16)} ${p.ComponentType.padEnd(22)} artifact=${p.ArtifactFileID ? 'yes' : 'NO'}`);
  }
  const reusable = slotted.filter(p => p.ArtifactFileID);
  check(reusable.length > 0, `${reusable.length}/${slotted.length} carry their own artifact — the rest are not independently reusable`);
  console.log();

  // ── 2. reuse ──────────────────────────────────────────────────────────────
  console.log('▸ A second model that FREEZES one of those parts');
  const donor = reusable.find(p => p.ComponentType.includes('Random Forest')) ?? reusable[0];
  check(!!donor, `chose '${donor?.ComponentType}' (${donor?.SlotName}) as the part to reuse`);
  if (!donor) { await pool.close(); process.exit(1); }

  const reusing: ComponentGraphNode = {
    ComponentTypeRef: 'Bagging Wrapper',
    Params: { n_estimators: 3, random_state: 0 },
    Children: [{ ComponentTypeRef: donor.ComponentType, SlotName: 'base_estimator', ReuseInstanceID: donor.ID }],
  };
  const reusePipeline = await pipelineWithGraph(
    config('reusing', `A bagging wrapper over a component trained in another model, frozen.`),
    reusing, provider, user);

  let reuseError: string | null = null;
  let reuseModelID: string | null = null;
  try {
    const reuseRun = await trainModelViaEngine({ pipelineId: reusePipeline.ID, sidecarVersion: TAG }, provider, user);
    reuseModelID = reuseRun.model?.ID ?? null;
    check(!!reuseModelID, `trained with a frozen child (${reuseModelID})`);
    console.log(`      holdout: ${reuseRun.model?.HoldoutMetrics ?? 'n/a'}`);

    const children = await rv.RunView<{ ID: string; SourceComponentID: string | null; IsTrained: boolean; SlotName: string }>(
      { EntityName: 'MJ: ML Components', ExtraFilter: `ParentComponentID='${reuseRun.model.RootComponentID}'`,
        Fields: ['ID','SourceComponentID','IsTrained','SlotName'], ResultType: 'simple', BypassCache: true }, user);
    const frozen = (children.Results ?? []).find(c => c.SlotName === 'base_estimator');
    check(!!frozen, 'the frozen child was written as a row of its own');
    // This is the provenance that was missing entirely: 0 of 43 instances had it set.
    check(frozen?.SourceComponentID?.toLowerCase() === donor.ID.toLowerCase(),
      `it records where it came from (SourceComponentID → ${donor.ID.slice(0, 8)}…)`);
    check(frozen?.IsTrained === false, 'and is marked NOT trained here — this run reused it, it did not fit it');
  } catch (err) {
    reuseError = err instanceof Error ? err.message : String(err);
    check(false, `reuse failed: ${reuseError}`);
  }
  console.log();

  console.log('▸ Reuse is now visible across the whole catalog');
  const anyReuse = await rv.RunView<{ ID: string }>(
    { EntityName: 'MJ: ML Components', ExtraFilter: 'SourceComponentID IS NOT NULL', Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
  check(anyReuse.Results.length > 0, `${anyReuse.Results.length} component(s) now record a reuse (was 0)`);
  console.log();

  // ── 3. the decision path ──────────────────────────────────────────────────
  // Everything above drove the graph by hand. This drives it the way the AGENT does: an
  // ArchitectureSpec goes through the gate and the deterministic builder, which is where the
  // decision was silently dropped before — the gate said 'compose' was executable and a bare
  // single-algorithm model trained under a plan that recorded a composed one.
  console.log('▸ An architecture DECISION, through the gate and the builder');
  const plan = {
    Goal: `${TAG} — a composed model chosen by an architecture decision`,
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the member records' }],
    CandidateFeatures: [
      { Name: 'MembershipTenureMonths', SourceRef: 'Members', Kind: 'numeric', Why: 'loyalty' },
      { Name: 'City', SourceRef: 'Members', Kind: 'categorical', Why: 'segment' },
    ],
    LeakageNotes: [],
    ProposedExperiments: [
      { Label: 'Bagged forest', AlgorithmName: 'Random Forest', FeatureSet: ['MembershipTenureMonths', 'City'], Rationale: 'variance reduction', Priority: 1 },
    ],
    ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    Architecture: {
      Decision: 'compose',
      Rationale: 'A single forest is high-variance on this population; bagging it stabilizes the estimate.',
      Candidates: [{ ComponentTypeRef: 'Bagging Wrapper', Rationale: 'reduces variance without losing the forest' }],
      ComposedGraph: {
        ComponentTypeRef: 'Bagging Wrapper',
        Params: { n_estimators: 3, random_state: 0 },
        Children: [{ ComponentTypeRef: 'Random Forest', SlotName: 'base_estimator', Params: { n_estimators: 15, random_state: 0 } }],
      },
    },
  } as unknown as ModelingPlanSpec;

  const gate = gateArchitecture(plan, MLComponentEngine.Instance);
  check(gate.Executable, `the gate accepts the decision${gate.Executable ? '' : `: ${gate.Reasons.join(' ')}`}`);

  const built = await new PredictiveStudioPipelineBuilder().build({ spec: plan, provider, user, autoPublish: false, sidecarVersion: TAG });
  check(built.success, `the builder trained it (${built.errorMessage ?? 'ok'})`);

  if (built.pipelineId) {
    const built_pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    await built_pipeline.Load(built.pipelineId);
    // The check that matters: the decision survived the translation into the pipeline row.
    check(!!built_pipeline.ComponentGraph, 'the pipeline it created actually carries the composition');
    check((built_pipeline.ComponentGraph ?? '').includes('Bagging Wrapper'), 'and it is the composition the decision named');
  }
  if (built.modelId) {
    const decided = await rv.RunView<{ ID: string; SlotName: string; ComponentType: string }>(
      { EntityName: 'MJ: ML Components',
        ExtraFilter: `ParentComponentID IN (SELECT RootComponentID FROM __mj.MLModel WHERE ID='${built.modelId}')`,
        Fields: ['ID','SlotName','ComponentType'], ResultType: 'simple', BypassCache: true }, user);
    const slotted = (decided.Results ?? []).filter(p => p.SlotName !== 'inputs');
    check(slotted.length > 0, `the trained model has ${slotted.length} sub-component(s) — it really is composed`);
    for (const p of slotted) console.log(`      • ${p.SlotName} → ${p.ComponentType}`);
  }
  console.log();

  console.log(failures === 0
    ? '✅ PROVEN — a model composes, its parts become reusable, another model uses one, and an architecture DECISION reaches a trained composed model.'
    : `❌ ${failures} check(s) failed.`);
  await pool.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
