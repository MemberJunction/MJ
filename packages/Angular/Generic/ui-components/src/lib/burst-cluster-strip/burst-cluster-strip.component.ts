import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    Output,
    SimpleChanges,
    inject
} from '@angular/core';

/**
 * Grouping resolution mode for `<mj-burst-cluster-strip>`.
 * - `'auto'`: Adaptively chooses session bursts for compact histories or calendar eras (`year` / `quarter` / `month`)
 *   when multi-year data exceeds `EraZoomThreshold`.
 * - `'session'`: Groups chronologically adjacent events into active bursts (within `SessionGapHours` or same calendar day),
 *   iteratively merging closest adjacent bursts down to `MaxClusters`.
 * - `'day'` | `'week'` | `'month'` | `'quarter'` | `'year'`: Groups events into explicit calendar buckets.
 */
export type MJBurstClusterResolution =
    | 'auto'
    | 'session'
    | 'day'
    | 'week'
    | 'month'
    | 'quarter'
    | 'year';

/** Effective computed resolution after `'auto'` evaluation and any active semantic zoom level. */
export type MJBurstClusterEffectiveResolution = Exclude<MJBurstClusterResolution, 'auto'>;

/**
 * Strategy used when raw session bursts exceed `MaxClusters` in `'auto'` mode:
 * - `'adaptive-era'`: Automatically switches to calendar era buckets (`year` / `quarter` / `month`) when raw bursts
 *   exceed `EraZoomThreshold` across multiple months/years, enabling click-to-zoom drill-down.
 * - `'merge-closest'`: Iteratively merges the two chronologically closest adjacent bursts until at most `MaxClusters` remain.
 */
export type MJBurstClusterCoalesceStrategy = 'adaptive-era' | 'merge-closest';

/**
 * Generic, domain-agnostic time-series event item consumed by `<mj-burst-cluster-strip>`.
 * Has zero knowledge of any specific entity or data source.
 */
export interface MJBurstClusterItem<T = unknown> {
    /** Unique identifier for this event item. */
    ID: string;
    /** Event timestamp as a `Date`, epoch milliseconds, or ISO date string. */
    Timestamp: Date | number | string;
    /** Category key matching a configured {@link MJBurstClusterCategory.Key} (defaults to `'default'`). */
    Category?: string;
    /** Optional hover tooltip text for this individual event pip. */
    Tooltip?: string;
    /** Optional numeric weight for this event (defaults to `1`). */
    Weight?: number;
    /** Optional reference to the underlying caller domain object. */
    Data?: T;
}

/**
 * Property-name or extractor-function mapping for binding an arbitrary raw `T[]` array via `[Data]`
 * without pre-allocating `MJBurstClusterItem<T>[]` wrappers.
 */
export interface MJBurstClusterFieldMap<T = unknown> {
    ID?: (keyof T & string) | ((item: T, index: number) => string);
    Timestamp: (keyof T & string) | ((item: T, index: number) => Date | number | string);
    Category?: (keyof T & string) | ((item: T, index: number) => string);
    Tooltip?: (keyof T & string) | ((item: T, index: number) => string);
    Weight?: (keyof T & string) | ((item: T, index: number) => number);
}

/**
 * Visual and semantic definition of an event category rendered in `<mj-burst-cluster-strip>`.
 */
export interface MJBurstClusterCategory {
    /** Unique category identifier (e.g. `'update'`, `'create'`, `'restore'`, `'email'`, `'meeting'`). */
    Key: string;
    /** Display label shown in the legend (e.g. `'Update'`, `'Create'`, `'Restore'`). */
    Label: string;
    /** Singular noun for subtitle synthesis (e.g. `'edit'`, `'create'`, `'restore'`). */
    SingularLabel?: string;
    /** Plural noun for subtitle synthesis (e.g. `'edits'`, `'creates'`, `'restores'`). */
    PluralLabel?: string;
    /** CSS color or design token (e.g. `'var(--mj-brand-primary)'`, `'var(--mj-status-success)'`, `'#8b5cf6'`). */
    Color: string;
    /** Optional Font Awesome icon class. */
    Icon?: string;
    /** Optional CSS modifier suffix (e.g. `'create' | 'update' | 'restore'`) added as `rc-burst-pip--<modifier>`. */
    CssModifier?: string;
}

/**
 * Individual event pip rendered inside a cluster card.
 */
export interface MJBurstClusterPip<T = unknown> {
    /** Event ID. */
    ID: string;
    /** Category key. */
    Category: string;
    /** Resolved CSS color for this pip. */
    Color: string;
    /** Optional CSS modifier suffix. */
    CssModifier?: string;
    /** Hover tooltip text for this pip. */
    Tooltip: string;
    /** Underlying normalized item. */
    Item: MJBurstClusterItem<T>;
}

/**
 * Category breakdown entry for a single cluster node.
 */
export interface MJBurstClusterCategoryShare {
    Key: string;
    Label: string;
    Color: string;
    Count: number;
    SharePercent: number;
}

/**
 * Computed burst or era cluster node rendered in `<mj-burst-cluster-strip>`.
 */
export interface MJBurstClusterNode<T = unknown> {
    /** Stable key for selection, zooming, and `@for` tracking. */
    Key: string;
    /** Short date or era label (e.g. `'Today'`, `'Oct 15'`, `'2024'`, `'Q2 \'25'`). */
    Label: string;
    /** Concise composition subtitle (e.g. `'Initial creation'`, `'4 edits'`, `'1 restore, 2 edits'`). */
    Subtitle: string;
    /** Non-linear quiet time gap label between this cluster and the next (e.g. `'11 mos quiet'`), or `null` on the final cluster. */
    GapAfterLabel: string | null;
    /**Quiet gap duration in milliseconds after this cluster (`0` on the final cluster). */
    GapAfterMs: number;
    /** Up to `MaxPipsPerCluster` individual pips in chronological order. */
    Pips: MJBurstClusterPip<T>[];
    /** Number of additional events in this cluster beyond `MaxPipsPerCluster`. */
    OverflowPipCount: number;
    /** Detailed hover tooltip describing the cluster time span and category breakdown. */
    Tooltip: string;
    /** Inclusive start timestamp (epoch ms). */
    StartTime: number;
    /** Inclusive end timestamp (epoch ms). */
    EndTime: number;
    /** Total number of events in this cluster. */
    TotalCount: number;
    /** Total weight of events in this cluster. */
    TotalWeight: number;
    /** Count of events by category key. */
    CategoryCounts: Record<string, number>;
    /** Proportional shares by category (for stacked bar rendering). */
    CategoryShares: MJBurstClusterCategoryShare[];
    /** Normalized height percentage (`22..100`) relative to the largest cluster in the current view. */
    HeightPercent: number;
    /** Set of event IDs belonging to this cluster. */
    ItemIDs: Set<string>;
    /** Chronologically ordered items belonging to this cluster. */
    Items: MJBurstClusterItem<T>[];
    /** True when this node represents a multi-event calendar era (`year` / `quarter` / `month`) that can be zoomed into. */
    IsZoomableEra: boolean;
}

/**
 * Entry in the semantic zoom breadcrumb stack when drilling down from multi-year/quarter eras into finer bursts.
 */
export interface MJBurstZoomBreadcrumb<T = unknown> {
    /** Cluster key that was zoomed into. */
    ClusterKey: string;
    /** Human-readable era label (e.g. `'2024'`, `'Q3 \'25'`). */
    Label: string;
    /** Inclusive start timestamp of the zoomed era. */
    StartTime: number;
    /** Inclusive end timestamp of the zoomed era. */
    EndTime: number;
    /** Items scoped to this zoom level. */
    Items: MJBurstClusterItem<T>[];
    /** Resolution active at this zoom depth. */
    Resolution: MJBurstClusterEffectiveResolution;
}

/**
 * Base class for cancellable `<mj-burst-cluster-strip>` `Before*` events.
 * Set `Cancel = true` in an event handler to abort the default action.
 */
export class MJCancellableBurstStripEvent {
    /** Set to `true` to cancel the default behavior of this action. */
    public Cancel = false;
}

/** Cancellable event args emitted before a cluster is selected or deselected. */
export class MJBeforeBurstClusterSelectEventArgs<T = unknown> extends MJCancellableBurstStripEvent {
    constructor(
        public readonly Cluster: MJBurstClusterNode<T>,
        public readonly PreviousCluster: MJBurstClusterNode<T> | null,
        public readonly IsDeselecting: boolean,
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {
        super();
    }
}

/** Event args emitted after a cluster selection changes. */
export class MJAfterBurstClusterSelectEventArgs<T = unknown> {
    constructor(
        public readonly Cluster: MJBurstClusterNode<T> | null,
        public readonly PreviousCluster: MJBurstClusterNode<T> | null,
        public readonly SelectedIDs: Set<string> | null,
        public readonly SelectedItems: MJBurstClusterItem<T>[],
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {}
}

/** Cancellable event args emitted before the active cluster selection is cleared. */
export class MJBeforeBurstSelectionClearEventArgs<T = unknown> extends MJCancellableBurstStripEvent {
    constructor(
        public readonly PreviousCluster: MJBurstClusterNode<T> | null,
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {
        super();
    }
}

/** Event args emitted after the active cluster selection is cleared. */
export class MJAfterBurstSelectionClearEventArgs<T = unknown> {
    constructor(
        public readonly PreviousCluster: MJBurstClusterNode<T> | null,
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {}
}

/** Cancellable event args emitted before zooming into an era or zooming out. */
export class MJBeforeBurstZoomChangeEventArgs<T = unknown> extends MJCancellableBurstStripEvent {
    constructor(
        public readonly Direction: 'in' | 'out' | 'reset',
        public readonly TargetCluster: MJBurstClusterNode<T> | null,
        public readonly TargetResolution: MJBurstClusterEffectiveResolution,
        public readonly NextZoomDepth: number,
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {
        super();
    }
}

/** Event args emitted after a semantic zoom transition completes. */
export class MJAfterBurstZoomChangeEventArgs<T = unknown> {
    constructor(
        public readonly Direction: 'in' | 'out' | 'reset',
        public readonly ActiveZoomBreadcrumb: MJBurstZoomBreadcrumb<T> | null,
        public readonly EffectiveResolution: MJBurstClusterEffectiveResolution,
        public readonly ZoomDepth: number,
        public readonly Clusters: MJBurstClusterNode<T>[],
        public readonly Trigger: 'click' | 'keyboard' | 'api'
    ) {}
}

/** Cancellable event args emitted before the component computes clusters from normalized items. */
export class MJBeforeBurstClustersRebuildEventArgs<T = unknown> extends MJCancellableBurstStripEvent {
    constructor(
        public Items: MJBurstClusterItem<T>[],
        public EffectiveResolution: MJBurstClusterEffectiveResolution
    ) {
        super();
    }
}

/** Event args emitted after the component finishes computing clusters. */
export class MJAfterBurstClustersRebuildEventArgs<T = unknown> {
    constructor(
        public readonly Clusters: MJBurstClusterNode<T>[],
        public readonly EffectiveResolution: MJBurstClusterEffectiveResolution,
        public readonly GranularityLabel: string,
        public readonly TotalItemCount: number
    ) {}
}

/** Event args emitted when a user clicks an individual event pip inside a cluster. */
export class MJBurstPipClickEventArgs<T = unknown> {
    constructor(
        public readonly Pip: MJBurstClusterPip<T>,
        public readonly Cluster: MJBurstClusterNode<T>,
        public readonly OriginalEvent: MouseEvent
    ) {}
}

/**
 * Unified filter event emitted whenever cluster selection or era zoom changes the active subset of items.
 */
export class MJBurstFilterChangedEventArgs<T = unknown> {
    constructor(
        public readonly ActiveCluster: MJBurstClusterNode<T> | null,
        public readonly ActiveZoomBreadcrumb: MJBurstZoomBreadcrumb<T> | null,
        /** Set of matching item IDs, or `null` when no cluster/zoom filter is active (all items match). */
        public readonly FilteredIDs: Set<string> | null,
        /** Matching normalized items (all items when no filter is active). */
        public readonly FilteredItems: MJBurstClusterItem<T>[],
        /** Human-readable label of the active filter (e.g. `'Oct 15'` or `'2024'`), or `null` when unfiltered. */
        public readonly ActiveFilterLabel: string | null
    ) {}
}

const DEFAULT_FALLBACK_COLORS: readonly string[] = [
    'var(--mj-brand-primary)',
    'var(--mj-status-success)',
    '#8b5cf6',
    'var(--mj-status-info)',
    'var(--mj-status-warning)',
    'var(--mj-status-error)'
];

/**
 * `<mj-burst-cluster-strip>` — General-purpose, domain-agnostic Burst-Aware Cluster Strip for
 * irregular and multi-year time-series data.
 *
 * Instead of dividing wall-clock time into fixed equal width buckets (which produces mostly empty
 * columns when events occur in irregular bursts separated by weeks, months, or years),
 * `<mj-burst-cluster-strip>` groups events into active bursts separated by non-linear quiet-time
 * gap connectors (`⋯ 11 mos quiet ⋯`), and automatically scales to multi-year histories via
 * adaptive era coalescing (`Year` → `Quarter/Month` → `Session Burst`) with semantic Click-to-Zoom!
 */
@Component({
    selector: 'mj-burst-cluster-strip',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Clusters.length > 0) {
            <div
                class="mj-burst-cluster-strip rc-activity-chart"
                role="region"
                [attr.aria-label]="AriaLabel || Title || 'Activity timeline'">
                @if (ShowHeader) {
                    <div class="mj-burst-header rc-activity-chart-header">
                        <span class="mj-burst-title rc-activity-chart-title">
                            @if (TitleIcon) {
                                <i [class]="TitleIcon" aria-hidden="true"></i>
                            }
                            <span>{{ Title }}</span>
                            @if (GranularityLabel) {
                                <span class="mj-burst-granularity rc-activity-chart-granularity">· {{ GranularityLabel }}</span>
                            }
                        </span>

                        <div class="mj-burst-meta rc-activity-chart-meta">
                            @if (ZoomStack.length > 0) {
                                <button
                                    type="button"
                                    class="mj-burst-zoom-back-pill"
                                    (click)="OnZoomBackClick($event)"
                                    title="Zoom out to full timeline">
                                    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
                                    <span>{{ ZoomBackLabel }}</span>
                                </button>
                                <span class="mj-burst-zoom-crumb">
                                    Viewing {{ ActiveZoomBreadcrumb?.Label }}
                                </span>
                            }

                            @if (SelectedClusterLabel; as activeLabel) {
                                <button
                                    type="button"
                                    class="mj-burst-active-pill rc-activity-bucket-pill"
                                    (click)="OnClearSelectionClick($event)"
                                    title="Clear burst filter">
                                    <span>{{ activeLabel }}</span>
                                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                                </button>
                            }

                            @if (ShowLegend && ResolvedCategories.length > 0) {
                                <div class="mj-burst-legend rc-activity-legend">
                                    @for (cat of ResolvedCategories; track cat.Key) {
                                        <span class="mj-burst-legend-item rc-legend-item">
                                            <span
                                                class="mj-burst-legend-dot rc-legend-dot"
                                                [class]="cat.CssModifier ? 'mj-burst-legend-dot rc-legend-dot rc-legend-dot--' + cat.CssModifier : 'mj-burst-legend-dot rc-legend-dot'"
                                                [style.background]="cat.Color"></span>
                                            {{ cat.Label }}
                                        </span>
                                    }
                                </div>
                            }
                        </div>
                    </div>
                }

                <div class="mj-burst-track rc-burst-track">
                    @for (cluster of Clusters; track cluster.Key) {
                        <button
                            type="button"
                            class="mj-burst-node rc-burst-node"
                            [class.mj-burst-node--selected]="SelectedClusterKey === cluster.Key"
                            [class.rc-burst-node--selected]="SelectedClusterKey === cluster.Key"
                            [class.mj-burst-node--era]="cluster.IsZoomableEra"
                            [attr.aria-pressed]="SelectedClusterKey === cluster.Key"
                            [attr.aria-label]="cluster.Tooltip"
                            [title]="cluster.Tooltip"
                            (click)="OnClusterClick(cluster, $event)">
                            @if (cluster.IsZoomableEra && AllowZoom) {
                                <span class="mj-burst-era-badge" aria-hidden="true">
                                    <i class="fa-solid fa-magnifying-glass-plus"></i>
                                    Zoom
                                </span>
                            }

                            @if (ShowPips) {
                                <div class="mj-burst-pips rc-burst-pips">
                                    @for (pip of cluster.Pips; track pip.ID) {
                                        <span
                                            class="mj-burst-pip rc-burst-pip"
                                            [class]="pip.CssModifier ? 'mj-burst-pip rc-burst-pip rc-burst-pip--' + pip.CssModifier : 'mj-burst-pip rc-burst-pip'"
                                            [style.background]="pip.Color"
                                            [title]="pip.Tooltip"
                                            (click)="OnPipClick(pip, cluster, $event)"></span>
                                    }
                                    @if (cluster.OverflowPipCount > 0) {
                                        <span class="mj-burst-pip-overflow rc-burst-pip-overflow">+{{ cluster.OverflowPipCount }}</span>
                                    }
                                </div>
                            }

                            <span class="mj-burst-count rc-burst-count">
                                {{ cluster.TotalCount }} {{ cluster.TotalCount === 1 ? ItemSingularNoun : ItemPluralNoun }}
                            </span>
                            <span class="mj-burst-date rc-burst-date">{{ cluster.Label }}</span>
                            <span class="mj-burst-sub rc-burst-sub">{{ cluster.Subtitle }}</span>

                            @if (ShowProportionalBar && cluster.CategoryShares.length > 0) {
                                <div class="mj-burst-prop-bar" aria-hidden="true">
                                    @for (share of cluster.CategoryShares; track share.Key) {
                                        @if (share.SharePercent > 0) {
                                            <span
                                                class="mj-burst-prop-seg"
                                                [style.width.%]="share.SharePercent"
                                                [style.background]="share.Color"></span>
                                        }
                                    }
                                </div>
                            }
                        </button>

                        @if (ShowGapConnectors && cluster.GapAfterLabel) {
                            <div
                                class="mj-burst-gap-connector rc-gap-connector"
                                [attr.aria-label]="cluster.GapAfterLabel + ' with no ' + ItemPluralNoun">
                                <div class="mj-burst-gap-line rc-gap-line"></div>
                                <span class="mj-burst-gap-pill rc-gap-pill">{{ cluster.GapAfterLabel }}</span>
                            </div>
                        }
                    }
                </div>
            </div>
        }
    `,
    styles: [`
        :host {
            display: block;
        }

        .mj-burst-cluster-strip {
            padding: 9px 14px 10px;
            background: color-mix(in srgb, var(--mj-bg-surface-sunken) 55%, var(--mj-bg-surface));
            border-bottom: 1px solid var(--mj-border-subtle);
            display: flex;
            flex-direction: column;
            gap: 7px;
        }

        .mj-burst-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }

        .mj-burst-title {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--mj-text-secondary);
        }

        .mj-burst-title i {
            color: var(--mj-brand-primary);
            font-size: 11px;
        }

        .mj-burst-granularity {
            font-weight: 500;
            text-transform: none;
            letter-spacing: 0;
            color: var(--mj-text-muted);
        }

        .mj-burst-meta {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }

        .mj-burst-zoom-back-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10.5px;
            font-weight: 600;
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 32%, transparent);
            cursor: pointer;
            font-family: inherit;
            transition: background 120ms ease;
        }

        .mj-burst-zoom-back-pill:hover {
            background: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
        }

        .mj-burst-zoom-crumb {
            font-size: 10.5px;
            font-weight: 600;
            color: var(--mj-text-secondary);
        }

        .mj-burst-active-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 600;
            background: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 35%, transparent);
            cursor: pointer;
            font-family: inherit;
        }

        .mj-burst-legend {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 10px;
            color: var(--mj-text-muted);
        }

        .mj-burst-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .mj-burst-legend-dot {
            width: 7px;
            height: 7px;
            border-radius: 2px;
            display: inline-block;
        }

        .mj-burst-track {
            display: flex;
            align-items: stretch;
            gap: 4px;
            width: 100%;
            min-height: 64px;
        }

        .mj-burst-node {
            position: relative;
            flex: 1 1 0;
            min-width: 72px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 8px;
            padding: 6px 8px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: left;
            cursor: pointer;
            font-family: inherit;
            transition: border-color 120ms ease, box-shadow 120ms ease, background 120ms ease, transform 120ms ease;
        }

        .mj-burst-node:hover {
            border-color: color-mix(in srgb, var(--mj-brand-primary) 55%, var(--mj-border-default));
            background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface));
            transform: translateY(-1px);
        }

        .mj-burst-node:focus-visible {
            outline: 2px solid var(--mj-border-focus);
            outline-offset: 1px;
        }

        .mj-burst-node--selected {
            border-color: var(--mj-brand-primary);
            background: color-mix(in srgb, var(--mj-brand-primary) 9%, var(--mj-bg-surface));
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
        }

        .mj-burst-era-badge {
            position: absolute;
            top: 5px;
            right: 6px;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 9px;
            font-weight: 600;
            color: var(--mj-brand-primary);
            opacity: 0.78;
        }

        .mj-burst-node:hover .mj-burst-era-badge {
            opacity: 1;
        }

        .mj-burst-pips {
            display: flex;
            align-items: center;
            gap: 3px;
            flex-wrap: wrap;
            margin-bottom: 3px;
        }

        .mj-burst-pip {
            width: 8px;
            height: 8px;
            border-radius: 2px;
            flex-shrink: 0;
        }

        .mj-burst-pip-overflow {
            font-size: 9px;
            font-weight: 700;
            color: var(--mj-text-muted);
            padding-left: 2px;
        }

        .mj-burst-count {
            font-size: 11px;
            font-weight: 700;
            color: var(--mj-text-primary);
            line-height: 1.2;
        }

        .mj-burst-date {
            font-size: 10.5px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            line-height: 1.2;
            margin-top: 1px;
        }

        .mj-burst-sub {
            font-size: 9.5px;
            color: var(--mj-text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 1px;
        }

        .mj-burst-prop-bar {
            display: flex;
            width: 100%;
            height: 4px;
            border-radius: 999px;
            overflow: hidden;
            margin-top: 4px;
            background: var(--mj-bg-surface-sunken);
        }

        .mj-burst-prop-seg {
            height: 100%;
        }

        .mj-burst-gap-connector {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-width: 44px;
            padding: 0 2px;
            position: relative;
            user-select: none;
            flex-shrink: 0;
        }

        .mj-burst-gap-line {
            width: 100%;
            border-top: 1.5px dashed var(--mj-border-default);
            position: absolute;
            top: 50%;
            left: 0;
        }

        .mj-burst-gap-pill {
            position: relative;
            z-index: 1;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            border-radius: 999px;
            padding: 1px 6px;
            font-size: 9px;
            font-weight: 600;
            color: var(--mj-text-muted);
            white-space: nowrap;
        }
    `]
})
export class MJBurstClusterStripComponent<T = unknown> implements OnChanges {
    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Generic Data Inputs ────────────────────────────────────────────────────

    /**
     * Pre-normalized array of time-series items (`MJBurstClusterItem<T>[]`).
     * Alternatively, pass raw domain objects via `[Data]` + `[FieldMap]` (or `[TimestampField]`, etc.).
     */
    @Input() public Items: readonly MJBurstClusterItem<T>[] | null = null;

    /**
     * Optional raw domain array (`T[]`). Mapped into `MJBurstClusterItem<T>[]` via `[FieldMap]`
     * or `[IdField]` / `[TimestampField]` / `[CategoryField]` / `[TooltipField]` / `[WeightField]`.
     */
    @Input() public Data: readonly T[] | null = null;

    /**
     * Optional property-name or extractor-function map for `[Data]`.
     */
    @Input() public FieldMap: MJBurstClusterFieldMap<T> | null = null;

    /** Property name or extractor for `ID` when binding `[Data]`. Defaults to `'ID'`. */
    @Input() public IdField: (keyof T & string) | ((item: T, index: number) => string) = 'ID' as keyof T & string;

    /** Property name or extractor for `Timestamp` when binding `[Data]`. Defaults to `'Timestamp'`. */
    @Input() public TimestampField: (keyof T & string) | ((item: T, index: number) => Date | number | string) = 'Timestamp' as keyof T & string;

    /** Property name or extractor for `Category` when binding `[Data]`. Defaults to `'Category'`. */
    @Input() public CategoryField: (keyof T & string) | ((item: T, index: number) => string) | null = null;

    /** Property name or extractor for `Tooltip` when binding `[Data]`. */
    @Input() public TooltipField: (keyof T & string) | ((item: T, index: number) => string) | null = null;

    /** Property name or extractor for `Weight` when binding `[Data]`. */
    @Input() public WeightField: (keyof T & string) | ((item: T, index: number) => number) | null = null;

    /**
     * Category definitions controlling pip colors, legend labels, and subtitle phrasing.
     * When omitted, categories are auto-derived from the input items.
     */
    @Input() public Categories: readonly MJBurstClusterCategory[] | null = null;

    // ─── Grouping, Coalescing & Resolution Inputs ───────────────────────────────

    /**
     * Grouping resolution (`'auto' | 'session' | 'day' | 'week' | 'month' | 'quarter' | 'year'`).
     * Defaults to `'auto'`.
     */
    @Input() public Resolution: MJBurstClusterResolution = 'auto';

    /**
     * Strategy when raw session bursts exceed `MaxClusters` in `'auto'` mode:
     * - `'adaptive-era'` (default): Switches to `year` or `quarter`/`month` era nodes when raw bursts exceed
     *   `EraZoomThreshold` across multiple years/months, enabling semantic Click-to-Zoom drill-down.
     * - `'merge-closest'`: Always merges the two chronologically closest adjacent bursts down to `MaxClusters`.
     */
    @Input() public CoalesceStrategy: MJBurstClusterCoalesceStrategy = 'adaptive-era';

    /**
     * Maximum hours between adjacent events to coalesce into the same session burst (default `6`).
     */
    @Input() public SessionGapHours = 6;

    /**
     * Whether events occurring on the same UTC calendar day automatically group into the same session burst (default `true`).
     */
    @Input() public GroupSameCalendarDay = true;

    /**
     * Maximum number of session burst cards rendered in the strip before closest-gap coalescing (default `5`).
     */
    @Input() public MaxClusters = 5;

    /**
     * Raw session burst threshold above which `'adaptive-era'` switches to multi-month/year era buckets (default `10`).
     */
    @Input() public EraZoomThreshold = 10;

    /**
     * Whether clicking a multi-month/year era cluster drills into that era's finer bursts with a breadcrumb (default `true`).
     */
    @Input() public AllowZoom = true;

    /**
     * Maximum individual event pips rendered inside a cluster card before `+N` overflow indicator (default `12`).
     */
    @Input() public MaxPipsPerCluster = 12;

    /**
     * Minimum quiet time gap in hours required before rendering a quiet-gap connector pill between clusters (default `48`).
     */
    @Input() public MinGapQuietHours = 48;

    // ─── Display & Chrome Inputs ────────────────────────────────────────────────

    /** Header title text (default `'Activity Timeline'`). */
    @Input() public Title = 'Activity Timeline';

    /** Font Awesome icon class rendered next to `Title` (default `'fa-solid fa-wave-square'`). */
    @Input() public TitleIcon = 'fa-solid fa-wave-square';

    /** Accessible region label override. */
    @Input() public AriaLabel: string | null = null;

    /** Singular noun for event counts on cluster cards (default `'event'`; e.g. `'change'`). */
    @Input() public ItemSingularNoun = 'event';

    /** Plural noun for event counts on cluster cards (default `'events'`; e.g. `'changes'`). */
    @Input() public ItemPluralNoun = 'events';

    /** Whether to render the top header bar with title, granularity badge, zoom breadcrumb, and legend (default `true`). */
    @Input() public ShowHeader = true;

    /** Whether to render the category color legend in the header (default `true`). */
    @Input() public ShowLegend = true;

    /** Whether to render non-linear quiet-time gap connectors (`⋯ 11 mos quiet ⋯`) between clusters (default `true`). */
    @Input() public ShowGapConnectors = true;

    /** Whether to render individual event pips inside each cluster card (default `true`). */
    @Input() public ShowPips = true;

    /** Whether to render a stacked category proportion bar at the bottom of each cluster card (default `false`). */
    @Input() public ShowProportionalBar = false;

    /** Optional custom subtitle formatter callback for each cluster card. */
    @Input() public SubtitleFormatter: ((cluster: MJBurstClusterNode<T>, categories: readonly MJBurstClusterCategory[]) => string) | null = null;

    /** Currently selected cluster key (supports two-way `[(SelectedClusterKey)]` binding). */
    @Input() public SelectedClusterKey: string | null = null;

    // ─── Outputs (Including Before/After Cancellable Lifecycle Events) ──────────

    /** Emits when `SelectedClusterKey` changes (supports two-way `[(SelectedClusterKey)]`). */
    @Output() public SelectedClusterKeyChange = new EventEmitter<string | null>();

    /** Cancellable event emitted before a cluster card is selected or deselected. */
    @Output() public BeforeClusterSelect = new EventEmitter<MJBeforeBurstClusterSelectEventArgs<T>>();

    /** Emitted after a cluster card is selected or deselected. */
    @Output() public AfterClusterSelect = new EventEmitter<MJAfterBurstClusterSelectEventArgs<T>>();

    /** Cancellable event emitted before the active cluster filter is cleared. */
    @Output() public BeforeSelectionClear = new EventEmitter<MJBeforeBurstSelectionClearEventArgs<T>>();

    /** Emitted after the active cluster filter is cleared. */
    @Output() public AfterSelectionClear = new EventEmitter<MJAfterBurstSelectionClearEventArgs<T>>();

    /** Cancellable event emitted before zooming into an era node or zooming back out. */
    @Output() public BeforeZoomChange = new EventEmitter<MJBeforeBurstZoomChangeEventArgs<T>>();

    /** Emitted after a semantic zoom transition completes. */
    @Output() public AfterZoomChange = new EventEmitter<MJAfterBurstZoomChangeEventArgs<T>>();

    /** Cancellable event emitted before clusters are computed from the input items. */
    @Output() public BeforeClustersRebuild = new EventEmitter<MJBeforeBurstClustersRebuildEventArgs<T>>();

    /** Emitted after clusters have been computed. */
    @Output() public AfterClustersRebuild = new EventEmitter<MJAfterBurstClustersRebuildEventArgs<T>>();

    /** Emitted when the user clicks an individual event pip inside a cluster card. */
    @Output() public PipClicked = new EventEmitter<MJBurstPipClickEventArgs<T>>();

    /** Unified convenience event emitted whenever cluster selection or era zoom updates the active filtered item set. */
    @Output() public FilterChanged = new EventEmitter<MJBurstFilterChangedEventArgs<T>>();

    // ─── Public Computed State ──────────────────────────────────────────────────

    /** Computed cluster nodes currently visible in the strip. */
    public Clusters: MJBurstClusterNode<T>[] = [];

    /** Effective grouping resolution for the current view. */
    public EffectiveResolution: MJBurstClusterEffectiveResolution = 'session';

    /** Human-readable summary of the current strip granularity (e.g. `'3 bursts · 11 mos span'`). */
    public GranularityLabel = '';

    /** Resolved category definitions (either from `[Categories]` or auto-discovered from items). */
    public ResolvedCategories: MJBurstClusterCategory[] = [];

    /** Stack of active semantic zoom breadcrumbs when drilling into multi-year/month eras. */
    public ZoomStack: MJBurstZoomBreadcrumb<T>[] = [];

    private _normalizedItems: MJBurstClusterItem<T>[] = [];

    public ngOnChanges(changes: SimpleChanges): void {
        const dataChanged = Boolean(
            changes['Items'] ||
            changes['Data'] ||
            changes['FieldMap'] ||
            changes['IdField'] ||
            changes['TimestampField'] ||
            changes['CategoryField'] ||
            changes['TooltipField'] ||
            changes['WeightField']
        );
        const configChanged = Boolean(
            changes['Categories'] ||
            changes['Resolution'] ||
            changes['CoalesceStrategy'] ||
            changes['SessionGapHours'] ||
            changes['GroupSameCalendarDay'] ||
            changes['MaxClusters'] ||
            changes['EraZoomThreshold'] ||
            changes['MaxPipsPerCluster'] ||
            changes['MinGapQuietHours'] ||
            changes['SubtitleFormatter']
        );

        if (dataChanged) {
            this.ZoomStack = [];
        }
        if (dataChanged || configChanged) {
            this.Rebuild();
        } else if (changes['SelectedClusterKey']) {
            this.cdr.markForCheck();
        }
    }

    // ─── Public Imperative Methods ──────────────────────────────────────────────

    /**
     * Recomputes normalized items, category definitions, and burst/era clusters for the current zoom state.
     */
    public Rebuild(): void {
        this._normalizedItems = this.normalizeSourceItems();
        this.ResolvedCategories = this.resolveCategories(this._normalizedItems);
        this.rebuildClustersInternal();
        this.cdr.markForCheck();
    }

    /**
     * Programmatically selects a cluster by key (or clears selection when `clusterKey === null`).
     * Fires `BeforeClusterSelect` (cancellable) and `AfterClusterSelect`.
     */
    public SelectCluster(
        clusterKey: string | null,
        trigger: 'click' | 'keyboard' | 'api' = 'api'
    ): boolean {
        if (clusterKey === null) {
            return this.ClearSelection(trigger);
        }
        const target = this.Clusters.find(c => c.Key === clusterKey);
        if (!target || target.TotalCount === 0) {
            return false;
        }
        const prev = this.SelectedCluster;
        const isDeselecting = this.SelectedClusterKey === clusterKey;
        const beforeArgs = new MJBeforeBurstClusterSelectEventArgs<T>(
            target,
            prev,
            isDeselecting,
            trigger
        );
        this.BeforeClusterSelect.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return false;
        }

        this.SelectedClusterKey = isDeselecting ? null : clusterKey;
        this.SelectedClusterKeyChange.emit(this.SelectedClusterKey);

        const nextSelected = this.SelectedCluster;
        const afterArgs = new MJAfterBurstClusterSelectEventArgs<T>(
            nextSelected,
            prev,
            nextSelected ? new Set(nextSelected.ItemIDs) : null,
            nextSelected ? [...nextSelected.Items] : [...this.ActiveScopeItems],
            trigger
        );
        this.AfterClusterSelect.emit(afterArgs);
        this.emitFilterChanged();
        this.cdr.markForCheck();
        return true;
    }

    /**
     * Toggles the selection state of the specified cluster key.
     */
    public ToggleCluster(
        clusterKey: string,
        trigger: 'click' | 'keyboard' | 'api' = 'api'
    ): boolean {
        return this.SelectCluster(clusterKey, trigger);
    }

    /**
     * Clears the currently selected cluster filter.
     * Fires `BeforeSelectionClear` (cancellable) and `AfterSelectionClear`.
     */
    public ClearSelection(trigger: 'click' | 'keyboard' | 'api' = 'api'): boolean {
        if (!this.SelectedClusterKey) {
            return false;
        }
        const prev = this.SelectedCluster;
        const beforeArgs = new MJBeforeBurstSelectionClearEventArgs<T>(prev, trigger);
        this.BeforeSelectionClear.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return false;
        }

        this.SelectedClusterKey = null;
        this.SelectedClusterKeyChange.emit(null);
        this.AfterSelectionClear.emit(new MJAfterBurstSelectionClearEventArgs<T>(prev, trigger));
        this.emitFilterChanged();
        this.cdr.markForCheck();
        return true;
    }

    /**
     * Drills down into a multi-month/year era cluster to inspect its inner bursts.
     * Fires `BeforeZoomChange` (cancellable) and `AfterZoomChange`.
     */
    public ZoomIntoCluster(
        clusterKey: string,
        trigger: 'click' | 'keyboard' | 'api' = 'api'
    ): boolean {
        if (!this.AllowZoom) {
            return false;
        }
        const target = this.Clusters.find(c => c.Key === clusterKey);
        if (!target || !target.IsZoomableEra || target.Items.length === 0) {
            return false;
        }

        const nextRes: MJBurstClusterEffectiveResolution =
            target.Items.length > this.EraZoomThreshold && (target.EndTime - target.StartTime) > 120 * 86_400_000
                ? 'month'
                : 'session';

        const beforeArgs = new MJBeforeBurstZoomChangeEventArgs<T>(
            'in',
            target,
            nextRes,
            this.ZoomStack.length + 1,
            trigger
        );
        this.BeforeZoomChange.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return false;
        }

        this.ZoomStack = [
            ...this.ZoomStack,
            {
                ClusterKey: target.Key,
                Label: target.Label,
                StartTime: target.StartTime,
                EndTime: target.EndTime,
                Items: [...target.Items],
                Resolution: nextRes
            }
        ];
        this.SelectedClusterKey = null;
        this.SelectedClusterKeyChange.emit(null);
        this.rebuildClustersInternal();

        this.AfterZoomChange.emit(
            new MJAfterBurstZoomChangeEventArgs<T>(
                'in',
                this.ActiveZoomBreadcrumb,
                this.EffectiveResolution,
                this.ZoomStack.length,
                this.Clusters,
                trigger
            )
        );
        this.emitFilterChanged();
        this.cdr.markForCheck();
        return true;
    }

    /**
     * Zooms out one level (or to `targetDepth`, where `0` is the full root timeline).
     * Fires `BeforeZoomChange` (cancellable) and `AfterZoomChange`.
     */
    public ZoomOut(
        targetDepth = Math.max(0, this.ZoomStack.length - 1),
        trigger: 'click' | 'keyboard' | 'api' = 'api'
    ): boolean {
        if (this.ZoomStack.length === 0) {
            return false;
        }
        const clampedDepth = Math.max(0, Math.min(targetDepth, this.ZoomStack.length - 1));
        const targetCrumb = clampedDepth > 0 ? this.ZoomStack[clampedDepth - 1] : null;
        const nextRes = targetCrumb
            ? targetCrumb.Resolution
            : this.determineEffectiveResolution(this._normalizedItems);

        const beforeArgs = new MJBeforeBurstZoomChangeEventArgs<T>(
            clampedDepth === 0 ? 'reset' : 'out',
            null,
            nextRes,
            clampedDepth,
            trigger
        );
        this.BeforeZoomChange.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return false;
        }

        this.ZoomStack = this.ZoomStack.slice(0, clampedDepth);
        this.SelectedClusterKey = null;
        this.SelectedClusterKeyChange.emit(null);
        this.rebuildClustersInternal();

        this.AfterZoomChange.emit(
            new MJAfterBurstZoomChangeEventArgs<T>(
                clampedDepth === 0 ? 'reset' : 'out',
                this.ActiveZoomBreadcrumb,
                this.EffectiveResolution,
                this.ZoomStack.length,
                this.Clusters,
                trigger
            )
        );
        this.emitFilterChanged();
        this.cdr.markForCheck();
        return true;
    }

    /**
     * Resets the semantic zoom stack all the way back to the root overview.
     */
    public ResetZoom(trigger: 'click' | 'keyboard' | 'api' = 'api'): boolean {
        return this.ZoomOut(0, trigger);
    }

    /**
     * Returns the cluster node matching `key`, or `undefined`.
     */
    public GetClusterByKey(key: string): MJBurstClusterNode<T> | undefined {
        return this.Clusters.find(c => c.Key === key);
    }

    /**
     * Returns the set of item IDs matching the active cluster selection (or active zoom era),
     * or `null` when no cluster/zoom filter is active.
     */
    public GetSelectedIDs(): Set<string> | null {
        const selected = this.SelectedCluster;
        if (selected) {
            return new Set(selected.ItemIDs);
        }
        const zoom = this.ActiveZoomBreadcrumb;
        if (zoom) {
            return new Set(zoom.Items.map(i => i.ID));
        }
        return null;
    }

    /**
     * Returns the normalized `MJBurstClusterItem<T>[]` matching the active cluster/zoom filter
     * (or all items when no filter is active).
     */
    public GetSelectedItems(): MJBurstClusterItem<T>[] {
        const selected = this.SelectedCluster;
        if (selected) {
            return [...selected.Items];
        }
        return [...this.ActiveScopeItems];
    }

    /**
     * Returns the caller's underlying `Data: T` payloads matching the active cluster/zoom filter.
     */
    public GetSelectedData(): T[] {
        return this.GetSelectedItems()
            .map(i => i.Data)
            .filter((d): d is T => d !== undefined);
    }

    // ─── Public Getters ─────────────────────────────────────────────────────────

    /** Currently selected cluster node, or `null`. */
    public get SelectedCluster(): MJBurstClusterNode<T> | null {
        if (!this.SelectedClusterKey) return null;
        return this.Clusters.find(c => c.Key === this.SelectedClusterKey) ?? null;
    }

    /** Display label of the currently selected cluster, or `null`. */
    public get SelectedClusterLabel(): string | null {
        return this.SelectedCluster?.Label ?? null;
    }

    /** Current deepest zoom breadcrumb, or `null` when at root overview. */
    public get ActiveZoomBreadcrumb(): MJBurstZoomBreadcrumb<T> | null {
        return this.ZoomStack.length > 0 ? this.ZoomStack[this.ZoomStack.length - 1] : null;
    }

    /** Label for the zoom-out breadcrumb button (e.g. `'All Years (640)'` or parent era label). */
    public get ZoomBackLabel(): string {
        if (this.ZoomStack.length <= 1) {
            return `All (${this._normalizedItems.length})`;
        }
        const parent = this.ZoomStack[this.ZoomStack.length - 2];
        return parent.Label;
    }

    /** Items in the current zoom scope (or all normalized items when at root). */
    public get ActiveScopeItems(): MJBurstClusterItem<T>[] {
        const crumb = this.ActiveZoomBreadcrumb;
        return crumb ? crumb.Items : this._normalizedItems;
    }

    // ─── Template Event Handlers ────────────────────────────────────────────────

    public OnClusterClick(cluster: MJBurstClusterNode<T>, event: MouseEvent): void {
        event.stopPropagation();
        if (cluster.IsZoomableEra && this.AllowZoom) {
            this.ZoomIntoCluster(cluster.Key, 'click');
            return;
        }
        this.SelectCluster(cluster.Key, 'click');
    }

    public OnClearSelectionClick(event: MouseEvent): void {
        event.stopPropagation();
        this.ClearSelection('click');
    }

    public OnZoomBackClick(event: MouseEvent): void {
        event.stopPropagation();
        this.ZoomOut(this.ZoomStack.length - 1, 'click');
    }

    public OnPipClick(pip: MJBurstClusterPip<T>, cluster: MJBurstClusterNode<T>, event: MouseEvent): void {
        this.PipClicked.emit(new MJBurstPipClickEventArgs<T>(pip, cluster, event));
    }

    // ─── Internal Clustering & Normalization Pipeline ───────────────────────────

    private normalizeSourceItems(): MJBurstClusterItem<T>[] {
        if (this.Items && this.Items.length > 0) {
            return this.Items
                .map((item, idx) => ({
                    ID: String(item.ID ?? `item-${idx}`),
                    Timestamp: item.Timestamp,
                    Category: item.Category ?? 'default',
                    Tooltip: item.Tooltip,
                    Weight: item.Weight ?? 1,
                    Data: item.Data
                }))
                .filter(item => Number.isFinite(this.toEpochMs(item.Timestamp)))
                .sort((a, b) => this.toEpochMs(a.Timestamp) - this.toEpochMs(b.Timestamp));
        }

        if (!this.Data || this.Data.length === 0) {
            return [];
        }

        const idSpec = this.FieldMap?.ID ?? this.IdField;
        const tsSpec = this.FieldMap?.Timestamp ?? this.TimestampField;
        const catSpec = this.FieldMap?.Category ?? this.CategoryField;
        const tipSpec = this.FieldMap?.Tooltip ?? this.TooltipField;
        const weightSpec = this.FieldMap?.Weight ?? this.WeightField;

        const out: MJBurstClusterItem<T>[] = [];
        for (let i = 0; i < this.Data.length; i++) {
            const raw = this.Data[i];
            const tsVal = this.extractField(raw, i, tsSpec);
            const ms = this.toEpochMs(tsVal as Date | number | string);
            if (!Number.isFinite(ms)) continue;

            const idVal = this.extractField(raw, i, idSpec);
            const catVal = catSpec ? this.extractField(raw, i, catSpec) : 'default';
            const tipVal = tipSpec ? this.extractField(raw, i, tipSpec) : undefined;
            const weightVal = weightSpec ? Number(this.extractField(raw, i, weightSpec)) : 1;

            out.push({
                ID: idVal != null && String(idVal).length > 0 ? String(idVal) : `item-${i}`,
                Timestamp: ms,
                Category: catVal != null && String(catVal).length > 0 ? String(catVal) : 'default',
                Tooltip: tipVal != null ? String(tipVal) : undefined,
                Weight: Number.isFinite(weightVal) ? weightVal : 1,
                Data: raw
            });
        }

        return out.sort((a, b) => this.toEpochMs(a.Timestamp) - this.toEpochMs(b.Timestamp));
    }

    private extractField<R>(
        item: T,
        index: number,
        spec: (keyof T & string) | ((row: T, idx: number) => R)
    ): unknown {
        if (typeof spec === 'function') {
            return spec(item, index);
        }
        if (item && typeof item === 'object') {
            return (item as Record<string, unknown>)[spec];
        }
        return undefined;
    }

    private resolveCategories(items: readonly MJBurstClusterItem<T>[]): MJBurstClusterCategory[] {
        if (this.Categories && this.Categories.length > 0) {
            return [...this.Categories];
        }
        const seen = new Set<string>();
        const discovered: MJBurstClusterCategory[] = [];
        for (const item of items) {
            const key = item.Category || 'default';
            if (seen.has(key)) continue;
            seen.add(key);
            const color = DEFAULT_FALLBACK_COLORS[discovered.length % DEFAULT_FALLBACK_COLORS.length];
            const humanized = key.charAt(0).toUpperCase() + key.slice(1);
            discovered.push({
                Key: key,
                Label: humanized,
                SingularLabel: key.toLowerCase(),
                PluralLabel: `${key.toLowerCase()}s`,
                Color: color,
                CssModifier: key.toLowerCase()
            });
        }
        return discovered;
    }

    private determineEffectiveResolution(items: readonly MJBurstClusterItem<T>[]): MJBurstClusterEffectiveResolution {
        const activeZoom = this.ActiveZoomBreadcrumb;
        if (activeZoom) {
            return activeZoom.Resolution;
        }
        if (this.Resolution !== 'auto') {
            return this.Resolution;
        }
        if (items.length === 0 || this.CoalesceStrategy === 'merge-closest') {
            return 'session';
        }

        const rawBursts = this.buildInitialSessionClusters(items);
        if (rawBursts.length <= this.EraZoomThreshold) {
            return 'session';
        }

        const minMs = this.toEpochMs(items[0].Timestamp);
        const maxMs = this.toEpochMs(items[items.length - 1].Timestamp);
        const spanDays = (maxMs - minMs) / 86_400_000;
        const startYear = new Date(minMs).getUTCFullYear();
        const endYear = new Date(maxMs).getUTCFullYear();

        if (endYear - startYear >= 2 || spanDays >= 540) {
            return 'year';
        }
        if (spanDays >= 120) {
            return 'month';
        }
        return 'session';
    }

    private rebuildClustersInternal(): void {
        const scopeItems = [...this.ActiveScopeItems];
        if (scopeItems.length === 0) {
            this.Clusters = [];
            this.GranularityLabel = '';
            this.SelectedClusterKey = null;
            return;
        }

        const effectiveRes = this.determineEffectiveResolution(scopeItems);
        const beforeArgs = new MJBeforeBurstClustersRebuildEventArgs<T>(scopeItems, effectiveRes);
        this.BeforeClustersRebuild.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return;
        }

        const workingItems = beforeArgs.Items;
        this.EffectiveResolution = beforeArgs.EffectiveResolution;

        const rawGroups =
            this.EffectiveResolution === 'session'
                ? this.buildMergedSessionClusters(workingItems)
                : this.buildCalendarResolutionClusters(workingItems, this.EffectiveResolution);

        const minTime = this.toEpochMs(workingItems[0].Timestamp);
        const maxTime = this.toEpochMs(workingItems[workingItems.length - 1].Timestamp);
        const totalSpanMs = Math.max(0, maxTime - minTime);
        const maxCount = Math.max(1, ...rawGroups.map(g => g.items.length));
        const categoryByKey = new Map<string, MJBurstClusterCategory>(
            this.ResolvedCategories.map(c => [c.Key, c])
        );
        const isEraMode =
            this.AllowZoom &&
            (this.EffectiveResolution === 'year' ||
                this.EffectiveResolution === 'quarter' ||
                this.EffectiveResolution === 'month');

        const nodes: MJBurstClusterNode<T>[] = rawGroups.map((group, idx) => {
            const categoryCounts: Record<string, number> = {};
            const itemIds = new Set<string>();
            const pips: MJBurstClusterPip<T>[] = [];
            let totalWeight = 0;

            for (const item of group.items) {
                itemIds.add(item.ID);
                const catKey = item.Category || 'default';
                categoryCounts[catKey] = (categoryCounts[catKey] ?? 0) + 1;
                totalWeight += item.Weight ?? 1;

                if (pips.length < this.MaxPipsPerCluster) {
                    const catDef = categoryByKey.get(catKey);
                    const color = catDef?.Color ?? DEFAULT_FALLBACK_COLORS[0];
                    const ms = this.toEpochMs(item.Timestamp);
                    const defaultTip = `${catDef?.Label ?? catKey} · ${new Intl.DateTimeFormat('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    }).format(new Date(ms))}`;

                    pips.push({
                        ID: item.ID,
                        Category: catKey,
                        Color: color,
                        CssModifier: catDef?.CssModifier ?? catKey.toLowerCase(),
                        Tooltip: item.Tooltip || defaultTip,
                        Item: item
                    });
                }
            }

            const totalCount = group.items.length;
            const label = group.explicitLabel ?? this.formatClusterDateLabel(group.startTime, group.endTime, maxTime, totalSpanMs);
            const nextGroup = idx < rawGroups.length - 1 ? rawGroups[idx + 1] : null;
            const gapAfterMs = nextGroup ? Math.max(0, nextGroup.startTime - group.endTime) : 0;
            const gapAfterLabel = nextGroup ? this.formatQuietGapLabel(gapAfterMs) : null;

            const shares: MJBurstClusterCategoryShare[] = this.ResolvedCategories.map(cat => {
                const count = categoryCounts[cat.Key] ?? 0;
                return {
                    Key: cat.Key,
                    Label: cat.Label,
                    Color: cat.Color,
                    Count: count,
                    SharePercent: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
                };
            });

            const node: MJBurstClusterNode<T> = {
                Key: group.key ?? `burst-${idx}-${group.startTime}`,
                Label: label,
                Subtitle: '',
                GapAfterLabel: gapAfterLabel,
                GapAfterMs: gapAfterMs,
                Pips: pips,
                OverflowPipCount: Math.max(0, totalCount - pips.length),
                Tooltip: '',
                StartTime: group.startTime,
                EndTime: group.endTime,
                TotalCount: totalCount,
                TotalWeight: totalWeight,
                CategoryCounts: categoryCounts,
                CategoryShares: shares,
                HeightPercent: Math.max(22, Math.round((totalCount / maxCount) * 100)),
                ItemIDs: itemIds,
                Items: group.items,
                IsZoomableEra: isEraMode && totalCount > 1
            };

            node.Subtitle = this.SubtitleFormatter
                ? this.SubtitleFormatter(node, this.ResolvedCategories)
                : this.formatDefaultSubtitle(node);
            node.Tooltip = this.formatDefaultTooltip(node);
            return node;
        });

        this.Clusters = nodes;
        const unitPlural = isEraMode ? 'eras' : 'bursts';
        const unitSingular = isEraMode ? 'era' : 'burst';
        this.GranularityLabel =
            nodes.length === 1
                ? `1 active ${unitSingular}`
                : `${nodes.length} ${unitPlural} · ${this.formatTotalSpanLabel(totalSpanMs)}`;

        if (this.SelectedClusterKey && !this.Clusters.some(c => c.Key === this.SelectedClusterKey)) {
            this.SelectedClusterKey = null;
        }

        this.AfterClustersRebuild.emit(
            new MJAfterBurstClustersRebuildEventArgs<T>(
                this.Clusters,
                this.EffectiveResolution,
                this.GranularityLabel,
                workingItems.length
            )
        );
    }

    private buildInitialSessionClusters(
        items: readonly MJBurstClusterItem<T>[]
    ): Array<{ key?: string; explicitLabel?: string; items: MJBurstClusterItem<T>[]; startTime: number; endTime: number }> {
        const sessionGapThresholdMs = Math.max(0, this.SessionGapHours) * 3_600_000;
        const clusters: Array<{ items: MJBurstClusterItem<T>[]; startTime: number; endTime: number }> = [];

        for (const item of items) {
            const t = this.toEpochMs(item.Timestamp);
            const prev = clusters[clusters.length - 1];
            if (!prev) {
                clusters.push({ items: [item], startTime: t, endTime: t });
                continue;
            }
            const prevDate = new Date(prev.endTime);
            const currDate = new Date(t);
            const sameDay =
                this.GroupSameCalendarDay &&
                prevDate.getUTCFullYear() === currDate.getUTCFullYear() &&
                prevDate.getUTCMonth() === currDate.getUTCMonth() &&
                prevDate.getUTCDate() === currDate.getUTCDate();
            const withinSessionGap = (t - prev.endTime) <= sessionGapThresholdMs;

            if (sameDay || withinSessionGap) {
                prev.items.push(item);
                prev.endTime = t;
            } else {
                clusters.push({ items: [item], startTime: t, endTime: t });
            }
        }
        return clusters;
    }

    private buildMergedSessionClusters(
        items: readonly MJBurstClusterItem<T>[]
    ): Array<{ key?: string; explicitLabel?: string; items: MJBurstClusterItem<T>[]; startTime: number; endTime: number }> {
        const clusters = this.buildInitialSessionClusters(items);
        const maxAllowed = Math.max(1, this.MaxClusters);

        while (clusters.length > maxAllowed) {
            let minGap = Infinity;
            let mergeIdx = 0;
            for (let i = 0; i < clusters.length - 1; i++) {
                const gap = clusters[i + 1].startTime - clusters[i].endTime;
                if (gap < minGap) {
                    minGap = gap;
                    mergeIdx = i;
                }
            }
            const left = clusters[mergeIdx];
            const right = clusters[mergeIdx + 1];
            clusters.splice(mergeIdx, 2, {
                items: [...left.items, ...right.items],
                startTime: left.startTime,
                endTime: right.endTime
            });
        }
        return clusters;
    }

    private buildCalendarResolutionClusters(
        items: readonly MJBurstClusterItem<T>[],
        resolution: Exclude<MJBurstClusterEffectiveResolution, 'session'>
    ): Array<{ key?: string; explicitLabel?: string; items: MJBurstClusterItem<T>[]; startTime: number; endTime: number }> {
        const map = new Map<string, { key: string; explicitLabel: string; items: MJBurstClusterItem<T>[]; startTime: number; endTime: number }>();

        for (const item of items) {
            const t = this.toEpochMs(item.Timestamp);
            const d = new Date(t);
            const year = d.getUTCFullYear();
            const month = d.getUTCMonth();
            const date = d.getUTCDate();

            let bucketKey: string;
            let explicitLabel: string;

            if (resolution === 'year') {
                bucketKey = `year-${year}`;
                explicitLabel = `${year}`;
            } else if (resolution === 'quarter') {
                const q = Math.floor(month / 3) + 1;
                bucketKey = `quarter-${year}-Q${q}`;
                explicitLabel = `Q${q} '${String(year).slice(-2)}`;
            } else if (resolution === 'month') {
                const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
                bucketKey = `month-${year}-${month}`;
                explicitLabel = `${shortMonth} '${String(year).slice(-2)}`;
            } else if (resolution === 'week') {
                const dayOfWeek = d.getUTCDay();
                const weekStartMs = Date.UTC(year, month, date - dayOfWeek);
                const ws = new Date(weekStartMs);
                bucketKey = `week-${ws.getUTCFullYear()}-${ws.getUTCMonth()}-${ws.getUTCDate()}`;
                explicitLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ws);
            } else {
                bucketKey = `day-${year}-${month}-${date}`;
                explicitLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
            }

            const existing = map.get(bucketKey);
            if (existing) {
                existing.items.push(item);
                if (t < existing.startTime) existing.startTime = t;
                if (t > existing.endTime) existing.endTime = t;
            } else {
                map.set(bucketKey, {
                    key: bucketKey,
                    explicitLabel,
                    items: [item],
                    startTime: t,
                    endTime: t
                });
            }
        }

        return Array.from(map.values());
    }

    private formatClusterDateLabel(
        startMs: number,
        endMs: number,
        latestTimeMs: number,
        totalSpanMs: number
    ): string {
        const dayMs = 86_400_000;
        const startDate = new Date(startMs);
        const endDate = new Date(endMs);
        const now = new Date();
        const isToday =
            endDate.getFullYear() === now.getFullYear() &&
            endDate.getMonth() === now.getMonth() &&
            endDate.getDate() === now.getDate();

        const spansMultiYear =
            totalSpanMs > 365 * dayMs ||
            startDate.getFullYear() !== new Date(latestTimeMs).getFullYear();

        const fmtOpts: Intl.DateTimeFormatOptions = spansMultiYear
            ? { month: 'short', day: 'numeric', year: '2-digit' }
            : { month: 'short', day: 'numeric' };
        const fmt = new Intl.DateTimeFormat('en-US', fmtOpts);

        const sameDay =
            startDate.getFullYear() === endDate.getFullYear() &&
            startDate.getMonth() === endDate.getMonth() &&
            startDate.getDate() === endDate.getDate();

        if (sameDay) {
            return isToday ? 'Today' : fmt.format(startDate);
        }
        return `${fmt.format(startDate)} – ${fmt.format(endDate)}`;
    }

    private formatDefaultSubtitle(node: MJBurstClusterNode<T>): string {
        if (node.IsZoomableEra && this.AllowZoom) {
            return 'Click to zoom in';
        }
        const createCount = node.CategoryCounts['create'] ?? node.CategoryCounts['Create'] ?? 0;
        if (node.TotalCount === 1 && createCount === 1) {
            return 'Initial creation';
        }
        const parts: string[] = [];
        for (const cat of this.ResolvedCategories) {
            const count = node.CategoryCounts[cat.Key] ?? 0;
            if (count <= 0) continue;
            const singular = cat.SingularLabel ?? cat.Label.toLowerCase();
            const plural = cat.PluralLabel ?? `${singular}s`;
            parts.push(`${count} ${count === 1 ? singular : plural}`);
        }
        return parts.join(', ') || `${node.TotalCount} ${node.TotalCount === 1 ? this.ItemSingularNoun : this.ItemPluralNoun}`;
    }

    private formatDefaultTooltip(node: MJBurstClusterNode<T>): string {
        const parts: string[] = [];
        for (const cat of this.ResolvedCategories) {
            const count = node.CategoryCounts[cat.Key] ?? 0;
            if (count <= 0) continue;
            const singular = cat.SingularLabel ?? cat.Label.toLowerCase();
            const plural = cat.PluralLabel ?? `${singular}s`;
            parts.push(`${count} ${count === 1 ? singular : plural}`);
        }
        const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
        const zoomHint = node.IsZoomableEra && this.AllowZoom ? ' — Click to zoom into this period' : '';
        return `${node.Label}: ${node.TotalCount} ${node.TotalCount === 1 ? this.ItemSingularNoun : this.ItemPluralNoun}${detail}${zoomHint}`;
    }

    private formatQuietGapLabel(gapMs: number): string | null {
        const hourMs = 3_600_000;
        const dayMs = 24 * hourMs;
        if (gapMs < Math.max(0, this.MinGapQuietHours) * hourMs) {
            return null;
        }
        const days = Math.round(gapMs / dayMs);
        if (days >= 365) {
            const yrs = +(days / 365).toFixed(1);
            return `${yrs}y quiet`;
        }
        if (days >= 45) {
            const mos = Math.round(days / 30);
            return `${mos} mos quiet`;
        }
        return `${days}d quiet`;
    }

    private formatTotalSpanLabel(totalSpanMs: number): string {
        const dayMs = 86_400_000;
        const days = Math.round(totalSpanMs / dayMs);
        if (days <= 1) return 'same day';
        if (days >= 365) {
            const yrs = +(days / 365).toFixed(1);
            return `${yrs} yr span`;
        }
        if (days >= 45) {
            const mos = Math.round(days / 30);
            return `${mos} mos span`;
        }
        return `${days}d span`;
    }

    private toEpochMs(value: Date | number | string): number {
        if (typeof value === 'number') return value;
        if (value instanceof Date) return value.getTime();
        return new Date(value).getTime();
    }

    private emitFilterChanged(): void {
        const selected = this.SelectedCluster;
        const zoom = this.ActiveZoomBreadcrumb;
        const ids = this.GetSelectedIDs();
        const items = this.GetSelectedItems();
        const label = selected?.Label ?? zoom?.Label ?? null;
        this.FilterChanged.emit(new MJBurstFilterChangedEventArgs<T>(selected, zoom, ids, items, label));
    }
}
