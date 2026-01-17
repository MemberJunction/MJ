import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ Shared Components
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// MJ Trees for hierarchical selection
import { NgTreesModule } from '@memberjunction/ng-trees';

// Main Component
import { DashboardViewerComponent } from './dashboard-viewer/dashboard-viewer.component';

// Dialogs
import { AddPanelDialogComponent } from './dialogs/add-panel-dialog/add-panel-dialog.component';

// Config Dialogs
import { ConfirmDialogComponent } from './config-dialogs/confirm-dialog.component';
import { WebURLConfigDialogComponent } from './config-dialogs/weburl-config-dialog.component';
import { ViewConfigDialogComponent } from './config-dialogs/view-config-dialog.component';
import { QueryConfigDialogComponent } from './config-dialogs/query-config-dialog.component';
import { ArtifactConfigDialogComponent } from './config-dialogs/artifact-config-dialog.component';

// Config Panels (standalone form components)
import { WebURLConfigPanelComponent } from './config-panels/weburl-config-panel.component';
import { ViewConfigPanelComponent } from './config-panels/view-config-panel.component';
import { QueryConfigPanelComponent } from './config-panels/query-config-panel.component';
import { ArtifactConfigPanelComponent } from './config-panels/artifact-config-panel.component';

/**
 * Prevents tree-shaking of the DashboardViewer module.
 * Import this in your application's module to ensure components are available.
 */
export function LoadDashboardViewerModule() {
    // This function exists to prevent tree-shaking
}

@NgModule({
    declarations: [
        // Main Component
        DashboardViewerComponent,

        // Dialogs
        AddPanelDialogComponent,

        // Config Dialogs
        ConfirmDialogComponent,
        WebURLConfigDialogComponent,
        ViewConfigDialogComponent,
        QueryConfigDialogComponent,
        ArtifactConfigDialogComponent,

        // Config Panels (standalone form components)
        WebURLConfigPanelComponent,
        ViewConfigPanelComponent,
        QueryConfigPanelComponent,
        ArtifactConfigPanelComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule,
        NgTreesModule
    ],
    exports: [
        // Main Component
        DashboardViewerComponent,

        // Dialogs
        AddPanelDialogComponent,

        // Config Dialogs
        ConfirmDialogComponent,
        WebURLConfigDialogComponent,
        ViewConfigDialogComponent,
        QueryConfigDialogComponent,
        ArtifactConfigDialogComponent,

        // Config Panels (standalone form components)
        WebURLConfigPanelComponent,
        ViewConfigPanelComponent,
        QueryConfigPanelComponent,
        ArtifactConfigPanelComponent
    ]
})
export class DashboardViewerModule { }
