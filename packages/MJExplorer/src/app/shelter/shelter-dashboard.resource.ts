import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RunView, RunViewParams } from '@memberjunction/core';

/**
 * MJ Academy — the shelter dashboard.
 *
 * A nav page like the grids: `ResourceType: 'Custom'` + a `DriverClass` naming a
 * BaseResourceComponent. That is also how MJ's own dashboards reach a rail -- e.g.
 * `@RegisterClass(BaseResourceComponent, 'RealtimeRecordingsDashboard')`. There is no Dashboard
 * metadata record involved, and no BaseDashboard subclass.
 *
 * THE READ-COST RULE, borrowed from bizapps-accounting's AccountingDashboardBase: no on-demand
 * heavy aggregates. Every number here is a FILTERED COUNT -- `MaxRows: 1` plus `TotalRowCount`,
 * which asks SQL for a count and transfers one row. That is cheap enough to run on every open,
 * which is why this needs no caching layer. Two numbers cannot be had that way, and each is
 * handled explicitly rather than quietly turned into a scan:
 *
 *  - CAPACITY is a SUM. Housing rows are few (one per kennel), so we read them and add up
 *    Capacity in the client. Honest at shelter scale; at ten thousand units it becomes a Query.
 *  - VACCINATION COMPLIANCE needs DISTINCT animals having a vaccination on file -- a join. We
 *    read the AnimalID column off vaccination care logs and de-duplicate in a Set. Same trade:
 *    fine here, and the point at which it should become a stored Query is worth naming in class.
 *
 * The status breakdown bar underneath costs NOTHING extra: every segment is a count the tile strip
 * already fetched, restacked as proportions.
 */

/** One tile. `Value` is null while loading so the tile shows a placeholder, never a wrong 0. */
interface ShelterStat {
    Id: string;
    Label: string;
    /** Pre-formatted for display -- "47 / 60" and "72%" are not plain counts. */
    Display: string | null;
    Detail: string;
    Icon: string;
    /** Says what the number MEANS, not just what it counts. Rendered as the tile's tooltip. */
    Tooltip: string;
    Warn?: boolean;
}

/** One segment of the status bar. */
interface StatusSegment {
    Status: string;
    Count: number;
    Tone: 'brand' | 'info' | 'warning' | 'success' | 'neutral';
}

/** A row in the overdue-follow-ups card. */
interface OverdueRow {
    ID: string;
    Animal: string;
    CareType: string;
    Description: string;
    FollowUpDate: string;
}

const ANIMALS = 'MJ: Animals';
const CARE_LOGS = 'MJ: Care Logs';
const HOUSINGS = 'MJ: Housings';

/** The whole Animal.Status value list, so the bar accounts for every animal rather than a subset. */
const ALL_STATUSES: { Status: string; Tone: StatusSegment['Tone'] }[] = [
    { Status: 'Intake', Tone: 'brand' },
    { Status: 'Available', Tone: 'success' },
    { Status: 'Hold', Tone: 'warning' },
    { Status: 'Adopted', Tone: 'info' },
    { Status: 'Transferred', Tone: 'neutral' },
];

/** Statuses that mean the animal is physically in our care right now. */
const IN_CARE = "Status IN ('Intake','Available','Hold')";

/** How many rows the overdue card shows. Small enough to stay a cheap top-N read. */
const LIST_ROWS = 5;

@RegisterClass(BaseResourceComponent, 'ShelterDashboard')
@Component({
    standalone: false,
    selector: 'shelter-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './shelter-dashboard.resource.html',
    styleUrls: ['./shelter-dashboard.resource.css'],
})
export class ShelterDashboardComponent extends BaseResourceComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    public Stats: ShelterStat[] = [];
    public Segments: StatusSegment[] = [];
    public SegmentTotal = 0;
    public Overdue: OverdueRow[] = [];
    public OverdueCount: number | null = null;
    public IsLoading = false;
    public LoadError: string | null = null;

    // `override`: BaseResourceComponent already declares ngOnInit (it starts the
    // NotifyLoadComplete watchdog there), so TS4114 requires the modifier. Call super() first --
    // dropping it would silently disable that watchdog.
    public override ngOnInit(): void {
        super.ngOnInit();
        void this.load();
    }

    public Refresh(): void {
        void this.load();
    }

    private async load(): Promise<void> {
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            // All independent reads -- run them together rather than stacking waits.
            const [statusCounts, housed, capacity, overdueCount, vaccinated, inCare, overdueRows] =
                await Promise.all([
                    this.statusCounts(),
                    this.count({ EntityName: ANIMALS, ExtraFilter: `${IN_CARE} AND HousingID IS NOT NULL` }),
                    this.totalCapacity(),
                    this.count({ EntityName: CARE_LOGS, ExtraFilter: this.overdueFilter() }),
                    this.distinctVaccinatedAnimals(),
                    this.count({ EntityName: ANIMALS, ExtraFilter: IN_CARE }),
                    this.overdueRows(),
                ]);

            this.Segments = statusCounts;
            this.SegmentTotal = statusCounts.reduce((sum, s) => sum + s.Count, 0);
            this.OverdueCount = overdueCount;
            this.Overdue = overdueRows;
            this.Stats = this.buildStats({ housed, capacity, overdueCount, vaccinated, inCare });
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Stats = [];
            this.Segments = [];
            this.Overdue = [];
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
            // MANDATORY: the shell's loading screen blocks on this, and a watchdog logs a warning
            // naming this class if it never arrives. In the finally block so a failed read still
            // releases the shell -- the error belongs on the page, not behind a spinner.
            this.NotifyLoadComplete();
        }
    }

    /** Count-only read: MaxRows 1 keeps the transfer to one row, TotalRowCount is the answer. */
    private async count(params: Omit<RunViewParams, 'MaxRows' | 'ResultType' | 'Fields'>): Promise<number> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView(
            { ...params, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
            this.ProviderToUse.CurrentUser,
        );
        if (!res.Success) throw new Error(res.ErrorMessage ?? `count failed for ${params.EntityName}`);
        return res.TotalRowCount ?? 0;
    }

    /**
     * Today as a date-only literal. CareLog.FollowUpDate is a DATE column, so comparing it to an
     * instant would make "overdue" depend on the browser's clock time as well as its day.
     */
    private todayISO(): string {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
            .toISOString()
            .slice(0, 10);
    }

    /** A follow-up is overdue when it was due before today and nobody has marked it complete. */
    private overdueFilter(): string {
        return `FollowUpDate IS NOT NULL AND FollowUpDate < '${this.todayISO()}' AND IsComplete = 0`;
    }

    /** One filtered count per Status value -- the whole value list, so the bar totals every animal. */
    private async statusCounts(): Promise<StatusSegment[]> {
        const counts = await Promise.all(
            ALL_STATUSES.map((s) =>
                this.count({ EntityName: ANIMALS, ExtraFilter: `Status='${s.Status}'` }),
            ),
        );
        return ALL_STATUSES.map((s, i) => ({ Status: s.Status, Count: counts[i], Tone: s.Tone }));
    }

    /** SUM(Capacity) over active units. Read-and-add in the client -- see the class note. */
    private async totalCapacity(): Promise<number> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<{ Capacity: number }>(
            {
                EntityName: HOUSINGS,
                ExtraFilter: 'IsActive = 1',
                Fields: ['Capacity'],
                ResultType: 'simple',
            },
            this.ProviderToUse.CurrentUser,
        );
        if (!res.Success) throw new Error(res.ErrorMessage ?? 'capacity read failed');
        return (res.Results ?? []).reduce((sum, r) => sum + (r.Capacity ?? 0), 0);
    }

    /** DISTINCT animals with a vaccination on file. De-duplicated client-side -- see the class note. */
    private async distinctVaccinatedAnimals(): Promise<number> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<{ AnimalID: string }>(
            {
                EntityName: CARE_LOGS,
                ExtraFilter: `CareType='Vaccination'`,
                Fields: ['AnimalID'],
                ResultType: 'simple',
            },
            this.ProviderToUse.CurrentUser,
        );
        if (!res.Success) throw new Error(res.ErrorMessage ?? 'vaccination read failed');
        return new Set((res.Results ?? []).map((r) => r.AnimalID)).size;
    }

    /** The overdue card's rows: one top-N read over the same population the tile counts. */
    private async overdueRows(): Promise<OverdueRow[]> {
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const res = await rv.RunView<OverdueRow>(
            {
                EntityName: CARE_LOGS,
                ExtraFilter: this.overdueFilter(),
                // Animal is denormalised onto the view by CodeGen -- never look the name up per row.
                Fields: ['ID', 'Animal', 'CareType', 'Description', 'FollowUpDate'],
                // ASC: the point of this card is the follow-up that has been waiting longest.
                OrderBy: 'FollowUpDate ASC',
                MaxRows: LIST_ROWS,
                ResultType: 'simple',
            },
            this.ProviderToUse.CurrentUser,
        );
        if (!res.Success) throw new Error(res.ErrorMessage ?? 'overdue rows read failed');
        return res.Results ?? [];
    }

    private buildStats(c: {
        housed: number;
        capacity: number;
        overdueCount: number;
        vaccinated: number;
        inCare: number;
    }): ShelterStat[] {
        const pct = c.inCare === 0 ? 0 : Math.round((c.vaccinated / c.inCare) * 100);
        return [
            {
                Id: 'occupancy',
                Label: 'Occupancy',
                Display: `${c.housed} / ${c.capacity}`,
                Detail: `${Math.max(c.capacity - c.housed, 0)} spaces open`,
                Icon: 'fa-solid fa-bed',
                Tooltip:
                    'Animals currently assigned to a unit, against the summed capacity of every active unit.',
            },
            {
                Id: 'in-care',
                Label: 'Animals in care',
                Display: String(c.inCare),
                Detail: 'Intake, Available or Hold',
                Icon: 'fa-solid fa-paw',
                Tooltip:
                    'Animals physically in our care. Excludes Adopted and Transferred, which have left the shelter.',
            },
            {
                Id: 'overdue',
                Label: 'Overdue follow-ups',
                Display: String(c.overdueCount),
                Detail: 'due before today, not complete',
                Icon: 'fa-solid fa-clock',
                Warn: c.overdueCount > 0,
                Tooltip:
                    'Care log entries whose follow-up date has passed and that nobody has marked complete.',
            },
            {
                Id: 'vaccination',
                Label: 'Vaccination compliance',
                Display: `${pct}%`,
                Detail: `${c.vaccinated} of ${c.inCare} in care`,
                Icon: 'fa-solid fa-shield-halved',
                Warn: pct < 80,
                Tooltip:
                    'Share of animals in care with at least one Vaccination care log on file. Not a schedule check -- one shot counts.',
            },
        ];
    }

    /** Segment width as a percentage of the whole population. Pure -- safe to call from the template. */
    public SegmentPercent(s: StatusSegment): number {
        return this.SegmentTotal === 0 ? 0 : (s.Count / this.SegmentTotal) * 100;
    }

    override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Dashboard';
    }

    override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-gauge-high';
    }
}
