import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

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
        DialogModule,
        ButtonsModule,
        SharedGenericModule,
    ],
    exports: [
        ScheduledJobEditorComponent,
        ScheduledJobSummaryComponent,
        ScheduledJobSlidePanelComponent,
        ScheduledJobDialogComponent,
    ],
})
export class SchedulingModule {}
