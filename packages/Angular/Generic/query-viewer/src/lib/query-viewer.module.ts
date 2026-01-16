import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// AG Grid
import { AgGridModule } from 'ag-grid-angular';

// MJ Components
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ExportServiceModule } from '@memberjunction/ng-export-service';

// Query Viewer Components
import { QueryDataGridComponent } from './query-data-grid/query-data-grid.component';
import { QueryParameterFormComponent } from './query-parameter-form/query-parameter-form.component';
import { QueryViewerComponent } from './query-viewer/query-viewer.component';

/**
 * Prevents tree-shaking of the QueryViewer module.
 * Import this in your application's module to ensure components are available.
 */
export function LoadQueryViewerModule() {
    // This function exists to prevent tree-shaking
}

@NgModule({
    declarations: [
        QueryDataGridComponent,
        QueryParameterFormComponent,
        QueryViewerComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        AgGridModule,
        SharedGenericModule,
        ExportServiceModule
    ],
    exports: [
        QueryDataGridComponent,
        QueryParameterFormComponent,
        QueryViewerComponent
    ]
})
export class QueryViewerModule { }
