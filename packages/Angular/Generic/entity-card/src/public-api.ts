/*
 * Public API Surface for @memberjunction/ng-entity-card
 */

export * from './lib/entity-card.component';
export * from './lib/entity-card.types';

/**
 * Tree-shaking prevention function. Call this from consuming modules
 * to ensure the component registration is not removed by bundlers.
 */
export function LoadEntityCard() {
    /* prevent tree-shaking */
}
