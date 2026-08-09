import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { RunViewParams } from '@memberjunction/core';
import { GridColumnConfig, computeFieldsList } from '@memberjunction/ng-entity-viewer';

/**
 * Grid Width Lab — a live fixture for `<mj-entity-data-grid>`'s width + column contract.
 *
 * This exists because that contract is public API with **no in-tree consumer**: `[FillWidth]`,
 * `width: 'auto'` + `maxWidth`, and the host-`[Columns]` precedence rules are all exercised only by
 * a downstream app, so a regression in any of them would ship silently. Every control below maps to
 * a specific failure that has actually occurred, and each one is *silent* in production — a column
 * that renders but never fetched, a declared width that stops applying after a filter click, a table
 * that stops short of its card edge. Making them visible in one place is the whole point.
 *
 * The Fields readout is the important half. Most of what this contract gets wrong is invisible in
 * the rendered grid — the query is where the damage shows — so the panel prints the exact array
 * `computeFieldsList` hands to RunView for the current column set.
 *
 * 🚨 SAFETY BOUNDARY: deliberately UNWIRED from agent context and client tools, on the same
 * reasoning as the GraphQL Console — this is a developer fixture, not a data surface, and its state
 * (a hardcoded entity and some layout toggles) is meaningless to an agent. It reads one always-
 * present metadata entity and mutates nothing.
 */
@RegisterClass(BaseResourceComponent, 'GridWidthLabInspector')
@Component({
    standalone: false,
    selector: 'mj-grid-width-lab',
    templateUrl: './grid-width-lab.component.html',
    styleUrls: ['./inspector-shared.css', './grid-width-lab.component.css']
})
export class GridWidthLabComponent extends BaseResourceComponent implements OnInit {
    /**
     * `Entities` — the one entity guaranteed to be populated in every MJ instance, and it happens to
     * carry exactly the field shapes this fixture needs: short codes, and a Description long enough
     * that an uncapped auto-width column visibly misbehaves.
     */
    public readonly EntityName = 'Entities';

    public FillWidth = true;
    public ShowHiddenColumn = false;
    public FilterOn = false;

    public Params: RunViewParams | null = null;
    public Columns: GridColumnConfig[] = [];
    public FieldsPreview: string[] = [];
    public FieldsError: string | null = null;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Grid Width Lab'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-arrows-left-right-to-line'; }

    public ngOnInit(): void {
        this.rebuild();
        this.NotifyLoadComplete();
    }

    /**
     * The fixture's column set. Each entry is a probe:
     *
     *  - **`name`, deliberately lower-case** where the entity says `Name`. The grid resolves host
     *    field names case-insensitively, so the column renders either way — but the fetch used to
     *    add the host's spelling to a case-sensitive set already holding the canonical one, putting
     *    the same field in the query twice. Watch the Fields readout, not the grid.
     *  - **`Description` at `width: 'auto'` with a `maxWidth`.** 'auto' maps to AG Grid flex; the cap
     *    is what stops "fill the row" becoming one enormous mostly-empty column. Both used to be
     *    dropped on the floor despite being public `GridColumnConfig` API.
     *  - **`BaseTable`, declared hidden.** Hidden is a display decision — the column stays in the
     *    grid's model and can be switched back on, so its data has to be fetched. It used to be
     *    excluded from the query, so re-showing it produced a column of empty cells.
     */
    private buildColumns(): GridColumnConfig[] {
        return [
            { field: 'name', title: 'Name (declared lower-case)', width: 220 },
            { field: 'SchemaName', title: 'Schema', width: 150 },
            { field: 'Description', title: 'Description (auto + maxWidth)', width: 'auto', maxWidth: 520 },
            { field: 'BaseTable', title: 'Base Table (starts hidden)', width: 200, visible: this.ShowHiddenColumn },
        ];
    }

    /**
     * Rebuild both inputs together. `Params` is re-assigned on every filter change in a real page,
     * which is exactly what used to destroy a host's declared columns — so the filter toggle here
     * deliberately hands the grid a NEW params object each time.
     */
    private rebuild(): void {
        this.Columns = this.buildColumns();
        this.Params = {
            EntityName: this.EntityName,
            ExtraFilter: this.FilterOn ? "SchemaName = '__mj'" : '',
        };
        this.refreshFieldsPreview();
        this.cdr.detectChanges();
    }

    /**
     * Print what the grid will actually SELECT. Mirrors the grid's own call: every declared column
     * regardless of visibility, resolved against entity metadata.
     */
    private refreshFieldsPreview(): void {
        this.FieldsError = null;
        try {
            const entity = this.ProviderToUse.EntityByName(this.EntityName);
            if (!entity) {
                this.FieldsError = `Entity "${this.EntityName}" not found in metadata.`;
                this.FieldsPreview = [];
                return;
            }
            this.FieldsPreview = computeFieldsList(entity, null, this.Columns.map(c => c.field));
        } catch (error) {
            this.FieldsError = error instanceof Error ? error.message : String(error);
            this.FieldsPreview = [];
        }
    }

    /** True when any two entries differ only by case — the duplicate-column bug, made checkable. */
    public get HasCaseDuplicate(): boolean {
        const lowered = this.FieldsPreview.map(f => f.toLowerCase());
        return new Set(lowered).size !== lowered.length;
    }

    public OnToggleFillWidth(): void {
        this.FillWidth = !this.FillWidth;
        this.cdr.detectChanges();
    }

    public OnToggleHiddenColumn(): void {
        this.ShowHiddenColumn = !this.ShowHiddenColumn;
        this.rebuild();
    }

    public OnToggleFilter(): void {
        this.FilterOn = !this.FilterOn;
        this.rebuild();
    }
}
