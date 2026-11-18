/**
 * @module scoring/model-value-rows
 *
 * The two shapes one scored record takes: the {@link ScoredRow} of C6 (built from the sidecar's prediction) and the
 * `Source = 'Model'` Feature Value it is stored as (§5.8.1's mapping: `ValueNumeric` the adverse-class probability of a
 * classification or the point prediction of a regression, `ValueText` the predicted class, `ValueJSON`
 * `{ Probabilities, Drivers, Interval }` with the members the problem type has, `Confidence` the predicted class's
 * probability). Model version, artifact hash and feature-schema hash are read through the row's model and run, never
 * copied onto it.
 */
import type { MJMLModelScoringBindingEntity, MJMLScoringRunEntity } from '@memberjunction/core-entities';
import type { ModelValueRow } from '@memberjunction/feature-pipelines';
import { UUIDsEqual } from '@memberjunction/global';
import type { Prediction, RowDrivers, ScoredRow, ScoreOutput, TaskType } from '@memberjunction/predictive-studio-core';

/** What a prediction is scored against: the model's lineage, its task and the run. */
export interface ScoredRowContext {
  readonly ModelID: string;
  readonly ModelVersion: number;
  readonly ArtifactSha256: string;
  readonly FeatureSchemaHash: string;
  readonly ScoringRunID: string;
  /** 00:00 UTC of the run's as-of date. */
  readonly AsOf: Date;
  /** The model's task (its `OutputSemantics`); null for a pre-change model, read as binary with class 1 adverse. */
  readonly Task: TaskType | null;
  /** The class order of the sidecar's probability vectors; null for a regression. */
  readonly ClassOrder: readonly string[] | null;
}

/** Builds scored rows and their Feature Value rows. */
export class ModelValueRows {
  /** The {@link ScoredRow} of one record's prediction. Pure. */
  public static FromPrediction(recordId: string, prediction: Prediction, inTraining: boolean, c: ScoredRowContext): ScoredRow {
    const output = ModelValueRows.output(prediction, c);
    return {
      recordId, modelId: c.ModelID, modelVersion: c.ModelVersion, artifactSha256: c.ArtifactSha256, scoringRunId: c.ScoringRunID,
      asOfDate: c.AsOf.toISOString(), inTraining, featureSchemaHash: c.FeatureSchemaHash, output, drivers: ModelValueRows.drivers(prediction, c),
    };
  }

  /**
   * The Feature Value row of one scored row of `binding`'s run `run` (§5.8.1).
   *
   * @throws when the scored row belongs to another run or model than `run`
   */
  public static FromScoredRow(row: ScoredRow, binding: Pick<MJMLModelScoringBindingEntity, 'ID'>, run: Pick<MJMLScoringRunEntity, 'ID' | 'ModelID'>): ModelValueRow {
    if (!UUIDsEqual(row.scoringRunId, run.ID) || !UUIDsEqual(row.modelId, run.ModelID)) {
      throw new Error(`ModelValueRows: record '${row.recordId}' of binding '${binding.ID}' was scored by run '${row.scoringRunId}' (model '${row.modelId}'), not run '${run.ID}'`);
    }
    const drivers = row.drivers.items.map((d) => ({ ...d }));
    if (row.output.kind === 'value') {
      const json = row.output.interval === null ? { Drivers: drivers } : { Drivers: drivers, Interval: [row.output.interval.lower, row.output.interval.upper] };
      return { RecordID: row.recordId, Value: ModelValueRows.typed(row.output.point, null, json), Confidence: null, InTraining: row.inTraining };
    }
    const output = row.output;
    const probabilities = Object.fromEntries(output.classOrder.map((cls, i) => [cls, output.probabilities[i]]));
    const predicted = ModelValueRows.PredictedClass(output);
    return {
      RecordID: row.recordId,
      Value: ModelValueRows.typed(output.adverseProbability, predicted.Class, { Probabilities: probabilities, Drivers: drivers }),
      Confidence: predicted.Probability,
      InTraining: row.inTraining,
    };
  }

  /**
   * A scored row as one number with its class: a binary model's probability of class 1 (the sidecar's `score`), a
   * multiclass model's probability of its predicted class, a regression's point; with the predicted class and the
   * adverse probability of a classification. Pure.
   */
  public static Score(row: ScoredRow): { readonly score: number; readonly class?: string; readonly adverseProbability?: number } {  // case-violation-ok-legacy-back-compat: the prediction wire keys
    const output = row.output;
    if (output.kind === 'value') return { score: output.point };
    const predicted = ModelValueRows.PredictedClass(output);
    const score = output.probabilities.length === 2 ? output.probabilities[1] : predicted.Probability;
    return { score, class: predicted.Class, adverseProbability: output.adverseProbability };
  }

  /** The most probable class of a class-probability output and its probability (the first on a tie). Pure. */
  public static PredictedClass(output: Extract<ScoreOutput, { kind: 'class-probabilities' }>): { readonly Class: string; readonly Probability: number } {
    let best = 0;
    output.probabilities.forEach((p, i) => { if (p > output.probabilities[best]) best = i; });
    return { Class: output.classOrder[best], Probability: output.probabilities[best] };
  }

  /** The typed value columns of a Model row. */
  private static typed(numeric: number, text: string | null, json: object): ModelValueRow['Value'] {
    return { ValueNumeric: numeric, ValueText: text, ValueBoolean: null, ValueDate: null, ValueJSON: JSON.stringify(json) };
  }

  /** The score output: a regression's point, or a classification's probability vector with its adverse probability. */
  private static output(prediction: Prediction, c: ScoredRowContext): ScoreOutput {
    if (c.ClassOrder === null || (c.Task !== null && c.Task.kind !== 'binary' && c.Task.kind !== 'multiclass')) {
      return { kind: 'value', point: prediction.score, interval: null };
    }
    const classOrder = [...c.ClassOrder];
    const probabilities = prediction.probabilities && prediction.probabilities.length === classOrder.length
      ? [...prediction.probabilities]
      : classOrder.length === 2 ? [1 - prediction.score, prediction.score] : classOrder.map((cls) => (cls === prediction.class ? prediction.score : 0));
    return { kind: 'class-probabilities', classOrder, probabilities, calibrated: true, adverseProbability: ModelValueRows.adverse(probabilities, c.Task) };
  }

  /** The adverse-class probability: the task's adverse index (indices, summed, for a multiclass); class 1 without a task. */
  private static adverse(probabilities: readonly number[], task: TaskType | null): number {
    if (task !== null && task.kind === 'multiclass') return task.adverseIndices.reduce((sum, i) => sum + (probabilities[i] || 0), 0);
    const index = task !== null && task.kind === 'binary' ? task.adverseIndex : 1;
    return probabilities[index] || 0;
  }

  /**
   * The row's drivers from the sidecar's per-row contributions (which push `score`, P(class 1) for a binary model, up
   * when positive): signed relative to the adverse class. A regression's positive contribution raises the predicted
   * value and reads `raises-adverse`. No contributions (a tree or multiclass model) is an empty list.
   */
  private static drivers(prediction: Prediction, c: ScoredRowContext): RowDrivers {
    const lowerIsAdverse = c.Task !== null && c.Task.kind === 'binary' && c.Task.adverseIndex === 0;
    const items = (prediction.contributions || []).map((x) => {
      const raises = lowerIsAdverse ? x.value < 0 : x.value > 0;
      return { sourceColumn: x.feature, contribution: x.value, effect: raises ? 'raises-adverse' as const : 'lowers-adverse' as const };
    });
    return { wording: 'drivers', baseline: 'training-mean', items };
  }
}
