/*
 * Public API Surface of @memberjunction/ng-record-tags
 */

export * from './lib/record-tags.component';
export * from './lib/record-tags.module';

/**
 * Tree-shaking prevention function. Call from consuming modules
 * to ensure the component registration is not removed by bundlers.
 */
export function LoadRecordTags() {
    /* prevent tree-shaking */
}
