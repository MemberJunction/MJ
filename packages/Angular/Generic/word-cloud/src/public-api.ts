/*
 * Public API Surface for @memberjunction/ng-word-cloud
 */

export * from './lib/word-cloud.types';
export * from './lib/word-cloud.layout';
export * from './lib/word-cloud.component';

/**
 * Tree-shaking prevention function. Call this from consuming modules
 * to ensure the component registration is not removed by bundlers.
 */
export function LoadWordCloud() {
  /* prevent tree-shaking */
}
