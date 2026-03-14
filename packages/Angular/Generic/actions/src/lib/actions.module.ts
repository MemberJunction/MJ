import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ActionTestHarnessComponent } from './action-test-harness/action-test-harness.component';
import { ActionTestHarnessDialogComponent } from './action-test-harness-dialog/action-test-harness-dialog.component';
import { ActionParamDialogComponent } from './action-param-dialog/action-param-dialog.component';
import { ActionResultCodeDialogComponent } from './action-result-code-dialog/action-result-code-dialog.component';
import { UserDefinedTableCreatorComponent } from './user-defined-table-creator/user-defined-table-creator.component';
import { RsuStatusPanelComponent } from './rsu-status-panel/rsu-status-panel.component';

@NgModule({
    declarations: [
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionParamDialogComponent,
        ActionResultCodeDialogComponent,
        UserDefinedTableCreatorComponent,
        RsuStatusPanelComponent,
    ],
    imports: [
        CommonModule,
        FormsModule
    ],
    exports: [
        ActionTestHarnessComponent,
        ActionTestHarnessDialogComponent,
        ActionParamDialogComponent,
        ActionResultCodeDialogComponent,
        UserDefinedTableCreatorComponent,
        RsuStatusPanelComponent,
    ]
})
export class ActionsModule { }
