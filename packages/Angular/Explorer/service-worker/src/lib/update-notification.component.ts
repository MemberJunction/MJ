import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpdateNotificationService } from './update-notification.service';

/**
 * Renders a small bottom-right toast when a new app version is available.
 * Two actions: "Reload" applies the update; "Later" dismisses for the session.
 *
 * Standalone component — no NgModule needed, drop into the shell template
 * with `<mj-update-notification></mj-update-notification>`.
 *
 * Visual design uses the same MJ design tokens as other notifications so it
 * automatically picks up dark mode + brand customization.
 *
 * **First-draft note**: this is intentionally minimal. The eventual lead may
 * want to integrate with the existing `MJNotificationService` toast stack
 * for visual consistency, or move to a non-modal banner higher up the
 * viewport. Keeping it self-contained here so it's easy to replace.
 */
@Component({
    standalone: true,
    selector: 'mj-update-notification',
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (updateService.updateAvailable$ | async) {
            <div
                class="mj-sw-update-toast"
                role="status"
                aria-live="polite"
            >
                <span class="mj-sw-update-toast__message">
                    A new version of MemberJunction is available.
                </span>
                <div class="mj-sw-update-toast__actions">
                    <button
                        type="button"
                        class="mj-sw-update-toast__btn mj-sw-update-toast__btn--primary"
                        (click)="onReload()"
                    >
                        Reload
                    </button>
                    <button
                        type="button"
                        class="mj-sw-update-toast__btn mj-sw-update-toast__btn--secondary"
                        (click)="onDismiss()"
                    >
                        Later
                    </button>
                </div>
            </div>
        }
    `,
    styles: [`
        :host {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 1000;
            pointer-events: none;
        }
        .mj-sw-update-toast {
            display: flex;
            flex-direction: column;
            gap: 12px;
            background: var(--mj-bg-surface-elevated);
            color: var(--mj-text-primary);
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            padding: 14px 18px;
            min-width: 280px;
            max-width: 360px;
            box-shadow: 0 8px 24px color-mix(in srgb, var(--mj-text-primary) 12%, transparent);
            pointer-events: auto;
            font-size: 14px;
            line-height: 1.4;
        }
        .mj-sw-update-toast__message {
            color: var(--mj-text-primary);
        }
        .mj-sw-update-toast__actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .mj-sw-update-toast__btn {
            font: inherit;
            cursor: pointer;
            padding: 6px 14px;
            border-radius: 6px;
            border: 1px solid transparent;
            line-height: 1.2;
            transition: background 0.15s ease, border-color 0.15s ease;
        }
        .mj-sw-update-toast__btn--primary {
            background: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
        }
        .mj-sw-update-toast__btn--primary:hover {
            background: var(--mj-brand-primary-hover);
        }
        .mj-sw-update-toast__btn--secondary {
            background: transparent;
            border-color: var(--mj-border-default);
            color: var(--mj-text-secondary);
        }
        .mj-sw-update-toast__btn--secondary:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }
    `]
})
export class UpdateNotificationComponent {
    public readonly updateService = inject(UpdateNotificationService);

    onReload(): void {
        this.updateService.applyUpdate();
    }

    onDismiss(): void {
        this.updateService.dismissForSession();
    }
}
