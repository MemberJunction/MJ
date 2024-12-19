import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import path from 'path';
import { logStatus } from '../Misc/status_logging';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });
const configSearchResult = explorer.search(process.cwd());

export type SettingInfo = z.infer<typeof settingInfoSchema>;
const settingInfoSchema = z.object({
  name: z.string(),
  value: z.any(),
});

export type LogInfo = z.infer<typeof logInfoSchema>;
const logInfoSchema = z.object({
  log: z.boolean().default(true),
  logFile: z.string().default('codegen.output.log'),
  console: z.boolean().default(true),
});

export type CustomSQLScript = z.infer<typeof customSQLScriptSchema>;
const customSQLScriptSchema = z.object({
  when: z.string(),
  scriptFile: z.string(),
});

export type CommandInfo = z.infer<typeof commandInfoSchema>;
const commandInfoSchema = z.object({
  workingDirectory: z.string(),
  command: z.string(),
  args: z.string().array(),
  timeout: z.number().nullish(),
  when: z.string(),
});

export type OutputOptionInfo = z.infer<typeof outputOptionInfoSchema>;
const outputOptionInfoSchema = z.object({
  name: z.string(),
  value: z.any(),
});

export type OutputInfo = z.infer<typeof outputInfoSchema>;
const outputInfoSchema = z.object({
  type: z.string(),
  directory: z.string(),
  appendOutputCode: z.boolean().optional(),
  options: outputOptionInfoSchema.array().optional(),
});

export type TableInfo = z.infer<typeof tableInfoSchema>;
const tableInfoSchema = z.object({
  schema: z.string(),
  table: z.string(),
});

export type DBSchemaJSONOutputBundle = z.infer<typeof dbSchemaJSONOutputBundleSchema>;
const dbSchemaJSONOutputBundleSchema = z.object({
  name: z.string(),
  schemas: z.string().array().default([]),
  excludeSchemas: z.string().array().default(['sys', 'staging']),
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
  UserApplications: z.array(z.string()).optional().default([])
});

export type AdvancedGenerationFeatureOption = z.infer<typeof advancedGenerationFeatureOptionSchema>;
const advancedGenerationFeatureOptionSchema = z.object({
  name: z.string(),
  value: z.unknown(),
});

export type AdvancedGenerationFeature = z.infer<typeof advancedGenerationFeatureSchema>;
const advancedGenerationFeatureSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  description: z.string().nullish(), // not used, but useful for documentation within the config file
  systemPrompt: z.string().nullish(),
  userMessage: z.string().nullish(),
  options: advancedGenerationFeatureOptionSchema.array().nullish(),
});

export type AdvancedGeneration = z.infer<typeof advancedGenerationSchema>;
const advancedGenerationSchema = z.object({
  enableAdvancedGeneration: z.boolean().default(true),
  AIVendor: z.enum(['openai', 'anthropic', 'mistral']).default('openai'),
  AIModel: z.string().default('gpt-4-1106-preview'),
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

export type EntityPermission = z.infer<typeof entityPermissionSchema>;

const newEntityPermissionDefaultsSchema = z.object({
  AutoAddPermissionsForNewEntities: z.boolean().default(true),
  Permissions: entityPermissionSchema.array().default([
    { RoleName: 'UI', CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
    { RoleName: 'Developer', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: false },
    { RoleName: 'Integration', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true },
  ]),
});

export type NewEntityPermissionDefaults = z.infer<typeof newEntityPermissionDefaultsSchema>;

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
});

export type NewEntityRelationshipDefaults = z.infer<typeof newEntityRelationshipDefaultsSchema>;
const newEntityRelationshipDefaultsSchema = z.object({
  AutomaticallyCreateRelationships: z.boolean().default(true),
  CreateOneToManyRelationships: z.boolean().default(true),
});

export type NewEntityDefaults = z.infer<typeof newEntityDefaultsSchema>;

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

  dbHost: z.string(),
  dbPort: z.coerce.number().int().positive().default(1433),
  codeGenLogin: z.string(),
  codeGenPassword: z.string(),
  dbDatabase: z.string(),
  dbInstanceName: z.string().nullish(),
  dbTrustServerCertificate: z.coerce.boolean().default(false),
  outputCode: z.string().nullish(),
  mjCoreSchema: z.string().default('__mj'),
  graphqlPort: z.coerce.number().int().positive().default(4000),
});
export let currentWorkingDirectory: string;
export const configInfo = configInfoSchema.parse(configSearchResult?.config);
export const { mjCoreSchema, dbDatabase } = configInfo;

export function initializeConfig(cwd: string): ConfigInfo {
  currentWorkingDirectory = cwd;

  const maybeConfig = configInfoSchema.safeParse(explorer.search(currentWorkingDirectory)?.config);

  if (!configInfo && !maybeConfig.success) {
    throw new Error('No configuration found');
  }

  return maybeConfig.success ? maybeConfig.data : configInfo;
}

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

export function outputOptions(type: string): OutputOptionInfo[] | null {
  const outputInfo = configInfo.output.find((o) => o.type.trim().toUpperCase() === type.trim().toUpperCase());
  if (outputInfo) {
    return outputInfo.options!;
  } else {
    return null;
  }
}

export function outputOptionValue(type: string, optionName: string, defaultValue?: any): any {
  const outputInfo = configInfo.output.find((o) => o.type.trim().toUpperCase() === type.trim().toUpperCase());
  if (outputInfo && outputInfo.options) {
    const theOption = outputInfo.options.find((o) => o.name.trim().toUpperCase() === optionName.trim().toUpperCase());
    if (theOption) return theOption.value;
    else return defaultValue;
  } else {
    return defaultValue;
  }
}

export function commands(when: string): CommandInfo[] {
  return configInfo.commands.filter((c) => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}
export function customSqlScripts(when: string): CustomSQLScript[] {
  return configInfo.customSQLScripts.filter((c) => c.when.trim().toUpperCase() === when.trim().toUpperCase());
}

export function getSetting(settingName: string): SettingInfo {
  return configInfo.settings.find((s) => s.name.trim().toUpperCase() === settingName.trim().toUpperCase())!;
}

export function getSettingValue(settingName: string, defaultValue?: any): any {
  const setting = getSetting(settingName);
  if (setting) return setting.value;
  else return defaultValue;
}

export function autoIndexForeignKeys(): boolean {
  const keyName = 'auto_index_foreign_keys';
  const setting = getSetting(keyName);
  if (setting) return <boolean>setting.value;
  else return false;
}

/**
 * Maximum length of the name of an index
 */
export const MAX_INDEX_NAME_LENGTH = 128;

export function mj_core_schema(): string {
  return getSetting('mj_core_schema').value;
}
