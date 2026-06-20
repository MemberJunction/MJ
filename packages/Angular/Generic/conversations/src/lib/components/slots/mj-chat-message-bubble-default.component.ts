/**
 * @fileoverview Bubble-style default for the `messageRenderer` slot.
 *
 * Renders a single message as a side-aligned colored bubble — user on the right,
 * agent on the left. Identity comes from side + shape (not avatar + name +
 * timestamp), matching the iMessage / WhatsApp paradigm that downstream
 * tutor-shaped surfaces (Sid, Betty v2, etc.) want.
 *
 * Colors come from the `--mj-chat-bubble-{user,agent}-{bg,text}` tokens (loaded
 * at document level by `ConversationsRuntimeBootstrap`) with semantic-token
 * fallbacks. Consumer themes override the chat tokens to reskin without
 * touching this component.
 *
 * Intentionally minimal — text content only. Consumers wanting richer rendering
 * (markdown, embedded artifacts, attachments, per-message decorations) subclass
 * this component, override the template fragment they want, and project the
 * subclass into the `messageRenderer` slot.
 *
 * NOTE: this component is exported but does not auto-replace the existing
 * feed-style rendering. It only renders when a consumer explicitly projects
 * it via `<ng-template mjChatSlot="messageRenderer" let-message>...</ng-template>`
 * once the slot template visual integration follow-up wires `messageRenderer`
 * into the chat-area's message list.
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

import type { IMJChatMessageRendererComponent } from './slot-interfaces';

@Component({
    selector: 'mj-chat-message-bubble-default',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="mj-chat-bubble-row"
            [class.mj-chat-bubble-row--user]="IsUser"
        >
            <div
                class="mj-chat-bubble"
                [class.mj-chat-bubble--user]="IsUser"
                [class.mj-chat-bubble--agent]="!IsUser"
            >
                {{ Message?.Message }}
            </div>
        </div>
    `,
    styles: [
        `
            .mj-chat-bubble-row {
                display: flex;
                justify-content: flex-start;
                padding: 0.25rem 0.75rem;
            }
            .mj-chat-bubble-row--user {
                justify-content: flex-end;
            }
            .mj-chat-bubble {
                max-width: 70%;
                padding: 0.625rem 0.875rem;
                border-radius: 1rem;
                word-wrap: break-word;
                white-space: pre-wrap;
                font-size: 0.9375rem;
                line-height: 1.4;
            }
            .mj-chat-bubble--agent {
                background: var(--mj-chat-bubble-agent-bg, var(--mj-bg-surface-card));
                color: var(--mj-chat-bubble-agent-text, var(--mj-text-primary));
                border-bottom-left-radius: 0.25rem;
            }
            .mj-chat-bubble--user {
                background: var(--mj-chat-bubble-user-bg, var(--mj-brand-primary));
                color: var(--mj-chat-bubble-user-text, var(--mj-text-inverse));
                border-bottom-right-radius: 0.25rem;
            }
        `,
    ],
})
export class MJChatMessageBubbleDefaultComponent implements IMJChatMessageRendererComponent {
    @Input() public Message: MJConversationDetailEntity | null = null;

    /**
     * `true` for messages authored by the conversation participant ("User" role).
     * Drives side-alignment and which color token applies. Falls back to `false`
     * (agent / left-aligned) for any non-User role, including null and unknown.
     */
    public get IsUser(): boolean {
        return this.Message?.Role === 'User';
    }
}
