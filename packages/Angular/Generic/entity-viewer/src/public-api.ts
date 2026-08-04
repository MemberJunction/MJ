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

// Entity Data Grid (modern AG Grid component with Before/After events)
export * from './lib/entity-data-grid/entity-data-grid.component';
export * from './lib/entity-data-grid/models/grid-types';
export * from './lib/entity-data-grid/events/grid-events';

// View Config Panel (sliding panel for view configuration)
export * from './lib/view-config-panel/view-config-panel.component';

// Aggregate Panel (card-based aggregate display)
export * from './lib/aggregate-panel/aggregate-panel.component';

// Aggregate Setup Dialog (3-mode dialog for configuring aggregates)
export * from './lib/aggregate-setup-dialog/aggregate-setup-dialog.component';

// Confirm Dialog (generic reusable confirmation dialog)
export * from './lib/confirm-dialog/confirm-dialog.component';

// Quick Save Dialog (focused view save modal)
export * from './lib/quick-save-dialog/quick-save-dialog.component';

// View Header (inline name edit, modified badge, save/revert actions)
export * from './lib/view-header/view-header.component';

// Duplicate View Dialog (modal for duplicating views with custom name)
export * from './lib/duplicate-view-dialog/duplicate-view-dialog.component';

// Shared View Warning Dialog (warning when saving shared views)
export * from './lib/shared-view-warning-dialog/shared-view-warning-dialog.component';

// View Selector (saved-view dropdown)
export * from './lib/view-selector/view-selector.component';

// View Workspace (composite: browse an entity's data across saved views)
export * from './lib/view-workspace/view-workspace.component';

// View Type Switcher (reusable dropdown for switching the active view type)
export * from './lib/view-type-switcher/view-type-switcher.component';

// Recycle Bin (slide-in for hard-deleted records, gated on entity Delete permission)
export * from './lib/recycle-bin/recycle-bin.component';
export * from './lib/recycle-bin/recycle-bin-chip.component';
export * from './lib/recycle-bin/events/recycle-bin-events';

// Utilities
export * from './lib/utils/highlight.util';
export * from './lib/utils/record.util';

// View-Type Plugin Architecture (contracts, engine, built-in descriptors)
export * from './lib/view-types';

// View-type renderer plug-ins (dynamic-mounted by the container) + their per-view config shapes.
// Exported so downstream apps can strongly type a view's `config` blob or register custom view types.
export * from './lib/view-types/renderers/grid-view-renderer.component';
export * from './lib/view-types/renderers/cards-view-renderer.component';
export * from './lib/view-types/renderers/timeline-view-renderer.component';
export * from './lib/view-types/renderers/map-view-renderer.component';

// Geo support exports
export const ENTITY_VIEWER_GEO_VERSION = 1;
