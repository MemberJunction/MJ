/**
 * @fileoverview Review and preflight execution component for record cloning.
 *
 * Implements §12.3 & §12.4 of the Record Cloning architectural blueprint. Displays
 * stat badges (Create / Reference / Skip / Warnings), blocked alert banner with reasons,
 * warnings grouped by severity linking to nodes, field-change diffs, and confirmation actions.
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
    RecordClonePlanDetails,
    RecordClonePlanNode,
    RecordClonePlanWarning,
    RecordClonePlanFieldChange,
} from '@memberjunction/core-entities';

interface NodeFieldChangesSummary {
    Node: RecordClonePlanNode;
    Changes: RecordClonePlanFieldChange[];
}

@Component({
    standalone: true,
    selector: 'mj-clone-review',
    template: `
        <div class="clone-review-container">
            <!-- Stat Badges Row -->
            <div class="stat-badges-row">
                <mj-stat-badge
                    [Count]="CreateCount"
                    Label="to create"
                    Variant="success"
                    Icon="fa-solid fa-plus">
                </mj-stat-badge>

                @if (ReferenceCount > 0) {
                    <mj-stat-badge
                        [Count]="ReferenceCount"
                        Label="referenced"
                        Variant="info"
                        Icon="fa-solid fa-link">
                    </mj-stat-badge>
                }

                @if (SkipCount > 0) {
                    <mj-stat-badge
                        [Count]="SkipCount"
                        Label="skipped"
                        Variant="default"
                        Icon="fa-solid fa-forward">
                    </mj-stat-badge>
                }

                @if (TotalWarningsCount > 0) {
                    <mj-stat-badge
                        [Count]="TotalWarningsCount"
                        Label="warnings"
                        Variant="warning"
                        Icon="fa-solid fa-triangle-exclamation">
                    </mj-stat-badge>
                }

                @if (IsBlocked) {
                    <mj-stat-badge
                        Label="BLOCKED"
                        Variant="error"
                        Icon="fa-solid fa-ban">
                    </mj-stat-badge>
                }
            </div>

            <!-- Blocked Banner -->
            @if (IsBlocked) {
                <div class="blocked-banner" role="alert">
                    <div class="blocked-banner-header">
                        <i class="fa-solid fa-circle-exclamation blocked-icon"></i>
                        <span class="blocked-title">Cloning Cannot Proceed</span>
                    </div>
                    <p class="blocked-description">
                        One or more constraints or validation rules prevent this record graph from being cloned:
                    </p>
                    <ul class="blocked-reasons-list">
                        @for (warning of BlockingErrors; track warning.Code) {
                            <li>
                                <strong>{{warning.Code}}:</strong> {{warning.Message}}
                                @if (warning.NodeKey) {
                                    <button
                                        type="button"
                                        class="node-link-btn"
                                        (click)="OnNodeClick(warning.NodeKey)">
                                        [{{warning.NodeKey}}]
                                    </button>
                                }
                            </li>
                        }
                    </ul>
                </div>
            }

            <!-- Warnings Breakdown -->
            @if (NonBlockingWarnings.length > 0) {
                <div class="review-section">
                    <h4 class="section-title">
                        <i class="fa-solid fa-triangle-exclamation warning-icon"></i>
                        Warnings & Considerations ({{NonBlockingWarnings.length}})
                    </h4>
                    <div class="warnings-list">
                        @for (warn of NonBlockingWarnings; track warn.Code + (warn.NodeKey || '')) {
                            <div class="warning-item" [class.warning-amber]="warn.Severity === 'Warning'">
                                <span class="warning-badge">{{warn.Severity}}</span>
                                <span class="warning-message">{{warn.Message}}</span>
                                @if (warn.NodeKey) {
                                    <button
                                        type="button"
                                        class="node-link-btn"
                                        (click)="OnNodeClick(warn.NodeKey)">
                                        [{{warn.NodeKey}}]
                                    </button>
                                }
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Field Changes Diff Section -->
            @if (NodesWithFieldChanges.length > 0) {
                <div class="review-section">
                    <h4 class="section-title">
                        <i class="fa-solid fa-code-compare diff-icon"></i>
                        Field Value Modifications ({{TotalFieldChangesCount}})
                    </h4>
                    <p class="section-description">
                        Values adjusted by naming rules, identity swaps, or requested overrides:
                    </p>

                    <div class="diff-nodes-list">
                        @for (summary of NodesWithFieldChanges; track summary.Node.Key) {
                            <div class="diff-node-card">
                                <div class="diff-node-header">
                                    <span class="diff-entity-badge">{{summary.Node.EntityName}}</span>
                                    <span class="diff-node-title">{{summary.Node.DisplayName}}</span>
                                    <button
                                        type="button"
                                        class="node-link-btn"
                                        (click)="OnNodeClick(summary.Node.Key)">
                                        [{{summary.Node.Key}}]
                                    </button>
                                </div>
                                <div class="diff-table">
                                    @for (change of summary.Changes; track change.Field) {
                                        <div class="diff-row">
                                            <span class="diff-field-name">{{change.Field}}</span>
                                            <span class="diff-kind-chip" [title]="change.Kind">
                                                {{FormatChangeKind(change.Kind)}}
                                            </span>
                                            <div class="diff-values">
                                                <span class="diff-old-val" [title]="'Previous: ' + change.OldValue">
                                                    {{FormatDiffValue(change.OldValue)}}
                                                </span>
                                                <i class="fa-solid fa-arrow-right diff-arrow"></i>
                                                <span class="diff-new-val" [title]="'New: ' + change.NewValue">
                                                    {{FormatDiffValue(change.NewValue)}}
                                                </span>
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Execution Actions Bar -->
            <div class="actions-bar">
                <button
                    type="button"
                    mjButton
                    variant="primary"
                    [disabled]="IsBlocked || IsExecuting"
                    (click)="OnConfirm()">
                    @if (IsExecuting) {
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        Cloning...
                    } @else {
                        <i class="fa-solid fa-clone"></i>
                        Execute Clone ({{CreateCount}} Records)
                    }
                </button>

                <button
                    type="button"
                    mjButton
                    variant="outline"
                    [disabled]="IsExecuting"
                    (click)="OnCancel()">
                    Cancel
                </button>
            </div>
        </div>
    `,
    styles: [`
        .clone-review-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-md, 16px);
            padding: var(--mj-spacing-xs, 4px) 0;
        }

        .stat-badges-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--mj-spacing-sm, 8px);
            padding: var(--mj-spacing-xs, 4px) 0;
        }

        .blocked-banner {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-xs, 6px);
            padding: var(--mj-spacing-md, 12px) var(--mj-spacing-md, 16px);
            background: var(--mj-status-error-bg, #fee2e2);
            border: 1px solid var(--mj-status-error-border, #fca5a5);
            border-radius: var(--mj-border-radius-md, 6px);
            color: var(--mj-status-error-text, #991b1b);
        }

        .blocked-banner-header {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-xs, 6px);
        }

        .blocked-icon {
            font-size: var(--mj-font-size-md, 16px);
            color: var(--mj-status-error-text, #dc2626);
        }

        .blocked-title {
            font-size: var(--mj-font-size-sm, 13px);
            font-weight: 700;
        }

        .blocked-description {
            margin: 0;
            font-size: var(--mj-font-size-xs, 12px);
        }

        .blocked-reasons-list {
            margin: 0;
            padding-left: 20px;
            font-size: var(--mj-font-size-xs, 12px);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .review-section {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-xs, 6px);
        }

        .section-title {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: var(--mj-font-size-sm, 13px);
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
        }

        .section-description {
            margin: 0;
            font-size: var(--mj-font-size-xs, 12px);
            color: var(--mj-text-secondary, #64748b);
        }

        .warning-icon {
            color: var(--mj-status-warning-text, #d97706);
        }

        .diff-icon {
            color: var(--mj-brand-primary, #2563eb);
        }

        .warnings-list {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-xs, 6px);
        }

        .warning-item {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
            padding: 6px 10px;
            background: var(--mj-bg-surface-soft, #f8fafc);
            border: 1px solid var(--mj-border-color, #e2e8f0);
            border-radius: var(--mj-border-radius-sm, 4px);
            font-size: var(--mj-font-size-xs, 12px);
        }

        .warning-badge {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 1px 6px;
            border-radius: 8px;
            background: var(--mj-status-warning-bg, #fef3c7);
            color: var(--mj-status-warning-text, #b45309);
        }

        .warning-message {
            flex: 1;
            color: var(--mj-text-primary, #1e293b);
        }

        .node-link-btn {
            background: none;
            border: none;
            color: var(--mj-brand-primary, #2563eb);
            cursor: pointer;
            padding: 0 4px;
            font-size: 11px;
            text-decoration: underline;
        }

        .node-link-btn:hover {
            color: var(--mj-brand-primary-hover, #1d4ed8);
        }

        .diff-nodes-list {
            display: flex;
            flex-direction: column;
            gap: var(--mj-spacing-sm, 8px);
        }

        .diff-node-card {
            background: var(--mj-bg-surface, #ffffff);
            border: 1px solid var(--mj-border-color, #e2e8f0);
            border-radius: var(--mj-border-radius-sm, 4px);
            overflow: hidden;
        }

        .diff-node-header {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-xs, 6px);
            padding: 6px 10px;
            background: var(--mj-bg-surface-soft, #f8fafc);
            border-bottom: 1px solid var(--mj-border-color, #e2e8f0);
        }

        .diff-entity-badge {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-secondary, #475569);
            background: var(--mj-bg-surface-muted, #f1f5f9);
            padding: 1px 5px;
            border-radius: 3px;
        }

        .diff-node-title {
            font-size: var(--mj-font-size-xs, 12px);
            font-weight: 500;
            color: var(--mj-text-primary, #1e293b);
            flex: 1;
        }

        .diff-table {
            display: flex;
            flex-direction: column;
        }

        .diff-row {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-md, 12px);
            padding: 6px 10px;
            border-bottom: 1px solid var(--mj-border-color, #f1f5f9);
            font-size: var(--mj-font-size-xs, 12px);
        }

        .diff-row:last-child {
            border-bottom: none;
        }

        .diff-field-name {
            font-weight: 600;
            color: var(--mj-text-primary, #1e293b);
            min-width: 120px;
        }

        .diff-kind-chip {
            font-size: 10px;
            background: var(--mj-bg-surface-soft, #f1f5f9);
            color: var(--mj-text-secondary, #64748b);
            padding: 1px 6px;
            border-radius: 10px;
            text-transform: capitalize;
        }

        .diff-values {
            display: flex;
            align-items: center;
            gap: 6px;
            flex: 1;
            overflow: hidden;
        }

        .diff-old-val {
            color: var(--mj-status-error-text, #b91c1c);
            text-decoration: line-through;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
        }

        .diff-arrow {
            font-size: 10px;
            color: var(--mj-text-muted, #94a3b8);
        }

        .diff-new-val {
            color: var(--mj-status-success-text, #15803d);
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 200px;
        }

        .actions-bar {
            display: flex;
            align-items: center;
            gap: var(--mj-spacing-sm, 8px);
            padding-top: var(--mj-spacing-md, 12px);
            border-top: 1px solid var(--mj-border-color, #e2e8f0);
            margin-top: var(--mj-spacing-xs, 4px);
        }
    `],
    imports: [
        CommonModule,
        MJButtonDirective,
        MJStatBadgeComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneReviewComponent {
    @Input() Plan: RecordClonePlanDetails | null = null;
    @Input() RootName = '';
    @Input() Reason = '';
    @Input() IsExecuting = false;

    @Output() Confirm = new EventEmitter<void>();
    @Output() Cancel = new EventEmitter<void>();
    @Output() NodeClicked = new EventEmitter<string>();

    public get IsBlocked(): boolean {
        return !!this.Plan?.Blocked || this.BlockingErrors.length > 0;
    }

    public get CreateCount(): number {
        return this.Plan?.Counts?.Create ?? 0;
    }

    public get ReferenceCount(): number {
        if (!this.Plan?.Nodes) return 0;
        return this.Plan.Nodes.filter(n => n.Action === 'Reference').length;
    }

    public get SkipCount(): number {
        if (!this.Plan?.Nodes) return 0;
        return this.Plan.Nodes.filter(n => n.Action === 'Skip').length;
    }

    public get AllWarnings(): RecordClonePlanWarning[] {
        const list: RecordClonePlanWarning[] = [];
        if (this.Plan?.Warnings) {
            list.push(...this.Plan.Warnings);
        }
        if (this.Plan?.Nodes) {
            for (const node of this.Plan.Nodes) {
                if (node.Warnings) {
                    for (const w of node.Warnings) {
                        list.push({ ...w, NodeKey: w.NodeKey || node.Key });
                    }
                }
            }
        }
        return list;
    }

    public get BlockingErrors(): RecordClonePlanWarning[] {
        return this.AllWarnings.filter(w => w.Severity === 'Error');
    }

    public get NonBlockingWarnings(): RecordClonePlanWarning[] {
        return this.AllWarnings.filter(w => w.Severity !== 'Error');
    }

    public get TotalWarningsCount(): number {
        return this.AllWarnings.length;
    }

    public get NodesWithFieldChanges(): NodeFieldChangesSummary[] {
        if (!this.Plan?.Nodes) return [];
        const summaries: NodeFieldChangesSummary[] = [];
        for (const node of this.Plan.Nodes) {
            if (node.FieldChanges && node.FieldChanges.length > 0) {
                summaries.push({
                    Node: node,
                    Changes: node.FieldChanges,
                });
            }
        }
        return summaries;
    }

    public get TotalFieldChangesCount(): number {
        return this.NodesWithFieldChanges.reduce((sum, s) => sum + s.Changes.length, 0);
    }

    public FormatChangeKind(kind: string): string {
        return kind.replace(/_/g, ' ');
    }

    public FormatDiffValue(val: unknown): string {
        if (val === null || val === undefined) return '(null)';
        if (typeof val === 'string') return `"${val}"`;
        return String(val);
    }

    public OnNodeClick(nodeKey: string): void {
        this.NodeClicked.emit(nodeKey);
    }

    public OnConfirm(): void {
        if (!this.IsBlocked && !this.IsExecuting) {
            this.Confirm.emit();
        }
    }

    public OnCancel(): void {
        if (!this.IsExecuting) {
            this.Cancel.emit();
        }
    }
}
