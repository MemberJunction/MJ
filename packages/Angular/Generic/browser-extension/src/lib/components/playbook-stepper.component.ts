/**
 * @fileoverview Standalone Angular 21 Guided Playbook Stepper (`<mj-extension-playbook-stepper>`)
 * for the MemberJunction Browser Extension Side Panel.
 *
 * Renders interactive cross-site playbook steps with:
 * - Pre-Execution Confirmation Gate (`RequiresConfirmationGate`)
 * - User Sign-In / MFA / Consent Checkpoint (`WaitForUserAction`)
 * - Model-Blind Secret Vault Pipe (`CopySecretToMJVault`)
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
import {
    BrowserPlaybookDefinition,
    BrowserPlaybookStep,
} from '@memberjunction/browser-extension-core';

/**
 * Event payload emitted when the user triggers execution or confirmation of a playbook step.
 */
export interface PlaybookStepExecuteEvent {
    /** Playbook identifier. */
    PlaybookID: string;
    /** Step identifier. */
    StepID: string;
    /** Zero-based step index. */
    StepIndex: number;
    /** Whether the user explicitly confirmed a confirmation gate. */
    ConfirmedByUser: boolean;
}

/**
 * Standalone Angular 21 Guided Playbook Stepper component.
 */
@Component({
    selector: 'mj-extension-playbook-stepper',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Playbook) {
            <section class="mj-playbook-stepper" role="region" [attr.aria-label]="Playbook.Name">
                <header class="mj-playbook-header">
                    <div class="mj-playbook-meta">
                        <span class="mj-playbook-badge">Guided Playbook</span>
                        <h3 class="mj-playbook-title">{{ Playbook.Name }}</h3>
                        <p class="mj-playbook-summary">{{ Playbook.Description }}</p>
                    </div>
                    <span class="mj-playbook-progress">
                        Step {{ ActiveStepIndex + 1 }} / {{ Playbook.Steps.length }}
                    </span>
                </header>

                <ol class="mj-steps-list">
                    @for (step of Playbook.Steps; track step.StepId; let idx = $index) {
                        <li
                            class="mj-step-item"
                            [class.mj-step-completed]="idx < ActiveStepIndex"
                            [class.mj-step-active]="idx === ActiveStepIndex"
                            [class.mj-step-pending]="idx > ActiveStepIndex"
                        >
                            <div class="mj-step-row">
                                <span class="mj-step-index" aria-hidden="true">
                                    @if (idx < ActiveStepIndex) {
                                        ✓
                                    } @else {
                                        {{ idx + 1 }}
                                    }
                                </span>
                                <div class="mj-step-content">
                                    <div class="mj-step-title-row">
                                        <span class="mj-step-title">{{ step.Title }}</span>
                                        <span class="mj-step-action-pill">{{ step.Kind }}</span>
                                    </div>
                                    <p class="mj-step-instruction">{{ step.Instruction }}</p>

                                    @if (idx === ActiveStepIndex) {
                                        @if (step.Kind === 'CopySecretToMJVault') {
                                            <div class="mj-secret-vault-callout" role="note">
                                                <span class="mj-secret-vault-badge">Model-Blind Secret Pipe</span>
                                                <span class="mj-secret-vault-text">
                                                    Writes directly from the page DOM into
                                                    <strong>{{ step.VaultCredentialName }} ({{ step.VaultTargetFieldName }})</strong>
                                                    without entering LLM prompts or transcripts.
                                                </span>
                                            </div>
                                        }

                                        @if (step.RequiresConfirmationGate && !ConfirmedStepIds.has(step.StepId)) {
                                            <div class="mj-confirm-gate">
                                                <span class="mj-confirm-prompt">
                                                    Confirm before executing this action on the page:
                                                </span>
                                                <button
                                                    type="button"
                                                    class="mj-primary-step-btn"
                                                    (click)="OnConfirmAndExecuteStep(step, idx)"
                                                >
                                                    Confirm &amp; Run Step
                                                </button>
                                            </div>
                                        } @else {
                                            <div class="mj-step-actions">
                                                <button
                                                    type="button"
                                                    class="mj-primary-step-btn"
                                                    (click)="OnExecuteStep(step, idx)"
                                                >
                                                    @switch (step.Kind) {
                                                        @case ('WaitForUserAction') {
                                                            I Completed This Step — Continue
                                                        }
                                                        @case ('CopySecretToMJVault') {
                                                            Vault Secret to MJ (Model-Blind)
                                                        }
                                                        @default {
                                                            Run Step
                                                        }
                                                    }
                                                </button>
                                            </div>
                                        }
                                    }
                                </div>
                            </div>
                        </li>
                    }
                </ol>
            </section>
        }
    `,
    styles: [
        `
            :host {
                display: block;
                font-family: var(--mj-font-family-base, system-ui, -apple-system, sans-serif);
            }
            .mj-playbook-stepper {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2-5, 10px);
                padding: var(--mj-space-3, 12px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-bottom: 1px solid var(--mj-border-default);
                color: var(--mj-text-primary);
            }
            .mj-playbook-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
            }
            .mj-playbook-badge {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--mj-brand-primary);
            }
            .mj-playbook-title {
                margin: 2px 0;
                font-size: var(--mj-text-sm, 14px);
                font-weight: 700;
                color: var(--mj-text-primary);
            }
            .mj-playbook-summary {
                margin: 0;
                font-size: var(--mj-text-xs, 12px);
                color: var(--mj-text-secondary);
            }
            .mj-playbook-progress {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                padding: 3px 8px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                color: var(--mj-brand-primary);
                white-space: nowrap;
            }
            .mj-steps-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2, 8px);
            }
            .mj-step-item {
                padding: var(--mj-space-2, 8px);
                border-radius: var(--mj-radius-md, 8px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
            }
            .mj-step-active {
                border-color: var(--mj-brand-primary);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
            }
            .mj-step-completed {
                opacity: 0.75;
            }
            .mj-step-row {
                display: flex;
                align-items: flex-start;
                gap: var(--mj-space-2, 8px);
            }
            .mj-step-index {
                width: 22px;
                height: 22px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .mj-step-content {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .mj-step-title-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }
            .mj-step-title {
                font-size: var(--mj-text-xs, 12px);
                font-weight: 700;
                color: var(--mj-text-primary);
            }
            .mj-step-action-pill {
                font-size: 10px;
                font-weight: 600;
                padding: 1px 6px;
                border-radius: var(--mj-radius-sm, 4px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                color: var(--mj-text-secondary);
            }
            .mj-step-instruction {
                margin: 0;
                font-size: var(--mj-text-xs, 12px);
                color: var(--mj-text-secondary);
            }
            .mj-secret-vault-callout {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 6px 8px;
                border-radius: var(--mj-radius-sm, 6px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                border-left: 3px solid var(--mj-status-success);
                font-size: var(--mj-text-xs, 11px);
            }
            .mj-secret-vault-badge {
                font-weight: 700;
                color: var(--mj-status-success);
            }
            .mj-confirm-gate,
            .mj-step-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
                flex-wrap: wrap;
                margin-top: 2px;
            }
            .mj-confirm-prompt {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                color: var(--mj-status-warning);
            }
            .mj-primary-step-btn {
                border: none;
                border-radius: var(--mj-radius-sm, 6px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                font-size: var(--mj-text-xs, 12px);
                font-weight: 600;
                padding: 6px 12px;
                cursor: pointer;
            }
        `,
    ],
})
export class MJExtensionPlaybookStepperComponent extends BaseAngularComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Active guided playbook specification (`null` when no playbook is running). */
    @Input() public Playbook: BrowserPlaybookDefinition | null = null;

    /** Zero-based index of the currently active step. */
    @Input() public ActiveStepIndex = 0;

    /** Set of step IDs whose confirmation gate has been approved in this session. */
    public readonly ConfirmedStepIds = new Set<string>();

    /** Emitted when the user triggers or confirms execution of the active playbook step. */
    @Output() public readonly ExecuteStep = new EventEmitter<PlaybookStepExecuteEvent>();

    /**
     * Confirm a step's confirmation gate and emit execution.
     */
    public OnConfirmAndExecuteStep(step: BrowserPlaybookStep, index: number): void {
        if (!this.Playbook) {
            return;
        }
        this.ConfirmedStepIds.add(step.StepId);
        this.cdr.markForCheck();
        this.ExecuteStep.emit({
            PlaybookID: this.Playbook.Id,
            StepID: step.StepId,
            StepIndex: index,
            ConfirmedByUser: true,
        });
    }

    /**
     * Execute a step directly.
     */
    public OnExecuteStep(step: BrowserPlaybookStep, index: number): void {
        if (!this.Playbook) {
            return;
        }
        this.ExecuteStep.emit({
            PlaybookID: this.Playbook.Id,
            StepID: step.StepId,
            StepIndex: index,
            ConfirmedByUser: this.ConfirmedStepIds.has(step.StepId),
        });
    }
}
