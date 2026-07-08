// PUBLIC API SURFACE AREA
export * from './ExpoPushProvider';
export * from './config';

// Re-export credential types for convenience
export type { ExpoPushCredentials } from './ExpoPushProvider';

/**
 * Load-prevention export.
 *
 * Modern bundlers (ESBuild, Vite) tree-shake classes that are only ever
 * instantiated dynamically via MJ's `ClassFactory`. Calling this no-op function
 * from a consuming application forces a static reference to this module so the
 * `@RegisterClass`-decorated {@link ExpoPushProvider} is retained in the bundle.
 */
export function LoadExpoPushProvider(): void {
  // Intentionally empty — referencing this module prevents tree-shaking removal
  // of the @RegisterClass-decorated ExpoPushProvider.
}
