/**
 * `@memberjunction/video-studio-core`
 *
 * Shared, environment-agnostic TypeScript contracts for MemberJunction Video Studio.
 */

/**
 * Canonical schema version for `VideoGenerationSpec` documents.
 */
export const VIDEO_STUDIO_SPEC_VERSION = '1.0' as const;

export * from './archetype-types.js';
export * from './video-generation-spec.js';
export * from './render-contract.js';
