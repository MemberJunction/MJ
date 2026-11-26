/**
 * Test doubles at the framework-class boundary (M4b.3 C7, kept by the controller's ruling). Each cast below stands a
 * plain field bag in for a framework class the agent only reads:
 * - `{ … } as unknown as MJMLModelEntity` (a field-bag trained-model row);
 * - `{ payload, contextUser, data, TrustReservedRunData, parentRun } as unknown as ExecuteAgentParams` (the run
 *   parameters `executeAgentInternal` reads; the full type needs an agent entity and a live run — `parentRun` is a bare
 *   `{ ID }` standing in for the parent's run row, which the agent only tests for presence);
 * - `{} as AgentConfiguration` (the configuration `executeAgentInternal` takes and the builder agent never reads).
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import { type ExecuteAgentParams, type AgentConfiguration, type BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import {
  type BuildApproval, type BuildApprovalRefusal,
  TRAINING_RUN_RESULTS_SCHEMA, GateRules, TrainingRunResultsParser, TracedNumbers, TrustVerdicts, ImportanceDisplay,
  type CandidateInnerScore, type GateDecision, type GateGuardRefusal, type LeakageFlag, type ModelingPlanSpec, type StoredGateRecord, type TracedNumberSource,
  type TrainerCompleted, type TrustComparison,
} from '@memberjunction/predictive-studio-core';
import {
  ExperimentReports,
  UNSHOWN_IMPORTANCE_KIND_NOTE,
  PredictiveStudioPipelineBuilderAgent,
  type CatalogStatus,
  type ExperimentReportInput,
  type PredictiveStudioBuilderPayload,
} from '../pipeline-builder-agent';
import {
  PredictiveStudioPipelineBuilder,
  type BuildPredictionInput,
  type BuildPredictionResult,
  type MLLeaderboardEntryPayload,
} from '../pipeline-builder';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';

// Test-double casts: the model entity, the agent's provider, user and agent-params doubles below implement only the
// members the code under test reads, so each is cast to its framework type (`as unknown as`, or `as` for an empty object)
// where it is handed over. These are the file's only casts.

/** A stored row: its ID and its JSON column, as the report reads it. */
interface RunRow { readonly ID: string; readonly ValidationResults: string | null }
/** A stored model row: the members the report reads. */
interface ModelRow { readonly ID: string; readonly FeatureImportance: string | null; readonly Lineage: string | null }

/** The stored JSON of every fixture row, by entity and ID: what a gate reads back from the database. */
const STORED = new Map<string, string>();
const storedKey = (entityName: string, recordId: string): string => `${entityName}|${recordId}`;

/** The JSON column a traced number's source row stores. */
function StoredJson(source: TracedNumberSource): string {
  const json = STORED.get(storedKey(source.EntityName, source.RecordID));
  if (json === undefined) throw new Error(`no stored row ${source.EntityName} ${source.RecordID}`);
  return json;
}

/** Register a run row's stored results and return the row. */
function storeRun(id: string, validationResults: string | null): RunRow {
  if (validationResults !== null) STORED.set(storedKey('MJ: ML Training Runs', id), validationResults);
  return { ID: id, ValidationResults: validationResults };
}

/** Register a model row's stored feature importance and return the row. */
function modelRow(id: string, featureImportance: string | null, importanceKind: string | null = 'held_out_permutation'): ModelRow {
  if (featureImportance !== null) STORED.set(storedKey('MJ: ML Models', id), featureImportance);
  return { ID: id, FeatureImportance: featureImportance, Lineage: JSON.stringify({ evaluation: { ImportanceKind: importanceKind } }) };
}

const BUDGETS = { budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 10, hardStop: true as const } };
type Outcome = GateDecision['outcome'];
/** The run ID the trainer's result names (the stored result requires a UUID; the rows' own IDs are labels). */
const TRAINER_RUN_ID = '00000000-0000-4000-8000-0000000000a1';

/** One candidate's stored inner score: its mean ± 0.02, over 15 folds. */
const inner = (candidate: string, mean: number): CandidateInnerScore =>
  ({ candidate, inner: TrainerResultFixtures.Mwi('log-loss', mean, mean - 0.02, mean + 0.02, 3668), folds: 15, optimistic: true });

/** What a stored search run holds: the gate outcome, the candidates' inner scores, the finalist and the audit's flags. */
interface SearchRunOptions {
  readonly Outcome: Outcome;
  readonly Scores?: readonly CandidateInnerScore[];
  readonly Finalist?: string;
  readonly LeakageFlags?: readonly LeakageFlag[];
  /** False stores no gate record. */
  readonly StoreGate?: boolean;
}

/** A completed search run's stored results: the trainer result with these scores and flags, and its gate record. */
function searchRun(id: string, o: SearchRunOptions): RunRow {
  const canned = o.Outcome === 'model' ? TrainerResultFixtures.CannedModelWins(TRAINER_RUN_ID, BUDGETS)
    : o.Outcome === 'keep-simple-baseline' ? TrainerResultFixtures.CannedCompleted(TRAINER_RUN_ID, BUDGETS) : TrainerResultFixtures.CannedNoSignal(TRAINER_RUN_ID, BUDGETS);
  const finalist = o.Finalist || 'lr';
  const result: TrainerCompleted = {
    ...TrainerResultFixtures.WithFinalist(canned, finalist, 'f'.repeat(64)),
    innerScores: o.Scores || [inner('xgb', 0.4), inner(finalist, 0.41)],
    leakageFlags: o.LeakageFlags || [],
  };
  return storeRun(id, TrainerResultFixtures.ValidationResultsFor(result, o.StoreGate === false ? { Gate: null } : {}));
}

/** A completed run that stores only a gate record (no trainer result) with this decision, measured on 500 holdout rows. */
function gateOnlyRun(id: string, decision: GateDecision, reason: string): RunRow {
  const gate: StoredGateRecord = {
    evaluationProtocolId: 'EP-1', margin: 0, primaryMetric: 'log-loss', holdoutRows: 500,
    intervals: { modelName: 'xgb', modelVsDummy: { value: 0.02, lower: 0.01, upper: 0.03 }, modelVsBestSimple: null, memberVsDummy: { glm: { value: 0.015, lower: 0.005, upper: 0.025 } }, memberScores: { glm: 0.4 }, deliveredMember: null },
    guards: { taskKind: 'binary', holdoutClassCounts: { '0': 400, '1': 100 }, modelAucInterval: { level: 0.95, lower: 0.6, upper: 0.7 }, minMinorityClassRows: 20 },
    transcribed: decision, decision, guardRefusal: null,
    reason: { code: decision.outcome === 'no-signal' ? 'nothing-beats-dummy' : 'only-model-beats-dummy', text: reason },
    incumbentDiff: null, sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
  };
  return storeRun(id, JSON.stringify({
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 500, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 500, dataCutoff: '2026-07-30' },
    trainer: null, trainerRequest: null, carve: null, gate,
  }));
}

/** The same run without its gate record (`gate: null`, the shape the parser reads as "no comparison"), stored under its own ID. */
function WithoutPrimary(run: RunRow): RunRow {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
  if (!parsed.Ok || parsed.Value.status !== 'completed') throw new Error('WithoutPrimary: not a completed envelope');
  return storeRun(`${run.ID}-without-gate`, JSON.stringify({ ...parsed.Value, gate: null }));
}

/** The same search run with its gate record refused by `refusal` (no-signal, the gate's reason for that refusal), under its own ID. */
function RefusedBy(run: RunRow, refusal: GateGuardRefusal): RunRow {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
  if (!parsed.Ok || parsed.Value.status !== 'completed' || parsed.Value.gate === null) throw new Error('RefusedBy: no stored gate record');
  const g = parsed.Value.gate;
  const decision: GateDecision = { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null };
  const reason = GateRules.DescribeGate(g.intervals, { Transcribed: g.transcribed, Decision: decision, GuardRefusal: refusal }, g.primaryMetric);
  return storeRun(`${run.ID}-refused-${refusal.kind}`, JSON.stringify({ ...parsed.Value, gate: { ...g, decision, guardRefusal: refusal, reason } }));
}

/** The report input a build of this run and model makes: the verdict rendered from the run (none without a model). */
function ReportInputFrom(run: RunRow | null, model: ModelRow | null, status: CatalogStatus = 'published'): ExperimentReportInput {
  const trust = model === null ? null : TrustVerdicts.DeriveTrustVerdict({ ValidationResults: run === null ? null : run.ValidationResults, Lineage: model.Lineage });
  return { Name: 'Member Renewal Risk', Goal: 'Predict renewal', TargetVariable: 'Renewed', TargetMetric: 'AUC', Run: run, Model: model, Trust: trust, Status: status };
}

/** The Markdown's numeric tokens outside the leaderboard's Rank column (ranks are positions, not measurements). */
function numericTokens(markdown: string): string[] {
  const withoutRanks = markdown.split('\n').map((line) => line.replace(/^\| \d+ \|/, '|')).join('\n');
  return withoutRanks.match(/-?\d[\d,]*(?:\.\d+)?%?/g) || [];
}

const storedRun = searchRun('RUN-MODEL', { Outcome: 'model' });
const storedModel = modelRow('MODEL-1', JSON.stringify({ DuesAmount: 0.45, TenureMonths: 0.28 }));

describe('ExperimentReports.GenerateMarkdownReport — numbers from stored records, each traced (M4.4)', () => {
  it('every number in the report traces to a stored row and recomputes from it', () => {
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel));
    expect(r.Numbers.length).toBeGreaterThan(0);
    for (const n of r.Numbers) {
      expect(r.Markdown).toContain(n.Text);
      expect(TracedNumbers.Recompute(n, StoredJson(n.Source))).toBeCloseTo(n.Value, 12);
    }
  });

  it('the report contains no fixed "honest holdout" sentence and no cvScore', () => {
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel));
    expect(r.Markdown).not.toMatch(/honest holdout/i);
    expect(r.Markdown).not.toContain('cvScore');
  });

  it('a missing stored metric renders "not measured", never a fallback number', () => {
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(WithoutPrimary(storedRun), storedModel));
    expect(r.Markdown).toContain('not measured');
    expect(r.Numbers.some((n) => n.Source.Path === '$.gate.intervals.modelVsDummy.value')).toBe(false);
  });

  it('every numeric token outside the Rank column is the Text of a traced number, for every stored outcome', () => {
    const runs: Array<{ run: RunRow | null; model: ModelRow | null }> = [
      { run: storedRun, model: storedModel },
      { run: searchRun('RUN-KEEP', { Outcome: 'keep-simple-baseline' }), model: storedModel },
      { run: searchRun('RUN-NOSIG', { Outcome: 'no-signal' }), model: null },
      { run: searchRun('RUN-LEAK', { Outcome: 'model', Scores: [inner('xgb', 0.4), inner('lr', 0.41), inner('rf', 0.43)], LeakageFlags: [{ kind: 'drop-column', sourceColumn: 'Dues', scoreDrop: 0.2 }] }), model: storedModel },
      { run: searchRun('RUN-NOGATE', { Outcome: 'model', StoreGate: false }), model: storedModel },
      { run: WithoutPrimary(storedRun), model: storedModel },
      { run: RefusedBy(storedRun, { kind: 'auc-interval-contains-chance', lower: 0.45, upper: 0.58 }), model: null },
      { run: gateOnlyRun('RUN-GATE-ONLY', { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null }, 'The model beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss); no simple baseline carries demonstrable signal.'), model: storedModel },
      { run: null, model: null },
    ];
    for (const { run, model } of runs) {
      const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(run, model));
      const texts = new Set(r.Numbers.map((n) => n.Text));
      for (const token of numericTokens(r.Markdown)) expect([run?.ID, token, texts.has(token)]).toEqual([run?.ID, token, true]);
      for (const n of r.Numbers) expect(TracedNumbers.Recompute(n, StoredJson(n.Source))).toBeCloseTo(n.Value, 12);
    }
  });

  it("renders the stored reason of an AUC interval that contains the coin-flip level, with only traced numbers in it", () => {
    const run = RefusedBy(storedRun, { kind: 'auc-interval-contains-chance', lower: 0.45, upper: 0.58 });
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(run, null));
    expect(r.Markdown).toContain("- **Why**: The model's AUC interval on the test set, [0.4500, 0.5800], contains the coin-flip level, so it does not ship.");
    expect(r.Numbers.filter((n) => n.Source.Path.startsWith('$.gate.guardRefusal.')).map((n) => [n.Text, n.Source.Path]))
      .toEqual([['0.4500', '$.gate.guardRefusal.lower'], ['0.5800', '$.gate.guardRefusal.upper']]);
  });

  it('a number tampered after it was read (score × 0.98) no longer recomputes from its stored row (the G3.7 mutation)', () => {
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel));
    const tampered = r.Numbers.map((n) => ({ ...n, Value: n.Value * 0.98 }));
    for (const n of tampered) {
      expect(Math.abs((TracedNumbers.Recompute(n, StoredJson(n.Source)) || 0) - n.Value)).toBeGreaterThan(1e-12);
    }
  });

  it("the executive summary's numbers are the verdict headline's, traced to the stored comparison", () => {
    const input = ReportInputFrom(storedRun, storedModel);
    const r = ExperimentReports.GenerateMarkdownReport(input);
    expect(r.Markdown).toContain(`## Executive Summary\n${input.Trust?.Headline}\n`);
    expect(r.Numbers.filter((n) => n.Source.Path.startsWith('$.gate.intervals.modelVsDummy.')).map((n) => n.Text)).toEqual(['0.0680', '0.0500', '0.0850', '0.068']);
  });

  it('states the selection score from the stored inner score and the leakage result from the stored flags (G3.8)', () => {
    const clean = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel));
    expect(clean.Markdown).toContain('- Selection score: the finalist **lr** scored 0.410 (inner-fold log-loss mean, optimistic).');
    expect(clean.Markdown).toContain('- Leakage audit: no flags raised.');
    expect(clean.Numbers.find((n) => n.Text === '0.410')?.Source.Path).toBe('$.trainer.innerScores[1].inner.value');

    const flagged = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-FLAGS', {
      Outcome: 'model',
      LeakageFlags: [{ kind: 'single-feature-auc', sourceColumn: 'A', heldOutAuc: 0.99 }, { kind: 'drop-column', sourceColumn: 'A', scoreDrop: 0.3 }, { kind: 'single-feature-auc', sourceColumn: 'B', heldOutAuc: 0.98 }],
    }), storedModel));
    expect(flagged.Markdown).toContain('- Leakage audit raised: single-feature-auc, drop-column.');

    const untrained = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(gateOnlyRun('RUN-NO-TRAINER', { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, 'Nothing beats the flat guess.'), null));
    expect(untrained.Markdown).toContain('- Selection score: not measured.');
    expect(untrained.Markdown).toContain('- Leakage audit: not run.');
  });

  it('InputFromRows builds the input a build makes from its stored rows: the verdict from the run and lineage, the status from the model (M4.5)', () => {
    const rows = { Name: 'Member Renewal Risk', Goal: 'Predict renewal', TargetVariable: 'Renewed', TargetMetric: 'AUC', Run: storedRun };
    const input = ExperimentReports.InputFromRows({ ...rows, Model: { ...storedModel, Status: 'KeepBaseline' } });
    expect(input).toEqual(ReportInputFrom(storedRun, storedModel, 'ready-to-publish'));
    expect(ExperimentReports.GenerateMarkdownReport(input)).toEqual(ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel, 'ready-to-publish')));
    expect(ExperimentReports.InputFromRows({ ...rows, Model: null })).toEqual(ReportInputFrom(storedRun, null, 'held'));
  });

  it('CatalogStatusOfModel reads Published as published, Validated and KeepBaseline as ready to publish, anything else as held', () => {
    const statuses: Array<[MJMLModelEntity['Status'] | null, CatalogStatus]> = [
      ['Published', 'published'], ['Validated', 'ready-to-publish'], ['KeepBaseline', 'ready-to-publish'], ['Draft', 'held'], ['Archived', 'held'], [null, 'held'],
    ];
    for (const [status, expected] of statuses) expect([status, ExperimentReports.CatalogStatusOfModel(status)]).toEqual([status, expected]);
  });

  it('traces each leaderboard cell and the interval level to the stored inner score of that candidate', () => {
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-ORDER', { Outcome: 'model', Scores: [inner('lr', 0.41), inner('xgb', 0.4)] }), storedModel));
    expect(r.Markdown).toContain('| 1 | xgb | 0.400 [0.380, 0.420] | Evaluated |');
    expect(r.Numbers.filter((n) => n.Text === '0.400' || n.Text === '0.380').map((n) => n.Source.Path)).toEqual(['$.trainer.innerScores[1].inner.value', '$.trainer.innerScores[1].inner.interval.lower']);
    expect(r.Numbers.find((n) => n.Text === '95%')?.Source.Path).toBe('$.trainer.innerScores[1].inner.interval.level');
  });

  it("traces feature weights to the model's stored FeatureImportance, in both stored shapes, and names an untraceable weight without a number", () => {
    const keyed = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel));
    expect(keyed.Markdown).toContain("- **DuesAmount**: 45.0% of the model's weight");
    expect(keyed.Numbers.find((n) => n.Text === '45.0%')?.Source).toEqual({ EntityName: 'MJ: ML Models', RecordID: 'MODEL-1', Path: '$["DuesAmount"]' });
    const listed = modelRow('MODEL-LIST', JSON.stringify([{ name: 'Tier', weight: 0.62 }, { feature: 'Region', importance: '0.38' }, 'Bare']));
    const r = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, listed));
    expect(r.Markdown).toContain("- **Tier**: 62.0% of the model's weight\n- **Region**: weight not recorded as a number\n- **Bare**: weight not recorded as a number");
    expect(r.Numbers.find((n) => n.Text === '62.0%')?.Source.Path).toBe('$[0].weight');
  });
});

describe('ExperimentReports.GenerateMarkdownReport — the report copy', () => {
  it('formats a structured markdown report with metrics and features', () => {
    const input = ReportInputFrom(storedRun, storedModel);
    const md = ExperimentReports.GenerateMarkdownReport(input).Markdown;
    expect(md).toContain('# Model Development Results: Member Renewal Risk');
    expect(md).toContain('**log-loss gain over the flat guess** = **0.068**');
    expect(md).toContain('DuesAmount');
    expect(md).toContain('Published to Catalog');
    expect(md).toContain('## Executive Summary\nBeats the flat guess by 0.0680 [0.0500, 0.0850] (log-loss).');
    expect(md).toContain('- **Outcome**: **Ships — the model beats the flat guess** (Published to Catalog)');
  });

  it('says the metric was not measured and names the not-evaluated outcome', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(WithoutPrimary(storedRun), storedModel, 'held')).Markdown;
    expect(md).toContain('**AUC** = **not measured**');
    expect(md).not.toMatch(/0\.850/);
    expect(md).toContain('**Outcome**: **Not evaluated yet** (Held for Review)');
    expect(md).not.toMatch(/Poor|Trust Grade/);
  });

  it('says nothing about picking a winner for a single-candidate build, and that its score comes from the held-back rows', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-ONE', { Outcome: 'model', Finalist: 'xgb', Scores: [inner('xgb', 0.4)] }), storedModel)).Markdown;
    expect(md).not.toMatch(/winner was picked/);
    expect(md).toContain('## Model Performance');
    expect(md).toContain('- The score comes from the rows held back from training.\n');
  });

  it('says a search picked its winner on optimistic inner-fold scores and read the held-back rows once, and prints each interval', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel)).Markdown;
    expect(md).toContain('The winner is the simplest candidate whose inner-fold score is within one standard error of the best; inner-fold scores are optimistic, and the held-back rows were read once, for the winner.');
    expect(md).toContain('| Rank | Algorithm | Inner-CV log-loss [95% interval] (optimistic) | Status |');
    expect(md).toContain('| 1 | xgb | 0.400 [0.380, 0.420] | Evaluated |');
    expect(md).toContain('| 2 | lr | 0.410 [0.390, 0.430] | 🏆 Winner (Selected) |');
    expect(md).toContain('## Winning Model Performance');
  });

  it('says a tournament with no measured candidate has no winner', () => {
    const run = searchRun('RUN-UNMEASURED', { Outcome: 'model', Scores: [inner('xgb', 0.123456), inner('lr', 0.123456)] });
    const unmeasured = storeRun('RUN-UNMEASURED-INF', (run.ValidationResults || '').split('"value":0.123456').join('"value":1e400'));
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(unmeasured, storedModel)).Markdown;
    expect(md).toContain('No candidate was measured, so no winner was picked.');
    expect(md).toContain('| 2 | lr | not measured | Not measured |');
    expect(md).toContain('The finalist is the simplest candidate');
    expect(md).not.toContain('🏆');
    expect(md).toContain('- Selection score: not measured.');
  });
});

describe('ExperimentReports.GenerateMarkdownReport — the stored gate outcome', () => {
  it('crowns no winner on a no-signal search and titles the section by the outcome with the stored reason', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-NS', { Outcome: 'no-signal' }), null, 'held')).Markdown;
    expect(md).not.toContain('🏆');
    expect(md).not.toMatch(/Winning Model|Winner/);
    expect(md).toContain('## No model shipped\n- **Why**: Neither the model (0.0040 [-0.0100, 0.0180]) nor any simple baseline beats the flat guess on log-loss: no signal.');
    expect(md).toContain('| 2 | lr | 0.410 [0.390, 0.430] | Finalist (not shipped) |');
    expect(md).toContain('The finalist is the simplest candidate');
  });

  it('titles the section "Kept a simple baseline" when the gate kept a baseline', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-KB', { Outcome: 'keep-simple-baseline' }), storedModel)).Markdown;
    expect(md).not.toContain('🏆');
    expect(md).toContain('## Kept a simple baseline\n- **Why**: The simple baseline glm beats the flat guess by 0.0650 [0.0480, 0.0820] (log-loss)');
  });

  it('keeps the winner wording when the stored outcome ships the finalist', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, storedModel)).Markdown;
    expect(md).toContain('## Winning Model Performance');
    expect(md).toContain('| 2 | lr | 0.410 [0.390, 0.430] | 🏆 Winner (Selected) |');
  });

  it('crowns no winner when the run stores no gate record, and reads the finalist as not evaluated', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(searchRun('RUN-NG', { Outcome: 'model', StoreGate: false }), storedModel, 'held')).Markdown;
    expect(md).not.toContain('🏆');
    expect(md).not.toMatch(/Winning|Winner|winner/);
    expect(md).toContain('## Selected Model Performance');
    expect(md).toContain('| 2 | lr | 0.410 [0.390, 0.430] | Finalist (not evaluated) |');
    expect(md).toContain('The finalist is the simplest candidate');
  });
});

describe('ExperimentReports — feature importance', () => {
  it('prints the hidden-list note instead of inventing a ranking when importance is hidden', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, modelRow('MODEL-SPLIT', JSON.stringify({ DuesAmount: 0.45 }), 'split_or_impurity'))).Markdown;
    expect(md).toContain('split or impurity counts');
    expect(md).not.toContain('DuesAmount');
    expect(md).not.toMatch(/Features analyzed from source entity/);
  });

  it('prints a plain no-weights note when a model recorded no importance weights', () => {
    const md = ExperimentReports.GenerateMarkdownReport(ReportInputFrom(storedRun, modelRow('MODEL-NONE', null, 'coefficient'))).Markdown;
    expect(md).toContain('No feature importance weights were recorded');
    expect(md).not.toContain('split or impurity counts');
  });

  it('parses a JSON object of key/value weights', () => {
    expect(ExperimentReports.ParseFeatureImportance('{"DuesAmount": 0.45, "TenureMonths": 0.28}')).toEqual([
      { feature: 'DuesAmount', importance: 0.45 },
      { feature: 'TenureMonths', importance: 0.28 },
    ]);
  });

  it('parses an array of feature/importance objects', () => {
    expect(ExperimentReports.ParseFeatureImportance(JSON.stringify([{ feature: 'LeadTimeDays', importance: 0.62 }, { name: 'Tier', weight: '0.38' }, 'Bare']))).toEqual([
      { feature: 'LeadTimeDays', importance: 0.62 },
      { feature: 'Tier', importance: 0.38 },
      { feature: 'Bare', importance: 0 },
    ]);
  });

  it('handles null, undefined and malformed JSON', () => {
    expect(ExperimentReports.ParseFeatureImportance(null)).toEqual([]);
    expect(ExperimentReports.ParseFeatureImportance(undefined)).toEqual([]);
    expect(ExperimentReports.ParseFeatureImportance('invalid json')).toEqual([]);
  });

  it('explains split/impurity counts for a tree model, and uses neutral wording for any other kind', () => {
    const lineage = (kind: string | null): string => JSON.stringify({ evaluation: { ImportanceKind: kind } });
    expect(ExperimentReports.HiddenImportanceNote(lineage('split_or_impurity'))).toBe(ImportanceDisplay.HiddenNote);
    expect(ExperimentReports.HiddenImportanceNote(lineage('none'))).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(ExperimentReports.HiddenImportanceNote(lineage(null))).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(ExperimentReports.HiddenImportanceNote(null)).toBe(UNSHOWN_IMPORTANCE_KIND_NOTE);
    expect(UNSHOWN_IMPORTANCE_KIND_NOTE).not.toContain('split or impurity');
  });
});

const shippedRun = gateOnlyRun('run-1', { outcome: 'model', branch: 'a:Q15-only-model-beats-dummy', shipped: 'xgb', shippedRole: 'model', note: null }, 'The model beats the flat guess.');
const shippedTrust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: shippedRun.ValidationResults, Lineage: null });
const noSignalTrust = TrustVerdicts.DeriveTrustVerdict({
  ValidationResults: gateOnlyRun('run-ns', { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null }, 'Nothing beats the flat guess, so nothing ships.').ValidationResults,
  Lineage: null,
});
const published: BuildPredictionResult = {
  success: true, pipelineId: 'p1', modelId: 'm1', published: true, readyToPublish: false, heldReason: null, errorMessage: null, trust: shippedTrust,
};
const held: BuildPredictionResult = {
  success: true, pipelineId: 'p2', modelId: 'm2', published: false, readyToPublish: false, errorMessage: null,
  heldReason: noSignalTrust.Reason, trust: noSignalTrust,
};
const failed: BuildPredictionResult = { success: false, published: false, readyToPublish: false, heldReason: null, errorMessage: 'Algorithm not found' };
/** The outcome the agent projects from a build result. */
const summarize = (r: BuildPredictionResult) => PredictiveStudioPipelineBuilderAgent.SummarizeBuildResult(r);
/** The sentence the agent says for a build result. */
const messageOf = (r: BuildPredictionResult): string => PredictiveStudioPipelineBuilderAgent.BuildOutcomeMessage(summarize(r));

describe('PredictiveStudioPipelineBuilderAgent.SummarizeBuildResult', () => {
  it('projects a published result', () => {
    expect(summarize(published)).toMatchObject({
      success: true, pipelineId: 'p1', modelId: 'm1', published: true, readyToPublish: false, heldReason: null, errorMessage: null,
      trustTitle: 'Ships — the model beats the flat guess', headline: 'Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).',
    });
  });
  it('projects a HELD result, carrying the stored reason (the safety gate)', () => {
    const o = summarize(held);
    expect(o.published).toBe(false);
    expect([o.trustTitle, o.headline]).toEqual(['No signal — not usable', 'No signal: nothing beats the flat guess.']);
    expect(o.heldReason).toBe('Nothing beats the flat guess, so nothing ships.');
  });
  it('projects no title or headline when the build trained no model', () => {
    const o = summarize({ ...held, trust: undefined });
    expect([o.trustTitle, o.headline]).toEqual([undefined, undefined]);
  });
  it('projects a failed build', () => {
    expect(summarize(failed)).toMatchObject({ success: false, published: false, readyToPublish: false, errorMessage: 'Algorithm not found' });
  });
});

describe('PredictiveStudioPipelineBuilderAgent.BuildOutcomeMessage', () => {
  it('describes published / held / failed in plain language', () => {
    expect(messageOf(published)).toBe("Done — I built and published your prediction (Ships — the model beats the flat guess). It's now in your Predictions.");
    expect(messageOf(held)).toMatch(/holding it back/i);
    expect(messageOf(failed)).toMatch(/couldn't build/i);
  });

  it('never renders double periods on held messages whether heldReason has trailing period or not', () => {
    const msg1 = messageOf({ ...held, heldReason: 'Accuracy too low to trust' });
    expect(msg1).not.toContain('..');
    expect(msg1).toContain('Accuracy too low to trust.');
    const msg2 = messageOf({ ...held, heldReason: 'Accuracy too low to trust.' });
    expect(msg2).not.toContain('..');
    expect(msg2).toContain('Accuracy too low to trust.');
    const msg3 = messageOf({ ...held, heldReason: null });
    expect(msg3).not.toContain('..');
    expect(msg3).toContain('it needs review before it can be published.');
  });

  it('projects a result with warnings and surfaces them in the message', () => {
    const withWarnings: BuildPredictionResult = { ...published, warnings: [{ FeatureName: 'JobTitleNorm', Kind: 'llm-derived', Reason: 'Requires upstream Feature Pipeline' }] };
    const summary = summarize(withWarnings);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings?.[0].FeatureName).toBe('JobTitleNorm');
    expect(messageOf(withWarnings)).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(messageOf(withWarnings)).toContain('JobTitleNorm: Requires upstream Feature Pipeline');
  });

  it('surfaces warnings even on a failed build outcome', () => {
    const failedWithWarnings: BuildPredictionResult = { ...failed, warnings: [{ FeatureName: 'UnmappedCol', Kind: 'embedding', Reason: 'Dedicated vector step needed' }] };
    const summary = summarize(failedWithWarnings);
    expect(summary.success).toBe(false);
    expect(summary.warnings).toHaveLength(1);
    const msg = messageOf(failedWithWarnings);
    expect(msg).toContain("I couldn't build the prediction: Algorithm not found.");
    expect(msg).toContain('Note: 1 candidate feature(s) could not be mapped to pipeline steps');
    expect(msg).toContain('UnmappedCol: Dedicated vector step needed');
  });
});

describe('PredictiveStudioPipelineBuilder.ResolveEntity', () => {
  it('resolves entity by name, baseView, baseTable, schema prefix, and stripped prefix', () => {
    const fakeEntity = new EntityInfo({ ID: 'E1', Name: 'MJ: AI Prompt Runs', BaseView: 'vwAIPromptRuns', BaseTable: 'AIPromptRun', SchemaName: '__mj' });
    const fakeProvider: Pick<IMetadataProvider, 'EntityByName' | 'Entities'> = {
      EntityByName: (n: string) => (n.toLowerCase() === fakeEntity.Name.toLowerCase() ? fakeEntity : undefined),
      Entities: [fakeEntity],
    };
    for (const name of ['MJ: AI Prompt Runs', 'vwAIPromptRuns', 'AIPromptRun', '__mj.vwAIPromptRuns', 'AI Prompt Runs']) {
      expect(PredictiveStudioPipelineBuilder.ResolveEntity(name, fakeProvider)?.ID).toBe('E1');
    }
    expect(PredictiveStudioPipelineBuilder.ResolveEntity('NonExistentEntity', fakeProvider)).toBeUndefined();
  });
});

/** The model slice the agent reads off a build result. */
function trainedModel(id: string): MJMLModelEntity {
  return {
    ID: id, Version: 1, Metrics: null, HoldoutMetrics: null, ProblemType: 'classification',
    FeatureImportance: null, Lineage: JSON.stringify({ evaluation: { ImportanceKind: 'split_or_impurity' } }),
  } as unknown as MJMLModelEntity;
}

/** A one-row leaderboard over the run's stored comparison with the flat guess (null when the run stores none). */
function oneRowLeaderboard(model: MJMLModelEntity, comparison: TrustComparison | null): MLLeaderboardEntryPayload[] {
  const score = comparison === null ? null : comparison.Value;
  return [{
    IterationID: 'run-1', Metric: score, ModelID: model.ID, rank: 1, algorithm: 'XGBoost', featureSet: 'Pipeline feature set', score,
    metricName: comparison === null ? null : comparison.Metric, innerLower: null, innerUpper: null, optimistic: false, modelId: model.ID, isWinner: score !== null,
  }];
}

/** A builder stub that "trains" one model whose run stores no results. */
class UnmeasuredBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const model = trainedModel('model-unmeasured');
    const trust = TrustVerdicts.DeriveTrustVerdict({ ValidationResults: null, Lineage: null });
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust, published: false, readyToPublish: false,
      heldReason: trust.Reason, errorMessage: null, leaderboard: oneRowLeaderboard(model, trust.Comparison), run: { ID: 'run-unmeasured', ValidationResults: null },
    };
  }
}

/** A builder stub whose one model's run stores a gate decision that ships it. */
class ShippedBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    const model = trainedModel('model-shipped');
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust: shippedTrust, published: true, readyToPublish: false,
      heldReason: null, errorMessage: null, leaderboard: oneRowLeaderboard(model, shippedTrust.Comparison), run: shippedRun,
    };
  }
}

/** A builder stub whose search shipped nothing: the stored outcome is no-signal, with its stored reason. */
class NoSignalSearchBuilder extends PredictiveStudioPipelineBuilder {
  public override async Build(_input: BuildPredictionInput): Promise<BuildPredictionResult> {
    return {
      success: true, pipelineId: 'pipe-1', published: false, readyToPublish: false, errorMessage: null,
      leaderboard: [{ IterationID: 'run-1', Metric: 0.41, rank: 1, algorithm: 'xgb', score: 0.41, metricName: 'log-loss', innerLower: 0.39, innerUpper: 0.43, optimistic: true, isWinner: true }],
      heldReason: 'Not published — the training run shipped no model: no signal.',
      Gate: { Outcome: 'no-signal', Reason: TrainerResultFixtures.NoSignalReason },
      run: searchRun('run-no-signal', { Outcome: 'no-signal' }),
    };
  }
}

/** The agent with the builder seam stubbed and a provider supplied, exposing the protected run. */
class TestableBuilderAgent extends PredictiveStudioPipelineBuilderAgent {
  constructor(
    private readonly builder: PredictiveStudioPipelineBuilder = new UnmeasuredBuilder(),
    private readonly heldApproval: BuildApproval | BuildApprovalRefusal | null = null,
  ) {
    super();
  }
  protected override createBuilder(): PredictiveStudioPipelineBuilder {
    return this.builder;
  }
  /** The approval the run holds: the test's, instead of the claim row the orchestrator's dispatch names. */
  protected override async ResolveHeldApproval(): Promise<BuildApproval | BuildApprovalRefusal | null> {
    return this.heldApproval;
  }
  protected override get ProviderToUse(): IMetadataProvider {
    return new DatabaseProviderStub();
  }
  /**
   * Runs the agent's build step. By default the run is what the truth suite's gate runs are: a top-level run whose
   * caller the server trusts (`TrustReservedRunData`); `run` makes it an untrusted caller's or a sub-agent's run.
   */
  public async Run(payload: PredictiveStudioBuilderPayload, data?: ExecuteAgentParams['data'], run: BuilderTestRun = TrustedTopLevelRun): Promise<BaseAgentNextStep<PredictiveStudioBuilderPayload>> {
    const params = {
      payload,
      contextUser: new UserInfo(null, { ID: 'user-1', Email: 'builder-agent-tests@example.com', Type: 'User' }),
      data,
      TrustReservedRunData: run.Trusted,
      parentRun: run.SubAgent ? { ID: 'parent-run-1' } : undefined,
    } as unknown as ExecuteAgentParams;
    const { finalStep } = await this.executeAgentInternal<PredictiveStudioBuilderPayload>(params, {} as AgentConfiguration);
    return finalStep;
  }
}

/** Who started a test run: whether the server trusts its caller, and whether a parent agent called it. */
interface BuilderTestRun {
  readonly Trusted: boolean;
  readonly SubAgent: boolean;
}

/** A top-level run by a trusted caller (the system user, or an API key holding `agent:trusted`). */
const TrustedTopLevelRun: BuilderTestRun = { Trusted: true, SubAgent: false };

/** The approval an orchestrator's claimed dispatch hands its Pipeline Builder (A2, D-090). */
const HELD_APPROVAL: BuildApproval = {
  planId: 'plan-1', planHash: 'a'.repeat(64), approvedBy: { kind: 'human', userId: 'user-1' },
  conversationDetailId: null, approvedAt: '2026-11-26T10:00:00.000Z', requestId: 'request-1',
};

/** The payload a step wrote; a step without one fails the test. */
function payloadOf(step: BaseAgentNextStep<PredictiveStudioBuilderPayload>): PredictiveStudioBuilderPayload {
  if (step.newPayload === undefined) throw new Error('the step wrote no payload');
  return step.newPayload;
}

const plan: ModelingPlanSpec = {
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [],
  CandidateFeatures: [],
  LeakageNotes: [],
  ProposedExperiments: [{ Label: 'x', AlgorithmName: 'XGBoost', FeatureSet: [], Rationale: 'r', Priority: 1 }],
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
};

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — unmeasured model', () => {
  it('reports the model as not measured, with no score and no winner', async () => {
    const payload = payloadOf(await new TestableBuilderAgent().Run({ ...plan }));
    expect(payload.Leaderboard).toEqual([expect.objectContaining({ Metric: null, score: null, isWinner: false })]);
    expect(payload.Markdown).not.toContain('🏆');
    expect(payload.Markdown).not.toMatch(/0\.850|0\.833/);
    expect(payload.Markdown).toContain('**AUC** = **not measured**');
    expect(payload.Markdown).toContain('**Outcome**: **Not evaluated yet** (Held for Review)');
    expect(payload.Markdown).toContain('- Selection score: not measured.\n- Leakage audit: not run.');
    expect(payload.Summary).toBe('Not evaluated yet.');
  });
});

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — a shipped model', () => {
  it("reports the stored comparison with the flat guess, its metric, the outcome title and the verdict's headline", async () => {
    const payload = payloadOf(await new TestableBuilderAgent(new ShippedBuilder()).Run({ ...plan }));
    expect(payload.Leaderboard).toEqual([expect.objectContaining({ Metric: 0.02, score: 0.02, metricName: 'log-loss', isWinner: true })]);
    expect(payload.Markdown).toContain('**log-loss gain over the flat guess** = **0.020**');
    expect(payload.Markdown).toContain('**Outcome**: **Ships — the model beats the flat guess** (Published to Catalog)');
    expect(payload.Summary).toBe('Beats the flat guess by 0.0200 [0.0100, 0.0300] (log-loss).');
    expect(payload.TargetMetric).toBe('AUC');
  });

  it('writes the same Markdown the report generates from the stored rows, and puts no traced numbers in the payload', async () => {
    const payload = payloadOf(await new TestableBuilderAgent(new ShippedBuilder()).Run({ ...plan }));
    const model = trainedModel('model-shipped');
    const report = ExperimentReports.GenerateMarkdownReport({
      Name: 'Renewed Prediction', Goal: 'Predict renewal', TargetVariable: 'Renewed', TargetMetric: 'AUC', Run: shippedRun,
      Model: { ID: model.ID, FeatureImportance: model.FeatureImportance, Lineage: model.Lineage }, Trust: shippedTrust, Status: 'published',
    });
    expect(payload.Markdown).toBe(report.Markdown);
    expect('Numbers' in payload).toBe(false);
  });
});

/** A builder stub whose training run shipped no model (the gate decided no-signal): built, held with the stored reason. */
class NoModelBuilder extends PredictiveStudioPipelineBuilder {
  public Specs: ModelingPlanSpec[] = [];
  public override async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    this.Specs.push(input.spec);
    return {
      success: true, pipelineId: 'pipe-1', published: false, readyToPublish: false, errorMessage: null, leaderboard: [],
      heldReason: 'Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.',
      Gate: { Outcome: 'no-signal', Reason: 'Neither the model nor any simple baseline beats the flat guess.' },
    };
  }
}

describe('PredictiveStudioPipelineBuilderAgent.executeAgentInternal — a build that shipped no model', () => {
  it('names no best model and no version, and says why nothing shipped', async () => {
    const step = await new TestableBuilderAgent(new NoModelBuilder()).Run({ ...plan });
    const payload = payloadOf(step);
    expect([payload.BestModel, payload.BestModelID]).toEqual([undefined, undefined]);
    expect(payload.Summary).toBe("I built and trained the prediction, but I'm holding it back: Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.");
    expect(step.reasoning).toBe(payload.Summary);
    expect(payload.Markdown).toContain('**Outcome**: **No model shipped** (Held for Review)');
  });

  it("carries the run's stored gate outcome and reason, so the artifact can title its card by them", async () => {
    const payload = payloadOf(await new TestableBuilderAgent(new NoModelBuilder()).Run({ ...plan }));
    expect([payload.GateOutcome, payload.GateReason]).toEqual(['no-signal', 'Neither the model nor any simple baseline beats the flat guess.']);
  });

  it("writes the report tab without a winner when the search's stored outcome shipped nothing", async () => {
    const payload = payloadOf(await new TestableBuilderAgent(new NoSignalSearchBuilder()).Run({ ...plan }));
    expect(payload.Markdown).not.toContain('🏆');
    expect(payload.Markdown).toContain(`## No model shipped\n- **Why**: ${TrainerResultFixtures.NoSignalReason}`);
  });

  it('carries no gate outcome for a build whose run stores no gate record', async () => {
    const payload = payloadOf(await new TestableBuilderAgent().Run({ ...plan }));
    expect([payload.GateOutcome, payload.GateReason]).toEqual([undefined, undefined]);
  });

  it("builds from the plan without a previous build's results leaderboard", async () => {
    const builder = new NoModelBuilder();
    const previous: MLLeaderboardEntryPayload = { IterationID: 'run-0', Metric: null, score: null, isWinner: false };
    await new TestableBuilderAgent(builder).Run({ ...plan, Leaderboard: [previous] });
    expect(builder.Specs).toHaveLength(1);
    expect('Leaderboard' in builder.Specs[0]).toBe(false);
    expect(builder.Specs[0].Goal).toBe('Predict renewal');
  });
});

/** A builder stub that records whether the agent asked it to publish, and evaluates a model that clears the bar without publishing it. */
class DraftBuilder extends PredictiveStudioPipelineBuilder {
  public AutoPublish: (boolean | undefined)[] = [];
  public ProtocolPromotion: BuildPredictionInput['protocolPromotion'][] = [];
  public override async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    this.AutoPublish.push(input.autoPublish);
    this.ProtocolPromotion.push(input.protocolPromotion);
    const model = trainedModel('model-draft');
    return {
      success: true, pipelineId: 'pipe-1', modelId: model.ID, model, trust: shippedTrust, published: false, readyToPublish: true,
      heldReason: PredictiveStudioPipelineBuilder.KeptInDraftReason, errorMessage: null, leaderboard: [], run: shippedRun,
    };
  }
}

describe('PredictiveStudioPipelineBuilderAgent — publishing', () => {
  it('builds with publishing off unless the run data turns it on', async () => {
    const builder = new DraftBuilder();
    await new TestableBuilderAgent(builder).Run({ ...plan });
    await new TestableBuilderAgent(builder).Run({ ...plan }, { [PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY]: true });
    expect(builder.AutoPublish).toEqual([false, true]);
  });

  it('publishes and promotes only for a trusted caller: an untrusted run builds with both switches off', async () => {
    const builder = new DraftBuilder();
    const data = {
      [PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY]: true,
      [PredictiveStudioPipelineBuilderAgent.PROTOCOL_PROMOTION_DATA_KEY]: { autoPublishKeepBaseline: true },
    };
    await new TestableBuilderAgent(builder, HELD_APPROVAL).Run({ ...plan }, data, { Trusted: false, SubAgent: false });
    await new TestableBuilderAgent(builder).Run({ ...plan }, data, TrustedTopLevelRun);
    expect(builder.AutoPublish).toEqual([false, true]);
    expect(builder.ProtocolPromotion).toEqual([null, { autoPublishKeepBaseline: true }]);
  });

  it('never publishes or promotes as a sub-agent, even under a trusted root: a parent model writes its data', async () => {
    const builder = new DraftBuilder();
    const data = {
      [PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY]: true,
      [PredictiveStudioPipelineBuilderAgent.PROTOCOL_PROMOTION_DATA_KEY]: { autoPublishKeepBaseline: true },
    };
    await new TestableBuilderAgent(builder, HELD_APPROVAL).Run({ ...plan }, data, { Trusted: true, SubAgent: true });
    expect(builder.AutoPublish).toEqual([false]);
    expect(builder.ProtocolPromotion).toEqual([null]);
  });

  it('ignores a payload that asks to publish: only the run data turns publishing on', async () => {
    const builder = new DraftBuilder();
    await new TestableBuilderAgent(builder).Run(Object.assign({ ...plan }, { [PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY]: true }));
    expect(builder.AutoPublish).toEqual([false]);
  });

  it('turns publishing on only for the boolean true', () => {
    const key = PredictiveStudioPipelineBuilderAgent.AUTO_PUBLISH_DATA_KEY;
    expect([undefined, {}, { [key]: false }, { [key]: 'true' }, { [key]: 1 }, { [key]: true }].map((data) => PredictiveStudioPipelineBuilderAgent.AutoPublishOf({ data, TrustReservedRunData: true })))
      .toEqual([false, false, false, false, false, true]);
    expect(PredictiveStudioPipelineBuilderAgent.AutoPublishOf({ data: { [key]: true } })).toBe(false);
  });

  it('supplies the protocol promotion setting the run data holds, and none otherwise', async () => {
    const builder = new DraftBuilder();
    const key = PredictiveStudioPipelineBuilderAgent.PROTOCOL_PROMOTION_DATA_KEY;
    await new TestableBuilderAgent(builder).Run({ ...plan });
    await new TestableBuilderAgent(builder).Run({ ...plan }, { [key]: { autoPublishKeepBaseline: true } });
    await new TestableBuilderAgent(builder).Run(Object.assign({ ...plan }, { [key]: { autoPublishKeepBaseline: true } }));
    expect(builder.ProtocolPromotion).toEqual([null, { autoPublishKeepBaseline: true }, null]);
  });

  it('reads the protocol promotion setting only from an object whose autoPublishKeepBaseline is the boolean true', () => {
    const key = PredictiveStudioPipelineBuilderAgent.PROTOCOL_PROMOTION_DATA_KEY;
    const data = [undefined, {}, { [key]: true }, { [key]: null }, { [key]: {} }, { [key]: { autoPublishKeepBaseline: 'true' } }, { [key]: { autoPublishKeepBaseline: false } },
      { [key]: { autoPublishKeepBaseline: true, requiresHumanSignOff: true } }];
    expect(data.map((d) => PredictiveStudioPipelineBuilderAgent.ProtocolPromotionOf({ data: d, TrustReservedRunData: true })))
      .toEqual([null, null, null, null, null, null, null, { autoPublishKeepBaseline: true }]);
    expect(PredictiveStudioPipelineBuilderAgent.ProtocolPromotionOf({ data: { [key]: { autoPublishKeepBaseline: true } } })).toBeNull();
  });

  it('reports an evaluated model that clears the bar as ready to publish, in the outcome, the message and the report', async () => {
    const step = await new TestableBuilderAgent(new DraftBuilder()).Run({ ...plan });
    const payload = payloadOf(step);
    expect([payload.BuildResult?.published, payload.BuildResult?.readyToPublish]).toEqual([false, true]);
    expect(payload.Markdown).toContain('(Evaluated — ready to publish when you ask)');
    expect(step.reasoning).toBe('Done — I built and trained your prediction (Ships — the model beats the flat guess). It clears the bar to publish; it is published only when you ask.');
  });

  it('names each catalog status', () => {
    expect([
      PredictiveStudioPipelineBuilderAgent.CatalogStatusOf({ published: true, readyToPublish: false }),
      PredictiveStudioPipelineBuilderAgent.CatalogStatusOf({ published: false, readyToPublish: true }),
      PredictiveStudioPipelineBuilderAgent.CatalogStatusOf({ published: false, readyToPublish: false }),
    ]).toEqual(['published', 'ready-to-publish', 'held']);
  });
});

/** A builder that counts its builds: a refused run never reaches it, so it never writes a pipeline row. */
class CountingBuilder extends DraftBuilder {
  public Builds = 0;
  public override async Build(input: BuildPredictionInput): Promise<BuildPredictionResult> {
    this.Builds++;
    return super.Build(input);
  }
}

describe('A2 attack 8: the Pipeline Builder builds only on an approval or the trusted harness run', () => {
  it('entered as a sub-agent (not trusted) with no approval → refuses before any pipeline row is written', async () => {
    const builder = new CountingBuilder();
    const step = await new TestableBuilderAgent(builder, null).Run({ ...plan }, undefined, { Trusted: false, SubAgent: true });
    expect(builder.Builds).toBe(0);
    expect(step.step).toBe('Failed');
    expect(step.newPayload?.BuildResult).toBeUndefined();
  });

  it('entered as a sub-agent under a trusted root with no approval → refuses (trust is the top-level harness run only)', async () => {
    const builder = new CountingBuilder();
    await new TestableBuilderAgent(builder, null).Run({ ...plan }, undefined, { Trusted: true, SubAgent: true });
    expect(builder.Builds).toBe(0);
  });

  it('a refusal (consumed, plan-changed) is not an approval', async () => {
    for (const refusal of [{ kind: 'consumed', claimId: 'c' }, { kind: 'plan-changed', approvedHash: 'a', currentHash: 'b' }] as const) {
      const builder = new CountingBuilder();
      await new TestableBuilderAgent(builder, refusal).Run({ ...plan }, undefined, { Trusted: false, SubAgent: true });
      expect(builder.Builds).toBe(0);
    }
  });

  it('a payload carrying an approval-looking object grants nothing (the approval is read from the claim, not the payload)', async () => {
    const builder = new CountingBuilder();
    await new TestableBuilderAgent(builder, null).Run(Object.assign({ ...plan }, { BuildApproval: HELD_APPROVAL, Approved: true }), undefined, { Trusted: false, SubAgent: true });
    expect(builder.Builds).toBe(0);
  });

  it('with the approval its parent claimed → builds once', async () => {
    const builder = new CountingBuilder();
    await new TestableBuilderAgent(builder, HELD_APPROVAL).Run({ ...plan }, undefined, { Trusted: false, SubAgent: true });
    expect(builder.Builds).toBe(1);
  });

  it('the trusted top-level harness run (HarnessAgent.RunBuilderAgent) builds exactly as before, with no approval', async () => {
    const builder = new CountingBuilder();
    await new TestableBuilderAgent(builder, null).Run({ ...plan });
    expect(builder.Builds).toBe(1);
  });

  it('BuildAllowed is ReadsPublishingSwitches(params) or a BuildApproval', () => {
    const allowed = (trusted: boolean, sub: boolean, approval: BuildApproval | BuildApprovalRefusal | null): boolean =>
      PredictiveStudioPipelineBuilderAgent.BuildAllowed({ TrustReservedRunData: trusted, parentRun: sub ? ({ ID: 'p' } as unknown as ExecuteAgentParams['parentRun']) : undefined }, approval);
    expect(allowed(true, false, null)).toBe(true);
    expect(allowed(true, true, null)).toBe(false);
    expect(allowed(false, false, null)).toBe(false);
    expect(allowed(false, true, HELD_APPROVAL)).toBe(true);
    expect(allowed(false, true, { kind: 'no-request' })).toBe(false);
  });
});

describe('A2 attack 9: a GraphQL RunAIAgent call naming the Pipeline Builder directly (top level, not trusted)', () => {
  it('builds nothing without an approval', async () => {
    const builder = new CountingBuilder();
    const step = await new TestableBuilderAgent(builder, null).Run({ ...plan }, undefined, { Trusted: false, SubAgent: false });
    expect(builder.Builds).toBe(0);
    expect(step.step).toBe('Failed');
  });
});
