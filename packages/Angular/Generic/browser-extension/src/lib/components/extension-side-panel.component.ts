/**
 * @fileoverview Top-level standalone Angular 21 Side Panel shell (`<mj-extension-side-panel>`)
 * for the MemberJunction Browser Extension.
 *
 * Composes:
 * 1. White-Label Brand Header (MJ Co-Pilot, Betty, Sidecar, or custom tenant `MJ: Brand Kits`)
 *    + Zero-Blip Session Continuity indicator
 * 2. `<mj-extension-trust-bar>` (Domain pause, 3-state Exposure, Dual-Mode Control Backend)
 * 3. `<mj-braided-context-drawer>` (Multi-App Context Braiding + Page-to-Entity Diff Preview)
 * 4. `<mj-extension-playbook-stepper>` (Guided Cross-Site Playbooks + Model-Blind Secret Vault Pipe)
 * 5. Voice & Text Conversation stream + projected `[slot=conversation]` content
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
import {
    BraidedPageContextPayload,
    BrowserControlBackendMode,
    BrowserPlaybookDefinition,
    ExtensionSessionTopology,
} from '@memberjunction/browser-extension-core';
import {
    ControlModeChangeEvent,
    ExposureChangeEvent,
    MJExtensionTrustBarComponent,
} from './trust-perception-bar.component';
import {
    AfterOpenExtensionRecordEvent,
    ApplyPageEntityDiffsEvent,
    BeforeOpenExtensionRecordEvent,
    MJBraidedContextDrawerComponent,
} from './braided-context-drawer.component';
import {
    MJExtensionPlaybookStepperComponent,
    PlaybookStepExecuteEvent,
} from './playbook-stepper.component';

/**
 * Conversation message item displayed in the Side Panel transcript.
 */
export interface ExtensionChatMessage {
    /** Unique message identifier. */
    ID: string;
    /** Sender role (`'user' | 'assistant' | 'system'`). */
    Role: 'user' | 'assistant' | 'system';
    /** Message markdown/plain text. */
    Content: string;
    /** ISO-8601 timestamp. */
    TimestampIso: string;
}

/**
 * Top-level standalone Angular 21 Side Panel shell component.
 */
@Component({
    selector: 'mj-extension-side-panel',
    standalone: true,
    imports: [
        MJExtensionTrustBarComponent,
        MJBraidedContextDrawerComponent,
        MJExtensionPlaybookStepperComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <aside class="mj-ext-side-panel" role="complementary" [attr.aria-label]="AssistantDisplayName">
            <header class="mj-ext-header">
                <div class="mj-ext-brand">
                    <span class="mj-ext-avatar" aria-hidden="true">{{ AssistantDisplayName.slice(0, 1) }}</span>
                    <div class="mj-ext-brand-titles">
                        <h1 class="mj-ext-title">{{ AssistantDisplayName }}</h1>
                        @if (Tagline) {
                            <span class="mj-ext-tagline">{{ Tagline }}</span>
                        }
                    </div>
                </div>
                <div class="mj-ext-session-status">
                    @if (ActiveTopology === 'topology-a-shared-daemon') {
                        <span class="mj-session-pill mj-session-zero-blip" title="Zero-blip shared voice & text daemon active">
                            Live Daemon (0ms)
                        </span>
                    } @else if (ActiveTopology === 'topology-b-warm-resume') {
                        <span class="mj-session-pill" title="Resumed via LastSessionID continuity">
                            Session Linked
                        </span>
                    }
                    <button
                        type="button"
                        class="mj-voice-btn"
                        [class.mj-voice-active]="IsVoiceActive"
                        (click)="OnToggleVoice()"
                        [attr.aria-pressed]="IsVoiceActive"
                    >
                        @if (IsVoiceActive) {
                            Voice On
                        } @else {
                            Voice Off
                        }
                    </button>
                </div>
            </header>

            <mj-extension-trust-bar
                [Provider]="Provider"
                [CurrentHostname]="CurrentHostname"
                [IsDomainBlocked]="IsDomainBlocked"
                [Exposure]="Exposure"
                [ControlMode]="ControlMode"
                [AllowDebuggerCDP]="AllowDebuggerCDP"
                [IsDebuggerAttached]="IsDebuggerAttached"
                [IsAuthOrMfaScreen]="IsAuthOrMfaScreen"
                (ExposureChanged)="ExposureChanged.emit($event)"
                (ControlModeChanged)="ControlModeChanged.emit($event)"
                (DomainBlockedToggled)="DomainBlockedToggled.emit($event)"
            ></mj-extension-trust-bar>

            <mj-braided-context-drawer
                [Provider]="Provider"
                [BraidedContext]="BraidedContext"
                [IsCollapsed]="IsContextDrawerCollapsed"
                (BeforeOpenRecord)="BeforeOpenRecord.emit($event)"
                (AfterOpenRecord)="AfterOpenRecord.emit($event)"
                (ApplyEntityDiffs)="ApplyEntityDiffs.emit($event)"
            ></mj-braided-context-drawer>

            @if (ActivePlaybook) {
                <mj-extension-playbook-stepper
                    [Provider]="Provider"
                    [Playbook]="ActivePlaybook"
                    [ActiveStepIndex]="ActivePlaybookStepIndex"
                    (ExecuteStep)="ExecutePlaybookStep.emit($event)"
                ></mj-extension-playbook-stepper>
            }

            <div class="mj-ext-conversation-region">
                <ng-content select="[slot=conversation]"></ng-content>

                <div class="mj-ext-messages" role="log" aria-live="polite">
                    @for (msg of Messages; track msg.ID) {
                        <div class="mj-chat-bubble" [class.mj-chat-user]="msg.Role === 'user'" [class.mj-chat-assistant]="msg.Role === 'assistant'">
                            <span class="mj-chat-role">
                                @if (msg.Role === 'user') {
                                    You
                                } @else {
                                    {{ AssistantDisplayName }}
                                }
                            </span>
                            <p class="mj-chat-text">{{ msg.Content }}</p>
                        </div>
                    }
                </div>
            </div>

            <footer class="mj-ext-composer">
                <input
                    type="text"
                    class="mj-composer-input"
                    [value]="DraftPrompt"
                    (input)="OnDraftInput($event)"
                    (keydown.enter)="OnSubmitPrompt()"
                    [placeholder]="'Ask ' + AssistantDisplayName + ' about this page...'"
                    [attr.aria-label]="'Ask ' + AssistantDisplayName"
                />
                <button
                    type="button"
                    class="mj-composer-send-btn"
                    (click)="OnSubmitPrompt()"
                    [disabled]="!DraftPrompt.trim()"
                >
                    Send
                </button>
            </footer>
        </aside>
    `,
    styles: [
        `
            :host {
                display: block;
                height: 100%;
                width: 100%;
                font-family: var(--mj-font-family-base, system-ui, -apple-system, sans-serif);
            }
            .mj-ext-side-panel {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-width: 300px;
                background: var(--mj-bg-surface);
                color: var(--mj-text-primary);
            }
            .mj-ext-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
                padding: var(--mj-space-3, 12px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-bottom: 1px solid var(--mj-border-default);
            }
            .mj-ext-brand {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2, 8px);
            }
            .mj-ext-avatar {
                width: 30px;
                height: 30px;
                border-radius: var(--mj-radius-md, 8px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                font-weight: 700;
                font-size: var(--mj-text-sm, 14px);
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .mj-ext-brand-titles {
                display: flex;
                flex-direction: column;
            }
            .mj-ext-title {
                margin: 0;
                font-size: var(--mj-text-sm, 14px);
                font-weight: 700;
                color: var(--mj-text-primary);
            }
            .mj-ext-tagline {
                font-size: var(--mj-text-xs, 11px);
                color: var(--mj-text-secondary);
            }
            .mj-ext-session-status {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-1-5, 6px);
            }
            .mj-session-pill {
                font-size: 10px;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                color: var(--mj-text-secondary);
                border: 1px solid var(--mj-border-default);
            }
            .mj-session-zero-blip {
                color: var(--mj-status-success);
                border-color: var(--mj-status-success);
            }
            .mj-voice-btn {
                border: 1px solid var(--mj-border-default);
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                color: var(--mj-text-primary);
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                padding: 4px 10px;
                cursor: pointer;
            }
            .mj-voice-btn.mj-voice-active {
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                border-color: var(--mj-brand-primary);
            }
            .mj-ext-conversation-region {
                flex: 1;
                overflow-y: auto;
                padding: var(--mj-space-3, 12px);
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2, 8px);
            }
            .mj-ext-messages {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2, 8px);
            }
            .mj-chat-bubble {
                padding: var(--mj-space-2, 8px) var(--mj-space-2-5, 10px);
                border-radius: var(--mj-radius-md, 8px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
                max-width: 92%;
            }
            .mj-chat-user {
                align-self: flex-end;
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                border-color: var(--mj-brand-primary);
            }
            .mj-chat-assistant {
                align-self: flex-start;
            }
            .mj-chat-role {
                display: block;
                font-size: 10px;
                font-weight: 700;
                opacity: 0.8;
                margin-bottom: 2px;
            }
            .mj-chat-text {
                margin: 0;
                font-size: var(--mj-text-xs, 12px);
                line-height: 1.4;
            }
            .mj-ext-composer {
                display: flex;
                align-items: center;
                gap: var(--mj-space-2, 8px);
                padding: var(--mj-space-2-5, 10px) var(--mj-space-3, 12px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-top: 1px solid var(--mj-border-default);
            }
            .mj-composer-input {
                flex: 1;
                padding: 7px 10px;
                border-radius: var(--mj-radius-md, 6px);
                border: 1px solid var(--mj-border-default);
                background: var(--mj-bg-surface);
                color: var(--mj-text-primary);
                font-size: var(--mj-text-xs, 12px);
            }
            .mj-composer-send-btn {
                border: none;
                border-radius: var(--mj-radius-md, 6px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                font-size: var(--mj-text-xs, 12px);
                font-weight: 600;
                padding: 7px 12px;
                cursor: pointer;
            }
            .mj-composer-send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        `,
    ],
})
export class MJExtensionSidePanelComponent extends BaseAngularComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Brand assistant display name (`'MJ Co-Pilot'`, `'Betty'`, `'Sidecar'`, etc.). */
    @Input() public AssistantDisplayName = 'MJ Co-Pilot';

    /** Brand subtitle/tagline displayed beneath the assistant name. */
    @Input() public Tagline = 'Enterprise AI Browser Companion';

    /** Active hostname in the current browser tab. */
    @Input() public CurrentHostname = '';

    /** Whether the current domain is paused/blocked. */
    @Input() public IsDomainBlocked = false;

    /** Current Channels v2 exposure level. */
    @Input() public Exposure: RealtimeChannelExposure = 'pixels';

    /** Current browser control backend mode. */
    @Input() public ControlMode: BrowserControlBackendMode = 'content-script';

    /** Enterprise safety ceiling for Chrome CDP debugger mode. */
    @Input() public AllowDebuggerCDP = true;

    /** Whether Chrome CDP debugger is actively attached. */
    @Input() public IsDebuggerAttached = false;

    /** Whether the current page is a sign-in or MFA screen. */
    @Input() public IsAuthOrMfaScreen = false;

    /** Resolved multi-app braided context for the current page. */
    @Input() public BraidedContext: BraidedPageContextPayload | null = null;

    /** Whether the braided context drawer is collapsed. */
    @Input() public IsContextDrawerCollapsed = false;

    /** Active guided cross-site playbook (`null` when idle). */
    @Input() public ActivePlaybook: BrowserPlaybookDefinition | null = null;

    /** Active step index in the guided playbook. */
    @Input() public ActivePlaybookStepIndex = 0;

    /** Active session topology (`'topology-a-shared-daemon'` or `'topology-b-warm-resume'`). */
    @Input() public ActiveTopology: ExtensionSessionTopology | null = null;

    /** Whether LiveKit realtime voice mode is currently active. */
    @Input() public IsVoiceActive = false;

    /** Conversation messages displayed in the Side Panel. */
    @Input() public Messages: ExtensionChatMessage[] = [];

    /** Current draft prompt in the text input. */
    @Input() public DraftPrompt = '';

    /** Emitted when the user changes perception exposure. */
    @Output() public readonly ExposureChanged = new EventEmitter<ExposureChangeEvent>();

    /** Emitted when the user changes the browser control backend mode. */
    @Output() public readonly ControlModeChanged = new EventEmitter<ControlModeChangeEvent>();

    /** Emitted when the user blocks/unblocks the active domain. */
    @Output() public readonly DomainBlockedToggled = new EventEmitter<{
        Hostname: string;
        Blocked: boolean;
    }>();

    /** Cancelable event emitted before opening an MJ entity record. */
    @Output() public readonly BeforeOpenRecord = new EventEmitter<BeforeOpenExtensionRecordEvent>();

    /** Event emitted after an MJ entity record open action is approved. */
    @Output() public readonly AfterOpenRecord = new EventEmitter<AfterOpenExtensionRecordEvent>();

    /** Emitted when the user applies 1-click capture or enrichment field diffs. */
    @Output() public readonly ApplyEntityDiffs = new EventEmitter<ApplyPageEntityDiffsEvent>();

    /** Emitted when the user executes or confirms a guided playbook step. */
    @Output() public readonly ExecutePlaybookStep = new EventEmitter<PlaybookStepExecuteEvent>();

    /** Emitted when the user toggles voice mode on/off. */
    @Output() public readonly VoiceToggled = new EventEmitter<boolean>();

    /** Emitted when the user sends a prompt in the Side Panel composer. */
    @Output() public readonly PromptSubmitted = new EventEmitter<string>();

    /**
     * Toggle realtime voice mode.
     */
    public OnToggleVoice(): void {
        this.IsVoiceActive = !this.IsVoiceActive;
        this.cdr.markForCheck();
        this.VoiceToggled.emit(this.IsVoiceActive);
    }

    /**
     * Update the draft prompt as the user types.
     */
    public OnDraftInput(event: Event): void {
        const target = event.target as HTMLInputElement | null;
        this.DraftPrompt = target?.value ?? '';
        this.cdr.markForCheck();
    }

    /**
     * Submit the current draft prompt.
     */
    public OnSubmitPrompt(): void {
        const text = this.DraftPrompt.trim();
        if (!text) {
            return;
        }
        this.DraftPrompt = '';
        this.cdr.markForCheck();
        this.PromptSubmitted.emit(text);
    }
}
