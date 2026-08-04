import { AgentMentionProvider } from './agent-mention.provider';
import { RecordMentionProvider } from './record-mention.provider';
import { SkillCommandProvider } from './skill-command.provider';

/**
 * Tree-shaking prevention for the composer trigger-provider PLUGINS: they are resolved
 * dynamically through the MJ ClassFactory (`DiscoverComposerTriggerProviders` in
 * `@memberjunction/ng-composer`), so this static call is what keeps their
 * `@RegisterClass` side effects from being eliminated by the bundler. Called from
 * `ConversationsModule` alongside the realtime-channel Load calls.
 */
export function LoadComposerPlugins(): void {
  // Referencing the classes creates a static code path the bundler cannot eliminate
  void AgentMentionProvider;
  void RecordMentionProvider;
  void SkillCommandProvider;
}
