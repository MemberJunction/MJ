import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJAnimalEntity } from '@memberjunction/core-entities';
import { BaseEntity, RelatedRecordCollection, RunViewParams } from '@memberjunction/core';

/** One care entry, shaped for display. */
interface CareRow {
    ID: string;
    CareDate: string;
    CareType: string;
    Description: string;
    FollowUpDate: string | null;
    IsComplete: boolean;
}

/** The derived health picture. Every field here is something no column contains. */
interface CareSummary {
    Total: number;
    LastVaccination: string | null;
    LastExam: string | null;
    OverdueCount: number;
    NextFollowUp: string | null;
    /** Rows the action-item grid will show -- open follow-ups. Drives its height. */
    OpenCount: number;
}

const CARE_LOGS = 'MJ: Care Logs';

/**
 * MJ Academy — the Animal "Care & Health" overview.
 *
 * WHY THIS IS A CONTRIBUTION AND NOT PART OF THE CUSTOM FORM. Registered as a BaseFormPanel, this
 * mounts itself into the form and -- because a contribution is one of the only two things MJ gives
 * its own left-nav item -- it becomes a first-class rail entry once the form is in sidebar layout.
 * A generated field section can never do that: `resolve-form-chrome.ts` bundles EVERY field section
 * into one item titled "Details", with no per-section opt-out. So the rail's shape is decided by
 * what you contribute, not by how you name your field groups.
 *
 * WHY IT DOES NOT REPEAT THE CARE LOGS GRID. CodeGen already gives the form a full Care Logs grid
 * for free (the relationship carries `DisplayInForm = 1`, and the form container fills in any such
 * relationship the template did not bake). Restating those rows here would be duplication. What the
 * grid CANNOT do is answer "is this animal actually up to date?" -- that needs the newest
 * vaccination, the oldest unmet follow-up, and a count of what has lapsed. Those are derived from
 * the rows rather than stored in them, which is exactly the kind of thing a custom panel earns its
 * place with -- the same reason bizapps-orders' overview panels exist.
 *
 * ONE READ, not one per figure: the declared CareLogs collection returns the animal's care rows and
 * every number the panel shows is derived from that one array
 * below is computed from that array in memory.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJAnimals:care-overview',
    metadata: {
        entity: 'MJ: Animals',
        // after-fields puts it below the field panels and above the related grids, so the summary
        // reads before the detail it summarises.
        slot: 'after-fields',
        sortKey: 100,
        // MUST match the SectionKey on this panel's <mj-collapsible-panel>. The container derives
        // a contribution's rail key from contributionKey, then the chrome resolver matches that key
        // against each panel's SectionKey -- if they differ, the panel is treated as an ordinary
        // field section and silently folded into "Details" instead of getting its own rail item.
        // (A contributionKey of 'header' is skipped deliberately: headers never get a rail item.)
        contributionKey: 'care-overview',
        // 'Primary' means "do not fold me into Details or More" -- it is the opt-OUT switch, not
        // what creates the rail item. Being a contribution is what creates it.
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'shelter-animal-care-overview',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './animal-care-overview.panel.html',
    styleUrls: ['./animal-care-overview.panel.css'],
})
export class AnimalCareOverviewPanel extends BaseFormPanel<MJAnimalEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    public Summary: CareSummary | null = null;
    public IsLoading = false;
    public LoadError: string | null = null;

    public ngOnInit(): void {
        void this.load();
    }

    /** Today at UTC midnight, so "overdue" compares date-to-date and never shifts by timezone. */
    private todayUTC(): number {
        const n = new Date();
        return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    }

    private dayValue(iso: string | null): number | null {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }

    private async load(): Promise<void> {
        if (!this.Record?.ID) return;
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            // MODULE 7. One line, where module 5 had a hand-built read.
            //
            // Module 5 restated the relationship here: the filter (`AnimalID = ...`), the field
            // list, and the sort order -- every one a second copy of something the
            // EntityRelationship row already knew, and module 6's vaccination rule made a third.
            // Declaring the relationship as a related-record collection replaced all of it.
            //
            // `GetCompanion` is on BaseEntity, so the panel never has to know its record is an
            // Animal, and no cast is needed. `Load(true)` forces a re-read because the panel is
            // reused as the form moves between records, and a stale collection would render
            // confidently wrong numbers.
            const careLogs = this.Record.GetCompanion<RelatedRecordCollection>('CareLogs');
            if (!careLogs) throw new Error('The Care Logs collection is not declared on MJ: Animals.');
            await careLogs.Load(true);
            this.Summary = this.summarise(careLogs.Items);
        } catch (e) {
            this.LoadError = e instanceof Error ? e.message : String(e);
            this.Summary = null;
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** Everything the panel shows, derived from the one array. Rows arrive newest-first. */
    /**
     * `readonly` because that is what the collection hands out. MJ makes `Items` readonly
     * deliberately -- a caller cannot push or splice around the collection's back, which is exactly
     * the hole that made module 5's hand-built array unsafe to share.
     */
    private summarise(rows: readonly BaseEntity[]): CareSummary {
        const today = this.todayUTC();
        // Reading through Get() rather than typed accessors keeps this working whether the
        // collection hands back MJCareLogEntity or a plain BaseEntity, and matches how the
        // module 6 rules read the same rows.
        const day = (r: BaseEntity, f: string): string | null => {
            const v = r.Get(f);
            return v instanceof Date ? v.toISOString() : typeof v === 'string' && v ? v : null;
        };
        const newestOfType = (type: string): string | null => { const r = rows.find((x) => x.Get('CareType') === type); return r ? day(r, 'CareDate') : null; };

        const openFollowUps = rows
            .filter((r) => r.Get('IsComplete') !== true && day(r, 'FollowUpDate'))
            .map((r) => ({ row: r, day: this.dayValue(day(r, 'FollowUpDate')) }))
            .filter((x): x is { row: BaseEntity; day: number } => x.day !== null);

        // Oldest first, so the soonest-due (and most overdue) is the one we surface.
        openFollowUps.sort((a, b) => a.day - b.day);

        return {
            Total: rows.length,
            LastVaccination: newestOfType('Vaccination'),
            LastExam: newestOfType('Exam'),
            OverdueCount: openFollowUps.filter((x) => x.day < today).length,
            NextFollowUp: openFollowUps[0] ? day(openFollowUps[0].row, 'FollowUpDate') : null,
            OpenCount: openFollowUps.length,
        };
    }

    /**
     * The action-item grid: OPEN follow-ups for this animal, soonest first.
     *
     * Filtered rather than complete-history on purpose -- "all care logs" is already its own rail
     * item, so repeating it here would waste the most valuable position on the form. Sorting by
     * FollowUpDate ascending puts the most overdue entry at the top and upcoming ones below it,
     * which is a more useful order than a hard overdue-only filter: that would show an empty grid
     * on a well-managed animal and hide what is coming next.
     *
     * A getter, not a field, so it re-reads the record id if the form is pointed at another record.
     */
    public get ActionItemParams(): RunViewParams {
        return {
            EntityName: CARE_LOGS,
            ExtraFilter:
                `AnimalID = '${this.Record?.ID}' ` +
                `AND FollowUpDate IS NOT NULL AND IsComplete = 0`,
            // No `Fields` here on purpose. The grid computes its own field list via
            // `computeFieldsList` and overrides whatever we pass, so a list here controls nothing
            // -- and the COLUMNS come from `EntityField.DefaultInView`, not from this. Follow Up
            // Date shows because we set that flag in
            // metadata/entities/.harbor-shelter-form-chrome.json, which is the real lever.
            OrderBy: 'FollowUpDate ASC',
        };
    }

    /**
     * The grid is left on `Height="fit-content"` -- MJ's intended size-to-rows mode -- and we
     * accept that the last row is clipped in a narrow panel.
     *
     * The reason it clips: `RelatedGridHeightPx` budgets toolbar + header + rows + pad and nothing
     * for a horizontal scrollbar, which AG Grid lays out INSIDE that box. Filed as MJ #4223, with a
     * conditional (measured) allowance proposed rather than a flat constant.
     *
     * We deliberately do NOT hand-compute the height here. Copying MJ's four constants and adding
     * ~18px works today and then silently disagrees with the framework the moment #4223 lands --
     * and it would be a strange thing to teach. `Height="auto"` is not the alternative either:
     * MJ's own source records that it collapses AG Grid's viewport to 0 while the toolbar still
     * reports "N rows", which is exactly what we reproduced.
     *
     * So: one attribute, no duplicated constants, and the fix arrives for free on upgrade.
     */

    /**
     * Defaults for the grid's New button. The FK must be supplied by hand -- a grid has no idea it
     * belongs to an animal, so without this a new entry would be created unparented.
     */
    public get NewCareLogValues(): Record<string, unknown> {
        return { AnimalID: this.Record?.ID };
    }

    /** Routing belongs to the host form; the panel just forwards what the grid emits. */
    public OnGridNavigate(event: unknown): void {
        this.FormComponent?.OnFormNavigate?.(event as never);
    }

    /** True when the soonest open follow-up is already in the past. */
    public get NextFollowUpIsOverdue(): boolean {
        const d = this.dayValue(this.Summary?.NextFollowUp ?? null);
        return d !== null && d < this.todayUTC();
    }

    /** Care types get a stable tone so a type means the same colour here and on the dashboard. */
    public ToneFor(careType: string): string {
        switch (careType) {
            case 'Vaccination': return 'warn';
            case 'Surgery': return 'error';
            case 'Treatment': return 'info';
            case 'Behavioral': return 'violet';
            default: return '';
        }
    }
}
