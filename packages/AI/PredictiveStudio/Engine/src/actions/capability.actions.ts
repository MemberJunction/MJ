/**
 * @module actions/capability
 *
 * `Assess Capability Coverage` — the first-meeting artefact.
 *
 * Paste an organization's own strategic plan, funder report or board paper, and get back what it can
 * currently measure, what it has actually learned, and where neither is true. Not a feature demo: a
 * read of *their* organization where every gap is a piece of work someone can schedule.
 *
 * The design choice that makes it honest is that **absence is reported as absence of a description**,
 * not as absence of a capability. Early in a deployment a `Gap` is at least as likely to mean nobody
 * has written the story for a signal that exists. Every response therefore carries the size of the
 * corpus it matched against, and the summary says what an empty answer means — because a diagnosis
 * that implies "you cannot do this" when the truth is "we have not catalogued it" is worse than none.
 */
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

import { BaseComponentTreeAction } from './component-tree.actions';
import { CapabilityAssessor, type ICapabilityJudge, type IObjectiveEmbedder } from '../capability/capability-assessor';
import { PromptCapabilityJudge } from '../capability/capability-judge';
import { RunViewStoryPromptLoader } from '../stories/seams';
import { ProductionModelPromotionGate } from './promote-model.gate';

export const ASSESS_CAPABILITY_DRIVER_CLASS = 'PredictiveStudioAssessCapabilityAction';

/** Below this many characters there is nothing to diagnose. */
const MIN_DOCUMENT_CHARS = 40;

@RegisterClass(BaseAction, ASSESS_CAPABILITY_DRIVER_CLASS)
export class PredictiveStudioAssessCapabilityAction extends BaseComponentTreeAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const text = this.getStringParam(params, 'Text');
      if (!text || text.trim().length < MIN_DOCUMENT_CHARS) {
        return this.fail(
          'VALIDATION_ERROR',
          `Text is required and must be a real document — at least ${MIN_DOCUMENT_CHARS} characters. Paste a strategic plan, a funder report or a board paper.`,
        );
      }

      const result = await this.createAssessor().assess(
        {
          Text: text,
          MaxObjectives: this.getNumericParam(params, 'MaxObjectives'),
          TopK: this.getNumericParam(params, 'TopK'),
        },
        this.createEmbedder(),
        params.ContextUser,
        this.providerFor(params),
        await this.loadEngine(params),
        this.createJudge(),
      );

      this.addOutputParam(params, 'Objectives', result.Objectives);
      this.addOutputParam(params, 'Summary', result.Summary);
      this.addOutputParam(params, 'SignalsConsidered', result.SignalsConsidered);
      this.addOutputParam(params, 'FindingsConsidered', result.FindingsConsidered);
      if (result.Warnings.length > 0) {
        this.addOutputParam(params, 'Warnings', result.Warnings);
      }

      return this.ok(params, this.summarize(result));
    } catch (e) {
      LogError(e);
      return this.fail('ASSESSMENT_FAILED', `Capability assessment failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * The summary line, which is the part a person reads first.
   *
   * It deliberately states what a gap means. Left implicit, a reader takes "3 gaps" as a statement
   * about the organization when it is a statement about the catalogue.
   */
  protected summarize(result: Awaited<ReturnType<CapabilityAssessor['assess']>>): string {
    const total = result.Objectives.length;
    if (total === 0) {
      return `No objectives could be read from that text.${result.Warnings.length > 0 ? ` ${result.Warnings.join(' ')}` : ''}`;
    }
    const s = result.Summary;
    const parts = [
      `${total} objective(s) read.`,
      `${s.Covered} measurable and evidenced,`,
      `${s.Measurable} measurable but not yet studied,`,
      `${s.Evidenced} known but not instrumented,`,
      `${s.Partial} near-matches worth a human glance,`,
      `${s.Gap} with nothing on record.`,
    ];
    if (s.Undetermined > 0) {
      parts.push(`${s.Undetermined} could not be decided — shortlists returned for a human to read.`);
    }
    parts.push(
      `Matched against ${result.SignalsConsidered} signal(s) and ${result.FindingsConsidered} finding(s) —`,
      `a gap means nothing DESCRIBED covers it, which early on may mean the description is missing rather than the capability.`,
    );
    return parts.join(' ');
  }

  /** Assessor seam — overridden in tests. */
  protected createAssessor(): CapabilityAssessor {
    return new CapabilityAssessor();
  }

  /**
   * The judge, when the host wired a prompt runner.
   *
   * Reuses the same statically-registered runner story tagging uses, so a deployment opts into both
   * with one wire and neither silently half-works. With no runner the assessment still runs and
   * still returns shortlists — every objective simply comes back `Undetermined`, which is the honest
   * answer rather than a verdict from a number measured not to support one.
   */
  protected createJudge(): ICapabilityJudge | undefined {
    const runner = ProductionModelPromotionGate.StoryRunner;
    return runner ? new PromptCapabilityJudge(runner, new RunViewStoryPromptLoader()) : undefined;
  }

  /**
   * Embedding seam.
   *
   * Routes through the action's own `embedQuery`, which is the same `AIEngine.EmbedTextLocal` call
   * that wrote every story vector. Objectives and corpus therefore land in one vector space by
   * construction rather than by discipline.
   */
  protected createEmbedder(): IObjectiveEmbedder {
    return { embed: (text: string) => this.embedQuery(text) };
  }
}
