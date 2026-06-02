import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { RecordChangesComponent } from './ng-record-changes.component';
import { RestorePreviewPanelComponent } from './restore-preview-panel/restore-preview-panel.component';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { VersionsModule } from '@memberjunction/ng-versions';
import { MjSlidePanelComponent } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    RecordChangesComponent,
    RestorePreviewPanelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    VersionsModule,
    MjSlidePanelComponent
  ],
  exports: [
    RecordChangesComponent,
    RestorePreviewPanelComponent
  ]
})
export class RecordChangesModule {}
