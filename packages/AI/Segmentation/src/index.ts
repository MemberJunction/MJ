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
