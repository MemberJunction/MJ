import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// MJ UI Components
import { MJButtonDirective, MJWindowComponent } from '@memberjunction/ng-ui-components';

import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule, MJSafeRichHtmlPipe } from '@memberjunction/ng-shared-generic';
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
    MJButtonDirective,
    MJWindowComponent,
    SharedGenericModule,
    MJSafeRichHtmlPipe
  ],
  exports: [
    EntityCommunicationsPreviewComponent,
    EntityCommunicationsPreviewWindowComponent
  ]
})
export class EntityCommunicationsModule { }