import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Template contract for the assistant-identity overrides — the avatar image
 * branch (trim/error-guarded via effectiveAssistantAvatarUrl, tile-clipped via
 * avatar-has-image) and the sender label routing through `aiAgentInfo` (where
 * the `assistantDisplayName` override applies), while the run-details header
 * stays on the ENGINE-resolved name (it labels the real agent's diagnostics).
 * Getter behavior is covered by the co-located DOM spec
 * (`message-item-assistant-identity.dom.test.ts`).
 */
describe('message-item template — assistant identity contract', () => {
  const html = readFileSync(resolve(__dirname, '../lib/components/message/message-item.component.html'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../lib/components/message/message-item.component.css'), 'utf8');

  it('the AI avatar renders the guarded image when set, else the icon', () => {
    expect(html).toContain('@if (effectiveAssistantAvatarUrl)');
    expect(html).toContain('(error)="assistantAvatarFailed = true"');
    expect(html).toContain(`[ngClass]="aiAgentInfo?.iconClass || 'fa-robot'"`);
  });

  it('the avatar tile drops its brand fill and clips the image to the tile radius', () => {
    expect(html).toContain('[class.avatar-has-image]="isAIMessage && effectiveAssistantAvatarUrl !== null"');
    expect(css).toContain('.avatar-circle.ai-avatar.avatar-has-image');
    expect(css).toContain('.avatar-circle.ai-avatar .avatar-image');
    expect(css).toMatch(/\.avatar-circle\.ai-avatar \.avatar-image \{[^}]*border-radius: inherit;/);
  });

  it('the sender label renders through aiAgentInfo (where the name override applies)', () => {
    expect(html).toContain("{{ isAIMessage ? (aiAgentInfo?.name || 'AI Assistant') : messageSenderName }}");
  });

  it('the run-details header stays on the ENGINE-resolved agent name', () => {
    expect(html).toContain("{{ engineAgentInfo?.name || 'Agent' }}");
  });
});
