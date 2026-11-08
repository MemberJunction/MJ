/**
 * @fileoverview Public API surface of `@memberjunction/browser-extension-builder`.
 *
 * Exports:
 * - {@link ExtensionBrandProfileSchema} & {@link ValidateExtensionBrandProfile}
 * - {@link ExtensionBrandBuilder}, {@link BuildBrandedExtensionOptions}, {@link BuildBrandedExtensionResult}, {@link StampedExtensionManifest}
 * - {@link ParseMjExtBuildArgs} & {@link RunMjExtBuildCli}
 *
 * NOTE: For `ExtensionBrandProfile` and `RuntimeBrandKitHydrator`, import directly from
 * `@memberjunction/browser-extension-core`.
 */

export * from './BrandProfileSchema.js';
export * from './ExtensionBrandBuilder.js';
export * from './cli.js';
