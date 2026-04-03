import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// AG Grid
import { AgGridModule } from 'ag-grid-angular';

// MJ Components
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { PaginationComponent } from '@memberjunction/ng-pagination';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';

// Query Viewer Components
import { QueryDataGridComponent } from './query-data-grid/query-data-grid.component';
import { QueryParameterFormComponent } from './query-parameter-form/query-parameter-form.component';
import { QueryViewerComponent } from './query-viewer/query-viewer.component';
import { QueryRowDetailComponent } from './query-row-detail/query-row-detail.component';
import { QueryInfoPanelComponent } from './query-info-panel/query-info-panel.component';

@NgModule({
    declarations: [
        QueryDataGridComponent,
        QueryParameterFormComponent,
        QueryViewerComponent,
        QueryRowDetailComponent,
        QueryInfoPanelComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        AgGridModule,
        SharedGenericModule,
        PaginationComponent,
        ExportServiceModule,
        MarkdownModule,
        CodeEditorModule
    ],
    exports: [
        QueryDataGridComponent,
        QueryParameterFormComponent,
        QueryViewerComponent,
        QueryRowDetailComponent,
        QueryInfoPanelComponent
    ]
})
export class QueryViewerModule { }
