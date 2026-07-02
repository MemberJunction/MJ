/**
 * @fileoverview Default `messageExtra` slot component — no-op by default.
 *
 * The per-message inline-decoration slot is OFF by default in the chat-area
 * (rendering nothing extra after each message bubble). Consumers project their
 * own template (e.g., a tutor "walked through" badge) or subclass this default
 * to add per-message UI.
 *
 * The default exists primarily so subclasses have a base to extend; in normal
 * operation it renders nothing.
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

import type { IMJChatMessageExtraComponent } from './slot-interfaces';

@Component({
    selector: 'mj-chat-message-extra-default',
    standalone: true,
    imports: [CommonModule],
    template: ``,
})
export class MJChatMessageExtraDefaultComponent implements IMJChatMessageExtraComponent {
    @Input() public Message!: MJConversationDetailEntity;
}
