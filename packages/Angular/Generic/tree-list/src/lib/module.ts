import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { SchedulerModule } from '@progress/kendo-angular-scheduler';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';

// LOCAL
import { TreelistComponent } from './component/treelist.component';

@NgModule({
  declarations: [
    TreelistComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule,
    ButtonsModule,
    EntityFormDialogModule,
    IndicatorsModule,
    LayoutModule, 
    SchedulerModule
  ],
  exports: [
    TreelistComponent
  ]
})
export class TimelineModule { }