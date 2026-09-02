/**
 * @module feature-assembly/vision-llm-seam
 *
 * The production {@link IVisionPromptRunner} + {@link VisionPromptResolver} for `vision-llm` steps.
 *
 * These exist because the seams alone were not enough. `visionRunner` and `visionPromptResolver`
 * were caller-injected with no default, and **no production caller ever supplied them** — so every
 * vision feature silently evaluated to `null` for every record, and a model trained on one looked
 * entirely normal. Defaulting them here is the fix; the same mistake shipped the model-story tagger
 * inert until the same treatment.
 */

import { RunView, LogError } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { VisionLLMFeatureStep } from '@memberjunction/predictive-studio-core';

import type { IVisionPromptRunner } from './vision-llm';

/** A vision step that cannot be run as configured. Fails the assembly rather than nulling a column. */
export class VisionPromptConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisionPromptConfigError';
  }
}

/**
 * The production vision prompt-runner — `AIPromptRunner` verbatim.
 *
 * A thin named class rather than passing the runner directly, so the default is greppable and the
 * reason it exists is written down next to it.
 */
export class MJVisionPromptRunner implements IVisionPromptRunner {
  private readonly runner = new AIPromptRunner();

  /** @inheritdoc */
  public ExecutePrompt<T = unknown>(params: AIPromptParams): Promise<AIPromptRunResult<T>> {
    return this.runner.ExecutePrompt<T>(params);
  }
}

/**
 * Resolve a vision step's `Prompt.PromptRef` (id or name) to the `MJ: AI Prompts` row the runner
 * executes, memoized per resolver instance.
 *
 * An inline body **supplements** a stored prompt (it rides on the user turn); it cannot replace one,
 * because `AIPromptParams.prompt` is what selects the model and carries the run configuration. A
 * step with no resolvable prompt therefore throws rather than returning something empty — a vision
 * feature that quietly produces nothing is the failure this module exists to prevent.
 */
export function buildVisionPromptResolver(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): (step: VisionLLMFeatureStep) => Promise<AIPromptParams['prompt']> {
  const cache = new Map<string, MJAIPromptEntityExtended>();

  return async (step: VisionLLMFeatureStep): Promise<AIPromptParams['prompt']> => {
    const ref = step.Prompt?.PromptRef?.trim();
    if (!ref) {
      throw new VisionPromptConfigError(
        `Vision feature '${step.Output.FeatureName}' has no Prompt.PromptRef. An inline body supplements a stored ` +
          `prompt but cannot replace it — the prompt row is what selects the vision model.`,
      );
    }
    const cached = cache.get(ref);
    if (cached) {
      return cached;
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const escaped = ref.replace(/'/g, "''");
    const result = await rv.RunView<MJAIPromptEntityExtended>(
      {
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: `(ID='${escaped}' OR Name='${escaped}') AND Status='Active'`,
        ResultType: 'entity_object',
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success) {
      LogError(`buildVisionPromptResolver: reading prompt '${ref}' failed: ${result.ErrorMessage}`);
      throw new VisionPromptConfigError(
        `Vision feature '${step.Output.FeatureName}': its prompt '${ref}' could not be read — ${result.ErrorMessage}.`,
      );
    }
    const prompt = result.Results[0];
    if (!prompt) {
      throw new VisionPromptConfigError(
        `Vision feature '${step.Output.FeatureName}' names prompt '${ref}', which is not an Active MJ: AI Prompt.`,
      );
    }
    cache.set(ref, prompt);
    return prompt;
  };
}
