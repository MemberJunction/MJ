/**
 * Runtime check of the Prediction Unit pipeline migration, in-process against the database the harness resolves. It
 * copies a truth-suite W1 pipeline that has no unit (default: the one M11.2 provisioned, `PS_LEGACY_PIPELINE_ID`) into
 * five pipelines named `PR3 migration check …` with `PredictionUnitID`/`EvaluationProtocolID` NULL:
 *   (a) `AsOfStrategy {"Mode":"column","Column":"StartDate"}`, (b) `AsOfStrategy` NULL, (c) `{"Mode":"offset","OffsetDays":30}`,
 *   (d) a classification of `PS Truth: Scn_C2.Target` (two classes, a name with no polarity, no OutcomeConfig, no model),
 *   (e) like (b), migrated as of 2026-01-01.
 * Then it asserts, printing one JSON line per assertion and exiting non-zero on the first mismatch:
 *   1. a dry run over (a)–(d) predicts would-migrate / would-migrate / would-archive / would-hold and writes nothing;
 *   2. the real run gives the same four outcomes in their applied form, row for row;
 *   3. a second run skips (a)–(c) and holds (d) again without a second `Held by` line;
 *   4. training (b) creates no unit version 2 (same day); (e) migrated on 2026-01-01 trains under version 2 dated today,
 *      authored `decision-date-advance`;
 *   5. the legacy pipeline it copied is migrated by its own rules.
 * The rows are left for the Action run and the SQL checks; `--cleanup` deletes every `PR3 migration check` row (pipelines,
 * runs, models, snapshots, files, unit and protocol versions) through the entity layer.
 *
 * Usage (from the repo root, env exported, the truth sidecar in PREDICTIVE_STUDIO_SIDECAR_URL):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-pipeline-migration-check.ts
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-pipeline-migration-check.ts --cleanup
 *
 * Exit code: 0 = every assertion held (or cleanup done), 1 = an assertion failed or an error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import '@memberjunction/core-entities';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { ADVERSE_CLASS_HOLD_REASON, PredictionUnit, UtcDay } from '@memberjunction/predictive-studio-core';
import { MetadataEntityFactory, PipelineMigration, TrainingDelegation, type MigrationDeps, type MigrationReportRow } from '@memberjunction/predictive-studio';
import { HarnessCleanup, RunRecords } from '@memberjunction/predictive-studio-truth-suite';
import { ActivateStorage, RestoreStorage } from './ps-train-pipeline-check';

const PREFIX = 'PR3 migration check';
const LEGACY_PIPELINE_ID = process.env.PS_LEGACY_PIPELINE_ID || '50616EEC-34BB-4E7C-B3DA-5CFF94E1ECF2';
const C2_ENTITY = 'PS Truth: Scn_C2';

/** Prints one assertion as a JSON line; a failed one ends the run. */
function check(step: string, ok: boolean, measured: object): void {
  console.log(JSON.stringify({ step, ok, ...measured }));
  if (!ok) throw new Error(`assertion failed: ${step}`);
}

async function loadPipeline(provider: IMetadataProvider, user: UserInfo, id: string): Promise<MJMLTrainingPipelineEntity> {
  const p = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  if (!(await p.Load(id))) throw new Error(`pipeline ${id} not found`);
  return p;
}

/** A unit-less copy of the template under `name`, with the given overrides. */
async function copyPipeline(
  provider: IMetadataProvider, user: UserInfo, template: MJMLTrainingPipelineEntity, name: string,
  over: Partial<Pick<MJMLTrainingPipelineEntity, 'AsOfStrategy' | 'TargetEntityID' | 'TargetVariable' | 'FeatureSteps' | 'SourceBindings' | 'LeakageGuard'>>,
): Promise<MJMLTrainingPipelineEntity> {
  const p = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  p.NewRecord();
  p.Name = `${PREFIX} ${name}`;
  p.Description = 'Pipeline migration runtime check (safe to delete)';
  p.Version = 1;
  p.Status = 'Draft';
  p.TargetEntityID = over.TargetEntityID || template.TargetEntityID;
  p.TargetVariable = over.TargetVariable || template.TargetVariable;
  p.ProblemType = template.ProblemType;
  p.AlgorithmID = template.AlgorithmID;
  p.SourceBindings = over.SourceBindings || template.SourceBindings;
  p.FeatureSteps = over.FeatureSteps || template.FeatureSteps;
  p.AsOfStrategy = over.AsOfStrategy === undefined ? template.AsOfStrategy : over.AsOfStrategy;
  p.LeakageGuard = over.LeakageGuard || template.LeakageGuard;
  p.ValidationStrategy = template.ValidationStrategy;
  p.Hyperparameters = template.Hyperparameters;
  if (!(await p.Save())) throw new Error(`saving ${p.Name} failed: ${p.LatestResult?.CompleteMessage}`);
  return loadPipeline(provider, user, p.ID);   // re-read so the view fields (TargetEntity) are populated
}

async function unitsNamed(provider: IMetadataProvider, user: UserInfo, like: string): Promise<MJPredictionUnitEntity[]> {
  const r = await RunView.FromMetadataProvider(provider).RunView<MJPredictionUnitEntity>(
    { EntityName: 'MJ: Prediction Units', ExtraFilter: `Name LIKE '${EscapeSQLString(like)}'`, ResultType: 'entity_object', BypassCache: true }, user);
  if (!r.Success) throw new Error(r.ErrorMessage);
  return r.Results;
}

const rowOf = (report: readonly MigrationReportRow[], p: MJMLTrainingPipelineEntity): MigrationReportRow => {
  const row = report.find((r) => UUIDsEqual(r.PipelineID, p.ID));
  if (row === undefined) throw new Error(`no report row for ${p.Name}`);
  return row;
};

/** The five copies (a)–(e). */
async function createCopies(provider: IMetadataProvider, user: UserInfo, template: MJMLTrainingPipelineEntity): Promise<Record<'a' | 'b' | 'c' | 'd' | 'e', MJMLTrainingPipelineEntity>> {
  const c2 = provider.EntityByName(C2_ENTITY);
  if (!c2) throw new Error(`${C2_ENTITY} is not registered`);
  return {
    a: await copyPipeline(provider, user, template, '(a) column as-of', { AsOfStrategy: JSON.stringify({ Mode: 'column', Column: 'StartDate' }) }),
    b: await copyPipeline(provider, user, template, '(b) no as-of', { AsOfStrategy: null }),
    c: await copyPipeline(provider, user, template, '(c) offset as-of', { AsOfStrategy: JSON.stringify({ Mode: 'offset', OffsetDays: 30 }) }),
    d: await copyPipeline(provider, user, template, '(d) C2 neutral target', {
      AsOfStrategy: null, TargetEntityID: c2.ID, TargetVariable: 'Target', SourceBindings: JSON.stringify([{ Kind: 'Entity', Ref: c2.Name }]),
      FeatureSteps: JSON.stringify({ Steps: [{ Id: 'select-raw', Kind: 'select', Columns: ['ClaimAmountZ', 'PriorClaims'] }] }), LeakageGuard: JSON.stringify({ DenyFields: ['TruthScore'], SingleFeatureDominanceThreshold: 0.6 }),
    }),
    e: await copyPipeline(provider, user, template, '(e) no as-of, migrated 2026-01-01', { AsOfStrategy: null }),
  };
}

type Copies = Awaited<ReturnType<typeof createCopies>>;

async function steps1to3(deps: MigrationDeps, copies: Copies): Promise<void> {
  const four = [copies.a, copies.b, copies.c, copies.d];
  const ids = four.map((p) => p.ID);
  const dry = await PipelineMigration.MigratePipelines(deps, true, ids);
  const [a, b, c, d] = four.map((p) => rowOf(dry.Report, p));
  check('1a dry run: (a) would-migrate with a cutoff, decided on StartDate', a.Action === 'would-migrate' && a.Cutoff !== null && a.Notes.some((n) => n.startsWith('decision date = StartDate')), a);
  check('1b dry run: (b) would-migrate, no cutoff, decided on each run\'s day', b.Action === 'would-migrate' && b.Cutoff === null && b.Notes.some((n) => n.startsWith('decision date = the day of each run')), b);
  check('1c dry run: (c) would-archive (offset)', c.Action === 'would-archive' && c.Reason === 'offset as-of cannot be expressed as a Prediction Unit', c);
  check('1d dry run: (d) would-hold (adverse class undetermined)', d.Action === 'would-hold' && d.Reason === ADVERSE_CLASS_HOLD_REASON, d);
  const written = await unitsNamed(deps.Provider, deps.User, `${PREFIX}% — migrated unit`);
  check('1e dry run wrote no unit', written.length === 0, { units: written.length });

  const real = await PipelineMigration.MigratePipelines(deps, false, ids);
  const applied: Record<string, string> = { 'would-migrate': 'migrated', 'would-archive': 'archived', 'would-hold': 'held' };
  for (const p of four) {
    const predicted = rowOf(dry.Report, p);
    const done = rowOf(real.Report, p);
    check(`2 real run matches the dry run: ${p.Name}`, done.Action === applied[predicted.Action] && done.Cutoff === predicted.Cutoff && JSON.stringify(done.Notes) === JSON.stringify(predicted.Notes), { predicted: predicted.Action, applied: done.Action, cutoff: done.Cutoff, unit: done.PredictionUnitID, protocol: done.EvaluationProtocolID });
  }

  const again = await PipelineMigration.MigratePipelines(deps, false, ids);
  const [a3, b3, c3, d3] = four.map((p) => rowOf(again.Report, p));
  const dRow = await loadPipeline(deps.Provider, deps.User, copies.d.ID);
  const heldLines = (dRow.Description || '').split('\n').filter((l) => l.startsWith('Held by the Prediction Unit migration on ')).length;
  check('3 second run: (a)/(b) already migrated, (c) archived, (d) held once',
    a3.Reason === 'already-migrated' && b3.Reason === 'already-migrated' && c3.Action === 'skipped' && c3.Reason === 'archived' && d3.Action === 'held' && heldLines === 1,
    { a: a3.Reason, b: b3.Reason, c: `${c3.Action}/${c3.Reason}`, d: d3.Action, heldLines });
}

async function step4(deps: MigrationDeps, copies: Copies): Promise<void> {
  const b = await TrainingDelegation.TrainModelViaEngine({ pipelineId: copies.b.ID }, deps.Provider, deps.User);
  const bPipeline = await loadPipeline(deps.Provider, deps.User, copies.b.ID);
  const bUnits = await unitsNamed(deps.Provider, deps.User, `${PREFIX} (b)% — migrated unit`);
  check('4a (b) trains the same day without a unit version 2', b.run.Status === 'Completed' && bUnits.length === 1 && bUnits.every((u) => u.Version === 1) && UUIDsEqual(bPipeline.PredictionUnitID, bUnits[0]?.ID), { run: b.run.ID, status: b.run.Status, model: b.model === null ? null : b.model.ID, units: bUnits.map((u) => u.Version) });

  const e = await loadPipeline(deps.Provider, deps.User, copies.e.ID);
  const migrated = await PipelineMigration.EnsurePipelineUnitAndProtocol(e, { ...deps, Today: '2026-01-01' }, false);
  check('4b (e) migrated as of 2026-01-01', migrated.Action === 'migrated', migrated);
  const trained = await TrainingDelegation.TrainModelViaEngine({ pipelineId: copies.e.ID }, deps.Provider, deps.User);
  const eAfter = await loadPipeline(deps.Provider, deps.User, copies.e.ID);
  const v2 = (await unitsNamed(deps.Provider, deps.User, `${PREFIX} (e)% — migrated unit`)).find((u) => UUIDsEqual(u.ID, eAfter.PredictionUnitID));
  const parsed = v2 === undefined ? null : PredictionUnit.ParsePredictionUnitRow(v2);
  const spec = parsed !== null && parsed.Ok ? parsed.Value : null;
  const decisionDate = spec !== null && spec.rows.kind === 'grain' && spec.rows.decisionDate.kind === 'fixed' ? spec.rows.decisionDate.date : null;
  const author = spec === null ? null : spec.authoredBy;
  check('4c (e) trains under version 2 dated today, authored decision-date-advance',
    trained.run.Status === 'Completed' && spec !== null && spec.version === 2 && decisionDate === deps.Today && author !== null && author.kind === 'system' && author.component === 'decision-date-advance',
    { run: trained.run.ID, status: trained.run.Status, unit: eAfter.PredictionUnitID, version: spec === null ? null : spec.version, decisionDate, author });
}

async function step5(deps: MigrationDeps): Promise<void> {
  const run = await PipelineMigration.MigratePipelines(deps, false, [LEGACY_PIPELINE_ID]);
  const row = run.Report[0];
  check('5 the legacy W1 pipeline is migrated by its own rules', row !== undefined && (row.Action === 'migrated' || row.Action === 'skipped' || row.Action === 'held'), { row });
}

/** Every pipeline, model and unit/protocol version this rig created, deleted through the entity layer. */
async function cleanup(provider: IMetadataProvider, user: UserInfo): Promise<void> {
  const rv = RunView.FromMetadataProvider(provider);
  const records = new RunRecords();
  const named = `Name LIKE '${EscapeSQLString(PREFIX)}%'`;
  const [pipelines, units, protocols] = await rv.RunViews<{ ID: string }>([
    { EntityName: 'MJ: ML Training Pipelines', ExtraFilter: named, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    { EntityName: 'MJ: Prediction Units', ExtraFilter: named, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    { EntityName: 'MJ: Evaluation Protocols', ExtraFilter: named, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
  ], user);
  for (const r of [pipelines, units, protocols]) if (!r.Success) throw new Error(r.ErrorMessage);
  for (const p of pipelines.Results) records.RecordPipeline(p.ID);
  for (const u of units.Results) records.RecordPredictionUnit(u.ID);
  for (const e of protocols.Results) records.RecordEvaluationProtocol(e.ID);
  const failures = await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(provider, user), records);
  console.log(JSON.stringify({ cleanup: { pipelines: pipelines.Results.length, units: units.Results.length, protocols: protocols.Results.length, failures } }));
  if (failures.length > 0) throw new Error(`cleanup left ${failures.length} problem(s)`);
}

async function main(): Promise<void> {
  const cleanupOnly = process.argv.includes('--cleanup');
  if (!cleanupOnly && process.env.PS_INTEGRATION !== '1') {
    console.log('PS_INTEGRATION is not 1: the check trains on the sidecar, so nothing was run.');
    return;
  }
  const { provider, user, pool } = await BootstrapAI();
  try {
    if (cleanupOnly) return await cleanup(provider, user);
    const deps: MigrationDeps = { Provider: provider, User: user, EntityFactory: new MetadataEntityFactory(provider), Today: UtcDay.UtcDayIso(new Date()) };
    const copies = await createCopies(provider, user, await loadPipeline(provider, user, LEGACY_PIPELINE_ID));
    console.log(JSON.stringify({ copies: Object.fromEntries(Object.entries(copies).map(([k, p]) => [k, p.ID])) }));
    await steps1to3(deps, copies);
    const storage = await ActivateStorage(provider, user);
    try {
      await step4(deps, copies);
    } finally {
      await RestoreStorage(storage);
    }
    await step5(deps);
  } finally {
    await pool.close();
  }
}

main().catch((e: Error) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
