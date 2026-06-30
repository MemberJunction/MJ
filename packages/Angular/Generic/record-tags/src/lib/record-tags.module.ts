import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecordTagsComponent } from './record-tags.component';
import { MjSlidePanelComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
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
        MJWordCloudComponent,
        MJEmptyStateComponent
    ],
    exports: [
        RecordTagsComponent
    ]
})
export class RecordTagsModule { }
