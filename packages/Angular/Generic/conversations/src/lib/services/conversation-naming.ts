/**
 * @fileoverview Shared conversation auto-naming helper — extracted from the message
 * input's first-message naming flow so BOTH chat paths use one implementation:
 *
 *  - **Regular chat**: the composer names a brand-new conversation from its first
 *    user message (the original behavior, now delegated here).
 *  - **Realtime sessions**: a voice call that created a fresh conversation names it
 *    from the first user utterance when the call ends.
 *
 * The naming itself is DB-driven: the `Name Conversation` AI prompt runs through the
 * GraphQL AI client (same path agents use) with a timeout guard; the parsed
 * `{ name, description }` is saved through {@link ConversationEngine.SaveConversation},
 * which updates the engine's cached conversation list in place (the sidebar reacts
 * through the engine's observables). Failures are logged and return `null` — naming is
 * always best-effort background work that must never affect the user experience.
 */
import { UserInfo } from '@memberjunction/core';
import { CleanAndParseJSON } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ConversationEngine } from '@memberjunction/core-entities';

/** The applied result of a successful auto-naming run. */
export interface ConversationNameResult {
  /** The generated conversation name (already saved). */
  Name: string;
  /** The generated description (already saved; empty string when the prompt omitted it). */
  Description: string;
}

/** Options for {@link GenerateAndApplyConversationName}. */
export interface GenerateConversationNameOptions {
  /** The conversation to name (must exist; the caller owns membership checks). */
  ConversationId: string;
  /**
   * The text the name is derived from — the first user message (regular chat) or the
   * first spoken user utterance (realtime). Callers strip mentions/markup first.
   */
  MessageText: string;
  /** The GraphQL provider the AI client runs over. */
  Provider: GraphQLDataProvider;
  /** The acting user (threaded into the conversation save). */
  CurrentUser: UserInfo;
  /** Abort guard for the prompt run. Default 30s — the conversation keeps its default name on timeout. */
  TimeoutMs?: number;
  /**
   * Test seam: overrides the prompt execution. Production leaves this undefined and the
   * helper runs the `Name Conversation` prompt via {@link GraphQLAIClient.RunAIPrompt}.
   */
  RunPrompt?: (promptId: string, messageText: string) => Promise<{ success: boolean; parsedResult?: unknown; output?: string } | null>;
}

/** The seeded name of the AI prompt that generates conversation names. */
export const NAME_CONVERSATION_PROMPT = 'Name Conversation';

/**
 * Generates a name + description for a conversation from its first message and SAVES it
 * (DB + engine cache) — the single naming implementation shared by the regular composer
 * and the realtime session path.
 *
 * @returns The applied `{ Name, Description }`, or `null` when naming was skipped/failed
 * (missing prompt, provider unavailable, timeout, unparseable output, save failure) —
 * the conversation keeps its current name in every null case.
 */
export async function GenerateAndApplyConversationName(
  options: GenerateConversationNameOptions
): Promise<ConversationNameResult | null> {
  try {
    await AIEngineBase.Instance.Config(false);
    const prompt = AIEngineBase.Instance.Prompts.find(pr => pr.Name === NAME_CONVERSATION_PROMPT);
    if (!prompt) {
      console.warn(`⚠️ ${NAME_CONVERSATION_PROMPT} prompt not found`);
      return null;
    }
    if (!options.Provider) {
      console.warn('⚠️ GraphQLDataProvider not available for conversation naming');
      return null;
    }

    const run = options.RunPrompt
      ?? ((promptId: string, messageText: string) =>
        new GraphQLAIClient(options.Provider).RunAIPrompt({
          promptId,
          messages: [{ role: 'user', content: messageText }]
        }));

    const timeoutMs = options.TimeoutMs ?? 30000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Conversation naming timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
    });

    const result = await Promise.race([run(prompt.ID, options.MessageText), timeoutPromise]);
    if (!result || !result.success || (!result.parsedResult && !result.output)) {
      return null;
    }

    // parsedResult preferred; CleanAndParseJSON tolerates ```json fences in raw output.
    const parsed = (result.parsedResult ?? (result.output ? CleanAndParseJSON(result.output) : null)) as
      | { name?: string; description?: string }
      | null;
    if (!parsed?.name) {
      return null;
    }

    const saved = await ConversationEngine.Instance.SaveConversation(
      options.ConversationId,
      { Name: parsed.name, Description: parsed.description || '' },
      options.CurrentUser
    );
    if (!saved) {
      console.warn('⚠️ Conversation naming generated a name but the save failed');
      return null;
    }
    return { Name: parsed.name, Description: parsed.description || '' };
  } catch (error) {
    console.warn('⚠️ Conversation naming failed (conversation keeps its default name):', error);
    return null;
  }
}
