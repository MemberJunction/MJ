/**
 * @fileoverview Default `header` slot component.
 *
 * Minimal title-and-badge header. Most production usage of the chat-area still
 * uses the component's built-in header rendering (export / share / member /
 * artifact chips); this default is the version a consumer gets when they
 * project a custom template into the `header` slot and want to wrap the
 * default for containment.
 *
 * @module @memberjunction/ng-conversations
 */

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import type { IMJChatHeaderComponent } from './slot-interfaces';

@Component({
    selector: 'mj-chat-header-default',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="mj-chat-header-default">
            <div class="mj-chat-header-default__title">
                @if (ConversationTitle) {
                    {{ ConversationTitle }}
                } @else {
                    <span class="mj-chat-header-default__title-placeholder">New conversation</span>
                }
            </div>
            @if (SharedBy) {
                <span class="mj-chat-header-default__shared-by">
                    <i class="fa-solid fa-share-nodes"></i>
                    Shared by {{ SharedBy }}
                </span>
            }
            @if (ShowArtifactIndicator && ArtifactCount && ArtifactCount > 0) {
                <span class="mj-chat-header-default__artifact-badge">
                    <i class="fa-solid fa-cube"></i>
                    {{ ArtifactCount }}
                </span>
            }
        </div>
    `,
    styles: [
        `
            .mj-chat-header-default {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.5rem 0.75rem;
                background: var(--mj-bg-surface);
                border-bottom: 1px solid var(--mj-border-default);
            }
            .mj-chat-header-default__title {
                font-weight: 600;
                color: var(--mj-text-primary);
            }
            .mj-chat-header-default__title-placeholder {
                color: var(--mj-text-muted);
                font-style: italic;
                font-weight: 400;
            }
            .mj-chat-header-default__shared-by,
            .mj-chat-header-default__artifact-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                font-size: 0.85rem;
                color: var(--mj-text-secondary);
            }
        `,
    ],
})
export class MJChatHeaderDefaultComponent implements IMJChatHeaderComponent {
    @Input() public ConversationTitle?: string | null;
    @Input() public SharedBy?: string | null;
    @Input() public ArtifactCount?: number;
    @Input() public ShowArtifactIndicator: boolean = true;
}
