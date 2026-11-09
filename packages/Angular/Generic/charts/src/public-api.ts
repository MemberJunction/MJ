/*
 * Public API Surface for @memberjunction/ng-charts
 */

export * from './lib/chart.types';
export * from './lib/bar-chart/bar-chart.component';
export * from './lib/area-chart/area-chart.component';
export * from './lib/donut-chart/donut-chart.component';

/**
 * Exists by MJ convention, so a consuming module can reference the package (and bundlers keep the
 * import). Unlike MJ's registration-based packages, these standalone components have no
 * `@RegisterClass` registrations to protect from tree-shaking (`sideEffects: false` is accurate).
 */
export function LoadMJCharts(): void {
    /* prevent tree-shaking */
}
