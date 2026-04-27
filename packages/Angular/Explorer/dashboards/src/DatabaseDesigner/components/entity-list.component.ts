/**
 * @module entity-list.component
 * @description Displays the list of entities accessible to the current user.
 *
 * Loaded from `DatabaseDesignerEngine.Instance.loadAccessibleEntities()` —
 * data access goes through the engine singleton, not this component directly,
 * so the cache is shared across wizard openings.
 */

import {
    Component, OnInit, OnDestroy, Output, EventEmitter,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { debounceTime, takeUntil, map } from 'rxjs/operators';

import { DatabaseDesignerEngine } from '../services/database-designer.engine.js';
import type { AccessibleEntity } from '../database-designer.types.js';

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortField = 'entityName' | 'tableName' | 'schemaName' | 'createdAt' | 'owner';
type SortDirection = 'asc' | 'desc';

@Component({
    standalone: false,
    selector: 'mj-database-entity-list',
    templateUrl: './entity-list.component.html',
    styleUrls: ['./entity-list.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityListComponent implements OnInit, OnDestroy {

    /** Emitted when the user clicks "Edit" on an entity row. */
    @Output() public readonly EditEntity = new EventEmitter<AccessibleEntity>();
    /** Emitted when the user clicks "View Details" on an entity row. */
    @Output() public readonly ViewEntity = new EventEmitter<AccessibleEntity>();
    /** Emitted when the user clicks "New Entity". */
    @Output() public readonly NewEntity = new EventEmitter<void>();

    public IsLoading = false;
    public ErrorMessage: string | null = null;

    /** Full unfiltered list from the engine. */
    private _allEntities: AccessibleEntity[] = [];

    /** Cached sorted unique schema names — recomputed only when _allEntities changes. */
    private _availableFilterSchemas: string[] = [];

    /** Currently displayed (filtered + sorted) rows. */
    public FilteredEntities: AccessibleEntity[] = [];

    private readonly _search$ = new BehaviorSubject<string>('');
    private readonly _schema$ = new BehaviorSubject<string>('');
    private readonly _sortField$ = new BehaviorSubject<SortField>('entityName');
    private readonly _sortDir$ = new BehaviorSubject<SortDirection>('asc');
    private readonly _destroy$ = new Subject<void>();

    private readonly cdr = inject(ChangeDetectorRef);

    // ─── Lifecycle ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.setupFilter();
        this.loadEntities();
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    // ─── Template bindings ─────────────────────────────────────────────────

    get SearchTerm(): string { return this._search$.value; }
    set SearchTerm(v: string) { this._search$.next(v); }

    get SelectedSchema(): string { return this._schema$.value; }
    set SelectedSchema(v: string) { this._schema$.next(v); }

    /** Unique schema names present in the loaded entity list, sorted alphabetically. */
    get AvailableFilterSchemas(): string[] { return this._availableFilterSchemas; }

    get SortField(): SortField { return this._sortField$.value; }
    get SortDirection(): SortDirection { return this._sortDir$.value; }

    /** Toggle sort: same field flips direction; new field defaults to asc. */
    public OnSortChange(field: SortField): void {
        if (this._sortField$.value === field) {
            this._sortDir$.next(this._sortDir$.value === 'asc' ? 'desc' : 'asc');
        } else {
            this._sortField$.next(field);
            this._sortDir$.next('asc');
        }
    }

    public OnEditEntity(entity: AccessibleEntity): void {
        this.EditEntity.emit(entity);
    }

    public OnViewEntity(entity: AccessibleEntity): void {
        this.ViewEntity.emit(entity);
    }

    public OnNewEntity(): void {
        this.NewEntity.emit();
    }

    public OnRefresh(): void {
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.loadEntities();
    }

    public TrackByEntityId(_: number, entity: AccessibleEntity): string {
        return entity.entityId;
    }

    public FormatDate(date: Date): string {
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    // ─── Private helpers ───────────────────────────────────────────────────

    private setupFilter(): void {
        combineLatest([this._search$, this._schema$, this._sortField$, this._sortDir$])
            .pipe(
                debounceTime(150),
                map(([search, schema, field, dir]) => this.applyFilterAndSort(search, schema, field, dir)),
                takeUntil(this._destroy$),
            )
            .subscribe(result => {
                this.FilteredEntities = result;
                this.cdr.markForCheck();
            });
    }

    private async loadEntities(): Promise<void> {
        this.IsLoading = true;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            this._allEntities = await DatabaseDesignerEngine.Instance.loadAccessibleEntities();
            this._availableFilterSchemas = [...new Set(this._allEntities.map(e => e.schemaName))].sort();
            // Trigger the combineLatest pipe to recalculate; reset schema filter if
            // the previously selected schema is no longer present in the new entity list.
            const schemas = this._availableFilterSchemas;
            if (this._schema$.value && !schemas.includes(this._schema$.value)) {
                this._schema$.next('');
            } else {
                this._search$.next(this._search$.value);
            }
        } catch (err) {
            this.ErrorMessage = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private applyFilterAndSort(search: string, schema: string, field: SortField, dir: SortDirection): AccessibleEntity[] {
        const term = search.trim().toLowerCase();
        let results = [...this._allEntities];

        if (schema) {
            results = results.filter(e => e.schemaName === schema);
        }

        if (term) {
            results = results.filter(e =>
                e.entityName.toLowerCase().includes(term) ||
                e.tableName.toLowerCase().includes(term) ||
                e.schemaName.toLowerCase().includes(term)
            );
        }

        results.sort((a, b) => {
            const aVal = this.sortValue(a, field);
            const bVal = this.sortValue(b, field);
            const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return dir === 'asc' ? cmp : -cmp;
        });

        return results;
    }

    private sortValue(entity: AccessibleEntity, field: SortField): string | number {
        switch (field) {
            case 'entityName':  return entity.entityName.toLowerCase();
            case 'tableName':   return entity.tableName.toLowerCase();
            case 'schemaName':  return entity.schemaName.toLowerCase();
            case 'createdAt':   return entity.createdAt.getTime();
            case 'owner':       return entity.isOwner ? 0 : 1;
            default:            return entity.entityName.toLowerCase();
        }
    }
}
