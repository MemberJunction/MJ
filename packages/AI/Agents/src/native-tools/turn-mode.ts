/**
 * @fileoverview The tool-calling path a prompt turn actually took.
 * @module @memberjunction/ai-agents
 */
import { GetToolCallingMode } from '@memberjunction/ai-prompts';
import type { AIPromptRunResult } from '@memberjunction/ai-core-plus';

/**
 * The turn's tool-calling mode, read from the chat result the runner tagged. The prompt-run
 * record's copy is the fallback only: that entity is reloaded when its INSERT completes, which can
 * reset the field after the call returned.
 */
export function TurnToolCallingMode(promptResult: AIPromptRunResult | null | undefined): AIPromptRunResult['promptRun']['ToolCallingMode'] | undefined {
    return GetToolCallingMode(promptResult?.chatResult) ?? promptResult?.promptRun?.ToolCallingMode ?? undefined;
}
