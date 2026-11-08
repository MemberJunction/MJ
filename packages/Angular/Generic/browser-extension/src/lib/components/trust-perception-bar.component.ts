/**
 * @fileoverview Standalone Angular 21 Trust & Perception Bar (`<mj-extension-trust-bar>`)
 * for the MemberJunction Browser Extension Side Panel.
 *
 * Provides user-facing controls for:
 * 1. Domain status & 1-click Block/Unblock Domain toggle
 * 2. Channels v2 3-state exposure ceiling (`'none' | 'state' | 'pixels'`)
 * 3. Browser control mode selector (`'content-script' | 'debugger-cdp' | 'auto'`)
 *    respecting the enterprise `AllowDebuggerCDP` ceiling
 * 4. Auth / MFA screen auto-pause notification banner
 */

import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    inject,
    Input,
    Output,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import { BrowserControlBackendMode } from '@memberjunction/browser-extension-core';

/**
 * Event payload emitted when the user changes the exposure ceiling.
 */
export interface ExposureChangeEvent {
    /** Previous exposure level. */
    PreviousExposure: RealtimeChannelExposure;
    /** Newly selected exposure level. */
    NewExposure: RealtimeChannelExposure;
}

/**
 * Event payload emitted when the user switches the browser control mode.
 */
export interface ControlModeChangeEvent {
    /** Previous control mode. */
    PreviousMode: BrowserControlBackendMode;
    /** Newly selected control mode. */
    NewMode: BrowserControlBackendMode;
    /** Domain hostname the change applies to. */
    Hostname: string;
}

/**
 * Standalone Angular 21 Trust & Perception Bar component for the MJ Browser Extension Side Panel.
 */
@Component({
    selector: 'mj-extension-trust-bar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="mj-trust-bar" role="region" aria-label="Browser Trust and Perception Controls">
            <div class="mj-trust-row">
                <div class="mj-domain-badge" [class.mj-domain-blocked]="IsDomainBlocked">
                    <span class="mj-domain-dot" aria-hidden="true"></span>
                    <span class="mj-domain-host" [title]="CurrentHostname || 'No active tab'">
                        {{ CurrentHostname || 'No active tab' }}
                    </span>
                    <button
                        type="button"
                        class="mj-domain-toggle-btn"
                        (click)="OnToggleDomainBlocked()"
                        [attr.aria-pressed]="IsDomainBlocked"
                    >
                        @if (IsDomainBlocked) {
                            Unblock
                        } @else {
                            Pause Site
                        }
                    </button>
                </div>

                @if (IsDebuggerAttached) {
                    <span class="mj-debugger-live-pill" title="Chrome CDP 1.3 Power Mode is currently attached">
                        CDP Active
                    </span>
                }
            </div>

            <div class="mj-controls-row">
                <div class="mj-control-group" role="group" aria-label="Page Perception Exposure">
                    <span class="mj-control-label">Perception</span>
                    <div class="mj-segmented-pills">
                        @for (option of ExposureOptions; track option.Value) {
                            <button
                                type="button"
                                class="mj-pill-btn"
                                [class.mj-pill-active]="Exposure === option.Value"
                                [disabled]="IsDomainBlocked"
                                (click)="OnSelectExposure(option.Value)"
                                [title]="option.Description"
                            >
                                {{ option.Label }}
                            </button>
                        }
                    </div>
                </div>

                <div class="mj-control-group" role="group" aria-label="Browser Control Mode">
                    <span class="mj-control-label">Control</span>
                    <div class="mj-segmented-pills">
                        @for (mode of ControlModeOptions; track mode.Value) {
                            <button
                                type="button"
                                class="mj-pill-btn"
                                [class.mj-pill-active]="ControlMode === mode.Value"
                                [disabled]="IsDomainBlocked || (!AllowDebuggerCDP && mode.Value !== 'content-script')"
                                (click)="OnSelectControlMode(mode.Value)"
                                [title]="!AllowDebuggerCDP && mode.Value !== 'content-script' ? 'Disabled by Enterprise Policy (AllowDebuggerCDP = false)' : mode.Description"
                            >
                                {{ mode.Label }}
                            </button>
                        }
                    </div>
                </div>
            </div>

            @if (IsAuthOrMfaScreen) {
                <div class="mj-auth-pause-banner" role="status">
                    <span class="mj-auth-pause-title">Sign-In / MFA Screen Detected</span>
                    <span class="mj-auth-pause-desc">
                        Automated browser actions and pixel streaming are paused while you complete authentication.
                    </span>
                </div>
            }
        </section>
    `,
    styles: [
        `
            :host {
                display: block;
                font-family: var(--mj-font-family-base, system-ui, -apple-system, sans-serif);
            }
            .mj-trust-bar {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2, 8px);
                padding: var(--mj-space-2-5, 10px) var(--mj-space-3, 12px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-bottom: 1px solid var(--mj-border-default);
                color: var(--mj-text-primary);
            }
            .mj-trust-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
            }
            .mj-domain-badge {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2, 8px);
                padding: 3px 8px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
                font-size: var(--mj-text-xs, 12px);
                max-width: 100%;
            }
            .mj-domain-dot {
                width: 8px;
                height: 8px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-status-success);
                flex-shrink: 0;
            }
            .mj-domain-blocked .mj-domain-dot {
                background: var(--mj-status-error);
            }
            .mj-domain-host {
                font-weight: 600;
                color: var(--mj-text-primary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .mj-domain-toggle-btn {
                border: none;
                background: transparent;
                color: var(--mj-brand-primary);
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: var(--mj-radius-sm, 4px);
            }
            .mj-domain-toggle-btn:hover {
                background: var(--mj-bg-surface-hover, var(--mj-bg-surface));
            }
            .mj-debugger-live-pill {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                padding: 2px 8px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-status-warning-bg, var(--mj-bg-surface-sunken));
                color: var(--mj-status-warning);
                border: 1px solid var(--mj-status-warning);
            }
            .mj-controls-row {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
            }
            .mj-control-group {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-1-5, 6px);
            }
            .mj-control-label {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                color: var(--mj-text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }
            .mj-segmented-pills {
                display: inline-flex;
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-md, 6px);
                padding: 2px;
                gap: 2px;
            }
            .mj-pill-btn {
                border: none;
                background: transparent;
                color: var(--mj-text-secondary);
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                padding: 3px 8px;
                border-radius: var(--mj-radius-sm, 4px);
                cursor: pointer;
                transition: background 120ms ease, color 120ms ease;
            }
            .mj-pill-btn.mj-pill-active {
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
            }
            .mj-pill-btn:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }
            .mj-auth-pause-banner {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: var(--mj-space-2, 8px);
                border-radius: var(--mj-radius-md, 6px);
                background: var(--mj-status-warning-bg, var(--mj-bg-surface-sunken));
                border: 1px solid var(--mj-status-warning);
                font-size: var(--mj-text-xs, 12px);
            }
            .mj-auth-pause-title {
                font-weight: 700;
                color: var(--mj-status-warning);
            }
            .mj-auth-pause-desc {
                color: var(--mj-text-secondary);
            }
        `,
    ],
})
export class MJExtensionTrustBarComponent extends BaseAngularComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Hostname of the currently active browser tab. */
    @Input() public CurrentHostname = '';

    /** Whether the current domain is blocked/paused by user or policy. */
    @Input() public IsDomainBlocked = false;

    /** Current Channels v2 exposure level (`'none' | 'state' | 'pixels'`). */
    @Input() public Exposure: RealtimeChannelExposure = 'pixels';

    /** Current browser control backend mode (`'content-script' | 'debugger-cdp' | 'auto'`). */
    @Input() public ControlMode: BrowserControlBackendMode = 'content-script';

    /** Whether the enterprise agent settings allow `debugger-cdp` or `auto` escalation. */
    @Input() public AllowDebuggerCDP = true;

    /** Whether `chrome.debugger` is actively attached to the current tab right now. */
    @Input() public IsDebuggerAttached = false;

    /** Whether the active page is detected as a login, SSO, or MFA screen. */
    @Input() public IsAuthOrMfaScreen = false;

    /** Emitted when the user selects a new exposure level. */
    @Output() public readonly ExposureChanged = new EventEmitter<ExposureChangeEvent>();

    /** Emitted when the user selects a new browser control mode. */
    @Output() public readonly ControlModeChanged = new EventEmitter<ControlModeChangeEvent>();

    /** Emitted when the user clicks Pause Site / Unblock for the current domain. */
    @Output() public readonly DomainBlockedToggled = new EventEmitter<{
        Hostname: string;
        Blocked: boolean;
    }>();

    /** Available 3-state exposure options. */
    public readonly ExposureOptions: ReadonlyArray<{
        Value: RealtimeChannelExposure;
        Label: string;
        Description: string;
    }> = [
        {
            Value: 'none',
            Label: 'Off',
            Description: 'Agent cannot read page DOM or screenshots',
        },
        {
            Value: 'state',
            Label: 'DOM',
            Description: 'Agent reads structured DOM state only (no screenshots)',
        },
        {
            Value: 'pixels',
            Label: 'Vision',
            Description: 'Agent reads structured DOM state and visual screenshots',
        },
    ];

    /** Available dual-mode + auto browser control options. */
    public readonly ControlModeOptions: ReadonlyArray<{
        Value: BrowserControlBackendMode;
        Label: string;
        Description: string;
    }> = [
        {
            Value: 'content-script',
            Label: 'Zero-Banner',
            Description: 'Mode 1 (Recommended Default): Pure Content Script DOM control with zero Chrome debugger banner',
        },
        {
            Value: 'auto',
            Label: 'Auto',
            Description: 'Mode 3: Uses Content Script by default and escalates to CDP only when trusted input or closed Shadow DOM is needed',
        },
        {
            Value: 'debugger-cdp',
            Label: 'CDP Power',
            Description: 'Mode 2: Full Chrome DevTools Protocol (CDP 1.3) hardware-level trusted events',
        },
    ];

    /**
     * Handle user selection of a new perception exposure level.
     */
    public OnSelectExposure(nextExposure: RealtimeChannelExposure): void {
        if (this.IsDomainBlocked || nextExposure === this.Exposure) {
            return;
        }
        const previous = this.Exposure;
        this.Exposure = nextExposure;
        this.cdr.markForCheck();
        this.ExposureChanged.emit({
            PreviousExposure: previous,
            NewExposure: nextExposure,
        });
    }

    /**
     * Handle user selection of a new browser control backend mode.
     */
    public OnSelectControlMode(nextMode: BrowserControlBackendMode): void {
        if (this.IsDomainBlocked || nextMode === this.ControlMode) {
            return;
        }
        if (!this.AllowDebuggerCDP && nextMode !== 'content-script') {
            return;
        }
        const previous = this.ControlMode;
        this.ControlMode = nextMode;
        this.cdr.markForCheck();
        this.ControlModeChanged.emit({
            PreviousMode: previous,
            NewMode: nextMode,
            Hostname: this.CurrentHostname,
        });
    }

    /**
     * Toggle whether the current domain is blocked/paused.
     */
    public OnToggleDomainBlocked(): void {
        if (!this.CurrentHostname) {
            return;
        }
        this.IsDomainBlocked = !this.IsDomainBlocked;
        this.cdr.markForCheck();
        this.DomainBlockedToggled.emit({
            Hostname: this.CurrentHostname,
            Blocked: this.IsDomainBlocked,
        });
    }
}
