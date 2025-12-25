import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ERDDiagramComponent } from './components/erd-diagram.component';

/**
 * Module for the Entity Relationship Diagram (ERD) visualization component.
 *
 * This module provides a generic, reusable ERD component that can visualize
 * entity relationships using D3.js force-directed graphs.
 *
 * @example
 * ```typescript
 * import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
 *
 * @NgModule({
 *   imports: [EntityRelationshipDiagramModule]
 * })
 * export class MyModule {}
 * ```
 */
@NgModule({
  declarations: [
    ERDDiagramComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    ERDDiagramComponent
  ]
})
export class EntityRelationshipDiagramModule {}
