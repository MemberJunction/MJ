/**
 * @fileoverview Search Scope Selector Component
 *
 * Chip-group / dropdown selector that lets users pick one or more `MJ: Search Scopes`
 * to constrain a search. When nothing is selected (or "Global" is chosen), behavior
 * is identical to the pre-scope unconstrained search. Selection is emitted to the
 * parent which feeds it into `SearchRequest.ScopeIDs`.
 *
 * This component is intentionally **routing-agnostic**: the parent composite component
 * owns any URL/state sync. See `packages/Angular/Generic/CLAUDE.md`.
 *
 * @module @memberjunction/ng-search
 */

import {
    Component,
    EventEmitter,
    Input,
    Output,
    OnInit,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UUIDsEqual } from '@memberjunction/global';
import { SearchService } from './search.service';
import { SearchScopeInfo } from './search-types';

/**
 * Parent passes the current selection in via `SelectedScopeIDs` and listens for
 * `SelectionChange` events. The component also exposes a convenience `IsOpen`
 * flag for the dropdown panel.
 */
@Component({
    standalone: false,
    selector: 'mj-search-scope-selector',
    templateUrl: './search-scope-selector.component.html',
    styleUrls: ['./search-scope-selector.component.css']
})
export class SearchScopeSelectorComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    private searchService = inject(SearchService);

    /** Currently selected scope IDs (parent-owned state). */
    @Input() SelectedScopeIDs: string[] = [];

    /** Disables interaction (e.g., while a search is running). */
    @Input() Disabled: boolean = false;

    /** Emits whenever the selection changes. Parent should mirror into `SearchRequest.ScopeIDs`. */
    @Output() SelectionChange = new EventEmitter<string[]>();

    /** All scopes the current user can see. Populated via `SearchService.LoadScopes()`. */
    public AvailableScopes: SearchScopeInfo[] = [];

    /** Scopes owned by the current user (personal). */
    public PersonalScopes: SearchScopeInfo[] = [];

    /** Org-wide scopes. */
    public OrgScopes: SearchScopeInfo[] = [];

    /** The Global scope (shown separately as the default option). */
    public GlobalScope: SearchScopeInfo | null = null;

    /** Whether the dropdown panel is open. */
    public IsOpen: boolean = false;

    /** True while scopes are being loaded for the first time. */
    public IsLoading: boolean = false;

    private destroy$ = new Subject<void>();

    public async ngOnInit(): Promise<void> {
        this.IsLoading = true;
        try {
            await this.searchService.LoadScopes();
        } finally {
            this.IsLoading = false;
        }

        this.searchService.Scopes$
            .pipe(takeUntil(this.destroy$))
            .subscribe(scopes => {
                this.setScopes(scopes);
                this.cdr.markForCheck();
            });
    }

    public ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Toggle selection for a specific scope ID. The Global scope acts as a reset —
     * choosing it clears all other selections.
     */
    public ToggleScope(scope: SearchScopeInfo): void {
        if (this.Disabled) return;

        const isSelected = this.IsSelected(scope.ID);

        if (scope.IsGlobal) {
            // Global is mutually exclusive — selecting it clears all others.
            const next = isSelected ? [] : [scope.ID];
            this.SelectedScopeIDs = next;
            this.SelectionChange.emit(next);
            return;
        }

        let next: string[];
        if (isSelected) {
            next = this.SelectedScopeIDs.filter(id => !UUIDsEqual(id, scope.ID));
        } else {
            // Selecting a specific scope removes any Global selection.
            const withoutGlobal = this.SelectedScopeIDs.filter(id => {
                const s = this.AvailableScopes.find(x => UUIDsEqual(x.ID, id));
                return s && !s.IsGlobal;
            });
            next = [...withoutGlobal, scope.ID];
        }

        this.SelectedScopeIDs = next;
        this.SelectionChange.emit(next);
    }

    public IsSelected(scopeID: string): boolean {
        return this.SelectedScopeIDs.includes(scopeID);
    }

    /**
     * The current selection's display summary. Falls back to "Global" when no
     * explicit scope is selected.
     */
    public get SelectionLabel(): string {
        if (this.SelectedScopeIDs.length === 0) return 'Global';
        if (this.SelectedScopeIDs.length === 1) {
            const s = this.AvailableScopes.find(x => UUIDsEqual(x.ID, this.SelectedScopeIDs[0]));
            return s?.Name ?? 'Scoped';
        }
        return `${this.SelectedScopeIDs.length} scopes`;
    }

    public TogglePanel(): void {
        if (this.Disabled) return;
        this.IsOpen = !this.IsOpen;
    }

    public ClosePanel(): void {
        this.IsOpen = false;
    }

    /** Clear all selections (back to Global). */
    public ClearSelection(): void {
        if (this.Disabled) return;
        this.SelectedScopeIDs = [];
        this.SelectionChange.emit([]);
    }

    /**
     * The icon used on the selector button — falls back to a globe for Global, or
     * the first selected scope's icon for single-selection, or a generic magnifier
     * otherwise.
     */
    public get SelectionIcon(): string {
        if (this.SelectedScopeIDs.length === 0) return 'fa-solid fa-globe';
        if (this.SelectedScopeIDs.length === 1) {
            const s = this.AvailableScopes.find(x => UUIDsEqual(x.ID, this.SelectedScopeIDs[0]));
            return s?.Icon || 'fa-solid fa-filter';
        }
        return 'fa-solid fa-layer-group';
    }

    private setScopes(scopes: SearchScopeInfo[]): void {
        this.AvailableScopes = scopes;
        this.GlobalScope = scopes.find(s => s.IsGlobal) ?? null;
        this.PersonalScopes = scopes.filter(s => s.IsPersonal && !s.IsGlobal);
        this.OrgScopes = scopes.filter(s => !s.IsPersonal && !s.IsGlobal);
    }
}
