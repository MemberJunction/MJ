# Optional mj.config.cjs with Default Configuration Package

**Date**: 2026-01-13
**Status**: Planning
**Priority**: High
**Affected Packages**: `@memberjunction/config`, `@memberjunction/server-bootstrap`, `@memberjunction/codegen-lib`, `@memberjunction/mj-cli`, `MJAPI`

## Overview

Create a configuration architecture where default mj.config.cjs settings are stored in a common package (`@memberjunction/config`), and an optional mj.config.cjs at the distribution root can selectively override those defaults. This enables:
- Standardized default configurations across all MJ deployments
- Minimal configuration files in distribution packages
- Clear separation between framework defaults and deployment-specific overrides
- Better maintainability and upgradability

## Problem Statement

Currently, every MJ deployment requires a complete mj.config.cjs file at the repository root containing:
- ~530 lines of configuration across multiple subsystems
- Duplicate configuration patterns across different deployments
- No clear distinction between "framework defaults" and "deployment overrides"
- Difficulty updating defaults when the framework evolves
- Large config files even when most settings use defaults

**Example**: A deployment that only needs to override database connection strings still requires the entire config file.

## Proposed Solution

### Architecture

```
@memberjunction/config (NEW PACKAGE)
├── src/
│   ├── defaults/
│   │   ├── codegen.defaults.js
│   │   ├── mjserver.defaults.js
│   │   ├── mcpserver.defaults.js
│   │   ├── a2aserver.defaults.js
│   │   └── querygen.defaults.js
│   ├── config-loader.ts
│   ├── config-merger.ts
│   └── index.ts
└── package.json

Distribution Root (e.g., MJ monorepo or customer deployment)
├── mj.config.cjs (OPTIONAL - only contains overrides)
└── .env (environment variables)
```

### Configuration Loading Flow

```
1. Load defaults from @memberjunction/config
   ↓
2. Search for optional mj.config.cjs (cosmiconfig)
   ↓
3. Deep merge user config into defaults
   ↓
4. Apply environment variable overrides
   ↓
5. Validate final config with Zod schemas
   ↓
6. Return merged ConfigInfo
```

### Deep Merge Strategy

Use intelligent deep merging with these rules:

**Primitive Values**: User config replaces default
```javascript
// Default
{ graphqlPort: 4000 }

// User override
{ graphqlPort: 3000 }

// Result
{ graphqlPort: 3000 }
```

**Objects**: Merge recursively
```javascript
// Default
{ databaseSettings: { connectionTimeout: 45000, requestTimeout: 30000 } }

// User override
{ databaseSettings: { connectionTimeout: 60000 } }

// Result
{ databaseSettings: { connectionTimeout: 60000, requestTimeout: 30000 } }
```

**Arrays**: Replace entirely (not merge items)
```javascript
// Default
{ authProviders: [azureProvider, auth0Provider] }

// User override
{ authProviders: [customProvider] }

// Result
{ authProviders: [customProvider] }
```

**Rationale**: Arrays in config typically represent complete sets (auth providers, output targets) where partial merging would be confusing.

**Special Case - Append Arrays**: Use `_append` suffix for additive behavior
```javascript
// Default
{ excludeSchemas: ['sys', 'staging'] }

// User override
{ excludeSchemas_append: ['internal'] }

// Result
{ excludeSchemas: ['sys', 'staging', 'internal'] }
```

## Implementation Plan

### Phase 1: Create @memberjunction/config Package

**1.1 Package Structure**

Create new package at `/packages/Core/config/`:

```
packages/Core/config/
├── src/
│   ├── defaults/
│   │   ├── codegen.defaults.cjs
│   │   ├── mjserver.defaults.cjs
│   │   ├── mcpserver.defaults.cjs
│   │   ├── a2aserver.defaults.cjs
│   │   └── querygen.defaults.cjs
│   ├── config-loader.ts
│   ├── config-merger.ts
│   ├── config-types.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

**1.2 Package Dependencies**

```json
{
  "name": "@memberjunction/config",
  "version": "3.0.0",
  "dependencies": {
    "cosmiconfig": "^9.0.0",
    "lodash.mergewith": "^4.6.2",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/lodash.mergewith": "^4.6.9"
  }
}
```

**1.3 Default Configuration Files**

Extract defaults from current mj.config.cjs into separate files:

**`src/defaults/codegen.defaults.cjs`**
```javascript
/** @type {import('../config-types').CodeGenConfig} */
module.exports = {
  verboseOutput: false,
  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'recompile_mj_views', value: true },
    { name: 'auto_index_foreign_keys', value: true },
  ],
  logging: {
    log: true,
    logFile: 'codegen.output.log',
    console: true,
  },
  newEntityDefaults: {
    TrackRecordChanges: true,
    AuditRecordAccess: false,
    AuditViewRuns: false,
    AllowAllRowsAPI: false,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    AllowUserSearchAPI: false,
    CascadeDeletes: false,
    UserViewMaxRows: 1000,
    AddToApplicationWithSchemaName: true,
    IncludeFirstNFieldsAsDefaultInView: 5,
    PermissionDefaults: {
      AutoAddPermissionsForNewEntities: true,
      Permissions: [
        { RoleName: 'UI', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
        { RoleName: 'Developer', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: false },
        { RoleName: 'Integration', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
      ],
    },
    NameRulesBySchema: [
      {
        SchemaName: '${mj_core_schema}',
        EntityNamePrefix: 'MJ: ',
        EntityNameSuffix: '',
      },
    ]
  },
  newEntityRelationshipDefaults: {
    AutomaticallyCreateRelationships: true,
    CreateOneToManyRelationships: true,
  },
  newSchemaDefaults: {
    CreateNewApplicationWithSchemaName: true,
  },
  excludeSchemas: ['sys', 'staging'],
  excludeTables: [
    {
      schema: '%',
      table: 'sys%',
    },
    {
      schema: '%',
      table: 'flyway_schema_history'
    }
  ],
  customSQLScripts: [],
  dbSchemaJSONOutput: {
    excludeEntities: [],
    excludeSchemas: ['sys', 'staging', 'dbo'],
    bundles: [
      {
        name: '_Core_Apps',
        excludeSchemas: ['__mj'],
      },
    ],
  },
  integrityChecks: {
    enabled: true,
    entityFieldsSequenceCheck: true,
  },
  advancedGeneration: {
    enableAdvancedGeneration: true,
    features: [
      {
        name: 'EntityNames',
        description: 'Use AI to generate better entity names when creating new entities',
        enabled: false,
      },
      {
        name: 'DefaultInViewFields',
        description: 'Use AI to determine which fields in an entity should be shown, by default, in a newly created User View for the entity.',
        enabled: true,
      },
      {
        name: 'EntityDescriptions',
        description: 'Use AI to generate descriptions for entities, only used when creating new entities',
        enabled: false,
      },
      {
        name: 'SmartFieldIdentification',
        description: 'Use AI to identify the best name field and default field to show in views for each entity',
        enabled: true,
      },
      {
        name: 'TransitiveJoinIntelligence',
        description: 'Use AI to analyze entity relationships and detect junction tables for many-to-many relationships',
        enabled: true,
      },
      {
        name: 'FormLayoutGeneration',
        description: 'Use AI to generate semantic field categories for better form organization.',
        enabled: true,
      },
      {
        name: 'ParseCheckConstraints',
        description: 'Use AI to parse check constraints and generate a description as well as sub-class Validate() methods.',
        enabled: true,
      }
    ],
  },
  output: [], // Deployment-specific
  commands: [], // Deployment-specific
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/v3/',
    appendToFile: true,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: true,
  },
  forceRegeneration: {
    enabled: false,
    entityWhereClause: "",
    baseViews: false,
    spCreate: false,
    spUpdate: false,
    spDelete: false,
    allStoredProcedures: false,
    indexes: false,
    fullTextSearch: false,
  },
};
```

**`src/defaults/mjserver.defaults.cjs`**
```javascript
/** @type {import('../config-types').MJServerConfig} */
module.exports = {
  userHandling: {
    autoCreateNewUsers: true,
    newUserLimitedToAuthorizedDomains: false,
    newUserAuthorizedDomains: [],
    newUserRoles: ['UI', 'Developer'],
    updateCacheWhenNotFound: true,
    updateCacheWhenNotFoundDelay: 5000,
    contextUserForNewUserCreation: 'not.set@nowhere.com',
    CreateUserApplicationRecords: true
  },
  databaseSettings: {
    connectionTimeout: 45000,
    requestTimeout: 30000,
    metadataCacheRefreshInterval: 180000,
  },
  viewingSystem: {
    enableSmartFilters: true,
  },
  restApiOptions: {
    enabled: false,
    basePath: '/rest',
  },
  askSkip: {
    url: undefined,
    chatURL: undefined,
    learningCycleURL: undefined,
    learningCycleIntervalInMinutes: undefined,
    learningCycleEnabled: undefined,
    learningCycleRunUponStartup: undefined,
    orgID: undefined,
    apiKey: undefined,
    organizationInfo: undefined,
    entitiesToSend: {
      excludeSchemas: [],
      includeEntitiesFromExcludedSchemas: [],
    },
  },
  sqlLogging: {
    enabled: true,
    defaultOptions: {
      formatAsMigration: false,
      statementTypes: 'both',
      batchSeparator: 'GO',
      prettyPrint: true,
      logRecordChangeMetadata: false,
      retainEmptyLogFiles: false,
      verboseOutput: false
    },
    allowedLogDirectory: './logs/sql',
    maxActiveSessions: 5,
    autoCleanupEmptyFiles: true,
    sessionTimeout: 3600000
  },
  scheduledJobs: {
    enabled: true,
    systemUserEmail: 'not.set@nowhere.com',
    maxConcurrentJobs: 5,
    defaultLockTimeout: 600000,
    staleLockCleanupInterval: 300000
  },
  telemetry: {
    enabled: true,
    level: 'standard'
  },
  authProviders: [] // Deployment-specific
};
```

**`src/defaults/mcpserver.defaults.cjs`**
```javascript
/** @type {import('../config-types').MCPServerConfig} */
module.exports = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: false,
    actionTools: [],
    entityTools: []
  }
};
```

**`src/defaults/a2aserver.defaults.cjs`**
```javascript
/** @type {import('../config-types').A2AServerConfig} */
module.exports = {
  a2aServerSettings: {
    port: 3200,
    enableA2AServer: false,
    agentName: "MemberJunction",
    agentDescription: "Access MemberJunction data and capabilities via the A2A protocol",
    streamingEnabled: true,
    entityCapabilities: []
  }
};
```

**`src/defaults/querygen.defaults.cjs`**
```javascript
/** @type {import('../config-types').QueryGenConfig} */
module.exports = {
  includeEntities: [],
  excludeEntities: [],
  excludeSchemas: ['sys', 'INFORMATION_SCHEMA', '__mj'],
  questionsPerGroup: 2,
  embeddingModel: 'text-embedding-3-small',
  maxRefinementIterations: 3,
  maxFixingIterations: 5,
  topSimilarQueries: 5,
  similarityWeights: {
    userQuestion: 0.2,
    description: 0.40,
    technicalDescription: 0.40,
  },
  outputMode: 'metadata',
  outputDirectory: './Demos/metadata/queries',
  outputCategoryDirectory: './Demos/metadata/query-categories',
  externalizeSQLToFiles: true,
  rootQueryCategory: 'Golden-Queries',
  autoCreateEntityQueryCategories: true,
  parallelGenerations: 1,
  enableCaching: true,
  testWithSampleData: true,
  requireMinRows: 0,
  maxRefinementRows: 5,
  verbose: true,
};
```

### Phase 2: Implement Configuration Merger

**2.1 Deep Merge Utility**

**File**: `packages/Core/config/src/config-merger.ts`

```typescript
import mergeWith from 'lodash.mergewith';

/**
 * Configuration merge options
 */
export interface MergeOptions {
  /**
   * If true, arrays are concatenated instead of replaced.
   * Default: false (arrays replace)
   */
  concatenateArrays?: boolean;

  /**
   * If true, null values in override config will replace default values.
   * If false, null values are ignored and defaults are preserved.
   * Default: false
   */
  allowNullOverrides?: boolean;
}

/**
 * Deep merges user configuration into default configuration.
 *
 * Merge Rules:
 * 1. Primitives (string, number, boolean): User value replaces default
 * 2. Objects: Recursively merge properties
 * 3. Arrays: Replace entirely (unless concatenateArrays option is true)
 * 4. Null/Undefined: Preserved based on allowNullOverrides option
 * 5. Special _append suffix: Concatenates arrays (e.g., excludeSchemas_append)
 *
 * @param defaults - Default configuration object
 * @param overrides - User override configuration object
 * @param options - Merge behavior options
 * @returns Merged configuration object
 */
export function mergeConfigs<T extends Record<string, any>>(
  defaults: T,
  overrides: Partial<T> | undefined,
  options: MergeOptions = {}
): T {
  const { concatenateArrays = false, allowNullOverrides = false } = options;

  if (!overrides || typeof overrides !== 'object') {
    return defaults;
  }

  // Process _append suffixed keys first
  const processedOverrides = processAppendKeys(overrides, defaults);

  return mergeWith(
    {},
    defaults,
    processedOverrides,
    (defaultValue: any, overrideValue: any, key: string) => {
      return customMergeStrategy(defaultValue, overrideValue, key, {
        concatenateArrays,
        allowNullOverrides
      });
    }
  );
}

/**
 * Processes keys with _append suffix to concatenate arrays
 */
function processAppendKeys(
  overrides: Record<string, any>,
  defaults: Record<string, any>
): Record<string, any> {
  const processed = { ...overrides };

  for (const key in overrides) {
    if (key.endsWith('_append')) {
      const baseKey = key.slice(0, -7); // Remove '_append' suffix
      const defaultValue = defaults[baseKey];
      const appendValue = overrides[key];

      if (Array.isArray(defaultValue) && Array.isArray(appendValue)) {
        processed[baseKey] = [...defaultValue, ...appendValue];
        delete processed[key]; // Remove the _append key
      } else {
        console.warn(
          `Warning: ${key} expects both default and override to be arrays. ` +
          `Default type: ${typeof defaultValue}, Override type: ${typeof appendValue}`
        );
      }
    }
  }

  return processed;
}

/**
 * Custom merge strategy for lodash.mergeWith
 */
function customMergeStrategy(
  defaultValue: any,
  overrideValue: any,
  key: string,
  options: MergeOptions
): any {
  const { concatenateArrays, allowNullOverrides } = options;

  // Handle null/undefined overrides
  if (overrideValue === null || overrideValue === undefined) {
    return allowNullOverrides ? overrideValue : defaultValue;
  }

  // Arrays: Replace or concatenate based on option
  if (Array.isArray(defaultValue) && Array.isArray(overrideValue)) {
    return concatenateArrays ? [...defaultValue, ...overrideValue] : overrideValue;
  }

  // Objects: Let lodash continue recursive merge (return undefined)
  if (isPlainObject(defaultValue) && isPlainObject(overrideValue)) {
    return undefined; // Continue default merge behavior
  }

  // Primitives: Override replaces default
  return overrideValue;
}

/**
 * Checks if value is a plain object (not array, not class instance)
 */
function isPlainObject(value: any): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Validates merged configuration against expected structure.
 * Logs warnings for unexpected keys that might indicate typos.
 *
 * @param config - Merged configuration object
 * @param allowedKeys - Set of allowed top-level keys
 */
export function validateConfigStructure(
  config: Record<string, any>,
  allowedKeys: Set<string>
): void {
  const configKeys = Object.keys(config);
  const unexpectedKeys = configKeys.filter(key => !allowedKeys.has(key));

  if (unexpectedKeys.length > 0) {
    console.warn(
      `Warning: Unexpected configuration keys found: ${unexpectedKeys.join(', ')}. ` +
      `These may be typos or deprecated settings.`
    );
  }
}
```

**2.2 Configuration Loader**

**File**: `packages/Core/config/src/config-loader.ts`

```typescript
import { cosmiconfig } from 'cosmiconfig';
import { mergeConfigs, MergeOptions, validateConfigStructure } from './config-merger';
import codegenDefaults from './defaults/codegen.defaults.cjs';
import mjserverDefaults from './defaults/mjserver.defaults.cjs';
import mcpserverDefaults from './defaults/mcpserver.defaults.cjs';
import a2aserverDefaults from './defaults/a2aserver.defaults.cjs';
import querygenDefaults from './defaults/querygen.defaults.cjs';
import type { MJConfig, CodeGenConfig, MJServerConfig, MCPServerConfig, A2AServerConfig, QueryGenConfig } from './config-types';

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
   * If false, returns defaults when no config file exists.
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
}

/**
 * Result of configuration loading
 */
export interface LoadConfigResult<T> {
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
 * 1. Default configuration from @memberjunction/config package
 * 2. Optional mj.config.cjs file (found via cosmiconfig)
 * 3. Environment variables (applied on top of merged config)
 *
 * @param options - Configuration loading options
 * @returns Merged configuration result
 */
export async function loadMJConfig(
  options: LoadConfigOptions = {}
): Promise<LoadConfigResult<MJConfig>> {
  const {
    searchFrom = process.cwd(),
    requireConfigFile = false,
    mergeOptions = {},
    verbose = false
  } = options;

  if (verbose) {
    console.log(`\n📄 Loading MemberJunction configuration...`);
    console.log(`   Search directory: ${searchFrom}`);
  }

  // 1. Start with defaults
  const defaultConfig = buildDefaultConfig();

  // 2. Search for user config file
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
      config: applyEnvironmentVariables(defaultConfig),
      hasUserConfig: false,
      overriddenKeys: []
    };
  }

  if (verbose) {
    console.log(`   ✓ Found config file: ${searchResult.filepath}`);
  }

  // 3. Merge user config into defaults
  const userConfig = searchResult.config;
  const mergedConfig = mergeConfigs(defaultConfig, userConfig, mergeOptions);

  // 4. Identify overridden keys for logging
  const overriddenKeys = identifyOverriddenKeys(defaultConfig, userConfig);

  if (verbose) {
    console.log(`   ✓ Merged ${overriddenKeys.length} configuration override(s)`);
    if (overriddenKeys.length > 0) {
      console.log(`   Overridden keys: ${overriddenKeys.join(', ')}`);
    }
  }

  // 5. Apply environment variables
  const finalConfig = applyEnvironmentVariables(mergedConfig);

  // 6. Validate structure
  const allowedKeys = new Set(Object.keys(defaultConfig));
  validateConfigStructure(finalConfig, allowedKeys);

  if (verbose) {
    console.log(`   ✓ Configuration loaded successfully\n`);
  }

  return {
    config: finalConfig,
    configFilePath: searchResult.filepath,
    hasUserConfig: true,
    overriddenKeys
  };
}

/**
 * Builds the default configuration by merging all default modules
 */
function buildDefaultConfig(): MJConfig {
  return {
    ...codegenDefaults,
    ...mjserverDefaults,
    ...mcpserverDefaults,
    ...a2aserverDefaults,
    queryGen: querygenDefaults,

    // Environment-driven defaults (will be overridden by applyEnvironmentVariables)
    dbHost: 'localhost',
    dbDatabase: undefined,
    dbUsername: undefined,
    dbPassword: undefined,
    mjCoreSchema: '__mj',
    graphqlPort: 4000,
    graphqlRootPath: '/',
    baseUrl: 'http://localhost',
  };
}

/**
 * Applies environment variable overrides to configuration.
 * Environment variables always take precedence over file-based config.
 */
function applyEnvironmentVariables(config: MJConfig): MJConfig {
  return {
    ...config,

    // Database settings
    dbHost: process.env.DB_HOST ?? config.dbHost,
    dbPort: process.env.DB_PORT,
    dbDatabase: process.env.DB_DATABASE ?? config.dbDatabase,
    dbUsername: process.env.DB_USERNAME ?? config.dbUsername,
    dbPassword: process.env.DB_PASSWORD ?? config.dbPassword,
    dbReadOnlyUsername: process.env.DB_READ_ONLY_USERNAME,
    dbReadOnlyPassword: process.env.DB_READ_ONLY_PASSWORD,
    dbInstanceName: process.env.DB_INSTANCE_NAME,
    dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE,
    codeGenLogin: process.env.CODEGEN_DB_USERNAME,
    codeGenPassword: process.env.CODEGEN_DB_PASSWORD,

    // Core settings
    mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? config.mjCoreSchema,
    outputCode: process.env.OUTPUT_CODE,

    // MJAPI settings
    graphqlPort: process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT, 10) : config.graphqlPort,
    graphqlRootPath: process.env.GRAPHQL_ROOT_PATH ?? config.graphqlRootPath,
    baseUrl: process.env.GRAPHQL_BASE_URL ?? config.baseUrl,
    publicUrl: process.env.MJAPI_PUBLIC_URL,
    enableIntrospection: process.env.ENABLE_INTROSPECTION,
    apiKey: process.env.MJ_API_KEY ?? config.apiKey,
    websiteRunFromPackage: process.env.WEBSITE_RUN_FROM_PACKAGE,
    userEmailMap: process.env.USER_EMAIL_MAP,

    // Ask Skip settings
    askSkip: config.askSkip ? {
      ...config.askSkip,
      url: process.env.ASK_SKIP_URL ?? config.askSkip.url,
      chatURL: process.env.ASK_SKIP_CHAT_URL ?? config.askSkip.chatURL,
      learningCycleURL: process.env.ASK_SKIP_LEARNING_URL ?? config.askSkip.learningCycleURL,
      learningCycleIntervalInMinutes: process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES ?? config.askSkip.learningCycleIntervalInMinutes,
      learningCycleEnabled: process.env.ASK_SKIP_RUN_LEARNING_CYCLES ?? config.askSkip.learningCycleEnabled,
      learningCycleRunUponStartup: process.env.ASK_SKIP_RUN_LEARNING_CYCLES_UPON_STARTUP ?? config.askSkip.learningCycleRunUponStartup,
      orgID: process.env.ASK_SKIP_ORGANIZATION_ID ?? config.askSkip.orgID,
      apiKey: process.env.ASK_SKIP_API_KEY ?? config.askSkip.apiKey,
      organizationInfo: process.env.ASK_SKIP_ORGANIZATION_INFO ?? config.askSkip.organizationInfo,
    } : undefined,

    // Database settings with env overrides
    databaseSettings: config.databaseSettings ? {
      ...config.databaseSettings,
      metadataCacheRefreshInterval: isFinite(Number(process.env.METADATA_CACHE_REFRESH_INTERVAL))
        ? Number(process.env.METADATA_CACHE_REFRESH_INTERVAL)
        : config.databaseSettings.metadataCacheRefreshInterval
    } : undefined,
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
    const isDifferent = JSON.stringify(defaults[key]) !== JSON.stringify(overrides[key]);
    return hasOverride && isDifferent;
  });
}

/**
 * Loads configuration synchronously (for CommonJS compatibility).
 * Note: This does NOT search for config files, only loads from explicit path.
 *
 * @param configPath - Explicit path to config file
 * @param options - Merge options
 */
export function loadMJConfigSync(
  configPath: string,
  options: MergeOptions = {}
): MJConfig {
  const defaultConfig = buildDefaultConfig();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const userConfig = require(configPath);
    const mergedConfig = mergeConfigs(defaultConfig, userConfig, options);
    return applyEnvironmentVariables(mergedConfig);
  } catch (error: any) {
    throw new Error(`Failed to load config from ${configPath}: ${error.message}`);
  }
}
```

**2.3 Type Definitions**

**File**: `packages/Core/config/src/config-types.ts`

```typescript
/**
 * Re-export all configuration types from their source packages.
 * This provides a single import point for all MJ configuration types.
 */

// Import types from their source packages
export type { ConfigInfo as CodeGenConfig } from '@memberjunction/codegen-lib';
export type { ConfigInfo as MJServerConfig } from '@memberjunction/server';
export type { ConfigInfo as MCPServerConfig } from '@memberjunction/mcp-server';
export type { ConfigInfo as A2AServerConfig } from '@memberjunction/a2a-server';
export type { ConfigInfo as QueryGenConfig } from '@memberjunction/querygen';

/**
 * Combined MemberJunction configuration type.
 * This is the full config object with all subsystem configurations merged.
 */
export type MJConfig = CodeGenConfig & MJServerConfig & MCPServerConfig & A2AServerConfig & {
  queryGen?: QueryGenConfig;
};
```

**2.4 Package Index**

**File**: `packages/Core/config/src/index.ts`

```typescript
/**
 * @memberjunction/config
 *
 * Central configuration package for MemberJunction framework.
 * Provides default configurations and utilities for loading/merging user overrides.
 */

export { loadMJConfig, loadMJConfigSync, type LoadConfigOptions, type LoadConfigResult } from './config-loader';
export { mergeConfigs, validateConfigStructure, type MergeOptions } from './config-merger';
export type { MJConfig, CodeGenConfig, MJServerConfig, MCPServerConfig, A2AServerConfig, QueryGenConfig } from './config-types';

// Export default configurations for direct access if needed
export { default as codegenDefaults } from './defaults/codegen.defaults.cjs';
export { default as mjserverDefaults } from './defaults/mjserver.defaults.cjs';
export { default as mcpserverDefaults } from './defaults/mcpserver.defaults.cjs';
export { default as a2aserverDefaults } from './defaults/a2aserver.defaults.cjs';
export { default as querygenDefaults } from './defaults/querygen.defaults.cjs';
```

### Phase 3: Update Package Consumers

**3.1 Update ServerBootstrap Package**

**File**: `packages/ServerBootstrap/src/index.ts`

Replace existing cosmiconfig usage with new config loader:

```typescript
// OLD (lines ~50-70):
import { cosmiconfig } from 'cosmiconfig';

const explorer = cosmiconfig('mj', {
  searchPlaces: ['mj.config.cjs', 'mj.config.js', '.mjrc', '.mjrc.js', '.mjrc.cjs']
});

const searchResult = await explorer.search(process.cwd());
const config = searchResult?.config || {};

// NEW:
import { loadMJConfig } from '@memberjunction/config';

const configResult = await loadMJConfig({
  searchFrom: process.cwd(),
  requireConfigFile: false, // Optional config file
  verbose: true // Log loading details
});

const config = configResult.config;

if (configResult.hasUserConfig) {
  console.log(`✓ Loaded configuration from: ${configResult.configFilePath}`);
  console.log(`  Overridden settings: ${configResult.overriddenKeys.join(', ')}`);
} else {
  console.log(`ℹ Using default configuration (no mj.config.cjs found)`);
}
```

Add dependency to `packages/ServerBootstrap/package.json`:
```json
{
  "dependencies": {
    "@memberjunction/config": "^3.0.0"
  }
}
```

**3.2 Update CodeGenLib Package**

**File**: `packages/CodeGenLib/src/Config/config.ts`

Replace config loading logic:

```typescript
// Add import
import { loadMJConfig } from '@memberjunction/config';

// In loadConfig() function, replace cosmiconfig logic:
export async function loadConfig(): Promise<ConfigInfo> {
  const configResult = await loadMJConfig({
    searchFrom: process.cwd(),
    requireConfigFile: false,
    verbose: true
  });

  // Validate CodeGen-specific configuration
  const validationResult = configInfoSchema.safeParse(configResult.config);

  if (!validationResult.success) {
    console.error('Configuration validation failed:');
    console.error(validationResult.error.format());
    throw new Error('Invalid CodeGen configuration. Please check mj.config.cjs');
  }

  return validationResult.data;
}
```

Add dependency to `packages/CodeGenLib/package.json`:
```json
{
  "dependencies": {
    "@memberjunction/config": "^3.0.0"
  }
}
```

**3.3 Update MJCLI Package**

**File**: `packages/MJCLI/src/config.ts`

Similar updates to use loadMJConfig() for CLI operations.

### Phase 4: Create Minimal Example mj.config.cjs

**4.1 Monorepo Root Config (Development)**

**File**: `/mj.config.cjs` (at repo root)

Replace existing 530-line config with minimal override file:

```javascript
/**
 * MemberJunction Configuration Overrides
 *
 * This file contains deployment-specific overrides for the MJ monorepo.
 * Default values come from @memberjunction/config package.
 *
 * Only include settings you want to override from defaults.
 * See: packages/Core/config/src/defaults/ for all default values.
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * CodeGen-specific overrides
   */
  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/MJExplorer/src/app/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    {
      type: 'AngularCoreEntities',
      directory: './packages/Angular/Explorer/core-entity-forms/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 100 }],
    },
    { type: 'GraphQLServer', directory: './packages/MJAPI/src/generated' },
    { type: 'GraphQLCoreEntityResolvers', directory: './packages/MJServer/src/generated' },
    { type: 'CoreActionSubclasses', directory: './packages/Actions/CoreActions/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/GeneratedActions/src/generated' },
    { type: 'CoreEntitySubclasses', directory: './packages/MJCoreEntities/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/GeneratedEntities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  commands: [
    {
      workingDirectory: './packages/MJCoreEntities',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/Angular/Explorer/core-entity-forms',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/Actions/CoreActions',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/GeneratedEntities',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/GeneratedActions',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/MJServer',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
    {
      workingDirectory: './packages/MJAPI',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
  ],

  customSQLScripts: [
    {
      scriptFile: './SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
      when: 'before-all',
    },
  ],

  /**
   * MJServer-specific overrides
   */
  authProviders: [
    // Microsoft Azure AD / Entra ID
    process.env.TENANT_ID && process.env.WEB_CLIENT_ID ? {
      name: 'azure',
      type: 'msal',
      issuer: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`,
      audience: process.env.WEB_CLIENT_ID,
      jwksUri: `https://login.microsoftonline.com/${process.env.TENANT_ID}/discovery/v2.0/keys`,
      clientId: process.env.WEB_CLIENT_ID,
      tenantId: process.env.TENANT_ID
    } : null,

    // Auth0
    process.env.AUTH0_DOMAIN && process.env.AUTH0_CLIENT_ID ? {
      name: 'auth0',
      type: 'auth0',
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      audience: process.env.AUTH0_CLIENT_ID,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      domain: process.env.AUTH0_DOMAIN
    } : null,
  ].filter(Boolean),

  /**
   * MCP Server overrides
   */
  mcpServerSettings: {
    enableMCPServer: true,
    entityTools: [
      {
        schemaName: 'CRM',
        entityName: '*',
        get: true,
        create: true,
        update: true,
        delete: true,
        runView: true,
      },
    ]
  },

  /**
   * A2A Server overrides
   */
  a2aServerSettings: {
    enableA2AServer: true,
    entityCapabilities: [
      {
        schemaName: 'CRM',
        entityName: '*',
        get: true,
        create: true,
        update: true,
        delete: true,
        runView: true,
      },
    ]
  },

  /**
   * QueryGen overrides
   */
  queryGen: {
    includeEntities: ["Members"], // Override to only generate queries for Members entity
  },

  /**
   * All other settings use defaults from @memberjunction/config
   * See: node_modules/@memberjunction/config/src/defaults/
   */
};
```

**Result**: 130 lines (down from 530 lines), much more maintainable!

**4.2 Distribution Package Config (Customer Deployment)**

**File**: `mj.config.cjs` (in customer distribution package)

Example minimal config for a customer deployment:

```javascript
/**
 * MemberJunction Configuration - Customer Deployment
 *
 * Minimal configuration file for production deployment.
 * All unspecified settings use framework defaults.
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  // Authentication (required)
  authProviders: [
    {
      name: 'azure',
      type: 'msal',
      issuer: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0`,
      audience: process.env.WEB_CLIENT_ID,
      jwksUri: `https://login.microsoftonline.com/${process.env.TENANT_ID}/discovery/v2.0/keys`,
      clientId: process.env.WEB_CLIENT_ID,
      tenantId: process.env.TENANT_ID
    }
  ],

  // User handling (optional overrides)
  userHandling: {
    newUserRoles: ['UI'], // Only grant UI role by default
    autoCreateNewUsers: false, // Disable auto-creation in production
  },

  // Database timeout overrides (optional)
  databaseSettings: {
    connectionTimeout: 60000, // 60 seconds for slower networks
  },

  // Disable introspection in production
  enableIntrospection: false,

  // Everything else uses framework defaults
};
```

**Result**: ~35 lines for a production deployment!

### Phase 5: Update Documentation

**5.1 Create README for @memberjunction/config**

**File**: `packages/Core/config/README.md`

```markdown
# @memberjunction/config

Central configuration package for the MemberJunction framework. Provides default configurations and utilities for loading and merging user overrides.

## Overview

This package implements a hierarchical configuration system:

1. **Framework Defaults**: Standard configurations defined in this package
2. **User Overrides**: Optional `mj.config.cjs` file in your project root
3. **Environment Variables**: Highest priority, override everything

## Installation

```bash
npm install @memberjunction/config
```

## Usage

### Loading Configuration

```typescript
import { loadMJConfig } from '@memberjunction/config';

const configResult = await loadMJConfig({
  searchFrom: process.cwd(),
  requireConfigFile: false, // Optional config file
  verbose: true // Log loading details
});

console.log(configResult.config); // Final merged configuration
console.log(configResult.configFilePath); // Path to user config (if found)
console.log(configResult.hasUserConfig); // True if user config was loaded
console.log(configResult.overriddenKeys); // List of overridden settings
```

### Creating Override Config

Create `mj.config.cjs` in your project root with only the settings you want to override:

```javascript
/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  // Only override what you need to change
  graphqlPort: 5000,

  databaseSettings: {
    connectionTimeout: 60000, // Other database settings use defaults
  },

  authProviders: [
    // Your auth provider configuration
  ]
};
```

## Configuration Structure

### Default Files

- `defaults/codegen.defaults.cjs` - CodeGen configuration
- `defaults/mjserver.defaults.cjs` - MJAPI server configuration
- `defaults/mcpserver.defaults.cjs` - MCP server configuration
- `defaults/a2aserver.defaults.cjs` - A2A server configuration
- `defaults/querygen.defaults.cjs` - QueryGen configuration

### Merge Rules

1. **Primitives** (string, number, boolean): User value replaces default
2. **Objects**: Recursively merged (user properties override defaults)
3. **Arrays**: User array replaces default array entirely
4. **Special `_append` syntax**: Concatenates arrays instead of replacing

Example:

```javascript
// Default config has:
{ excludeSchemas: ['sys', 'staging'] }

// Your config uses _append:
{ excludeSchemas_append: ['internal'] }

// Result:
{ excludeSchemas: ['sys', 'staging', 'internal'] }
```

## Environment Variables

Environment variables always take precedence:

- `DB_HOST` - Database host
- `DB_DATABASE` - Database name
- `DB_USERNAME` - Database username
- `DB_PASSWORD` - Database password
- `GRAPHQL_PORT` - GraphQL server port
- `MJ_CORE_SCHEMA` - Core schema name
- See full list in [config-loader.ts](src/config-loader.ts)

## API Reference

### loadMJConfig(options)

Loads and merges configuration from all sources.

**Options:**
- `searchFrom?: string` - Directory to start config file search (default: `process.cwd()`)
- `requireConfigFile?: boolean` - Throw error if no config file found (default: `false`)
- `mergeOptions?: MergeOptions` - Custom merge behavior
- `verbose?: boolean` - Log loading details (default: `false`)

**Returns:** `Promise<LoadConfigResult<MJConfig>>`

### mergeConfigs(defaults, overrides, options)

Deep merges user configuration into defaults.

**Parameters:**
- `defaults: T` - Default configuration object
- `overrides: Partial<T>` - User override configuration
- `options?: MergeOptions` - Merge behavior options

**Returns:** `T` - Merged configuration

### MergeOptions

- `concatenateArrays?: boolean` - Concatenate arrays instead of replacing (default: `false`)
- `allowNullOverrides?: boolean` - Allow null to override defaults (default: `false`)

## Examples

### Minimal Production Config

```javascript
module.exports = {
  authProviders: [
    { name: 'azure', type: 'msal', /* ... */ }
  ],
  enableIntrospection: false,
};
```

### Development Config with Overrides

```javascript
module.exports = {
  graphqlPort: 4001,
  verboseOutput: true,

  databaseSettings: {
    connectionTimeout: 90000,
  },

  telemetry: {
    enabled: false, // Disable in dev
  },
};
```

### Adding to Exclude Lists

```javascript
module.exports = {
  // Append to default exclusions instead of replacing
  excludeSchemas_append: ['internal', 'temp'],
  excludeTables_append: [
    { schema: 'dbo', table: 'temp_%' }
  ],
};
```

## Migration Guide

### Before (530-line config file)

```javascript
module.exports = {
  // 530 lines of configuration...
  verboseOutput: false,
  settings: [ /* ... */ ],
  logging: { /* ... */ },
  // ... many more lines ...
};
```

### After (minimal overrides only)

```javascript
module.exports = {
  // Only what you need to override
  graphqlPort: 5000,
  authProviders: [ /* ... */ ],
};
```

## See Also

- [MemberJunction Developer Guide](../../../CLAUDE.md)
- [ServerBootstrap Package](../../ServerBootstrap/README.md)
- [CodeGenLib Package](../../CodeGenLib/README.md)
```

**5.2 Update Main CLAUDE.md**

**File**: `/CLAUDE.md`

Add new section after line 30:

```markdown
## Configuration System

MemberJunction uses a hierarchical configuration system provided by `@memberjunction/config`:

### Configuration Priority (highest to lowest)
1. **Environment Variables** - Always take precedence
2. **User Config File** - Optional `mj.config.cjs` in project root
3. **Framework Defaults** - Standard configurations from `@memberjunction/config`

### Creating Configuration Overrides

Create `mj.config.cjs` in your project root with **only** the settings you want to override:

```javascript
/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  graphqlPort: 5000, // Override default port

  databaseSettings: {
    connectionTimeout: 60000, // Other database settings use defaults
  },

  authProviders: [
    // Your auth provider configuration
  ]
};
```

**Key Benefits:**
- No need to copy entire default configuration
- Smaller, more maintainable config files
- Automatic updates when framework defaults improve
- Clear distinction between framework defaults and deployment customizations

See `@memberjunction/config` package documentation for complete details.
```

**5.3 Update MJAPI README**

**File**: `packages/MJAPI/README.md`

Update configuration section to reference new system.

### Phase 6: Create Distribution Package Template

**6.1 Distribution Package Structure**

Create template structure for customer distributions:

```
customer-deployment/
├── package.json
├── .env.example
├── mj.config.cjs (minimal)
├── README.md
└── node_modules/
    └── @memberjunction/
        ├── config (contains defaults)
        ├── server-bootstrap
        ├── server
        └── ... (other MJ packages)
```

**6.2 Distribution README Template**

**File**: `distribution-template/README.md`

```markdown
# MemberJunction Distribution Package

This package contains a minimal MemberJunction deployment.

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
DB_HOST=your-database-server
DB_DATABASE=your-database
DB_USERNAME=your-username
DB_PASSWORD=your-password

TENANT_ID=your-azure-tenant-id
WEB_CLIENT_ID=your-azure-client-id
```

### Configuration File (Optional)

The `mj.config.cjs` file contains deployment-specific overrides.

**You only need to specify settings you want to override.**

All unspecified settings use framework defaults from `@memberjunction/config`.

Example:

```javascript
module.exports = {
  // Override port
  graphqlPort: 5000,

  // Override user handling
  userHandling: {
    autoCreateNewUsers: false,
    newUserRoles: ['UI']
  },

  // Everything else uses defaults
};
```

See [Configuration Documentation](https://docs.memberjunction.com/config) for all available options.

## Running

```bash
npm start
```

## Updating

```bash
npm update @memberjunction/config
npm update @memberjunction/server-bootstrap
npm update @memberjunction/server
```

Framework default configurations are automatically updated when you update packages.
```

### Phase 7: Migration Strategy

**7.1 Monorepo Migration**

1. Create `@memberjunction/config` package with defaults
2. Build and test the package
3. Update `ServerBootstrap`, `CodeGenLib`, `MJCLI` to use new config loader
4. Test that existing `mj.config.cjs` still works (backward compatible)
5. Replace monorepo root `mj.config.cjs` with minimal version
6. Verify all systems still work correctly

**7.2 Distribution Package Creation Script**

**File**: `scripts/create-distribution-config.js`

```javascript
/**
 * Script to analyze existing mj.config.cjs and generate minimal override version.
 * Compares user config against defaults and only includes differences.
 */

const { loadMJConfig, mergeConfigs } = require('@memberjunction/config');
const fs = require('fs');
const path = require('path');

async function createMinimalConfig(sourcePath, outputPath) {
  console.log('Creating minimal configuration...');

  // Load full config from source
  const fullConfig = require(sourcePath);

  // Load defaults
  const { config: defaultConfig } = await loadMJConfig({
    searchFrom: path.dirname(sourcePath),
    requireConfigFile: false
  });

  // Identify differences
  const overrides = extractOverrides(fullConfig, defaultConfig);

  // Generate minimal config file
  const minimalConfig = generateConfigFile(overrides);

  // Write to output
  fs.writeFileSync(outputPath, minimalConfig, 'utf8');

  console.log(`✓ Created minimal config: ${outputPath}`);
  console.log(`  Original: ${countLines(sourcePath)} lines`);
  console.log(`  Minimal: ${countLines(outputPath)} lines`);
}

function extractOverrides(full, defaults) {
  const overrides = {};

  for (const key in full) {
    if (JSON.stringify(full[key]) !== JSON.stringify(defaults[key])) {
      overrides[key] = full[key];
    }
  }

  return overrides;
}

function generateConfigFile(overrides) {
  return `/**
 * MemberJunction Configuration Overrides
 *
 * This file contains deployment-specific overrides.
 * All unspecified settings use defaults from @memberjunction/config.
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = ${JSON.stringify(overrides, null, 2)};
`;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

// Run if called directly
if (require.main === module) {
  const sourcePath = process.argv[2] || './mj.config.cjs';
  const outputPath = process.argv[3] || './mj.config.minimal.cjs';

  createMinimalConfig(sourcePath, outputPath)
    .then(() => console.log('✓ Done'))
    .catch(err => {
      console.error('✗ Error:', err.message);
      process.exit(1);
    });
}

module.exports = { createMinimalConfig };
```

## Key Design Decisions

### 1. Array Merge Strategy

**Decision**: Arrays replace by default (not concatenate)

**Rationale**:
- Most config arrays represent complete sets (auth providers, output targets)
- Partial merging would be confusing and error-prone
- Provide explicit `_append` suffix for additive behavior when needed

### 2. Package Location

**Decision**: Place in `packages/Core/config/` (not `packages/Config/`)

**Rationale**:
- Groups with other core packages (MJCore, MJCoreEntities)
- Indicates fundamental framework dependency
- Matches existing organizational pattern

### 3. Cosmiconfig vs Custom Search

**Decision**: Continue using cosmiconfig for file search

**Rationale**:
- Industry-standard configuration search library
- Supports multiple file formats and locations
- Well-tested and maintained
- Familiar to JavaScript/TypeScript developers

### 4. Backward Compatibility

**Decision**: Existing full `mj.config.cjs` files must continue to work

**Rationale**:
- Migration is optional, not forced
- No breaking changes for existing deployments
- Gradual adoption path

### 5. Environment Variable Precedence

**Decision**: Environment variables always override config files

**Rationale**:
- Follows 12-factor app principles
- Essential for containerized deployments
- Enables per-environment customization without file changes

### 6. Validation Timing

**Decision**: Validate after merging (not before)

**Rationale**:
- Allows partial configs to pass through merger
- Only validate complete, final configuration
- Better error messages (shows final resolved values)

## Implementation Checklist

### Phase 1: Package Creation
- [ ] Create `packages/Core/config/` directory structure
- [ ] Create `package.json` with dependencies
- [ ] Extract default configs into separate `.cjs` files
- [ ] Create `config-merger.ts` with deep merge logic
- [ ] Create `config-loader.ts` with cosmiconfig integration
- [ ] Create `config-types.ts` with type re-exports
- [ ] Create `index.ts` package exports
- [ ] Write unit tests for merge logic
- [ ] Build package: `cd packages/Core/config && npm run build`

### Phase 2: Package Integration
- [ ] Update `ServerBootstrap` to use `loadMJConfig()`
- [ ] Update `CodeGenLib` to use `loadMJConfig()`
- [ ] Update `MJCLI` to use `loadMJConfig()`
- [ ] Add `@memberjunction/config` dependency to consuming packages
- [ ] Build all affected packages
- [ ] Test with existing full `mj.config.cjs` (backward compat)

### Phase 3: Monorepo Updates
- [ ] Create minimal `mj.config.cjs` for monorepo root
- [ ] Test all systems (CodeGen, MJAPI, MCP, A2A)
- [ ] Verify environment variables still work
- [ ] Verify verbose logging shows config sources

### Phase 4: Documentation
- [ ] Write `packages/Core/config/README.md`
- [ ] Update main `CLAUDE.md` with config section
- [ ] Update `packages/MJAPI/README.md`
- [ ] Update `packages/ServerBootstrap/README.md`
- [ ] Create migration guide document

### Phase 5: Distribution Tools
- [ ] Create distribution package template
- [ ] Create `scripts/create-distribution-config.js`
- [ ] Test distribution package creation
- [ ] Document distribution package structure

### Phase 6: Testing & Validation
- [ ] Unit tests for merge logic (primitives, objects, arrays)
- [ ] Unit tests for `_append` syntax
- [ ] Integration test: load config with overrides
- [ ] Integration test: load config with no file (defaults only)
- [ ] Integration test: environment variable precedence
- [ ] Test with minimal config (~30 lines)
- [ ] Test with full config (backward compat)
- [ ] Test validation errors

## Testing Strategy

### Unit Tests

**File**: `packages/Core/config/src/__tests__/config-merger.test.ts`

```typescript
import { mergeConfigs } from '../config-merger';

describe('mergeConfigs', () => {
  test('primitives: user overrides default', () => {
    const defaults = { port: 4000, host: 'localhost' };
    const overrides = { port: 5000 };
    const result = mergeConfigs(defaults, overrides);

    expect(result).toEqual({ port: 5000, host: 'localhost' });
  });

  test('objects: deep merge', () => {
    const defaults = {
      database: { timeout: 30000, retries: 3 }
    };
    const overrides = {
      database: { timeout: 60000 }
    };
    const result = mergeConfigs(defaults, overrides);

    expect(result).toEqual({
      database: { timeout: 60000, retries: 3 }
    });
  });

  test('arrays: replace by default', () => {
    const defaults = { items: [1, 2, 3] };
    const overrides = { items: [4, 5] };
    const result = mergeConfigs(defaults, overrides);

    expect(result).toEqual({ items: [4, 5] });
  });

  test('arrays: concatenate with _append suffix', () => {
    const defaults = { excludeSchemas: ['sys', 'staging'] };
    const overrides = { excludeSchemas_append: ['internal'] };
    const result = mergeConfigs(defaults, overrides);

    expect(result).toEqual({
      excludeSchemas: ['sys', 'staging', 'internal']
    });
    expect(result).not.toHaveProperty('excludeSchemas_append');
  });

  test('null handling: preserves defaults by default', () => {
    const defaults = { value: 'default' };
    const overrides = { value: null };
    const result = mergeConfigs(defaults, overrides);

    expect(result).toEqual({ value: 'default' });
  });

  test('null handling: overrides when allowNullOverrides is true', () => {
    const defaults = { value: 'default' };
    const overrides = { value: null };
    const result = mergeConfigs(defaults, overrides, {
      allowNullOverrides: true
    });

    expect(result).toEqual({ value: null });
  });
});
```

### Integration Tests

**File**: `packages/Core/config/src/__tests__/config-loader.test.ts`

Test scenarios:
1. Load with no config file (defaults only)
2. Load with minimal config file (overrides merge correctly)
3. Load with full config file (backward compat)
4. Environment variables override config file values
5. Invalid config path throws error when `requireConfigFile: true`
6. Validation detects unexpected keys

### Manual Testing

1. **Baseline**: Start MJAPI with no config file → uses all defaults
2. **Minimal Override**: Create 10-line config → verify overrides work
3. **Environment Priority**: Set `GRAPHQL_PORT` env var → overrides config file
4. **Backward Compat**: Use existing full config → everything works as before
5. **Verbose Logging**: Enable verbose mode → see config sources in console

## Security Considerations

### Configuration File Security
- Config files are code (`.cjs` extension) - already trusted execution context
- No additional security risks compared to current system
- Still recommend storing secrets in environment variables

### Default Exposure
- Default configurations are public (in npm package)
- Do not include any secrets, credentials, or sensitive defaults
- Use environment variables for all sensitive values

### Distribution Packages
- Minimal config reduces surface area for misconfiguration
- Easier to audit (fewer lines to review)
- Defaults are maintained by framework (security updates apply automatically)

## Benefits Summary

### For Framework Maintainers
- ✅ Single source of truth for default configurations
- ✅ Easier to update defaults across all deployments
- ✅ Clearer distinction between framework and deployment settings
- ✅ Better testability (defaults are in code, not scattered)

### For Deployment Administrators
- ✅ Minimal config files (30-100 lines instead of 500+)
- ✅ Only override what you need
- ✅ Automatic updates when upgrading framework packages
- ✅ Clearer understanding of customizations
- ✅ Less maintenance burden

### For Developers
- ✅ Easier to understand what's customized vs default
- ✅ Better TypeScript support (types from package)
- ✅ Reusable config utilities (mergeConfigs, loadMJConfig)
- ✅ Consistent configuration across all MJ packages

## Migration Timeline

### Week 1: Package Creation
- Create `@memberjunction/config` package
- Implement merger and loader
- Write unit tests
- Build and publish to local registry

### Week 2: Integration
- Update `ServerBootstrap` package
- Update `CodeGenLib` package
- Update `MJCLI` package
- Test backward compatibility

### Week 3: Monorepo Updates
- Create minimal `mj.config.cjs` for monorepo
- Test all systems end-to-end
- Fix any issues discovered

### Week 4: Documentation & Distribution
- Complete all documentation
- Create distribution package template
- Create migration script
- Final testing

## Success Criteria

### Implementation Complete When:
- ✅ `@memberjunction/config` package builds without errors
- ✅ All unit tests pass
- ✅ All consuming packages updated and building
- ✅ Backward compatibility verified (existing full configs work)
- ✅ Minimal config tested and working
- ✅ Environment variables override correctly
- ✅ Documentation complete

### Feature Working When:
- ✅ New deployments can use 30-line config files
- ✅ Config changes in defaults propagate via package updates
- ✅ Verbose logging shows config sources clearly
- ✅ Validation catches configuration errors
- ✅ Distribution package template is usable

## Future Enhancements (Out of Scope)

1. **Config Schema Documentation Generator**: Auto-generate docs from Zod schemas
2. **Config Validation CLI**: `npx mj config validate` command
3. **Config Diff Tool**: Compare your config against defaults
4. **Environment-Specific Configs**: `mj.config.dev.cjs`, `mj.config.prod.cjs`
5. **Config Migration Tool**: Automated migration from full to minimal config
6. **Web-Based Config Editor**: Visual editor for creating config overrides

## References

### Related Files
- Current config: [mj.config.cjs](../../mj.config.cjs)
- ServerBootstrap: [packages/ServerBootstrap/src/index.ts](../../packages/ServerBootstrap/src/index.ts)
- CodeGenLib config: [packages/CodeGenLib/src/Config/config.ts](../../packages/CodeGenLib/src/Config/config.ts)

### Documentation
- MemberJunction Developer Guide: [CLAUDE.md](../../CLAUDE.md)
- Optional Dynamic Imports Plan: [optional-dynamic-imports-mjapi.md](./optional-dynamic-imports-mjapi.md)

### Libraries
- [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) - Configuration file search
- [lodash.mergewith](https://lodash.com/docs/#mergeWith) - Deep merge utility
- [Zod](https://zod.dev/) - Schema validation

---

**Plan Status**: Ready for implementation
**Estimated Effort**: 2-3 weeks (1 week for core implementation, 1 week for integration/testing, 1 week for docs/distribution)
**Risk Level**: Low (backward compatible, well-isolated changes)
**Priority**: High (significantly improves deployment experience)
