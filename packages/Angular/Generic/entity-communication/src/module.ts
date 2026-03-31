import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// Kendo UI Angular imports
import { ListBoxModule } from '@progress/kendo-angular-listbox';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';

// MJ UI Components
import { MjButtonDirective, MjWindowComponent } from '@memberjunction/ng-ui-components';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { EntityCommunicationsPreviewWindowComponent } from './lib/window.component';
import { EntityCommunicationsPreviewComponent } from './lib/preview.component';

@NgModule({
  declarations: [
    EntityCommunicationsPreviewComponent,
    EntityCommunicationsPreviewWindowComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule,
    MjButtonDirective,
    MjWindowComponent,
    ListBoxModule,
    IndicatorsModule,
    SharedGenericModule
  ],
  exports: [
    EntityCommunicationsPreviewComponent,
    EntityCommunicationsPreviewWindowComponent
  ]
})
export class EntityCommunicationsModule { }