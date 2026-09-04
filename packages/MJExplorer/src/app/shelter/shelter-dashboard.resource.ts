import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { RunQuery, RunView, RunViewParams } from '@memberjunction/core';

/**
 * MJ Academy — the shelter dashboard.
 *
 * A nav page like the grids: `ResourceType: 'Custom'` + a `DriverClass` naming a
 * BaseResourceComponent. That is also how MJ's own dashboards reach a rail -- e.g.
 * `@RegisterClass(BaseResourceComponent, 'RealtimeRecordingsDashboard')`. There is no Dashboard
 * metadata record involved, and no BaseDashboard subclass.
 *
 * WHERE THE NUMBERS COME FROM, and why.
 *
 * Every figure on this page is an AGGREGATE, and an aggregate belongs in SQL. So the tiles and the
 * status bar are two stored Queries -- `Shelter Dashboard Stats` and `Animals By Status` -- run
 * together in one batched call. The server returns one row of scalars and one row per status; the
 * component formats them and does no arithmetic over records.
 *
 * This replaced eight RunView calls plus two client-side loops. The eight counts were not wrong --
 * a RunView with `ResultType: 'count_only'` issues a real `SELECT COUNT(*) ... WHERE` and transfers
 * no rows -- but two of the numbers could not be had that way at all:
 *
 *   - CAPACITY is a `SUM(Capacity)`. Doing it with RunView meant reading every housing row to the
 *     browser and adding them up in JavaScript.
 *   - VACCINATION COMPLIANCE is a `COUNT(DISTINCT AnimalID)` over a join. Same story: read every
 *     vaccination row, de-duplicate in a Set.
 *
 * Those two are the tell. Once a figure needs SUM, GROUP BY or DISTINCT, computing it in the client
 * means shipping the raw rows to do it -- which is fine at 14 animals and wrong at 14,000. Putting
 * ALL the stats in a Query rather than only the two awkward ones keeps one rule instead of a
 * judgement call per tile, and the dashboard reads as the aggregate view it actually is.
 *
 * The overdue LIST stays a RunView: those rows are real records a person might open, not an
 * aggregate, and `MaxRows: 5` over an indexed sort column is exactly what RunView is for.
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
    // No `GoTo`: the tiles are deliberately not links (see the CSS note on the hover lift).
}

/** One segment of the status bar. */
interface StatusSegment {
    Status: string;
    Count: number;
    Tone: 'brand' | 'info' | 'warning' | 'success' | 'neutral';
}

/** The single row returned by the `Shelter Dashboard Stats` Query. */
interface ShelterStatsRow {
    AnimalsInCare: number;
    Housed: number;
    Capacity: number;
    OverdueFollowUps: number;
    VaccinatedInCare: number;
}

/** One row of the `Animals By Status` Query. */
interface StatusCountRow {
    Status: string;
    AnimalCount: number;
}

/** A row in the overdue-follow-ups card. */
interface OverdueRow {
    ID: string;
    Animal: string;
    CareType: string;
    Description: string;
    FollowUpDate: string;
}

const CARE_LOGS = 'MJ: Care Logs';

/** The whole Animal.Status value list, so the bar accounts for every animal rather than a subset. */
const ALL_STATUSES: { Status: string; Tone: StatusSegment['Tone'] }[] = [
    { Status: 'Intake', Tone: 'brand' },
    { Status: 'Available', Tone: 'success' },
    { Status: 'Hold', Tone: 'warning' },
    { Status: 'Adopted', Tone: 'info' },
    { Status: 'Transferred', Tone: 'neutral' },
];

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
            // Both Queries in ONE batched round-trip, plus the list read alongside them.
            const rq = new RunQuery(this.ProviderToUse as never);
            const [queries, overdueRows] = await Promise.all([
                rq.RunQueries(
                    [{ QueryName: 'Shelter Dashboard Stats' }, { QueryName: 'Animals By Status' }],
                    this.ProviderToUse.CurrentUser,
                ),
                this.overdueRows(),
            ]);

            const [statsResult, statusResult] = queries;
            if (!statsResult?.Success) {
                throw new Error(statsResult?.ErrorMessage ?? 'Shelter Dashboard Stats failed.');
            }
            if (!statusResult?.Success) {
                throw new Error(statusResult?.ErrorMessage ?? 'Animals By Status failed.');
            }

            // One row of scalars. A Query that returns nothing is a failure to surface, not a zero
            // to display -- a dashboard of confident zeroes is worse than an error.
            const stats = (statsResult.Results ?? [])[0] as ShelterStatsRow | undefined;
            if (!stats) throw new Error('Shelter Dashboard Stats returned no rows.');

            this.Segments = this.mapStatusSegments((statusResult.Results ?? []) as StatusCountRow[]);
            this.SegmentTotal = this.Segments.reduce((sum, seg) => sum + seg.Count, 0);
            this.OverdueCount = Number(stats.OverdueFollowUps ?? 0);
            this.Overdue = overdueRows;
            this.Stats = this.buildStats(stats);
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

    /**
     * Maps the Query's rows onto the WHOLE Status value list, defaulting a missing status to zero.
     * GROUP BY only returns statuses that have animals, and a bar missing a segment would imply the
     * status does not exist rather than that it is currently empty.
     */
    /**
     * The overdue card's rows. This one stays a RunView, deliberately: these are real CareLog
     * records a person might open, not an aggregate, and a `MaxRows: 5` top-N over an indexed sort
     * column is exactly what RunView is for. Putting it in a Query would buy nothing and lose the
     * entity typing.
     */
    private async overdueRows(): Promise<OverdueRow[]> {
        // FollowUpDate is a DATE column, so "overdue" compares date-to-date. Building the literal
        // from UTC midnight keeps the boundary off the browser's clock time.
        const now = new Date();
        const todayISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
            .toISOString()
            .slice(0, 10);

        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const params: RunViewParams = {
            EntityName: CARE_LOGS,
            ExtraFilter:
                `FollowUpDate IS NOT NULL AND FollowUpDate < '${todayISO}' AND IsComplete = 0`,
            // Animal is denormalised onto the view by CodeGen -- never look the name up per row.
            Fields: ['ID', 'Animal', 'CareType', 'Description', 'FollowUpDate'],
            // ASC, not DESC: the point of this card is the follow-up waiting longest.
            OrderBy: 'FollowUpDate ASC',
            MaxRows: LIST_ROWS,
            ResultType: 'simple',
        };
        const res = await rv.RunView<OverdueRow>(params, this.ProviderToUse.CurrentUser);
        if (!res.Success) throw new Error(res.ErrorMessage ?? 'Could not read overdue follow-ups.');
        return res.Results ?? [];
    }

    private mapStatusSegments(rows: StatusCountRow[]): StatusSegment[] {
        const byStatus = new Map(rows.map((r) => [String(r.Status), Number(r.AnimalCount ?? 0)]));
        return ALL_STATUSES.map((s) => ({
            Status: s.Status,
            Count: byStatus.get(s.Status) ?? 0,
            Tone: s.Tone,
        }));
    }

    private buildStats(row: ShelterStatsRow): ShelterStat[] {
        const inCare = Number(row.AnimalsInCare ?? 0);
        const housed = Number(row.Housed ?? 0);
        const capacity = Number(row.Capacity ?? 0);
        const overdue = Number(row.OverdueFollowUps ?? 0);
        const vaccinated = Number(row.VaccinatedInCare ?? 0);
        const pct = inCare === 0 ? 0 : Math.round((vaccinated / inCare) * 100);

        return [
            {
                Id: 'occupancy',
                Label: 'Occupancy',
                Display: `${housed} / ${capacity}`,
                Detail: `${Math.max(capacity - housed, 0)} spaces open`,
                Icon: 'fa-solid fa-bed',
                Tooltip:
                    'Animals currently assigned to a unit, against the summed capacity of every active unit.',
            },
            {
                Id: 'in-care',
                Label: 'Animals in care',
                Display: String(inCare),
                Detail: 'Intake, Available or Hold',
                Icon: 'fa-solid fa-paw',
                Tooltip:
                    'Animals physically in our care. Excludes Adopted and Transferred, which have left the shelter.',
            },
            {
                Id: 'overdue',
                Label: 'Overdue follow-ups',
                Display: String(overdue),
                Detail: 'due before today, not complete',
                Icon: 'fa-solid fa-clock',
                Warn: overdue > 0,
                Tooltip:
                    'Care log entries whose follow-up date has passed and that nobody has marked complete.',
            },
            {
                Id: 'vaccination',
                Label: 'Vaccination compliance',
                Display: `${pct}%`,
                Detail: `${vaccinated} of ${inCare} in care`,
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
