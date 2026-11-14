/**
 * Gate G3.4 "W2 → S6.5 #2" (owner PR 4, phase 3; statistical): over 400 W2-noise seeds (s100–s499), at most 28
 * training runs of 400 reach Published through the lifecycle gate (noise-publish-400, the same Wilson rule as G0.2's),
 * and every other run stores its negative outcome with its reason, 100%: a `KeepBaseline` model with a non-empty
 * `StatusReason`, or a run-level `refusal` record (no model row) with a non-empty `Reason` (D4-56). Counted by
 * `TrainingRunID` (§4.1's reading).
 *
 * Each seed is a Pipeline Builder agent run with automated publishing on (G0.2's plan over the W world): the builder
 * trains and evaluates its run through the gate (`LifecycleGate.Evaluate({ trainingRunId })` on MJAPI), so a no-signal
 * run gets its run-level refusal record and a model is moved to its stored decision; a run whose model the gate
 * validated (a stored `model` outcome) is then published through the Promote op as the suite user. `PS_SEED_LIMIT=<k>`
 * runs the first k seeds with the rule applied at n = k; the full count runs once, on the final head.
 */
import { RunView } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AgentPlans, SeedRule, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The first W2-noise seed and the full seed count. */
const FIRST_SEED = 100;
const SEEDS = 400;

/** How one training run ended. */
type RunOutcome = 'published' | 'keepBaseline' | 'runLevel' | 'withoutReason';

/** One training run of one seed, classified. */
interface SeedRun {
  readonly Seed: number;
  readonly TrainingRunID: string;
  readonly Outcome: RunOutcome;
  /** For `withoutReason`: what the run stored instead. */
  readonly Text: string;
}

/** G3.4's per-seed steps. */
class PsGateW2S65No2Steps {
  /** The seeds this run measures: all 400, or the first `PS_SEED_LIMIT`. */
  public static Seeds(): number[] {
    const limit = Number(process.env.PS_SEED_LIMIT || '');
    const n = Number.isInteger(limit) && limit > 0 && limit < SEEDS ? limit : SEEDS;
    return Array.from({ length: n }, (_, i) => FIRST_SEED + i);
  }

  /** One seed: a builder run, then each of its training runs evaluated, a validated model published, classified. */
  public static async Seed(h: TruthHarness, seed: number): Promise<SeedRun[]> {
    const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: seed });
    const name = `PSTruth: G3.4 W2 s${seed} ${h.RunID}`;
    const build = await h.RunBuilderAgent(AgentPlans.Build({
      Name: name, Entity: w2.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES], Algorithms: [...PsGateSpecs.Algorithms], DenyFields: [...W_WORLD_DENY_FIELDS],
    }));
    // A crashed run stores nothing, so counting it would pass the gate: it is an error, not a measurement.
    if (!build.AgentSuccess) throw new Error(`G3.4 W2 s${seed}: builder agent run ${build.AgentRunID || '(none)'} failed: ${build.AgentErrorMessage || 'no error message'}`);
    const runs = await PsGateW2S65No2Steps.runsOf(h, build.PipelineIDs);
    if (runs.length === 0) throw new Error(`G3.4 W2 s${seed}: the builder run ${build.AgentRunID || '(none)'} left no training run (${build.BuildErrorMessage || 'no build error'})`);
    const out: SeedRun[] = [];
    for (const run of runs) out.push(await PsGateW2S65No2Steps.classify(h, seed, run));
    return out;
  }

  /** The training runs of the seed's pipelines. */
  private static async runsOf(h: TruthHarness, pipelineIds: readonly string[]): Promise<Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID' | 'Status'>[]> {
    if (pipelineIds.length === 0) return [];
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID' | 'Status'>>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `PipelineID IN (${pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
      Fields: ['ID', 'ResultingModelID', 'Status'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading the seed's training runs: ${r.ErrorMessage}`);
    return r.Results;
  }

  /** A run with a model: publish it when validated, then classify by status; a run without one: its run-level refusal record. */
  private static async classify(h: TruthHarness, seed: number, run: Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID' | 'Status'>): Promise<SeedRun> {
    const base = { Seed: seed, TrainingRunID: run.ID };
    if (!run.ResultingModelID) return { ...base, ...(await PsGateW2S65No2Steps.runLevel(h, run.ID)) };
    let model = await PsGateW2S65No2Steps.model(h, run.ResultingModelID);
    if (model.Status === 'Validated') {
      await h.Promote(model.ID, 'publish', `G3.4 W2 s${seed}: publish the model the gate validated`);
      model = await PsGateW2S65No2Steps.model(h, run.ResultingModelID);
    }
    if (model.Status === 'Published') return { ...base, Outcome: 'published', Text: '' };
    if (model.Status === 'KeepBaseline' && (model.StatusReason || '').trim().length > 0) return { ...base, Outcome: 'keepBaseline', Text: '' };
    return { ...base, Outcome: 'withoutReason', Text: `s${seed}: model ${model.ID} ${model.Status}, StatusReason ${model.StatusReason ? 'set' : 'empty'}` };
  }

  /** The run's run-level `refusal` record (no model) and whether it carries its reason. */
  private static async runLevel(h: TruthHarness, runId: string): Promise<Pick<SeedRun, 'Outcome' | 'Text'>> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelPublishRecordEntity, 'ID' | 'TrainingRunID' | 'Reason'>>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `TrainingRunID='${EscapeSQLString(runId)}' AND ModelID IS NULL AND Kind='refusal'`,
      Fields: ['ID', 'TrainingRunID', 'Reason'], ResultType: 'simple', BypassCache: true,
    }, h.User);
    if (!r.Success) throw new Error(`reading the run-level records of training run ${runId}: ${r.ErrorMessage}`);
    const records = r.Results.filter((x) => UUIDsEqual(x.TrainingRunID, runId));
    if (records.length > 0 && records.every((x) => (x.Reason || '').trim().length > 0)) return { Outcome: 'runLevel', Text: '' };
    return { Outcome: 'withoutReason', Text: `run ${runId}: no model, ${records.length} run-level refusal record(s)${records.length > 0 ? ' without a reason' : ''}` };
  }

  /** The model's status and reason, read past every cache. */
  private static async model(h: TruthHarness, modelId: string): Promise<Pick<MJMLModelEntity, 'ID' | 'Status' | 'StatusReason'>> {
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'Status' | 'StatusReason'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'Status', 'StatusReason'], ResultType: 'simple', BypassCache: true }, h.User);
    const row = r.Results.find((m) => UUIDsEqual(m.ID, modelId));
    if (!r.Success || !row) throw new Error(`reading ML Model ${modelId}: ${r.ErrorMessage || 'no row'}`);
    return row;
  }
}

export const PsGateW2S65No2Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w2-s6-5-2.G3.4', Name: 'G3.4 W2 → S6.5 #2: at most 28 of 400 noise runs reach Published through the gate, and every other run stores its outcome with its reason', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const seeds = PsGateW2S65No2Steps.Seeds();
      const t0 = Date.now();
      const runs: SeedRun[] = [];
      for (const seed of seeds) runs.push(...(await PsGateW2S65No2Steps.Seed(h, seed)));
      const count = (o: RunOutcome): number => runs.filter((r) => r.Outcome === o).length;
      const published = count('published');
      const rest = runs.length - published;
      const withReason = count('keepBaseline') + count('runLevel');
      const max = SeedRule.AcceptanceRange('noise-publish-400', runs.length).Max;
      PsGate.Assert({
        Passed: runs.length === seeds.length && SeedRule.Passes('noise-publish-400', published, runs.length) && withReason === rest,
        Measured: {
          seeds: seeds.length, runs: runs.length, published, maxPublished: max, keepBaseline: count('keepBaseline'), runLevel: count('runLevel'),
          withoutReason: count('withoutReason'), publishedSeeds: runs.filter((r) => r.Outcome === 'published').map((r) => r.Seed).join(','),
          withoutReasonSample: runs.filter((r) => r.Outcome === 'withoutReason').slice(0, 5).map((r) => r.Text).join(' | '), durationMs: Date.now() - t0,
        },
        Detail: `${published} of ${runs.length} training runs reached Published (≤ ${max} accepted); 100% of the rest with its reason: ${withReason} of ${rest} `
          + `(${count('keepBaseline')} KeepBaseline with StatusReason, ${count('runLevel')} run-level refusals with Reason)`,
      });
    },
  },
];

for (const c of PsGateW2S65No2Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w2-s6-5-2', PsGate.Lifecycle);
