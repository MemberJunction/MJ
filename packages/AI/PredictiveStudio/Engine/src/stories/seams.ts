/**
 * @module stories/seams
 *
 * The single LLM seam in the promotion path.
 *
 * Everything the story describes was computed deterministically — the metrics, the feature
 * importance, the bindings, the trust grade. The model does not get to change any of it; it writes
 * prose about it. Keeping that behind one narrow interface is what makes the boundary visible and
 * the whole tagger unit-testable with no model call.
 */

import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

import type { IStoryPromptLoader } from './model-story-tagger';

/**
 * Executes the story-authoring prompt. Mirrors `AIPromptRunner.ExecutePrompt`'s signature so the
 * production binding is a direct passthrough (same shape as `IVisionPromptRunner`).
 *
 * Deliberately NOT implemented in this package. `AIPromptRunner` lives in `@memberjunction/ai-prompts`,
 * which the engine does not depend on — the same reason `IVisionPromptRunner` is caller-injected. The
 * host wires a real runner; without one, story tagging is simply off, and a model still trains,
 * promotes and scores exactly as before.
 */
export interface IStoryPromptRunner {
  ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>>;
}

/**
 * `RunView`-backed {@link IStoryPromptLoader} — resolves the story prompt by name as a full entity
 * object (the runner needs its resolved template text).
 */
export class RunViewStoryPromptLoader implements IStoryPromptLoader {
  /** @inheritdoc */
  public async load(
    name: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJAIPromptEntityExtended | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJAIPromptEntityExtended>(
      {
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: `Name='${name.replace(/'/g, "''")}' AND Status='Active'`,
        ResultType: 'entity_object',
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return null;
    }
    return result.Results[0];
  }
}

