/**
 * @fileoverview Result display component following clone execution.
 *
 * Implements §12.3 of the Record Cloning architectural blueprint. Displays success
 * state, execution summary (records created/referenced/skipped and execution duration),
 * warnings review, and navigation CTAs ("Open Cloned Record", "Clone Another", "Close").
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
    MJButtonDirective,
    MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import type {
    RecordCloneExecuteOutput,
    RecordCloneKey,
} from '@memberjunction/core-entities';
import { CompositeKey } from '@memberjunction/core';
import type { FormNavigationEvent } from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-clone-result',
    template: `
        <div class="clone-result-container">
            @if (Result?.Success) {
                <!-- Success State -->
                <div class="result-icon-wrapper success">
                    <i class="fa-solid fa-circle-check result-icon"></i>
                </div>
                <h3 class="result-title">Record Cloned Successfully</h3>
                <p class="result-subtitle">
                    @if (RootRecordName) {
                        <strong>{{RootRecordName}}</strong> has been created.
                    } @else {
                        New {{EntityName}} record and its hierarchy have been created.
                    }
                </p>

                <!-- Summary Badges -->
                <div class="result-stats">
                    <mj-stat-badge
                        [Count]="CreatedCount"
                        Label="created"
                        Variant="success"
                        Icon="fa-solid fa-plus">
                    </mj-stat-badge>

                    @if (ReferencedCount > 0) {
                        <mj-stat-badge
                            [Count]="ReferencedCount"
                            Label="referenced"
                            Variant="info"
                            Icon="fa-solid fa-link">
                        </mj-stat-badge>
                    }
                </div>

                <!-- Warnings if any -->
                @if (Result?.Warnings && Result!.Warnings!.length > 0) {
                    <div class="result-warnings-box">
                        <span class="warnings-title">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            Execution Warnings ({{Result!.Warnings!.length}})
                        </span>
                        <ul class="warnings-list">
                            @for (warn of Result!.Warnings; track warn.Code) {
                                <li>{{warn.Message}}</li>
                            }
                        </ul>
                    </div>
                }

                <!-- Primary CTAs -->
                <div class="result-actions">
                    <button
                        type="button"
                        mjButton
                        variant="primary"
                        (click)="OnOpenClone()">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        Open Cloned Record
                    </button>

                    <button
                        type="button"
                        mjButton
                        variant="secondary"
                        (click)="OnCloneAnother()">
                        <i class="fa-solid fa-rotate-right"></i>
                        Clone Another
                    </button>

                    <button
                        type="button"
                        mjButton
                        variant="outline"
                        (click)="OnClose()">
                        Close
                    </button>
                </div>

                <!-- Audit Log Link -->
                @if (Result?.CloneLogID) {
                    <div class="audit-log-footer">
                        <button
                            type="button"
                            class="audit-link-btn"
                            (click)="OnOpenCloneLog()">
                            <i class="fa-solid fa-file-lines"></i>
                            View Clone Log [{{Result?.CloneLogID}}]
                        </button>
                    </div>
                }
            } @else {
                <!-- Failure State -->
                <div class="result-icon-wrapper failure">
                    <i class="fa-solid fa-circle-xmark result-icon"></i>
                </div>
                <h3 class="result-title failure-text">Cloning Failed</h3>
                <p class="result-subtitle failure-message">
                    {{Result?.ErrorMessage || 'An error occurred during execution. No records were modified.'}}
                </p>

                <div class="result-actions">
                    <button
                        type="button"
                        mjButton
                        variant="primary"
                        (click)="OnCloneAnother()">
                        <i class="fa-solid fa-rotate-right"></i>
                        Try Again
                    </button>

                    <button
                        type="button"
                        mjButton
                        variant="outline"
                        (click)="OnClose()">
                        Close
                    </button>
                </div>
            }
        </div>
    `,
    styles: [`
        .clone-result-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: var(--mj-spacing-xl, 32px) var(--mj-spacing-md, 16px);
            gap: var(--mj-spacing-md, 16px);
        }

        .result-icon-wrapper {
            width: 56px;
            height: 56px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .result-icon-wrapper.success {
            background: var(--mj-status-success-bg, #dcfce7);
            color: var(--mj-status-success-text, #16a34a);
        }

        .result-icon-wrapper.failure {
            background: var(--mj-status-error-bg, #fee2e2);
            color: var(--mj-status-error-text, #dc2626);
        }

        .result-icon {
            font-size: 32px;
        }

        .result-title {
            margin: 0;
            font-size: var(--mj-font-size-lg, 18px);
            font-weight: 700;
            color: var(--mj-text-primary, #1e293b);
        }

        .failure-text {
            color: var(--mj-status-error-text, #dc2626);
        }

        .result-subtitle {
            margin: 0;
            font-size: var(--mj-font-size-sm, 13px);
            color: var(--mj-text-secondary, #475569);
            max-width: 440px;
        }

        .failure-message {
            color: var(--mj-status-error-text, #b91c1c);
        }

        .result-stats {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
            margin: var(--mj-spacing-xs, 4px) 0;
        }

        .result-warnings-box {
            text-align: left;
            background: var(--mj-status-warning-bg, #fef3c7);
            border: 1px solid var(--mj-status-warning-border, #fcd34d);
            border-radius: var(--mj-border-radius-sm, 4px);
            padding: var(--mj-spacing-sm, 8px) var(--mj-spacing-md, 12px);
            max-width: 440px;
            width: 100%;
        }

        .warnings-title {
            font-size: var(--mj-font-size-xs, 12px);
            font-weight: 600;
            color: var(--mj-status-warning-text, #b45309);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .warnings-list {
            margin: 4px 0 0;
            padding-left: 18px;
            font-size: var(--mj-font-size-xs, 11px);
            color: var(--mj-status-warning-text, #92400e);
        }

        .result-actions {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
            margin-top: var(--mj-spacing-sm, 8px);
            flex-wrap: wrap;
            justify-content: center;
        }

        .audit-log-footer {
            margin-top: var(--mj-spacing-sm, 8px);
        }

        .audit-link-btn {
            background: none;
            border: none;
            color: var(--mj-brand-primary, #2563eb);
            cursor: pointer;
            font-size: var(--mj-font-size-xs, 12px);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            text-decoration: underline;
        }

        .audit-link-btn:hover {
            color: var(--mj-brand-primary-hover, #1d4ed8);
        }
    `],
    imports: [
        CommonModule,
        MJButtonDirective,
        MJStatBadgeComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneResultComponent {
    @Input() Result: RecordCloneExecuteOutput | null = null;
    @Input() EntityName = 'Record';
    @Input() TargetKey: string | null = null;
    @Input() RootRecordName?: string;

    @Output() OpenClone = new EventEmitter<string>();
    @Output() CloneAnother = new EventEmitter<void>();
    @Output() Close = new EventEmitter<void>();
    @Output() OpenCloneLog = new EventEmitter<string>();
    @Output() NavigateToRecord = new EventEmitter<FormNavigationEvent>();

    public get CreatedCount(): number {
        return this.Result?.Created?.length ?? this.Result?.Counts?.Create ?? 1;
    }

    public get ReferencedCount(): number {
        if (!this.Result?.Counts?.ByEntity) return 0;
        return Object.values(this.Result.Counts.ByEntity).reduce((acc, c) => acc + (c.Reference || 0), 0);
    }

    public OnOpenClone(): void {
        const raw = this.TargetKey || this.Result?.Roots?.[0]?.TargetKey;
        if (raw) {
            const key = typeof raw === 'string'
                ? raw
                : (raw as CompositeKey)?.ToURLSegment?.() ?? (raw as CompositeKey)?.ToConcatenatedString?.() ?? String(raw);
            this.OpenClone.emit(key);
            this.NavigateToRecord.emit({
                Kind: 'record',
                EntityName: this.EntityName,
                RecordKey: key,
            });
        }
    }

    public OnCloneAnother(): void {
        this.CloneAnother.emit();
    }

    public OnClose(): void {
        this.Close.emit();
    }

    public OnOpenCloneLog(): void {
        if (this.Result?.CloneLogID) {
            this.OpenCloneLog.emit(this.Result.CloneLogID);
            this.NavigateToRecord.emit({
                Kind: 'record',
                EntityName: 'Record Clone Logs',
                RecordKey: this.Result.CloneLogID,
            });
        }
    }
}
