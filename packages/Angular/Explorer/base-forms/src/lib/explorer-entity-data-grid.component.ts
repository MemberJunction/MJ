import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import {
    EntityDataGridComponent,
    AfterRowDoubleClickEventArgs,
    AfterRowClickEventArgs,
    AfterDataLoadEventArgs,
    GridToolbarConfig,
    GridSelectionMode
} from '@memberjunction/ng-entity-viewer';

/**
 * MJ Explorer wrapper for EntityDataGridComponent that provides Explorer-specific
 * navigation behavior. Double-clicking a row opens the record in a new tab using
 * SharedService.OpenEntityRecord.
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
     * When true, double-clicking a row opens the record in MJ Explorer.
     * Defaults to true.
     */
    @Input() NavigateOnDoubleClick: boolean = true;

    // Re-emit events for consumers who need them
    @Output() AfterRowDoubleClick = new EventEmitter<AfterRowDoubleClickEventArgs>();
    @Output() AfterRowClick = new EventEmitter<AfterRowClickEventArgs>();
    @Output() AfterDataLoad = new EventEmitter<AfterDataLoadEventArgs>();

    onRowDoubleClick(event: AfterRowDoubleClickEventArgs): void {
        // Re-emit the event for any consumers
        this.AfterRowDoubleClick.emit(event);

        // Navigate to the record if enabled
        if (this.NavigateOnDoubleClick && event.row) {
            const entity = event.row;
            const entityName = entity.EntityInfo?.Name;
            if (entityName) {
                const pkey = entity.PrimaryKey;
                SharedService.Instance.OpenEntityRecord(entityName, pkey);
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

/**
 * Tree-shaking prevention function - call this to ensure the component is included
 */
export function LoadExplorerEntityDataGridComponent(): void {
    // Reference the component to prevent tree-shaking
    const c = ExplorerEntityDataGridComponent;
}
