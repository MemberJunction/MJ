import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { MJChatSlotName } from '../lib/directives/chat-slot.directive';
import type { IMJChatComposerExtraContext } from '../lib/components/slots/slot-interfaces';

/**
 * Contract spec for the `composerExtra` slot (host UI directly above the composer) and for the
 * host rules the chat area forwards to every composer it shows. Asserted at the template-source
 * level, the same technique as chat-area-header-actions.test.ts: the chat area constructor-injects
 * a dozen services, which makes a full TestBed render disproportionate for placement guarantees.
 */
const read = (relative: string): string => readFileSync(resolve(__dirname, relative), 'utf8');

describe('chat area — composerExtra slot', () => {
    const chatArea = read('../lib/components/conversation/conversation-chat-area.component.html');
    const emptyState = read('../lib/components/conversation/conversation-empty-state.component.html');

    /** Every index at which `needle` occurs in `haystack`. */
    function indexesOf(haystack: string, needle: string): number[] {
        const found: number[] = [];
        for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
            found.push(i);
        }
        return found;
    }

    it("'composerExtra' is a member of the public MJChatSlotName union, with a typed context (compile-time)", () => {
        const name: MJChatSlotName = 'composerExtra';
        const context: IMJChatComposerExtraContext = { $implicit: null, ConversationId: null, IsProcessing: false };
        expect(name).toBe('composerExtra');
        expect(context.IsProcessing).toBe(false);
    });

    it('renders directly above the composer in both composer views, and only when a template is projected', () => {
        const outlets = indexesOf(chatArea, "@if (slotTemplate('composerExtra'); as t)");
        expect(outlets).toHaveLength(2); // the new-conversation composer and the conversation's composer

        for (const outlet of outlets) {
            const container = chatArea.lastIndexOf('class="chat-input-container"', outlet);
            const nextComposer = chatArea.indexOf('<mj-message-input', outlet);
            expect(container).toBeGreaterThanOrEqual(0);
            expect(nextComposer).toBeGreaterThan(outlet);
            // Nothing but the slot sits between it and the composer: no other composer in between.
            expect(chatArea.slice(container, outlet)).not.toContain('<mj-message-input');
        }
    });

    it('passes the conversation, ConversationId and IsProcessing as the outlet context', () => {
        for (const outlet of indexesOf(chatArea, "@if (slotTemplate('composerExtra'); as t)")) {
            const region = chatArea.slice(outlet, chatArea.indexOf('<mj-message-input', outlet));
            expect(region).toContain('$implicit: conversation');
            expect(region).toContain('ConversationId: conversationId');
            expect(region).toContain('IsProcessing: isProcessing');
        }
    });

    it('reaches the built-in empty state, which renders it above its own composer', () => {
        expect(chatArea).toContain(`[ComposerExtraTemplate]="slotTemplate('composerExtra')"`);

        const outlet = emptyState.indexOf('@if (ComposerExtraTemplate)');
        expect(outlet).toBeGreaterThanOrEqual(0);
        expect(emptyState.indexOf('<mj-message-input', outlet)).toBeGreaterThan(outlet);
        const region = emptyState.slice(outlet, emptyState.indexOf('<mj-message-input', outlet));
        expect(region).toContain('ConversationId: null');
        expect(region).toContain('IsProcessing: disabled');
    });

    it('styles only spacing, so the host owns the look (no colors)', () => {
        const css = read('../lib/components/conversation/conversation-chat-area.component.css');
        const rule = css.slice(css.indexOf('.chat-composer-extra {'), css.indexOf('}', css.indexOf('.chat-composer-extra {')));
        expect(rule).toContain('margin-bottom');
        expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b|rgb|color|background/i);
    });
});

describe('chat area — host rules reach every composer', () => {
    const chatArea = read('../lib/components/conversation/conversation-chat-area.component.html');
    const messageInput = read('../lib/components/message/message-input.component.html');

    it("the conversation's composer receives every rule", () => {
        const normalView = chatArea.slice(chatArea.indexOf('#messageInput'));
        for (const binding of [
            '[AgentReplyMode]="AgentReplyMode"',
            '[AllowedAgentIDs]="AllowedAgentIDs"',
            '[MentionPeople]="MentionPeople"',
            '[AgentHistoryFrom]="AgentHistoryFrom"',
            '[AgentTurnHandler]="AgentTurnHandler"',
            '[AutoNameConversation]="AutoNameConversation"',
        ]) {
            expect(normalView).toContain(binding);
        }
    });

    it("every composer's '@' list is scoped, and the pin picker is narrowed", () => {
        // The new-conversation composer, the empty state, and the conversation's composer.
        expect(indexesOfCount(chatArea, '[AllowedAgentIDs]="AllowedAgentIDs"')).toBe(4); // + the pin picker
        expect(indexesOfCount(chatArea, '[MentionPeople]="MentionPeople"')).toBe(3);
        expect(messageInput).toContain('[AllowedAgentIDs]="AllowedAgentIDs"');
        expect(messageInput).toContain('[MentionPeople]="MentionPeople"');
    });

    function indexesOfCount(haystack: string, needle: string): number {
        return haystack.split(needle).length - 1;
    }
});
