/**
 * @fileoverview Shared conversation auto-naming helper — extracted from the message
 * input's first-message naming flow so BOTH chat paths use one implementation:
 *
 *  - **Regular chat**: the composer names a brand-new conversation from its first
 *    user message (the original behavior, now delegated here).
 *  - **Realtime sessions**: a voice call that created a fresh conversation names it
 *    from the first user utterance when the call ends.
 *  - **Forks**: a Fork or Edit fork is named from the first message sent into it, when it
 *    still has no name ({@link GenerateAndApplyForkName}).
 *
 * The naming itself is DB-driven: the `Name Conversation` AI prompt runs through the
 * GraphQL AI client (same path agents use) with a timeout guard ({@link GenerateConversationName}).
 * A conversation's parsed `{ name, description }` is saved through
 * {@link ConversationEngine.SaveConversation}, which updates the engine's cached conversation
 * list in place (the sidebar reacts through the engine's observables); a fork's name is saved
 * on its `MJ: Conversation Branches` row. Failures are logged and return `null` — naming is
 * always best-effort background work that must never affect the user experience.
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { CleanAndParseJSON } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GraphQLDataProvider, GraphQLAIClient } from '@memberjunction/graphql-dataprovider';
import { ConversationEngine, type MJConversationBranchEntity } from '@memberjunction/core-entities';

/** The result of a successful naming run. */
export interface ConversationNameResult {
  /** The generated name, trimmed. */
  Name: string;
  /** The generated description; empty string when the prompt omitted it. */
  Description: string;
}

/** The prompt runner {@link GenerateConversationName} calls; a test seam for the GraphQL AI client. */
export type NamePromptRunner = (
  promptId: string,
  messageText: string
) => Promise<{ success: boolean; parsedResult?: unknown; output?: string } | null>;

/** Options for {@link GenerateConversationName}. */
export interface GenerateNameOptions {
  /**
   * The text the name is derived from — the first user message (regular chat and forks) or the
   * first spoken user utterance (realtime). Callers strip mentions/markup first.
   */
  MessageText: string;
  /** The GraphQL provider the AI client runs over. */
  Provider: GraphQLDataProvider;
  /** Abort guard for the prompt run. Default 30s — the target keeps its current name on timeout. */
  TimeoutMs?: number;
  /**
   * Test seam: overrides the prompt execution. Production leaves this undefined and the
   * helper runs the `Name Conversation` prompt via {@link GraphQLAIClient.RunAIPrompt}.
   */
  RunPrompt?: NamePromptRunner;
}

/** Options for {@link GenerateAndApplyConversationName}. */
export interface GenerateConversationNameOptions extends GenerateNameOptions {
  /** The conversation to name (must exist; the caller owns membership checks). */
  ConversationId: string;
  /** The acting user (threaded into the conversation save). */
  CurrentUser: UserInfo;
}

/** Options for {@link GenerateAndApplyForkName}. */
export interface GenerateForkNameOptions extends GenerateNameOptions {
  /** The fork (`MJ: Conversation Branches` row) to name. */
  ForkId: string;
  /** The acting user; the branch entity's write rule applies to the save. */
  CurrentUser: UserInfo;
}

/** The seeded name of the AI prompt that generates conversation names. */
export const NAME_CONVERSATION_PROMPT = 'Name Conversation';

/** Longest fork name the `MJ: Conversation Branches` Name field holds. */
export const MAX_FORK_NAME_LENGTH = 255;

/**
 * Runs the `Name Conversation` prompt on a message and parses its `{ name, description }`. Saves nothing.
 *
 * @returns The generated `{ Name, Description }`, or `null` when the prompt is missing, the provider is
 * unavailable, the run fails or times out, or the output has no name. Failures are logged.
 */
export async function GenerateConversationName(options: GenerateNameOptions): Promise<ConversationNameResult | null> {
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

    const run: NamePromptRunner = options.RunPrompt
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
    const name = typeof parsed?.name === 'string' ? parsed.name.trim() : '';
    if (!name) {
      return null;
    }
    return { Name: name, Description: parsed?.description || '' };
  } catch (error) {
    console.warn('⚠️ Conversation naming failed (the current name stays):', error);
    return null;
  }
}

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
  const generated = await GenerateConversationName(options);
  if (!generated) {
    return null;
  }
  try {
    const saved = await ConversationEngine.Instance.SaveConversation(
      options.ConversationId,
      { Name: generated.Name, Description: generated.Description },
      options.CurrentUser
    );
    if (!saved) {
      console.warn('⚠️ Conversation naming generated a name but the save failed');
      return null;
    }
    return generated;
  } catch (error) {
    console.warn('⚠️ Conversation naming failed (conversation keeps its default name):', error);
    return null;
  }
}

/** Options for {@link SaveForkName}. */
export interface SaveForkNameOptions {
  /** The fork (`MJ: Conversation Branches` row) to name. */
  ForkId: string;
  /** The new name; null or blank clears it, so the default label shows. Cut to {@link MAX_FORK_NAME_LENGTH}. */
  Name: string | null;
  /** The provider the branch entity is read and saved through. */
  Provider: IMetadataProvider;
  /** The acting user; the branch entity's write rule applies. */
  CurrentUser: UserInfo;
  /** When true, saves nothing if the row read fresh already has a name. */
  OnlyIfUnnamed?: boolean;
}

/**
 * Saves a fork's Name through the `MJ: Conversation Branches` entity, after reading the row fresh.
 *
 * @returns true when the name was saved; false when the row cannot be read, when `OnlyIfUnnamed` is
 * set and the row has a name, or when the save fails (logged).
 * @throws when the entity read or save throws
 */
export async function SaveForkName(options: SaveForkNameOptions): Promise<boolean> {
  const fork = await options.Provider.GetEntityObject<MJConversationBranchEntity>('MJ: Conversation Branches', options.CurrentUser);
  if (!(await fork.Load(options.ForkId))) {
    console.warn(`⚠️ Could not read fork ${options.ForkId} to save its name`);
    return false;
  }
  if (options.OnlyIfUnnamed && fork.Name?.trim()) {
    return false;
  }
  const name = options.Name?.trim().slice(0, MAX_FORK_NAME_LENGTH).trim();
  fork.Name = name ? name : null;
  if (!(await fork.Save())) {
    console.warn(`⚠️ Could not save the name of fork ${options.ForkId}: ${fork.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return false;
  }
  return true;
}

/**
 * Names a fork from its first message: runs the `Name Conversation` prompt ({@link GenerateConversationName})
 * and saves the name as the fork's Name only when the fork, read fresh right before the save, still has
 * no name, so a person's rename wins.
 *
 * @returns The saved name, or `null` when naming failed, the fork already has a name, or the save failed.
 * Failures are logged.
 */
export async function GenerateAndApplyForkName(options: GenerateForkNameOptions): Promise<string | null> {
  const generated = await GenerateConversationName(options);
  if (!generated) {
    return null;
  }
  try {
    const saved = await SaveForkName({
      ForkId: options.ForkId,
      Name: generated.Name,
      Provider: options.Provider,
      CurrentUser: options.CurrentUser,
      OnlyIfUnnamed: true,
    });
    return saved ? generated.Name.slice(0, MAX_FORK_NAME_LENGTH).trim() : null;
  } catch (error) {
    console.warn(`⚠️ Fork naming failed (fork ${options.ForkId} keeps its current name):`, error);
    return null;
  }
}
