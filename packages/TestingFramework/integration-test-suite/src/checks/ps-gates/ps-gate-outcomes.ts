/**
 * Gate outcome measurements read the gate record stored on the training run: W7 → S4.2 #2 (guards), C1 → S4.2 (the
 * reference-grade outcome) and C1 → S1.3 (the incumbent heuristic as a named comparator). Each trains through MJAPI
 * exactly as a user would (`h.Train`, PredictiveStudio.TrainModel). `StoredRunCoverage` measures the stored halves of
 * G2.21, G2.33, G2.36 and G2.37 as additional coverage: reported in `Measured`; only W7 → S4.2 #2 also gates on its
 * stored-bounds count (G2.33's stored half on W7).
 */
import { GateRecords, GateRules, TrainingRunResultsParser, type MetricWithInterval, type StoredGateRecord, type StoredTrainerResult } from '@memberjunction/predictive-studio-core';
import type { MJMLTrainingPipelineEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import { UnitFixtures, type GateMeasurement, type ProtocolChoice, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';
import { EvaluationProtocolGates } from './ps-gate-evaluation-protocols';

/** A trained run with its stored gate record and trainer result (null when the run stored none). */
interface StoredRun { readonly Run: MJMLTrainingRunEntity; readonly Gate: StoredGateRecord | null; readonly Trainer: StoredTrainerResult | null }

/** What one W7 seed stored: its outcome and the guard inputs the threshold reads. */
interface W7SeedOutcome {
  readonly Stored: boolean;
  readonly Model: boolean;
  /** The stored decision ships something the guards forbid. */
  readonly Violation: boolean;
  /** The stored guard inputs record a holdout minority below the protocol minimum. */
  readonly MinorityBelowMinimum: boolean;
  readonly BoundsMissing: number;
  readonly Text: string;
}

/** What the incumbent-heuristic gate saw on one protocol. */
interface HeuristicOutcome { readonly Passed: boolean; readonly Measured: GateMeasurement['Measured']; readonly Text: string }

/**
 * The gate's W7 seeds. Measured on seeds 42–61 through MJAPI: every seed's holdout minority class has 2–9 rows (below
 * the protocol minimum of 20) and every seed's transcribed decision is already no-signal, so no W7 seed reaches the
 * guards with a shipping outcome; the gate keeps the threshold's seeds and asserts the stored guard inputs. The guards'
 * demotion itself is Core's `gate.test.ts` › `GateRules.ApplyGateGuards`.
 */
const W7_SEEDS = [42, 43, 44] as const;
const W7_FEATURES = ['EventsAttended', 'AutoRenew', 'IncomeK'];

/** Gate outcome measurements (static members on one owner). */
export class GateOutcomeMeasures {
  private static async trainAndRead(h: TruthHarness, pipeline: MJMLTrainingPipelineEntity): Promise<StoredRun> {
    await h.Train(pipeline);
    const run = await UnitFixtures.LatestRun(h, pipeline.ID);
    const envelope = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    const trainer = envelope.Ok && envelope.Value.status === 'completed' ? envelope.Value.trainer : null;
    return { Run: run, Gate: GateRecords.ParseStoredGateRecord(run.ValidationResults), Trainer: trainer };
  }

  private static finite(m: MetricWithInterval): boolean {
    return Number.isFinite(m.interval.lower) && Number.isFinite(m.interval.upper);
  }

  /** Additional coverage: every stored number has both bounds, slices cover the protocol, and precision at capacity is stored when the unit declares a capacity. */
  public static StoredRunCoverage(s: StoredRun): GateMeasurement['Measured'] {
    if (s.Gate === null || s.Trainer === null) return { coverageReadable: false };
    const t = s.Trainer;
    const metrics: MetricWithInterval[] = [t.holdout.primary, ...t.holdout.secondary, ...t.baselines.map((b) => b.holdout)];
    const comparisonsWithoutBounds = Object.values(t.comparisons).filter((c) => !(Number.isFinite(c.ci[0]) && Number.isFinite(c.ci[1]))).length;
    return {
      coverageReadable: true,
      metricsWithoutBounds: metrics.filter((m) => !GateOutcomeMeasures.finite(m)).length + comparisonsWithoutBounds,
      missingSubgroups: s.Gate.sliceCoverage.missingSubgroups.length,
      missingPeriods: s.Gate.sliceCoverage.missingPeriods.length,
      slicesWithoutInterval: s.Gate.sliceCoverage.slicesWithoutInterval,
      precisionAtCapacityStored: t.operatingPoint !== null && GateOutcomeMeasures.finite(t.operatingPoint.precisionAtCapacity),
    };
  }

  /** One W7 seed: train, then whether the stored decision ships a model the guards forbid. */
  private static async w7Seed(h: TruthHarness, seed: number): Promise<W7SeedOutcome> {
    // Sequential by construction: each seed reloads the one W7 world table the next training reads.
    await h.EnsureLoaded({ Kind: 'world', ID: 'W7-small-imbalanced', Seed: seed });
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionWorldRenewalPipeline(h, 'W7-small-imbalanced', { Features: W7_FEATURES });
    const s = await GateOutcomeMeasures.trainAndRead(h, pipeline);
    if (s.Gate === null) return { Stored: false, Model: false, Violation: false, MinorityBelowMinimum: false, BoundsMissing: 0, Text: `s${seed}: run ${s.Run.Status}, no gate record (${s.Run.Notes || ''})` };
    const g = s.Gate;
    const counts = g.guards.holdoutClassCounts === null ? [] : Object.values(g.guards.holdoutClassCounts);
    const minority = counts.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...counts);
    const auc = g.guards.modelAucInterval;
    const aucContainsChance = auc === null || (auc.lower <= 0.5 && auc.upper >= 0.5);
    const model = g.decision.outcome === 'model';
    const minorityBelowMinimum = minority < g.guards.minMinorityClassRows;
    const ships = g.decision.outcome !== 'no-signal';
    const coverage = GateOutcomeMeasures.StoredRunCoverage(s);
    const aucText = auc === null ? 'none' : `[${GateRules.F4(auc.lower)}, ${GateRules.F4(auc.upper)}]`;
    return {
      Stored: true, Model: model, Violation: (ships && minorityBelowMinimum) || (model && aucContainsChance), MinorityBelowMinimum: minorityBelowMinimum,
      BoundsMissing: typeof coverage.metricsWithoutBounds === 'number' ? coverage.metricsWithoutBounds : 1,
      Text: `s${seed}: ${g.decision.outcome} (transcribed ${g.transcribed.outcome}, ${g.reason.code}), holdout ${JSON.stringify(g.guards.holdoutClassCounts)}, AUC ${aucText}`,
    };
  }

  /**
   * W7 → S4.2 #2: 0 of 3 seeds return `model` while the holdout AUC interval contains 0.5, and none ships anything while
   * the minority class is below the protocol minimum; every seed stores its guard inputs (a minority count below the
   * minimum on W7) and both bounds on every stored number.
   */
  public static async MeasureW7GuardedOutcomes(h: TruthHarness): Promise<GateMeasurement> {
    const seeds: W7SeedOutcome[] = [];
    for (const seed of W7_SEEDS) seeds.push(await GateOutcomeMeasures.w7Seed(h, seed));
    const stored = seeds.filter((s) => s.Stored).length;
    const violations = seeds.filter((s) => s.Violation).length;
    const minorityBelowMinimum = seeds.filter((s) => s.MinorityBelowMinimum).length;
    const boundsMissing = seeds.reduce((t, s) => t + s.BoundsMissing, 0);
    return {
      Passed: stored === W7_SEEDS.length && violations === 0 && minorityBelowMinimum === W7_SEEDS.length && boundsMissing === 0,
      Measured: {
        seeds: W7_SEEDS.length, stored, models: seeds.filter((s) => s.Model).length, violations, minorityBelowMinimum,
        storedMetricsWithoutBounds: boundsMissing, perSeed: seeds.map((s) => s.Text).join(' | '),
      },
      Detail: `${violations} of ${stored} stored W7 decisions ship what the guards forbid; ${minorityBelowMinimum} record a minority below the minimum; ${boundsMissing} stored numbers without bounds`,
    };
  }

  /** C1 → S4.2: the stored decision on C1's reference split is keep-simple-baseline shipping the GLM (the reference keeps its GLM). */
  public static async MeasureC1GateOutcome(h: TruthHarness): Promise<GateMeasurement> {
    const { Pipeline: pipeline } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, EvaluationProtocolGates.C1ReferenceProtocol);
    const s = await GateOutcomeMeasures.trainAndRead(h, pipeline);
    if (s.Gate === null) return { Passed: false, Measured: { runStatus: s.Run.Status }, Detail: `run ${s.Run.ID} stored no gate record` };
    const g = s.Gate;
    const glm = g.intervals.memberVsDummy['glm'];
    return {
      Passed: g.decision.outcome === 'keep-simple-baseline' && g.decision.shipped === 'glm',
      Measured: {
        outcome: g.decision.outcome, shipped: g.decision.shipped || 'none', reason: g.reason.code, holdoutRows: g.holdoutRows,
        glmVsDummy: glm === undefined ? 'absent' : GateRules.FormatInterval(glm),
        resultingModel: s.Run.ResultingModelID !== null,
        ...GateOutcomeMeasures.StoredRunCoverage(s),
      },
      Detail: `C1 stored ${g.decision.outcome} (${g.decision.shipped || 'nothing'}); the reference keeps its GLM (GLM vs one-feature 0.0130 [0.0015, 0.0229], a different comparison)`,
    };
  }

  /** The incumbent heuristic on one protocol: scored as a named comparator, and a stored outcome consistent with it. */
  private static async heuristicOn(h: TruthHarness, protocol: ProtocolChoice, label: string): Promise<HeuristicOutcome> {
    const { Pipeline: pipeline, Unit: unit } = await UnitFixtures.ProvisionC1AssemblyPipeline(h, protocol);
    if (unit.incumbent.kind !== 'rule') return { Passed: false, Measured: {}, Text: `${label}: the C1 unit declares no incumbent heuristic` };
    const member = `heuristic:${unit.incumbent.name}`;
    const s = await GateOutcomeMeasures.trainAndRead(h, pipeline);
    if (s.Gate === null || s.Trainer === null) return { Passed: false, Measured: { [`${label}RunStatus`]: s.Run.Status }, Text: `${label}: run ${s.Run.ID} stored no gate record` };
    const g = s.Gate;
    const incumbentName = unit.incumbent.name;
    const row = s.Trainer.baselines.find((b) => b.baseline.kind === 'incumbent-heuristic' && b.baseline.name === incumbentName);
    const modelVsRule = s.Trainer.comparisons[`modelVs:${member}`];
    const ruleVsDummy = s.Trainer.comparisons[`${member}VsDummy`];
    const scored = row !== undefined && GateOutcomeMeasures.finite(row.holdout) && ruleVsDummy !== undefined && modelVsRule !== undefined;
    const modelBeatsRule = modelVsRule !== undefined && modelVsRule.ci[0] > g.margin;
    // The decision agrees with the stored comparison: a model that beats the rule never ships the rule; one that does not
    // beat it never ships a model, carries its reason, and ships the rule only as `heuristic-carries-signal`.
    const agrees = modelBeatsRule
      ? g.decision.shipped !== member
      : g.decision.outcome !== 'model' && g.reason.text.length > 0 && (g.decision.shipped !== member || g.reason.code === 'heuristic-carries-signal');
    const vs = modelVsRule === undefined ? 'absent' : `${GateRules.F4(modelVsRule.value)} [${GateRules.F4(modelVsRule.ci[0])}, ${GateRules.F4(modelVsRule.ci[1])}]`;
    return {
      Passed: scored && agrees,
      Measured: {
        [`${label}Scored`]: scored, [`${label}ModelBeatsRule`]: modelBeatsRule, [`${label}ModelVsRule`]: vs, [`${label}Agrees`]: agrees,
        [`${label}Outcome`]: g.decision.outcome, [`${label}Shipped`]: g.decision.shipped || 'none', [`${label}Reason`]: g.reason.code,
      },
      Text: `${label}: heuristic ${scored ? 'scored' : 'not scored'}, model vs rule ${vs}; stored ${g.decision.outcome} (${g.reason.code})`,
    };
  }

  /**
   * C1 → S1.3: the unit's declared heuristic ("renewed last year") is scored on the same holdout as a named comparator
   * (its baseline row with both bounds, `heuristic:<name>VsDummy` and `modelVs:heuristic:<name>` stored), and the stored
   * decision agrees with the stored model-versus-rule comparison: when the model does not beat the rule by the margin the
   * outcome is not `model` and carries its reason (`heuristic-carries-signal` when the rule is the member kept). Measured
   * on the default year-cutoff holdout and on C1's reference split; each reports the outcome it saw. On both the model
   * beats the rule (measured), so this exercises the "beats it" side at runtime; the keep-the-rule branch is Core's
   * `gate.test.ts` › `treats the unit incumbent heuristic as a simple member` (`heuristic-carries-signal`).
   */
  public static async MeasureC1IncumbentHeuristic(h: TruthHarness): Promise<GateMeasurement> {
    const yearCutoff = await GateOutcomeMeasures.heuristicOn(h, { Kind: 'year-cutoff' }, 'yearCutoff');
    const reference = await GateOutcomeMeasures.heuristicOn(h, EvaluationProtocolGates.C1ReferenceProtocol, 'reference');
    return {
      Passed: yearCutoff.Passed && reference.Passed,
      Measured: { ...yearCutoff.Measured, ...reference.Measured },
      Detail: `${yearCutoff.Text}; ${reference.Text}`,
    };
  }
}
