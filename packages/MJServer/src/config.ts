import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus, LogStatusEx } from '@memberjunction/core';
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

const loggingSettingsSchema = z.object({
  graphql: z.object({
    /**
     * When true, emit a redacted variables block per root resolver call via the
     * type-graphql global middleware. Default: false in all environments regardless
     * of NODE_ENV. Env override: `MJ_LOG_GRAPHQL_VARIABLES`.
     *
     * SECURITY: this is an opt-in verbose-echo path for developers debugging locally.
     * The always-on request log line in `context.ts` does NOT emit variables — that
     * is the load-bearing leak fix. This flag is additive on top of the always-on log.
     */
    logVariables: z.boolean().optional().default(false),
  }).optional().default({}),
});

const corsSchema = z.object({
  /** Allowed origins for CORS. Default ['*'] preserves backward-compatible "allow all" behavior. */
  allowedOrigins: z.array(z.string()).default(['*']),
  /** Whether to include credentials (cookies, auth headers) in CORS responses. */
  allowCredentials: z.boolean().default(true),
  /** How long (seconds) browsers may cache preflight responses. Default 24 hours. */
  maxAge: z.number().default(86400),
});

const rateLimitSchema = z.object({
  /** Master switch — when false (default), no rate limiting is applied. */
  enabled: z.boolean().default(false),
  global: z.object({
    /** Sliding window duration in milliseconds. */
    windowMs: z.number().default(60_000),
    /** Maximum requests per window per IP. */
    maxRequests: z.number().default(300),
    /** Response body sent when the limit is exceeded. */
    message: z.string().default('Too many requests, please try again later'),
  }).default({}),
  auth: z.object({
    /** Sliding window duration in milliseconds for auth endpoints. */
    windowMs: z.number().default(900_000),
    /** Maximum failed auth attempts per window per IP. */
    maxAttempts: z.number().default(15),
  }).default({}),
  graphql: z.object({
    /** Sliding window duration in milliseconds for GraphQL operations. */
    windowMs: z.number().default(60_000),
    /** Maximum GraphQL operations per window per IP. */
    maxRequests: z.number().default(100),
  }).default({}),
});

const feedbackGithubSettingsSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  defaultLabels: z.array(z.string()).optional(),
  categoryLabels: z.record(z.string()).optional(),
  severityLabels: z.record(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

const feedbackSettingsSchema = z.object({
  /** Org-level kill switch for the in-app feedback feature. Defaults to true (enabled). */
  enabled: z.boolean().optional().default(true),
  /** Optional GitHub-specific settings used by the feedback resolver. */
  github: feedbackGithubSettingsSchema.optional(),
});

const magicLinkSchema = z.object({
  /** Master switch for the magic-link feature. When false, routes are not mounted and the auth provider is not registered. */
  enabled: zodBooleanWithTransforms().default(false),
  /**
   * PEM-encoded RS256 private key used to sign session JWTs. May be raw PEM or
   * base64-encoded PEM. If omitted, an ephemeral keypair is generated at startup
   * (dev only — restarting the server invalidates all outstanding sessions).
   */
  rsaPrivateKey: z.string().optional().default(process.env.MJ_MAGIC_LINK_PRIVATE_KEY || ''),
  /** Hours an unredeemed invite link remains valid (hard expiry). Default 72. */
  defaultExpiresInHours: z.coerce.number().optional().default(72),
  /** Hours the minted session JWT remains valid after redemption. No refresh tokens. Default 8. */
  sessionTokenTtlHours: z.coerce.number().optional().default(8),
  /** Name of the restricted Role assigned to redeeming users when an invite does not specify one. */
  restrictedRoleName: z.string().optional().default('Magic Link Baseline'),
  /**
   * Role names (besides Owner) whose members may issue invites via POST /create.
   * Empty (default) means Owner-only — the secure default. The restricted role
   * must never be listed here, or external users could mint their own invites.
   */
  inviteIssuerRoleNames: z.array(z.string()).optional().default([]),
  /**
   * Role names an invite may grant, IN ADDITION to restrictedRoleName (which is
   * always allowed). A caller-supplied roleId is rejected unless its role name is
   * the restricted role or appears here. This is the guard that stops a caller
   * from attaching a privileged role (e.g. Owner) to an external magic-link user.
   */
  grantableRoleNames: z.array(z.string()).optional().default([]),
  /** Email of the internal user whose context provisions magic-link users (falls back to userHandling.contextUserForNewUserCreation). */
  contextUserForProvisioning: z.string().optional(),
  /**
   * Guard against bolting an external magic-link role/app onto an EXISTING account
   * that is an Owner or already holds non-restricted ("real") roles. One mistyped
   * recipient email is all it takes to hand a colleague an external role otherwise.
   * `block` (default) refuses to provision onto such accounts; `warn` logs loudly
   * and proceeds. Provisioning onto brand-new or already-external accounts is never
   * affected.
   */
  provisioningGuard: z.enum(['block', 'warn']).optional().default('block'),
  /** CommunicationEngine provider name used to deliver invite emails (e.g. 'SendGrid', 'Microsoft Graph'). When unset, emails are not sent and the redemption link is returned to the caller instead. */
  communicationProvider: z.string().optional(),
  /** From address for invite emails. */
  fromAddress: z.string().optional(),
  /** Audience claim for minted JWTs and the auto-registered magic-link auth provider. */
  audience: z.string().optional().default('mj-magic-link'),
  /** Rate-limit window (ms) for the public /redeem and authenticated /create endpoints. Default 60s. */
  rateLimitWindowMs: z.coerce.number().optional().default(60_000),
  /** Max /redeem attempts per IP per window. Default 20. */
  redeemRateLimitMax: z.coerce.number().optional().default(20),
  /** Max /create requests per IP per window. Default 30. */
  createRateLimitMax: z.coerce.number().optional().default(30),
  /**
   * Base URL of the Explorer instance that redeems land in. When set, GET
   * /magic-link/redeem 302-redirects the browser to `${explorerUrl}/#token=<jwt>`
   * (Explorer's magic-link auth provider reads the fragment). When unset, redeem
   * returns the token as JSON. Append `?format=json` to force JSON regardless.
   */
  explorerUrl: z.string().optional(),
}).passthrough();

/**
 * Public web widget config (plans/realtime/bridges-and-widget/public-web-widget.md).
 * The widget REUSES the magic-link RS256 key + `anonymous-embed` synthesis, so it
 * shares the magic-link `audience`/issuer/JWKS by default — the same auth provider
 * validates both. When `enabled`, the server ensures the magic-link key manager is
 * initialized and the provider registered even if `magicLink.enabled` is false.
 */
const widgetSchema = z.object({
  /** Master switch. When false, the /widget routes are not mounted. */
  enabled: zodBooleanWithTransforms().default(false),
  /**
   * Which signing mechanism the widget reuses. Only `magic-link` is supported today
   * (shares MagicLinkKeyManager + the magic-link auth provider). Recorded so a future
   * dedicated widget key is a config flip, not a code change.
   */
  signingReuse: z.enum(['magic-link']).optional().default('magic-link'),
  /**
   * Audience claim for minted guest JWTs. MUST equal the magic-link audience so the
   * auto-registered `magic-link` auth provider validates widget tokens.
   */
  audience: z.string().optional().default('mj-magic-link'),
  /** Email of the shared Anonymous principal used in guest claims (resolves the synthesized guest user). */
  anonymousEmail: z.string().optional().default('anonymous@magic-link.local'),
  /** Fallback session-token TTL (minutes) when a widget instance does not set its own. */
  defaultSessionTtlMinutes: z.coerce.number().optional().default(15),
  /** Fallback mint rate-limit (per IP per window) when a widget instance does not set its own. */
  defaultRateLimitPerMinute: z.coerce.number().optional().default(30),
  /** Rate-limit window (ms) for the public /widget/session endpoints. Default 60s. */
  rateLimitWindowMs: z.coerce.number().optional().default(60_000),
  /** Server-wide default hard ceiling (minutes) on a voice session when an instance omits one (W4). */
  voiceDefaultMaxSessionMinutes: z.coerce.number().optional().default(10),
  /** Email/name of the internal user whose context READS widget config at mint time (falls back to system/Owner). */
  contextUserForLookup: z.string().optional(),
  /**
   * Host-identity public keys (PEM), keyed by widget PublicKey, for the `host-identity` auth
   * strategy (D1). The host signs a short-lived RS256 assertion; the mint verifies it against
   * the key here. INTERIM location — production should store the host key per widget instance
   * (a HostPublicKey column on WidgetInstance, pending a migration). When a widget's strategy is
   * HostIdentity and no key is configured here, host mints fail closed.
   */
  hostPublicKeys: z.record(z.string(), z.string()).optional().default({}),
  /**
   * Returning-visitor identity-resolution target (RV4). When a visitor verifies (magic-link upgrade)
   * or a host asserts their identity, their email is resolved to a record `(entityName, recordId)`
   * and prior anonymous memory is merged onto that polymorphic pair. Deployment-configurable so the
   * resolved record need NOT be an MJ User — point it at any entity that carries the visitor's email
   * (e.g. a CRM `Persons` table). Defaults to the core `Users` entity keyed by `Email`.
   */
  identityResolution: z.object({
    entityName: z.string().optional().default('Users'),
    emailField: z.string().optional().default('Email'),
  }).optional(),
}).passthrough();

/**
 * Telephony bridge config (plans/realtime/bridges-and-widget/telephony-vendor-bindings.md).
 * Holds the per-vendor credentials + public stream URL the MJAPI telephony ingress wires onto
 * the already-stubbed native SDK seams. Credentials resolve here from `mj.config.cjs` / env —
 * never inlined in code. When `twilio` is omitted, the Twilio telephony routes are not mounted.
 */
const twilioTelephonySchema = z.object({
  /** Twilio Account SID (`AC…`). */
  accountSid: z.string(),
  /** Account auth token — REST auth (when no API key pair) AND the HMAC key for X-Twilio-Signature verification. */
  authToken: z.string().optional(),
  /** API Key SID (`SK…`) — preferred over the auth token for REST auth when paired with apiKeySecret. */
  apiKeySid: z.string().optional(),
  /** API Key secret — paired with apiKeySid. */
  apiKeySecret: z.string().optional(),
  /** The publicly reachable `wss://…/telephony/twilio/media` URL Twilio's <Connect><Stream> connects to. */
  streamPublicUrl: z.string(),
  /** Optional shared secret gating the public webhook/WSS endpoints (defense-in-depth beyond signature verification). */
  webhookSigningSecret: z.string().optional(),
  /** Optional status-callback URL Twilio posts call lifecycle events to. */
  statusCallbackUrl: z.string().optional(),
}).passthrough();

/**
 * Vonage Voice + WebSocket-media telephony binding. Voice-API auth is application-scoped
 * (application id + RSA private key) with an optional account API key pair for key-scoped ops;
 * signatureSecret is the HMAC key for signed-request `sig` AND HS256 webhook-JWT verification.
 * When `vonage` is omitted, the Vonage telephony routes are not mounted.
 */
const vonageTelephonySchema = z.object({
  /** Vonage Application ID (UUID) — the JWT-auth identity for the Voice API. */
  applicationId: z.string().optional(),
  /** The application's RSA private key (PEM) used to sign Voice-API JWTs. */
  privateKey: z.string().optional(),
  /** Account API key — used for key-scoped operations when no application credential pair is supplied. */
  apiKey: z.string().optional(),
  /** Account API secret — paired with apiKey. */
  apiSecret: z.string().optional(),
  /** The publicly reachable `wss://…/telephony/vonage/media` URL the call's connect NCCO opens. */
  mediaPublicUrl: z.string(),
  /** Vonage account signature secret — HMAC key for signed-request `sig` AND HS256 webhook-JWT verification. */
  signatureSecret: z.string().optional(),
  /** Optional event-webhook URL Vonage posts call lifecycle events to (passed on outbound createCall). */
  eventUrl: z.string().optional(),
}).passthrough();

/**
 * RingCentral telephony binding: **SIP device credentials** for the headless softphone (the
 * `ringcentral-softphone` SIP/RTP path — the only RingCentral product that carries bidirectional call
 * audio; the WebSocket "Call Streaming" product is receive-only). These come from a RingCentral
 * "Other Phone" (BYO-device) registration's SIP info, resolved here from `mj.config.cjs` / env — never
 * inlined. When `ringcentral` is omitted, the RingCentral softphone is not started.
 *
 * Unlike Twilio/Vonage, there is NO public HTTP webhook or media WSS: the softphone is an outbound SIP
 * registration that receives inbound INVITEs directly over its own SIP/TLS connection. So this block has
 * no signing secret or public URL — just the SIP device creds + codec.
 */
const ringcentralTelephonySchema = z.object({
  /** SIP domain (e.g. `sip.ringcentral.com`). */
  sipDomain: z.string(),
  /** SIP outbound proxy (`host:port`, e.g. `sip10.ringcentral.com:5096`). */
  sipOutboundProxy: z.string(),
  /** SIP auth username (the device's phone number / extension). */
  sipUsername: z.string(),
  /** SIP auth password (resolved upstream — never inlined). */
  sipPassword: z.string(),
  /** SIP authorization id (the device's RingCentral authorization id). */
  sipAuthorizationId: z.string(),
  /** Codec to negotiate. Defaults to `OPUS/16000` (clean wideband PCM16 — the least-friction realtime path). */
  codec: z.enum(['OPUS/16000', 'OPUS/48000/2', 'PCMU/8000']).optional(),
  /** Skip TLS cert validation (sandbox/test only — never in production). */
  ignoreTlsCertErrors: zodBooleanWithTransforms().optional().default(false),
}).passthrough();

/**
 * Teams meetings bridge config (plans/realtime/bridges-and-widget/meeting-vendor-bindings-teams-slack.md M1).
 * Holds the bot credentials + Graph webhook shared secret + ACS audio rate the MJAPI meetings ingress wires
 * onto the Teams binding seams. Credentials resolve here from `mj.config.cjs` / env — never inlined in code.
 * When `teams` is omitted (or disabled), the Teams meetings routes are not mounted.
 */
const teamsMeetingsSchema = z.object({
  /** Master switch for the Teams meetings ingress. */
  enabled: zodBooleanWithTransforms().default(false),
  /** The bot's Azure AD application (client) id (resolved upstream; carried for diagnostics). */
  appId: z.string().optional(),
  /** The Azure tenant id the bot operates in. */
  tenantId: z.string().optional(),
  /** A pre-resolved OAuth bearer / application token for the bot's Graph calls (resolved upstream — never inline). */
  botAccessToken: z.string().optional(),
  /** The shared secret set as `clientState` on the Graph subscription; gates the change-notification webhook. */
  notificationClientState: z.string().optional(),
  /** The ACS application-hosted-media PCM sample rate (Hz) the audio plane negotiates. Defaults to 16000. */
  acsSampleRate: z.coerce.number().optional().default(16000),
  /** The realtime model's PCM16 sample rate (Hz) the binding resamples to/from. Defaults to 16000. */
  modelSampleRate: z.coerce.number().optional().default(16000),
}).passthrough();

const telephonySchema = z.object({
  /** Master switch. When false (or when no vendor block is present), telephony routes are not mounted. */
  enabled: zodBooleanWithTransforms().default(false),
  /** Twilio Programmable Voice + Media Streams binding. */
  twilio: twilioTelephonySchema.optional(),
  /** Vonage Voice + WebSocket-media binding. */
  vonage: vonageTelephonySchema.optional(),
  /** RingCentral Call Control + media-stream binding. */
  ringcentral: ringcentralTelephonySchema.optional(),
  /** Microsoft Teams meetings (Graph cloud-communications + ACS application-hosted media) binding. */
  teams: teamsMeetingsSchema.optional(),
}).passthrough();

const configInfoSchema = z.object({
  userHandling: userHandlingInfoSchema,
  magicLink: magicLinkSchema.optional().default({}),
  widget: widgetSchema.optional().default({}),
  telephony: telephonySchema.optional().default({}),
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
  loggingSettings: loggingSettingsSchema.optional().default({}),
  feedbackSettings: feedbackSettingsSchema.optional().default({}),
  cors: corsSchema.optional().default({}),
  rateLimiting: rateLimitSchema.optional().default({}),

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
export type MagicLinkConfig = z.infer<typeof magicLinkSchema>;
export type WidgetConfig = z.infer<typeof widgetSchema>;
export type TelephonyConfig = z.infer<typeof telephonySchema>;
export type TwilioTelephonyConfig = z.infer<typeof twilioTelephonySchema>;
export type VonageTelephonyConfig = z.infer<typeof vonageTelephonySchema>;
export type RingCentralTelephonyConfig = z.infer<typeof ringcentralTelephonySchema>;
export type TeamsMeetingsConfig = z.infer<typeof teamsMeetingsSchema>;
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
export type LoggingSettingsConfig = z.infer<typeof loggingSettingsSchema>;
export type FeedbackGithubSettingsConfig = z.infer<typeof feedbackGithubSettingsSchema>;
export type FeedbackSettingsConfig = z.infer<typeof feedbackSettingsSchema>;
export type CorsConfig = z.infer<typeof corsSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitSchema>;
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

  // Logging settings defaults — variables logging is always off unless the operator
  // sets MJ_LOG_GRAPHQL_VARIABLES=true (or sets logVariables in mj.config.cjs).
  // NOTE: this only governs the opt-in verbose-echo middleware. The always-on request
  // log in context.ts already strips variables unconditionally.
  loggingSettings: {
    graphql: {
      logVariables: parseBooleanEnv(process.env.MJ_LOG_GRAPHQL_VARIABLES),
    },
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

/**
 * Absolute path to the resolved config file, captured during {@link loadConfig}.
 * `undefined` when no config file was found (defaults in use). Rendered in the
 * startup summary `Config` line. Declared before `configInfo` so the assignment
 * inside `loadConfig()` (invoked below) is not in its temporal dead zone.
 */
export let configFilePath: string | undefined;

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
    // Resolved config-file path. Surfaced in the startup summary `Config` line at standard
    // level (see StartupLogger). Demoted to verbose-only here to avoid a duplicate inline line.
    configFilePath = configSearchResult.filepath;
    LogStatusEx({ message: `Config file found at ${configSearchResult.filepath}`, verboseOnly: true });

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
