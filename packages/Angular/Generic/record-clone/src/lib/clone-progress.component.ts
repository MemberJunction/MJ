/**
 * @fileoverview Progress display component during clone execution.
 *
 * Implements §12.3 of the Record Cloning architectural blueprint. Tracks percentage
 * completion, current stage, record counts, and the specific node being processed.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJProgressBarComponent } from '@memberjunction/ng-ui-components';
import type { CloneProgressUpdate } from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-clone-progress',
    template: `
        <div class="clone-progress-container">
            <div class="progress-header">
                <span class="progress-title">
                    <i class="fa-solid fa-spinner fa-spin progress-spinner"></i>
                    {{Progress?.Phase || 'Executing Record Clone...'}}
                </span>
                <span class="progress-percentage">
                    {{PercentComplete}}%
                </span>
            </div>

            <mj-progress-bar
                [Value]="PercentComplete"
                [Type]="PercentComplete > 0 ? 'value' : 'infinite'">
            </mj-progress-bar>

            <div class="progress-details">
                @if (Progress?.Message) {
                    <span class="progress-message">{{Progress?.Message}}</span>
                }
                @if (Progress && (Progress.TotalRecords || Progress.Total)) {
                    <span class="records-counter">Record {{Progress.CompletedRecords ?? Progress.Processed ?? 0}} of {{Progress.TotalRecords ?? Progress.Total}}@if (Progress.CurrentEntityName) { ({{Progress.CurrentEntityName}})}</span>
                }
            </div>
        </div>
    `,
    styles: [`
        .clone-progress-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-md, 16px);
            padding: var(--mj-spacing-xl, 32px) var(--mj-spacing-md, 16px);
            align-items: center;
            text-align: center;
        }

        .progress-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            max-width: 440px;
        }

        .progress-title {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: var(--mj-font-size-md, 14px);
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
        }

        .progress-spinner {
            color: var(--mj-brand-primary, #2563eb);
        }

        .progress-percentage {
            font-size: var(--mj-font-size-md, 14px);
            font-weight: 700;
            color: var(--mj-brand-primary, #2563eb);
        }

        mj-progress-bar {
            width: 100%;
            max-width: 440px;
        }

        .progress-details {
            display: flex;
            flex-direction: column;
            gap: 4px;
            max-width: 440px;
        }

        .progress-message {
            font-size: var(--mj-font-size-sm, 13px);
            color: var(--mj-text-secondary, #475569);
        }

        .records-counter {
            font-size: var(--mj-font-size-xs, 12px);
            color: var(--mj-text-muted, #64748b);
            font-weight: 500;
        }
    `],
    imports: [
        CommonModule,
        MJProgressBarComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneProgressComponent {
    @Input() Progress: CloneProgressUpdate | null = null;

    public get PercentComplete(): number {
        if (!this.Progress) return 0;
        if (this.Progress.PercentComplete != null) {
            return Math.min(100, Math.max(0, Math.round(this.Progress.PercentComplete)));
        }
        if (this.Progress.Percent != null) {
            return Math.min(100, Math.max(0, Math.round(this.Progress.Percent)));
        }
        const total = this.Progress.TotalRecords ?? this.Progress.Total ?? 0;
        const completed = this.Progress.CompletedRecords ?? this.Progress.Processed ?? 0;
        if (total > 0) {
            return Math.min(100, Math.max(0, Math.round((completed / total) * 100)));
        }
        return 0;
    }
}
