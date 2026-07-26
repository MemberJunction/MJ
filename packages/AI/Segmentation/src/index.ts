/**
 * @memberjunction/ai-segmentation
 *
 * Pluggable content segmentation for RAG ingestion. Importing this package
 * registers every built-in segmenter with the MJ class factory, so
 * `BaseSegmenter.Resolve(key)` works for any of them.
 */
export * from './generic/Segmentation.types';
export * from './generic/BaseSegmenter';
export * from './generic/StructuralTextSegmenter';
export * from './generic/SemanticTextSegmenter';
export * from './generic/TranscriptSegmenter';
export * from './generic/FixedWindowSegmenter';
export * from './generic/SegmentationResolver';

/**
 * Load-prevention export.
 *
 * Modern bundlers (ESBuild, Vite) tree-shake classes that are only ever instantiated
 * dynamically through MJ's `ClassFactory` — which is exactly how segmenters are resolved.
 * If a built-in segmenter is dropped from the bundle, `BaseSegmenter.Resolve()` returns
 * null and `ResolveSegmenter()` silently degrades to the fallback strategy: content still
 * gets chunked, just by the wrong strategy, with no error to show for it.
 *
 * Call this no-op from the consuming application's bootstrap to force a static reference
 * so the `@RegisterClass`-decorated segmenters are retained.
 */
export function LoadContentSegmenters(): void {
    // Intentionally empty — importing this module is what fires the @RegisterClass
    // decorators; this function exists purely as a static import target.
}
