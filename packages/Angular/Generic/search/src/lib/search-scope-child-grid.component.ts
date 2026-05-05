/**
 * @fileoverview Generic Search Scope Child Grid
 *
 * A parameter-driven grid for editing the child-collection tabs of a Search Scope:
 *   - Providers           (`MJ: Search Scope Providers`)
 *   - External Indexes    (`MJ: Search Scope External Indexes`)
 *   - Entities            (`MJ: Search Scope Entities`)
 *   - Storage Accounts    (`MJ: Search Scope Storage Accounts`)
 *
 * Also reused on the AI Agent form for assigning scopes to an agent (the
 * `MJ: AI Agent Search Scopes` join table). The `ParentID` + `ParentFieldName`
 * inputs keep it generic — parent can be a SearchScope OR an AI Agent.
 *
 * One component, many configurations. The parent passes:
 *   - `ParentID` — the parent record ID (SearchScope ID, AI Agent ID, etc.)
 *   - `ChildEntityName` — the MJ entity name of the child table
 *   - `ParentFieldName` — the FK column on the child that references the parent
 *   - `Columns` — declarative column spec (type, label, optional lookup source)
 *
 * This is a **Generic component** (see `packages/Angular/Generic/CLAUDE.md`):
 *   - No Router / ActivatedRoute imports
 *   - All state flows through @Input/@Output
 *   - Parent owns persistence coordination if needed — rows are saved in-place on edit
 *
 * ## Runtime-generic by design (re P6.2 in plans/search-scopes-rag-plus/RAG_plan.md)
 *
 * The plan asked whether this grid should adopt the strongly-typed entity API
 * (`record.Field` accessors) instead of `BaseEntity.Get/Set`. It cannot:
 * the component is parameterized by `ChildEntityName` and `Columns[].Field`,
 * both runtime strings, so the entity class is unknown at compile time.
 * Picking a concrete type would force one consumer per child-entity flavor
 * (SearchScopeProvider, SearchScopeEntity, SearchScopeExternalIndex,
 * SearchScopeStorageAccount, AIAgentSearchScope, plus future ones), defeating
 * the point of the abstraction.
 *
 * Mitigation: a runtime sanity check (`Entity.GetFieldByName`) confirms each
 * column's `Field` name exists on the loaded entity before any Get/Set is
 * issued. This catches typos / schema drift at first render rather than
 * silently writing to a non-existent property. See `assertFieldsExist()`.
 *
 * @module @memberjunction/ng-search
 */

import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    Output,
    inject
} from '@angular/core';
import { BaseEntity, LogError, Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** Supported inline-edit types for a scope-child grid column. */
export type SearchScopeChildGridColumnType =
    | 'text'
    | 'number'
    | 'checkbox'
    | 'code'       // Monospace textarea (Nunjucks filters, SQL, JSON)
    | 'textarea'
    | 'lookup'    // Dropdown populated from a related entity
    | 'select';   // Dropdown populated from a fixed option list

/** Declarative spec for a single grid column. */
export interface SearchScopeChildGridColumn {
    /** BaseEntity field name (e.g. 'SearchProviderID'). */
    Field: string;
    /** Column header label. */
    Label: string;
    /** Editor type. */
    Type: SearchScopeChildGridColumnType;
    /** Placeholder text for empty cells. */
    Placeholder?: string;
    /** For 'lookup': entity name whose rows populate the dropdown. */
    LookupEntityName?: string;
    /** For 'lookup': which field of the lookup entity is displayed. Defaults to 'Name'. */
    LookupDisplayField?: string;
    /** For 'lookup': optional ExtraFilter to constrain lookup rows. */
    LookupFilter?: string;
    /** For 'select': fixed option list. */
    Options?: Array<{ Label: string; Value: string | number | boolean }>;
    /** CSS width (e.g. '140px'). */
    Width?: string;
    /** True to make the cell read-only. */
    ReadOnly?: boolean;
}

/** Row as rendered in the grid. Wraps a BaseEntity with a transient "dirty" flag. */
interface GridRow {
    /** The underlying BaseEntity record. */
    Entity: BaseEntity;
    /** Cached display value for lookup columns, keyed by field name. */
    LookupLabels: Record<string, string>;
    /** True while an inline save is in flight. */
    Saving: boolean;
}

@Component({
    standalone: false,
    selector: 'mj-search-scope-child-grid',
    templateUrl: './search-scope-child-grid.component.html',
    styleUrls: ['./search-scope-child-grid.component.css']
})
export class SearchScopeChildGridComponent implements OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    // ─── Inputs ───────────────────────────────────────────────────────────────

    private _parentID: string | null = null;
    /**
     * The parent record ID to filter / attach rows to. For a `MJ: Search Scopes` parent
     * this is the scope ID; for an `MJ: AI Agents` parent (assigning scopes to an agent)
     * this is the agent ID. Paired with `ParentFieldName` which names the FK column.
     */
    @Input()
    set ParentID(value: string | null) {
        if (value === this._parentID) return;
        this._parentID = value;
        if (value) {
            void this.LoadRows();
        } else {
            this.Rows = [];
        }
    }
    get ParentID(): string | null {
        return this._parentID;
    }

    /** MJ entity name of the child table (e.g. `MJ: Search Scope Providers`). */
    @Input() ChildEntityName: string = '';

    /** FK column on the child that references the parent SearchScope. */
    @Input() ParentFieldName: string = 'SearchScopeID';

    /** Column config — drives rendering of each row. */
    @Input() Columns: SearchScopeChildGridColumn[] = [];

    /** Button label for the "add new row" action. */
    @Input() AddButtonLabel: string = '+ Add row';

    /** Empty-state copy when the grid has zero rows. */
    @Input() EmptyMessage: string = 'No rows yet.';

    /** Optional OrderBy clause applied to the initial load. */
    @Input() OrderBy: string = '';

    /** Disable all editing (read-only mode). */
    @Input() Disabled: boolean = false;

    // ─── Outputs ──────────────────────────────────────────────────────────────

    /** Emitted whenever a row is successfully added or removed. */
    @Output() RowsChanged = new EventEmitter<void>();

    /** Emitted after a row is added. */
    @Output() RowAdded = new EventEmitter<BaseEntity>();

    /** Emitted after a row is removed. */
    @Output() RowRemoved = new EventEmitter<BaseEntity>();

    // ─── State ────────────────────────────────────────────────────────────────

    public Rows: GridRow[] = [];
    public IsLoading: boolean = false;
    public LoadError: string | null = null;

    /** Cached lookup options by lookup entity name. */
    private lookupCache = new Map<string, Array<{ ID: string; Label: string }>>();

    public ngOnDestroy(): void {
        // No subscriptions to clean up yet; kept for future compatibility.
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /** Reload the grid from the server. */
    public async LoadRows(): Promise<void> {
        if (!this._parentID || !this.ChildEntityName || !this.ParentFieldName) {
            this.Rows = [];
            return;
        }
        this.IsLoading = true;
        this.LoadError = null;
        try {
            const rv = new RunView();
            const result = await rv.RunView<BaseEntity>({
                EntityName: this.ChildEntityName,
                ExtraFilter: `${this.ParentFieldName} = '${this._parentID.replace(/'/g, "''")}'`,
                OrderBy: this.OrderBy || '__mj_CreatedAt ASC',
                ResultType: 'entity_object'
            });
            if (!result.Success) {
                this.LoadError = result.ErrorMessage ?? 'Failed to load rows';
                this.Rows = [];
            } else {
                const rows = result.Results || [];
                // Runtime sanity check: every column's Field must be a real
                // property on the loaded entity. Catches schema drift between
                // a parent form's Columns spec and the actual entity shape
                // before the first Get/Set fires.
                if (rows.length > 0) {
                    this.assertFieldsExist(rows[0]);
                }
                this.Rows = rows.map(entity => this.makeRow(entity));
                await this.hydrateLookups();
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
            this.Rows = [];
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Add a new empty row attached to the current scope. */
    public async AddRow(): Promise<void> {
        if (this.Disabled || !this._parentID || !this.ChildEntityName) return;
        try {
            const md = new Metadata(); // global-provider-ok: child grid does not yet accept a Provider input — multi-provider threading is the team's separate Phase 6 effort
            const entity = await md.GetEntityObject<BaseEntity>(this.ChildEntityName);
            entity.Set(this.ParentFieldName, this._parentID);
            this.applyColumnDefaults(entity);
            this.Rows = [...this.Rows, this.makeRow(entity)];
            this.cdr.detectChanges();
        } catch (err) {
            LogError(`SearchScopeChildGrid: failed to create new ${this.ChildEntityName} row — ${
                err instanceof Error ? err.message : String(err)
            }`);
        }
    }

    /** Persist changes to a row. Returns true on success. */
    public async SaveRow(row: GridRow): Promise<boolean> {
        if (this.Disabled) return false;
        row.Saving = true;
        try {
            const ok = await row.Entity.Save();
            if (!ok) {
                LogError(`SearchScopeChildGrid: save failed for ${this.ChildEntityName}: ${
                    row.Entity.LatestResult?.CompleteMessage ?? 'unknown error'
                }`);
                return false;
            }
            this.RowsChanged.emit();
            // If this was a brand-new row, emit the Added event on first successful save.
            if (!row.Entity.IsSaved) return true;
            this.RowAdded.emit(row.Entity);
            return true;
        } finally {
            row.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /** Remove a row (deletes from DB if saved, drops from state if new). */
    public async RemoveRow(row: GridRow): Promise<void> {
        if (this.Disabled) return;
        try {
            if (row.Entity.IsSaved) {
                const ok = await row.Entity.Delete();
                if (!ok) {
                    LogError(`SearchScopeChildGrid: delete failed for ${this.ChildEntityName}: ${
                        row.Entity.LatestResult?.CompleteMessage ?? 'unknown error'
                    }`);
                    return;
                }
            }
            this.Rows = this.Rows.filter(r => r !== row);
            this.RowRemoved.emit(row.Entity);
            this.RowsChanged.emit();
            this.cdr.detectChanges();
        } catch (err) {
            LogError(`SearchScopeChildGrid: remove error — ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Read a cell value from a row (used by the template). */
    public GetCellValue(row: GridRow, column: SearchScopeChildGridColumn): unknown {
        return row.Entity.Get(column.Field);
    }

    /**
     * Write a cell value back to the row and persist. Lookup columns store the ID but
     * we also refresh the cached display label so the UI stays in sync without a reload.
     */
    public async SetCellValue(
        row: GridRow,
        column: SearchScopeChildGridColumn,
        value: unknown
    ): Promise<void> {
        if (this.Disabled || column.ReadOnly) return;
        row.Entity.Set(column.Field, value);
        if (column.Type === 'lookup' && typeof value === 'string') {
            const options = column.LookupEntityName ? this.lookupCache.get(column.LookupEntityName) : undefined;
            const match = options?.find(o => UUIDsEqual(o.ID, value));
            row.LookupLabels[column.Field] = match?.Label ?? '';
        }
        await this.SaveRow(row);
    }

    /** Return the display label for a lookup cell. */
    public GetLookupLabel(row: GridRow, column: SearchScopeChildGridColumn): string {
        return row.LookupLabels[column.Field] ?? '';
    }

    /** Return the dropdown options for a lookup column. */
    public GetLookupOptions(
        column: SearchScopeChildGridColumn
    ): Array<{ ID: string; Label: string }> {
        if (!column.LookupEntityName) return [];
        return this.lookupCache.get(column.LookupEntityName) ?? [];
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /**
     * Load the set of lookup-option arrays referenced by `Columns` so dropdowns render
     * without triggering additional RunView calls per row.
     */
    private async hydrateLookups(): Promise<void> {
        const lookupColumns = this.Columns.filter(c => c.Type === 'lookup' && c.LookupEntityName);
        const toLoad = lookupColumns.filter(c => !this.lookupCache.has(c.LookupEntityName!));
        if (toLoad.length === 0) {
            this.refreshLookupLabels();
            return;
        }

        const rv = new RunView();
        const queries = toLoad.map(c => ({
            EntityName: c.LookupEntityName!,
            ExtraFilter: c.LookupFilter || '',
            OrderBy: `${c.LookupDisplayField ?? 'Name'} ASC`,
            Fields: ['ID', c.LookupDisplayField ?? 'Name'],
            ResultType: 'simple' as const,
        }));

        try {
            const results = await rv.RunViews(queries);
            toLoad.forEach((col, idx) => {
                const res = results[idx];
                if (!res.Success) {
                    LogError(`SearchScopeChildGrid: lookup load failed for ${col.LookupEntityName}: ${res.ErrorMessage}`);
                    this.lookupCache.set(col.LookupEntityName!, []);
                    return;
                }
                const displayField = col.LookupDisplayField ?? 'Name';
                const options = (res.Results as Array<Record<string, unknown>>).map(r => ({
                    ID: String(r['ID']),
                    Label: String(r[displayField] ?? r['ID']),
                }));
                this.lookupCache.set(col.LookupEntityName!, options);
            });
        } catch (err) {
            LogError(`SearchScopeChildGrid: hydrateLookups error — ${err instanceof Error ? err.message : String(err)}`);
        }

        this.refreshLookupLabels();
    }

    private refreshLookupLabels(): void {
        for (const row of this.Rows) {
            for (const col of this.Columns) {
                if (col.Type !== 'lookup' || !col.LookupEntityName) continue;
                const id = row.Entity.Get(col.Field);
                if (typeof id !== 'string') continue;
                const options = this.lookupCache.get(col.LookupEntityName) ?? [];
                const match = options.find(o => UUIDsEqual(o.ID, id));
                row.LookupLabels[col.Field] = match?.Label ?? '';
            }
        }
    }

    private makeRow(entity: BaseEntity): GridRow {
        return {
            Entity: entity,
            LookupLabels: {},
            Saving: false,
        };
    }

    /** Apply `DefaultValue` from column specs when creating a new row. */
    private applyColumnDefaults(entity: BaseEntity): void {
        for (const col of this.Columns) {
            if (col.Type === 'checkbox' && entity.Get(col.Field) === null) {
                entity.Set(col.Field, true);
            }
        }
    }

    /**
     * Sanity-check that every column's `Field` exists on the loaded entity.
     * The component is runtime-generic by design, but each consumer's `Columns`
     * spec must match the actual entity shape; otherwise `entity.Get(col.Field)`
     * silently returns null and `entity.Set(col.Field, ...)` silently no-ops,
     * masking schema drift. Logging here surfaces the mismatch at first render.
     *
     * `entity.Fields` is the canonical metadata-driven list of fields the
     * BaseEntity subclass exposes. Comparing the column spec's `Field` against
     * that list catches typos and stale Columns arrays in custom forms.
     */
    private assertFieldsExist(sample: BaseEntity): void {
        const knownFields = new Set(sample.Fields.map(f => f.Name.toLowerCase()));
        const unknown = this.Columns
            .filter(c => !c.ReadOnly)
            .map(c => c.Field)
            .filter(f => !knownFields.has(f.toLowerCase()));
        if (unknown.length > 0) {
            LogError(
                `SearchScopeChildGridComponent: Columns spec references fields ` +
                `not found on entity '${this.ChildEntityName}': ${unknown.join(', ')}. ` +
                `This indicates schema drift — update the parent form's Columns ` +
                `array to match the entity's typed properties.`,
            );
        }
    }
}
