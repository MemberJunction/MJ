/**
 * MemberJunction Server Bootstrap
 *
 * Encapsulates all server initialization logic so MJAPI applications become minimal bootstrapping files.
 * This package provides a single `createMJServer` function that handles:
 * - Configuration loading
 * - Database connection setup
 * - GraphQL schema building
 * - Resolver discovery and registration
 * - Generated package auto-loading
 * - Server startup with proper lifecycle hooks
 *
 * Middleware discovery uses the @RegisterClass(BaseServerMiddleware, key) pattern.
 * See BaseServerMiddleware for details.
 */

import { serve, MJServerOptions } from '@memberjunction/server';
import { cosmiconfigSync } from 'cosmiconfig';

/**
 * Configuration options for creating an MJ Server
 */
export interface MJServerConfig {
  /**
   * Path to mj.config.cjs or other config file (optional - will auto-discover if not provided)
   */
  configPath?: string;

  /**
   * Additional resolver paths to include beyond the defaults
   * @example ['./custom-resolvers/**\/*Resolver.{js,ts}']
   */
  resolverPaths?: string[];

  /**
   * Hook that runs before the server starts
   */
  beforeStart?: () => void | Promise<void>;

  /**
   * Hook that runs after the server starts
   */
  afterStart?: () => void | Promise<void>;

  /**
   * Options for REST API configuration
   */
  restApiOptions?: MJServerOptions['restApiOptions'];
}

/**
 * Discovers and loads generated packages from the workspace based on configuration.
 *
 * Generated packages (entities, actions, resolvers) register themselves via side effects when imported.
 * This function uses the mj.config.cjs to determine which packages to load.
 *
 * @param config - The loaded MemberJunction configuration
 */
async function discoverAndLoadGeneratedPackages(configResult: { config: Record<string, unknown> }): Promise<void> {
  const codeGeneration = configResult.config?.codeGeneration as Record<string, Record<string, string>> | undefined;
  if (!codeGeneration?.packages) {
    // Common case for app deployments that import their generated package directly —
    // not actionable, so stay silent (was a verbose-only console.debug).
    return;
  }

  console.log('Loading generated packages...');

  const packages = codeGeneration.packages;

  // Attempt to import each configured generated package
  // These imports trigger class registration via @RegisterClass decorators
  const packageTypes = ['entities', 'actions', 'angularForms', 'graphqlResolvers'];

  for (const pkgType of packageTypes) {
    const pkgConfig = packages[pkgType] as unknown as Record<string, string> | undefined;
    if (pkgConfig?.name) {
      const pkgName = pkgConfig.name;
      try {
        // Dynamic import to trigger side effects (class registration)
        await import(pkgName);
        console.log(`  Loaded generated package: ${pkgName}`);
      } catch (error: unknown) {
        // Not finding a package is expected in some cases (e.g., no forms generated yet)
        const errObj = error as { code?: string };
        if (errObj.code === 'ERR_MODULE_NOT_FOUND') {
          console.log(`  Generated package not found (may not exist yet): ${pkgName}`);
        } else {
          console.warn(`  Error loading generated package ${pkgName}:`, error);
        }
      }
    }
  }

  console.log('');
}

/** One entry of `dynamicPackages.server[]` in mj.config.cjs (written by `mj app install`). */
interface DynamicServerPackage {
  /** npm package name to import. */
  PackageName?: string;
  /** Optional named export to invoke after import (a startup hook). */
  StartupExport?: string;
  /** Whether this package should be loaded. Treated as enabled unless explicitly `false`. */
  Enabled?: boolean;
}

/**
 * Imports the server packages of installed Open Apps, declared in
 * `mj.config.cjs` under `dynamicPackages.server[]` by `mj app install`.
 *
 * Importing each package triggers its `@RegisterClass` decorators; if an entry
 * declares a `StartupExport`, that named export is invoked after import. This is
 * called AFTER {@link discoverAndLoadGeneratedPackages} (and after the bootstrap
 * manifests imported at module load), so an app's registrations land last and
 * therefore win via the ClassFactory's load-order priority — letting an app
 * override a base class.
 *
 * Mirrors the generated-package loader's robustness contract: no-op when the
 * section is absent, per-package try/catch, tolerate `ERR_MODULE_NOT_FOUND`
 * (e.g. before `npm install`), warn on anything else, and never crash boot.
 *
 * @param configResult - The loaded MemberJunction configuration
 */
async function loadDynamicAppPackages(configResult: { config: Record<string, unknown> }): Promise<void> {
  const dynamicPackages = configResult.config?.dynamicPackages as { server?: DynamicServerPackage[] } | undefined;
  const serverPackages = dynamicPackages?.server;
  if (!serverPackages || serverPackages.length === 0) {
    // No installed Open App server packages — the common case. Stay silent.
    return;
  }

  console.log('Loading Open App server packages...');

  for (const entry of serverPackages) {
    const pkgName = entry?.PackageName;
    if (!pkgName || entry.Enabled === false) {
      continue;
    }
    try {
      // Dynamic import to trigger side effects (class registration).
      const mod = (await import(pkgName)) as Record<string, unknown>;
      // Invoke the declared startup export, if any (e.g. a registration kicker).
      const startup = entry.StartupExport ? mod[entry.StartupExport] : undefined;
      if (typeof startup === 'function') {
        await Promise.resolve((startup as () => unknown)());
      }
      console.log(`  Loaded Open App server package: ${pkgName}${entry.StartupExport ? ` (ran ${entry.StartupExport})` : ''}`);
    } catch (error: unknown) {
      const errObj = error as { code?: string };
      if (errObj.code === 'ERR_MODULE_NOT_FOUND') {
        console.log(`  Open App server package not found (run 'npm install'?): ${pkgName}`);
      } else {
        console.warn(`  Error loading Open App server package ${pkgName}:`, error);
      }
    }
  }

  console.log('');
}

/**
 * Creates and starts a MemberJunction API server with minimal configuration.
 *
 * This is the primary entry point for MJ 3.0 applications. It:
 * 1. Loads configuration from mj.config.cjs (or specified path)
 * 2. Auto-discovers and imports generated packages (triggering @RegisterClass decorators)
 * 3. Middleware is discovered via ClassFactory from @RegisterClass(BaseServerMiddleware, key) classes
 * 4. Builds the GraphQL schema with all registered resolvers
 * 5. Starts the server with proper lifecycle hooks
 *
 * @param options - Configuration options for the server
 *
 * @example
 * ```typescript
 * // Minimal MJAPI 3.0 application (packages/api/src/index.ts):
 * import { createMJServer } from '@memberjunction/server-bootstrap';
 *
 * // Import generated packages to trigger registration
 * import '@mycompany/generated-entities';
 * import '@mycompany/generated-actions';
 * import '@mycompany/generated-resolvers';
 *
 * createMJServer().catch(console.error);
 * ```
 *
 * @example
 * ```typescript
 * // With custom configuration:
 * createMJServer({
 *   resolverPaths: ['./custom-resolvers/**\/*Resolver.{js,ts}'],
 *   beforeStart: async () => {
 *     console.log('Running custom pre-start logic...');
 *   },
 *   afterStart: async () => {
 *     console.log('Server ready for custom operations');
 *   }
 * }).catch(console.error);
 * ```
 */
export async function createMJServer(options: MJServerConfig = {}): Promise<void> {
  // No banner here: serve()'s StartupLogger shows a transient "Bootstrapping…"
  // indicator while booting and prints the 🚀 summary block once ready, so the
  // rocket appears only after launch.

  // Configuration has already been loaded and merged by MJServer's config.ts at module init time
  // We just need to load the raw user config to access codeGeneration.packages setting
  const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
  const configSearchResult = explorer.search(options.configPath || process.cwd());

  const configResult = {
    config: (configSearchResult?.config ?? {}) as Record<string, unknown>,
    hasUserConfig: configSearchResult && !configSearchResult.isEmpty,
    configFilePath: configSearchResult?.filepath
  };

  // Discover and load generated packages automatically
  // This triggers their @RegisterClass decorators to register entities, actions, etc.
  await discoverAndLoadGeneratedPackages(configResult);

  // Load installed Open App server packages (dynamicPackages.server[] from `mj app
  // install`). Done AFTER the generated packages so an app's @RegisterClass wins via
  // ClassFactory load-order priority. Without this, `mj app install` writes the
  // section but nothing consumes it — the app's server classes never load.
  await loadDynamicAppPackages(configResult);

  // Build resolver paths - auto-discover standard locations if not provided
  // This enables truly minimal MJAPI files without needing to specify paths
  const resolverPaths = options.resolverPaths || [
    // Standard locations where generated resolvers may exist
    './src/generated/generated.{js,ts}',
    './dist/generated/generated.{js,ts}',
    './generated/generated.{js,ts}',
  ];

  // Optional pre-start hook
  if (options.beforeStart) {
    console.log('Running pre-start hook...');
    await Promise.resolve(options.beforeStart());
    console.log('');
  }

  // Build server options.
  // All extensibility (middleware, hooks, plugins, schema transformers) is now
  // handled by @RegisterClass(BaseServerMiddleware, key) classes discovered by serve().
  const serverOptions: MJServerOptions = {
    onBeforeServe: options.beforeStart,
    restApiOptions: options.restApiOptions,
  };

  // Start the MJ Server
  // The serve() function from @memberjunction/server handles:
  // - Database connection pooling
  // - GraphQL schema building from resolvers
  // - Middleware discovery via ClassFactory (BaseServerMiddleware)
  // - WebSocket setup for subscriptions
  // - REST API endpoint registration
  // - Graceful shutdown handling
  await serve(resolverPaths, undefined, serverOptions);

  // Optional post-start hook
  if (options.afterStart) {
    await Promise.resolve(options.afterStart());
  }
}

// Re-export types from @memberjunction/server for convenience
export type { MJServerOptions } from '@memberjunction/server';
// Convenience re-export so consumers can subclass middleware from this package
export { BaseServerMiddleware } from '@memberjunction/server';
