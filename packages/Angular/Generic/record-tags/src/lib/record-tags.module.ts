import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecordTagsComponent } from './record-tags.component';
import { MjSlidePanelComponent } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';

@NgModule({
    declarations: [
        RecordTagsComponent
    ],
    imports: [
        CommonModule,
        MjSlidePanelComponent,
        SharedGenericModule,
        MJWordCloudComponent
    ],
    exports: [
        RecordTagsComponent
    ]
})
export class RecordTagsModule { }
