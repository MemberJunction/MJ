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
 */

import { serve, MJServerOptions, configInfo } from '@memberjunction/server';
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
async function discoverAndLoadGeneratedPackages(configResult: any): Promise<void> {
  if (!configResult?.config?.codeGeneration?.packages) {
    console.warn('No codeGeneration.packages configuration found - skipping auto-import of generated packages');
    return;
  }

  const packages = configResult.config.codeGeneration.packages;

  // Attempt to import each configured generated package
  // These imports trigger class registration via @RegisterClass decorators
  const packageTypes = ['entities', 'actions', 'angularForms', 'graphqlResolvers'];

  for (const pkgType of packageTypes) {
    if (packages[pkgType]?.name) {
      const pkgName = packages[pkgType].name;
      try {
        // Dynamic import to trigger side effects (class registration)
        await import(pkgName);
        console.log(`✓ Loaded generated package: ${pkgName}`);
      } catch (error: any) {
        // Not finding a package is expected in some cases (e.g., no forms generated yet)
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          console.log(`ℹ Generated package not found (may not exist yet): ${pkgName}`);
        } else {
          console.warn(`⚠ Error loading generated package ${pkgName}:`, error);
        }
      }
    }
  }
}

/**
 * Creates and starts a MemberJunction API server with minimal configuration.
 *
 * This is the primary entry point for MJ 3.0 applications. It:
 * 1. Loads configuration from mj.config.cjs (or specified path)
 * 2. Auto-discovers and imports generated packages
 * 3. Builds the GraphQL schema with all registered resolvers
 * 4. Starts the server with proper lifecycle hooks
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
  console.log('🚀 MemberJunction Server Bootstrap');
  console.log('=====================================\n');

  // Configuration has already been loaded and merged by MJServer's config.ts at module init time
  // We just need to load the raw user config to access codeGeneration.packages setting
  console.log('');
  const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
  const configSearchResult = explorer.search(options.configPath || process.cwd());

  // Create a result object for backward compatibility with discoverAndLoadGeneratedPackages
  const configResult = {
    config: configSearchResult?.config || {},
    hasUserConfig: configSearchResult && !configSearchResult.isEmpty,
    configFilePath: configSearchResult?.filepath
  };

  // Discover and load generated packages automatically
  // This triggers their @RegisterClass decorators to register entities, actions, etc.
  console.log('Loading generated packages...');
  await discoverAndLoadGeneratedPackages(configResult);
  console.log('');

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

  // Build server options
  const serverOptions: MJServerOptions = {
    onBeforeServe: options.beforeStart,
    restApiOptions: options.restApiOptions
  };

  // Start the MJ Server
  // The serve() function from @memberjunction/server handles:
  // - Database connection pooling
  // - GraphQL schema building from resolvers
  // - WebSocket setup for subscriptions
  // - REST API endpoint registration
  // - Graceful shutdown handling
  console.log('Starting MemberJunction Server...\n');
  await serve(resolverPaths, undefined, serverOptions);

  // Optional post-start hook
  if (options.afterStart) {
    await Promise.resolve(options.afterStart());
  }
}

// Re-export types from @memberjunction/server for convenience
export type { MJServerOptions } from '@memberjunction/server';
