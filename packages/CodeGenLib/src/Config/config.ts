/**
 * Configuration management module for MemberJunction CodeGen.
 * Handles loading, parsing, and validation of configuration files using Zod schemas.
 * Supports various configuration sources through cosmiconfig (package.json, .mjrc, etc.).
 */

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import { logStatus } from '../Misc/status_logging';
import { LogError, DatabasePlatform } from '@memberjunction/core';
import { resolveDbPlatformFromEnv } from '@memberjunction/generic-database-provider';
import { mergeConfigs, parseBooleanEnv } from '@memberjunction/config';

/** Global configuration explorer for finding MJ config files */
const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
/** Initial config search result from current working directory */
const configSearchResult = explorer.search(process.cwd());

/**
 * Represents a general configuration setting with name-value pairs
 */
export type SettingInfo = z.infer<typeof settingInfoSchema>;
const settingInfoSchema = z.object({
  /** The name/key of the setting */
  name: z.string(),
  /** The value of the setting (can be any type) */
  value: z.any(),
});

/**
 * Configuration for logging behavior during code generation
 */
export type LogInfo = z.infer<typeof logInfoSchema>;
const logInfoSchema = z.object({
  /** Whether logging is enabled */
  log: z.boolean().default(true),
  /** File path for log output */
  logFile: z.string().default('codegen.output.log'),
  /** Whether to also log to console */
  console: z.boolean().default(true),
});

/**
 * Configuration for custom SQL scripts to run at specific times during code generation
 */
export type CustomSQLScript = z.infer<typeof customSQLScriptSchema>;
const customSQLScriptSchema = z.object({
  /** When to run the script (e.g., 'before-all', 'after-all') */
  when: z.string(),
  /** Path to the SQL script file */
  scriptFile: z.string(),
});

/**
 * Configuration for external commands to run during code generation
 */
export type CommandInfo = z.infer<typeof commandInfoSchema>;
const commandInfoSchema = z.object({
  /** Working directory to run the command from */
  workingDirectory: z.string(),
  /** The command to execute */
  command: z.string(),
  /** Command line arguments */
  args: z.string().array(),
  /** Optional timeout in milliseconds */
  timeout: z.number().nullish(),
  /** When to run the command (e.g., 'before', 'after') */
  when: z.string(),
});

/**
 * Configuration option for output generation
 */
export type OutputOptionInfo = z.infer<typeof outputOptionInfoSchema>;
const outputOptionInfoSchema = z.object({
  /** Name of the output option */
  name: z.string(),
  /** Value of the output option */
  value: z.any(),
});

/**
 * Configuration for code generation output destinations and options
 */
export type OutputInfo = z.infer<typeof outputInfoSchema>;
const outputInfoSchema = z.object({
  /** Type of output (e.g., 'SQL', 'Angular', 'GraphQLServer') */
  type: z.string(),
  /** Directory path for output files */
  directory: z.string(),
  /** Whether to append additional output code subdirectory */
  appendOutputCode: z.boolean().optional(),
  /** Additional options for this output type */
  options: outputOptionInfoSchema.array().optional(),
});

/**
 * Information about a database table for exclusion or filtering
 */
export type TableInfo = z.infer<typeof tableInfoSchema>;
const tableInfoSchema = z.object({
  /** Schema name (supports wildcards like '%') */
  schema: z.string(),
  /** Table name (supports wildcards like 'sys%') */
  table: z.string(),
});

/**
 * Configuration bundle for generating database schema JSON output
 */
export type DBSchemaJSONOutputBundle = z.infer<typeof dbSchemaJSONOutputBundleSchema>;
const dbSchemaJSONOutputBundleSchema = z.object({
  /** Name of the bundle */
  name: z.string(),
  /** Schemas to include in this bundle */
  schemas: z.string().array().default([]),
  /** Schemas to exclude from this bundle */
  excludeSchemas: z.string().array().default(['sys', 'staging']),
  /** Entities to exclude from this bundle */
  excludeEntities: z.string().array().default([]),
});

export type DBSchemaJSONOutput = z.infer<typeof dbSchemaJSONOutputSchema>;
const dbSchemaJSONOutputSchema = z.object({
  excludeEntities: z.string().array(),
  excludeSchemas: z.string().array().default(['sys', 'staging', 'dbo']),
  bundles: dbSchemaJSONOutputBundleSchema.array().default([{ name: '_Core_Apps', excludeSchemas: ['__mj'] }]),
});

export type NewUserSetup = z.infer<typeof newUserSetupSchema>;
const newUserSetupSchema = z.object({
  UserName: z.string(),
  FirstName: z.string(),
  LastName: z.string(),
  Email: z.string(),
  Roles: z.string().array().default(['Developer', 'Integration', 'UI']),
  CreateUserApplicationRecords: z.boolean().optional().default(false),
  UserApplications: z.array(z.string()).optional().default([]),
});

/**
 * Configuration option for an advanced generation feature
 */
export type AdvancedGenerationFeatureOption = z.infer<typeof advancedGenerationFeatureOptionSchema>;
const advancedGenerationFeatureOptionSchema = z.object({
  /** Name of the option */
  name: z.string(),
  /** Value of the option (can be any type) */
  value: z.unknown(),
});

/**
 * Configuration for an AI-powered advanced generation feature
 */
export type AdvancedGenerationFeature = z.infer<typeof advancedGenerationFeatureSchema>;
const advancedGenerationFeatureSchema = z.object({
  /** Name of the feature */
  name: z.string(),
  /** Whether the feature is enabled */
  enabled: z.boolean(),
  /** Description for documentation (not used by code) */
  description: z.string().nullish(),
  /** System prompt for AI interaction */
  systemPrompt: z.string().nullish(),
  /** User message template for AI interaction */
  userMessage: z.string().nullish(),
  /** Additional options for the feature */
  options: advancedGenerationFeatureOptionSchema.array().nullish(),
});

export type AdvancedGeneration = z.infer<typeof advancedGenerationSchema>;
const advancedGenerationSchema = z.object({
  enableAdvancedGeneration: z.boolean().default(true),
  /** When false (default), CodeGen will NOT auto-enable FullTextSearchEnabled on entities or fields,
   *  even if the AI smart field analysis recommends it. FTS requires database-level infrastructure
   *  (full-text catalogs, indexes, installed FTS components) that may not be present. Admins should
   *  enable this explicitly only when their database supports full-text search. */
  allowFullTextSearchAutoUpdate: z.boolean().default(false),
  /** Number of entities to process in parallel during advanced generation (default: 5).
   *  Higher values speed up processing but increase concurrent LLM API calls. */
  batchSize: z.number().min(1).default(5),
  // NOTE: AIVendor and AIModel have been removed. Model configuration is now per-prompt
  // in the AI Prompts table via the MJ: AI Prompt Models relationship.
  features: advancedGenerationFeatureSchema.array().default([
    {
      name: 'EntityNames',
      description: 'Use AI to generate better entity names when creating new entities',
      enabled: false,
    },
    {
      name: 'SmartFieldIdentification',
      description:
        'Use AI to determine the Name Field, Default In View fields, and Searchable fields for entities. This sets IsNameField, DefaultInView, and IncludeInUserSearchAPI properties on entity fields. Only applies when new entities/fields are created or when fields allow auto-update.',
      enabled: false,
    },
    {
      name: 'DefaultInViewFields',
      description:
        'Use AI to determine which fields in an entity should be shown, by default, in a newly created User View for the entity. This is only used when creating new entities and when new fields are detected.',
      enabled: false,
    },
    {
      name: 'EntityDescriptions',
      description: 'Use AI to generate descriptions for entities, only used when creating new entities',
      enabled: false,
    },
    {
      name: 'EntityFieldDescriptions',
      description: 'Use AI to generate descriptions for fields, only used when new fields are detected',
      enabled: false,
    },
    {
      name: 'FormLayout',
      description:
        'Use AI to generate better layouts for forms. This includes using AI to determine the way to layout fields on each entity form. The field will still be laid out in the order they are defined in the entity, but the AI will determine the best way to layout the fields on the form. Since generated forms are regenerated every time you run this tool, it will be done every time you run the tool, including for existing entities and fields.',
      enabled: false,
    },
    {
      name: 'FormTabs',
      description:
        "Use AI to decide which entity relationships should have visible tabs and the best order to display those tabs. All relationships will be generated based on the Database Schema, but the EntityRelationship.DisplayInForm. The idea is that the AI will pick which of these tabs should be visible by default. In some cases an entity will have a large # of relationships and it isn't necessarily a good idea to display all of them. This feature only applies when an entity is created or new Entity Relationships are detected. This tool will not change existing EntityRelationship records.",
      enabled: false,
    },
    {
      name: 'VirtualEntityFieldDecoration',
      description:
        'Use AI to analyze SQL view definitions for virtual entities and identify primary keys, foreign keys, and field descriptions. Only runs for virtual entities that lack soft PK/FK annotations. Respects explicit config-defined PKs/FKs (from additionalSchemaInfo) — LLM fills in the gaps.',
      enabled: true,
    },
  ]),
});

export type IntegrityCheckConfig = z.infer<typeof integrityCheckConfigSchema>;

const integrityCheckConfigSchema = z.object({
  enabled: z.boolean(),
  entityFieldsSequenceCheck: z.boolean(),
});

export type ForceRegenerationConfig = z.infer<typeof forceRegenerationConfigSchema>;

const forceRegenerationConfigSchema = z.object({
  /**
   * Force regeneration of all SQL objects even if no schema changes are detected
   */
  enabled: z.boolean().default(false),
  /**
   * Optional SQL WHERE clause to filter entities for forced regeneration
   * Example: "SchemaName = 'dbo' AND Name LIKE 'User%'"
   */
  entityWhereClause: z.string().optional(),
  /**
   * Force regeneration of base views
   */
  baseViews: z.boolean().default(false),
  /**
   * Force regeneration of spCreate procedures
   */
  spCreate: z.boolean().default(false),
  /**
   * Force regeneration of spUpdate procedures
   */
  spUpdate: z.boolean().default(false),
  /**
   * Force regeneration of spDelete procedures
   */
  spDelete: z.boolean().default(false),
  /**
   * Force regeneration of all stored procedures
   */
  allStoredProcedures: z.boolean().default(false),
  /**
   * Force regeneration of indexes for foreign keys
   */
  indexes: z.boolean().default(false),
  /**
   * Force regeneration of full text search components
   */
  fullTextSearch: z.boolean().default(false),
});

export type SQLOutputConfig = z.infer<typeof sqlOutputConfigSchema>;

const sqlOutputConfigSchema = z.object({
  /**
   * Whether or not sql statements generated while managing metadata should be written to a file
   */
  enabled: z.boolean().default(true),
  /**
   * The path of the folder to use when logging is enabled.
   * If provided, a file will be created with the format "CodeGen_Run_yyyy-mm-dd_hh-mm-ss.sql"
   */
  folderPath: z.string().default('../../migrations/v5/'),
  /**
   * Optional, the file name that will be written WITHIN the folderPath specified.
   */
  fileName: z.string().optional(),
  /**
   * If set to true, then we append to the existing file, if one exists, otherwise we create a new file.
   */
  appendToFile: z.boolean().default(true),
  /**
   * If true, all mention of the core schema within the log file will be replaced with the flyway schema,
   * ${flyway:defaultSchema}
   */
  convertCoreSchemaToFlywayMigrationFile: z.boolean().default(true),
  /**
   * If true, scripts that are being emitted via SQL logging that are marked by CodeGen as recurring will be SKIPPED. Defaults to false
   */
  omitRecurringScriptsFromLog: z.boolean().default(false),
  /**
   * Optional array of schema-to-placeholder mappings for Flyway migrations.
   * Each mapping specifies a database schema name and its corresponding Flyway placeholder.
   * If not provided, defaults to replacing the MJ core schema with ${flyway:defaultSchema}.
   *
   * Example:
   * [
   *   { schema: '__mj', placeholder: '${mjSchema}' },
   *   { schema: '__BCSaaS', placeholder: '${flyway:defaultSchema}' }
   * ]
   */
  schemaPlaceholders: z.array(z.object({
    schema: z.string(),
    placeholder: z.string()
  })).optional(),
});

const applicationRoleDefaultSchema = z.object({
  RoleName: z.string(),
  CanAccess: z.boolean(),
  CanAdmin: z.boolean(),
});

/**
 * Settings for an application role default
 */
export type ApplicationRoleDefault = z.infer<typeof applicationRoleDefaultSchema>;

const applicationRoleDefaultsSchema = z.object({
  AutoAddRolesForNewApplications: z.boolean().default(true),
  Roles: applicationRoleDefaultSchema.array().default([
    { RoleName: 'UI', CanAccess: true, CanAdmin: false },
    { RoleName: 'Developer', CanAccess: true, CanAdmin: true },
    { RoleName: 'Integration', CanAccess: true, CanAdmin: false },
  ]),
});

/**
 * Default role assignment settings for new applications
 */
export type ApplicationRoleDefaults = z.infer<typeof applicationRoleDefaultsSchema>;

export type NewSchemaDefaults = z.infer<typeof newSchemaDefaultsSchema>;
const newSchemaDefaultsSchema = z.object({
  CreateNewApplicationWithSchemaName: z.boolean().default(true),
  ApplicationRoleDefaults: applicationRoleDefaultsSchema.default({
    AutoAddRolesForNewApplications: true,
    Roles: [
      { RoleName: 'UI', CanAccess: true, CanAdmin: false },
      { RoleName: 'Developer', CanAccess: true, CanAdmin: true },
      { RoleName: 'Integration', CanAccess: true, CanAdmin: false },
    ],
  }),
});

const entityPermissionSchema = z.object({
  RoleName: z.string(),
  CanRead: z.boolean(),
  CanCreate: z.boolean(),
  CanUpdate: z.boolean(),
  CanDelete: z.boolean(),
});

/**
 * Permission settings for an entity role
 */
export type EntityPermission = z.infer<typeof entityPermissionSchema>;

const newEntityPermissionDefaultsSchema = z.object({
  AutoAddPermissionsForNewEntities: z.boolean().default(true),
  Permissions: entityPermissionSchema.array().default([
    { RoleName: 'UI', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
    { RoleName: 'Developer', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
    { RoleName: 'Integration', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
  ]),
});

/**
 * Default permission settings for new entities
 */
export type NewEntityPermissionDefaults = z.infer<typeof newEntityPermissionDefaultsSchema>;


export type EntityNameRulesBySchema = z.infer<typeof newEntityNameRulesBySchema>;
const newEntityNameRulesBySchema = z.object({
  SchemaName: z.string(),
  EntityNamePrefix: z.string().default(''),
  EntityNameSuffix: z.string().default(''),
});

export type AllowCachingBySchema = z.infer<typeof allowCachingBySchemaSchema>;
const allowCachingBySchemaSchema = z.object({
  SchemaName: z.string(),
  AllowCaching: z.boolean(),
});

const newEntityDefaultsSchema = z.object({
  TrackRecordChanges: z.boolean().default(true),
  AuditRecordAccess: z.boolean().default(false),
  AuditViewRuns: z.boolean().default(false),
  AllowAllRowsAPI: z.boolean().default(false),
  AllowCreateAPI: z.boolean().default(true),
  AllowUpdateAPI: z.boolean().default(true),
  AllowDeleteAPI: z.boolean().default(true),
  AllowUserSearchAPI: z.boolean().default(true),
  AllowCaching: z.boolean().default(false),
  CascadeDeletes: z.boolean().default(false),
  UserViewMaxRows: z.number().default(1000),
  AddToApplicationWithSchemaName: z.boolean().default(true),
  IncludeFirstNFieldsAsDefaultInView: z.number().default(5),
  PermissionDefaults: newEntityPermissionDefaultsSchema,
  NameRulesBySchema: newEntityNameRulesBySchema.array().default([]),
  /**
   * Per-schema overrides for the AllowCaching default. When CodeGen creates a new
   * Entity row, the schema is matched (case-insensitive) against this list and the
   * matching entry's AllowCaching value wins over the global AllowCaching default.
   * Schema names support the `${mj_core_schema}` placeholder. Defaults to enabling
   * caching for the MJ core schema.
   */
  AllowCachingBySchema: allowCachingBySchemaSchema.array().default([
    { SchemaName: '${mj_core_schema}', AllowCaching: true },
  ]),
});



export type NewEntityRelationshipDefaults = z.infer<typeof newEntityRelationshipDefaultsSchema>;
const newEntityRelationshipDefaultsSchema = z.object({
  AutomaticallyCreateRelationships: z.boolean().default(true),
  CreateOneToManyRelationships: z.boolean().default(true),
});

/**
 * Default settings applied when creating new entities
 */
export type NewEntityDefaults = z.infer<typeof newEntityDefaultsSchema>;

/**
 * Main configuration object containing all CodeGen settings
 */
export type ConfigInfo = z.infer<typeof configInfoSchema>;
const configInfoSchema = z.object({
  newUserSetup: newUserSetupSchema.nullish(),
  settings: settingInfoSchema.array().default([
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'skip_file_generation', value: false },
    { name: 'auto_index_foreign_keys', value: true },
  ]),
  excludeSchemas: z.string().array().default(['sys', 'staging']),
  excludeTables: tableInfoSchema.array().default([
    { schema: '%', table: 'sys%' },
    { schema: '%', table: 'flyway_schema_history' }
  ]),
  customSQLScripts: customSQLScriptSchema.array().default([
    // AS OF 5.3.0 we are NOT including this as it wipes out standard views and procs
    // for ZERO reason, we have a solid baseline configuration now. We are 
    // renaming MJ_BASE_BEFORE_SQL.sql and will maintain this but the
    // new aproach is using Baseline scripts. Assumption == nobody outside MJ modifies
    // anything DDL-wise INSIDE __mj schema.
    // {
    //   scriptFile: '../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
    //   when: 'before-all',
    // },
  ]),
  advancedGeneration: advancedGenerationSchema.nullish(),
  integrityChecks: integrityCheckConfigSchema.default({
    enabled: true,
    entityFieldsSequenceCheck: true,
  }),
  output: outputInfoSchema.array().default([
    { type: 'SQL', directory: '../../SQL Scripts/generated', appendOutputCode: true },
    { type: 'Angular', directory: '../MJExplorer/src/app/generated', options: [{ name: 'maxComponentsPerModule', value: 20 }] },
    {
      type: 'AngularCoreEntities',
      directory: '../Angular/Explorer/core-entity-forms/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 100 }],
    },
    { type: 'GraphQLServer', directory: '../MJAPI/src/generated' },
    { type: 'GraphQLCoreEntityResolvers', directory: '../MJServer/src/generated' },
    { type: 'CoreActionSubclasses', directory: '../Actions/CoreActions/src/generated' },
    { type: 'ActionSubclasses', directory: '../GeneratedActions/src/generated' },
    { type: 'CoreEntitySubclasses', directory: '../MJCoreEntities/src/generated' },
    { type: 'EntitySubclasses', directory: '../GeneratedEntities/src/generated' },
    { type: 'DBSchemaJSON', directory: '../../Schema Files' },
  ]),
  commands: commandInfoSchema.array().default([
    { workingDirectory: '../MJCoreEntities', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../Angular/Explorer/core-entity-forms', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../Actions/CoreActions', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../GeneratedEntities', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../GeneratedActions', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../MJServer', command: 'npm', args: ['run', 'build'], when: 'after' },
    { workingDirectory: '../MJAPI', command: 'npm', args: ['start'], timeout: 30000, when: 'after' },
  ]),
  /** Path to JSON file containing soft PK/FK definitions for tables without database constraints */
  additionalSchemaInfo: z.string().optional(),

  /** Entity and field name normalization settings for ALL CAPS database identifiers */
  entityNaming: z.object({
    /** Normalize ALL CAPS table/entity names to Title Case (e.g., PAYMENT -> Payment). Default: true */
    normalizeAllCaps: z.boolean().default(true),
    /** Split compound ALL CAPS words using dictionary matching (e.g., INDIVIDUALDESIGNATION -> Individual Designation). Default: true */
    splitCompoundWords: z.boolean().default(true),
    /** Normalize ALL CAPS column/field names the same way. Default: true */
    normalizeFieldNames: z.boolean().default(true),
    /** Additional domain-specific words for the compound word splitter */
    additionalDomainWords: z.string().array().default([]),
  }).default({
    normalizeAllCaps: true,
    splitCompoundWords: true,
    normalizeFieldNames: true,
    additionalDomainWords: [],
  }),
  logging: logInfoSchema,
  newEntityDefaults: newEntityDefaultsSchema,
  newSchemaDefaults: newSchemaDefaultsSchema,
  dbSchemaJSONOutput: dbSchemaJSONOutputSchema,
  newEntityRelationshipDefaults: newEntityRelationshipDefaultsSchema,
  SQLOutput: sqlOutputConfigSchema,
  forceRegeneration: forceRegenerationConfigSchema,

  /** Database platform: 'sqlserver' or 'postgresql'. */
  dbPlatform: z.enum(['sqlserver', 'postgresql']).default('sqlserver'),
  dbHost: z.string(),
  dbPort: z.coerce.number().int().positive().default(1433),
  codeGenLogin: z.string(),
  codeGenPassword: z.string(),
  dbDatabase: z.string(),
  dbInstanceName: z.string().nullish(),
  dbTrustServerCertificate: z.coerce
    .boolean()
    .default(false)
    .transform((v) => (v ? 'Y' : 'N')),
  /**
   * **Legacy** — SQL Server request timeout in milliseconds applied to the
   * CodeGen connection pool. Set in `mj.config.cjs` or via the
   * `MJ_CODEGEN_REQUEST_TIMEOUT` environment variable when long-running CodeGen
   * steps (e.g. spUpdateExistingEntityFieldsFromSchema) exceed the default of
   * 120000 (2 minutes).
   *
   * Prefer the cross-platform {@link codegenPool}.statementTimeoutMs for new
   * configs — it applies to both SQL Server (as `requestTimeout`) and
   * PostgreSQL (as the per-connection `statement_timeout` GUC). When both are
   * set on a SQL Server install, `codegenPool.statementTimeoutMs` wins;
   * `dbRequestTimeout` remains as a backward-compatible fallback so existing
   * configs keep working unchanged.
   */
  dbRequestTimeout: z.coerce.number().int().positive().optional(),
  /**
   * Optional CodeGen-time database connection pool configuration.
   *
   * **Per-provider applicability** — not all fields apply to both providers
   * today:
   *
   * | Field | SQL Server | PostgreSQL |
   * |---|---|---|
   * | `statementTimeoutMs` | ✅ mssql `requestTimeout` | ✅ libpq `-c statement_timeout` |
   * | `max` / `min` / `idleTimeoutMillis` / `connectionTimeoutMillis` | ❌ ignored | ✅ `pg.Pool` config |
   * | `ssl` | ❌ ignored (SQL Server uses `dbTrustServerCertificate` + mssql's own SSL) | ✅ `pg.Pool` ssl |
   *
   * The PG-only pool-sizing knobs reflect the asymmetry between mssql and pg.Pool
   * configurability today; they'll converge in a follow-up. When omitted, each
   * driver's own defaults apply (mssql: 10 max; `PGConnectionManager`: 20 max, 2 min).
   *
   * For runtime (MJAPI) pool settings, see
   * `@memberjunction/server`'s `databaseSettings.connectionPool` — that is
   * a separate, long-lived service pool and is independent of CodeGen.
   */
  codegenPool: z.object({
    /** **PostgreSQL only** today. Max pool connections; `pg.Pool` default 20 when unset. */
    max: z.coerce.number().int().positive().optional(),
    /** **PostgreSQL only** today. Min idle connections kept open; `pg.Pool` default 2. */
    min: z.coerce.number().int().nonnegative().optional(),
    /** **PostgreSQL only** today. Idle timeout in ms before a pooled connection is closed. */
    idleTimeoutMillis: z.coerce.number().int().positive().optional(),
    /** **PostgreSQL only** today. New-connection acquisition timeout in ms. */
    connectionTimeoutMillis: z.coerce.number().int().positive().optional(),
    /**
     * Per-statement timeout in milliseconds, applied to **both providers**:
     *
     * - **SQL Server**: mapped to mssql's `requestTimeout` on the pool config.
     *   Takes precedence over the legacy top-level {@link dbRequestTimeout} when both
     *   are set; falls back to `dbRequestTimeout` (and ultimately mssql's 120000ms
     *   default) when unset.
     * - **PostgreSQL**: applied via the libpq startup option `-c statement_timeout=<ms>`
     *   (carried in pg's connection startup packet), so every backend — including the
     *   verify-SELECT-1 connection — honors it from the very first query. When unset,
     *   PostgreSQL applies no statement timeout (its default).
     */
    statementTimeoutMs: z.coerce.number().int().positive().optional(),
    /**
     * **PostgreSQL only**. SSL configuration for the codegen pool. Defaults to `false`
     * (matches the pre-multi-provider-refactor inline `pg.Pool` behavior that ran
     * codegen plaintext locally). Set to `true` for managed PostgreSQL with default
     * trust (e.g. AWS Aurora `rds.force_ssl=1`); pass an object for full control
     * (e.g. `{ rejectUnauthorized: true, ca: <CA bundle> }`).
     *
     * Note: the runtime MJAPI pool (`databaseSettings.connectionPool`) has its own
     * SSL handling that defaults ON in `NODE_ENV=production` — this field only
     * governs the short-lived codegen pool.
     */
    ssl: z.union([z.boolean(), z.record(z.string(), z.unknown())]).optional(),
  }).optional(),
  outputCode: z.string().nullish(),
  mjCoreSchema: z.string().default('__mj'),
  graphqlPort: z.coerce.number().int().positive().default(4000),
  entityPackageName: z.union([
    z.string(),
    z.record(z.string(), z.string())
  ]).default('mj_generatedentities'),

  verboseOutput: z.boolean().optional().default(false),
});

/**
 * Default CodeGen configuration - provides sensible defaults for all CodeGen settings.
 * These defaults can be overridden in user's mj.config.cjs file.
 *
 * Database connection settings come from environment variables.
 */
const _DEFAULT_DB_PLATFORM = resolveDbPlatformFromEnv() ?? 'sqlserver';
const _IS_PG_DEFAULT = _DEFAULT_DB_PLATFORM === 'postgresql';

/**
 * Tracks which `<pgEnv>:<ssEnv>` precedence pairs have already emitted a
 * `console.warn`. Both {@link _resolveConnEnv} (runs at module load) and
 * {@link applyPlatformDependentEnvVars} (runs after the user config merge,
 * plus again on every `initializeConfig()` call) can detect the same env-var
 * divergence and would otherwise warn 2–3 times for one config issue. The
 * set lives at module scope so it survives across both helpers' invocations
 * within the same process.
 */
const _warnedEnvPrecedencePairs = new Set<string>();
/**
 * Resolve a connection field from PG_*-prefixed env vars when `dbPlatform`
 * defaults to PostgreSQL, falling back to the SQL-Server-style env var name
 * and then a baseline default. Keeps env-var precedence inside `configInfo`
 * (one resolution layer) rather than scattered through provider code.
 *
 * When both env vars are set on a PG-default config AND they differ, emits a
 * one-line `console.warn` recording which one is winning. Continues using the
 * `PG_*` value (precedence is intentional) — the warning just makes the
 * override visible. Uses `console.warn` (not `LogWarning`) because this runs
 * at module-load time, before the logging module is wired.
 */
function _resolveConnEnv(pgName: string, ssName: string, fallback: string): string {
  const pgVal = _IS_PG_DEFAULT ? process.env[pgName] : undefined;
  const ssVal = process.env[ssName];
  const pairKey = `${pgName}:${ssName}`;
  if (
    _IS_PG_DEFAULT &&
    pgVal !== undefined &&
    ssVal !== undefined &&
    pgVal !== ssVal &&
    !_warnedEnvPrecedencePairs.has(pairKey)
  ) {
    _warnedEnvPrecedencePairs.add(pairKey);
    // eslint-disable-next-line no-console
    console.warn(
      `[codegen-lib] ${pgName}=${pgVal} takes precedence over ${ssName}=${ssVal} on a PostgreSQL-default config. ` +
        `Set only one to silence this warning, or set them to the same value.`,
    );
  }
  return pgVal ?? ssVal ?? fallback;
}

/**
 * Apply PG_*-prefixed env-var precedence *after* the user's `mj.config.cjs` has
 * been merged into the config. Closes a gap left by {@link _resolveConnEnv}:
 * that helper is locked to `_IS_PG_DEFAULT` (env-only), so a user who sets
 * `dbPlatform: 'postgresql'` in `mj.config.cjs` (no `DB_PLATFORM` env var) but
 * supplies the host via `PG_HOST` would have `PG_HOST` silently ignored and
 * connect to `localhost`. The pre-refactor code used
 * `process.env.PG_HOST ?? configInfo.dbHost` unconditionally inside
 * `setupPostgreSQLDataSource()`, so PG_* always won — this helper restores that
 * behavior at the config layer.
 *
 * Mutates `config` in place. PG_* env vars only override fields the user did NOT
 * explicitly set in `mj.config.cjs` (passed via `userConfig`); explicit user
 * values always win. A `console.warn` records the precedence whenever a PG_*
 * env var and its DB_* counterpart are both set and differ.
 */
function applyPlatformDependentEnvVars(config: ConfigInfo, userConfig: Partial<ConfigInfo>): void {
  if (config.dbPlatform !== 'postgresql') return;

  const overrides: ReadonlyArray<{
    readonly pgEnv: string;
    readonly ssEnv: string;
    readonly userValue: unknown;
    readonly apply: (value: string) => void;
  }> = [
    { pgEnv: 'PG_HOST',     ssEnv: 'DB_HOST',                userValue: userConfig.dbHost,          apply: (v) => { config.dbHost = v; } },
    { pgEnv: 'PG_PORT',     ssEnv: 'DB_PORT',                userValue: userConfig.dbPort,          apply: (v) => { const parsed = parseInt(v, 10); if (!isNaN(parsed)) config.dbPort = parsed; } },
    { pgEnv: 'PG_DATABASE', ssEnv: 'DB_DATABASE',            userValue: userConfig.dbDatabase,      apply: (v) => { config.dbDatabase = v; } },
    { pgEnv: 'PG_USERNAME', ssEnv: 'CODEGEN_DB_USERNAME',    userValue: userConfig.codeGenLogin,    apply: (v) => { config.codeGenLogin = v; } },
    { pgEnv: 'PG_PASSWORD', ssEnv: 'CODEGEN_DB_PASSWORD',    userValue: userConfig.codeGenPassword, apply: (v) => { config.codeGenPassword = v; } },
  ];

  for (const { pgEnv, ssEnv, userValue, apply } of overrides) {
    const pgVal = process.env[pgEnv];
    if (pgVal === undefined) continue;
    if (userValue !== undefined) continue;
    const ssVal = process.env[ssEnv];
    const pairKey = `${pgEnv}:${ssEnv}`;
    if (ssVal !== undefined && ssVal !== pgVal && !_warnedEnvPrecedencePairs.has(pairKey)) {
      _warnedEnvPrecedencePairs.add(pairKey);
      // eslint-disable-next-line no-console
      console.warn(
        `[codegen-lib] ${pgEnv}=${pgVal} takes precedence over ${ssEnv}=${ssVal} on a PostgreSQL config. ` +
          `Set only one to silence this warning, or set them to the same value.`,
      );
    }
    apply(pgVal);
  }
}

export const DEFAULT_CODEGEN_CONFIG: Partial<ConfigInfo> = {
  // Database connection settings (from environment variables). For PostgreSQL,
  // the PG_HOST / PG_PORT / PG_DATABASE / PG_USERNAME / PG_PASSWORD env vars
  // take precedence over their DB_* / CODEGEN_DB_* counterparts so existing
  // PG-targeted .env files keep working without changes.
  dbPlatform: _DEFAULT_DB_PLATFORM,
  dbHost: _resolveConnEnv('PG_HOST', 'DB_HOST', 'localhost'),
  dbPort: parseInt(_resolveConnEnv('PG_PORT', 'DB_PORT', _IS_PG_DEFAULT ? '5432' : '1433'), 10),
  dbDatabase: _resolveConnEnv('PG_DATABASE', 'DB_DATABASE', ''),
  codeGenLogin: _resolveConnEnv('PG_USERNAME', 'CODEGEN_DB_USERNAME', ''),
  codeGenPassword: _resolveConnEnv('PG_PASSWORD', 'CODEGEN_DB_PASSWORD', ''),
  dbInstanceName: process.env.DB_INSTANCE_NAME,
  dbTrustServerCertificate: parseBooleanEnv(process.env.DB_TRUST_SERVER_CERTIFICATE) ? 'Y' : 'N',
  dbRequestTimeout: process.env.MJ_CODEGEN_REQUEST_TIMEOUT
    ? parseInt(process.env.MJ_CODEGEN_REQUEST_TIMEOUT, 10)
    : undefined,
  mjCoreSchema: '__mj',
  graphqlPort: 4000,
  verboseOutput: false,

  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'skip_file_generation', value: false },
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
    AllowUserSearchAPI: true,
    AllowCaching: false,
    CascadeDeletes: false,
    UserViewMaxRows: 1000,
    AddToApplicationWithSchemaName: true,
    IncludeFirstNFieldsAsDefaultInView: 5,
    PermissionDefaults: {
      AutoAddPermissionsForNewEntities: true,
      Permissions: [
        { RoleName: 'UI', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
        { RoleName: 'Developer', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
        { RoleName: 'Integration', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
      ],
    },
    NameRulesBySchema: [
      {
        SchemaName: '${mj_core_schema}',
        EntityNamePrefix: 'MJ: ',
        EntityNameSuffix: '',
      },
    ],
    AllowCachingBySchema: [
      { SchemaName: '${mj_core_schema}', AllowCaching: true },
    ],
  },
  newEntityRelationshipDefaults: {
    AutomaticallyCreateRelationships: true,
    CreateOneToManyRelationships: true,
  },
  newSchemaDefaults: {
    CreateNewApplicationWithSchemaName: true,
    ApplicationRoleDefaults: {
      AutoAddRolesForNewApplications: true,
      Roles: [
        { RoleName: 'UI', CanAccess: true, CanAdmin: false },
        { RoleName: 'Developer', CanAccess: true, CanAdmin: true },
        { RoleName: 'Integration', CanAccess: true, CanAdmin: false },
      ],
    },
  },
  excludeSchemas: ['sys', 'staging', '__mj'],
  excludeTables: [
    { schema: '%', table: 'sys%' },
    { schema: '%', table: 'flyway_schema_history' }
  ],
  customSQLScripts: [],
  dbSchemaJSONOutput: {
    excludeEntities: [],
    excludeSchemas: ['sys', 'staging', 'dbo'],
    bundles: [{ name: '_Core_Apps', schemas: [], excludeSchemas: ['__mj'], excludeEntities: [] }],
  },
  integrityChecks: {
    enabled: true,
    entityFieldsSequenceCheck: true,
  },
  advancedGeneration: {
    enableAdvancedGeneration: true,
    allowFullTextSearchAutoUpdate: false,
    batchSize: 5,
    features: [
      {
        name: 'EntityNames',
        description: 'Use AI to generate better entity names when creating new entities',
        enabled: false,
      },
      {
        name: 'DefaultInViewFields',
        description: 'Use AI to determine which fields in an entity should be shown, by default, in a newly created User View for the entity. This is only used when creating new entities and when new fields are detected.',
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
        description: 'Use AI to generate semantic field categories for better form organization. This includes using AI to determine the way to layout fields on each entity form by assigning them to domain-specific categories. Since generated forms are regenerated every time you run this tool, it will be done every time you run the tool, including for existing entities and fields.',
        enabled: true,
      },
      {
        name: 'ParseCheckConstraints',
        description: 'Use AI to parse check constraints and generate a description as well as sub-class Validate() methods that reflect the logic of the constraint.',
        enabled: true,
      },
      {
        name: 'VirtualEntityFieldDecoration',
        description: 'Use AI to analyze SQL view definitions for virtual entities and identify primary keys, foreign keys, and field descriptions.',
        enabled: true,
      },
    ],
  },
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/v5/',
    appendToFile: true,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: true,
  },
  forceRegeneration: {
    enabled: false,
    baseViews: false,
    spCreate: false,
    spUpdate: false,
    spDelete: false,
    allStoredProcedures: false,
    indexes: false,
    fullTextSearch: false,
  },
};

/**
 * Current working directory for the code generation process
 */
export let currentWorkingDirectory: string = process.cwd();

/**
 * Merge user config with DEFAULT_CODEGEN_CONFIG.
 * Database settings come from user config or environment variables.
 */
const mergedConfig = configSearchResult?.config
  ? mergeConfigs(DEFAULT_CODEGEN_CONFIG, configSearchResult.config)
  : DEFAULT_CODEGEN_CONFIG;

/** Parse and validate the merged configuration */
const configParsing = configInfoSchema.safeParse(mergedConfig);
// Don't log errors at module load - commands that need config will validate explicitly
// if (!configParsing.success) {
//   LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
// }

// Re-apply PG_* env precedence now that the user's `mj.config.cjs` has been
// merged in — handles the case where `dbPlatform: 'postgresql'` was set in the
// config file (not via env), which `_resolveConnEnv()` could not have known
// about at the moment it built DEFAULT_CODEGEN_CONFIG.
if (configParsing.data) {
  applyPlatformDependentEnvVars(configParsing.data, configSearchResult?.config ?? {});
}

/**
 * Parsed configuration object with fallback to empty object if parsing fails
 */
export const configInfo = configParsing.data ?? ({} as ConfigInfo);
/**
 * Destructured commonly used configuration values
 */
export const { mjCoreSchema, dbDatabase } = configInfo;

/**
 * Initializes configuration from the specified working directory
 * @param cwd The current working directory to search for config files
 * @returns Parsed configuration object
 * @throws Error if no configuration is found
 */
export function initializeConfig(cwd: string): ConfigInfo {
  currentWorkingDirectory = cwd;

  const userConfigResult = explorer.search(currentWorkingDirectory);
  const mergedConfig = userConfigResult?.config
    ? mergeConfigs(DEFAULT_CODEGEN_CONFIG, userConfigResult.config)
    : DEFAULT_CODEGEN_CONFIG;

  const maybeConfig = configInfoSchema.safeParse(mergedConfig);
  if (!maybeConfig.success) {
    // Surface schema-validation failures so misconfiguration doesn't silently
    // fall through to an empty configInfo (which then crashes downstream with
    // confusing errors like "config.server is required" — see Bug #8/#9).
    LogError(
      `Error parsing mj.config.cjs - falling back to defaults. Schema issues:\n${JSON.stringify(maybeConfig.error.issues, null, 2)}`
    );
  }

  const config = maybeConfig.success ? maybeConfig.data : configInfo;

  if (config === undefined) {
    throw new Error('No configuration found');
  }

  // Re-apply PG_* env precedence now that the user's `mj.config.cjs` has been
  // merged in — handles the case where `dbPlatform: 'postgresql'` was set in
  // the config file (not via env), which `_resolveConnEnv()` could not have
  // known about at the moment it built DEFAULT_CODEGEN_CONFIG.
  applyPlatformDependentEnvVars(config, userConfigResult?.config ?? {});

  // Update the module-level configInfo so that helpers like
  // resolveEntityPackageName() and getExternalEntitySchemas() see the
  // config from the correct working directory, not the stale one from
  // initial module load.
  Object.assign(configInfo, config);

  return config;
}

/**
 * Gets the output directory for a specific generation type
 * @param type The type of output (e.g., 'SQL', 'Angular')
 * @param useLocalDirectoryIfMissing Whether to use a local directory if config is missing
 * @returns The output directory path or null if not found
 */
export function outputDir(type: string, useLocalDirectoryIfMissing: boolean): string | null {
  const outputInfo = configInfo.output.find((o) => o.type.trim().toUpperCase() === type.trim().toUpperCase());
  if (outputInfo) {
    if (outputInfo.appendOutputCode && outputInfo.appendOutputCode === true && configInfo.outputCode)
      return path.join(currentWorkingDirectory, outputInfo.directory, configInfo.outputCode);
    else return path.join(currentWorkingDirectory, outputInfo.directory);
  } else {
    if (useLocalDirectoryIfMissing) {
      logStatus('>>> No output directory found for type: ' + type + ' within config file, using local directory instead');
      return path.join(currentWorkingDirectory, 'output', type);
    } else return null;
  }
}

/**
 * Gets the output options for a specific generation type
 * @param type The type of output
 * @returns Array of output options or null if not found
 */
export function outputOptions(type: string): OutputOptionInfo[] | null {
  const outputInfo = configInfo.output.find((o) => o.type.trim().toUpperCase() === type.trim().toUpperCase());
  if (outputInfo) {
    return outputInfo.options!;
  } else {
    return null;
  }
}

/**
 * Gets a specific output option value for a generation type
 * @param type The type of output
 * @param optionName The name of the option to retrieve
 * @param defaultValue Default value if option is not found
 * @returns The option value or default value
 */
export function outputOptionValue(type: string, optionName: string, defaultValue?: any): any {
  const outputInfo = configInfo.output?.find((o) => o.type.trim().toUpperCase() === type.trim().toUpperCase());
  if (outputInfo && outputInfo.options) {
    const theOption = outputInfo.options.find((o) => o.name.trim().toUpperCase() === optionName.trim().toUpperCase());
    if (theOption) return theOption.value;
    else return defaultValue;
  } else {
    return defaultValue;
  }
}

/**
 * Gets commands configured to run at a specific time
 * @param when When the commands should run (e.g., 'before', 'after')
 * @returns Array of commands to execute
 */
export function commands(when: string): CommandInfo[] {
  return configInfo.commands.filter((c) => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}
/**
 * Gets custom SQL scripts configured to run at a specific time
 * @param when When the scripts should run
 * @returns Array of SQL scripts to execute
 */
export function customSqlScripts(when: string): CustomSQLScript[] {
  return configInfo.customSQLScripts.filter((c) => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}

/**
 * Gets a specific setting by name
 * @param settingName The name of the setting to retrieve
 * @returns The setting object
 */
export function getSetting(settingName: string): SettingInfo {
  return configInfo.settings.find((s) => s.name.trim().toUpperCase() === settingName.trim().toUpperCase())!;
}

/**
 * Gets the value of a specific setting
 * @param settingName The name of the setting
 * @param defaultValue Default value if setting is not found
 * @returns The setting value or default value
 */
export function getSettingValue(settingName: string, defaultValue?: any): any {
  const setting = getSetting(settingName);
  if (setting) return setting.value;
  else return defaultValue;
}

/**
 * Checks if automatic indexing of foreign keys is enabled
 * @returns True if auto-indexing is enabled, false otherwise
 */
export function autoIndexForeignKeys(): boolean {
  const keyName = 'auto_index_foreign_keys';
  const setting = getSetting(keyName);
  if (setting) return <boolean>setting.value;
  else return false;
}

/**
 * Resolves the entity package name for a given database schema.
 *
 * When `entityPackageName` is a plain string (legacy/default), all non-core schemas
 * use that single package. When it is a `Record<string, string>`, each schema is
 * mapped to its own package (used by OpenApp projects with multiple installed apps).
 *
 * @param schemaName The database schema name of the entity
 * @param config     Optional config override; falls back to the module-level configInfo
 * @returns The npm package name to use for importing entities from this schema
 */
export function resolveEntityPackageName(schemaName: string, config?: ConfigInfo): string {
  const cfg = config ?? configInfo;
  const epn = cfg.entityPackageName;
  if (typeof epn === 'string') {
    return epn || 'mj_generatedentities';
  }
  // Case-insensitive lookup: DB schema names may differ in casing from config keys
  const lowerSchema = schemaName.toLowerCase();
  const match = Object.keys(epn).find(k => k.toLowerCase() === lowerSchema);
  return match ? epn[match] : 'mj_generatedentities';
}

/**
 * Returns all schema names that have an explicit external entity package mapping.
 * These schemas should be skipped during local entity subclass generation because
 * their entities are provided by an installed OpenApp npm package.
 */
export function getExternalEntitySchemas(config?: ConfigInfo): string[] {
  const cfg = config ?? configInfo;
  const epn = cfg.entityPackageName;
  if (typeof epn === 'string') {
    return [];
  }
  return Object.keys(epn);
}

/**
 * Maximum length allowed for database index names
 */
export const MAX_INDEX_NAME_LENGTH = 128;

/**
 * Gets the MemberJunction core schema name from configuration
 * @returns The core schema name (typically '__mj')
 */
export function mj_core_schema(): string {
  return getSetting('mj_core_schema').value;
}

/**
 * Returns the configured database platform.
 * Defaults to 'sqlserver' when the user config does not specify one.
 */
export function dbPlatform(): DatabasePlatform {
  return configInfo.dbPlatform;
}
