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
                        Values the clone sets instead of copying (configured rules, names, remapped references and your entries):
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
                    [disabled]="IsBlocked || IsExecuting || IsPlanning"
                    (click)="OnConfirm()">
                    @if (IsExecuting) {
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        Cloning...
                    } @else if (IsPlanning) {
                        <i class="fa-solid fa-spinner fa-spin"></i>
                        Updating plan...
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
            gap: var(--mj-space-4);
            padding: var(--mj-space-1) 0;
        }

        .stat-badges-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--mj-space-2);
            padding: var(--mj-space-1) 0;
        }

        .blocked-banner {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1-5);
            padding: var(--mj-space-3) var(--mj-space-4);
            background: var(--mj-status-error-bg);
            border: 1px solid var(--mj-status-error-border);
            border-radius: var(--mj-radius-md);
            color: var(--mj-status-error-text);
        }

        .blocked-banner-header {
            display: flex;
            align-items: center;
            gap: var(--mj-space-1-5);
        }

        .blocked-icon {
            font-size: var(--mj-text-base);
            color: var(--mj-status-error-text);
        }

        .blocked-title {
            font-size: var(--mj-text-sm);
            font-weight: 700;
        }

        .blocked-description {
            margin: 0;
            font-size: var(--mj-text-xs);
        }

        .blocked-reasons-list {
            margin: 0;
            padding-left: 20px;
            font-size: var(--mj-text-xs);
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .review-section {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1-5);
        }

        .section-title {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: var(--mj-text-sm);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .section-description {
            margin: 0;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
        }

        .warning-icon {
            color: var(--mj-status-warning-text);
        }

        .diff-icon {
            color: var(--mj-brand-primary);
        }

        .warnings-list {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-1-5);
        }

        .warning-item {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding: 6px 10px;
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            font-size: var(--mj-text-xs);
        }

        .warning-badge {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 1px 6px;
            border-radius: 8px;
            background: var(--mj-status-warning-bg);
            color: var(--mj-status-warning-text);
        }

        .warning-message {
            flex: 1;
            color: var(--mj-text-primary);
        }

        .node-link-btn {
            background: none;
            border: none;
            color: var(--mj-brand-primary);
            cursor: pointer;
            padding: 0 4px;
            font-size: 11px;
            text-decoration: underline;
        }

        .node-link-btn:hover {
            color: var(--mj-brand-primary-hover);
        }

        .diff-nodes-list {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2);
        }

        .diff-node-card {
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            overflow: hidden;
        }

        .diff-node-header {
            display: flex;
            align-items: center;
            gap: var(--mj-space-1-5);
            padding: 6px 10px;
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
        }

        .diff-entity-badge {
            font-size: 11px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            background: var(--mj-bg-surface-sunken);
            padding: 1px 5px;
            border-radius: 3px;
        }

        .diff-node-title {
            font-size: var(--mj-text-xs);
            font-weight: 500;
            color: var(--mj-text-primary);
            flex: 1;
        }

        .diff-table {
            display: flex;
            flex-direction: column;
        }

        .diff-row {
            display: flex;
            align-items: center;
            gap: var(--mj-space-3);
            padding: 6px 10px;
            border-bottom: 1px solid var(--mj-border-default);
            font-size: var(--mj-text-xs);
        }

        .diff-row:last-child {
            border-bottom: none;
        }

        .diff-field-name {
            font-weight: 600;
            color: var(--mj-text-primary);
            min-width: 120px;
        }

        .diff-kind-chip {
            font-size: 10px;
            background: var(--mj-bg-surface-card);
            color: var(--mj-text-secondary);
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
            color: var(--mj-status-error-text);
            text-decoration: line-through;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 140px;
        }

        .diff-arrow {
            font-size: 10px;
            color: var(--mj-text-muted);
        }

        .diff-new-val {
            color: var(--mj-status-success-text);
            font-weight: 600;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 200px;
        }

        .actions-bar {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding-top: var(--mj-space-3);
            border-top: 1px solid var(--mj-border-default);
            margin-top: var(--mj-space-1);
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
    /** The plan to review: counts, warnings, blocked reasons and per-node field changes. */
    @Input() Plan: RecordClonePlanDetails | null = null;
    /** Name the root clone will get. */
    @Input() RootName = '';
    /** Reason the user entered, shown for confirmation. */
    @Input() Reason = '';
    /** Disables Confirm while the clone runs. */
    @Input() IsExecuting = false;
    /** Disables Confirm while the plan is being recomputed, so the user never confirms a plan they haven't seen. */
    @Input() IsPlanning = false;

    /** The user confirmed; the host executes the plan. */
    @Output() Confirm = new EventEmitter<void>();
    /** The user backed out of the clone. */
    @Output() Cancel = new EventEmitter<void>();
    /** Fires with a node key when the user clicks a warning or node to inspect it. */
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

    /**
     * The field changes a reviewer needs: every rule the clone applies (reset, ownership, rename,
     * remap, derived rule, override, prompt), configured exclusions and FLS denials. Plain copies,
     * columns that can't be written, and the automatic key and __mj_ timestamp exclusions are left out:
     * they are the same for every clone and would bury the rest.
     */
    public get NodesWithFieldChanges(): NodeFieldChangesSummary[] {
        if (!this.Plan?.Nodes) return [];
        const summaries: NodeFieldChangesSummary[] = [];
        for (const node of this.Plan.Nodes) {
            const changes = (node.FieldChanges ?? []).filter((c) => CloneReviewComponent.isReviewable(c));
            if (changes.length > 0) {
                summaries.push({ Node: node, Changes: changes });
            }
        }
        return summaries;
    }

    private static isReviewable(change: { Kind: string; Field: string; Reason: string }): boolean {
        if (change.Kind === 'Copy' || change.Kind === 'NotWritable') return false;
        if (change.Kind === 'Excluded') {
            // The engine always excludes the primary key and the __mj_ audit columns.
            return !change.Field.startsWith('__mj_') && !change.Reason.startsWith('Primary key');
        }
        return true;
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
        if (!this.IsBlocked && !this.IsExecuting && !this.IsPlanning) {
            this.Confirm.emit();
        }
    }

    public OnCancel(): void {
        if (!this.IsExecuting) {
            this.Cancel.emit();
        }
    }
}
