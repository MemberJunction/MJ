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

  // Include __mj schema for MJ framework development
  // Default excludes __mj since end-users shouldn't modify core entities
  excludeSchemas: ['sys', 'staging'],

  // Custom SQL scripts specific to this monorepo
  customSQLScripts: [
    {
      scriptFile: './SQL Scripts/MJ_BASE_BEFORE_SQL.sql',
      when: 'before-all',
    },
  ],

  // Soft PK/FK configuration for tables without database constraints
  //additionalSchemaInfo: './config/database-metadata-config.json',

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
    // {
    //   workingDirectory: './packages/MJAPI',
    //   command: 'npm',
    //   args: ['run', 'build'],
    //   when: 'after',
    // },
  ],

  /**
   * ====================
   * MCP Server Overrides
   * ====================
   */

  mcpServerSettings: {
    port: 3100,
    enableMCPServer: true,
    systemApiKey: 'MY_API_KEY_FOR_MCP_SERVER',

    // Authentication configuration
    // Supports: 'apiKey' (default), 'oauth', 'both', 'none'
    // OAuth uses the same auth providers as MJExplorer - no extra config needed!
    // Token audience is derived from the provider's config (WEB_CLIENT_ID env var for Azure AD)
    // Scopes are auto-generated from auth providers (e.g., api://{clientId}/.default for Azure AD)
    auth: {
      mode: 'both', // 'apiKey' | 'oauth' | 'both' | 'none'
      // resourceIdentifier: auto-generated as http://localhost:{port} for MCP client discovery
      // scopes: auto-generated from auth providers, or override with explicit array

      // OAuth Proxy - enables dynamic client registration (RFC 7591) for MCP clients
      // When enabled, the MCP Server acts as an OAuth Authorization Server that proxies
      // auth to the configured upstream provider (Azure AD, Auth0, etc.)
      // This allows MCP clients like Claude Code to authenticate without manual app registration
      proxy: {
        enabled: true, // Enable OAuth proxy for dynamic client registration
        upstreamProvider: 'auth0', // Optional: specify provider by name (defaults to first)
        // clientTtlMs: 24 * 60 * 60 * 1000, // 24 hours (default)
        // stateTtlMs: 10 * 60 * 1000, // 10 minutes (default)

        // Consent Screen - prompts users to select which scopes to grant
        // Scopes are loaded from __mj.APIScope table in the database
        // When false, all available scopes are granted automatically
        enableConsentScreen: true,

        // JWT Signing - the proxy issues its own JWTs (not upstream provider tokens)
        // Configure a secret for consistent token validation across server restarts
        // If not set, tokens won't be signed and consent screen won't work!
        // REQUIRED for consent screen to function
        jwtSigningSecret: process.env.MCP_JWT_SECRET,
        jwtExpiresIn: '1h', // Token expiration (default: 1h)
      },
    },

    actionTools: [
      {
        actionName: 'NOT YET SUPPORTED',
        actionCategory: '*',
      },
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
    ],
    agentTools: [
      {
        agentName: '*', // All agents (or specific name pattern)
        execute: true,
        status: true,
        cancel: true,
      },
    ],
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
    ],
  },

  /**
   * ====================
   * QueryGen Overrides
   * ====================
   */

  queryGen: {
    includeEntities: ['Members'], // Override to specific entities
  },

  /**
   * ====================
   * OAuth Providers (for MCP Server auth.mode: 'oauth' or 'both')
   * ====================
   *
   * AUTH PROVIDERS ARE AUTO-CONFIGURED FROM ENVIRONMENT VARIABLES:
   *
   * Azure AD / Entra ID (if TENANT_ID and WEB_CLIENT_ID are set in .env):
   *   - Automatically creates an 'azure' provider using these env vars
   *   - No manual authProviders config needed!
   *
   * Auth0 (if AUTH0_DOMAIN and AUTH0_CLIENT_ID are set in .env):
   *   - Automatically creates an 'auth0' provider using these env vars
   *   - Optional: AUTH0_CLIENT_SECRET
   *
   * MANUAL OVERRIDE: Only add authProviders below if you need to:
   *   - Use Okta, Cognito, or Google (no env var defaults yet)
   *   - Override the auto-configured settings
   *   - Add multiple providers
   *
   * authProviders: [
   *   {
   *     name: 'azure-ad',
   *     type: 'msal',
   *     clientId: 'your-client-id',
   *     tenantId: 'your-tenant-id',
   *     issuer: 'https://login.microsoftonline.com/{tenant}/v2.0',
   *     audience: 'api://your-app-id',
   *     jwksUri: 'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys'
   *   }
   * ],
   *
   * Supported provider types: 'msal' (Azure AD), 'auth0', 'okta', 'cognito', 'google'
   */

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

  // Public URL for OAuth callbacks (ngrok URL or production URL)
  // This is where the OAuth authorization server will redirect after user consent
  // OAuth routes are registered at /oauth/callback (independent of REST API)
  publicUrl: process.env.MJAPI_PUBLIC_URL || 'http://localhost:4000',
};
