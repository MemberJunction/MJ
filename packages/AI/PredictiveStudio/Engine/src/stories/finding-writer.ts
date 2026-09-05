/**
 * @module stories/finding-writer
 *
 * **What the model taught us** — turning a promotion into dated, citable facts.
 *
 * A trained model is the perishable part of the exercise; it gets retrained, replaced, retired.
 * What it *learned* is not. "Recent activity count carries 31% of the explanation for renewal,
 * measured out-of-sample on 2,180 members" is a fact about the business, and until now it lived
 * only inside one model's story — overwritten at the next retrain.
 *
 * Three things make this trustworthy enough to cite:
 *
 * **Nothing here is invented.** Every number comes from the same computed facts the story tagger is
 * given: the model's own `FeatureImportance`, its locked-holdout metrics, its training row count.
 * The LLM's prose is used only for the `Story` field — the part a human reads — and never for the
 * magnitude, the direction, or the evidence type. **A finding is written even when story tagging
 * failed or is switched off**, because none of it depends on a model call.
 *
 * **The epistemic status is on the record.** Feature importance says an input helped a model
 * predict. It does not say the input *causes* the outcome, and it does not even say the two move
 * in a particular direction — tree importances are unsigned. An agent asked "what drives renewal?"
 * will flatten all of that into one confident sentence unless the row forces the distinction, so
 * `EvidenceType` is never inferred generously and `Direction` stays `Unknown` unless the numbers
 * actually prove a sign.
 *
 * **Findings are superseded, never updated.** A retrain writes a new dated row and points the old
 * one at it. Updating in place would destroy the only thing that shows a lever *moving*, which is
 * the entire reason to keep them for years.
 */
import { LogError, LogStatus, RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLFindingEntity } from '@memberjunction/core-entities';
import type { ModelStory, TrustVerdict } from '@memberjunction/predictive-studio-core';
import { createHash } from 'node:crypto';

import { signalLeafName } from '../components/signal-binding';
import {
  RunViewStoryContextLoader,
  type IStoryContextLoader,
  type ModelStoryContext,
  type StoryComponentFacts,
} from './story-context-loader';

/** What was written. */
export interface FindingWriteResult {
  /** Findings created by this promotion. */
  Written: number;
  /** Prior findings marked superseded because this promotion re-measured the same relationship. */
  Superseded: number;
  /** Why nothing was written, or what degraded. Empty on a clean success. */
  Reasons: string[];
}

/** Injected dependencies. Every external touch is a seam so this tests with no database. */
export interface FindingWriterDeps {
  /** Loads the deterministic facts. Defaults to the RunView loader — the SAME one the story uses. */
  contextLoader?: IStoryContextLoader;
  /** The story, when one was written. Its prose enriches `Story`; no number is taken from it. */
  story?: ModelStory | null;
  contextUser?: UserInfo;
  provider?: IMetadataProvider;
  /** Clock seam, so a test can assert an exact `MeasuredAt`. */
  now?: () => Date;
}

/**
 * Below this share of the explanation, an input is recorded as having been measured and found not
 * to matter. That is a **result worth keeping** — negative results are normally discarded and then
 * re-tested by the next person — so it becomes a `Direction: 'None'` finding rather than silence.
 */
const NEGLIGIBLE_SHARE = 0.01;

/** Above this share, an input is carrying a substantial part of the model's explanation. */
const SUBSTANTIAL_SHARE = 0.15;

/** Below this many training rows, no finding claims more than low confidence. */
const THIN_POPULATION = 500;

/** The metric preferred as a finding's out-of-sample backing, per problem type, best first. */
const PREFERRED_METRICS = ['auc', 'roc_auc', 'r2', 'f1', 'accuracy', 'rmse', 'mae'];

/**
 * Writes findings from a promotion. Stateless; construct once and reuse.
 */
export class FindingWriter {
  public async write(
    model: MJMLModelEntity,
    trust: TrustVerdict,
    deps: FindingWriterDeps,
  ): Promise<FindingWriteResult> {
    const reasons: string[] = [];
    const loader = deps.contextLoader ?? new RunViewStoryContextLoader();
    const context = await loader.load(model, trust, deps.contextUser, deps.provider);

    // Only components the model actually attributed explanation to become findings. A component
    // with no attributed share was not measured against the target, and a finding about it would
    // be a claim nobody made.
    const measured = context.Components.filter((c) => c.ImportanceShare !== undefined);
    if (measured.length === 0) {
      return {
        Written: 0,
        Superseded: 0,
        Reasons: ['No component carried an attributable importance share, so there was nothing measured to record.'],
      };
    }

    const signed = this.importanceIsSigned(context);
    const backing = this.backingMetric(context);
    const measuredAt = (deps.now ?? (() => new Date()))();
    const storyByInstance = new Map((deps.story?.Components ?? []).map((c) => [c.InstanceID, c]));

    let written = 0;
    let superseded = 0;
    for (const component of measured) {
      try {
        const draft = this.draftFinding(component, context, model, {
          signed,
          backing,
          measuredAt,
          story: storyByInstance.get(component.InstanceID),
        });
        superseded += await this.supersedePrior(draft.ContentHash, deps, reasons);
        if (await this.persist(draft, deps, reasons)) {
          written++;
        }
      } catch (err) {
        reasons.push(`'${component.Name}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (context.Warnings.length > 0) {
      reasons.push(...context.Warnings);
    }
    return { Written: written, Superseded: superseded, Reasons: reasons };
  }

  /**
   * Whether the model's importance map carries SIGNS.
   *
   * This is the whole basis for claiming a direction. Tree-ensemble importances are magnitudes and
   * are never negative, so a positive value proves nothing about which way the relationship runs;
   * linear coefficients and rubric weights are signed. A map containing any negative value is
   * therefore a coefficient map, and only then may a sign be read as a direction. Inferring
   * "Increases" from an unsigned importance would be a fabricated causal-sounding claim on every
   * tree model ever promoted.
   */
  protected importanceIsSigned(context: ModelStoryContext): boolean {
    return context.FeatureImportance.some((f) => f.Share < 0);
  }

  /** The out-of-sample metric that backs these findings, when the metrics are honest ones. */
  protected backingMetric(context: ModelStoryContext): { Name: string; Value: number } | null {
    if (!context.MetricsAreHoldout) {
      return null;
    }
    for (const name of PREFERRED_METRICS) {
      const value = context.Metrics[name];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return { Name: name, Value: value };
      }
    }
    const [name, value] = Object.entries(context.Metrics)[0] ?? [];
    return typeof value === 'number' ? { Name: name, Value: value } : null;
  }

  /** Compose one finding from measured facts, using the story's prose only for `Story`. */
  protected draftFinding(
    component: StoryComponentFacts,
    context: ModelStoryContext,
    model: MJMLModelEntity,
    opts: {
      signed: boolean;
      backing: { Name: string; Value: number } | null;
      measuredAt: Date;
      story?: ModelStory['Components'][number];
    },
  ): FindingDraft {
    // The component's name is qualified with the model that produced it, which makes a citation
    // unreadable ("<40-character model name> \u203a acts_90d carries 8% of..."). The claim is about
    // the MEASURE; the model is already on the row as MLModelID.
    const measure = signalLeafName(component.Name);
    const raw = component.ImportanceShare ?? 0;
    const share = Math.abs(raw);
    const negligible = share < NEGLIGIBLE_SHARE;

    // Direction: only a signed map can support one, and a negligible share means "no effect
    // detected" regardless of which side of zero it happened to land on.
    const direction: FindingDraft['Direction'] = negligible
      ? 'None'
      : opts.signed
        ? raw > 0
          ? 'Increases'
          : 'Decreases'
        : 'Unknown';

    // Importance measures a contribution to prediction. That is a claim about usefulness, and it
    // is only an OUT-OF-SAMPLE claim when the metrics behind it came from the locked holdout.
    const evidenceType: FindingDraft['EvidenceType'] = opts.backing ? 'Predictive Contribution' : 'Observed Association';

    return {
      Name: `${measure} and ${context.TargetVariable}`,
      Statement: this.composeStatement(measure, context, { share, negligible, direction, backing: opts.backing }),
      MLModelID: model.ID,
      ComponentID: component.InstanceID,
      TargetVariable: context.TargetVariable,
      EvidenceType: evidenceType,
      Direction: direction,
      Magnitude: share,
      MagnitudeUnit: 'importance share',
      Confidence: this.gradeConfidence(share, context, opts.backing),
      MeasuredAt: opts.measuredAt,
      PopulationSize: context.TrainingRowCount,
      HoldoutMetric: opts.backing?.Name ?? null,
      HoldoutMetricValue: opts.backing?.Value ?? null,
      Evidence: JSON.stringify({
        ImportanceShare: raw,
        ImportanceIsSigned: opts.signed,
        Metrics: context.Metrics,
        MetricsAreHoldout: context.MetricsAreHoldout,
        TrainingRowCount: context.TrainingRowCount,
        TrustGrade: context.Trust.grade,
        ComponentType: component.ComponentTypeName,
        Bindings: component.Bindings,
        StoryRole: opts.story?.Contribution.Role ?? null,
        StoryEvidence: opts.story?.Contribution.Evidence ?? null,
      }),
      Story: this.composeStory(measure, component, context, opts.story, negligible),
      ContentHash: findingContentHash(component.InstanceID, context.TargetVariable, evidenceType),
    };
  }

  /**
   * The claim, in one sentence a reader can quote.
   *
   * Written deterministically and hedged to exactly what was measured: "carries N% of the
   * explanation" is a statement about the model, which is what importance actually is. Only a
   * signed map earns the stronger phrasing that names a direction.
   */
  protected composeStatement(
    measure: string,
    context: ModelStoryContext,
    facts: {
      share: number;
      negligible: boolean;
      direction: FindingDraft['Direction'];
      backing: { Name: string; Value: number } | null;
    },
  ): string {
    const pct = `${(facts.share * 100).toFixed(1)}%`;
    const basis = facts.backing
      ? `, on a model scoring ${facts.backing.Name} ${facts.backing.Value.toFixed(3)} against data it had never seen`
      : ', measured in training only — not yet confirmed out of sample';
    const population = context.TrainingRowCount ? ` across ${context.TrainingRowCount.toLocaleString()} records` : '';

    if (facts.negligible) {
      return (
        `${measure} was measured against ${context.TargetVariable} and found to carry almost none of the ` +
        `explanation (${pct})${population}${basis}. Worth recording: it has been tested, and does not need testing again.`
      );
    }
    if (facts.direction === 'Increases' || facts.direction === 'Decreases') {
      const verb = facts.direction === 'Increases' ? 'higher' : 'lower';
      return (
        `${measure} is associated with ${verb} ${context.TargetVariable}, carrying ${pct} of the model's ` +
        `explanation${population}${basis}.`
      );
    }
    return (
      `${measure} carries ${pct} of the explanation for ${context.TargetVariable}${population}${basis}. ` +
      `The measurement shows how much it matters, not which way it pushes.`
    );
  }

  /** The business-language half. Uses the LLM's prose when there is any; states the facts when not. */
  protected composeStory(
    measure: string,
    component: StoryComponentFacts,
    context: ModelStoryContext,
    story: ModelStory['Components'][number] | undefined,
    negligible: boolean,
  ): string {
    if (story) {
      const when = story.Contribution.ReuseWhen ? ` Worth reusing: ${story.Contribution.ReuseWhen}` : '';
      return `${story.Headline} — ${story.Story}${when}`;
    }
    // No story was written (tagging off, or it failed). The finding still stands on its facts.
    const bound = component.Bindings.find((b) => b.Entity && b.EntityField);
    const source = bound ? ` It is measured from ${bound.Entity}.${bound.EntityField}.` : '';
    return negligible
      ? `${measure} was tested as a predictor of ${context.TargetVariable} and did not contribute.${source}`
      : `${measure} contributes to predicting ${context.TargetVariable}.${source}`;
  }

  /**
   * How much weight to put on the finding. Deliberately coarse — a decimal here would invite false
   * precision about what is fundamentally a judgment over population size, out-of-sample backing
   * and effect size.
   */
  protected gradeConfidence(
    share: number,
    context: ModelStoryContext,
    backing: { Name: string; Value: number } | null,
  ): FindingDraft['Confidence'] {
    const thin = (context.TrainingRowCount ?? 0) < THIN_POPULATION;
    if (!backing || thin) {
      return 'Low';
    }
    return share >= SUBSTANTIAL_SHARE ? 'High' : 'Moderate';
  }

  /**
   * Mark any prior Active finding measuring the SAME relationship as superseded.
   *
   * This is what turns repeated promotions into a history instead of a pile of near-duplicates —
   * and the reason findings are never updated in place: the old row keeps its own date and its own
   * numbers, so the chain shows the relationship moving.
   */
  protected async supersedePrior(contentHash: string, deps: FindingWriterDeps, reasons: string[]): Promise<number> {
    const rv = deps.provider ? RunView.FromMetadataProvider(deps.provider) : new RunView();
    const prior = await rv.RunView<{ ID: string }>(
      {
        EntityName: 'MJ: ML Findings',
        ExtraFilter: `ContentHash='${contentHash}' AND Status='Active'`,
        Fields: ['ID'],
        ResultType: 'simple',
      },
      deps.contextUser,
    );
    if (!prior.Success) {
      reasons.push(`Could not check for prior findings: ${prior.ErrorMessage ?? 'unknown error'}`);
      return 0;
    }

    let count = 0;
    for (const row of prior.Results ?? []) {
      const entity = await this.newFinding(deps);
      if (!(await entity.Load(row.ID))) {
        continue;
      }
      entity.Status = 'Superseded';
      if (await entity.Save()) {
        count++;
      } else {
        reasons.push(`Could not supersede prior finding ${row.ID}: ${entity.LatestResult?.Message ?? 'save failed'}`);
      }
    }
    return count;
  }

  /** Persist one finding, then point the superseded rows at it. */
  protected async persist(draft: FindingDraft, deps: FindingWriterDeps, reasons: string[]): Promise<boolean> {
    const entity = await this.newFinding(deps);
    entity.NewRecord();
    entity.Name = draft.Name;
    entity.Statement = draft.Statement;
    entity.MLModelID = draft.MLModelID;
    entity.ComponentID = draft.ComponentID;
    entity.TargetVariable = draft.TargetVariable;
    entity.EvidenceType = draft.EvidenceType;
    entity.Direction = draft.Direction;
    entity.Magnitude = draft.Magnitude;
    entity.MagnitudeUnit = draft.MagnitudeUnit;
    entity.Confidence = draft.Confidence;
    entity.MeasuredAt = draft.MeasuredAt;
    entity.PopulationSize = draft.PopulationSize;
    entity.HoldoutMetric = draft.HoldoutMetric;
    entity.HoldoutMetricValue = draft.HoldoutMetricValue;
    entity.Evidence = draft.Evidence;
    entity.Story = draft.Story;
    entity.ContentHash = draft.ContentHash;
    entity.Status = 'Active';

    if (!(await entity.Save())) {
      reasons.push(`Could not save the finding for '${draft.Name}': ${entity.LatestResult?.Message ?? 'save failed'}`);
      return false;
    }

    // The embedding is generated by the entity server on save, and it fails SILENTLY when no local
    // embedding model is available — leaving a finding that exists and can never be found, which is
    // the worst of both worlds. Say so, rather than let it disappear into the table.
    if (draft.Story.trim().length > 0 && !entity.StoryVector) {
      reasons.push(
        `'${draft.Name}' was recorded but has no story vector, so it will NOT be returned by meaning search. ` +
          `This means no local embedding model was available when it was written.`,
      );
    }
    return true;
  }

  /** Entity seam — overridden in tests. */
  protected async newFinding(deps: FindingWriterDeps): Promise<MJMLFindingEntity> {
    const md = deps.provider;
    if (!md) {
      throw new Error('A provider is required to write findings.');
    }
    return md.GetEntityObject<MJMLFindingEntity>('MJ: ML Findings', deps.contextUser);
  }
}

/** One finding, fully composed, before it touches the database. */
export interface FindingDraft {
  Name: string;
  Statement: string;
  MLModelID: string;
  ComponentID: string;
  TargetVariable: string;
  EvidenceType: 'Observed Association' | 'Predictive Contribution' | 'Tested Intervention' | 'Descriptive' | 'Asserted';
  Direction: 'Increases' | 'Decreases' | 'Mixed' | 'None' | 'Unknown';
  Magnitude: number;
  MagnitudeUnit: string;
  Confidence: 'Low' | 'Moderate' | 'High';
  MeasuredAt: Date;
  PopulationSize: number | null;
  HoldoutMetric: string | null;
  HoldoutMetricValue: number | null;
  Evidence: string;
  Story: string;
  ContentHash: string;
}

/**
 * The identity of a CLAIM, not of a measurement.
 *
 * Signal + target + evidence type: re-measuring the same signal against the same target produces a
 * new measurement of one relationship, which should supersede. Measuring it as a different KIND of
 * evidence (an intervention rather than an association) is a different claim, and both belong on
 * the record at once.
 */
export function findingContentHash(componentId: string, targetVariable: string, evidenceType: string): string {
  return createHash('sha256')
    .update(`${componentId.toLowerCase()}|${targetVariable.toLowerCase()}|${evidenceType.toLowerCase()}`)
    .digest('hex')
    .slice(0, 64);
}

/**
 * Write findings without ever failing a promotion.
 *
 * Same contract as the story hook: findings are a pure enhancement of promotion, so a failure here
 * is logged and swallowed. A model that promoted correctly must not be rolled back because a
 * derived record could not be written.
 */
export async function writeFindingsBestEffort(
  writer: FindingWriter,
  model: MJMLModelEntity,
  trust: TrustVerdict,
  deps: FindingWriterDeps,
): Promise<FindingWriteResult> {
  try {
    const result = await writer.write(model, trust, deps);
    if (result.Written > 0) {
      LogStatus(
        `FindingWriter: recorded ${result.Written} finding(s) for model ${model.ID}` +
          `${result.Superseded > 0 ? `, superseding ${result.Superseded} earlier measurement(s)` : ''}.`,
      );
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LogError(`FindingWriter: writing threw for model ${model.ID} (promotion is unaffected): ${message}`);
    return { Written: 0, Superseded: 0, Reasons: [`Finding writing failed: ${message}`] };
  }
}
