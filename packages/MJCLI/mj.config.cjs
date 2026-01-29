/** @import { ConfigInfo as CodeGenConfig } from "./packages/CodeGenLib/src/Config/config" */
/** @import { ConfigInfo as MJServerConfig } from "./packages/MJServer/src/config" */
/** @import { ConfigInfo as MCPServerConfig } from "./packages/AI/MCPServer/src/config" */
/** @import { ConfigInfo as A2AServerConfig } from "./packages/AI/A2AServer/src/config" */
/** @import { MJConfig } from "./packages/MJCLI/src/config" */

/** @type {CodeGenConfig} */
const codegenConfig = {
  /**
   * CodeGenLib Configuration (previously config.json)
   */

  // newUserSetup: {
  //   UserName: '',
  //   FirstName: '',
  //   LastName: '',
  //   Email: '',
  //   Roles: ['Developer', 'Integration', 'UI'],
  // },
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
      table: 'flyway_schema_history' // Exclude Flyway schema history table from ever being part of CodeGen
    }
  ],
  customSQLScripts: [
    {
      scriptFile: './SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
      when: 'before-all',
    },
  ],
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
    AIVendor: 'openai',
    AIModel: 'gpt-4.1', // throw a powerful model at this - want best code generation possible!
    features: [
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
      {
        name: 'ParseCheckConstraints',
        description:
          'Use AI to parse check constraints and generate a description as well as sub-class Validate() methods that reflect the logic of the constraint.',
        enabled: true,
      }
    ],
  },
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
      args: ['start'],
      timeout: 30000,
      when: 'after',
    },
  ],
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/v3/',
    appendToFile: true,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: true,
  },
};

/** @type {MJServerConfig} */
const mjServerConfig = {
  /**
   * MJAPI Configuration (previously config.json)
   */

  userHandling: {
    autoCreateNewUsers: true,
    newUserLimitedToAuthorizedDomains: false,
    newUserAuthorizedDomains: [],
    newUserRoles: ['UI', 'Developer'],
    updateCacheWhenNotFound: true,
    updateCacheWhenNotFoundDelay: 5000,
    contextUserForNewUserCreation: 'not.set@nowhere.com',
    CreateUserApplicationRecords: true,
    UserApplications: ['Admin'],
  },
  databaseSettings: {
    connectionTimeout: 45000,
    requestTimeout: 30000,
    metadataCacheRefreshInterval: isFinite(Number(process.env.METADATA_CACHE_REFRESH_INTERVAL))
      ? Number(process.env.METADATA_CACHE_REFRESH_INTERVAL)
      : 180000,
  },
  viewingSystem: {
    enableSmartFilters: true,
  },
  restApiOptions: {
    enabled: false, // Disabled by default
    basePath: '/rest',
    // Example of entity and schema filtering (uncomment and customize as needed):
    // includeEntities: ['Users', 'Entity*', 'Entity Fields'], // Only allow these entities (supports wildcards)
    // excludeEntities: ['Password', 'APIKey*', 'Credential'], // Exclude sensitive entities (supports wildcards)
    // includeSchemas: ['public', 'CRM'], // Only allow entities from these schemas
    // excludeSchemas: ['internal', 'security', '__mj'] // Exclude entire schemas
  },
  askSkip: {
    chatURL: process.env.ASK_SKIP_CHAT_URL,
    learningCycleURL: process.env.ASK_SKIP_LEARNING_URL,
    learningCycleIntervalInMinutes: process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES,
    learningCycleEnabled: process.env.ASK_SKIP_RUN_LEARNING_CYCLES,
    learningCycleRunUponStartup: process.env.ASK_SKIP_RUN_LEARNING_CYCLES_UPON_STARTUP,
    orgID: process.env.ASK_SKIP_ORGANIZATION_ID,
    apiKey: process.env.ASK_SKIP_API_KEY,  
    organizationInfo: process.env.ASK_SKIP_ORGANIZATION_INFO,
    entitiesToSend: {
      excludeSchemas: ['__mj'],
      includeEntitiesFromExcludedSchemas: [
        'Entities',
        'Entity Fields',
        'Content Items',
        'Content Item Tags',
        'Content Item Attributes',
        'Content Types',
        'Content Type Attributes',
        'Content File Types',
        'Content Sources',
        'Content Source Types',
        'Content Source Params',
        'Content Source Type Params',
        'Content Process Runs',
      ],
    },
  }  
};

/** @type {MCPServerConfig} */
const mcpServerConfig = {
  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    actionTools: [
      {
        actionName: 'NOT YET SUPPORTED',
        actionCategory: '*',
      }
    ],
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
  }
}

/** @type {A2AServerConfig} */
const a2aServerConfig = {
  a2aServerSettings: {
    port: 3200,
    enableA2AServer: true,
    agentName: "MemberJunction",
    agentDescription: "Access MemberJunction data and capabilities via the A2A protocol",
    streamingEnabled: true,
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
  }
}
 

/** @type {CodeGenConfig & MJConfig & MJServerConfig & MCPServerConfig & A2AServerConfig} */
const config = {
  ...codegenConfig,
  ...mjServerConfig,
  ...mcpServerConfig,
  ...a2aServerConfig,

  /**
   * Shared Configuration and Environment Variables
   */

  // Used for MJCLI, CodeGenLib, and MJServer
  dbHost: process.env.DB_HOST ?? 'localhost',
  dbPort: process.env.DB_PORT,
  dbDatabase: process.env.DB_DATABASE,
  codeGenLogin: process.env.CODEGEN_DB_USERNAME,
  codeGenPassword: process.env.CODEGEN_DB_PASSWORD,
  dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbReadOnlyUsername: process.env.DB_READ_ONLY_USERNAME,
  dbReadOnlyPassword: process.env.DB_READ_ONLY_PASSWORD,

  // Used only for CodeGenLib
  outputCode: process.env.OUTPUT_CODE,

  // Used for CodeGenLib and MJAPI
  dbInstanceName: process.env.DB_INSTANCE_NAME,
  mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',

  // Used only for MJAPI
  graphqlPort: process.env.GRAPHQL_PORT ?? 4000,
  ___codeGenAPIURL: process.env.CODEGEN_API_URL,
  ___codeGenAPIPort: process.env.CODEGEN_API_PORT,
  ___codeGenAPISubmissionDelay: process.env.CODEGEN_API_SUBMISSION_DELAY,
  graphqlRootPath: process.env.GRAPHQL_ROOT_PATH ?? '/',
  webClientID: process.env.WEB_CLIENT_ID,
  tenantID: process.env.TENANT_ID,
  enableIntrospection: process.env.ENABLE_INTROSPECTION,
  websiteRunFromPackage: process.env.WEBSITE_RUN_FROM_PACKAGE,
  userEmailMap: process.env.USER_EMAIL_MAP,
  ___skipAPIurl: process.env.ASK_SKIP_API_URL,
  ___skipLearningAPIurl: process.env.ASK_SKIP_LEARNING_API_URL,
  ___skipLearningCycleIntervalInMinutes: process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES,
  ___skipRunLearningCycles: process.env.ASK_SKIP_RUN_LEARNING_CYCLES,
  ___skipAPIOrgId: process.env.ASK_SKIP_ORGANIZATION_ID,
  auth0Domain: process.env.AUTH0_DOMAIN,
  auth0WebClientID: process.env.AUTH0_CLIENT_ID,
  auth0ClientSecret: process.env.AUTH0_CLIENT_SECRET,
  apiKey: process.env.MJ_API_KEY,

  // Used only for MJCLI
  migrationsLocation: process.env.MIGRATIONS_LOCATION ?? 'filesystem:./migrations',
};

module.exports = config;