/**
 * @fileoverview Default `emptyState` slot component.
 *
 * Minimal greeting + optional subtext + optional suggested-prompt chips.
 * Standalone, exported, intentionally simple so consumers can:
 *
 * 1. Project an ad-hoc template via `<ng-template mjChatSlot="emptyState">` if
 *    the default's shape doesn't fit.
 * 2. Wrap this default in their own frame (containment) — e.g. a warm tutor
 *    welcome card surrounding the default's prompts.
 * 3. Subclass — extend this component, override only what they need (e.g.,
 *    swap the prompt-chip rendering for a different visual treatment), and
 *    use the subclass as the slot fill.
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import type { IMJChatEmptyStateComponent } from './slot-interfaces';

@Component({
    selector: 'mj-chat-empty-state-default',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mj-chat-empty-state-default">
            <div class="mj-chat-empty-state-default__greeting">{{ Greeting }}</div>
            @if (Subtext) {
                <div class="mj-chat-empty-state-default__subtext">{{ Subtext }}</div>
            }
            @if (EffectiveSuggestedPrompts.length > 0) {
                <div class="mj-chat-empty-state-default__prompts">
                    @for (prompt of EffectiveSuggestedPrompts; track prompt) {
                        <button
                            type="button"
                            class="mj-chat-empty-state-default__prompt-chip"
                            (click)="PromptSelected.emit(prompt)"
                        >
                            {{ prompt }}
                        </button>
                    }
                </div>
            }
        </div>
    `,
    styles: [
        `
            .mj-chat-empty-state-default {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
                padding: 2rem;
                text-align: center;
                color: var(--mj-text-primary);
            }
            .mj-chat-empty-state-default__greeting {
                font-size: 1.25rem;
                font-weight: 600;
            }
            .mj-chat-empty-state-default__subtext {
                color: var(--mj-text-secondary);
            }
            .mj-chat-empty-state-default__prompts {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem;
                margin-top: 1rem;
            }
            .mj-chat-empty-state-default__prompt-chip {
                padding: 0.4rem 0.8rem;
                border-radius: 999px;
                border: 1px solid var(--mj-border-default);
                background: var(--mj-bg-surface-card);
                color: var(--mj-text-primary);
                cursor: pointer;
                font-size: 0.85rem;
            }
            .mj-chat-empty-state-default__prompt-chip:hover {
                background: var(--mj-bg-surface-hover);
            }
        `,
    ],
})
export class MJChatEmptyStateDefaultComponent implements IMJChatEmptyStateComponent {
    /**
     * Generic, deployment-agnostic starter prompts shown out-of-the-box so a business
     * user never faces a blank box. Intentionally broad (they work regardless of what
     * data or agents a deployment has). A host overrides them by binding `SuggestedPrompts`
     * to its own list, or suppresses them entirely by binding an empty array.
     */
    public static readonly DefaultSuggestedPrompts: readonly string[] = [
        'What can you help me with?',
        'Summarize my recent activity',
        'Help me find a record',
        'What should I focus on today?',
    ];

    @Input() public Greeting: string = 'How can I help you?';
    @Input() public Subtext?: string;
    @Input() public SuggestedPrompts?: string[];

    @Output() public PromptSelected = new EventEmitter<string>();

    /**
     * The prompts actually rendered: the host-supplied list when provided (including an
     * explicit empty array to suppress), otherwise the built-in defaults. `??` only falls
     * back on null/undefined, so `[]` correctly renders nothing.
     */
    public get EffectiveSuggestedPrompts(): readonly string[] {
        return this.SuggestedPrompts ?? MJChatEmptyStateDefaultComponent.DefaultSuggestedPrompts;
    }
}
