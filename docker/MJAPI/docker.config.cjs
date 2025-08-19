/** @import { ConfigInfo as CodeGenConfig } from "../../packages/CodeGenLib/src/Config/config" */
/** @import { ConfigInfo as MJServerConfig } from "../../packages/MJServer/src/config" */
/** @import { MJConfig } from "../../packages/MJCLI/src/config" */

/** @type {CodeGenConfig} */
const codegenConfig = {
  /**
   * CodeGenLib Configuration (previously config.json)
   */

  newUserSetup: {
    UserName: process.env.MJ_NEWUSER_USERNAME ?? '',
    FirstName: process.env.MJ_NEWUSER_FIRSTNAME ?? '',
    LastName: process.env.MJ_NEWUSER_LASTNAME ?? '',
    Email: process.env.MJ_NEWUSER_EMAIL ?? '',
    Roles: ['Developer', 'Integration', 'UI'],
  },
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
  },
  newEntityRelationshipDefaults: {
    AutomaticallyCreateRelationships: true,
    CreateOneToManyRelationships: true,
  },
  newSchemaDefaults: {
    CreateNewApplicationWithSchemaName: true,
  },
  excludeSchemas: ['sys', 'staging', '__mj'],
  excludeTables: [
    {
      schema: '%',
      table: 'sys%',
    },
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
    AIModel: 'gpt-4-1106-preview',
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
      },
    ],
  },
  output: [
    { type: 'GraphQLServer', directory: './packages/MJAPI/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/GeneratedActions/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/GeneratedEntities/src/generated' },
  ],
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
      workingDirectory: './packages/MJAPI',
      command: 'npm',
      args: ['run', 'build'],
      when: 'after',
    },
  ],
  SQLOutput: {
    enabled: true,
    folderPath: './output/',
    appendToFile: true,
    convertCoreSchemaToFlywayMigrationFile: false,
  },
  forceRegeneration: {
    enabled: false, // Set to true to force regeneration even without schema changes
    baseViews: false,
    spCreate: false, // Set this to true to regenerate all spCreate procedures
    spUpdate: false,
    spDelete: false,
    allStoredProcedures: false, // Overrides individual SP flags when true
    indexes: false,
    fullTextSearch: false,
  },
};

/** @type {MJServerConfig} */
const mjServerConfig = {
  /**
   * MJAPI Configuration (previously config.json)
   */

  userHandling: {
    autoCreateNewUsers: process.env.AUTO_CREATE_NEW_USERS ? process.env.AUTO_CREATE_NEW_USERS === 1 : false,
    newUserLimitedToAuthorizedDomains: false,
    newUserAuthorizedDomains: [],
    newUserRoles: ['UI'],
    updateCacheWhenNotFound: true,
    updateCacheWhenNotFoundDelay: 5000,
    contextUserForNewUserCreation: 'not.set@nowhere.com',
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
  askSkip: {
    chatURL: process.env.ASK_SKIP_CHAT_URL,
    learningCycleURL: process.env.ASK_SKIP_LEARNING_URL,
    learningCycleIntervalInMinutes: process.env.ASK_SKIP_LEARNING_CYCLE_INTERVAL_IN_MINUTES,
    learningCycleEnabled: process.env.ASK_SKIP_RUN_LEARNING_CYCLES,
    learningCycleRunUponStartup: process.env.ASK_SKIP_RUN_LEARNING_CYCLES_UPON_STARTUP,
    orgID: process.env.ASK_SKIP_ORGANIZATION_ID,
    apiKey: process.env.ASK_SKIP_API_KEY,
    organizationInfo: process.env.ASK_SKIP_ORGANIZATION_INFO,
    entitiesToSendSkip: {
      excludeSchemas: ['__mj'],
      includeEntitiesFromExcludedSchemas: [
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
  },
};

/** @type {CodeGenConfig & MJConfig & MJServerConfig} */
const config = {
  ...codegenConfig,
  ...mjServerConfig,

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

  // Used only for CodeGenLib
  outputCode: process.env.OUTPUT_CODE,

  // Used for CodeGenLib and MJAPI
  dbInstanceName: process.env.DB_INSTANCE_NAME,
  mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',

  // Used only for MJAPI
  graphqlPort: process.env.PORT ?? process.env.GRAPHQL_PORT ?? 4000,
  ___codeGenAPIURL: process.env.CODEGEN_API_URL,
  ___codeGenAPIPort: process.env.CODEGEN_API_PORT,
  ___codeGenAPISubmissionDelay: process.env.CODEGEN_API_SUBMISSION_DELAY,
  graphqlRootPath: process.env.GRAPHQL_ROOT_PATH ?? '/',
  enableIntrospection: process.env.ENABLE_INTROSPECTION,
  websiteRunFromPackage: process.env.WEBSITE_RUN_FROM_PACKAGE,
  userEmailMap: process.env.USER_EMAIL_MAP,
  apiKey: process.env.MJ_API_KEY,
  
  /**
   * Authentication Provider Configuration
   * This replaces the legacy individual provider fields (webClientID, tenantID, auth0Domain, etc.)
   * Each provider encapsulates its issuer URL, audience, JWKS URI, and provider-specific config
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
    
    // Okta
    process.env.OKTA_DOMAIN && process.env.OKTA_CLIENT_ID ? {
      name: 'okta',
      type: 'okta',
      issuer: `https://${process.env.OKTA_DOMAIN}/oauth2/default`,
      audience: process.env.OKTA_CLIENT_ID,
      jwksUri: `https://${process.env.OKTA_DOMAIN}/oauth2/default/v1/keys`,
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      domain: process.env.OKTA_DOMAIN
    } : null,
  ].filter(Boolean), // Remove any null entries from providers that aren't configured

  // Used only for MJCLI
  migrationsLocation: process.env.MIGRATIONS_LOCATION ?? 'filesystem:./migrations',
};

module.exports = config;
