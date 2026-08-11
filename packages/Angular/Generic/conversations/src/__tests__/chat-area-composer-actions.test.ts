import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { MJChatSlotName } from '../lib/directives/chat-slot.directive';
import type { IMJChatComposerActionsContext } from '../lib/components/slots/slot-interfaces';

/**
 * Contract spec for the additive `composerActions` slot — host controls rendered in the
 * composer's action strip, beside Plan Mode.
 *
 * Same technique as the `headerActions` spec next door: the chat-area constructor-injects a
 * dozen services, so a full TestBed render is disproportionate for what are template-placement
 * and threading guarantees. Asserted at template-source level, plus compile-time checks that the
 * slot name and its context shape are part of the public surface.
 *
 * The strip's own placement (outlet last, after the stock controls) lives in `@memberjunction/
 * ng-composer`, which owns that markup; this file covers the conversations side of the seam —
 * which is where the threading is, and where it can silently half-work.
 */
describe('chat-area — composerActions slot', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
  const chatArea = read('../lib/components/conversation/conversation-chat-area.component.html');
  const messageInput = read('../lib/components/message/message-input.component.html');
  const aiComposer = read('../lib/components/composer/ai-composer.component.ts');
  const chatAreaTs = read('../lib/components/conversation/conversation-chat-area.component.ts');

  it("'composerActions' is a member of the public MJChatSlotName union (compile-time)", () => {
    const name: MJChatSlotName = 'composerActions';
    expect(name).toBe('composerActions');
  });

  it('publishes a context shape carrying the composer disabled state (compile-time)', () => {
    // Kept in sync with the slot-name union — the directive's own doc says so, and a slot whose
    // context is undocumented is a slot consumers have to reverse-engineer from the template.
    const ctx: IMJChatComposerActionsContext = { $implicit: true, disabled: true };
    expect(ctx.disabled).toBe(true);
  });

  it('wires the slot into EVERY composer instance, not just the first', () => {
    // The regression this exists for: the chat area renders `mj-message-input` twice — the normal
    // composer and the empty-state one. Wiring only the first makes a projected control vanish on
    // a brand-new conversation, which is exactly where an entry-point control gets reached for.
    //
    // Counted off an existing PER-INSTANCE binding rather than the element name: `<mj-message-input`
    // also appears inside a prose comment, so matching the tag counts documentation as a composer
    // and fails on a correctly-wired template. Anchoring to a binding that only ever appears on a
    // real instance also states the rule that matters — every composer carrying the Plan Mode cap
    // carries the actions slot too.
    const instances = chatArea.match(/\[enablePlanMode\]="allowPlanMode"/g) ?? [];
    const outlets = chatArea.match(/slotTemplate\('composerActions'\)/g) ?? [];
    expect(instances.length).toBeGreaterThan(1);
    expect(outlets).toHaveLength(instances.length);
  });

  it('gates the slot behind the allowComposerActions cap', () => {
    // Matches the sibling caps (allowPlanMode / allowAttachments / allowRealtime): a host-level
    // switch that defaults on, so an embedded or read-only surface can disable the capability
    // centrally rather than unwinding the template that projects it.
    expect(chatAreaTs).toContain('@Input() allowComposerActions = true;');
    for (const binding of chatArea.match(/\[actionsTemplate\]="[^"]+"/g) ?? []) {
      expect(binding).toContain('allowComposerActions ?');
      expect(binding).toContain("slotTemplate('composerActions')");
    }
  });

  it('threads the template through every hop to the input box', () => {
    // chat-area -> mj-message-input -> mj-ai-composer -> mj-message-input-box. Neither middle hop
    // interprets it; both must forward it, and a dropped hop is silent — the control simply never
    // renders, with nothing failing anywhere.
    expect(messageInput).toContain('[actionsTemplate]="actionsTemplate"');
    expect(aiComposer).toContain('[actionsTemplate]="actionsTemplate"');
    expect(aiComposer).toContain('@Input() actionsTemplate: TemplateRef<unknown> | null = null;');
  });
});
