/**
 * @memberjunction/ng-entity-viewer
 *
 * Angular components for viewing entity data in multiple formats.
 * Provides grid (AG Grid) and card views with filtering, selection, and shared data management.
 */

// Module
export * from './module';

// Types and Interfaces
export * from './lib/types';

// Components
export * from './lib/entity-cards/entity-cards.component';
export * from './lib/entity-viewer/entity-viewer.component';
export * from './lib/entity-record-detail-panel/entity-record-detail-panel.component';
export * from './lib/pill/pill.component';
export * from './lib/pagination/pagination.component';

// Entity Data Grid (modern AG Grid component with Before/After events)
export * from './lib/entity-data-grid/entity-data-grid.component';
export * from './lib/entity-data-grid/models/grid-types';
export * from './lib/entity-data-grid/events/grid-events';

// View Config Panel (sliding panel for view configuration)
export * from './lib/view-config-panel/view-config-panel.component';

// Utilities
export * from './lib/utils/highlight.util';
