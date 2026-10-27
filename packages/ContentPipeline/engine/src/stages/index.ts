/**
 * Built-in stages.
 *
 * Importing this module fires the `@RegisterClass` decorators. Modern bundlers tree-shake classes
 * that are only ever instantiated through MJ's class factory — which is exactly how stages are
 * resolved — so a host calls {@link LoadContentPipelineStages} to force a static reference and keep
 * them in the bundle. Without it, `BasePipelineStage.Resolve` returns null and a Record Process
 * fails with "stage is not registered".
 */
export * from './NoOpStage.js';
export * from './DiscoverStage.js';
export * from './ExtractStage.js';
export * from './TagStage.js';
export * from './SegmentStage.js';
export * from './EmbedStage.js';
export * from './DeleteStage.js';

/** Static import target that keeps the built-in stages out of the bundler's tree-shaker. */
export function LoadContentPipelineStages(): void {
    // Intentionally empty — importing this module is what fires the decorators.
}
