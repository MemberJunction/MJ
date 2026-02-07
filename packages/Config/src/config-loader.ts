import { cosmiconfig } from 'cosmiconfig';
import { createRequire } from 'node:module';
import { mergeConfigs, MergeOptions } from './config-merger';

// Use createRequire to load CommonJS config files
const require = createRequire(import.meta.url);

/**
 * Configuration loading options
 */
export interface LoadConfigOptions {
  /**
   * Directory to start searching for config file.
   * Default: process.cwd()
   */
  searchFrom?: string;

  /**
   * If true, throws error when config file is not found.
   * If false, returns empty object when no config file exists.
   * Default: false
   */
  requireConfigFile?: boolean;

  /**
   * Merge behavior options
   */
  mergeOptions?: MergeOptions;

  /**
   * If true, logs configuration loading details
   * Default: false
   */
  verbose?: boolean;

  /**
   * Default configuration to use as base.
   * Typically provided by the calling package.
   */
  defaultConfig?: Record<string, any>;
}

/**
 * Result of configuration loading
 */
export interface LoadConfigResult<T = Record<string, any>> {
  /**
   * Final merged configuration
   */
  config: T;

  /**
   * Path to user config file (undefined if using only defaults)
   */
  configFilePath?: string;

  /**
   * True if user config file was found and loaded
   */
  hasUserConfig: boolean;

  /**
   * Keys that were overridden from defaults
   */
  overriddenKeys: string[];
}

/**
 * Loads and merges MemberJunction configuration from multiple sources:
 * 1. Default configuration (provided by calling package)
 * 2. Optional mj.config.cjs file (found via cosmiconfig)
 * 3. Environment variables (applied on top of merged config)
 *
 * @param options - Configuration loading options
 * @returns Merged configuration result
 */
export async function loadMJConfig<T = Record<string, any>>(
  options: LoadConfigOptions = {}
): Promise<LoadConfigResult<T>> {
  const {
    searchFrom = process.cwd(),
    requireConfigFile = false,
    mergeOptions = {},
    verbose = false,
    defaultConfig = {}
  } = options;

  if (verbose) {
    console.log(`\n📄 Loading MemberJunction configuration...`);
    console.log(`   Search directory: ${searchFrom}`);
  }

  // Search for user config file
  const explorer = cosmiconfig('mj', {
    searchPlaces: [
      'mj.config.cjs',
      'mj.config.js',
      '.mjrc',
      '.mjrc.js',
      '.mjrc.cjs',
      'package.json' // Look for "mj" key
    ]
  });

  const searchResult = await explorer.search(searchFrom);

  if (!searchResult) {
    if (requireConfigFile) {
      throw new Error(
        `No mj.config.cjs file found in ${searchFrom} or parent directories. ` +
        `Either create a config file or set requireConfigFile: false to use defaults.`
      );
    }

    if (verbose) {
      console.log(`   ℹ No user config file found, using defaults only`);
    }

    return {
      config: defaultConfig as T,
      hasUserConfig: false,
      overriddenKeys: []
    };
  }

  if (verbose) {
    console.log(`   ✓ Found config file: ${searchResult.filepath}`);
  }

  // Merge user config into defaults
  const userConfig = searchResult.config;
  const mergedConfig = mergeConfigs(defaultConfig, userConfig, mergeOptions);

  // Identify overridden keys for logging
  const overriddenKeys = identifyOverriddenKeys(defaultConfig, userConfig);

  if (verbose) {
    console.log(`   ✓ Merged ${overriddenKeys.length} configuration override(s)`);
    if (overriddenKeys.length > 0 && overriddenKeys.length <= 10) {
      console.log(`   Overridden keys: ${overriddenKeys.join(', ')}`);
    } else if (overriddenKeys.length > 10) {
      console.log(`   Overridden keys: ${overriddenKeys.slice(0, 10).join(', ')}, ... (${overriddenKeys.length - 10} more)`);
    }
  }

  if (verbose) {
    console.log(`   ✓ Configuration loaded successfully\n`);
  }

  return {
    config: mergedConfig as T,
    configFilePath: searchResult.filepath,
    hasUserConfig: true,
    overriddenKeys
  };
}

/**
 * Identifies which top-level keys were overridden in user config
 */
function identifyOverriddenKeys(
  defaults: Record<string, any>,
  overrides: Record<string, any>
): string[] {
  if (!overrides) return [];

  return Object.keys(overrides).filter(key => {
    const hasOverride = key in overrides;
    // Only count as override if the value is different
    const isDifferent = JSON.stringify(defaults[key]) !== JSON.stringify(overrides[key]);
    return hasOverride && isDifferent;
  });
}

/**
 * Loads configuration synchronously (for CommonJS compatibility).
 * Note: This does NOT search for config files, only loads from explicit path.
 *
 * @param configPath - Explicit path to config file
 * @param options - Loading options
 */
export function loadMJConfigSync<T = Record<string, any>>(
  configPath: string,
  options: Omit<LoadConfigOptions, 'searchFrom' | 'requireConfigFile'> = {}
): T {
  const { defaultConfig = {}, mergeOptions = {} } = options;

  try {
    const userConfig = require(configPath);
    const mergedConfig = mergeConfigs(defaultConfig, userConfig, mergeOptions);
    return mergedConfig as T;
  } catch (error: any) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}

/**
 * Helper to build a complete MJ config by merging configurations from multiple packages.
 * Each package provides its own default configuration.
 *
 * @param packageDefaults - Object with package-specific default configs
 * @param userConfigOverrides - Optional user overrides
 * @returns Merged configuration
 */
export function buildMJConfig(
  packageDefaults: {
    codegen?: Record<string, any>;
    server?: Record<string, any>;
    mcpServer?: Record<string, any>;
    a2aServer?: Record<string, any>;
    queryGen?: Record<string, any>;
  },
  userConfigOverrides?: Record<string, any>
): Record<string, any> {
  // Start with empty config
  let config: Record<string, any> = {};

  // Merge each package's defaults
  if (packageDefaults.codegen) {
    config = mergeConfigs(config, packageDefaults.codegen);
  }
  if (packageDefaults.server) {
    config = mergeConfigs(config, packageDefaults.server);
  }
  if (packageDefaults.mcpServer) {
    config = mergeConfigs(config, packageDefaults.mcpServer);
  }
  if (packageDefaults.a2aServer) {
    config = mergeConfigs(config, packageDefaults.a2aServer);
  }
  if (packageDefaults.queryGen) {
    config = { ...config, queryGen: packageDefaults.queryGen };
  }

  // Apply user overrides
  if (userConfigOverrides) {
    config = mergeConfigs(config, userConfigOverrides);
  }

  return config;
}
