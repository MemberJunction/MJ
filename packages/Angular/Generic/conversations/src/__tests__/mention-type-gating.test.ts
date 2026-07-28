import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Contract spec for per-type mention gating. The control (three independent
 * trigger plugins + the EnableAgentMentions/EnableEntityMentions/
 * EnableSkillCommands toggles) already lives in mj-ai-composer; this PR only
 * FORWARDS host-level flags up the chain. So the guarantee to pin is that the
 * new inputs exist and are wired through every hop:
 *   chat-area (allow*)  →  empty-state (enable*)  →  message-input (enable*)  →  ai-composer (Enable*)
 * Behavior of the plugins themselves is the composer package's own concern.
 */
const read = (rel: string) =>
  readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('per-type mention gating — forwarding contract', () => {
  it('chat-area declares the three allow* inputs, all defaulting true', () => {
    const ts = read('lib/components/conversation/conversation-chat-area.component.ts');
    // Tolerate an explicit `: boolean` — the assertion is about the default, not the
    // annotation style.
    for (const name of ['allowAgentMentions', 'allowEntityMentions', 'allowSkillCommands']) {
      expect(ts).toMatch(new RegExp(`@Input\\(\\)\\s+${name}(\\s*:\\s*boolean)?\\s*=\\s*true;`));
    }
  });

  it('chat-area forwards the flags to EVERY composer consumer (empty-state + both message-inputs)', () => {
    const html = read('lib/components/conversation/conversation-chat-area.component.html');
    // Count the MASTER binding's sites rather than hardcoding "3": every consumer that
    // gets [enableMentions] must also get all three per-type flags, and a legitimately
    // added 4th consumer should widen this expectation instead of failing the suite.
    const consumerSites = (html.match(/\[enableMentions\]="allowMentions"/g) ?? []).length;
    expect(consumerSites).toBeGreaterThanOrEqual(3); // empty-state + both message-inputs
    expect(html.match(/\[enableAgentMentions\]="allowAgentMentions"/g) ?? []).toHaveLength(consumerSites);
    expect(html.match(/\[enableEntityMentions\]="allowEntityMentions"/g) ?? []).toHaveLength(consumerSites);
    expect(html.match(/\[enableSkillCommands\]="allowSkillCommands"/g) ?? []).toHaveLength(consumerSites);
  });

  it('empty-state accepts and forwards the flags to its inner message-input', () => {
    const ts = read('lib/components/conversation/conversation-empty-state.component.ts');
    const html = read('lib/components/conversation/conversation-empty-state.component.html');
    for (const name of ['enableAgentMentions', 'enableEntityMentions', 'enableSkillCommands']) {
      expect(ts).toMatch(new RegExp(`@Input\\(\\)\\s+${name}(\\s*:\\s*boolean)?\\s*=\\s*true;`));
      expect(html).toContain(`[${name}]="${name}"`);
    }
  });

  it('message-input accepts the flags and binds the composer PascalCase Enable* inputs', () => {
    const ts = read('lib/components/message/message-input.component.ts');
    const html = read('lib/components/message/message-input.component.html');
    for (const name of ['enableAgentMentions', 'enableEntityMentions', 'enableSkillCommands']) {
      expect(ts).toMatch(new RegExp(`@Input\\(\\)\\s+${name}(\\s*:\\s*boolean)?\\s*=\\s*true;`));
    }
    expect(html).toContain('[EnableAgentMentions]="enableAgentMentions"');
    expect(html).toContain('[EnableEntityMentions]="enableEntityMentions"');
    expect(html).toContain('[EnableSkillCommands]="enableSkillCommands"');
  });

  it('the composer wrapper still owns the assembly seam (unchanged by this PR)', () => {
    // Guard against the forwarding being wired to a wrapper input that no longer
    // exists: the Enable* inputs + rebuildTriggerProviders must be present.
    const ts = read('lib/components/composer/ai-composer.component.ts');
    expect(ts).toContain('set EnableAgentMentions(');
    expect(ts).toContain('set EnableEntityMentions(');
    expect(ts).toContain('set EnableSkillCommands(');
    expect(ts).toContain('rebuildTriggerProviders()');
  });
});
