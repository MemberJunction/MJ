/**
 * @fileoverview Default `agentPresence` slot component.
 *
 * Renders a small avatar + agent-name + voice-state indicator. Off by default
 * (the chat-area's `[ShowAgentCharacter]` input gates this slot's visibility).
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import type {
    IMJChatAgentPresenceComponent,
    MJChatAgentPresenceState,
} from './slot-interfaces';

@Component({
    selector: 'mj-chat-agent-presence-default',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="mj-chat-agent-presence-default"
            [class.mj-chat-agent-presence-default--prominent]="Mode === 'prominent'"
            [class.mj-chat-agent-presence-default--listening]="State === 'listening'"
            [class.mj-chat-agent-presence-default--thinking]="State === 'thinking'"
            [class.mj-chat-agent-presence-default--speaking]="State === 'speaking'"
        >
            @if (AvatarUrl) {
                <img class="mj-chat-agent-presence-default__avatar" [src]="AvatarUrl" alt="" />
            } @else {
                <div class="mj-chat-agent-presence-default__avatar-placeholder">
                    <i class="fa-solid fa-robot"></i>
                </div>
            }
            @if (AgentName) {
                <span class="mj-chat-agent-presence-default__name">{{ AgentName }}</span>
            }
            @if (State !== 'idle') {
                <span class="mj-chat-agent-presence-default__state">{{ State }}</span>
            }
        </div>
    `,
    styles: [
        `
            .mj-chat-agent-presence-default {
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.25rem 0.5rem;
                border-radius: 999px;
                background: var(--mj-chat-character-accent, var(--mj-bg-surface-card));
                color: var(--mj-text-primary);
                font-size: 0.85rem;
                opacity: 1;
                transition: opacity 0.2s ease;
            }
            .mj-chat-agent-presence-default__avatar,
            .mj-chat-agent-presence-default__avatar-placeholder {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: var(--mj-bg-surface);
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .mj-chat-agent-presence-default__name {
                font-weight: 500;
            }
            .mj-chat-agent-presence-default__state {
                color: var(--mj-text-secondary);
                font-style: italic;
            }
            .mj-chat-agent-presence-default--listening .mj-chat-agent-presence-default__state {
                color: var(--mj-chat-voice-listening, var(--mj-status-info));
            }
            .mj-chat-agent-presence-default--thinking .mj-chat-agent-presence-default__state {
                color: var(--mj-chat-voice-thinking, var(--mj-status-warning));
            }
            .mj-chat-agent-presence-default--speaking .mj-chat-agent-presence-default__state {
                color: var(--mj-chat-voice-speaking, var(--mj-brand-primary));
            }
            .mj-chat-agent-presence-default--prominent {
                padding: 0.5rem 1rem;
                font-size: 1rem;
            }
        `,
    ],
})
export class MJChatAgentPresenceDefaultComponent implements IMJChatAgentPresenceComponent {
    @Input() public State: MJChatAgentPresenceState = 'idle';
    @Input() public AgentName?: string;
    @Input() public AvatarUrl?: string;
    @Input() public Mode: 'subtle' | 'prominent' = 'subtle';
}
