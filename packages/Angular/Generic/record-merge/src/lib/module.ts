import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { RecordMergePanelComponent } from './record-merge-panel.component';

@NgModule({
    declarations: [
        RecordMergePanelComponent
    ],
    imports: [
        CommonModule,
        SharedGenericModule
    ],
    exports: [
        RecordMergePanelComponent
    ]
})
export class RecordMergeModule { }
