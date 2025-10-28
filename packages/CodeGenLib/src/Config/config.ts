/**
 * Configuration management module for MemberJunction CodeGen.
 * Handles loading, parsing, and validation of configuration files using Zod schemas.
 * Supports various configuration sources through cosmiconfig (package.json, .mjrc, etc.).
 */

import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import { logStatus } from '../Misc/status_logging';
import { LogError } from '@memberjunction/core';

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
  AIVendor: z.enum(['openai', 'anthropic', 'mistral', 'groq']).default('openai'),
  AIModel: z.string().default('gpt-4o'),
  features: advancedGenerationFeatureSchema.array().default([
    {
      name: 'EntityNames',
      description: 'Use AI to generate better entity names when creating new entities',
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
  folderPath: z.string().default('../../migrations/v2/'),
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
});

export type NewSchemaDefaults = z.infer<typeof newSchemaDefaultsSchema>;
const newSchemaDefaultsSchema = z.object({
  CreateNewApplicationWithSchemaName: z.boolean().default(true),
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
    { RoleName: 'Developer', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: false },
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

const newEntityDefaultsSchema = z.object({
  TrackRecordChanges: z.boolean().default(true),
  AuditRecordAccess: z.boolean().default(false),
  AuditViewRuns: z.boolean().default(false),
  AllowAllRowsAPI: z.boolean().default(false),
  AllowCreateAPI: z.boolean().default(true),
  AllowUpdateAPI: z.boolean().default(true),
  AllowDeleteAPI: z.boolean().default(true),
  AllowUserSearchAPI: z.boolean().default(true),
  CascadeDeletes: z.boolean().default(false),
  UserViewMaxRows: z.number().default(1000),
  AddToApplicationWithSchemaName: z.boolean().default(true),
  IncludeFirstNFieldsAsDefaultInView: z.number().default(5),
  PermissionDefaults: newEntityPermissionDefaultsSchema,
  NameRulesBySchema: newEntityNameRulesBySchema.array().default([]),
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
    { name: 'auto_index_foreign_keys', value: true },
  ]),
  excludeSchemas: z.string().array().default(['sys', 'staging']),
  excludeTables: tableInfoSchema.array().default([{ schema: '%', table: 'sys%' }]),
  customSQLScripts: customSQLScriptSchema.array().default([
    {
      scriptFile: '../../SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
      when: 'before-all',
    },
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
  logging: logInfoSchema,
  newEntityDefaults: newEntityDefaultsSchema,
  newSchemaDefaults: newSchemaDefaultsSchema,
  dbSchemaJSONOutput: dbSchemaJSONOutputSchema,
  newEntityRelationshipDefaults: newEntityRelationshipDefaultsSchema,
  SQLOutput: sqlOutputConfigSchema,
  forceRegeneration: forceRegenerationConfigSchema,

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
  outputCode: z.string().nullish(),
  mjCoreSchema: z.string().default('__mj'),
  graphqlPort: z.coerce.number().int().positive().default(4000),

  verboseOutput: z.boolean().optional().default(false),
});
/**
 * Current working directory for the code generation process
 */
export let currentWorkingDirectory: string = process.cwd();

/** Parse and validate the configuration file */
const configParsing = configInfoSchema.safeParse(configSearchResult?.config);
if (!configParsing.success) {
  LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
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

  const maybeConfig = configInfoSchema.safeParse(explorer.search(currentWorkingDirectory)?.config);
  if (!maybeConfig.success) {
    LogError('Error parsing config file', null, JSON.stringify(maybeConfig.error.issues, null, 2));
  }

  const config = maybeConfig.success ? maybeConfig.data : configInfo;

  if (config === undefined) {
    throw new Error('No configuration found');
  }

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
