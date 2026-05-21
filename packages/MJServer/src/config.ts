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
  /**
   * When set, enables variable-count-based batch separation.
   * A batch separator is emitted only when the accumulated DECLARE @ count reaches this threshold,
   * instead of after every statement. Prevents hitting SQL Server's 10,000-variable-per-batch limit
   * on large migration files while avoiding one GO per statement. Recommended: 200.
   * Set to 0 to use the legacy per-statement behavior.
   */
  variableBatchThreshold: z.coerce.number().optional().default(200),
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

const queryDialectSchema = z.object({
  /** When true, saving a Query entity auto-generates QuerySQL entries for configured target dialects */
  autoConvertOnSave: zodBooleanWithTransforms().default(false),
  /** List of SQLDialect PlatformKey values to auto-convert to (e.g., ['postgresql']) */
  targetPlatforms: z.array(z.string()).optional().default([]),
});

const multiTenancySchema = z.object({
  /** Master switch — when false (default), no tenant isolation is applied */
  enabled: zodBooleanWithTransforms().default(false),
  /** How the tenant ID is determined for each request */
  contextSource: z.enum(['header', 'linkedEntity', 'custom']).default('header'),
  /** HTTP header name used when contextSource is 'header' */
  tenantHeader: z.string().default('X-Tenant-ID'),
  /** Whether scopedEntities is an allowlist or denylist of entities to filter */
  scopingStrategy: z.enum(['allowlist', 'denylist']).default('denylist'),
  /** Entities included/excluded from tenant filtering based on scopingStrategy */
  scopedEntities: z.array(z.string()).default([]),
  /** When true, entities in the __mj core schema are never tenant-filtered */
  autoExcludeCoreEntities: zodBooleanWithTransforms().default(true),
  /** Default column name containing the tenant identifier */
  defaultTenantColumn: z.string().default('OrganizationID'),
  /** Per-entity overrides for the tenant column name: { "EntityName": "ColumnName" } */
  entityColumnMappings: z.record(z.string()).default({}),
  /** Roles that bypass tenant filtering entirely */
  adminRoles: z.array(z.string()).default(['Admin', 'System']),
  /** Write protection mode: 'strict' rejects, 'log' warns, 'off' skips validation */
  writeProtection: z.enum(['strict', 'log', 'off']).default('strict'),
});

const telemetrySchema = z.object({
  enabled: zodBooleanWithTransforms().default(
    process.env.MJ_TELEMETRY_ENABLED !== 'false' // Enabled by default unless explicitly disabled
  ),
  level: z.enum(['minimal', 'standard', 'verbose', 'debug']).optional().default('standard'),
});

const serverExtensionSchema = z.object({
  Enabled: z.boolean().default(true),
  DriverClass: z.string(),
  RootPath: z.string(),
  Settings: z.record(z.unknown()).default({})
}).passthrough();

const cacheSettingsSchema = z.object({
  /** Maximum total estimated memory for all cached results in MB. Default: 150. Set to 0 to disable memory-based eviction. */
  maxMemoryMB: z.number().optional().default(150),
  /** Maximum percentage of total cache memory that any single entity can occupy. Default: 50. Set to 0 to disable. */
  maxPercentOfCachePerEntity: z.number().optional().default(50),
  /** Default TTL in seconds. 0 = no TTL, rely on event-based invalidation. Default: 0. */
  defaultTTLSeconds: z.number().optional().default(0),
  /** Interval in seconds for periodic eviction sweep. 0 = disabled. Default: 300 (5 minutes). */
  evictionSweepIntervalSeconds: z.number().optional().default(300),
  /** Enable verbose cache logging (hits, misses, evictions). Default: false. */
  verboseLogging: z.boolean().optional().default(false),
});

const feedbackGithubSettingsSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  defaultLabels: z.array(z.string()).optional(),
  categoryLabels: z.record(z.string()).optional(),
  severityLabels: z.record(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  /**
   * Shared secret used to verify GitHub webhook signatures (X-Hub-Signature-256).
   * Required to enable the feedback notification webhook endpoint. Configure the
   * same value here and in the GitHub repository's webhook settings.
   * Can also be supplied via the GITHUB_FEEDBACK_WEBHOOK_SECRET env var.
   */
  webhookSecret: z.string().optional(),
});

const feedbackNotificationsSettingsSchema = z.object({
  /**
   * Org-level kill switch for outbound feedback emails (confirmation, status
   * changes, new comments). Defaults to true (enabled). When false the
   * SubmitFeedback resolver still records tracking rows but skips email sends.
   */
  enabled: z.boolean().optional().default(true),
  /**
   * Sender address used for all feedback notification emails. Should be a
   * no-reply address that the recipient cannot meaningfully reply to.
   * Can be overridden by the FEEDBACK_NOTIFICATIONS_FROM env var.
   */
  fromAddress: z.string().optional(),
  /**
   * Human-friendly application name used in email subject lines and bodies
   * (e.g., "Acme Portal"). Lets a deployment brand its notifications without
   * hardcoding "MemberJunction". Falls back to the submission's appName field,
   * then to "MemberJunction".
   */
  appName: z.string().optional(),
  /**
   * Name of the registered CommunicationEngine provider used to send feedback
   * emails. Must match a provider name in the `MJ: Communication Providers`
   * entity (e.g., "SendGrid", "MS Graph", "Gmail"). Defaults to "SendGrid".
   */
  providerName: z.string().optional().default('SendGrid'),
  /**
   * Name of the message type within the chosen provider to use. Must match
   * a message-type name configured on the provider (e.g., "Standard Email").
   * Defaults to "Standard Email".
   */
  messageTypeName: z.string().optional().default('Standard Email'),
});

const feedbackSettingsSchema = z.object({
  /** Org-level kill switch for the in-app feedback feature. Defaults to true (enabled). */
  enabled: z.boolean().optional().default(true),
  /** Optional GitHub-specific settings used by the feedback resolver. */
  github: feedbackGithubSettingsSchema.optional(),
  /**
   * Optional outbound-email settings used to notify submitters about the
   * status of their feedback. See feedbackNotificationsSettingsSchema for
   * field-level docs.
   */
  notifications: feedbackNotificationsSettingsSchema.optional(),
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
  queryDialects: queryDialectSchema.optional().default({}),
  multiTenancy: multiTenancySchema.optional().default({}),
  serverExtensions: z.array(serverExtensionSchema).optional().default([]),
  cacheSettings: cacheSettingsSchema.optional().default({}),
  feedbackSettings: feedbackSettingsSchema.optional().default({}),

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
export type QueryDialectConfig = z.infer<typeof queryDialectSchema>;
export type MultiTenancyConfig = z.infer<typeof multiTenancySchema>;
export type ServerExtensionConfig = z.infer<typeof serverExtensionSchema>;
export type CacheSettingsConfig = z.infer<typeof cacheSettingsSchema>;
export type FeedbackGithubSettingsConfig = z.infer<typeof feedbackGithubSettingsSchema>;
export type FeedbackNotificationsSettingsConfig = z.infer<typeof feedbackNotificationsSettingsSchema>;
export type FeedbackSettingsConfig = z.infer<typeof feedbackSettingsSchema>;
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

  // Cache settings defaults
  cacheSettings: {
    maxMemoryMB: 150,
    maxPercentOfCachePerEntity: 50,
    defaultTTLSeconds: 0,
    evictionSweepIntervalSeconds: 300,
    verboseLogging: false,
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
    // AWS Cognito
    process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID && process.env.AWS_REGION ? {
      name: 'cognito',
      type: 'cognito',
      issuer: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
      audience: process.env.COGNITO_CLIENT_ID,
      jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
      clientId: process.env.COGNITO_CLIENT_ID,
      region: process.env.AWS_REGION,
      userPoolId: process.env.COGNITO_USER_POOL_ID
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
