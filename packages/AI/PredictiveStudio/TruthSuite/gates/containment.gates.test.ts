import { describe } from 'vitest';
import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { NormalizeUUID } from '@memberjunction/global';
import type { OutcomeModelLike, RunDetailLike } from '@memberjunction/predictive-studio-core';
import { TruthGate } from '../src/gates/define-gate';
import { CausalCopyScan } from '../src/gates/causal-copy';
import { SeedRule } from '../src/stats/seed-rules';
import { ConfidenceInterval } from '../src/stats/wilson';
import { TruthSuite } from '../src/registry/load';
import { RunFixtures } from '../src/harness/run-fixtures';
import { AgentPlans } from '../src/harness/agent-plan';
import { HarnessDatasets } from '../src/harness/datasets';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from '../src/harness/w-world';
import { ContainmentProbe } from '../src/harness/containment-probe';
import type { AlgorithmKey, TruthHarness, LoadedDataset, PipelineSpec } from '../src/harness/types';

const MJ_ROOT = path.resolve(TruthSuite.Root(), '../../../..');
const W_FEATURES = [...W_WORLD_FEATURES];
const DENY = [...W_WORLD_DENY_FIELDS];
const ALGOS: AlgorithmKey[] = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'];
const CAP_NAMED = /\bcap\b|max ?rows|1,?000|UserViewMaxRows/i;
const WRITE_BACK = { OutputMapping: { fields: { TruthScore: '$.score' } } };

function spec(h: TruthHarness, tag: string, dataset: LoadedDataset, over: Partial<PipelineSpec> = {}): PipelineSpec {
  return {
    Name: `PSTruth: ${tag} ${h.RunID}`,
    Dataset: dataset,
    Target: 'Renewed',
    ProblemType: 'classification',
    Features: W_FEATURES,
    Algorithm: 'logistic_regression',
    AsOf: { Mode: 'none' },
    Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
    DenyFields: DENY,
    ...over,
  };
}

function walk(dir: string, keep: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f, keep) : keep(f) ? [f] : [];
  });
}

describe('Containment gates', () => {
  TruthGate.Define('W1 → S7.5', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const p = await h.CreatePipeline(spec(h, 'G0.1 W1 s42', w1));
    const t = await h.Train(p); // the UI default: no MaxRows
    const m = t.ModelID ? await h.ReadModel(t.ModelID) : null;
    // `??` on purpose for the row counts here and in `Measured`: 0 is a legitimate count, and `|| null` would report it as null.
    const trainRead = m ? (m.TrainingRowCount ?? 0) + (m.HoldoutRowCount ?? 0) : null;
    const trainOk = m ? trainRead === w1.RowCount : CAP_NAMED.test(t.ErrorMessage || '');
    const scoring = await RunFixtures.W1S42ValidatedModel(h); // full-row, Validated: scoring is tested even if training refused
    const s = await h.Score(scoring.ModelID, { scope: { filter: { entityName: w1.Entity.Name } } });
    const scoreOk = s.Ok ? s.Scored === w1.RowCount : CAP_NAMED.test(s.ErrorMessage || '');
    return {
      Passed: trainOk && scoreOk,
      Measured: {
        labelledRows: w1.RowCount,
        trainingRows: m?.TrainingRowCount ?? null,
        holdoutRows: m?.HoldoutRowCount ?? null,
        trainError: t.ErrorMessage,
        filterScored: s.Scored,
        scoreError: s.ErrorMessage,
      },
      Detail: `training read ${trainRead === null ? 'refused' : trainRead} of ${w1.RowCount}; filter scoring scored ${s.Scored}${s.ErrorMessage ? ` (${s.ErrorMessage})` : ''}`,
    };
  });

  // G0.2 and G0.3 are owned by the gated-publish change (registry OwnerPR), written here with the agent-run harness and
  // expected-fail until that change flips them. Both run with automated publishing on (the builder's autoPublish
  // default) and count a run as published when any of its models reaches Published, whoever promoted it. G0.3 passes
  // at 0 of 2. G0.2 has two halves: (a) runs reaching Published ≤ 6 of 60 (statRule noise-publish-60) and (b) every run
  // that reaches Published has a stored gate outcome 'model' that publish reverification re-derives, 60 of 60 runs
  // consistent (a run that publishes nothing is consistent). Half (b) needs a stored outcome and the reverification
  // (ContainmentProbe.ReadStoredGateDecision / ReverifiesStoredDecision read them once they exist); until then any
  // published run is inconsistent and the gate stays xfail — expected for this expected-fail gate.
  TruthGate.Define('W2 → C1.1', async (h) => {
    const publishedSeeds: number[] = [];
    const inconsistentSeeds: number[] = [];
    for (let seed = 100; seed <= 159; seed++) {
      const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: seed });
      const name = `PSTruth: G0.2 W2 s${seed} ${h.RunID}`;
      await h.RunBuilderAgent(
        AgentPlans.Build({
          Name: name,
          Entity: w2.Entity,
          Target: 'Renewed',
          Features: W_FEATURES,
          Algorithms: ALGOS,
          DenyFields: DENY,
        }),
      );
      const models = await h.ModelsForPipelineNamePrefix(name);
      const published = models.filter((m) => ContainmentProbe.ReachedPublishedUnattended(m));
      if (published.length > 0) publishedSeeds.push(seed);
      if (
        published.some(
          (m) => ContainmentProbe.ReadStoredGateDecision(m) !== 'model' || !ContainmentProbe.ReverifiesStoredDecision(m),
        )
      ) {
        inconsistentSeeds.push(seed);
      }
    }
    const countOk = SeedRule.Passes('noise-publish-60', publishedSeeds.length, 60);
    const consistent = 60 - inconsistentSeeds.length;
    return {
      Passed: countOk && consistent === 60,
      Measured: {
        runs: 60,
        published: publishedSeeds.length,
        maxPublished: SeedRule.AcceptanceRange('noise-publish-60', 60).Max,
        consistent,
        seeds: publishedSeeds.join(','),
        inconsistentSeeds: inconsistentSeeds.join(','),
      },
      Detail: `${publishedSeeds.length} of 60 agent runs reached Published with automated publishing on (≤ 6 accepted); ${consistent} of 60 runs consistent (stored outcome 'model', re-derived at publish)`,
    };
  });

  TruthGate.Define('W3 → C1.1', async (h) => {
    const w3 = await h.EnsureLoaded({ Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
    const features = [...W_FEATURES, 'Status'];
    const published: string[] = [];
    for (const [order, algorithms] of [
      ['lr-first', ALGOS],
      ['lr-last', [...ALGOS].reverse()],
    ] as const) {
      const name = `PSTruth: G0.3 W3 s42 ${order} ${h.RunID}`;
      await h.RunBuilderAgent(
        AgentPlans.Build({
          Name: name,
          Entity: w3.Entity,
          Target: 'Renewed',
          Features: features,
          Algorithms: [...algorithms],
          DenyFields: DENY,
        }),
      );
      if ((await h.ModelsForPipelineNamePrefix(name)).some((m) => ContainmentProbe.ReachedPublishedUnattended(m))) {
        published.push(order);
      }
    }
    return {
      Passed: published.length === 0,
      Measured: { runs: 2, published: published.length, orders: published.join(',') },
      Detail: `${published.length} of 2 agent runs on W3 s42 reached Published with automated publishing on`,
    };
  });

  TruthGate.Define('W1 → S9.3', async (h) => {
    const files = [
      ...walk(
        path.join(MJ_ROOT, 'packages/Angular/Explorer/dashboards/src/PredictiveStudio'),
        (f) => /\.(ts|html)$/.test(f) && !/\.test\.ts$/.test(f),
      ),
      ...walk(path.join(MJ_ROOT, 'packages/AI/PredictiveStudio/Core/src'), (f) => f.endsWith('.ts') && !f.includes('__tests__')),
      ...ContainmentProbe.StoryPromptFiles(MJ_ROOT),
    ];
    const hits = CausalCopyScan.Scan(files);
    const model = await RunFixtures.W1S42ValidatedModel(h);
    const stories: string[] = [];
    for (let i = 0; i < 10; i++) {
      const story = await ContainmentProbe.GenerateModelStory(h, model.ModelID);
      if (story !== null) stories.push(story);
    }
    const causalStories = stories.filter((s) => CausalCopyScan.Patterns.some((re) => re.test(s))).length;
    return {
      Passed: hits.length === 0 && stories.length === 10 && causalStories === 0,
      Measured: {
        filesScanned: files.length,
        causalHits: hits.length,
        firstHit: hits[0] || null,
        storiesGenerated: stories.length,
        causalStories,
      },
      Detail: `${hits.length} causal phrases in UI strings/story prompt; ${causalStories} of ${stories.length} stories causal`,
    };
  });

  TruthGate.Define('W1 → S7.3', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const scope = { filter: { entityName: w1.Entity.Name, extraFilter: "Region = 'NA' AND [Year] = 2024", maxRows: 5000 } };
    const draft = await RunFixtures.W1S42Model(h); // Draft
    const archivedId = await RunFixtures.TrainedModel(h, 'G0.7 archived', w1);
    await h.Promote(archivedId, 'Validated', 'truth suite fixture: promote');
    const archived = await h.Promote(archivedId, 'Archived', 'truth suite fixture: archive');
    if (archived.Status !== 'Archived') throw new Error(`could not archive the G0.7 fixture model (status ${archived.Status})`);
    const validatedId = (await RunFixtures.W1S42ValidatedModel(h)).ModelID;

    const attempt = async (modelId: string, dryRun: boolean) => {
      await h.ResetColumn(w1, 'TruthScore');
      const a = await h.Score(modelId, { scope, writeBack: WRITE_BACK, dryRun });
      return { a, written: await h.CountNonNull(w1, 'TruthScore') };
    };
    const d = await attempt(draft.ModelID, false);
    const ar = await attempt(archivedId, false);
    const dry = await attempt(validatedId, true);
    const refused = [d, ar].filter((x) => x.written === 0 && ContainmentProbe.WasScoringRefused(x.a)).length;
    return {
      Passed: refused === 2 && dry.written === 0,
      Measured: {
        draftWritten: d.written,
        draftError: d.a.ErrorMessage,
        archivedWritten: ar.written,
        archivedError: ar.a.ErrorMessage,
        dryRunWritten: dry.written,
      },
      Detail: `Draft/Archived refused with 0 rows written: ${refused} of 2; dry run wrote ${dry.written} rows`,
    };
  });

  TruthGate.Define('W4 → S2.1', async (h) => {
    const w4 = await h.EnsureLoaded({ Kind: 'world', ID: 'W4-pit', Seed: 42 });
    const features = [...W_FEATURES, 'PersonStatusNow'];
    const pipelineColumn = await h.CreatePipeline(
      spec(h, 'G0.8 W4 column-mode', w4, { Features: features, AsOf: { Mode: 'column', Column: 'StartDate' } }),
    );
    const a = await h.Train(pipelineColumn);
    const pipelinePlain = await h.CreatePipeline(spec(h, 'G0.8 W4 asOf-input', w4, { Features: features }));
    const b = await h.Train(pipelinePlain, { AsOf: { Mode: 'column', Column: 'StartDate' } });
    const refused = [a, b].filter((x) => ContainmentProbe.WasRefusedBeforeTraining(x)).length;
    return {
      Passed: refused === 2,
      Measured: {
        refused,
        columnModeError: a.ErrorMessage,
        asOfInputError: b.ErrorMessage,
        columnModeModel: a.ModelID,
        asOfInputModel: b.ModelID,
      },
      Detail: `${refused} of 2 no-effect as-of variants refused before training`,
    };
  });

  TruthGate.Define('W2 → S5.3', async (h) => {
    const w2 = await h.EnsureLoaded({ Kind: 'world', ID: 'W2-noise', Seed: 100 });
    const { Positives: positives, Negatives: negatives } = HarnessDatasets.LabelCounts(w2, 'Renewed');
    const out: Record<string, number | string | boolean | null> = {};
    let ok = 0;
    for (const [label, validation] of [
      ['kfold', { Strategy: 'kfold', K: 5, LockedHoldoutFraction: 0 }],
      ['holdout', { Strategy: 'holdout', LockedHoldoutFraction: 0 }],
    ] as const) {
      const p = await h.CreatePipeline(spec(h, `G0.9 W2 s100 ${label}`, w2, { Algorithm: 'random_forest', Validation: validation }));
      const t = await h.Train(p);
      if (ContainmentProbe.WasRefusedBeforeTraining(t)) {
        ok += 1;
        out[`${label}Refused`] = true;
        continue;
      }
      const m = t.ModelID ? await h.ReadModel(t.ModelID) : null;
      const auc = m?.Metrics['auc'] ?? m?.Metrics['roc_auc'] ?? null; // `??` on purpose: an AUC of 0 is a legitimate value
      if (auc === null) throw new Error(`${label}: trained but reported no validation AUC`);
      const ci = ConfidenceInterval.HanleyMcNeil(auc, positives, negatives);
      out[`${label}Auc`] = auc;
      out[`${label}Lower`] = ci.Lower;
      out[`${label}Upper`] = ci.Upper;
      if (ci.Lower <= 0.5 && 0.5 <= ci.Upper) ok += 1;
    }
    return {
      Passed: ok === 2,
      Measured: out,
      Detail: `${ok} of 2 strategies honest on noise (interval contains 0.5) or refused`,
    };
  });

  TruthGate.Define('W1 → S5.4', async (h) => {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const records = HarnessDatasets.FirstRowIDs(w1, 500);
    const out: Record<string, number | string | boolean | null> = { threads: process.env.OMP_NUM_THREADS || null };
    let equal = 0;
    for (const algorithm of ['logistic_regression', 'xgboost', 'lightgbm'] as const) {
      const p = await h.CreatePipeline(spec(h, `G0.10 W1 ${algorithm}`, w1, { Algorithm: algorithm }));
      const scores: number[][] = [];
      for (let k = 0; k < 2; k++) {
        const t = await h.Train(p, { MaxRows: 1_000_000 });
        if (!t.ModelID) throw new Error(`${algorithm} training ${k + 1} failed: ${t.ErrorMessage}`);
        // Score a Validated model: Draft models are refused for scoring. The promote is the product's promote operation.
        const promoted = await h.Promote(t.ModelID, 'Validated', 'truth suite fixture: promote (G0.10)');
        if (!promoted.Promoted) throw new Error(`${algorithm}: could not promote model ${t.ModelID} to Validated (${promoted.Status})`);
        const s = await h.Score(t.ModelID, { scope: { records } });
        if (!s.Ok || s.Predictions.length !== records.length) {
          throw new Error(`${algorithm}: scored ${s.Predictions.length} of ${records.length}`);
        }
        // One map per scoring (O(n) instead of a scan per record); NormalizeUUID because SQL Server and the sidecar may
        // spell the same id in different case (coding standards §6).
        const byId = new Map(s.Predictions.map((x) => [NormalizeUUID(x.RecordID), x.Score] as const));
        scores.push(records.map((id) => byId.get(NormalizeUUID(id)) ?? Number.NaN)); // `??`: a score of 0 is legitimate
      }
      const maxDiff = Math.max(...scores[0]!.map((v, i) => Math.abs(v - scores[1]![i]!)));
      out[`${algorithm}MaxDiff`] = maxDiff;
      if (maxDiff <= 1e-9) equal += 1;
    }
    return {
      Passed: equal === 3,
      Measured: out,
      Detail: `${equal} of 3 algorithms reproduce predictions within 1e-9`,
    };
  });

  TruthGate.Define('T4 → S6.5', async (h) => {
    let abovePoor = 0;
    let stored = 0;
    let declared = 0;
    const reasons: string[] = [];
    for (let origin = 1; origin <= 12; origin++) {
      const t4 = await h.EnsureLoaded({ Kind: 'series-origin', ID: 'T4', Seed: 2209, Origin: origin });
      const p = await h.CreatePipeline({
        Name: `PSTruth: G0.11 T4 origin ${origin} ${h.RunID}`,
        Dataset: t4,
        Target: 'Target',
        ProblemType: 'regression',
        Features: ['MonthIndex', 'Month'],
        Algorithm: 'lightgbm',
        AsOf: { Mode: 'none' },
        Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
        DenyFields: ['ID', 'EntityKey', 'T', 'TruthScore'],
        TimeIndexColumn: 'MonthIndex',
      });
      if (p.ID && h.LastTimeIndexDeclared()) declared += 1;
      const t = await h.Train(p);
      if (!t.ModelID) continue; // refused: stores no withheld verdict, so it counts against the 12 of 12
      const m = await h.ReadModel(t.ModelID);
      if (ContainmentProbe.GradedAbovePoorOrActionable(m)) abovePoor += 1;
      const v = ContainmentProbe.ReadStoredWithheldVerdict(m);
      if (v && !v.CanAct && /not evaluated as a forecast/i.test(v.Reason)) {
        stored += 1;
        reasons.push(v.Reason);
      }
    }
    return {
      Passed: abovePoor === 0 && stored === 12,
      Measured: {
        origins: 12,
        timeIndexDeclared: declared,
        gradedAbovePoorOrActionable: abovePoor,
        withheldVerdictsStored: stored,
      },
      Detail: `${abovePoor} of 12 origins above Poor or actionable; ${stored} of 12 store the withheld verdict`,
    };
  });

  TruthGate.Define('W7 → S4.2', async (h) => {
    let qualifying = 0;
    let violations = 0;
    const out: Record<string, number | string | boolean | null> = {};
    for (const seed of [42, 43, 44]) {
      const w7 = await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: seed });
      const name = `PSTruth: G0.12 W7 s${seed} ${h.RunID}`;
      const r = await h.RunBuilderAgent(
        AgentPlans.Build({
          Name: name,
          Entity: w7.Entity,
          Target: 'Renewed',
          Features: W_FEATURES,
          Algorithms: ALGOS,
          DenyFields: DENY,
        }),
      );
      if (!r.BuildModelID) {
        out[`s${seed}`] = `no winner: ${r.BuildErrorMessage || r.AgentErrorMessage || 'unknown'}`;
        continue;
      }
      const m = await h.ReadModel(r.BuildModelID);
      const holdout = await h.Judge<{ n: number; positives: number }>('holdout_rebuild', [
        '--rows',
        path.join(w7.Dir, 'rows.csv'),
        '--model',
        await h.WriteArtifact(`g012-s${seed}-model`, m),
        '--label',
        'Renewed',
      ]);
      const majority = Math.max(holdout.positives, holdout.n - holdout.positives) / holdout.n;
      const accuracy = m.HoldoutMetrics['accuracy'] ?? null; // `??` on purpose: an accuracy of 0 is a legitimate value
      out[`s${seed}Accuracy`] = accuracy;
      out[`s${seed}Majority`] = majority;
      out[`s${seed}Grade`] = m.Trust.grade;
      out[`s${seed}CanAct`] = m.Trust.canAct;
      if (accuracy !== null && accuracy <= majority) {
        qualifying += 1;
        if (ContainmentProbe.GradedAbovePoorOrActionable(m)) violations += 1;
      }
    }
    out['qualifying'] = qualifying;
    out['violations'] = violations;
    return {
      Passed: violations === 0,
      Measured: out,
      Detail: `${violations} of ${qualifying} at-or-below-majority models graded above Poor or actionable`,
    };
  });

  /** The W1 s42 record-process scoring: its details, the model as the Predictions resource reads it, and the truth file. */
  interface W1RecordProcessScoring { Details: RunDetailLike[]; Model: OutcomeModelLike; TruthCsv: string }
  let w1RecordProcessPromise: Promise<W1RecordProcessScoring> | null = null;
  function w1RecordProcess(h: TruthHarness): Promise<W1RecordProcessScoring> {
    w1RecordProcessPromise ||= (async () => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const model = await RunFixtures.W1S42ValidatedModel(h);
      const run = await h.ScoreViaRecordProcess(model.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
      if (run.Status !== 'Completed') throw new Error(`record-process scoring ended ${run.Status}`);
      await h.WriteArtifact('w1-s42-recordprocess', {
        targetVariable: 'Renewed',
        lineage: model.LineageJSON,
        details: run.Details.map((d) => ({ recordId: d.RecordID, resultPayload: d.ResultPayload })),
      });
      return {
        TruthCsv: path.join(w1.Dir, 'truth.csv'),
        Details: run.Details.map((d) => ({ RecordID: d.RecordID, ResultPayload: d.ResultPayload })),
        Model: { Lineage: model.LineageJSON, TargetVariable: 'Renewed', ProblemType: 'classification' },
      };
    })();
    return w1RecordProcessPromise;
  }

  /** TrueP by normalised MembershipYearID; throws when the truth file lacks either column (never keys rows by "undefined"). */
  function readTrueP(truthCsv: string): Map<string, number> {
    const [header, ...rows] = readFileSync(truthCsv, 'utf8').split('\n');
    const cols = (header || '').split(',');
    const id = cols.indexOf('MembershipYearID');
    const p = cols.indexOf('TrueP');
    if (id < 0 || p < 0) throw new Error(`${truthCsv} has no MembershipYearID/TrueP columns`);
    const out = new Map<string, number>();
    for (const r of rows) {
      const c = r.split(',');
      const recordId = c[id];
      if (recordId) out.set(NormalizeUUID(recordId), Number(c[p]));
    }
    return out;
  }

  TruthGate.Define('W1 → S9.4', async (h) => {
    const { Details: details, Model: model } = await w1RecordProcess(h);
    const raises = ContainmentProbe.TopDriverRaisesRisk(details, 'Auto Renew', model);
    const lowers = raises.filter((r) => !r).length;
    return {
      Passed: raises.length > 0 && lowers === raises.length,
      Measured: { autoRenewTopDriverRows: raises.length, lowersRisk: lowers },
      Detail: `${lowers} of ${raises.length} AutoRenew top-driver rows lower the displayed risk ("Lowers Risk")`,
    };
  });

  TruthGate.Define('W1 → S9.5', async (h) => {
    const { Details: details, Model: model, TruthCsv: truthCsv } = await w1RecordProcess(h);
    const truth = readTrueP(truthCsv);
    const all = details.map((d) => truth.get(NormalizeUUID(d.RecordID))).filter((v): v is number => v !== undefined);
    const list = ContainmentProbe.AtRiskListRecordIDs(details, model).map((id) => truth.get(NormalizeUUID(id))).filter((v): v is number => v !== undefined);
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    return {
      Passed: list.length > 0 && mean(list) < mean(all),
      Measured: { listSize: list.length, listMeanTrueP: mean(list), populationMeanTrueP: mean(all) },
      Detail: `At-Risk list mean TrueP ${mean(list).toFixed(4)} vs population ${mean(all).toFixed(4)}`,
    };
  });
});
