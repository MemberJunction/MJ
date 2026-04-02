import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

// MJ UI Components
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';

// LOCAL
import { JoinGridComponent } from './join-grid/join-grid.component';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

@NgModule({
  declarations: [
    JoinGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    MJButtonDirective,
    MJDropdownComponent
  ],
  exports: [
    JoinGridComponent
  ]
})
export class JoinGridModule { }
