import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { ArchiveStatusBadgeComponent } from './archive-status/archive-status-badge.component';
import { ArchiveRestoreDialogComponent } from './archive-restore/archive-restore-dialog.component';
import { ArchiveConfigAdminComponent } from './archive-config/archive-config-admin.component';
import { ArchiveRunViewerComponent } from './archive-run-viewer/archive-run-viewer.component';

@NgModule({
  declarations: [
    ArchiveStatusBadgeComponent,
    ArchiveRestoreDialogComponent,
    ArchiveConfigAdminComponent,
    ArchiveRunViewerComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
  ],
  exports: [
    ArchiveStatusBadgeComponent,
    ArchiveRestoreDialogComponent,
    ArchiveConfigAdminComponent,
    ArchiveRunViewerComponent,
  ],
})
export class ArchiveManagerModule {}
