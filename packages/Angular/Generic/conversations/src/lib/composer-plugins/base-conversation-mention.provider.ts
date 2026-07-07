import { UserInfo } from '@memberjunction/core';
import { ComposerSuggestionRequest, ComposerTriggerProvider, MentionSuggestion } from '@memberjunction/ng-composer';
import { MentionAutocompleteService } from '../services/mention-autocomplete.service';

/**
 * Shared base for the conversations composer plugins (agent-mentions / record-mentions /
 * skill-commands). Each concrete provider owns one trigger char; all of them delegate to
 * the shared {@link MentionAutocompleteService} engine, which loads its permission-filtered
 * caches once per session and ranks suggestions per trigger.
 *
 * Fail-closed: with no context user the AI-backed suggestion sets can't be permission
 * filtered, so the providers return [] rather than leaking anything.
 */
export abstract class BaseConversationMentionProvider extends ComposerTriggerProvider {
  /**
   * Warm the shared suggestion engine so the first keystroke after a trigger is fast.
   * Safe to call repeatedly/concurrently — the engine has a promise-locked initialize.
   */
  public override async Initialize(contextUser: UserInfo | null): Promise<void> {
    if (contextUser) {
      await MentionAutocompleteService.Instance.initialize(contextUser);
    }
  }

  public override async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    if (!request.ContextUser) {
      return [];
    }
    const engine = MentionAutocompleteService.Instance;
    // No-op when already initialized; covers hosts that never called Initialize()
    await engine.initialize(request.ContextUser, request.Provider ?? undefined);
    return engine.getSuggestions(request.Query, true, this.TriggerChar).slice(0, request.MaxResults);
  }
}
