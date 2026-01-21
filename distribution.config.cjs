/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * MemberJunction v3.0 Minimal Distribution Configuration
   *
   * This config leverages the minimal configuration system where most settings
   * come from package defaults:
   * - Database settings → Environment variables (via config schema defaults)
   * - CodeGen settings → DEFAULT_CODEGEN_CONFIG (@memberjunction/codegen-lib)
   *
   * You only need to specify:
   * 1. Environment variables in .env file (database, auth)
   * 2. Deployment-specific settings (output paths, commands) - BELOW
   * 3. Any settings you want to override from the defaults
   */

  // ============================================================================
  // DEPLOYMENT-SPECIFIC CONFIGURATION (Required)
  // ============================================================================

  /**
   * Output paths for code generation
   * These are specific to this distribution's directory structure
   */
  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './apps/MJExplorer/src/app/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    { type: 'GraphQLServer', directory: './apps/MJAPI/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/GeneratedActions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/GeneratedEntities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],

  /**
   * Build commands to run after code generation
   * These are specific to this distribution's package structure
   */
  commands: [
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
      workingDirectory: './apps/MJAPI',
      command: 'npm',
      args: ['start'],
      timeout: 30000,
      when: 'after',
    },
  ],

  // ============================================================================
  // OPTIONAL OVERRIDES
  // ============================================================================
  // Everything below this line is OPTIONAL. These settings have sensible defaults
  // in DEFAULT_SERVER_CONFIG and DEFAULT_CODEGEN_CONFIG.
  //
  // Uncomment and modify only if you need to override the defaults.
  // ============================================================================

  // ---------------------------------------------------------------------------
  // CodeGen Settings Overrides
  // ---------------------------------------------------------------------------
  // Default: [
  //   { name: 'mj_core_schema', value: '__mj' },
  //   { name: 'skip_database_generation', value: false },
  //   { name: 'recompile_mj_views', value: true },
  //   { name: 'auto_index_foreign_keys', value: true },
  // ]
  // settings: [
  //   { name: 'mj_core_schema', value: '__mj' },
  //   { name: 'skip_database_generation', value: false },
  //   { name: 'recompile_mj_views', value: true },
  //   { name: 'auto_index_foreign_keys', value: true },
  // ],

  // ---------------------------------------------------------------------------
  // Logging Overrides
  // ---------------------------------------------------------------------------
  // Default: { log: true, logFile: 'codegen.output.log', console: true }
  // logging: {
  //   log: true,
  //   logFile: 'codegen.output.log',
  //   console: true,
  // },

  // ---------------------------------------------------------------------------
  // New Entity Defaults Overrides
  // ---------------------------------------------------------------------------
  // Default v3.x settings for new entities
  // newEntityDefaults: {
  //   TrackRecordChanges: true,
  //   AuditRecordAccess: false,
  //   AuditViewRuns: false,
  //   AllowAllRowsAPI: false,
  //   AllowCreateAPI: true,
  //   AllowUpdateAPI: true,
  //   AllowDeleteAPI: true,
  //   AllowUserSearchAPI: false,
  //   CascadeDeletes: false,
  //   UserViewMaxRows: 1000,
  //   AddToApplicationWithSchemaName: true,
  //   IncludeFirstNFieldsAsDefaultInView: 5,
  //   NameRulesBySchema: [{ SchemaName: '${mj_core_schema}', EntityNamePrefix: 'MJ: ' }]
  // },

  // ---------------------------------------------------------------------------
  // Schema/Table Exclusions
  // ---------------------------------------------------------------------------
  // Default: excludeSchemas: ['sys', 'staging', '__mj']
  // Default: excludeTables: [{ schema: '%', table: 'sys%' }, { schema: '%', table: 'flyway_schema_history' }]
  //
  // Using defaults - Core entities (__mj schema) should not be modified by distributions.
  // Uncomment only if you need different exclusions than the defaults.
  // excludeSchemas: ['sys', 'staging', '__mj'],
  // excludeTables: [
  //   { schema: '%', table: 'sys%' },
  //   { schema: '%', table: 'flyway_schema_history' }
  // ],

  // ---------------------------------------------------------------------------
  // AI-Powered Advanced Generation Features
  // ---------------------------------------------------------------------------
  // Default v3.x: Several features enabled by default
  // advancedGeneration: {
  //   enableAdvancedGeneration: true,
  //   features: [
  //     { name: 'EntityNames', enabled: false },
  //     { name: 'DefaultInViewFields', enabled: true },
  //     { name: 'EntityDescriptions', enabled: false },
  //     { name: 'SmartFieldIdentification', enabled: true },
  //     { name: 'TransitiveJoinIntelligence', enabled: true },
  //     { name: 'FormLayoutGeneration', enabled: true },
  //     { name: 'ParseCheckConstraints', enabled: true },
  //   ],
  // },

  // ---------------------------------------------------------------------------
  // SQL Output (for migrations)
  // ---------------------------------------------------------------------------
  // Default v3.x: enabled: true, folderPath: './migrations/v3/'
  // SQLOutput: {
  //   enabled: true,
  //   folderPath: './migrations/v3/',
  //   appendToFile: true,
  //   convertCoreSchemaToFlywayMigrationFile: true,
  //   omitRecurringScriptsFromLog: true,
  // },

  // ---------------------------------------------------------------------------
  // Force Regeneration Options
  // ---------------------------------------------------------------------------
  // Default: All false (only regenerate on schema changes)
  // forceRegeneration: {
  //   enabled: false,
  //   baseViews: false,
  //   spCreate: false,
  //   spUpdate: false,
  //   spDelete: false,
  //   allStoredProcedures: false,
  //   indexes: false,
  //   fullTextSearch: false,
  // },

  // ---------------------------------------------------------------------------
  // Database Connection Overrides
  // ---------------------------------------------------------------------------
  // These come from DEFAULT_SERVER_CONFIG with environment variable defaults
  // dbHost: process.env.DB_HOST ?? 'localhost',
  // dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
  // dbDatabase: process.env.DB_DATABASE,
  // dbUsername: process.env.DB_USERNAME,
  // dbPassword: process.env.DB_PASSWORD,
  // codeGenLogin: process.env.CODEGEN_DB_USERNAME,
  // codeGenPassword: process.env.CODEGEN_DB_PASSWORD,

  // ---------------------------------------------------------------------------
  // Server Settings Overrides
  // ---------------------------------------------------------------------------
  // These come from DEFAULT_SERVER_CONFIG
  // graphqlPort: process.env.GRAPHQL_PORT ?? 4000,
  // mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',
};
