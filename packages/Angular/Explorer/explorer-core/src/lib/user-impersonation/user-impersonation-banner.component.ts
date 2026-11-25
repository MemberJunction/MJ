import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    OnInit,
    inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { MJUserImpersonationService } from './user-impersonation.service';
import type { MJImpersonationState } from './user-impersonation.types';

/**
 * Compact persistent shell banner rendered whenever the Explorer session is actively
 * impersonating another user via {@link MJUserImpersonationService}.
 */
@Component({
    selector: 'mj-user-impersonation-banner',
    standalone: true,
    imports: [MJButtonDirective],
    template: `
        @if (State.activeTarget; as target) {
            <div class="impersonation-banner" role="status" aria-live="polite">
                <div class="impersonation-banner-info">
                    <i class="fa-solid fa-masks-theater impersonation-banner-icon" aria-hidden="true"></i>
                    <span class="impersonation-banner-text">
                        Viewing as <strong>{{ target.name }}</strong>
                        @if (target.email) {
                            <span class="impersonation-banner-email">({{ target.email }})</span>
                        }
                        @if (State.actorIdentity?.email) {
                            <span class="impersonation-banner-actor">
                                · Real session: {{ State.actorIdentity?.email }}
                            </span>
                        }
                    </span>
                </div>
                <div class="impersonation-banner-actions">
                    <button
                        mjButton
                        variant="outline"
                        size="sm"
                        type="button"
                        [disabled]="State.switching"
                        (click)="OnSwitchUser()">
                        <i class="fa-solid fa-repeat" aria-hidden="true"></i>
                        Switch User
                    </button>
                    <button
                        mjButton
                        variant="danger"
                        size="sm"
                        type="button"
                        [disabled]="State.switching"
                        (click)="OnExit()">
                        <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
                        Exit
                    </button>
                </div>
            </div>
        }
    `,
    styles: [`
        :host {
            display: block;
            flex-shrink: 0;
            width: 100%;
        }

        .impersonation-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: var(--mj-space-2, 8px) var(--mj-space-4, 16px);
            padding: 6px 16px;
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
            border-bottom: 1px solid var(--mj-status-warning-border);
            font-size: 13px;
        }

        .impersonation-banner-info {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }

        .impersonation-banner-icon {
            font-size: 14px;
            flex-shrink: 0;
        }

        .impersonation-banner-text {
            line-height: 1.35;
        }

        .impersonation-banner-email,
        .impersonation-banner-actor {
            opacity: 0.9;
        }

        .impersonation-banner-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }

        @media (max-width: 640px) {
            .impersonation-banner {
                padding: 8px 12px;
                font-size: 12px;
            }

            .impersonation-banner-actor {
                display: none;
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserImpersonationBannerComponent implements OnInit {
    private readonly impersonationService = inject(MJUserImpersonationService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly destroyRef = inject(DestroyRef);

    public State: MJImpersonationState = this.impersonationService.CurrentState;

    public ngOnInit(): void {
        this.impersonationService.State$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((state) => {
                this.State = state;
                this.cdr.markForCheck();
            });
    }

    public OnSwitchUser(): void {
        this.impersonationService.OpenDialog();
    }

    public async OnExit(): Promise<void> {
        await this.impersonationService.ExitImpersonation();
    }
}
