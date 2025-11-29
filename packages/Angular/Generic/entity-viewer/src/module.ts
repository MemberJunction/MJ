import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { EntityGridComponent } from './lib/entity-grid/entity-grid.component';
import { EntityCardsComponent } from './lib/entity-cards/entity-cards.component';
import { EntityViewerComponent } from './lib/entity-viewer/entity-viewer.component';
import { PillComponent } from './lib/pill/pill.component';

/**
 * EntityViewerModule - Provides components for viewing entity data
 *
 * This module exports:
 * - EntityViewerComponent: Composite component with grid/cards toggle
 * - EntityGridComponent: AG Grid-based table view
 * - EntityCardsComponent: Card-based view
 * - PillComponent: Semantic color pills for categorical values
 *
 * @example
 * ```typescript
 * import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
 *
 * @NgModule({
 *   imports: [EntityViewerModule]
 * })
 * export class MyModule { }
 * ```
 */
@NgModule({
  declarations: [
    EntityGridComponent,
    EntityCardsComponent,
    EntityViewerComponent,
    PillComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    SharedGenericModule
  ],
  exports: [
    EntityGridComponent,
    EntityCardsComponent,
    EntityViewerComponent,
    PillComponent
  ]
})
export class EntityViewerModule { }
