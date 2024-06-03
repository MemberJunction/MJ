import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { LayoutModule } from '@progress/kendo-angular-layout';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';

// LOCAL
import { TimelineComponent } from './component/timeline.component';

@NgModule({
  declarations: [
    TimelineComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule,
    ButtonsModule,
    EntityFormDialogModule,
    IndicatorsModule,
    LayoutModule
  ],
  exports: [
    TimelineComponent
  ]
})
export class TimelineModule { }