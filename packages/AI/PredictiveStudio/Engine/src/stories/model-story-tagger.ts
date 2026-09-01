/**
 * @module stories/model-story-tagger
 *
 * Writes a model's **story** at promotion, and persists it onto the component rows.
 *
 * The deterministic half loads the facts (`RunViewStoryContextLoader`), validates the returned
 * prose against those facts (`validateModelStory` — every `InstanceID` must be a component the
 * model actually has), and writes it. The generative half is one prompt behind one seam.
 *
 * Three properties this must have, and does:
 *
 *  1. **The story never decides anything.** The trust grade, the metrics and the importance shares
 *     are computed and handed in. The model narrates them. It cannot upgrade a Poor model by
 *     describing it warmly.
 *  2. **Attribution is verified even though prose cannot be.** The one machine-checkable claim in a
 *     story is *which component* a contribution belongs to, and that is checked — otherwise a later
 *     reuse-by-meaning search would surface a mis-attributed component as though it were real.
 *  3. **It is strictly best-effort.** A model that trained and promoted must never fail because its
 *     story could not be written. Every failure path returns a reason and leaves the model alone.
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, BaseEntity } from '@memberjunction/core';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
// `AIPromptParams.prompt` takes the EXTENDED prompt entity (it carries the resolved template text
// the runner needs), so the loader seam returns that type rather than the plain generated class.
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJMLModelEntity, MJMLComponentEntity } from '@memberjunction/core-entities';
import type { ModelStory, TrustVerdict } from '@memberjunction/predictive-studio-core';
import { validateModelStory } from '@memberjunction/predictive-studio-core';

import type { IStoryPromptRunner } from './seams';
import { RunViewStoryContextLoader, type IStoryContextLoader, type ModelStoryContext } from './story-context-loader';

/** The `MJ: AI Prompts` name the tagger runs. Seeded alongside the Model Development Agent prompts. */
export const MODEL_STORY_PROMPT_NAME = 'Model Story Tagger - Main Prompt';

/** What the tagger did. Never throws; a failure is a `Reason`, not an exception. */
export interface StoryTagResult {
  /** Was a story written and persisted? */
  Tagged: boolean;
  /** The validated story, when one was produced. */
  Story: ModelStory | null;
  /** Component rows whose `Story` was updated. */
  ComponentsUpdated: number;
  /** Why not, or what degraded. Empty on a clean success. */
  Reasons: string[];
}

/** Injected dependencies. Every external touch is a seam so the tagger tests with no model call. */
export interface StoryTaggerDeps {
  /** The one LLM seam. */
  runner: IStoryPromptRunner;
  /** Resolves the story prompt entity by name. */
  promptLoader: IStoryPromptLoader;
  /** Loads the deterministic facts. Defaults to the RunView loader. */
  contextLoader?: IStoryContextLoader;
  contextUser?: UserInfo;
  provider?: IMetadataProvider;
}

/** Prompt-resolution seam — kept narrow so a test never needs `MJ: AI Prompts` metadata. */
export interface IStoryPromptLoader {
  /** Load the story prompt by name, or `null` when it is not seeded. */
  load(name: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJAIPromptEntityExtended | null>;
}

/**
 * Writes and persists model stories. Stateless across calls; construct once and reuse.
 */
export class ModelStoryTagger {
  /**
   * Tag one model: load the facts, ask for prose about them, validate the attribution, and write
   * the model story onto the ROOT component row and each component's story onto its own row.
   *
   * Writing the per-component story on its OWN row is what makes reuse work: a component found by a
   * similarity search months later carries its meaning with it, independent of the model it was
   * born in.
   *
   * @param model the promoted model
   * @param trust the deterministic trust verdict, handed to the writer as a fact
   * @param deps the injected seams
   */
  public async tag(model: MJMLModelEntity, trust: TrustVerdict, deps: StoryTaggerDeps): Promise<StoryTagResult> {
    const loader = deps.contextLoader ?? new RunViewStoryContextLoader();
    const context = await loader.load(model, trust, deps.contextUser, deps.provider);

    const prompt = await deps.promptLoader.load(MODEL_STORY_PROMPT_NAME, deps.contextUser, deps.provider);
    if (!prompt) {
      return fail(`The story prompt '${MODEL_STORY_PROMPT_NAME}' is not seeded, so no story was written.`);
    }

    const raw = await this.runPrompt(prompt, context, deps);
    if (raw === null) {
      return fail('The story prompt returned no usable output.');
    }

    const knownIds = context.Components.map((c) => c.InstanceID);
    const validated = validateModelStory(raw, knownIds);
    if ('error' in validated) {
      return fail(`The story did not validate and was discarded: ${validated.error}`);
    }

    const story = validated.value;
    const persisted = await this.persist(model, story, context, deps);
    LogStatus(`ModelStoryTagger: wrote a story for model ${model.ID} across ${persisted.ComponentsUpdated} component(s).`);
    return { Tagged: true, Story: story, ComponentsUpdated: persisted.ComponentsUpdated, Reasons: [...context.Warnings, ...persisted.Reasons] };
  }

  /** Run the story prompt over the assembled facts. Returns `null` on any failure. */
  private async runPrompt(prompt: MJAIPromptEntityExtended, context: ModelStoryContext, deps: StoryTaggerDeps): Promise<unknown> {
    try {
      const params = new AIPromptParams();
      params.prompt = prompt;
      params.contextUser = deps.contextUser;
      params.templateMessageRole = 'system';
      // The facts ride as prompt data, not as prose in the template — so the writer cannot
      // "remember" a metric differently from what was measured.
      params.data = { storyContext: context };
      const result = await deps.runner.ExecutePrompt<unknown>(params);
      if (!result?.success) {
        LogError(`ModelStoryTagger: story prompt failed: ${result?.errorMessage ?? 'unknown error'}`);
        return null;
      }
      return extractPayload(result);
    } catch (err) {
      LogError(`ModelStoryTagger: story prompt threw: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Write the model story to the ROOT component and each component story to its own row.
   *
   * `StoryVector` is NOT written here — `MJMLComponentEntityServer` generates it on save from the
   * `Story` text, so the embedding can never drift from the prose it describes.
   */
  private async persist(
    model: MJMLModelEntity,
    story: ModelStory,
    context: ModelStoryContext,
    deps: StoryTaggerDeps,
  ): Promise<{ ComponentsUpdated: number; Reasons: string[] }> {
    const reasons: string[] = [];
    let updated = 0;

    const rootId = model.RootComponentID;
    if (!rootId) {
      reasons.push('The model has no root component, so the model-level story was not persisted.');
    } else {
      const ok = await this.saveComponentStory(rootId, modelStoryText(story), JSON.stringify(story), deps, reasons);
      if (ok) updated++;
    }

    const known = new Set(context.Components.map((c) => c.InstanceID.toLowerCase()));
    for (const component of story.Components) {
      if (rootId && component.InstanceID.toLowerCase() === rootId.toLowerCase()) {
        continue; // the root already carries the model-level story
      }
      if (!known.has(component.InstanceID.toLowerCase())) {
        continue; // validation already proved this cannot happen; belt and braces
      }
      const text = `${component.Headline} — ${component.Story}`;
      const ok = await this.saveComponentStory(component.InstanceID, text, JSON.stringify(component.Contribution), deps, reasons);
      if (ok) updated++;
    }

    return { ComponentsUpdated: updated, Reasons: reasons };
  }

  /** Load one component and write its story + contribution. A failure is a reason, not a throw. */
  private async saveComponentStory(
    componentId: string,
    storyText: string,
    contributionJson: string,
    deps: StoryTaggerDeps,
    reasons: string[],
  ): Promise<boolean> {
    try {
      const component = await this.getComponent(componentId, deps);
      if (!component || !(await component.Load(componentId))) {
        reasons.push(`Component ${componentId} could not be loaded, so its story was not saved.`);
        return false;
      }
      component.Story = storyText;
      component.StoryContribution = contributionJson;
      if (!(await component.Save())) {
        reasons.push(`Component ${componentId} story was not saved: ${component.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return false;
      }
      return true;
    } catch (err) {
      reasons.push(`Component ${componentId} story was not saved: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Entity-creation seam, overridden in tests. */
  protected async getComponent(_componentId: string, deps: StoryTaggerDeps): Promise<MJMLComponentEntity | null> {
    const provider = deps.provider;
    if (!provider) {
      return null;
    }
    return provider.GetEntityObject<MJMLComponentEntity>('MJ: ML Components', deps.contextUser);
  }
}

// region: pure helpers --------------------------------------------------------

/** The model-level prose written onto the root component's `Story` — what a similarity search reads. */
export function modelStoryText(story: ModelStory): string {
  return [story.Headline, story.Story, story.DataStory, story.BusinessConnection].filter((s) => !!s?.trim()).join('\n\n');
}

/**
 * Pull the structured payload out of a prompt result, tolerating the two shapes a runner returns
 * (a parsed object, or raw text that still needs parsing).
 */
function extractPayload(result: { result?: unknown; parsedResult?: unknown; rawResult?: unknown }): unknown {
  const candidate = result.parsedResult ?? result.result;
  if (candidate && typeof candidate === 'object') {
    return candidate;
  }
  const raw = typeof result.rawResult === 'string' ? result.rawResult : typeof candidate === 'string' ? candidate : null;
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A uniform "nothing was written, here's why" result. */
function fail(reason: string): StoryTagResult {
  LogStatus(`ModelStoryTagger: ${reason}`);
  return { Tagged: false, Story: null, ComponentsUpdated: 0, Reasons: [reason] };
}

/**
 * Tag a model's story WITHOUT letting a failure escape — the form the promotion gate calls.
 *
 * Promotion has already succeeded by the time this runs. A story is a description of a decision
 * that was already made, so losing it is a documentation gap, never a reason to un-promote a model.
 *
 * @returns the result, or a failure result when the tagger itself threw
 */
export async function tagModelStoryBestEffort(
  tagger: ModelStoryTagger,
  model: MJMLModelEntity,
  trust: TrustVerdict,
  deps: StoryTaggerDeps,
): Promise<StoryTagResult> {
  try {
    return await tagger.tag(model, trust, deps);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    LogError(`ModelStoryTagger: tagging threw for model ${model.ID} (promotion is unaffected): ${message}`);
    return { Tagged: false, Story: null, ComponentsUpdated: 0, Reasons: [`Story tagging failed: ${message}`] };
  }
}

/** Structural anchor so the entity type import is not elided by the bundler. */
export type StoryTaggerEntity = BaseEntity;
