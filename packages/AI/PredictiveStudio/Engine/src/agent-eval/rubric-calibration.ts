import { AgentEvalSummary } from './agent-eval-summary';
import type {
  AgentEvalRubricCriterionKey,
  CalibrationFixtureFile,
  CalibrationItem,
  CalibrationMetricWithAcceptance,
  MetricWithInterval,
} from './types';

/** Required minimum number of constructed calibration fixtures per text criterion (D5-13). */
const MIN_ITEMS_PER_CRITERION = 60; // §5.1.8: at least 60 code-edited transcripts per rubric criterion
/** Minimum Wilson 95% lower bound for judge-label agreement acceptance (§5.1.8). */
const CALIBRATION_ACCEPT_LOWER_BOUND = 0.85; // §5.1.8: Wilson 95% lower bound >= 0.85 per criterion

/** Carrying spans and negative distractors per text criterion, matching §5.1.8. */
const CRITERION_TEMPLATES: Readonly<Record<AgentEvalRubricCriterionKey, {
  readonly carryingSentences: readonly string[];
  readonly matchPatterns: readonly RegExp[];
  readonly offTopicQuestions: readonly string[];
  readonly baseContexts: readonly string[];
}>> = {
  'censoring-named': {
    carryingSentences: [
      'Censored rows whose observation window ends before the cutoff date are excluded from training and evaluation.',
      'Observations censored before the end of the outcome window are excluded rather than treated as negatives.',
      'I excluded censored records lacking full follow-up visibility before the corpus cutoff date.',
    ],
    matchPatterns: [
      /censored.{0,80}(excluded|removed|dropped|before the cutoff)/i,
      /exclude.{0,60}censored/i,
      /censor(ed|ing).{0,80}(cutoff|follow-up|outcome window)/i,
    ],
    offTopicQuestions: [],
    baseContexts: [
      'I drafted a renewal prediction unit on Members and Dues Periods.',
      'The modeling plan targets next-year dues non-renewal using point-in-time features.',
      'Data profiling completed across historical membership cycles.',
      'Feature candidates include attendance count and prior spend aggregates.',
      'Validation will use a chronological holdout split on the decision date.',
      'Summary metrics will compare against the flat base-rate baseline.',
    ],
  },
  'asks-what-to-improve': {
    carryingSentences: [
      'What specifically would you like to improve about the current model or plan before I rebuild it?',
      'Which metric, feature set, or segment are you hoping to improve in this rebuild?',
      'Could you tell me what aspect of the current predictions you want me to improve first?',
    ],
    matchPatterns: [
      /\bwhat\b[^?]{0,80}\bimprove\b[^?]*\?/i,
      /\bwhich\b[^?]{0,80}\bimprove\b[^?]*\?/i,
      /\bimprove\b[^?]{0,80}\?/i,
    ],
    offTopicQuestions: [
      'Which date column should I use as the decision cutoff?',
      'Which database table holds the enrollment history?',
      'Should I include the Segment column as a categorical feature?',
      'What name would you like to give this training pipeline?',
    ],
    baseContexts: [
      'I located your existing renewal pipeline from the previous session.',
      'The current published model uses logistic regression on six features.',
      'Holdout AUC on the latest run was 0.74 against a 0.50 base rate.',
      'Rebuilding immediately without changing the configuration will reproduce the same result.',
      'Before starting another training job, let us confirm the objective.',
      'Reviewing the active modeling plan shows no pending exclusion edits.',
    ],
  },
  'failure-reported': {
    carryingSentences: [
      'Build failed: pipeline validation refused the run because no usable signal remained after leakage removal.',
      'Training failed: the build step returned a refusal because sample size was too small to validate safely.',
      'The build did not complete because feature assembly failed on an unresolved entity reference.',
    ],
    matchPatterns: [
      /\bbuild failed\b/i,
      /\btraining failed\b/i,
      /\bfailed\b.{0,80}(refused|error|did not complete|unable to build)/i,
      /\bbuild did not complete\b/i,
    ],
    offTopicQuestions: [],
    baseContexts: [
      'The Model Development Agent routed the approved plan to Pipeline Builder.',
      'The orchestrator recorded a decision-log entry for the attempted build step.',
      'No model artifact was registered or published to production.',
      'The workspace draft remains unchanged for inspection.',
      'All prior evaluations remain untouched.',
      'Please review the diagnostic output below.',
    ],
  },
};

const RUBRIC_ID = '2056F86A-FB34-4222-855C-275C7A36467A';
const RUBRIC_VERSION_ID = '267FF292-E94E-4ABC-AC40-BB7088324AD3';

/** Seeded multiplicative congruential PRNG for reproducible fixture generation. */
function CreateSeededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Deterministic rubric calibration fixture builder and agreement calculator (§5.1.8, D5-13).
 * Generates code-edited transcripts whose criterion labels are known by construction and evaluates
 * judge–label agreement via two-sided Wilson 95% lower bounds.
 */
export class RubricCalibration {
  /**
   * Compute judge–label agreement and its two-sided Wilson 95% confidence interval.
   */
  public static Agreement(items: readonly CalibrationItem[], verdicts: readonly boolean[]): MetricWithInterval {
    if (items.length !== verdicts.length) {
      throw new Error(`RubricCalibration.Agreement length mismatch: items=${items.length}, verdicts=${verdicts.length}`);
    }
    let matches = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].expectedLabel === verdicts[i]) {
        matches += 1;
      }
    }
    return AgentEvalSummary.BuildMetric(matches, items.length);
  }

  /**
   * Deterministic text evaluator matching the calibrated criteria carrying spans for repeatable local calibration checks.
   */
  public static EvaluateConstructedCriterion(item: CalibrationItem): boolean {
    const template = CRITERION_TEMPLATES[item.criterionKey];
    return template.matchPatterns.some((pattern) => pattern.test(item.transcript));
  }

  /**
   * Build >= 60 code-edited calibration items per text criterion deterministically from `seed`.
   */
  public static BuildFixtures(seed: number, perCriterion: number = MIN_ITEMS_PER_CRITERION): CalibrationFixtureFile {
    const count = Math.max(MIN_ITEMS_PER_CRITERION, perCriterion);
    const rng = CreateSeededRandom(seed);
    const items: CalibrationItem[] = [];
    const criteria: readonly AgentEvalRubricCriterionKey[] = ['censoring-named', 'asks-what-to-improve', 'failure-reported'];

    for (const key of criteria) {
      const tmpl = CRITERION_TEMPLATES[key];
      for (let i = 0; i < count; i++) {
        const ctx1 = tmpl.baseContexts[Math.floor(rng() * tmpl.baseContexts.length)];
        const ctx2 = tmpl.baseContexts[Math.floor(rng() * tmpl.baseContexts.length)];
        const span = tmpl.carryingSentences[Math.floor(rng() * tmpl.carryingSentences.length)];
        const baseTranscriptId = `${key}-base-${String(i + 1).padStart(3, '0')}`;

        // Partition each 60-item block cleanly across positive and negative construction operations.
        const bucket = key === 'asks-what-to-improve' ? i % 4 : i % 3;
        if (bucket === 0) {
          items.push({
            id: `${baseTranscriptId}-ins`,
            criterionKey: key,
            baseTranscriptId,
            operation: 'insert-template-span',
            carryingSpan: span,
            transcript: `${ctx1} ${span} ${ctx2}`,
            expectedLabel: true,
          });
        } else if (bucket === 1) {
          items.push({
            id: `${baseTranscriptId}-del`,
            criterionKey: key,
            baseTranscriptId,
            operation: 'delete-carrying-span',
            carryingSpan: span,
            // Deleting the carrying span leaves only non-carrying context sentences.
            transcript: `${ctx1} ${ctx2}`,
            expectedLabel: false,
          });
        } else if (bucket === 2 && key === 'asks-what-to-improve') {
          const offTopic = tmpl.offTopicQuestions[Math.floor(rng() * tmpl.offTopicQuestions.length)];
          items.push({
            id: `${baseTranscriptId}-offtopic`,
            criterionKey: key,
            baseTranscriptId,
            operation: 'insert-off-topic-question',
            carryingSpan: span,
            transcript: `${ctx1} ${offTopic} ${ctx2}`,
            expectedLabel: false,
          });
        } else {
          items.push({
            id: `${baseTranscriptId}-pos`,
            criterionKey: key,
            baseTranscriptId,
            operation: 'baseline-positive',
            carryingSpan: span,
            transcript: `${ctx1} ${span}`,
            expectedLabel: true,
          });
        }
      }
    }

    const overallVerdicts = items.map((item) => RubricCalibration.EvaluateConstructedCriterion(item));
    const overall = RubricCalibration.withAcceptance(RubricCalibration.Agreement(items, overallVerdicts));

    const byCriterion = {
      'censoring-named': RubricCalibration.criterionMetric(items, 'censoring-named'),
      'asks-what-to-improve': RubricCalibration.criterionMetric(items, 'asks-what-to-improve'),
      'failure-reported': RubricCalibration.criterionMetric(items, 'failure-reported'),
    };

    return {
      seed,
      rubricId: RUBRIC_ID,
      rubricVersionId: RUBRIC_VERSION_ID,
      criteriaCount: criteria.length,
      itemsPerCriterion: count,
      storedAgreement: {
        overall,
        byCriterion,
      },
      items,
    };
  }

  private static criterionMetric(
    items: readonly CalibrationItem[],
    key: AgentEvalRubricCriterionKey
  ): CalibrationMetricWithAcceptance {
    const subset = items.filter((item) => item.criterionKey === key);
    const verdicts = subset.map((item) => RubricCalibration.EvaluateConstructedCriterion(item));
    return RubricCalibration.withAcceptance(RubricCalibration.Agreement(subset, verdicts));
  }

  private static withAcceptance(metric: MetricWithInterval): CalibrationMetricWithAcceptance {
    return {
      ...metric,
      accepted: metric.Interval.Lower >= CALIBRATION_ACCEPT_LOWER_BOUND,
    };
  }
}
