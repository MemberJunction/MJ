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
import {
  MJ_SERVER_EXTENSIONS_EXPORT,
  describeServerExtensionMount,
  extractServerExtensionsFromPackageJson,
  normalizeServerExtensionConfigs,
  type ServerExtensionConfig,
} from '@memberjunction/server-extensions-core';
import { LoadDynamicPackages, resolvePackageJsonFromHost, type LoadedDynamicPackage } from '@memberjunction/dynamic-packages';
import { cosmiconfigSync } from 'cosmiconfig';
import { readFileSync } from 'node:fs';

/** Process ID MJAPI identifies itself with to the dynamic-package loader (entry `Processes` filters match it). */
export const MJAPI_PROCESS_ID = 'mjapi';

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
 * Loads the host's generated packages (`codeGeneration.packages`) and the installed Open Apps'
 * server packages (`dynamicPackages.server[]`, written by `mj app install`) through the shared,
 * process-agnostic loader in @memberjunction/dynamic-packages — the same loader the `mj` CLI,
 * the MCP/A2A servers and the test bootstraps use, so an app's entity subclasses register in
 * every process, not only here. Generated packages load first, apps after, so an app's
 * @RegisterClass wins via the ClassFactory's load-order priority.
 *
 * What stays MJAPI-specific is what happens AFTER a package is loaded:
 *
 * - Each package's exported `RESOLVER_PATHS` (absolute paths to its generated resolver files)
 *   are collected and returned. This is required for the app's GraphQL mutations/queries to
 *   actually enter the live schema: side-effect-importing a resolver class only registers
 *   type-graphql metadata, but `buildSchema` includes a resolver ONLY if it is PASSED in.
 *   `serve()` builds its resolver set by globbing the paths it is given — so the caller must
 *   hand these paths to `serve()`, or the app's entity-specific mutations (e.g. `CreateXxx`)
 *   never appear in the API. The app's own `packages/MJAPI/src/generated/generated.ts` does
 *   NOT regenerate the app's entities, so the package is the only source of these resolvers.
 * - Each package's server-extension declarations (`MJ_SERVER_EXTENSIONS` export, falling back
 *   to `package.json` `memberjunction.serverExtensions`) are collected so `serve()` can mount
 *   Open App routes (webhooks, anonymous checkout, …) without the operator copying those
 *   blocks into the host `mj.config.cjs`. Host `serverExtensions[]` still overlays by DriverClass.
 *
 * The loader's robustness contract is unchanged from the loader that used to live here: no-op
 * when nothing is configured, per-package try/catch, tolerate a package that cannot be resolved
 * (e.g. before `npm install`), warn on anything else, and never crash boot.
 *
 * @param configResult - The loaded MemberJunction configuration
 * @returns absolute resolver-file paths to add to `serve()`'s resolver globs, plus
 *          server-extension configs discovered from those packages (empty when no
 *          Open App server packages are installed — the common case).
 */
async function loadDynamicAppPackages(configResult: { config: Record<string, unknown>; configFilePath?: string }): Promise<{
  resolverPaths: string[];
  serverExtensions: ServerExtensionConfig[];
}> {
  const report = await LoadDynamicPackages({
    processId: MJAPI_PROCESS_ID,
    tier: 'server',
    config: configResult.config,
    configFilePath: configResult.configFilePath,
  });

  const resolverPaths: string[] = [];
  const serverExtensions: ServerExtensionConfig[] = [];
  for (const loaded of report.Loaded) {
    if (loaded.Source === 'generated') {
      continue; // the host's own generated resolvers are globbed from the standard locations below
    }
    const added = collectResolverPaths(loaded, resolverPaths);
    const extensions = collectServerExtensions(loaded, configResult.configFilePath);
    serverExtensions.push(...extensions);
    if (added > 0 || extensions.length > 0) {
      console.log(
        `    ${loaded.Entry.PackageName}:` +
          `${added > 0 ? ` +${added} resolver path${added === 1 ? '' : 's'}` : ''}` +
          `${extensions.length > 0 ? ` +${extensions.length} server extension${extensions.length === 1 ? '' : 's'}` : ''}`
      );
    }
    for (const ext of extensions) {
      // Inventory is the consent surface: these routes mount BEFORE auth.
      console.log(`    ${describeServerExtensionMount(ext)}`);
    }
  }
  if (report.Loaded.length > 0) {
    console.log('');
  }
  return { resolverPaths, serverExtensions };
}

/** Appends the package's exported `RESOLVER_PATHS` strings to `into`; returns how many were added. */
function collectResolverPaths(loaded: LoadedDynamicPackage, into: string[]): number {
  const pkgResolverPaths = loaded.Module.RESOLVER_PATHS;
  let added = 0;
  if (Array.isArray(pkgResolverPaths)) {
    for (const p of pkgResolverPaths) {
      if (typeof p === 'string' && p.length > 0) {
        into.push(p);
        added++;
      }
    }
  }
  return added;
}

/**
 * Server extensions: runtime export wins; package.json is the static fallback for packages that
 * declare metadata without a named export. Isolated in its own try so a collect failure still
 * leaves the package's resolvers registered.
 */
function collectServerExtensions(loaded: LoadedDynamicPackage, configFilePath?: string): ServerExtensionConfig[] {
  const pkgName = loaded.Entry.PackageName;
  try {
    // Read the export by property access rather than `in`: the loader hands back whatever
    // `import()` produced, and a wrapped/proxied namespace (vitest's mocks are one) can answer
    // `get` for an export while answering `has` with false.
    const exported = loaded.Module[MJ_SERVER_EXTENSIONS_EXPORT];
    let extensions =
      exported === undefined
        ? []
        : normalizeServerExtensionConfigs(exported, {
            source: pkgName,
            onInvalid: (message) => console.warn(`  ${message}`),
          });
    if (extensions.length === 0) {
      const pkgJsonPath = resolvePackageJsonFromHost(pkgName, configFilePath);
      if (pkgJsonPath) {
        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as unknown;
        extensions = extractServerExtensionsFromPackageJson(pkgJson, {
          source: `${pkgName} package.json`,
          onInvalid: (message) => console.warn(`  ${message}`),
        });
      }
    }
    return extensions;
  } catch (collectError: unknown) {
    console.warn(`  Error collecting serverExtensions from ${pkgName}:`, collectError);
    return [];
  }
}

/**
 * Creates and starts a MemberJunction API server with minimal configuration.
 *
 * This is the primary entry point for MJ 3.0 applications. It:
 * 1. Loads configuration from mj.config.cjs (or specified path)
 * 2. Auto-discovers and imports generated + installed Open App packages (triggering @RegisterClass decorators)
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

  // Load the host's generated packages and the installed Open App server packages
  // (dynamicPackages.server[] from `mj app install`) — generated first, apps after, so an
  // app's @RegisterClass wins via ClassFactory load-order priority. Without this, `mj app
  // install` writes the section but nothing consumes it — the app's server classes never
  // load. The returned resolver paths are the app packages' generated resolver files, which
  // must be globbed into the schema below (loading the classes alone does NOT put their
  // mutations/queries in the GraphQL schema — type-graphql only includes resolvers passed
  // to serve()).
  const { resolverPaths: dynamicResolverPaths, serverExtensions: dynamicServerExtensions } =
    await loadDynamicAppPackages(configResult);

  // Build resolver paths - auto-discover standard locations if not provided
  // This enables truly minimal MJAPI files without needing to specify paths
  const baseResolverPaths = options.resolverPaths || [
    // Standard locations where generated resolvers may exist
    './src/generated/generated.{js,ts}',
    './dist/generated/generated.{js,ts}',
    './generated/generated.{js,ts}',
  ];
  // Append the installed Open Apps' resolver paths so their GraphQL operations are served.
  const resolverPaths = [...baseResolverPaths, ...dynamicResolverPaths];

  // Optional pre-start hook
  if (options.beforeStart) {
    console.log('Running pre-start hook...');
    await Promise.resolve(options.beforeStart());
    console.log('');
  }

  // Build server options.
  // All extensibility (middleware, hooks, plugins, schema transformers) is now
  // handled by @RegisterClass(BaseServerMiddleware, key) classes discovered by serve().
  const serverOptions = {
    onBeforeServe: options.beforeStart,
    restApiOptions: options.restApiOptions,
    // Discovered only — serve() overlays host mj.config.cjs serverExtensions[] by DriverClass.
    serverExtensions: dynamicServerExtensions,
  } as MJServerOptions;

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
