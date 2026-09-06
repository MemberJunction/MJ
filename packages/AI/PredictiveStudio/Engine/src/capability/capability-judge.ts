/**
 * @module capability/capability-judge
 *
 * Deciding whether a shortlisted measure actually covers an objective.
 *
 * This is the one place in the capability diagnosis a model is used, and the reason is measured
 * rather than assumed: embedding similarity shortlists well and decides badly (see the note in
 * `capability-assessor`). Judging whether *"days since last activity"* covers *"increase how
 * recently members engage"* — and whether it covers *"negotiate a parking structure lease"* — is a
 * language question, and the numbers demonstrably cannot answer it.
 *
 * What keeps this honest:
 *
 *  - the judge chooses only among candidates **retrieval already found**; it cannot invent a signal;
 *  - every verdict must name the candidates it relied on, and a verdict citing an id that was not
 *    offered is discarded rather than shown;
 *  - `Covered` requires a signal AND a finding — a structural fact enforced by the assessor over
 *    EVERY judge, so no implementation can collapse the two axes with a persuasive sentence;
 *  - anything malformed degrades to `Undetermined`, never to a guess.
 */
import { LogError } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

import type { IStoryPromptRunner } from '../stories/seams';
import type { IStoryPromptLoader } from '../stories/model-story-tagger';
import type { CoverageVerdict, ICapabilityJudge, JudgeCandidateSet, JudgedObjective } from './capability-assessor';

/** The prompt this judge runs, by name in `MJ: AI Prompts`. */
export const CAPABILITY_JUDGE_PROMPT = 'Predictive Studio: Capability Coverage Judge';

/** Verdicts the judge is allowed to return. `Undetermined` is ours to assign, never its. */
const ALLOWED: ReadonlySet<string> = new Set(['Covered', 'Measurable', 'Evidenced', 'Partial', 'Gap']);

/** What the judge is shown per objective — ids and prose only, never similarity scores. */
interface JudgePayloadItem {
  Index: number;
  Section: string | null;
  Objective: string;
  Signals: Array<{ ID: string; Name: string; Kind: string; Describes: string | null }>;
  Findings: Array<{ ID: string; Name: string; Evidence: string; States: string | null }>;
}

/** Prompt-backed {@link ICapabilityJudge}. */
export class PromptCapabilityJudge implements ICapabilityJudge {
  constructor(
    private readonly runner: IStoryPromptRunner,
    private readonly promptLoader: IStoryPromptLoader,
  ) {}

  /** @inheritdoc */
  public async judge(
    candidates: JudgeCandidateSet[],
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<JudgedObjective[]> {
    const prompt = await this.promptLoader.load(CAPABILITY_JUDGE_PROMPT, contextUser, provider);
    if (!prompt) {
      throw new Error(`The '${CAPABILITY_JUDGE_PROMPT}' prompt is not in metadata. Push the Predictive Studio prompt seeds.`);
    }

    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = contextUser;
    params.templateMessageRole = 'system';
    // Candidates ride as prompt DATA, so the judge cannot quietly reword a story into a better fit.
    params.data = { objectives: candidates.map((c) => this.toPayload(c)) };

    const result = await this.runner.ExecutePrompt<unknown>(params);
    if (!result?.success) {
      throw new Error(`The capability judge prompt failed: ${result?.errorMessage ?? 'unknown error'}`);
    }
    return this.validate(extractPayload(result), candidates);
  }

  /**
   * Similarity scores are deliberately withheld.
   *
   * Shown a number, a judge anchors on it — and those numbers were measured NOT to separate coverage
   * from coincidence, so anchoring on them would import exactly the error this design exists to
   * avoid. It reads the prose, which is the evidence that actually bears on the question.
   */
  protected toPayload(c: JudgeCandidateSet): JudgePayloadItem {
    return {
      Index: c.Objective.Index,
      Section: c.Objective.Section,
      Objective: c.Objective.Text,
      Signals: c.Signals.map((s) => ({ ID: s.ID, Name: s.Name, Kind: s.Kind, Describes: s.Description })),
      Findings: c.Findings.map((f) => ({ ID: f.ID, Name: f.Name, Evidence: f.Kind, States: f.Description })),
    };
  }

  /**
   * Keep only verdicts that are well-formed AND about an objective actually sent.
   *
   * A judge that returns an index nobody asked about, or a verdict outside the vocabulary, has not
   * answered the question — and showing that to a client as a diagnosis of their organization is
   * exactly the failure this whole feature is supposed to avoid.
   */
  protected validate(raw: unknown, candidates: JudgeCandidateSet[]): JudgedObjective[] {
    const byIndex = new Map(candidates.map((c) => [c.Objective.Index, c]));
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { verdicts?: unknown[] })?.verdicts)
        ? (raw as { verdicts: unknown[] }).verdicts
        : null;
    if (!list) {
      throw new Error('The capability judge returned no usable verdicts.');
    }

    const out: JudgedObjective[] = [];
    for (const entry of list) {
      const e = entry as { Index?: unknown; Verdict?: unknown; Rationale?: unknown };
      const index = typeof e.Index === 'number' ? e.Index : Number.NaN;
      const verdict = typeof e.Verdict === 'string' ? e.Verdict : '';
      if (!byIndex.has(index) || !ALLOWED.has(verdict)) {
        LogError(`PromptCapabilityJudge: discarded a malformed verdict (index ${String(e.Index)}, verdict ${String(e.Verdict)}).`);
        continue;
      }
      out.push({
        Index: index,
        // The STRUCTURAL half of the verdict — whether a signal or a finding exists at all — is
        // enforced by the assessor over every judge, not here, so no implementation can collapse
        // the two axes.
        Verdict: verdict as Exclude<CoverageVerdict, 'Undetermined'>,
        Rationale: typeof e.Rationale === 'string' && e.Rationale.trim().length > 0 ? e.Rationale.trim() : 'No rationale given.',
      });
    }
    return out;
  }
}

/** Pull the structured payload out of a prompt result, tolerating the shapes runners return. */
function extractPayload(result: { result?: unknown; parsedResult?: unknown }): unknown {
  const candidate = result.parsedResult ?? result.result;
  if (typeof candidate === 'string') {
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return candidate ?? null;
}
