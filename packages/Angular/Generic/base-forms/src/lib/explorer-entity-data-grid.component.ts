import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef, NgZone, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RunViewParams } from '@memberjunction/core';
import { FormRecordRefreshCoordinator } from './form-record-refresh.coordinator';
import {
    EntityDataGridComponent,
    AfterRowDoubleClickEventArgs,
    AfterRowClickEventArgs,
    AfterDataLoadEventArgs,
    GridToolbarConfig,
    GridSelectionMode,
    buildCompositeKey
} from '@memberjunction/ng-entity-viewer';
import { EntityInfo } from '@memberjunction/core';
import { FormNavigationEvent } from './types/navigation-events';
import { RELATED_GRID_DEFAULT_MAX_PX, RelatedGridHeightPx } from './related-grid-height';

/**
 * Wrapper for EntityDataGridComponent that emits navigation events on row double-click.
 * The host application subscribes to Navigate events and maps them to its routing system.
 *
 * This component is used by CodeGen for related entity grids in forms.
 */
@Component({
  standalone: false,
    selector: 'mj-explorer-entity-data-grid',
    template: `
        <!-- Related-entity / form-embedded grid: not a saved User View, so there's no canonical
             GridState to manage — suppress the "Manage Columns" chooser (AllowColumnToggle=false). -->
        <mj-entity-data-grid
            #innerGrid
            [Params]="Params"
            [NewRecordValues]="NewRecordValues"
            [AllowLoad]="EffectiveAllowLoad"
            [ShowToolbar]="EffectiveShowToolbar"
            [ShowSearch]="ShowSearch"
            [ShowNewButton]="ShowNewButton"
            [ShowRefreshButton]="ShowRefreshButton"
            [ShowExportButton]="ShowExportButton"
            [ShowDeleteButton]="ShowDeleteButton"
            [ShowCompareButton]="ShowCompareButton"
            [ShowMergeButton]="ShowMergeButton"
            [ShowAddToListButton]="ShowAddToListButton"
            [ShowDuplicateSearchButton]="ShowDuplicateSearchButton"
            [ShowCommunicationButton]="ShowCommunicationButton"
            [ShowRecycleBin]="ShowRecycleBin"
            [Height]="ResolvedHeight"
            [ToolbarConfig]="ToolbarConfig"
            [SelectionMode]="SelectionMode"
            [AllowColumnToggle]="false"
            (AfterRowDoubleClick)="onRowDoubleClick($event)"
            (AfterRowClick)="onRowClick($event)"
            (AfterDataLoad)="onDataLoad($event)"
            (NewRecordTabRequested)="onNewRecordTabRequested($event)">
        </mj-entity-data-grid>
    `,
    styles: [`
        :host {
            display: block;
            height: 100%;
            width: 100%;
        }
    `],
    host: {
        '[style.height]': 'hostHeightStyle',
    },
})
export class ExplorerEntityDataGridComponent implements AfterViewInit, OnDestroy {
    @ViewChild('innerGrid') innerGrid!: EntityDataGridComponent;

    private elementRef = inject(ElementRef);
    private cdr = inject(ChangeDetectorRef);
    private ngZone = inject(NgZone);
    private recordRefresh = inject(FormRecordRefreshCoordinator, { optional: true });
    private destroy$ = new Subject<void>();

    // Pass-through inputs from EntityDataGridComponent
    @Input() Params: RunViewParams | null = null;
    @Input() NewRecordValues: Record<string, unknown> = {};
    @Input() AllowLoad: boolean = true;
    @Input() ShowToolbar: boolean = true;

    /**
     * Existing generated forms still emit `[ShowToolbar]="false"` on related
     * grids. Inside a related-entity panel we restore the toolbar so search /
     * new / export / refresh come back without waiting for CodeGen.
     */
    get EffectiveShowToolbar(): boolean {
        if (this.ShowToolbar) return true;
        return this.isInsideRelatedEntityPanel();
    }

    /**
     * Related-entity accordion AND left-nav panels. Accordion used to leave
     * Height='auto' (100% of an auto-sized parent) so AG Grid's viewport
     * collapsed to 0 while the toolbar still showed "N rows".
     */
    private isInsideRelatedEntityPanel(): boolean {
        return this.findRelatedEntityPanel() != null;
    }

    private findRelatedEntityPanel(): HTMLElement | null {
        let el: HTMLElement | null = this.elementRef.nativeElement?.parentElement ?? null;
        while (el) {
            if (el.tagName?.toLowerCase() === 'mj-collapsible-panel'
                && el.getAttribute('data-variant') === 'related-entity') {
                return el;
            }
            el = el.parentElement;
        }
        return null;
    }
    /** Search box on the left of the toolbar. Default true. */
    @Input() ShowSearch: boolean = true;
    /** Forwarded to the inner grid. Defaults match `<mj-entity-data-grid>`. */
    @Input() ShowNewButton: boolean = true;
    @Input() ShowRefreshButton: boolean = true;
    @Input() ShowExportButton: boolean = true;
    @Input() ShowDeleteButton: boolean = false;
    @Input() ShowCompareButton: boolean = false;
    @Input() ShowMergeButton: boolean = false;
    @Input() ShowAddToListButton: boolean = false;
    @Input() ShowDuplicateSearchButton: boolean = false;
    @Input() ShowCommunicationButton: boolean = false;
    @Input() ShowRecycleBin: boolean = true;
    @Input() Height: number | 'auto' | 'fit-content' = 'auto';
    /**
     * When the grid sizes to its rows (left-nav related panels), this is the
     * cap. Content taller than the cap scrolls inside AG Grid — it does not
     * switch to paging. `null` means grow with the rows, no cap.
     */
    @Input() MaxHeight: number | null = RELATED_GRID_DEFAULT_MAX_PX;
    @Input() ToolbarConfig: GridToolbarConfig = {};
    @Input() SelectionMode: GridSelectionMode = 'single';

    /**
     * Related-entity grids (accordion and left-nav) and explicit fit-content grids
     * size to toolbar + header + rows instead of `height: 100%` of leftover / auto space.
     */
    private sizedHeightPx = RelatedGridHeightPx(0, this.MaxHeight);

    get ResolvedHeight(): number | 'auto' | 'fit-content' {
        return this.shouldSizeToRows() ? this.sizedHeightPx : this.Height;
    }

    get hostHeightStyle(): string {
        return this.shouldSizeToRows() ? `${this.sizedHeightPx}px` : '100%';
    }

    private shouldSizeToRows(): boolean {
        return this.Height === 'fit-content' || this.isInsideRelatedEntityPanel();
    }

    /**
     * When true (default), the inner grid does not fetch until this component's host
     * element first scrolls into the viewport. This prevents related-entity grids on a
     * form — which are always rendered in the DOM (the collapsible panel hides them via
     * CSS, not @if) — from firing a RunView on form open while they're collapsed or below
     * the fold. The first time the panel becomes visible (scrolled into view and expanded,
     * giving the host non-zero area), the grid loads with its normal spinner.
     * Set to false to restore eager loading for consumers that always want immediate data.
     */
    @Input() DeferLoadUntilVisible: boolean = true;

    /** True once the host has first intersected the viewport (or deferral is disabled / unsupported). */
    private _hasBeenVisible = false;
    private _visibilityObserver?: IntersectionObserver;

    /**
     * Effective AllowLoad passed to the inner grid: the form's AllowLoad AND
     * (deferral disabled OR the panel has been seen at least once).
     */
    get EffectiveAllowLoad(): boolean {
        return this.AllowLoad && (!this.DeferLoadUntilVisible || this._hasBeenVisible);
    }

    ngAfterViewInit(): void {
        this.subscribeToFormRefresh();
        if (!this.DeferLoadUntilVisible || typeof IntersectionObserver === 'undefined') {
            // Deferral off or unsupported environment — preserve eager-load behavior.
            this._hasBeenVisible = true;
            return;
        }

        // Observe outside Angular so scroll churn doesn't trigger change detection;
        // we re-enter the zone only on the one-shot "became visible" transition.
        this.ngZone.runOutsideAngular(() => {
            this._visibilityObserver = new IntersectionObserver(
                (entries) => {
                    if (entries.some(e => e.isIntersecting)) {
                        this.onBecameVisible();
                    }
                },
                // Small positive rootMargin pre-loads just before the panel scrolls fully into view.
                { root: null, rootMargin: '200px', threshold: 0 }
            );
            this._visibilityObserver.observe(this.elementRef.nativeElement);
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this._visibilityObserver?.disconnect();
        this._visibilityObserver = undefined;
    }

    /**
     * Reload this grid from the database. Used by the grid's own refresh
     * button and by the parent-form refresh broadcast.
     */
    public async Refresh(): Promise<void> {
        await this.innerGrid?.Refresh();
    }

    private subscribeToFormRefresh(): void {
        this.recordRefresh?.Refreshed$.pipe(takeUntil(this.destroy$)).subscribe(() => {
            void this.refreshIfLoaded();
        });
    }

    /**
     * Parent-form refresh fan-out: only reload grids that have already paid
     * for a RunView. Collapsed / never-seen related sections stay deferred.
     */
    private async refreshIfLoaded(): Promise<void> {
        if (!this._hasBeenVisible) {
            return;
        }
        await this.Refresh();
    }

    private onBecameVisible(): void {
        if (this._hasBeenVisible) {
            return;
        }
        // One-shot: once loaded we never need to observe again.
        this._visibilityObserver?.disconnect();
        this._visibilityObserver = undefined;
        this.ngZone.run(() => {
            this._hasBeenVisible = true;
            // Flip EffectiveAllowLoad → true, which drives the inner grid's AllowLoad setter to load.
            this.cdr.detectChanges();
        });
    }

    /**
     * When true, double-clicking a row emits a Navigate event.
     * Defaults to true.
     */
    @Input() NavigateOnDoubleClick: boolean = true;

    // Re-emit events for consumers who need them
    @Output() AfterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();
    @Output() AfterRowClick = new EventEmitter<AfterRowClickEventArgs>();
    @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();

    /** Emitted when a row is double-clicked and NavigateOnDoubleClick is true */
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    onRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
        // Re-emit the event for any consumers
        this.AfterRowDoubleClick.emit(event);

        // Emit navigation event if enabled
        if (this.NavigateOnDoubleClick && event.row) {
            // Use the inner grid's resolved EntityInfo - works for both ViewID and EntityName params
            const entityInfo = this.innerGrid?.EntityInfo;
            if (!entityInfo) return;

            const pkey = buildCompositeKey(event.row, entityInfo);

            this.Navigate.emit({
                Kind: 'record',
                EntityName: entityInfo.Name,
                PrimaryKey: pkey
            });
        }
    }

    onRowClick(event: AfterRowClickEventArgs): void {
        // Re-emit the event for any consumers
        this.AfterRowClick.emit(event);
    }

    onDataLoad(event: AfterDataLoadEventArgs): void {
        this.AfterDataLoad.emit(event);
        if (!this.shouldSizeToRows()) {
            return;
        }
        this.sizedHeightPx = RelatedGridHeightPx(event.loadedRowCount, this.MaxHeight);
        this.cdr.markForCheck();
    }

    /**
     * The inner grid's "New" button bubbles up here. We re-emit as a
     * `new-record` Navigate event so the host form (and Explorer's
     * SingleRecordComponent) can call NavigationService.OpenNewEntityRecord
     * and pre-populate the foreign-key fields from NewRecordValues.
     */
    onNewRecordTabRequested(event: { entityInfo: EntityInfo; defaultValues: Record<string, unknown> }): void {
        this.Navigate.emit({
            Kind: 'new-record',
            EntityName: event.entityInfo.Name,
            DefaultValues: event.defaultValues,
        });
    }
}
