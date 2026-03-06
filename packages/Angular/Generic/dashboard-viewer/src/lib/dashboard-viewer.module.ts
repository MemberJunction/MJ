import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MJ Shared Components
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

// MJ Trees for hierarchical selection
import { NgTreesModule } from '@memberjunction/ng-trees';

// MJ Entity Viewer for displaying entity data in grid/cards/timeline
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

// MJ Query Viewer for displaying query results
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';

// MJ Artifacts for displaying conversation artifacts
import { ArtifactsModule } from '@memberjunction/ng-artifacts';

// Main Component
import { DashboardViewerComponent } from './dashboard-viewer/dashboard-viewer.component';

// Dialogs
import { AddPanelDialogComponent } from './dialogs/add-panel-dialog/add-panel-dialog.component';
import { EditPartDialogComponent } from './dialogs/edit-part-dialog/edit-part-dialog.component';

// Confirm Dialog (generic utility)
import { ConfirmDialogComponent } from './config-dialogs/confirm-dialog.component';

// Config Panels (pluggable form components for each part type)
import { WebURLConfigPanelComponent } from './config-panels/weburl-config-panel.component';
import { ViewConfigPanelComponent } from './config-panels/view-config-panel.component';
import { QueryConfigPanelComponent } from './config-panels/query-config-panel.component';
import { ArtifactConfigPanelComponent } from './config-panels/artifact-config-panel.component';

// Runtime Part Components (pluggable renderers for each part type)
import { WebURLPartComponent } from './parts/weburl-part.component';
import { ViewPartComponent } from './parts/view-part.component';
import { QueryPartComponent } from './parts/query-part.component';
import { ArtifactPartComponent } from './parts/artifact-part.component';

// Dashboard Browser Component (generic, no routing dependencies)
import { DashboardBrowserComponent } from './dashboard-browser/dashboard-browser.component';

// Breadcrumb Component (reusable navigation component)
import { DashboardBreadcrumbComponent } from './breadcrumb/dashboard-breadcrumb.component';

@NgModule({
    declarations: [
        // Main Component
        DashboardViewerComponent,

        // Dashboard Browser Component
        DashboardBrowserComponent,

        // Breadcrumb Component
        DashboardBreadcrumbComponent,

        // Generic Dialogs
        AddPanelDialogComponent,
        EditPartDialogComponent,
        ConfirmDialogComponent,

        // Config Panels (pluggable form components)
        // These are registered with @RegisterClass and loaded dynamically via ClassFactory
        WebURLConfigPanelComponent,
        ViewConfigPanelComponent,
        QueryConfigPanelComponent,
        ArtifactConfigPanelComponent,

        // Runtime Part Components (pluggable renderers)
        // These are registered with @RegisterClass and loaded dynamically via ClassFactory
        WebURLPartComponent,
        ViewPartComponent,
        QueryPartComponent,
        ArtifactPartComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule,
        NgTreesModule,
        EntityViewerModule,
        QueryViewerModule,
        ArtifactsModule
    ],
    exports: [
        // Main Component
        DashboardViewerComponent,

        // Dashboard Browser Component
        DashboardBrowserComponent,

        // Breadcrumb Component
        DashboardBreadcrumbComponent,

        // Generic Dialogs
        AddPanelDialogComponent,
        EditPartDialogComponent,
        ConfirmDialogComponent,

        // Config Panels - exported for potential direct use
        WebURLConfigPanelComponent,
        ViewConfigPanelComponent,
        QueryConfigPanelComponent,
        ArtifactConfigPanelComponent,

        // Runtime Part Components - exported for potential direct use
        WebURLPartComponent,
        ViewPartComponent,
        QueryPartComponent,
        ArtifactPartComponent
    ]
})
export class DashboardViewerModule { }
