import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJEmptyStateComponent, MJAccordionModule } from '@memberjunction/ng-ui-components';

import { MjRecordMicroViewComponent } from './record-micro-view/record-micro-view.component';
import { MjLabelCreateComponent } from './label-create/label-create.component';
import { MjLabelDetailComponent } from './label-detail/label-detail.component';

@NgModule({
    declarations: [
        MjRecordMicroViewComponent,
        MjLabelCreateComponent,
        MjLabelDetailComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        SharedGenericModule,
        MJEmptyStateComponent,
        MJAccordionModule
    ],
    exports: [
        MjRecordMicroViewComponent,
        MjLabelCreateComponent,
        MjLabelDetailComponent
    ]
})
export class VersionsModule {}
