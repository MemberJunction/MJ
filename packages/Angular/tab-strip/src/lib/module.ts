import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

// LOCAL
import { MJTabStripComponent } from './tab-strip/tab-strip.component';
import { MJTabBodyComponent } from './tab-body/tab-body.component';
import { MJTabComponent } from './tab/tab.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

@NgModule({
  declarations: [
    MJTabStripComponent,
    MJTabBodyComponent,
    MJTabComponent
  ],
  imports: [
    CommonModule,
    ContainerDirectivesModule,
  ],
  exports: [
    MJTabStripComponent,
    MJTabBodyComponent,
    MJTabComponent
  ]
})
export class MJTabStripModule { }