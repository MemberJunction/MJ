/**
 * @fileoverview Expandable hierarchical tree rendering a RecordClonePlan.
 *
 * Implements §12.3 & §12.4 of the Record Cloning architectural blueprint. Renders the
 * planned record graph as an interactive tree with per-edge policy pills (Deep/Reference/Skip)
 * with lock tooltips, per-node action badges, entity counts summary, and live search.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type {
    RecordClonePlanDetails,
    RecordClonePlanNode,
    RecordClonePlanEdge,
} from '@memberjunction/core-entities';
import type { CloneTreeNodeViewModel } from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-clone-plan-tree',
    template: `
        <div class="plan-tree-container">
            <!-- Search & Toolbar -->
            <div class="tree-toolbar">
                <div class="search-box">
                    <i class="fa-solid fa-magnifying-glass search-icon"></i>
                    <input
                        type="text"
                        class="mj-input search-input"
                        placeholder="Search entities or records..."
                        [ngModel]="SearchTerm"
                        (ngModelChange)="OnSearchTermChange($event)" />
                    @if (SearchTerm) {
                        <button
                            type="button"
                            class="clear-search-btn"
                            (click)="OnSearchTermChange('')"
                            title="Clear search">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    }
                </div>
                <div class="tree-actions">
                    <button
                        type="button"
                        mjButton
                        variant="outline"
                        size="sm"
                        (click)="ExpandAll()">
                        Expand All
                    </button>
                    <button
                        type="button"
                        mjButton
                        variant="outline"
                        size="sm"
                        (click)="CollapseAll()">
                        Collapse All
                    </button>
                </div>
            </div>

            <!-- Aggregate Counts Bar -->
            @if (Plan) {
                <div class="counts-bar">
                    <span class="count-item total">
                        <strong>{{Plan.Counts.Total}}</strong> Total
                    </span>
                    <span class="count-item create">
                        <i class="fa-solid fa-plus-circle"></i>
                        <strong>{{Plan.Counts.Create}}</strong> Create
                    </span>
                    @if (ReferenceCount > 0) {
                        <span class="count-item reference">
                            <i class="fa-solid fa-link"></i>
                            <strong>{{ReferenceCount}}</strong> Reference
                        </span>
                    }
                    @if (SkipCount > 0) {
                        <span class="count-item skip">
                            <i class="fa-solid fa-forward"></i>
                            <strong>{{SkipCount}}</strong> Skip
                        </span>
                    }
                    @if (Plan.Blocked) {
                        <span class="count-item blocked">
                            <i class="fa-solid fa-ban"></i>
                            <strong>Blocked</strong>
                        </span>
                    }
                </div>
            }

            <!-- Hierarchical Node Tree -->
            <div class="tree-content" role="tree">
                @if (TreeNodes.length === 0) {
                    <div class="empty-tree-message">
                        @if (SearchTerm) {
                            No matching records found in the clone plan.
                        } @else {
                            No records planned for cloning.
                        }
                    </div>
                } @else {
                    @for (item of FlatVisibleNodes; track item.Node.Key) {
                        <div
                            class="tree-row"
                            [class.selected]="SelectedNodeKey === item.Node.Key"
                            [class.is-subtype]="item.Node.IsSubtypeRow"
                            [style.padding-left.px]="item.Level * 20 + 8"
                            role="treeitem"
                            [attr.aria-expanded]="item.Children.length > 0 ? item.Expanded : null"
                            (click)="OnSelectNode(item.Node)">

                            <!-- Expand/Collapse Chevron -->
                            <div class="chevron-cell">
                                @if (item.Children.length > 0) {
                                    <button
                                        type="button"
                                        class="chevron-btn"
                                        (click)="OnToggleExpand(item, $event)"
                                        [title]="item.Expanded ? 'Collapse' : 'Expand'">
                                        <i
                                            class="fa-solid"
                                            [class.fa-chevron-down]="item.Expanded"
                                            [class.fa-chevron-right]="!item.Expanded">
                                        </i>
                                    </button>
                                }
                            </div>

                            <!-- Policy Pill (if edge connects to parent) -->
                            @if (item.ParentEdge) {
                                <div class="edge-cell">
                                    <span
                                        class="policy-pill"
                                        [class.policy-deep]="item.ParentEdge.Policy === 'Deep'"
                                        [class.policy-ref]="item.ParentEdge.Policy === 'Reference'"
                                        [class.policy-skip]="item.ParentEdge.Policy === 'Skip'"
                                        [title]="GetEdgeTooltip(item.ParentEdge)">
                                        @if (item.ParentEdge.Locked) {
                                            <i class="fa-solid fa-lock lock-icon"></i>
                                        }
                                        {{item.ParentEdge.Policy}}
                                    </span>
                                </div>
                            }

                            <!-- Action Badge -->
                            <div class="action-cell">
                                <span
                                    class="action-badge"
                                    [class.action-create]="item.Node.Action === 'Create'"
                                    [class.action-ref]="item.Node.Action === 'Reference'"
                                    [class.action-skip]="item.Node.Action === 'Skip'"
                                    [class.action-blocked]="item.Node.Action === 'Blocked'">
                                    {{item.Node.Action}}
                                </span>
                            </div>

                            <!-- Entity & Record Label -->
                            <div class="node-label-cell">
                                <span class="entity-badge">{{item.Node.EntityName}}</span>
                                <span class="record-title" [title]="item.Node.DisplayName">
                                    {{item.Node.DisplayName}}
                                </span>
                                @if (item.Node.Warnings && item.Node.Warnings.length > 0) {
                                    <span
                                        class="node-warning-badge"
                                        [title]="item.Node.Warnings.length + ' warning(s)'">
                                        <i class="fa-solid fa-triangle-exclamation"></i>
                                        {{item.Node.Warnings.length}}
                                    </span>
                                }
                            </div>
                        </div>
                    }
                }
            </div>
        </div>
    `,
    styles: [`
        .plan-tree-container {
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2);
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-md);
            overflow: hidden;
        }

        .tree-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--mj-space-2);
            padding: var(--mj-space-2) var(--mj-space-3);
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
        }

        .search-box {
            position: relative;
            flex: 1;
            max-width: 320px;
            display: flex;
            align-items: center;
        }

        .search-icon {
            position: absolute;
            left: 10px;
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
            pointer-events: none;
        }

        .search-input {
            width: 100%;
            padding: 5px 28px 5px 30px;
            font-size: var(--mj-text-xs);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            outline: none;
        }

        .search-input:focus {
            border-color: var(--mj-brand-primary);
        }

        .clear-search-btn {
            position: absolute;
            right: 8px;
            background: none;
            border: none;
            color: var(--mj-text-muted);
            cursor: pointer;
            padding: 2px;
        }

        .tree-actions {
            display: flex;
            gap: var(--mj-space-1-5);
        }

        .counts-bar {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--mj-space-3);
            padding: 6px var(--mj-space-3);
            background: var(--mj-bg-surface);
            border-bottom: 1px solid var(--mj-border-default);
            font-size: var(--mj-text-xs);
        }

        .count-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .count-item.create {
            color: var(--mj-status-success-text);
        }

        .count-item.reference {
            color: var(--mj-status-info-text);
        }

        .count-item.skip {
            color: var(--mj-text-muted);
        }

        .count-item.blocked {
            color: var(--mj-status-error-text);
        }

        .tree-content {
            display: flex;
            flex-direction: column;
            max-height: 480px;
            overflow-y: auto;
            padding: var(--mj-space-1) 0;
        }

        .empty-tree-message {
            padding: var(--mj-space-6);
            text-align: center;
            color: var(--mj-text-muted);
            font-size: var(--mj-text-sm);
        }

        .tree-row {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding-top: 6px;
            padding-bottom: 6px;
            padding-right: var(--mj-space-3);
            cursor: pointer;
            user-select: none;
            border-left: 3px solid transparent;
            transition: background-color 0.1s ease;
        }

        .tree-row:hover {
            background: var(--mj-bg-surface-hover);
        }

        .tree-row.selected {
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            border-left-color: var(--mj-brand-primary);
        }

        .tree-row.is-subtype {
            font-style: italic;
        }

        .chevron-cell {
            width: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .chevron-btn {
            background: none;
            border: none;
            color: var(--mj-text-muted);
            cursor: pointer;
            padding: 2px;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .edge-cell {
            display: flex;
            align-items: center;
        }

        .policy-pill {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .policy-pill.policy-deep {
            background: var(--mj-status-success-bg);
            color: var(--mj-status-success-text);
        }

        .policy-pill.policy-ref {
            background: var(--mj-status-info-bg);
            color: var(--mj-status-info-text);
        }

        .policy-pill.policy-skip {
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-muted);
        }

        .lock-icon {
            font-size: 9px;
        }

        .action-cell {
            display: flex;
            align-items: center;
        }

        .action-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: var(--mj-radius-sm);
            font-size: 11px;
            font-weight: 600;
        }

        .action-badge.action-create {
            background: var(--mj-status-success-bg);
            color: var(--mj-status-success-text);
        }

        .action-badge.action-ref {
            background: var(--mj-status-info-bg);
            color: var(--mj-status-info-text);
        }

        .action-badge.action-skip {
            background: var(--mj-bg-surface-sunken);
            color: var(--mj-text-muted);
        }

        .action-badge.action-blocked {
            background: var(--mj-status-error-bg);
            color: var(--mj-status-error-text);
        }

        .node-label-cell {
            display: flex;
            align-items: center;
            gap: var(--mj-space-1-5);
            flex: 1;
            min-width: 0;
        }

        .entity-badge {
            font-size: 11px;
            font-weight: 500;
            color: var(--mj-text-secondary);
            background: var(--mj-bg-surface-card);
            padding: 1px 6px;
            border-radius: var(--mj-radius-sm);
            white-space: nowrap;
        }

        .record-title {
            font-size: var(--mj-text-sm);
            color: var(--mj-text-primary);
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .node-warning-badge {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 10px;
            color: var(--mj-status-warning-text);
            background: var(--mj-status-warning-bg);
            padding: 1px 5px;
            border-radius: 8px;
            margin-left: 4px;
        }
    `],
    imports: [
        CommonModule,
        FormsModule,
        MJButtonDirective,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClonePlanTreeComponent {
    private _plan: RecordClonePlanDetails | null = null;
    private cdr = inject(ChangeDetectorRef);

    /** The plan to render. Setting it rebuilds the tree. */
    @Input()
    set Plan(value: RecordClonePlanDetails | null) {
        this._plan = value;
        this.rebuildTree();
    }
    get Plan(): RecordClonePlanDetails | null {
        return this._plan;
    }

    /** Key of the node to highlight, e.g. when the review step links back to it. */
    @Input() SelectedNodeKey: string | null = null;

    /** Fires when the user selects a node row. */
    @Output() NodeSelected = new EventEmitter<RecordClonePlanNode>();

    public SearchTerm = '';
    public TreeNodes: CloneTreeNodeViewModel[] = [];
    public FlatVisibleNodes: CloneTreeNodeViewModel[] = [];

    public get ReferenceCount(): number {
        if (!this.Plan) return 0;
        return this.Plan.Nodes.filter(n => n.Action === 'Reference').length;
    }

    public get SkipCount(): number {
        if (!this.Plan) return 0;
        return this.Plan.Nodes.filter(n => n.Action === 'Skip').length;
    }

    public OnSearchTermChange(term: string): void {
        this.SearchTerm = term;
        this.updateVisibleNodes();
        this.cdr.markForCheck();
    }

    public OnSelectNode(node: RecordClonePlanNode): void {
        this.SelectedNodeKey = node.Key;
        this.NodeSelected.emit(node);
        this.cdr.markForCheck();
    }

    public OnToggleExpand(item: CloneTreeNodeViewModel, event: MouseEvent): void {
        event.stopPropagation();
        item.Expanded = !item.Expanded;
        this.updateVisibleNodes();
        this.cdr.markForCheck();
    }

    public ExpandAll(): void {
        this.setAllExpanded(this.TreeNodes, true);
        this.updateVisibleNodes();
        this.cdr.markForCheck();
    }

    public CollapseAll(): void {
        this.setAllExpanded(this.TreeNodes, false);
        this.updateVisibleNodes();
        this.cdr.markForCheck();
    }

    public GetEdgeTooltip(edge: RecordClonePlanEdge): string {
        if (edge.Locked) {
            return `Policy is locked (${edge.PolicySource || 'system constraint'}). Cannot be modified.`;
        }
        return `Relationship policy: ${edge.Policy} (${edge.PolicySource || 'default'})`;
    }

    private setAllExpanded(nodes: CloneTreeNodeViewModel[], expanded: boolean): void {
        for (const node of nodes) {
            node.Expanded = expanded;
            if (node.Children.length > 0) {
                this.setAllExpanded(node.Children, expanded);
            }
        }
    }

    private rebuildTree(): void {
        if (!this._plan || !this._plan.Nodes || this._plan.Nodes.length === 0) {
            this.TreeNodes = [];
            this.FlatVisibleNodes = [];
            this.cdr.markForCheck();
            return;
        }

        const nodesByKey = new Map<string, CloneTreeNodeViewModel>();
        const edgesByToKey = new Map<string, RecordClonePlanEdge>();

        if (this._plan.Edges) {
            for (const edge of this._plan.Edges) {
                edgesByToKey.set(edge.ToKey, edge);
            }
        }

        for (const node of this._plan.Nodes) {
            const edge = edgesByToKey.get(node.Key) || null;
            nodesByKey.set(node.Key, {
                Node: node,
                ParentEdge: edge,
                Children: [],
                Expanded: true, // Expanded by default
                Level: node.Depth ?? 0,
            });
        }

        const roots: CloneTreeNodeViewModel[] = [];
        for (const [key, item] of nodesByKey.entries()) {
            if (item.Node.ParentKey && nodesByKey.has(item.Node.ParentKey)) {
                const parent = nodesByKey.get(item.Node.ParentKey)!;
                parent.Children.push(item);
            } else {
                roots.push(item);
            }
        }

        this.TreeNodes = roots;
        this.updateVisibleNodes();
        this.cdr.markForCheck();
    }

    private updateVisibleNodes(): void {
        const flat: CloneTreeNodeViewModel[] = [];
        const term = this.SearchTerm.trim().toLowerCase();

        const traverse = (node: CloneTreeNodeViewModel) => {
            const matchesSearch = !term ||
                node.Node.EntityName.toLowerCase().includes(term) ||
                (node.Node.DisplayName && node.Node.DisplayName.toLowerCase().includes(term));

            if (matchesSearch || this.subtreeMatches(node, term)) {
                flat.push(node);
                if (node.Expanded || term) { // auto-expand matching paths on search
                    for (const child of node.Children) {
                        traverse(child);
                    }
                }
            }
        };

        for (const root of this.TreeNodes) {
            traverse(root);
        }

        this.FlatVisibleNodes = flat;
    }

    private subtreeMatches(node: CloneTreeNodeViewModel, term: string): boolean {
        if (!term) return true;
        for (const child of node.Children) {
            if (
                child.Node.EntityName.toLowerCase().includes(term) ||
                (child.Node.DisplayName && child.Node.DisplayName.toLowerCase().includes(term)) ||
                this.subtreeMatches(child, term)
            ) {
                return true;
            }
        }
        return false;
    }
}
