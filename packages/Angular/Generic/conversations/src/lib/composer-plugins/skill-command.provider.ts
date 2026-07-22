import { RegisterClass } from '@memberjunction/global';
import { ComposerTriggerProvider } from '@memberjunction/ng-composer';
import { BaseConversationMentionProvider } from './base-conversation-mention.provider';

/**
 * '/' trigger — skill commands: Active skills the user can Run (permission-filtered via
 * AISkillPermissionHelper). Suggestions carry each skill's IconClass/Color UX metadata
 * so the dropdown row + inserted chip render distinctly per skill.
 *
 * Registered with the ClassFactory so any `mj-mention-editor` running in discovery mode
 * picks it up once `@memberjunction/ng-conversations` is loaded; also instantiated
 * directly by the `mj-ai-composer` wrapper (explicit-list mode).
 */
@RegisterClass(ComposerTriggerProvider, 'skill-commands')
export class SkillCommandProvider extends BaseConversationMentionProvider {
  public override readonly TriggerChar: string = '/';
  public override readonly Key: string = 'skill-commands';
}
