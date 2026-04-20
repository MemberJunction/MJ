import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

// MemberJunction modules
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { ListDetailGridComponent } from './lib/ng-list-detail-grid.component';

@NgModule({
  declarations: [
    ListDetailGridComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
    EntityViewerModule,
    SharedGenericModule
  ],
  exports: [
    ListDetailGridComponent
  ]
})
export class ListDetailGridModule { }
