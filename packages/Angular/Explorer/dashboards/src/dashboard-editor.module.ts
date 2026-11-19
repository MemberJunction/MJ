import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJStatBadgeComponent
} from '@memberjunction/ng-ui-components';
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

import { DashboardEditorComponent } from './DashboardEditor/dashboard-editor.component';
import { DashboardShareDialogComponent } from './DashboardBrowser/dashboard-share-dialog.component';

/**
 * Lightweight module containing only the Config dashboard editor and share dialog
 * needed eagerly by ExplorerCoreModule's DashboardResource.
 * Keeps CoreDashboardsModule (and its 40+ lazy dashboard classes) out of the initial shell bundle.
 */
@NgModule({
  declarations: [
    DashboardEditorComponent,
    DashboardShareDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJStatBadgeComponent,
    DashboardViewerModule,
    ResourcePermissionsModule
  ],
  exports: [
    DashboardEditorComponent,
    DashboardShareDialogComponent
  ]
})
export class DashboardEditorModule { }

export type { ShareDialogResult } from './DashboardBrowser/dashboard-share-dialog.component';
export { DashboardShareDialogComponent } from './DashboardBrowser/dashboard-share-dialog.component';
export { DashboardEditorComponent } from './DashboardEditor/dashboard-editor.component';
export { DashboardViewerFactory } from './DashboardEditor/dashboard-viewer-factory';
export * from './DashboardEditor/dashboard-editor.types';
