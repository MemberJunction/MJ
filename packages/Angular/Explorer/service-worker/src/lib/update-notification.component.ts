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
 * Visual design uses MJ design tokens (no hardcoded colors) so it picks up
 * dark mode + brand customization automatically. Slide-up entrance animation
 * + subtle pulse on the icon to draw attention without being aggressive.
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
                <div class="mj-sw-update-toast__icon" aria-hidden="true">
                    <i class="fa-solid fa-arrows-rotate"></i>
                </div>
                <div class="mj-sw-update-toast__content">
                    <div class="mj-sw-update-toast__title">
                        Update available (test build #7)
                    </div>
                    <div class="mj-sw-update-toast__subtitle">
                        A newer version of MemberJunction has been downloaded. Reload now to apply, or keep working and we'll prompt you again next time.
                    </div>
                    <div class="mj-sw-update-toast__actions">
                        <button
                            type="button"
                            class="mj-sw-update-toast__btn mj-sw-update-toast__btn--primary"
                            (click)="onReload()"
                        >
                            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                            <span>Reload now</span>
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
                <button
                    type="button"
                    class="mj-sw-update-toast__close"
                    aria-label="Dismiss"
                    (click)="onDismiss()"
                >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
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
            max-width: 100%;
        }

        @keyframes mj-sw-toast-in {
            from {
                opacity: 0;
                transform: translateY(16px) scale(0.98);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }

        @keyframes mj-sw-toast-pulse {
            0%, 100% {
                box-shadow: 0 0 0 0 color-mix(in srgb, var(--mj-brand-primary) 35%, transparent);
            }
            50% {
                box-shadow: 0 0 0 8px color-mix(in srgb, var(--mj-brand-primary) 0%, transparent);
            }
        }

        .mj-sw-update-toast {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            position: relative;
            background: var(--mj-bg-surface-elevated);
            color: var(--mj-text-primary);
            border: 1px solid var(--mj-border-default);
            border-radius: 12px;
            padding: 16px 18px 16px 16px;
            width: 380px;
            max-width: calc(100vw - 48px);
            box-shadow:
                0 1px 2px color-mix(in srgb, var(--mj-text-primary) 6%, transparent),
                0 12px 32px color-mix(in srgb, var(--mj-text-primary) 16%, transparent);
            pointer-events: auto;
            font-size: 13.5px;
            line-height: 1.45;
            animation: mj-sw-toast-in 220ms cubic-bezier(0.2, 0.9, 0.32, 1.15) both;
        }

        .mj-sw-update-toast__icon {
            flex: 0 0 auto;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            font-size: 16px;
            animation: mj-sw-toast-pulse 2.4s ease-in-out 0.4s 2;
        }

        .mj-sw-update-toast__content {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .mj-sw-update-toast__title {
            color: var(--mj-text-primary);
            font-weight: 600;
            font-size: 14px;
            letter-spacing: -0.005em;
        }

        .mj-sw-update-toast__subtitle {
            color: var(--mj-text-secondary);
            font-size: 12.5px;
            line-height: 1.5;
            margin-bottom: 4px;
        }

        .mj-sw-update-toast__actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .mj-sw-update-toast__btn {
            font: inherit;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            padding: 7px 14px;
            border-radius: 8px;
            border: 1px solid transparent;
            line-height: 1.2;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.08s ease;
        }
        .mj-sw-update-toast__btn:active {
            transform: translateY(1px);
        }
        .mj-sw-update-toast__btn:focus-visible {
            outline: 2px solid var(--mj-border-focus);
            outline-offset: 2px;
        }

        .mj-sw-update-toast__btn--primary {
            background: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
        }
        .mj-sw-update-toast__btn--primary:hover {
            background: var(--mj-brand-primary-hover);
        }
        .mj-sw-update-toast__btn--primary:active {
            background: var(--mj-brand-primary-active);
        }

        .mj-sw-update-toast__btn--secondary {
            background: transparent;
            border-color: var(--mj-border-default);
            color: var(--mj-text-secondary);
        }
        .mj-sw-update-toast__btn--secondary:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
            border-color: var(--mj-border-strong);
        }

        .mj-sw-update-toast__close {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 24px;
            height: 24px;
            border: none;
            background: transparent;
            color: var(--mj-text-muted);
            border-radius: 6px;
            cursor: pointer;
            display: grid;
            place-items: center;
            font-size: 12px;
            transition: background 0.15s ease, color 0.15s ease;
        }
        .mj-sw-update-toast__close:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }
        .mj-sw-update-toast__close:focus-visible {
            outline: 2px solid var(--mj-border-focus);
            outline-offset: 1px;
        }

        @media (prefers-reduced-motion: reduce) {
            .mj-sw-update-toast {
                animation: none;
            }
            .mj-sw-update-toast__icon {
                animation: none;
            }
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
