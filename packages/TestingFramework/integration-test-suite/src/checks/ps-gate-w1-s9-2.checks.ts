/**
 * Gate G3.8 "W1 → S9.2" (owner PR 4, phase 3): the agent report for W1-signal s42 states the selection score and the
 * leakage result from stored rows, and holds 0 fixed "honest holdout" sentences and 0 `cvScore` values. The agent is a
 * Pipeline Builder run on W1-signal s42 (logistic regression); the gate reads the report the run delivered (its
 * payload's Markdown) and:
 *
 * - counts "honest holdout" (any case) and `cvScore` in it: 0 each;
 * - regenerates the report from the build's stored rows (its model, and the training run that produced it) and finds
 *   every regenerated number's token in the delivered text, and every numeric token of the delivered text (outside the
 *   leaderboard's Rank cells and the plan, candidate and feature names) among the regenerated tokens;
 * - recomputes the selection-score sentence's number from the stored finalist's inner score
 *   (`$.trainer.innerScores[<finalist>].inner.value`);
 * - matches the leakage sentence to the stored `trainer.leakageFlags` ("no flags raised", or each flag kind named).
 */
import { RunView } from '@memberjunction/core';
import type { MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { TracedNumbers, TrainingRunResultsParser, TrustVerdicts, type ModelingPlanSpec, type StoredTrainerResult } from '@memberjunction/predictive-studio-core';
import { ExperimentReports } from '@memberjunction/predictive-studio';
import { AgentPlans, W_WORLD_DENY_FIELDS, W_WORLD_FEATURES, type AgentStepResult, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { TracedNumberChecks, type ReportWords, type StoredReport } from './ps-gates/ps-gate-traced-numbers';

/** The selection-score sentence the report states for a measured finalist. */
const SELECTION_SENTENCE = /- Selection score: the finalist \*\*(.+?)\*\* scored (-?\d[\d,]*(?:\.\d+)?) \(inner-fold \S+ mean, optimistic\)\./;

/** What the selection-score sentence was checked against. */
interface SelectionCheck {
  readonly Recomputed: boolean;
  readonly Detail: string;
}

/** G3.8's reads and checks. */
class PsGateW1S92Steps {
  /** The report's words, as the builder's `ReportPayload` takes them from the plan. */
  public static WordsOf(plan: ModelingPlanSpec): ReportWords {
    const target = plan.TargetDefinition?.TargetVariable || 'Target';
    const regression = plan.TargetDefinition?.ProblemType === 'regression';
    return {
      Name: plan.Name || `${target} Prediction`, Goal: plan.Goal || `Predict ${target}`, TargetVariable: target,
      TargetMetric: plan.TargetDefinition?.SuccessMetric || (regression ? 'R²' : 'AUC'),
    };
  }

  /** The training run that produced the build's model; throws when the build trained none. */
  public static async RunOf(h: TruthHarness, build: AgentStepResult): Promise<string> {
    const modelId = build.BuildModelID;
    if (!modelId) throw new Error(`G3.8: the build trained no model (${build.BuildErrorMessage || 'no error message'})`);
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ResultingModelID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'ResultingModelID'], ResultType: 'simple', BypassCache: true }, h.User);
    const run = r.Results[0];
    if (!r.Success || !run) throw new Error(`G3.8: no training run names ML Model ${modelId}: ${r.ErrorMessage || 'none'}`);
    return run.ID;
  }

  /** The stored trainer result of the report's run; throws when the run stores none. */
  public static Trainer(stored: StoredReport): StoredTrainerResult {
    const run = stored.Input.Run;
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run === null ? null : run.ValidationResults);
    if (parsed.Ok === false) throw new Error(`G3.8: the run's ValidationResults do not parse: ${parsed.Errors.join('; ')}`);
    if (parsed.Value.status !== 'completed' || parsed.Value.trainer === null) throw new Error('G3.8: the run stores no trainer result');
    return parsed.Value.trainer;
  }

  /** The names in the report that are words, not measurements: the plan's name and target, candidates, features. */
  public static Names(stored: StoredReport, trainer: StoredTrainerResult): string[] {
    const features = ExperimentReports.ParseFeatureImportance(stored.Input.Model === null ? null : stored.Input.Model.FeatureImportance).map((f) => f.feature);
    return [stored.Input.Name, stored.Input.TargetVariable, ...trainer.innerScores.map((s) => s.candidate), ...features];
  }

  /** The selection-score sentence's number against the stored finalist's inner-score mean. */
  public static Selection(markdown: string, stored: StoredReport, trainer: StoredTrainerResult): SelectionCheck {
    const m = SELECTION_SENTENCE.exec(markdown);
    if (m === null) return { Recomputed: false, Detail: 'no selection-score sentence' };
    const index = trainer.innerScores.findIndex((s) => s.candidate === trainer.finalist);
    const run = stored.Input.Run;
    if (index < 0 || run === null || run.ValidationResults === null) return { Recomputed: false, Detail: `the finalist ${trainer.finalist} has no stored inner score` };
    const path = `$.trainer.innerScores[${index}].inner.value`;
    const n = TracedNumbers.FromStoredPath(TrustVerdicts.RunEntityName, run.ID, run.ValidationResults, path, (v) => v.toFixed(3));
    const ok = n !== null && m[1] === trainer.finalist && m[2] === n.Text && TracedNumberChecks.TokenAgrees({ ...n, Text: m[2] });
    return { Recomputed: ok, Detail: `the sentence names ${m[1]} at ${m[2]}; the stored finalist ${trainer.finalist} at ${path} is ${n === null ? 'not a number' : n.Value}` };
  }

  /** The leakage sentence the stored flags call for. */
  public static LeakageSentence(trainer: StoredTrainerResult): string {
    const kinds = [...new Set(trainer.leakageFlags.map((f) => f.kind))];
    return kinds.length === 0 ? '- Leakage audit: no flags raised.' : `- Leakage audit raised: ${kinds.join(', ')}.`;
  }

  /** How often `pattern` matches `text`. */
  public static Count(text: string, pattern: RegExp): number {
    return (text.match(pattern) || []).length;
  }
}

export const PsGateW1S92Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-2.G3.8', Name: 'G3.8 W1 → S9.2: the W1 s42 agent report states the selection score and the leakage result from stored rows, with 0 "honest holdout" sentences and 0 cvScore', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const plan = AgentPlans.Build({
        Name: `PSTruth: G3.8 W1 s42 ${h.RunID}`, Entity: w1.Entity, Target: 'Renewed', Features: [...W_WORLD_FEATURES], Algorithms: ['logistic_regression'], DenyFields: [...W_WORLD_DENY_FIELDS],
      });
      const build = await h.RunBuilderAgent(plan);
      if (!build.AgentSuccess || build.ReportMarkdown === null) throw new Error(`G3.8: builder agent run ${build.AgentRunID || '(none)'} delivered no report: ${build.AgentErrorMessage || build.BuildErrorMessage || 'no error message'}`);
      const delivered = build.ReportMarkdown;
      const stored = await TracedNumberChecks.RegenerateReport(h, PsGateW1S92Steps.WordsOf(plan), await PsGateW1S92Steps.RunOf(h, build), build.BuildModelID);
      const trainer = PsGateW1S92Steps.Trainer(stored);
      const texts = new Set(stored.Report.Numbers.map((n) => n.Text));
      const missing = stored.Report.Numbers.filter((n) => !delivered.includes(n.Text)).map((n) => n.Text);
      const tokens = TracedNumberChecks.NumericTokens(delivered, PsGateW1S92Steps.Names(stored, trainer));
      const untraced = tokens.filter((t) => !texts.has(t));
      const honest = PsGateW1S92Steps.Count(delivered, /honest holdout/gi);
      const cvScore = PsGateW1S92Steps.Count(delivered, /cvScore/g);
      const selection = PsGateW1S92Steps.Selection(delivered, stored, trainer);
      const leakage = PsGateW1S92Steps.LeakageSentence(trainer);
      const leakageMatches = delivered.includes(leakage);
      PsGate.Assert({
        Passed: honest === 0 && cvScore === 0 && missing.length === 0 && untraced.length === 0 && selection.Recomputed && leakageMatches,
        Measured: {
          honestHoldout: honest, cvScore, numericTokens: tokens.length, traced: tokens.length - untraced.length, regeneratedNumbers: stored.Report.Numbers.length,
          regeneratedNotDelivered: missing.join(' ') || 'none', untracedTokens: untraced.join(' ') || 'none',
          selectionScoreRecomputed: selection.Recomputed, leakageMatches, agentRunId: build.AgentRunID, modelId: build.BuildModelID,
        },
        Detail: `the W1 s42 agent report holds ${honest} "honest holdout" sentence(s) and ${cvScore} cvScore; ${tokens.length - untraced.length} of ${tokens.length} numeric tokens trace to the stored rows; `
          + `selection score ${selection.Recomputed ? 'recomputes' : 'does not recompute'} (${selection.Detail}); leakage sentence "${leakage}" ${leakageMatches ? 'present' : 'absent'}`,
      });
    },
  },
];

for (const c of PsGateW1S92Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-2', PsGate.Lifecycle);
