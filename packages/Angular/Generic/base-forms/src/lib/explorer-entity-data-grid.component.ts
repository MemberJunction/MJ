import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef, NgZone, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
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
        <mj-entity-data-grid
            #innerGrid
            [Params]="Params"
            [NewRecordValues]="NewRecordValues"
            [AllowLoad]="EffectiveAllowLoad"
            [ShowToolbar]="ShowToolbar"
            [Height]="Height"
            [ToolbarConfig]="ToolbarConfig"
            [SelectionMode]="SelectionMode"
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
    `]
})
export class ExplorerEntityDataGridComponent implements AfterViewInit, OnDestroy {
    @ViewChild('innerGrid') innerGrid!: EntityDataGridComponent;

    private elementRef = inject(ElementRef);
    private cdr = inject(ChangeDetectorRef);
    private ngZone = inject(NgZone);

    // Pass-through inputs from EntityDataGridComponent
    @Input() Params: RunViewParams | null = null;
    @Input() NewRecordValues: Record<string, unknown> = {};
    @Input() AllowLoad: boolean = true;
    @Input() ShowToolbar: boolean = true;
    @Input() Height: number | 'auto' | 'fit-content' = 'auto';
    @Input() ToolbarConfig: GridToolbarConfig = {};
    @Input() SelectionMode: GridSelectionMode = 'single';

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
        this._visibilityObserver?.disconnect();
        this._visibilityObserver = undefined;
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
        // Re-emit the event for any consumers
        this.AfterDataLoad.emit(event);
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
