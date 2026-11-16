/**
 * Built-in content extractors.
 *
 * Importing this module fires their `@RegisterClass` decorators; a host calls
 * {@link LoadContentPipelineExtractors} to keep them out of the bundler's tree-shaker.
 */
export * from './PlainTextExtractor.js';
export * from './ArchiveExtractor.js';

/** Static import target that keeps the built-in extractors in the bundle. */
export function LoadContentPipelineExtractors(): void {
    // Intentionally empty — importing this module is what fires the decorators.
}
export * from './HtmlExtractor.js';
export * from './DocumentExtractor.js';
