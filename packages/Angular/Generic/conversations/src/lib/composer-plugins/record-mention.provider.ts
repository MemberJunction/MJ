import { RegisterClass } from '@memberjunction/global';
import { ComposerTriggerProvider } from '@memberjunction/ng-composer';
import { BaseConversationMentionProvider } from './base-conversation-mention.provider';

/**
 * '#' trigger — record mentions: entities the user can read plus queries the user can
 * run, both sourced from Metadata and ranked/capped by the shared engine.
 *
 * Registered with the ClassFactory so any `mj-mention-editor` running in discovery mode
 * picks it up once `@memberjunction/ng-conversations` is loaded; also instantiated
 * directly by the `mj-ai-composer` wrapper (explicit-list mode).
 */
@RegisterClass(ComposerTriggerProvider, 'record-mentions')
export class RecordMentionProvider extends BaseConversationMentionProvider {
  public override readonly TriggerChar: string = '#';
  public override readonly Key: string = 'record-mentions';
}
