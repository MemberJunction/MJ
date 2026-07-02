import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJDialogComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';

import { ScheduledJobEditorComponent } from './panels/scheduled-job-editor/scheduled-job-editor.component';
import { ScheduledJobSummaryComponent } from './panels/scheduled-job-summary/scheduled-job-summary.component';
import { ScheduledJobSlidePanelComponent } from './slide-panel/scheduled-job-slide-panel.component';
import { ScheduledJobDialogComponent } from './dialogs/scheduled-job-dialog.component';

@NgModule({
    declarations: [
        ScheduledJobEditorComponent,
        ScheduledJobSummaryComponent,
        ScheduledJobSlidePanelComponent,
        ScheduledJobDialogComponent,
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule,
        MJDialogComponent,
        MJEmptyStateComponent,
    ],
    exports: [
        ScheduledJobEditorComponent,
        ScheduledJobSummaryComponent,
        ScheduledJobSlidePanelComponent,
        ScheduledJobDialogComponent,
    ],
})
export class SchedulingModule {}
