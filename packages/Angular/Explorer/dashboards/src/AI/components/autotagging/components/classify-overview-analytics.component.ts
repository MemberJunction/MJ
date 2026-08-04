/**
 * @fileoverview Classify · Overview Analytics (Phase 4 audit/analytics).
 *
 * KPI cards + three hand-rolled inline-SVG charts (tag distribution bar,
 * items-over-time line, weight histogram) for the classify dataset. All numbers
 * come from `ClassifyAnalyticsEngine` so agents and UI share one source of truth.
 *
 * The engine is framework-agnostic (server + client safe); this component simply
 * calls it with the current scope and the active metadata provider. Charts are
 * SVG built from typed view models — NO charting library.
 */
import {
    Component,
    Input,
    AfterViewInit,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    ClassifyAnalyticsEngine,
    ClassifyAnalyticsScope,
    ClassifyKPIs,
    TagDistributionEntry,
    ItemsOverTimeBucket,
    WeightHistogramBin,
} from '@memberjunction/tag-engine-base';
import { formatNumber, formatShortDate } from '../shared/classify.format';

/** A bar in the tag-distribution chart, pre-scaled to the chart width. */
interface DistributionBar {
    Tag: string;
    Count: number;
    WidthPct: number;
}

/** A point in the items-over-time line chart, in SVG coordinate space. */
interface LinePoint {
    X: number;
    Y: number;
    Label: string;
    Count: number;
}

/** A bar in the weight histogram, pre-scaled to the chart height. */
interface HistogramBar {
    Label: string;
    Count: number;
    HeightPct: number;
}

@Component({
    standalone: false,
    selector: 'classify-overview-analytics',
    templateUrl: './classify-overview-analytics.component.html',
    styleUrls: ['./classify-overview-analytics.component.css'],
})
export class ClassifyOverviewAnalyticsComponent extends BaseAngularComponent implements AfterViewInit {
    private cdr = inject(ChangeDetectorRef);

    async ngAfterViewInit(): Promise<void> {
        await this.Reload();
    }

    /** Number of distinct tags shown in the distribution chart. */
    private static readonly TAG_DISTRIBUTION_LIMIT = 12;
    /** Line-chart viewBox geometry. */
    private static readonly LINE_WIDTH = 600;
    private static readonly LINE_HEIGHT = 160;
    private static readonly LINE_PAD = 8;

    /** Optional analytics scope (source / content-type / date range). Re-loads on change. */
    private _scope: ClassifyAnalyticsScope | null = null;
    @Input()
    set Scope(value: ClassifyAnalyticsScope | null) {
        this._scope = value;
        if (this._loadedOnce) void this.Reload();
    }
    get Scope(): ClassifyAnalyticsScope | null {
        return this._scope;
    }

    public IsLoading = false;
    public HasData = false;

    public KPIs: ClassifyKPIs = { TotalItems: 0, TotalTags: 0, AvgTagsPerItem: 0, DistinctTags: 0 };

    public DistributionBars: DistributionBar[] = [];
    public LinePoints: LinePoint[] = [];
    public LinePath = '';
    public HistogramBars: HistogramBar[] = [];

    // Template-facing formatters + geometry constants
    public readonly FormatNumber = formatNumber;
    public readonly LineWidth = ClassifyOverviewAnalyticsComponent.LINE_WIDTH;
    public readonly LineHeight = ClassifyOverviewAnalyticsComponent.LINE_HEIGHT;

    private _loadedOnce = false;

    /** Load (or reload) all analytics for the current scope. Public entry point for the parent. */
    public async Reload(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();

        const engine = ClassifyAnalyticsEngine.Instance;
        const scope = this._scope ?? undefined;
        const user = this.ProviderToUse.CurrentUser;
        const provider = this.ProviderToUse;

        const [kpis, distribution, overTime, histogram] = await Promise.all([
            engine.GetKPIs(scope, user, provider),
            engine.GetTagDistribution(scope, user, provider, ClassifyOverviewAnalyticsComponent.TAG_DISTRIBUTION_LIMIT),
            engine.GetItemsOverTime('day', scope, user, provider),
            engine.GetWeightHistogram(10, scope, user, provider),
        ]);

        this.KPIs = kpis;
        this.buildDistribution(distribution);
        this.buildOverTime(overTime);
        this.buildHistogram(histogram);
        this.HasData = kpis.TotalTags > 0 || kpis.TotalItems > 0;

        this._loadedOnce = true;
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    private buildDistribution(entries: TagDistributionEntry[]): void {
        const max = entries.reduce((m, e) => Math.max(m, e.Count), 0) || 1;
        this.DistributionBars = entries.map(e => ({
            Tag: e.Tag,
            Count: e.Count,
            WidthPct: Math.round((e.Count / max) * 100),
        }));
    }

    private buildOverTime(buckets: ItemsOverTimeBucket[]): void {
        if (buckets.length === 0) {
            this.LinePoints = [];
            this.LinePath = '';
            return;
        }

        const w = ClassifyOverviewAnalyticsComponent.LINE_WIDTH;
        const h = ClassifyOverviewAnalyticsComponent.LINE_HEIGHT;
        const pad = ClassifyOverviewAnalyticsComponent.LINE_PAD;
        const max = buckets.reduce((m, b) => Math.max(m, b.Count), 0) || 1;
        const innerW = w - pad * 2;
        const innerH = h - pad * 2;
        const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;

        this.LinePoints = buckets.map((b, i) => {
            const x = pad + (buckets.length > 1 ? i * stepX : innerW / 2);
            const y = pad + innerH - (b.Count / max) * innerH;
            return { X: Math.round(x), Y: Math.round(y), Label: formatShortDate(b.BucketStart), Count: b.Count };
        });

        this.LinePath = this.LinePoints
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.X},${p.Y}`)
            .join(' ');
    }

    private buildHistogram(bins: WeightHistogramBin[]): void {
        const max = bins.reduce((m, b) => Math.max(m, b.Count), 0) || 1;
        this.HistogramBars = bins.map(b => ({
            Label: `${Math.round(b.RangeStart * 100)}`,
            Count: b.Count,
            HeightPct: Math.round((b.Count / max) * 100),
        }));
    }
}
