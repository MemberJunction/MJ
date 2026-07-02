/**
 * View-Type Plugin Architecture — public surface.
 *
 * Exports the contracts, the engine, and the four built-in descriptors, plus a single
 * {@link LoadViewTypeDescriptors} guard that force-references every concrete descriptor so
 * bundlers (ESBuild/Vite) don't tree-shake their `@RegisterClass` side effects away.
 */
export * from './view-type.contracts';
export * from './view-type.engine';

export * from './descriptors/grid-view-type';
export * from './descriptors/cards-view-type';
export * from './descriptors/timeline-view-type';
export * from './descriptors/map-view-type';

import { LoadGridViewType } from './descriptors/grid-view-type';
import { LoadCardsViewType } from './descriptors/cards-view-type';
import { LoadTimelineViewType } from './descriptors/timeline-view-type';
import { LoadMapViewType } from './descriptors/map-view-type';

/**
 * Tree-shaking guard. Call this once (e.g. from the EntityViewer module or a host
 * bootstrap) to guarantee all four built-in view-type descriptors register themselves
 * with the ClassFactory. Safe to call multiple times.
 */
export function LoadViewTypeDescriptors(): void {
  LoadGridViewType();
  LoadCardsViewType();
  LoadTimelineViewType();
  LoadMapViewType();
}
