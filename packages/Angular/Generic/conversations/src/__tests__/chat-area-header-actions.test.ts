import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { MJChatSlotName } from '../lib/directives/chat-slot.directive';

/**
 * Contract spec for the chat header's export customization + the additive
 * `headerActions` slot. The chat-area component constructor-injects a dozen
 * services, which makes a full TestBed render disproportionate for what are
 * template-placement guarantees — so this spec asserts the contract at the
 * template-source level (the same technique as conversation-list-tokens),
 * plus a compile-time check that the slot name is part of the public union.
 * The modal/service DOM specs cover the branding behavior end to end.
 */
describe('chat-area header — export customization + headerActions slot', () => {
  const html = readFileSync(
    resolve(__dirname, '../lib/components/conversation/conversation-chat-area.component.html'),
    'utf8'
  );

  it("'headerActions' is a member of the public MJChatSlotName union (compile-time)", () => {
    const name: MJChatSlotName = 'headerActions';
    expect(name).toBe('headerActions');
  });

  it('the export button binds label + icon inputs (no hardcoded chrome)', () => {
    expect(html).toContain('{{ exportButtonLabel }}');
    expect(html).toContain('[class]="exportButtonIcon"');
    expect(html).toContain(`[title]="exportButtonLabel + ' conversation'"`);
  });

  it('the export modal receives the host branding', () => {
    expect(html).toContain('[branding]="exportBranding"');
  });

  it('the headerActions outlet renders in the DEFAULT header branch only', () => {
    const headerSlotBranch = html.indexOf("@if (slotTemplate('header'); as t)");
    const defaultBranch = html.indexOf('@else if (conversation || HasPreConversationHeader)');
    const actionsOutlet = html.indexOf("slotTemplate('headerActions')");
    const contentArea = html.indexOf('class="chat-content-area"');

    expect(headerSlotBranch).toBeGreaterThanOrEqual(0);
    expect(defaultBranch).toBeGreaterThan(headerSlotBranch);
    // The outlet must live AFTER the default-header branch opens (so a projected
    // full `header` slot — which replaces the entire header — suppresses it)…
    expect(actionsOutlet).toBeGreaterThan(defaultBranch);
    // …and inside the header region, before the chat content begins.
    expect(actionsOutlet).toBeLessThan(contentArea);
  });

  it('the headerActions outlet renders as the LAST action INSIDE the strip (after Share)', () => {
    const shareButton = html.indexOf('(click)="shareConversation()"');
    const actionsOutlet = html.indexOf("slotTemplate('headerActions')");
    expect(shareButton).toBeGreaterThanOrEqual(0);
    expect(actionsOutlet).toBeGreaterThan(shareButton);
    // Nesting guard: no element close between the Share button's block and the
    // outlet other than the button's own — if a </div> appears, the outlet has
    // escaped the .chat-actions-buttons container.
    expect(html.slice(shareButton, actionsOutlet)).not.toContain('</div>');
  });

  it('the outlet context carries conversation / conversationId / isProcessing', () => {
    const outletRegion = html.slice(html.indexOf("slotTemplate('headerActions')"), html.indexOf('class="chat-content-area"'));
    expect(outletRegion).toContain('$implicit: conversation');
    expect(outletRegion).toContain('conversationId: conversationId');
    expect(outletRegion).toContain('isProcessing: isProcessing');
  });
});
