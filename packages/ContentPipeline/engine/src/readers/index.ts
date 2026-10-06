/**
 * Built-in content readers.
 *
 * Importing this module fires their `@RegisterClass` decorators; a host calls
 * {@link LoadContentPipelineReaders} to keep them out of the bundler's tree-shaker.
 */
export * from './PlainTextReader.js';
export * from './ArchiveReader.js';

/** Static import target that keeps the built-in readers in the bundle. */
export function LoadContentPipelineReaders(): void {
    // Intentionally empty — importing this module is what fires the decorators.
}
export * from './HtmlReader.js';
