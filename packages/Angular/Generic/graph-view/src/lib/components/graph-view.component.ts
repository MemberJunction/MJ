import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    TemplateRef,
    ViewChild,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import * as d3 from 'd3';
import type {
    GraphNode,
    GraphEdge,
    GraphLayoutMode,
    GraphNodeCategory,
    GraphCategoryConfig,
    GraphViewportTransform,
    GraphPhysicsConfig,
    GraphGroundingItem
} from '../models/graph-models';
import {
    BeforeNodeSelectEventArgs,
    NodeSelectedEventArgs,
    BeforeEdgeSelectEventArgs,
    EdgeSelectedEventArgs,
    BeforeHopExpandEventArgs,
    HopExpandedEventArgs,
    BeforeLayoutChangeEventArgs,
    LayoutChangedEventArgs,
    BeforeNodeNavigateEventArgs,
    NodeNavigatedEventArgs,
    ViewportTransformEventArgs,
    BeforeNodeActionEventArgs,
    NodeActionEventArgs,
    GraphNodeActionKind
} from '../events/graph-events';

export const DEFAULT_GRAPH_CATEGORIES: GraphCategoryConfig[] = [
    { Category: 'person', Label: 'Person', Color: '#10b981', IconClass: 'fa-solid fa-user' },
    { Category: 'organization', Label: 'Organization', Color: '#38bdf8', IconClass: 'fa-solid fa-building' },
    { Category: 'committee', Label: 'Committee', Color: '#8b5cf6', IconClass: 'fa-solid fa-landmark' },
    { Category: 'account', Label: 'Holding / Account', Color: '#f59e0b', IconClass: 'fa-solid fa-building-flag' },
    { Category: 'asset', Label: 'Asset', Color: '#ec4899', IconClass: 'fa-solid fa-gem' },
    { Category: 'group', Label: 'Group', Color: '#06b6d4', IconClass: 'fa-solid fa-users' },
    { Category: 'custom', Label: 'Custom', Color: '#64748b', IconClass: 'fa-solid fa-circle-nodes' }
];

const DYNAMIC_CATEGORY_PALETTE = [
    '#10b981', '#38bdf8', '#8b5cf6', '#f59e0b', '#ec4899',
    '#06b6d4', '#84cc16', '#f43f5e', '#a855f7', '#14b8a6'
];

const GRAPH_VIEW_CSS = `
:host {
    display: block;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: var(--mj-bg-surface-sunken, #0b1220);
    border-radius: var(--mj-radius-lg, 12px);
    border: 1px solid var(--mj-border-default, #223254);
    user-select: none;
}

.mj-graph-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.mj-graph-svg-canvas {
    width: 100%;
    height: 100%;
    cursor: grab;
}

.mj-graph-svg-canvas.is-panning {
    cursor: grabbing;
}

/* Floating Toolbar */
.mj-graph-toolbar {
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(20, 31, 54, 0.88);
    backdrop-filter: blur(10px);
    border: 1px solid var(--mj-border-default, #223254);
    padding: 6px 12px;
    border-radius: var(--mj-radius-lg, 10px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.mj-graph-tool-btn {
    background: var(--mj-bg-surface-elevated, #1a2744);
    border: 1px solid var(--mj-border-default, #223254);
    color: var(--mj-text-primary, #f8fafc);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
}

.mj-graph-tool-btn:hover {
    border-color: var(--mj-brand-primary, #38bdf8);
    background: var(--mj-border-hover, #334876);
}

.mj-graph-tool-btn.active {
    background: var(--mj-brand-primary, #38bdf8);
    color: #090e1a;
    border-color: var(--mj-brand-primary, #38bdf8);
}

.mj-graph-separator {
    width: 1px;
    height: 18px;
    background: var(--mj-border-default, #223254);
}

.mj-graph-search-input {
    background: var(--mj-bg-surface-sunken, #090e1a);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: 6px;
    color: var(--mj-text-primary, #f8fafc);
    padding: 4px 8px 4px 24px;
    font-size: 11.5px;
    width: 150px;
}

.mj-graph-search-input:focus {
    outline: none;
    border-color: var(--mj-brand-primary, #38bdf8);
    width: 190px;
}

/* Floating Legend */
.mj-graph-legend {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(20, 31, 54, 0.88);
    backdrop-filter: blur(10px);
    border: 1px solid var(--mj-border-default, #223254);
    padding: 6px 14px;
    border-radius: var(--mj-radius-lg, 10px);
    font-size: 11.5px;
    color: var(--mj-text-secondary, #94a3b8);
}

.mj-graph-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    background: transparent;
    color: var(--mj-text-secondary, #94a3b8);
    font-size: 11.5px;
}

.mj-graph-legend-item:hover {
    background: var(--mj-bg-surface-elevated, #1a2744);
    color: var(--mj-text-primary, #f8fafc);
}

.mj-graph-legend-item.is-active-filter {
    background: var(--mj-bg-surface-elevated, #1a2744);
    border-color: var(--mj-brand-primary, #38bdf8);
    color: var(--mj-text-primary, #f8fafc);
    font-weight: 600;
}

.mj-graph-legend-item.is-dimmed {
    opacity: 0.42;
}

.mj-graph-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

/* Inspector Drawer */
.mj-graph-inspector {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 340px;
    max-height: calc(100% - 28px);
    background: rgba(20, 31, 54, 0.96);
    backdrop-filter: blur(14px);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: var(--mj-radius-lg, 12px);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 25;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    scrollbar-width: thin;
    animation: mjGraphSlide 0.2s ease;
}

.mj-graph-inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.mj-graph-inspector-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--mj-text-muted, #64748b);
}

.mj-graph-inspector-close {
    background: none;
    border: none;
    color: var(--mj-text-muted, #64748b);
    cursor: pointer;
    font-size: 14px;
}

.mj-graph-inspector-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--mj-bg-surface, #111a2e);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: 8px;
    padding: 10px 12px;
}

.mj-graph-inspector-avatar {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #fff;
    flex-shrink: 0;
}

.mj-graph-inspector-section {
    background: var(--mj-bg-surface, #111a2e);
    border: 1px solid var(--mj-border-default, #223254);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 11.5px;
    color: var(--mj-text-primary, #f8fafc);
}

.mj-graph-inspector-section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--mj-text-muted, #64748b);
    margin-bottom: 6px;
    display: block;
}

.mj-graph-conflict-box {
    background: color-mix(in srgb, var(--mj-status-error, #f43f5e) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--mj-status-error, #f43f5e) 40%, transparent);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 11.5px;
    color: var(--mj-text-primary, #f8fafc);
}

.mj-graph-grounding-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--mj-bg-surface-sunken, #090e1a);
    border: 1px solid var(--mj-border-default, #223254);
    cursor: pointer;
    transition: border-color 0.15s ease;
    width: 100%;
    text-align: left;
    color: var(--mj-text-primary, #f8fafc);
    font-size: 11px;
}

.mj-graph-grounding-item:hover {
    border-color: var(--mj-status-success, #10b981);
}

.mj-graph-inspector-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
}

/* SVG Rendering Elements */
.mj-edge-path {
    stroke: var(--mj-border-hover, #2d416b);
    stroke-width: 2;
    fill: none;
    transition: stroke 0.2s ease;
}

.mj-edge-path.is-highlighted {
    stroke: var(--mj-brand-primary, #38bdf8);
    stroke-width: 3;
}

@keyframes mjEdgeDashFlow {
    to { stroke-dashoffset: -24; }
}

.mj-edge-animated {
    animation: mjEdgeDashFlow 1.2s linear infinite;
}

.mj-edge-text {
    font-size: 10px;
    font-weight: 500;
    fill: var(--mj-text-muted, #64748b);
    text-anchor: middle;
    pointer-events: none;
    paint-order: stroke;
    stroke: var(--mj-bg-surface-sunken, #0b1220);
    stroke-width: 3px;
    stroke-linecap: butt;
    stroke-linejoin: miter;
}

.mj-node-group {
    cursor: pointer;
    transition: transform 0.1s ease;
}

.mj-node-group:hover .mj-node-circle {
    filter: drop-shadow(0 0 10px var(--mj-brand-primary, #38bdf8));
}

.mj-node-circle {
    transition: all 0.2s ease;
}

.mj-node-glyph {
    font-size: 11px;
    font-weight: 700;
    fill: var(--mj-text-primary, #ffffff);
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
}

.mj-node-label {
    font-size: 11px;
    font-weight: 700;
    fill: var(--mj-text-primary, #f8fafc);
    text-anchor: middle;
    pointer-events: none;
}

.mj-node-sublabel {
    font-size: 9.5px;
    font-weight: 500;
    fill: var(--mj-text-secondary, #94a3b8);
    text-anchor: middle;
    pointer-events: none;
}

@keyframes mjGraphSlide {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
}
`;

/**
 * `<mj-graph-view>` — Interactive network, entity relationship, and Semantic/Canon graph visualization.
 *
 * Supports force-directed, hierarchical, circular, and grid layouts, ranked concept categories,
 * hop-expansion, zoom/pan controls, customizable inspector drawer, search filters,
 * and cancelable Before/After event pairs.
 */
@Component({
    selector: 'mj-graph-view',
    standalone: true,
    imports: [CommonModule, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-graph-wrapper" #wrapper>
            <!-- 1. Floating Action Toolbar -->
            @if (ShowToolbar) {
                <div class="mj-graph-toolbar">
                    <span style="font-size: 12px; font-weight: 700; color: var(--mj-text-primary, #fff); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-circle-nodes" style="color: var(--mj-brand-primary);"></i>
                        {{ Title || 'Network Graph' }}
                    </span>

                    <div class="mj-graph-separator"></div>

                    <!-- Layout Mode Selector -->
                    <button
                        type="button"
                        class="mj-graph-tool-btn"
                        [class.active]="LayoutMode === 'force'"
                        (click)="SetLayoutMode('force')"
                        title="Force-Directed Physics">
                        <i class="fa-solid fa-atom"></i> Force
                    </button>
                    <button
                        type="button"
                        class="mj-graph-tool-btn"
                        [class.active]="LayoutMode === 'hierarchy'"
                        (click)="SetLayoutMode('hierarchy')"
                        title="Hierarchical Concept Tree">
                        <i class="fa-solid fa-sitemap"></i> Hierarchy
                    </button>
                    <button
                        type="button"
                        class="mj-graph-tool-btn"
                        [class.active]="LayoutMode === 'circular'"
                        (click)="SetLayoutMode('circular')"
                        title="Circular Layout">
                        <i class="fa-solid fa-circle-notch"></i> Circular
                    </button>

                    <div class="mj-graph-separator"></div>

                    <!-- Zoom Controls -->
                    <button type="button" class="mj-graph-tool-btn" (click)="ZoomIn()" title="Zoom In">
                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="ZoomOut()" title="Zoom Out">
                        <i class="fa-solid fa-magnifying-glass-minus"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="FitToView()" title="Fit View">
                        <i class="fa-solid fa-expand"></i>
                    </button>
                    <button type="button" class="mj-graph-tool-btn" (click)="Rearrange()" title="Re-simulate Physics">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>

                    @if (ConflictCount > 0 || ProposedCount > 0) {
                        <div class="mj-graph-separator"></div>
                        @if (ConflictCount > 0) {
                            <span style="font-size: 11px; font-weight: 600; color: var(--mj-status-error, #fb7185); display: flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 9999px; background: color-mix(in srgb, var(--mj-status-error, #f43f5e) 15%, transparent); border: 1px solid color-mix(in srgb, var(--mj-status-error, #f43f5e) 35%, transparent);">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                {{ ConflictCount }} {{ ConflictCount === 1 ? 'Conflict' : 'Conflicts' }}
                            </span>
                        }
                        @if (ProposedCount > 0) {
                            <span style="font-size: 11px; font-weight: 600; color: var(--mj-status-warning, #fbbf24); display: flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 9999px; background: color-mix(in srgb, var(--mj-status-warning, #f59e0b) 15%, transparent); border: 1px solid color-mix(in srgb, var(--mj-status-warning, #f59e0b) 35%, transparent);">
                                ● {{ ProposedCount }} Proposed
                            </span>
                        }
                    }

                    @if (Searchable) {
                        <div class="mj-graph-separator"></div>
                        <div style="position: relative;">
                            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--mj-text-muted);"></i>
                            <input
                                class="mj-graph-search-input"
                                [(ngModel)]="SearchQuery"
                                (ngModelChange)="SearchNodes($event)"
                                placeholder="Search graph nodes..." />
                        </div>
                    }
                </div>
            }

            <!-- 2. Floating Dynamic Category Legend (Interactive Filter Pills) -->
            @if (ShowLegend && ActiveCategories.length > 0) {
                <div class="mj-graph-legend">
                    @for (cat of ActiveCategories; track cat.Category) {
                        <button
                            type="button"
                            class="mj-graph-legend-item"
                            [class.is-active-filter]="IsCategoryFilterActive(cat.Category)"
                            [class.is-dimmed]="ActiveCategoryFilter && !IsCategoryFilterActive(cat.Category)"
                            (click)="ToggleCategoryFilter(cat.Category)"
                            [title]="'Filter by ' + cat.Label">
                            <div class="mj-graph-legend-dot" [style.background]="cat.Color"></div>
                            <span>{{ cat.Label }}</span>
                            @if (cat.Rank !== undefined) {
                                <span style="font-size: 10px; opacity: 0.7;">#{{ cat.Rank }}</span>
                            }
                        </button>
                    }
                    @if (ActiveCategoryFilter) {
                        <button
                            type="button"
                            class="mj-graph-legend-item"
                            style="color: var(--mj-brand-primary);"
                            (click)="ToggleCategoryFilter(null)">
                            Reset
                        </button>
                    }
                </div>
            }

            <!-- 3. Selected Node Inspector Drawer -->
            @if (ShowInspector && SelectedNode) {
                <div class="mj-graph-inspector">
                    <div class="mj-graph-inspector-header">
                        <span class="mj-graph-inspector-title">Node Inspector</span>
                        <button class="mj-graph-inspector-close" type="button" (click)="ClearSelection()">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div class="mj-graph-inspector-card">
                        <div class="mj-graph-inspector-avatar" [style.background]="GetNodeColor(SelectedNode)">
                            <i [class]="GetNodeIcon(SelectedNode)"></i>
                        </div>
                        <div style="overflow: hidden; flex: 1;">
                            <div style="font-size: 13px; font-weight: 700; color: var(--mj-text-primary, #fff); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                {{ SelectedNode.Label }}
                            </div>
                            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px;">
                                <span style="font-size: 11px; color: var(--mj-text-secondary);">
                                    {{ SelectedNode.Sublabel || GetCategoryLabel(SelectedNode.Category) }}
                                </span>
                                @if (SelectedNode.Rank !== undefined) {
                                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 9999px; background: color-mix(in srgb, var(--mj-text-secondary, #94a3b8) 15%, transparent); color: var(--mj-text-secondary, #cbd5e1); font-weight: 600;">
                                        Rank #{{ SelectedNode.Rank }}
                                    </span>
                                }
                                @if (SelectedNode.Status) {
                                    <span
                                        style="font-size: 10px; padding: 1px 6px; border-radius: 9999px; font-weight: 600;"
                                        [style.background]="SelectedNode.Status === 'Proposed' ? 'color-mix(in srgb, var(--mj-status-warning, #f59e0b) 18%, transparent)' : 'color-mix(in srgb, var(--mj-status-success, #10b981) 18%, transparent)'"
                                        [style.color]="SelectedNode.Status === 'Proposed' ? 'var(--mj-status-warning, #fbbf24)' : 'var(--mj-status-success, #34d399)'">
                                        {{ SelectedNode.Status }}
                                    </span>
                                }
                                @if (SelectedNode.AuthorityTier) {
                                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 9999px; background: color-mix(in srgb, var(--mj-brand-primary, #38bdf8) 15%, transparent); color: var(--mj-brand-primary, #38bdf8); font-weight: 600;">
                                        {{ SelectedNode.AuthorityTier }}
                                    </span>
                                }
                                @if (IsFocalNode(SelectedNode)) {
                                    <span style="font-size: 10px; padding: 1px 6px; border-radius: 9999px; background: color-mix(in srgb, var(--mj-brand-primary, #38bdf8) 15%, transparent); color: var(--mj-brand-primary, #38bdf8); font-weight: 600; border: 1px solid color-mix(in srgb, var(--mj-brand-primary, #38bdf8) 30%, transparent);">Current Record</span>
                                }
                            </div>
                        </div>
                    </div>

                    @if (SelectedNode.Description) {
                        <div style="font-size: 12px; color: var(--mj-text-secondary); line-height: 1.45;">
                            {{ SelectedNode.Description }}
                        </div>
                    }

                    @if (InspectorCustomTemplate) {
                        <ng-container *ngTemplateOutlet="InspectorCustomTemplate; context: { $implicit: SelectedNode }"></ng-container>
                    } @else {
                        @if (SelectedNode.Specification) {
                            <div class="mj-graph-inspector-section">
                                <span class="mj-graph-inspector-section-label">Specification</span>
                                <pre style="margin: 0; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.45; color: var(--mj-text-primary);">{{ SelectedNode.Specification }}</pre>
                            </div>
                        }

                        @if (SelectedNode.Conflicts && SelectedNode.Conflicts.length > 0) {
                            <div class="mj-graph-conflict-box">
                                <div style="font-size: 11px; font-weight: 700; color: var(--mj-status-error, #fb7185); margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-triangle-exclamation"></i>
                                    Authority Conflict (Contradicts Edge)
                                </div>
                                @for (conflict of SelectedNode.Conflicts; track conflict.HigherAuthoritySummary) {
                                    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
                                        <div><strong>Higher Tier:</strong> {{ conflict.HigherAuthoritySummary }}</div>
                                        <div><strong>Conflicting:</strong> {{ conflict.ConflictingSummary }}</div>
                                        @if (conflict.ResolutionNote) {
                                            <div style="color: var(--mj-text-secondary); margin-top: 2px;">{{ conflict.ResolutionNote }}</div>
                                        }
                                    </div>
                                }
                            </div>
                        }

                        @if (SelectedNode.Groundings && SelectedNode.Groundings.length > 0) {
                            <div class="mj-graph-inspector-section">
                                <span class="mj-graph-inspector-section-label">Grounded MJ Primitives ({{ SelectedNode.Groundings.length }})</span>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    @for (g of SelectedNode.Groundings; track g.TargetRecordID + g.EdgeLabel) {
                                        <button
                                            type="button"
                                            class="mj-graph-grounding-item"
                                            (click)="NavigateToGrounding(SelectedNode, g)">
                                            <span style="color: var(--mj-status-success, #34d399); font-weight: 700;">{{ g.EdgeLabel }}</span>
                                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;">
                                                {{ g.TargetDisplayName }}
                                            </span>
                                            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 10px; opacity: 0.7;"></i>
                                        </button>
                                    }
                                </div>
                            </div>
                        }

                        @if (SelectedNode.ProvenanceChunks && SelectedNode.ProvenanceChunks.length > 0) {
                            <div class="mj-graph-inspector-section">
                                <span class="mj-graph-inspector-section-label">SourcedFrom Chunks ({{ SelectedNode.ProvenanceChunks.length }})</span>
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    @for (chunk of SelectedNode.ProvenanceChunks; track chunk.ChunkID) {
                                        <div style="padding: 6px 8px; border-radius: 6px; background: var(--mj-bg-surface-sunken, #090e1a); border: 1px solid var(--mj-border-default, #223254); font-size: 11px;">
                                            <div style="display: flex; align-items: center; justify-content: space-between; font-weight: 600; margin-bottom: 3px;">
                                                <span>{{ chunk.SourceName }}{{ chunk.Locator ? ' · ' + chunk.Locator : '' }}</span>
                                                @if (chunk.AuthorityTier) {
                                                    <span style="color: var(--mj-status-warning, #fbbf24); font-size: 10px;">{{ chunk.AuthorityTier }}</span>
                                                }
                                            </div>
                                            <div style="color: var(--mj-text-secondary); line-height: 1.4;">{{ chunk.Snippet }}</div>
                                        </div>
                                    }
                                </div>
                            </div>
                        }
                    }

                    <div style="font-size: 11.5px; color: var(--mj-text-secondary); line-height: 1.45;">
                        Direct Connected Edges: <strong>{{ GetNodeEdgeCount(SelectedNode.ID) }}</strong>
                    </div>

                    <div class="mj-graph-inspector-actions">
                        @if (SelectedNode.Status === 'Proposed') {
                            <button
                                type="button"
                                class="mj-graph-tool-btn"
                                style="justify-content: center; width: 100%; background: var(--mj-status-success, #059669); border-color: var(--mj-status-success, #10b981); color: var(--mj-text-primary, #ffffff);"
                                (click)="TriggerNodeAction(SelectedNode, 'approve')">
                                <i class="fa-solid fa-check"></i> Approve into Canon
                            </button>
                        }
                        @if (!IsFocalNode(SelectedNode)) {
                            <button
                                type="button"
                                class="mj-graph-tool-btn active"
                                style="justify-content: center; width: 100%;"
                                (click)="NavigateToEntity(SelectedNode)">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Entity Form
                            </button>
                        }
                        <button
                            type="button"
                            class="mj-graph-tool-btn"
                            style="justify-content: center; width: 100%;"
                            (click)="ExpandHops(SelectedNode.ID, 1)">
                            <i class="fa-solid fa-circle-nodes"></i> Expand 1-Hop Neighbors
                        </button>
                    </div>
                </div>
            }

            <!-- 4. Interactive SVG Graph Canvas -->
            <svg
                #svgCanvas
                class="mj-graph-svg-canvas"
                [class.is-panning]="IsPanning"
                (mousedown)="OnCanvasMouseDown($event)"
                (mousemove)="OnCanvasMouseMove($event)"
                (mouseup)="OnCanvasMouseUp($event)"
                (mouseleave)="OnCanvasMouseUp($event)"
                (wheel)="OnCanvasWheel($event)">

                <defs>
                    <marker id="mj-arrow-default" viewBox="0 -5 10 10" refX="30" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M0,-4L10,0L0,4" fill="#64748b" />
                    </marker>
                    <marker id="mj-arrow-highlight" viewBox="0 -5 10 10" refX="30" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M0,-4L10,0L0,4" fill="#38bdf8" />
                    </marker>
                    <marker id="mj-arrow-conflict" viewBox="0 -5 10 10" refX="30" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M0,-4L10,0L0,4" fill="#f43f5e" />
                    </marker>
                    <marker id="mj-arrow-grounding" viewBox="0 -5 10 10" refX="30" refY="0" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M0,-4L10,0L0,4" fill="#10b981" />
                    </marker>
                </defs>

                <g [attr.transform]="'translate(' + PanX + ',' + PanY + ') scale(' + Scale + ')'">
                    <!-- Edges Layer -->
                    @for (edge of VisibleEdges; track edge.ID) {
                        <g>
                            <line
                                class="mj-edge-path"
                                [class.is-highlighted]="IsEdgeHighlighted(edge)"
                                [class.mj-edge-animated]="edge.Animated"
                                [attr.x1]="GetNodeX(edge.SourceID)"
                                [attr.y1]="GetNodeY(edge.SourceID)"
                                [attr.x2]="GetNodeX(edge.TargetID)"
                                [attr.y2]="GetNodeY(edge.TargetID)"
                                [attr.stroke]="GetEdgeStroke(edge)"
                                [attr.stroke-width]="GetEdgeStrokeWidth(edge)"
                                [attr.stroke-dasharray]="GetEdgeDashArray(edge)"
                                [attr.marker-end]="GetEdgeMarkerEnd(edge)"
                                (click)="OnEdgeClick(edge, $event)">
                            </line>
                            <text
                                class="mj-edge-text"
                                [style.fill]="edge.Color || (edge.Animated ? '#fb7185' : '')"
                                [attr.x]="(GetNodeX(edge.SourceID) + GetNodeX(edge.TargetID)) / 2"
                                [attr.y]="(GetNodeY(edge.SourceID) + GetNodeY(edge.TargetID)) / 2 - 4">
                                {{ edge.Label }}
                            </text>
                        </g>
                    }

                    <!-- Nodes Layer -->
                    @for (node of FilteredNodes; track node.ID) {
                        <g
                            class="mj-node-group"
                            [attr.transform]="'translate(' + (node.X || 0) + ',' + (node.Y || 0) + ')'"
                            (mousedown)="OnNodeMouseDown(node, $event)"
                            (click)="OnNodeClick(node, $event)"
                            (dblclick)="NavigateToEntity(node)">

                            <!-- Outer Selection / Focal / Proposed Halo -->
                            @if (IsNodeSelected(node)) {
                                <circle [attr.r]="(node.Radius || 26) + 10" fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" stroke-width="2"></circle>
                            } @else if (IsFocalNode(node)) {
                                <circle [attr.r]="(node.Radius || 26) + 8" fill="none" stroke="rgba(56, 189, 248, 0.45)" stroke-width="2" stroke-dasharray="4 3"></circle>
                            } @else if (node.Status === 'Proposed' || node.Status === 'Draft') {
                                <circle [attr.r]="(node.Radius || 26) + 6" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="4 3"></circle>
                            }

                            <!-- Node Body Circle -->
                            <circle
                                class="mj-node-circle"
                                [attr.r]="node.Radius || 26"
                                fill="#141f36"
                                [attr.stroke]="GetNodeColor(node)"
                                [attr.stroke-dasharray]="node.Status === 'Proposed' ? '5 3' : null"
                                stroke-width="3">
                            </circle>

                            <!-- Node Icon / Glyph Center -->
                            <circle
                                [attr.r]="(node.Radius || 26) - 8"
                                [attr.fill]="GetNodeColor(node)"
                                [attr.fill-opacity]="node.Status === 'Proposed' ? '0.35' : '0.9'">
                            </circle>
                            <text class="mj-node-glyph">
                                {{ GetNodeGlyphText(node) }}
                            </text>

                            <!-- Conflict Badge Indicator (Top-Right) -->
                            @if (node.Conflicts && node.Conflicts.length > 0) {
                                <circle
                                    [attr.cx]="(node.Radius || 26) * 0.72"
                                    [attr.cy]="-(node.Radius || 26) * 0.72"
                                    r="7"
                                    fill="#f43f5e"
                                    stroke="#0b1220"
                                    stroke-width="2">
                                </circle>
                            }

                            <!-- Labels -->
                            <text class="mj-node-label" [attr.y]="(node.Radius || 26) + 16">
                                {{ TruncateLabel(node.Label, 22) }}
                            </text>
                            @if (node.Sublabel) {
                                <text class="mj-node-sublabel" [attr.y]="(node.Radius || 26) + 28">
                                    {{ TruncateLabel(node.Sublabel, 24) }}
                                </text>
                            }
                        </g>
                    }
                </g>
            </svg>
        </div>
    `,
    styles: [GRAPH_VIEW_CSS]
})
export class GraphViewComponent implements OnInit, OnChanges, OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('wrapper', { static: true }) public WrapperRef!: ElementRef<HTMLDivElement>;
    @ViewChild('svgCanvas', { static: true }) public CanvasRef!: ElementRef<SVGSVGElement>;

    // ── Inputs ────────────────────────────────────────────────────────
    @Input() public Title = 'Network Graph';
    @Input() public Nodes: GraphNode[] = [];
    @Input() public Edges: GraphEdge[] = [];
    @Input() public Categories: GraphCategoryConfig[] = DEFAULT_GRAPH_CATEGORIES;
    @Input() public LayoutMode: GraphLayoutMode = 'force';
    @Input() public MaxHopDistance = 2;
    @Input() public SelectedNodeId?: string;
    @Input() public FocalNodeId?: string;
    @Input() public ActiveCategoryFilter: string | null = null;
    @Input() public AutoOpenInspector = false;
    @Input() public ShowToolbar = true;
    @Input() public ShowLegend = true;
    @Input() public ShowInspector = true;
    @Input() public InspectorCustomTemplate?: TemplateRef<{ $implicit: GraphNode }>;
    @Input() public Searchable = true;
    @Input() public AutoFitOnLoad = true;
    @Input() public Physics: GraphPhysicsConfig = {
        Repulsion: -500,
        LinkDistance: 130,
        Gravity: 0.05,
        Damping: 0.88,
        MaxIterations: 200
    };

    // ── Cancelable Before/After Outputs ────────────────────────────────
    @Output() public BeforeNodeSelect = new EventEmitter<BeforeNodeSelectEventArgs>();
    @Output() public NodeSelected = new EventEmitter<NodeSelectedEventArgs>();

    @Output() public BeforeEdgeSelect = new EventEmitter<BeforeEdgeSelectEventArgs>();
    @Output() public EdgeSelected = new EventEmitter<EdgeSelectedEventArgs>();

    @Output() public BeforeHopExpand = new EventEmitter<BeforeHopExpandEventArgs>();
    @Output() public HopExpanded = new EventEmitter<HopExpandedEventArgs>();

    @Output() public BeforeLayoutChange = new EventEmitter<BeforeLayoutChangeEventArgs>();
    @Output() public LayoutChanged = new EventEmitter<LayoutChangedEventArgs>();

    @Output() public BeforeNodeNavigate = new EventEmitter<BeforeNodeNavigateEventArgs>();
    @Output() public NodeNavigated = new EventEmitter<NodeNavigatedEventArgs>();

    @Output() public BeforeNodeAction = new EventEmitter<BeforeNodeActionEventArgs>();
    @Output() public NodeAction = new EventEmitter<NodeActionEventArgs>();

    @Output() public CategoryFilterChanged = new EventEmitter<string | null>();

    @Output() public ViewportTransform = new EventEmitter<ViewportTransformEventArgs>();

    // ── Internal State ────────────────────────────────────────────────
    public FilteredNodes: GraphNode[] = [];
    public SelectedNode: GraphNode | null = null;
    public SelectedEdge: GraphEdge | null = null;
    public SearchQuery = '';

    public Scale = 1.0;
    public PanX = 200;
    public PanY = 150;
    public IsPanning = false;
    private panStartX = 0;
    private panStartY = 0;

    private draggedNode: GraphNode | null = null;
    private simulation: d3.Simulation<GraphNode, d3.SimulationLinkDatum<GraphNode>> | null = null;

    public ngOnInit(): void {
        this.initializePositions();
        this.ApplyFilters();
        this.SimulatePhysics();
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Nodes'] || changes['Edges']) {
            this.initializePositions();
            this.ApplyFilters();
            this.SimulatePhysics();
        }
        if (changes['ActiveCategoryFilter']) {
            this.ApplyFilters();
        }
        if (changes['SelectedNodeId'] && this.SelectedNodeId) {
            const found = this.Nodes.find(n => UUIDsEqual(n.ID, this.SelectedNodeId));
            if (found && this.AutoOpenInspector) {
                this.SelectedNode = found;
            }
        }
    }

    public ngOnDestroy(): void {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }
    }

    // ── Positioning & D3 Physics Engine ──────────────────────────────────
    private initializePositions(): void {
        const cx = this.getContainerWidth() / 2 || 400;
        const cy = this.getContainerHeight() / 2 || 250;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            if (node.x === undefined || node.y === undefined) {
                if (node.X !== undefined && node.Y !== undefined) {
                    node.x = node.X;
                    node.y = node.Y;
                } else {
                    const angle = (idx / count) * 2 * Math.PI;
                    const r = 100 + Math.random() * 60;
                    node.x = cx + r * Math.cos(angle);
                    node.y = cy + r * Math.sin(angle);
                    node.X = node.x;
                    node.Y = node.y;
                }
                node.vx = 0;
                node.vy = 0;
                node.VX = 0;
                node.VY = 0;
            }
        });
    }

    public SimulatePhysics(): void {
        if (this.simulation) {
            this.simulation.stop();
            this.simulation = null;
        }

        if (this.LayoutMode === 'circular') {
            this.applyCircularLayout();
            if (this.AutoFitOnLoad) {
                this.AutoFitToView();
            }
            this.cdr.markForCheck();
            return;
        }

        if (this.LayoutMode === 'hierarchy') {
            this.applyHierarchyLayout();
            if (this.AutoFitOnLoad) {
                this.AutoFitToView();
            }
            this.cdr.markForCheck();
            return;
        }

        if (this.LayoutMode === 'grid') {
            this.applyGridLayout();
            if (this.AutoFitOnLoad) {
                this.AutoFitToView();
            }
            this.cdr.markForCheck();
            return;
        }

        const cx = this.getContainerWidth() / 2 || 400;
        const cy = this.getContainerHeight() / 2 || 250;

        // Resolve endpoints to node objects so a case-skewed UUID or dangling
        // edge cannot throw "node not found" out of ngOnInit. Raw-string
        // .id(d => d.ID) compared with ===, which UUIDsEqual elsewhere
        // deliberately does not.
        const nodeById = new Map<string, GraphNode>();
        for (const node of this.Nodes) {
            const key = NormalizeUUID(node.ID);
            if (key) {
                nodeById.set(key, node);
            }
        }
        const links: d3.SimulationLinkDatum<GraphNode>[] = [];
        for (const edge of this.Edges) {
            const source = nodeById.get(NormalizeUUID(edge.SourceID));
            const target = nodeById.get(NormalizeUUID(edge.TargetID));
            if (source && target) {
                links.push({ source, target });
            }
        }

        this.simulation = d3.forceSimulation<GraphNode>(this.Nodes)
            .force('link', d3.forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(links)
                .distance(this.Physics.LinkDistance || 120))
            .force('charge', d3.forceManyBody<GraphNode>()
                .strength(this.Physics.Repulsion || -450)
                .distanceMax(700))
            .force('collide', d3.forceCollide<GraphNode>((d: GraphNode) => (d.Radius || 26) + 16).iterations(2))
            .force('center', d3.forceCenter<GraphNode>(cx, cy));

        // Headless Pre-Warming: run 80 ticks synchronously in memory so the SVG renders resting immediately
        this.simulation.stop();
        for (let i = 0; i < 90; ++i) {
            this.simulation.tick();
        }

        this.syncCoordinates();

        // Auto-center & fit into view
        if (this.AutoFitOnLoad) {
            this.AutoFitToView();
        }

        // Attach live tick handler for interactive drag & drop
        this.simulation.on('tick', () => {
            this.syncCoordinates();
            this.cdr.markForCheck();
        });

        this.cdr.markForCheck();
    }

    private syncCoordinates(): void {
        for (const n of this.Nodes) {
            n.X = n.x;
            n.Y = n.y;
            n.VX = n.vx;
            n.VY = n.vy;
        }
    }

    private applyCircularLayout(): void {
        const cx = this.getContainerWidth() / 2 || 400;
        const cy = this.getContainerHeight() / 2 || 250;
        const r = Math.min(cx, cy) * 0.7 || 160;
        const count = this.Nodes.length || 1;

        this.Nodes.forEach((node, idx) => {
            const angle = (idx / count) * 2 * Math.PI;
            node.x = cx + r * Math.cos(angle);
            node.y = cy + r * Math.sin(angle);
            node.X = node.x;
            node.Y = node.y;
        });
    }

    /**
     * Arranges nodes in top-to-bottom horizontal tiers based on ParentID hierarchy,
     * HopDistance, or ConceptType Rank.
     */
    private applyHierarchyLayout(): void {
        const width = this.getContainerWidth() || 800;
        const nodeById = new Map<string, GraphNode>();
        for (const n of this.Nodes) {
            nodeById.set(NormalizeUUID(n.ID), n);
        }

        const levels = new Map<number, GraphNode[]>();
        for (const n of this.Nodes) {
            let depth = 0;
            if (n.HopDistance !== undefined) {
                depth = n.HopDistance;
            } else if (n.ParentID) {
                let curr: GraphNode | undefined = n;
                const visited = new Set<string>();
                while (curr?.ParentID) {
                    const pid = NormalizeUUID(curr.ParentID);
                    if (!pid || visited.has(pid)) break;
                    visited.add(pid);
                    depth++;
                    curr = nodeById.get(pid);
                }
            } else if (n.Category === 'Domain') {
                depth = 0;
            } else if (n.Category === 'grounding' || n.Category === 'chunk') {
                depth = 2;
            } else {
                depth = 1;
            }
            const bucket = levels.get(depth) ?? [];
            bucket.push(n);
            levels.set(depth, bucket);
        }

        const sortedDepths = Array.from(levels.keys()).sort((a, b) => a - b);
        const verticalSpacing = 140;
        sortedDepths.forEach((depth, rowIdx) => {
            const row = levels.get(depth) ?? [];
            const rowWidth = Math.max(width - 120, row.length * 140);
            const startX = (width - rowWidth) / 2;
            row.forEach((node, colIdx) => {
                const x = row.length === 1
                    ? width / 2
                    : startX + (colIdx / Math.max(row.length - 1, 1)) * rowWidth;
                const y = 80 + rowIdx * verticalSpacing;
                node.x = x;
                node.y = y;
                node.X = x;
                node.Y = y;
            });
        });
    }

    private applyGridLayout(): void {
        const count = this.Nodes.length || 1;
        const cols = Math.max(Math.ceil(Math.sqrt(count)), 1);
        const cellW = 160;
        const cellH = 130;

        this.Nodes.forEach((node, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            node.x = 100 + col * cellW;
            node.y = 90 + row * cellH;
            node.X = node.x;
            node.Y = node.y;
        });
    }

    // ── Public Programmatic Methods ───────────────────────────────────
    public ZoomIn(): void {
        this.Scale = Math.min(this.Scale * 1.2, 3.0);
        this.emitViewport();
    }

    public ZoomOut(): void {
        this.Scale = Math.max(this.Scale / 1.2, 0.3);
        this.emitViewport();
    }

    public FitToView(): void {
        this.AutoFitToView(40);
    }

    public AutoFitToView(padding = 40): void {
        if (!this.Nodes || this.Nodes.length === 0) return;

        const width = this.getContainerWidth() || 800;
        const height = this.getContainerHeight() || 420;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const n of this.Nodes) {
            const nx = n.x ?? n.X ?? 0;
            const ny = n.y ?? n.Y ?? 0;
            const r = (n.Radius || 26) + 20; // include badge & labels
            if (nx - r < minX) minX = nx - r;
            if (nx + r > maxX) maxX = nx + r;
            if (ny - r < minY) minY = ny - r;
            if (ny + r > maxY) maxY = ny + r;
        }

        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return;

        const bboxW = Math.max(maxX - minX, 100);
        const bboxH = Math.max(maxY - minY, 100);

        const scaleX = (width - padding * 2) / bboxW;
        const scaleY = (height - padding * 2) / bboxH;
        const targetScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.25);

        this.Scale = targetScale;
        this.PanX = (width - (minX + maxX) * this.Scale) / 2;
        this.PanY = (height - (minY + maxY) * this.Scale) / 2;

        this.emitViewport();
        this.cdr.markForCheck();
    }

    public Rearrange(): void {
        this.initializePositions();
        this.SimulatePhysics();
    }

    public SetLayoutMode(mode: GraphLayoutMode): void {
        const beforeEvent = new BeforeLayoutChangeEventArgs(mode, this.LayoutMode);
        this.BeforeLayoutChange.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        const prev = this.LayoutMode;
        this.LayoutMode = mode;
        this.SimulatePhysics();
        this.LayoutChanged.emit(new LayoutChangedEventArgs(mode, prev));
    }

    public SelectNode(id: string): void {
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
        if (node) this.OnNodeClick(node, new MouseEvent('click'));
    }

    public ClearSelection(): void {
        this.SelectedNode = null;
        this.SelectedEdge = null;
        this.cdr.markForCheck();
    }

    public SearchNodes(query: string): void {
        this.SearchQuery = query;
        this.ApplyFilters();
    }

    public ExpandHops(nodeId: string, depth: number): void {
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, nodeId));
        if (!node) return;

        const beforeEvent = new BeforeHopExpandEventArgs(node, (node.HopDistance || 0) + depth, node.HopDistance || 0);
        this.BeforeHopExpand.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        // Fire after event for host listener to fetch incremental relations
        this.HopExpanded.emit(new HopExpandedEventArgs(node, [], [], (node.HopDistance || 0) + depth));
    }

    // ── Event Handlers ────────────────────────────────────────────────
    public OnNodeClick(node: GraphNode, event: MouseEvent): void {
        event.stopPropagation();
        const beforeEvent = new BeforeNodeSelectEventArgs(node, this.SelectedNode);
        this.BeforeNodeSelect.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        const prev = this.SelectedNode;
        this.SelectedNode = node;
        this.SelectedEdge = null;
        this.NodeSelected.emit(new NodeSelectedEventArgs(node, prev));
        this.cdr.markForCheck();
    }

    public OnEdgeClick(edge: GraphEdge, event: MouseEvent): void {
        event.stopPropagation();
        const src = this.Nodes.find(n => UUIDsEqual(n.ID, edge.SourceID)) || null;
        const tgt = this.Nodes.find(n => UUIDsEqual(n.ID, edge.TargetID)) || null;

        const beforeEvent = new BeforeEdgeSelectEventArgs(edge, src, tgt);
        this.BeforeEdgeSelect.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        this.SelectedEdge = edge;
        this.EdgeSelected.emit(new EdgeSelectedEventArgs(edge, src, tgt));
        this.cdr.markForCheck();
    }

    public NavigateToEntity(node: GraphNode): void {
        // Focal-node dblclick must not navigate away from the record this
        // graph is illustrating — the inspector already hides the navigate
        // button for the same reason.
        if (this.IsFocalNode(node)) {
            return;
        }
        const rawId = this.stripCategoryPrefix(String(node.Data?.['RecordID'] || node.Data?.['ID'] || node.ID));
        const defaultEntity = node.Category === 'person'
            ? 'MJ_BizApps_Common: People'
            : node.Category === 'organization'
                ? 'MJ_BizApps_Common: Organizations'
                : 'MJ: Entities';
        const entityName = String(node.Data?.['EntityName'] || defaultEntity);
        const beforeEvent = new BeforeNodeNavigateEventArgs(node, entityName, rawId);
        this.BeforeNodeNavigate.emit(beforeEvent);
        if (beforeEvent.Cancel) return;

        // Hosts navigate. This widget is L1 and must not import Explorer's
        // NavigationService — emit the intent and let the surface open the record.
        this.NodeNavigated.emit(new NodeNavigatedEventArgs(node, entityName, rawId));
    }

    public NavigateToGrounding(node: GraphNode, grounding: GraphGroundingItem): void {
        const beforeEvent = new BeforeNodeNavigateEventArgs(node, grounding.TargetEntityName, grounding.TargetRecordID);
        this.BeforeNodeNavigate.emit(beforeEvent);
        if (beforeEvent.Cancel) return;
        this.NodeNavigated.emit(new NodeNavigatedEventArgs(node, grounding.TargetEntityName, grounding.TargetRecordID));
    }

    public TriggerNodeAction(node: GraphNode, action: GraphNodeActionKind, payload?: Record<string, unknown>): void {
        const beforeEvent = new BeforeNodeActionEventArgs(node, action, payload);
        this.BeforeNodeAction.emit(beforeEvent);
        if (beforeEvent.Cancel) return;
        this.NodeAction.emit(new NodeActionEventArgs(node, action, payload));
    }

    public ToggleCategoryFilter(category: string | null): void {
        if (!category || (this.ActiveCategoryFilter && this.ActiveCategoryFilter.toLowerCase() === category.toLowerCase())) {
            this.ActiveCategoryFilter = null;
        } else {
            this.ActiveCategoryFilter = category;
        }
        this.ApplyFilters();
        this.CategoryFilterChanged.emit(this.ActiveCategoryFilter);
    }

    public IsCategoryFilterActive(category: string): boolean {
        return Boolean(this.ActiveCategoryFilter && this.ActiveCategoryFilter.toLowerCase() === category.toLowerCase());
    }

    // ── Mouse Drag & Pan Handlers ─────────────────────────────────────
    public OnCanvasMouseDown(event: MouseEvent): void {
        if (event.target === this.CanvasRef.nativeElement || (event.target as HTMLElement).tagName === 'svg') {
            this.IsPanning = true;
            this.panStartX = event.clientX - this.PanX;
            this.panStartY = event.clientY - this.PanY;
        }
    }

    public OnCanvasMouseMove(event: MouseEvent): void {
        if (this.IsPanning) {
            this.PanX = event.clientX - this.panStartX;
            this.PanY = event.clientY - this.panStartY;
            this.emitViewport();
            this.cdr.markForCheck();
        } else if (this.draggedNode) {
            const coords = this.getCanvasRelativeCoords(event);
            this.draggedNode.fx = coords.x;
            this.draggedNode.fy = coords.y;
            this.draggedNode.x = coords.x;
            this.draggedNode.y = coords.y;
            this.draggedNode.X = coords.x;
            this.draggedNode.Y = coords.y;
            this.cdr.markForCheck();
        }
    }

    public OnCanvasMouseUp(_event: MouseEvent): void {
        this.IsPanning = false;
        if (this.draggedNode) {
            this.draggedNode.fx = null;
            this.draggedNode.fy = null;
            this.draggedNode = null;
            if (this.simulation) {
                this.simulation.alphaTarget(0);
            }
        }
    }

    public OnCanvasWheel(event: WheelEvent): void {
        event.preventDefault();
        const delta = event.deltaY > 0 ? 0.9 : 1.1;
        this.Scale = Math.min(Math.max(this.Scale * delta, 0.3), 3.0);
        this.emitViewport();
        this.cdr.markForCheck();
    }

    public OnNodeMouseDown(node: GraphNode, event: MouseEvent): void {
        event.stopPropagation();
        this.draggedNode = node;
        node.fx = node.x ?? node.X;
        node.fy = node.y ?? node.Y;
        if (this.simulation) {
            this.simulation.alphaTarget(0.3).restart();
        }
    }

    private emitViewport(): void {
        this.ViewportTransform.emit(new ViewportTransformEventArgs({ Scale: this.Scale, PanX: this.PanX, PanY: this.PanY }));
        this.cdr.markForCheck();
    }

    private getCanvasRelativeCoords(event: MouseEvent): { x: number; y: number } {
        const canvas = this.CanvasRef?.nativeElement;
        if (!canvas) {
            return {
                x: (event.clientX - this.PanX) / this.Scale,
                y: (event.clientY - this.PanY) / this.Scale
            };
        }
        const rect = canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        return {
            x: (mouseX - this.PanX) / this.Scale,
            y: (mouseY - this.PanY) / this.Scale
        };
    }

    private getContainerWidth(): number {
        return this.CanvasRef?.nativeElement?.clientWidth || this.WrapperRef?.nativeElement?.clientWidth || 800;
    }

    private getContainerHeight(): number {
        return this.CanvasRef?.nativeElement?.clientHeight || this.WrapperRef?.nativeElement?.clientHeight || 420;
    }

    // ── Helpers ───────────────────────────────────────────────────────
    public ApplyFilters(): void {
        const q = this.SearchQuery.trim().toLowerCase();
        const catFilter = this.ActiveCategoryFilter ? this.ActiveCategoryFilter.trim().toLowerCase() : null;
        this.FilteredNodes = this.Nodes.filter(n => {
            const matchesQuery = !q ||
                n.Label.toLowerCase().includes(q) ||
                Boolean(n.Sublabel && n.Sublabel.toLowerCase().includes(q)) ||
                Boolean(n.Description && n.Description.toLowerCase().includes(q));
            const matchesCat = !catFilter || (n.Category && n.Category.toLowerCase() === catFilter);
            return matchesQuery && matchesCat;
        });
        this.cdr.markForCheck();
    }

    public get VisibleEdges(): GraphEdge[] {
        if (this.FilteredNodes.length === this.Nodes.length) {
            return this.Edges;
        }
        const visibleIds = new Set(this.FilteredNodes.map(n => NormalizeUUID(n.ID)));
        return this.Edges.filter(
            e => visibleIds.has(NormalizeUUID(e.SourceID)) && visibleIds.has(NormalizeUUID(e.TargetID)),
        );
    }

    public get ConflictCount(): number {
        let count = 0;
        for (const e of this.Edges) {
            if (e.Label.toLowerCase().includes('contradict')) {
                count++;
            }
        }
        if (count === 0) {
            for (const n of this.Nodes) {
                if (n.Conflicts && n.Conflicts.length > 0) {
                    count += n.Conflicts.length;
                }
            }
        }
        return count;
    }

    public get ProposedCount(): number {
        let count = 0;
        for (const n of this.Nodes) {
            if (n.Status === 'Proposed') {
                count++;
            }
        }
        return count;
    }

    public GetNodeX(id: string): number {
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
        return node ? (node.X ?? node.x ?? 0) : 0;
    }

    public GetNodeY(id: string): number {
        const node = this.Nodes.find(n => UUIDsEqual(n.ID, id));
        return node ? (node.Y ?? node.y ?? 0) : 0;
    }

    public GetCategoryConfig(category?: string): GraphCategoryConfig {
        const key = String(category || '').toLowerCase();
        const found = this.Categories?.find(c => c.Category.toLowerCase() === key);
        if (found) return found;

        const builtin = DEFAULT_GRAPH_CATEGORIES.find(c => c.Category.toLowerCase() === key);
        if (builtin) return builtin;

        // Deterministic palette hash for arbitrary consumer-defined categories
        const hash = Math.abs(key.split('').reduce((acc, ch) => ((acc << 5) - acc) + ch.charCodeAt(0), 0));
        const fallbackColor = DYNAMIC_CATEGORY_PALETTE[hash % DYNAMIC_CATEGORY_PALETTE.length];
        const formattedLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Item';
        return {
            Category: category || 'custom',
            Label: formattedLabel,
            Color: fallbackColor,
            IconClass: 'fa-solid fa-circle-dot'
        };
    }

    public get ActiveCategories(): GraphCategoryConfig[] {
        const present = new Set<string>();
        for (const n of this.Nodes) {
            if (n.Category) present.add(n.Category.toLowerCase());
        }
        const result: GraphCategoryConfig[] = [];
        for (const catKey of present) {
            result.push(this.GetCategoryConfig(catKey));
        }
        return result.sort((a, b) => (a.Rank ?? 999) - (b.Rank ?? 999));
    }

    public GetCategoryLabel(category?: string): string {
        return this.GetCategoryConfig(category).Label;
    }

    public GetNodeColor(node: GraphNode): string {
        return node.Color ?? this.GetCategoryConfig(node.Category).Color;
    }

    public GetNodeIcon(node: GraphNode): string {
        return node.IconClass ?? this.GetCategoryConfig(node.Category).IconClass ?? 'fa-solid fa-circle-dot';
    }

    public GetNodeGlyphText(node: GraphNode): string {
        if (node.Badge) return node.Badge;
        if (node.Rank !== undefined) return `#${node.Rank}`;
        if (node.Category === 'chunk') return '§';
        if (node.Category === 'grounding') return '⚡';
        return node.Label ? node.Label.slice(0, 2).toUpperCase() : '•';
    }

    public GetEdgeStroke(edge: GraphEdge): string {
        if (this.IsEdgeHighlighted(edge)) return '#38bdf8';
        if (edge.Color) return edge.Color;
        const lbl = edge.Label.toLowerCase();
        if (lbl.includes('contradict')) return '#f43f5e';
        if (lbl === 'defines' || lbl === 'measures' || lbl === 'implements' || lbl === 'describes') return '#10b981';
        return '#475569';
    }

    public GetEdgeStrokeWidth(edge: GraphEdge): number {
        if (this.IsEdgeHighlighted(edge)) return 3;
        if (edge.Weight !== undefined) return Math.max(1.5, Math.min(edge.Weight * 2.5, 3.5));
        if (edge.Label.toLowerCase().includes('contradict')) return 2.5;
        return 1.8;
    }

    public GetEdgeDashArray(edge: GraphEdge): string | null {
        if (edge.Style === 'dashed' || edge.Label.toLowerCase().includes('contradict')) return '6,4';
        if (edge.Style === 'dotted' || edge.Label === 'SourcedFrom' || edge.Label === 'Mentions') return '3,3';
        return null;
    }

    public GetEdgeMarkerEnd(edge: GraphEdge): string | null {
        if (edge.Direction === 'undirected') return null;
        if (this.IsEdgeHighlighted(edge)) return 'url(#mj-arrow-highlight)';
        const lbl = edge.Label.toLowerCase();
        if (lbl.includes('contradict')) return 'url(#mj-arrow-conflict)';
        if (lbl === 'defines' || lbl === 'measures' || lbl === 'implements' || lbl === 'describes') return 'url(#mj-arrow-grounding)';
        return 'url(#mj-arrow-default)';
    }

    public GetNodeEdgeCount(id: string): number {
        return this.Edges.filter(e => UUIDsEqual(e.SourceID, id) || UUIDsEqual(e.TargetID, id)).length;
    }

    public IsEdgeHighlighted(edge: GraphEdge): boolean {
        return UUIDsEqual(this.SelectedEdge?.ID, edge.ID) ||
            UUIDsEqual(this.SelectedNode?.ID, edge.SourceID) ||
            UUIDsEqual(this.SelectedNode?.ID, edge.TargetID);
    }

    /**
     * Whether this node is the selected one. Exists as a method because the template cannot call
     * an imported function directly, and the comparison must go through UUIDsEqual rather than ===.
     */
    public IsNodeSelected(node: GraphNode): boolean {
        return UUIDsEqual(this.SelectedNode?.ID, node.ID);
    }

    public TruncateLabel(text: string, maxLen: number): string {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen - 1) + '…' : text;
    }

    public IsFocalNode(node: GraphNode): boolean {
        if (!node || !this.FocalNodeId) return false;
        const focalClean = this.stripCategoryPrefix(this.FocalNodeId).toLowerCase();
        const nodeClean = this.stripCategoryPrefix(node.ID).toLowerCase();
        const dataClean = node.Data?.['ID'] ? String(node.Data['ID']).toLowerCase() : '';
        return UUIDsEqual(node.ID, this.FocalNodeId) || nodeClean === focalClean || dataClean === focalClean;
    }

    /**
     * Hosts prefix node IDs with `{category}:`. Categories are dynamic
     * (`organization`, `asset`, `group`, plus caller keys), so strip any
     * known-category prefix rather than a hardcoded subset.
     */
    private stripCategoryPrefix(id: string): string {
        const idx = id.indexOf(':');
        if (idx <= 0) {
            return id;
        }
        const prefix = id.slice(0, idx).toLowerCase();
        const known =
            this.Categories?.some(c => c.Category.toLowerCase() === prefix) ||
            DEFAULT_GRAPH_CATEGORIES.some(c => c.Category.toLowerCase() === prefix);
        return known ? id.slice(idx + 1) : id;
    }
}
