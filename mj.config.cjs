/**
 * MemberJunction Configuration - Monorepo Overrides
 *
 * This minimal config demonstrates the new optional configuration system.
 * All unspecified settings use framework defaults from:
 * - @memberjunction/server (DEFAULT_SERVER_CONFIG)
 * - @memberjunction/codegen-lib (DEFAULT_CODEGEN_CONFIG)
 * - Other packages as needed
 *
 * Compare this 166 line file to the original 528 line mj.config.cjs!
 *
 * Before: 528 lines with all defaults explicitly specified
 * After: 166 lines with only monorepo-specific overrides
 * Reduction: 69% smaller
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  /**
   * ====================
   * CodeGen Overrides
   * ====================
   */

  // Custom SQL scripts specific to this monorepo
  customSQLScripts: [
    {
      scriptFile: './SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
      when: 'before-all',
    },
  ],

  // Output directories specific to monorepo structure
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

  // Build commands for monorepo packages
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

  /**
   * ====================
   * MCP Server Overrides
   * ====================
   */

  mcpServerSettings: {
    enableMCPServer: true, // Override default (false)
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
   * ====================
   * A2A Server Overrides
   * ====================
   */

  a2aServerSettings: {
    enableA2AServer: true, // Override default (false)
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
   * ====================
   * QueryGen Overrides
   * ====================
   */

  queryGen: {
    includeEntities: ["Members"], // Override to specific entities
  },

  /**
   * ====================
   * All Other Settings
   * ====================
   *
   * These use defaults from their respective packages:
   *
   * - verboseOutput, logging, settings → @memberjunction/codegen-lib defaults
   * - userHandling, databaseSettings, viewingSystem → @memberjunction/server defaults
   * - scheduledJobs, telemetry, sqlLogging → @memberjunction/server defaults
   * - restApiOptions, askSkip → @memberjunction/server defaults
   * - authProviders → @memberjunction/server defaults (from environment variables)
   *
   * Environment variables (DB_HOST, DB_DATABASE, GRAPHQL_PORT, TENANT_ID, etc.)
   * are all handled by DEFAULT_SERVER_CONFIG.
   */
};
