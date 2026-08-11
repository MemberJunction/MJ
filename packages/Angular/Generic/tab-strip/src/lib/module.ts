import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// LOCAL
import { MJTabStripComponent } from './tab-strip/tab-strip.component';
import { MJTabBodyComponent } from './tab-body/tab-body.component';
import { MJTabComponent } from './tab/tab.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
// The ARIA tabs keyboard contract, shared with the draft/workspace strip so the two cannot drift.
import { MJTabListDirective } from '@memberjunction/ng-ui-components';

@NgModule({
  declarations: [
    MJTabStripComponent,
    MJTabBodyComponent,
    MJTabComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule,
    MJTabListDirective,
  ],
  exports: [
    MJTabStripComponent,
    MJTabBodyComponent,
    MJTabComponent
  ]
})
export class MJTabStripModule { }