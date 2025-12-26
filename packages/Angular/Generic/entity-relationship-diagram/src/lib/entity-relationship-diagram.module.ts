import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutModule } from '@progress/kendo-angular-layout';

import { ERDDiagramComponent } from './components/erd-diagram.component';
import { MJEntityERDComponent } from './components/mj-entity-erd.component';
import { EntityDetailsComponent } from './components/entity-details/entity-details.component';
import { EntityFilterPanelComponent } from './components/entity-filter-panel/entity-filter-panel.component';
import { ERDCompositeComponent } from './components/erd-composite/erd-composite.component';

/**
 * Module for the Entity Relationship Diagram (ERD) visualization components.
 *
 * This module provides a complete suite of components for visualizing and
 * exploring entity relationships:
 *
 * ## Components
 *
 * ### 1. ERDDiagramComponent (`<mj-erd-diagram>`)
 * A generic, reusable ERD component that visualizes entity relationships using
 * D3.js force-directed graphs. It works with any data conforming to the `ERDNode`
 * interface and is completely decoupled from MemberJunction-specific types.
 *
 * ### 2. MJEntityERDComponent (`<mj-entity-erd>`)
 * A higher-level wrapper specifically for MemberJunction. It accepts `EntityInfo[]`
 * directly and handles all the transformation to ERD format automatically.
 *
 * ### 3. EntityDetailsComponent (`<mj-entity-details>`)
 * A detail panel that shows entity information, fields, and relationships when
 * an entity is selected. Designed to work alongside the ERD diagram.
 *
 * ### 4. EntityFilterPanelComponent (`<mj-entity-filter-panel>`)
 * A filter panel for filtering entities by schema, name, status, and base table.
 *
 * ### 5. ERDCompositeComponent (`<mj-erd-composite>`)
 * A complete, ready-to-use ERD exploration interface that combines:
 * - Left panel: Entity filter controls
 * - Center: Interactive ERD diagram
 * - Right panel: Entity details (shown when an entity is selected)
 *
 * ### Choosing Which Component to Use
 *
 * | Use Case | Component |
 * |----------|-----------|
 * | Complete ERD exploration UI | `<mj-erd-composite>` |
 * | ERD diagram with MJ EntityInfo | `<mj-entity-erd>` |
 * | Custom data sources (non-MJ) | `<mj-erd-diagram>` |
 * | Entity detail panel standalone | `<mj-entity-details>` |
 * | Entity filter panel standalone | `<mj-entity-filter-panel>` |
 *
 * @example Using the composite (recommended for dashboards)
 * ```html
 * <mj-erd-composite
 *   (userStateChange)="saveUserPreferences($event)"
 *   (openRecord)="navigateToRecord($event)">
 * </mj-erd-composite>
 * ```
 *
 * @example Using the MJ wrapper
 * ```html
 * <mj-entity-erd
 *   [entities]="[currentEntity]"
 *   [selectedEntityId]="currentEntity.ID"
 *   [depth]="1"
 *   (entitySelected)="onEntitySelected($event)"
 *   (openRecord)="onOpenRecord($event)">
 * </mj-entity-erd>
 * ```
 *
 * @example Using the generic component
 * ```html
 * <mj-erd-diagram
 *   [nodes]="myNodes"
 *   [selectedNodeId]="selectedId"
 *   (nodeSelected)="onNodeSelected($event)">
 * </mj-erd-diagram>
 * ```
 */
@NgModule({
  declarations: [
    ERDDiagramComponent,
    MJEntityERDComponent,
    EntityDetailsComponent,
    EntityFilterPanelComponent,
    ERDCompositeComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    LayoutModule
  ],
  exports: [
    ERDDiagramComponent,
    MJEntityERDComponent,
    EntityDetailsComponent,
    EntityFilterPanelComponent,
    ERDCompositeComponent
  ]
})
export class EntityRelationshipDiagramModule {}
