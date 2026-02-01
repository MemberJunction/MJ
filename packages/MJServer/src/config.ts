import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/core';
import { mergeConfigs, parseBooleanEnv } from '@memberjunction/config';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const userHandlingInfoSchema = z.object({
  autoCreateNewUsers: z.boolean().optional().default(false),
  newUserLimitedToAuthorizedDomains: z.boolean().optional().default(false),
  newUserAuthorizedDomains: z.array(z.string()).optional().default([]),
  newUserRoles: z.array(z.string()).optional().default([]),
  updateCacheWhenNotFound: z.boolean().optional().default(false),
  updateCacheWhenNotFoundDelay: z.number().optional().default(30000),
  contextUserForNewUserCreation: z.string().optional().default(''),
  CreateUserApplicationRecords: z.boolean().optional().default(false),
  UserApplications: z.array(z.string()).optional().default([]),
});

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  metadataCacheRefreshInterval: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
  connectionPool: z.object({
    max: z.number().optional().default(50),
    min: z.number().optional().default(5),
    idleTimeoutMillis: z.number().optional().default(30000),
    acquireTimeoutMillis: z.number().optional().default(30000),
  }).optional().default({}),
});
 
const viewingSystemInfoSchema = z.object({
  enableSmartFilters: z.boolean().optional(),
});

const restApiOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  includeEntities: z.array(z.string()).optional(),
  excludeEntities: z.array(z.string()).optional(),
  includeSchemas: z.array(z.string()).optional(),
  excludeSchemas: z.array(z.string()).optional(),
});

/**
 * Returns a new Zod object that accepts boolean, string, or number values and transforms them to boolean.
 * @returns 
 */
const zodBooleanWithTransforms = () => {
  return z
      .union([z.boolean(), z.string(), z.number()])
          .optional()
          .default(false)
          .transform((v) => {
            if (typeof v === 'string') {
              return v === '1' || v.toLowerCase() === 'true';
            }
            else if (typeof v === 'number') {
              return v === 1;
            }
            else if (typeof v === 'boolean') {
              return v;
            }
            else {
              return false;
            }
          })
}

const askSkipInfoSchema = z.object({
  url: z.string().optional(), // Base URL for Skip API
  apiKey: z.string().optional(),
  orgID: z.string().optional(),
  organizationInfo: z.string().optional(),
  entitiesToSend: z
    .object({
      excludeSchemas: z.array(z.string()).optional(),
      includeEntitiesFromExcludedSchemas: z.array(z.string()).optional(),
    })
    .optional(),
  chatURL: z.string().optional(),
  learningCycleRunUponStartup: zodBooleanWithTransforms(),
  learningCycleEnabled: zodBooleanWithTransforms(),
  learningCycleURL: z.string().optional(),
  learningCycleIntervalInMinutes: z.coerce.number().optional(),
});

const sqlLoggingOptionsSchema = z.object({
  formatAsMigration: z.boolean().optional().default(false),
  statementTypes: z.enum(['queries', 'mutations', 'both']).optional().default('both'),
  batchSeparator: z.string().optional().default('GO'),
  prettyPrint: z.boolean().optional().default(true),
  logRecordChangeMetadata: z.boolean().optional().default(false),
  retainEmptyLogFiles: z.boolean().optional().default(false),
  verboseOutput: z.boolean().optional().default(false),
});

const sqlLoggingSchema = z.object({
  enabled: z.boolean().optional().default(false),
  defaultOptions: sqlLoggingOptionsSchema.optional().default({}),
  allowedLogDirectory: z.string().optional().default('./logs/sql'),
  maxActiveSessions: z.number().optional().default(5),
  autoCleanupEmptyFiles: z.boolean().optional().default(true),
  sessionTimeout: z.number().optional().default(3600000), // 1 hour
});

const authProviderSchema = z.object({
  name: z.string(),
  type: z.string(),
  issuer: z.string(),
  audience: z.string(),
  jwksUri: z.string(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  tenantId: z.string().optional(),
  domain: z.string().optional(),
}).passthrough(); // Allow additional provider-specific fields

const componentRegistrySchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  apiKey: z.string().optional(),
  cache: z.boolean().optional().default(true),
  timeout: z.number().optional(),
  retryPolicy: z.object({
    maxRetries: z.number().optional(),
    initialDelay: z.number().optional(),
    maxDelay: z.number().optional(),
    backoffMultiplier: z.number().optional(),
  }).optional(),
  headers: z.record(z.string()).optional(),
}).passthrough(); // Allow additional fields

const scheduledJobsSchema = z.object({
  enabled: z.boolean().optional().default(false),
  systemUserEmail: z.string().optional().default('system@memberjunction.org'),
  maxConcurrentJobs: z.number().optional().default(5),
  defaultLockTimeout: z.number().optional().default(600000), // 10 minutes in ms
  staleLockCleanupInterval: z.number().optional().default(300000), // 5 minutes in ms
});

const telemetrySchema = z.object({
  enabled: zodBooleanWithTransforms().default(
    process.env.MJ_TELEMETRY_ENABLED !== 'false' // Enabled by default unless explicitly disabled
  ),
  level: z.enum(['minimal', 'standard', 'verbose', 'debug']).optional().default('standard'),
});

const configInfoSchema = z.object({
  userHandling: userHandlingInfoSchema,
  databaseSettings: databaseSettingsInfoSchema,
  viewingSystem: viewingSystemInfoSchema.optional(),
  restApiOptions: restApiOptionsSchema.optional().default({}),
  askSkip: askSkipInfoSchema.optional(),
  sqlLogging: sqlLoggingSchema.optional(),
  authProviders: z.array(authProviderSchema).optional(),
  componentRegistries: z.array(componentRegistrySchema).optional(),
  scheduledJobs: scheduledJobsSchema.optional().default({}),
  telemetry: telemetrySchema.optional().default({}),

  apiKey: z.string().optional(),
  baseUrl: z.string().default('http://localhost'),
  publicUrl: z.string().optional().default(process.env.MJAPI_PUBLIC_URL || ''), // Public URL for callbacks (e.g., ngrok URL when developing)

  dbHost: z.string().default('localhost'),
  dbDatabase: z.string(),
  dbPort: z.number({ coerce: true }).default(1433),
  dbUsername: z.string(),
  dbPassword: z.string(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
  dbTrustServerCertificate: z.coerce
    .boolean()
    .default(false)
    .transform((v) => (v ? 'Y' : 'N')),
  dbInstanceName: z.string().optional(),
  graphqlPort: z.coerce.number().default(4000),

  ___codeGenAPIURL: z.string().optional(),
  ___codeGenAPIPort: z.coerce.number().optional().default(3999),
  ___codeGenAPISubmissionDelay: z.coerce.number().optional().default(5000),
  graphqlRootPath: z.string().optional().default('/'),
  enableIntrospection: z.coerce.boolean().optional().default(false),
  websiteRunFromPackage: z.coerce.number().optional(),
  userEmailMap: z
    .string()
    .transform((val) => z.record(z.string()).parse(JSON.parse(val)))
    .optional(),
  mjCoreSchema: z.string(),
});

export type UserHandlingInfo = z.infer<typeof userHandlingInfoSchema>;
export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
export type ViewingSystemSettingsInfo = z.infer<typeof viewingSystemInfoSchema>;
export type RESTApiOptions = z.infer<typeof restApiOptionsSchema>;
export type AskSkipInfo = z.infer<typeof askSkipInfoSchema>;
export type SqlLoggingOptions = z.infer<typeof sqlLoggingOptionsSchema>;
export type SqlLoggingInfo = z.infer<typeof sqlLoggingSchema>;
export type AuthProviderConfig = z.infer<typeof authProviderSchema>;
export type ComponentRegistryConfig = z.infer<typeof componentRegistrySchema>;
export type ScheduledJobsConfig = z.infer<typeof scheduledJobsSchema>;
export type TelemetryConfig = z.infer<typeof telemetrySchema>;
export type ConfigInfo = z.infer<typeof configInfoSchema>;

/**
 * Default MJServer configuration values.
 * These provide sensible defaults for all optional settings, with environment variable overrides.
 *
 * Priority order (highest to lowest):
 * 1. User's mj.config.cjs overrides
 * 2. Environment variables (referenced here in defaults)
 * 3. Hardcoded default values
 *
 * This means minimal configs only need to override if they want something different
 * than both the environment variable AND the default value.
 */
export const DEFAULT_SERVER_CONFIG: Partial<ConfigInfo> = {
  // Database connection settings (environment-driven with defaults)
  dbHost: process.env.DB_HOST ?? 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbReadOnlyUsername: process.env.DB_READ_ONLY_USERNAME,
  dbReadOnlyPassword: process.env.DB_READ_ONLY_PASSWORD,
  dbTrustServerCertificate: parseBooleanEnv(process.env.DB_TRUST_SERVER_CERTIFICATE) ? 'Y' : 'N',
  dbInstanceName: process.env.DB_INSTANCE_NAME,
  mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',

  // GraphQL server settings (environment-driven with defaults)
  graphqlPort: process.env.GRAPHQL_PORT ? parseInt(process.env.GRAPHQL_PORT, 10) : 4000,
  graphqlRootPath: process.env.GRAPHQL_ROOT_PATH ?? '/',
  baseUrl: process.env.GRAPHQL_BASE_URL ?? 'http://localhost',
  publicUrl: process.env.MJAPI_PUBLIC_URL,
  enableIntrospection: process.env.ENABLE_INTROSPECTION === 'true',
  apiKey: process.env.MJ_API_KEY,
  websiteRunFromPackage: process.env.WEBSITE_RUN_FROM_PACKAGE ? parseInt(process.env.WEBSITE_RUN_FROM_PACKAGE, 10) : undefined,

  // User handling defaults
  userHandling: {
    autoCreateNewUsers: true,
    newUserLimitedToAuthorizedDomains: false,
    newUserAuthorizedDomains: [],
    newUserRoles: ['UI', 'Developer'],
    updateCacheWhenNotFound: true,
    updateCacheWhenNotFoundDelay: 5000,
    contextUserForNewUserCreation: 'not.set@nowhere.com',
    CreateUserApplicationRecords: true,
    UserApplications: []
  },

  // Database settings (with environment variable for cache refresh)
  databaseSettings: {
    connectionTimeout: 45000,
    requestTimeout: 30000,
    metadataCacheRefreshInterval: isFinite(Number(process.env.METADATA_CACHE_REFRESH_INTERVAL))
      ? Number(process.env.METADATA_CACHE_REFRESH_INTERVAL)
      : 180000,
    connectionPool: {
      max: 50,
      min: 5,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 30000,
    }
  },

  // Viewing system defaults
  viewingSystem: {
    enableSmartFilters: true,
  },

  // REST API defaults
  restApiOptions: {
    enabled: false,
  },

  // Ask Skip configuration (environment-driven)
  askSkip: {
    url: process.env.ASK_SKIP_URL,
    chatURL: process.env.ASK_SKIP_CHAT_URL,
    learningCycleURL: process.env.ASK_SKIP_LEARNING_URL,
    learningCycleIntervalInMinutes: process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES
      ? parseInt(process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES, 10)
      : undefined,
    learningCycleEnabled: process.env.ASK_SKIP_RUN_LEARNING_CYCLES === 'true',
    learningCycleRunUponStartup: process.env.ASK_SKIP_RUN_LEARNING_CYCLES_UPON_STARTUP === 'true',
    orgID: process.env.ASK_SKIP_ORGANIZATION_ID,
    apiKey: process.env.ASK_SKIP_API_KEY,
    organizationInfo: process.env.ASK_SKIP_ORGANIZATION_INFO,
    entitiesToSend: {
      excludeSchemas: [],
      includeEntitiesFromExcludedSchemas: [],
    },
  },

  // SQL logging defaults
  sqlLogging: {
    enabled: true,
    defaultOptions: {
      formatAsMigration: false,
      statementTypes: 'both',
      batchSeparator: 'GO',
      prettyPrint: true,
      logRecordChangeMetadata: false,
      retainEmptyLogFiles: false,
      verboseOutput: false,
    },
    allowedLogDirectory: './logs/sql',
    maxActiveSessions: 5,
    autoCleanupEmptyFiles: true,
    sessionTimeout: 3600000
  },

  // Scheduled jobs defaults
  scheduledJobs: {
    enabled: true,
    systemUserEmail: 'not.set@nowhere.com',
    maxConcurrentJobs: 5,
    defaultLockTimeout: 600000,
    staleLockCleanupInterval: 300000
  },

  // Telemetry defaults
  telemetry: {
    enabled: true,
    level: 'standard'
  },

  // Auth providers (environment-driven)
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
};

export const configInfo: ConfigInfo = loadConfig();

export const {
  dbUsername,
  dbPassword,
  dbHost,
  dbDatabase,
  dbPort,
  dbTrustServerCertificate,
  dbInstanceName,
  graphqlPort,
  ___codeGenAPIURL,
  ___codeGenAPIPort,
  ___codeGenAPISubmissionDelay,
  graphqlRootPath,
  enableIntrospection,
  websiteRunFromPackage,
  userEmailMap,
  apiKey,
  baseUrl,
  publicUrl,
  mjCoreSchema: mj_core_schema,
  dbReadOnlyUsername,
  dbReadOnlyPassword,
  restApiOptions: RESTApiOptions,
} = configInfo;

export function loadConfig() {
  const configSearchResult = explorer.search(process.cwd());

  // Start with DEFAULT_SERVER_CONFIG as base
  let mergedConfig = DEFAULT_SERVER_CONFIG;

  // If user config exists, merge it with defaults
  if (configSearchResult && !configSearchResult.isEmpty) {
    LogStatus(`Config file found at ${configSearchResult.filepath}`);

    // Merge user config with defaults (user config takes precedence)
    mergedConfig = mergeConfigs(DEFAULT_SERVER_CONFIG, configSearchResult.config);
  } else {
    LogStatus(`No config file found, using DEFAULT_SERVER_CONFIG`);
  }

  // Validate the merged configuration
  const configParsing = configInfoSchema.safeParse(mergedConfig);
  if (!configParsing.success) {
    LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
    throw new Error('Configuration validation failed');
  }
  return configParsing.data;
}
