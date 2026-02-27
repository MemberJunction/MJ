import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { MjSlidePanelComponent } from './panel/slide-panel.component';
import { MjRecordMicroViewComponent } from './record-micro-view/record-micro-view.component';
import { MjLabelCreateComponent } from './label-create/label-create.component';
import { MjLabelDetailComponent } from './label-detail/label-detail.component';

@NgModule({
    declarations: [
        MjSlidePanelComponent,
        MjRecordMicroViewComponent,
        MjLabelCreateComponent,
        MjLabelDetailComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule
    ],
    exports: [
        MjSlidePanelComponent,
        MjRecordMicroViewComponent,
        MjLabelCreateComponent,
        MjLabelDetailComponent
    ]
})
export class VersionsModule {}
