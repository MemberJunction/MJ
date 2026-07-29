import { describe, it, expect } from 'vitest';
import { AiComposerComponent } from './ai-composer.component';
import { AgentMentionProvider } from '../../composer-plugins/agent-mention.provider';
import { RecordMentionProvider } from '../../composer-plugins/record-mention.provider';
import { SkillCommandProvider } from '../../composer-plugins/skill-command.provider';

/**
 * Behavioral proof of the seam PR D forwards into: mj-ai-composer's per-type
 * Enable* toggles must include/exclude exactly the matching trigger plugin in
 * ActiveTriggerProviders. Constructed directly (no-arg constructor; providers
 * are `new`'d internally, not DI'd), so no TestBed needed — but co-located as a
 * .dom.test.ts because importing the component pulls the Angular graph the node
 * project can't load.
 */
describe('AiComposerComponent — per-type trigger toggles', () => {
  const has = (c: AiComposerComponent, t: unknown) => c.ActiveTriggerProviders.some((p) => p instanceof (t as never));

  it('defaults to all three triggers active', () => {
    const c = new AiComposerComponent();
    expect(has(c, AgentMentionProvider)).toBe(true);
    expect(has(c, RecordMentionProvider)).toBe(true);
    expect(has(c, SkillCommandProvider)).toBe(true);
    expect(c.ActiveTriggerProviders).toHaveLength(3);
  });

  it('the Betty case — skills only: @ and # off, / on', () => {
    const c = new AiComposerComponent();
    c.EnableAgentMentions = false;
    c.EnableEntityMentions = false;
    expect(has(c, AgentMentionProvider)).toBe(false);
    expect(has(c, RecordMentionProvider)).toBe(false);
    expect(has(c, SkillCommandProvider)).toBe(true);
    expect(c.ActiveTriggerProviders).toHaveLength(1);
  });

  it('each toggle is independent and re-enabling restores the trigger', () => {
    const c = new AiComposerComponent();
    c.EnableSkillCommands = false;
    expect(has(c, SkillCommandProvider)).toBe(false);
    expect(has(c, AgentMentionProvider)).toBe(true); // untouched
    c.EnableSkillCommands = true;
    expect(has(c, SkillCommandProvider)).toBe(true);
  });
});
