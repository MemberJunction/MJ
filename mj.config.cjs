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
/**
 * The active database platform, with the same contract as `resolveDbPlatformFromEnv` in
 * @memberjunction/generic-database-provider: case-insensitive, canonical values only, and a LOUD
 * failure on legacy aliases rather than a silent fallback.
 *
 * Duplicated rather than imported because this is CommonJS config, read before any workspace
 * package is built. Kept deliberately tiny so the two cannot drift far.
 */
function dbPlatform() {
  const raw = process.env.DB_PLATFORM;
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return undefined;
  if (normalized === 'sqlserver' || normalized === 'postgresql') return normalized;
  throw new Error(
    `Invalid DB_PLATFORM value '${raw}'. Must be 'sqlserver' or 'postgresql' (case-insensitive). ` +
      `Legacy aliases ('mssql', 'postgres', 'pg') are not supported.`
  );
}

module.exports = {
  /**
   * ====================
   * Database Configuration
   * ====================
   *
   * Required by CLI tools (mj test, mj sync, etc.) that don't go through the
   * MJServer config merging path. Values are read from .env.
   */
  /**
   * ====================
   * Testing (`mj test`)
   * ====================
   *
   * checkModules: module specifiers side-effect-imported by `mj test run` / `mj test suite`
   * before any integration bundle resolves — each import registers its check bundles on the
   * IntegrationCheckRegistry. MJ's own suite lives in the PRIVATE (never published)
   * @memberjunction/integration-test-suite package, so the published CLI cannot depend on it;
   * this config key is the sanctioned runtime-plugin seam that loads it in-repo. External
   * adopters point this at their own check packages.
   */
  testing: {
    checkModules: ['@memberjunction/integration-test-suite'],
  },

  dbPlatform: dbPlatform() || 'sqlserver',
  dbHost: process.env.DB_HOST || 'localhost',
  // Default port follows the platform. With DB_PLATFORM unset this is the SQL Server default
  // exactly as before, so existing setups — including integration.yml, which sets neither
  // variable — are unaffected.
  //
  // Both lines resolve through `dbPlatform()` rather than reading the raw variable, so this file
  // agrees with `resolveDbPlatformFromEnv`, which every other consumer uses. Reading it raw
  // disagreed twice over: `Postgresql` fell through to 1433, and the legacy aliases `postgres` /
  // `pg` — which the resolver rejects LOUDLY, precisely so a typo cannot route the wrong dialect at
  // a real database — were silently accepted here as a platform string while still getting the SQL
  // Server port. The resulting connection error points at the network, not at the typo.
  dbPort: process.env.DB_PORT
    ? parseInt(process.env.DB_PORT)
    : (dbPlatform() === 'postgresql' ? 5432 : 1433),
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === '1' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  coreSchema: process.env.MJ_CORE_SCHEMA || '__mj',

  // CodeGen uses its own credentials with broader DDL permissions
  codeGenLogin: process.env.CODEGEN_DB_USERNAME,
  codeGenPassword: process.env.CODEGEN_DB_PASSWORD,

  /**
   * ====================
   * Magic Link (external, app-scoped access) — dev/e2e
   * ====================
   * Ephemeral RS256 key (no rsaPrivateKey) — fine for local testing; restart
   * invalidates outstanding magic-link sessions. No communicationProvider, so
   * POST /magic-link/create returns the raw redemption link in its response
   * instead of emailing it. Provisioning context user falls back to an Owner.
   */
  magicLink: {
    // Off by default — opt-in feature. Flip to true locally to exercise the
    // dev/e2e flow (ephemeral key, link returned in the create response).
    enabled: false,
    restrictedRoleName: 'Magic Link Baseline',
    defaultExpiresInHours: 72,
    sessionTokenTtlHours: 8,
    audience: 'mj-magic-link',
    // Browser redeems redirect into the Explorer dev server (port 4201) with the
    // token in the URL fragment; Explorer's magic-link auth provider reads it.
    explorerUrl: 'http://localhost:4201',
  },

  /**
   * ====================
   * Telephony (Twilio) — dev/e2e
   * ====================
   * Credentials read from .env (cycled secrets stay out of source). `enabled` gates
   * whether the public /telephony/twilio routes + Media-Streams WSS mount at boot.
   * streamPublicUrl is the wss://<public-host>/telephony/twilio/media URL Twilio's
   * <Connect><Stream> connects to — for LIVE inbound/audio it MUST be a publicly
   * reachable tunnel (ngrok) pointed at this API's port, and MJAPI_PUBLIC_URL must
   * match (the inbound webhook signature is verified against the full public URL).
   */
  telephony: {
    enabled: !!(process.env.TWILIO_ACCOUNT_SID || process.env.VONAGE_APPLICATION_ID),
    twilio: process.env.TWILIO_ACCOUNT_SID
      ? {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          apiKeySid: process.env.TWILIO_API_KEY_SID || undefined,
          apiKeySecret: process.env.TWILIO_API_KEY_SECRET || undefined,
          streamPublicUrl: process.env.TWILIO_STREAM_PUBLIC_URL || 'wss://localhost:4008/telephony/twilio/media',
          webhookSigningSecret: process.env.TWILIO_WEBHOOK_SIGNING_SECRET || undefined,
        }
      : undefined,
    // Vonage Voice — Voice API auth is application-scoped (Application ID + RSA private key →
    // signed JWTs); the account apiKey/apiSecret pair is carried for key-scoped ops + the
    // signatureSecret gates webhook verification. PrivateKey is read from a PEM file path so a
    // multi-line key never has to live in .env. enabled is gated on VONAGE_APPLICATION_ID since
    // that (not the API key) is what actually places calls.
    vonage: process.env.VONAGE_APPLICATION_ID
      ? {
          applicationId: process.env.VONAGE_APPLICATION_ID,
          privateKey: process.env.VONAGE_PRIVATE_KEY_PATH
            ? require('fs').readFileSync(process.env.VONAGE_PRIVATE_KEY_PATH, 'utf8')
            : process.env.VONAGE_PRIVATE_KEY || undefined,
          apiKey: process.env.VONAGE_API_KEY || undefined,
          apiSecret: process.env.VONAGE_API_SECRET || undefined,
          mediaPublicUrl: process.env.VONAGE_MEDIA_PUBLIC_URL || 'wss://localhost:4008/telephony/vonage/media',
          signatureSecret: process.env.VONAGE_SIGNATURE_SECRET || process.env.VONAGE_API_SECRET || undefined,
          eventUrl: process.env.VONAGE_EVENT_URL || undefined,
        }
      : undefined,
  },

  /**
   * ====================
   * Public Web Widget — dev/e2e
   * ====================
   * Master switch for the droppable guest support widget. When false, the public
   * /widget/session|/session/refresh|/upgrade routes are NOT mounted and the mint
   * falls through to the unified auth middleware (→ 401). The widget reuses the
   * magic-link RS256 key + auth provider (initialized idempotently even when
   * magicLink.enabled is false), so `enabled: true` is the only required field.
   * `audience` MUST equal magicLink.audience or minted guest tokens won't validate.
   * Per-instance config (pinned agent, allowed origins, modality, TTL, rate limit,
   * voice ceiling) lives on the WidgetInstance row in metadata, not here.
   */
  widget: {
    enabled: true,
    audience: 'mj-magic-link',
  },

  /**
   * ====================
   * CodeGen Overrides
   * ====================
   */

  // Include __mj schema for MJ framework development
  // Default excludes __mj since end-users shouldn't modify core entities
  excludeSchemas: ['sys', 'staging'],
  includeSchemas: ['__mj'],
  SQLOutput: {
    enabled: true,
    folderPath: './migrations/v6/',
    appendToFile: true,
    convertCoreSchemaToFlywayMigrationFile: true,
    omitRecurringScriptsFromLog: true,
  },

  // Default for CodeGen with larger batches, if this 
  // isn't in place, hard default of 5 is fallback, much slower
  advancedGeneration: {
    batchSize: 15,
  },

  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'recompile_mj_views', value: true },
    { name: 'auto_index_foreign_keys', value: true },
  ],


  // Custom SQL scripts specific to this monorepo - NO LONGER INCLUDING MJ_BASE_BEFORE_SQL.sql as of 5.3.0!
  customSQLScripts: [
  ],

  // Soft PK/FK configuration for tables without database constraints
  additionalSchemaInfo: './metadata/integrations/additionalSchemaInfo.json',

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
    // Remote Operations typed bases — parallel to the entity-subclass split: core MJ ops ship in
    // @memberjunction/core-entities; downstream/user repos add a `RemoteOperations` entry pointing at
    // their GeneratedEntities package (this repo doesn't generate non-core ops, so only the core target is set).
    { type: 'CoreRemoteOperations', directory: './packages/MJCoreEntities/src/generated' },
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
        schemaName: '*',
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
        schemaName: '*',
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
   * Server Extensions
   * ====================
   */
  serverExtensions: [
    {
      Enabled: true,
      DriverClass: 'SlackMessagingExtension',
      RootPath: '/webhook/slack',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'your-service-account@company.com',
        BotToken: process.env.SLACK_BOT_TOKEN,
        SigningSecret: process.env.SLACK_SIGNING_SECRET,
        ConnectionMode: 'http',
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 1500,
        ExplorerBaseURL: 'http://localhost:4201',
        SlashCommands: {
          '/sage': 'Sage',
          '/skip': 'Skip',
          '/research': 'Research Agent',
          '/marketing': 'Marketing Agent',
          '/codesmith': 'Codesmith Agent',
          '/query': 'Query Builder',
        },
      }
    },
    {
      Enabled: true,
      DriverClass: 'TeamsMessagingExtension',
      RootPath: '/webhook/teams',
      Settings: {
        DefaultAgentName: process.env.MJ_BOT_DEFAULT_AGENT_NAME || 'Sage',
        ContextUserEmail: process.env.MJ_BOT_CONTEXT_USER_EMAIL || 'your-service-account@company.com',
        MicrosoftAppId: process.env.MICROSOFT_APP_ID,
        MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD,
        MaxThreadMessages: 50,
        StreamingUpdateIntervalMs: 2000,
      }
    }
  ],

  /**
   * ====================
   * QueryGen Overrides
   * ====================
   */

  queryGen: {
    includeEntities: [], // Override to specific entities
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
   * API Key Generation
   * ====================
   *
   * Configuration for API key generation parameters.
   *
   * WARNING: Changing these values after API keys have been issued will
   * INVALIDATE all existing keys. Only modify before creating any keys,
   * or be prepared to rotate all keys.
   *
   * All properties are optional and default to:
   *   prefix: 'mj_sk_'       - Prefix prepended to generated keys
   *   entropyBytes: 32        - Random bytes of entropy (64 hex chars / 43 base64url chars)
   *   encoding: 'hex'         - Key body encoding: 'hex' or 'base64url'
   *   hashAlgorithm: 'sha256' - Hash algorithm for key storage
   *
   * Example: base64url encoding with custom prefix for shorter keys:
   *   apiKeyGeneration: {
   *     prefix: 'skip-',
   *     entropyBytes: 50,
   *     encoding: 'base64url',
   *   },
   */
  // apiKeyGeneration: {
  //   prefix: 'mj_sk_',
  //   entropyBytes: 32,
  //   encoding: 'hex',
  //   hashAlgorithm: 'sha256',
  // },

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

  // Override example: To set a custom publicUrl for OAuth callbacks, uncomment:
  // publicUrl: 'https://your-custom-url.com',
  //
  // Note: If MJAPI_PUBLIC_URL env var is set, it will be used automatically.
  // If neither is set, the server constructs it from baseUrl + port + path.

  // ── LOCAL DEV WORKSPACE ONLY — NEVER COMMIT ──────────────────────────────
  // Registers the BizApps Open Apps into this host (MJAPI + MJExplorer) for the
  // joined M5 parent workspace, running against the bizapps_orders database.
  // Server order matters: common registers its base classes before accounting
  // resolves them, and accounting before orders (orders-server imports both).
  dynamicPackages: {
    server: [
      { PackageName: '@mj-biz-apps/common-server', StartupExport: 'LoadBizAppsCommonServer', AppName: 'mj-bizapps-common', Enabled: true },
      { PackageName: '@mj-biz-apps/accounting-server', StartupExport: 'LoadBizAppsAccountingServer', AppName: 'mj-bizapps-accounting', Enabled: true },
      { PackageName: '@mj-biz-apps/orders-server', StartupExport: 'LoadBizAppsOrdersServer', AppName: 'mj-bizapps-orders', Enabled: true },
      { PackageName: '@mj-biz-apps/tasks-server', StartupExport: 'LoadBizAppsTasksServer', AppName: 'mj-bizapps-tasks', Enabled: true },
      { PackageName: '@mj-biz-apps/issues-server', StartupExport: 'LoadBizAppsIssuesServer', AppName: 'mj-bizapps-issues', Enabled: true },
      { PackageName: '@mj-biz-apps/committees-server', StartupExport: 'LoadBizAppsCommitteesServer', AppName: 'mj-bizapps-committees', Enabled: true },
      { PackageName: '@mj-biz-apps/secure-messaging-server', StartupExport: 'LoadBizAppsSecureMessagingServer', AppName: 'mj-bizapps-secure-messaging', Enabled: true },
    ],
    client: [
      { PackageName: '@mj-biz-apps/common-ng', AppName: 'mj-bizapps-common', Enabled: true },
      { PackageName: '@mj-biz-apps/accounting-ng', AppName: 'mj-bizapps-accounting', Enabled: true },
      { PackageName: '@mj-biz-apps/orders-ng', AppName: 'mj-bizapps-orders', Enabled: true },
      { PackageName: '@mj-biz-apps/tasks-ng', AppName: 'mj-bizapps-tasks', Enabled: true },
      { PackageName: '@mj-biz-apps/issues-ng', AppName: 'mj-bizapps-issues', Enabled: true },
      { PackageName: '@mj-biz-apps/committees-ng', AppName: 'mj-bizapps-committees', Enabled: true },
      { PackageName: '@mj-biz-apps/secure-messaging-ng', AppName: 'mj-bizapps-secure-messaging', Enabled: true },
    ],
  },
};
