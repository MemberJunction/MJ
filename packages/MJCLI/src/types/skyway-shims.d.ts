/**
 * Type shims for the multi-dialect Skyway refactor (0.6.x).
 *
 * The published @memberjunction/skyway-core (0.5.3) doesn't yet export
 * `DatabaseProvider` or `DatabaseDialect`. These are part of an in-progress
 * refactor in the separate Skyway repo that hasn't shipped to npm.
 *
 * This file augments @memberjunction/skyway-core with the missing type-only
 * exports so MJCLI compiles cleanly. The dialect-specific provider packages
 * (`@memberjunction/skyway-postgres`, `@memberjunction/skyway-sqlserver`) are
 * imported dynamically with `// @ts-expect-error`; runtime falls back to a
 * clear error if they aren't installed.
 *
 * Remove this file once @memberjunction/skyway-core 0.6.0 (and the
 * skyway-postgres / skyway-sqlserver packages) are published.
 */

// `export {}` makes this file a module so `declare module` becomes
// augmentation (additive) rather than replacement of @memberjunction/skyway-core.
export {};

declare module '@memberjunction/skyway-core' {
  export type DatabaseDialect = 'postgresql' | 'sqlserver';

  export interface DatabaseProvider {
    readonly Dialect: DatabaseDialect;
  }

  // Augment SkywayConfig with the optional Provider field added in 0.6.x.
  interface SkywayConfig {
    Provider?: DatabaseProvider;
  }
}
