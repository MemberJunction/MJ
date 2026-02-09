import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { RunViewParams, CompositeKey } from '@memberjunction/core';
import {
    EntityDataGridComponent,
    AfterRowDoubleClickEventArgs,
    AfterRowClickEventArgs,
    AfterDataLoadEventArgs,
    GridToolbarConfig,
    GridSelectionMode
} from '@memberjunction/ng-entity-viewer';
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
            [AllowLoad]="AllowLoad"
            [ShowToolbar]="ShowToolbar"
            [Height]="Height"
            [ToolbarConfig]="ToolbarConfig"
            [SelectionMode]="SelectionMode"
            (AfterRowDoubleClick)="onRowDoubleClick($event)"
            (AfterRowClick)="onRowClick($event)"
            (AfterDataLoad)="onDataLoad($event)">
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
export class ExplorerEntityDataGridComponent {
    @ViewChild('innerGrid') innerGrid!: EntityDataGridComponent;

    // Pass-through inputs from EntityDataGridComponent
    @Input() Params: RunViewParams | null = null;
    @Input() NewRecordValues: Record<string, unknown> = {};
    @Input() AllowLoad: boolean = true;
    @Input() ShowToolbar: boolean = true;
    @Input() Height: number | 'auto' | 'fit-content' = 'auto';
    @Input() ToolbarConfig: GridToolbarConfig = {};
    @Input() SelectionMode: GridSelectionMode = 'single';

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
            const entity = event.row;
            const entityName = entity.EntityInfo?.Name;
            if (entityName) {
                const pkey: CompositeKey = entity.PrimaryKey;
                this.Navigate.emit({
                    Kind: 'record',
                    EntityName: entityName,
                    PrimaryKey: pkey,
                    OpenInNewTab: true
                });
            }
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
}
