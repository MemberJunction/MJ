import { RegisterClass } from '@memberjunction/global';
import { ComposerTriggerProvider } from '@memberjunction/ng-composer';
import { BaseConversationMentionProvider } from './base-conversation-mention.provider';

/**
 * '@' trigger — agents (permission-filtered via AIAgentPermissionHelper, top-level +
 * Active + non-restricted only) and users. Agent suggestions carry their AI Agent
 * Configuration presets so the inserted chip offers the Fast/Standard/High picker.
 *
 * Registered with the ClassFactory so any `mj-mention-editor` running in discovery mode
 * picks it up once `@memberjunction/ng-conversations` is loaded; also instantiated
 * directly by the `mj-ai-composer` wrapper (explicit-list mode).
 */
@RegisterClass(ComposerTriggerProvider, 'agent-mentions')
export class AgentMentionProvider extends BaseConversationMentionProvider {
  public override readonly TriggerChar: string = '@';
  public override readonly Key: string = 'agent-mentions';
  public override readonly Priority: number = 10;
}
