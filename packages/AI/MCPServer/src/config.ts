/**
 * @fileoverview Configuration loader for the MemberJunction MCP Server.
 *
 * Loads configuration from:
 * 1. Environment variables (.env file via dotenv - searches upward from cwd)
 * 2. Configuration file (mj.config.cjs via cosmiconfig)
 * 3. Default server configuration as fallback
 *
 * Configuration is validated using Zod schemas to ensure type safety.
 *
 * @module @memberjunction/ai-mcp-server/config
 */

import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/core';
import { mergeConfigs } from '@memberjunction/config';

/**
 * IMPORTANT: Why we use dynamic import() for DEFAULT_SERVER_CONFIG
 *
 * We generally disallow dynamic imports in this codebase, but this is a necessary exception.
 *
 * Problem:
 * - @memberjunction/server's config.ts reads process.env at module load time to create DEFAULT_SERVER_CONFIG
 * - ESM hoists all static imports, so they execute BEFORE any inline code in this file
 * - If we use `import { DEFAULT_SERVER_CONFIG } from '@memberjunction/server'` at the top,
 *   it runs before our dotenv.config() call, and process.env is empty
 *
 * Solution:
 * - Load dotenv first (above) which populates process.env with DB credentials from .env
 * - Use dynamic import() inside initConfig() to load DEFAULT_SERVER_CONFIG AFTER dotenv runs
 * - This ensures process.env.DB_DATABASE, etc. are set when @memberjunction/server evaluates them
 *
 * Alternative approaches considered:
 * - Creating a separate bootstrap entry point - adds complexity
 * - Using Node.js -r flag to preload dotenv - not portable across npm scripts
 * - Modifying MJServer - out of scope for this package
 */

/**
 * Searches upward from the current directory for a .env file.
 * This mimics cosmiconfig's search behavior so the .env file is found
 * in the same location as mj.config.cjs (typically the repo root).
 *
 * @returns Path to the .env file if found, undefined otherwise
 */
function findEnvFile(): string | undefined {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

// Load .env file from repo root (searches upward like cosmiconfig does for mj.config.cjs)
const envPath = findEnvFile();
if (envPath) {
  console.log(`MCP Server: Loading environment from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`MCP Server: No .env file found, using existing environment variables`);
}

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

const databaseSettingsInfoSchema = z.object({
  connectionTimeout: z.number(),
  requestTimeout: z.number(),
  dbReadOnlyUsername: z.string().optional(),
  dbReadOnlyPassword: z.string().optional(),
});

const mcpServerEntityToolInfoSchema = z.object({
  entityName: z.string().optional(),
  schemaName: z.string().optional(),
  get: z.boolean().optional().default(false),
  create: z.boolean().optional().default(false),
  update: z.boolean().optional().default(false),
  delete: z.boolean().optional().default(false),
  runView: z.boolean().optional().default(false),
});

const mcpServerActionToolInfoSchema = z.object({
  actionName: z.string().optional(),
  actionCategory: z.string().optional(),
  discover: z.boolean().optional().default(false),
  execute: z.boolean().optional().default(false),
});

const mcpServerQueryToolInfoSchema = z.object({
  enabled: z.boolean().optional().default(false),
  allowedSchemas: z.array(z.string()).optional(),
  blockedSchemas: z.array(z.string()).optional(),
});

const mcpServerPromptToolInfoSchema = z.object({
  promptName: z.string().optional(),
  promptCategory: z.string().optional(),
  discover: z.boolean().optional().default(false),
  execute: z.boolean().optional().default(false),
});

const mcpServerCommunicationToolInfoSchema = z.object({
  enabled: z.boolean().optional().default(false),
  allowedProviders: z.array(z.string()).optional(),
});

const mcpServerAgentToolInfoSchema = z.object({
  agentName: z.string().optional(),
  discover: z.boolean().optional().default(false),
  execute: z.boolean().optional().default(false),
  status: z.boolean().optional().default(false),
  cancel: z.boolean().optional().default(false),
});

/**
 * Zod schema for OAuth Proxy settings.
 * The OAuth proxy enables dynamic client registration (RFC 7591) for MCP clients.
 */
const oauthProxySettingsSchema = z.object({
  /** Enable the OAuth proxy authorization server */
  enabled: z.boolean().default(false),
  /**
   * Upstream provider to use for authentication.
   * This should match one of the configured auth providers by name.
   * If not specified, the first available provider is used.
   */
  upstreamProvider: z.string().optional(),
  /** TTL for registered clients in milliseconds (default: 24 hours) */
  clientTtlMs: z.number().default(24 * 60 * 60 * 1000),
  /** TTL for authorization state in milliseconds (default: 10 minutes) */
  stateTtlMs: z.number().default(10 * 60 * 1000),
  /**
   * Secret key for signing proxy-issued JWTs (HS256).
   * Must be at least 32 bytes (256 bits). Can be base64 encoded.
   * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * If not set, the proxy will pass through upstream tokens instead of issuing its own.
   */
  jwtSigningSecret: z.string().optional(),
  /**
   * JWT expiration time for proxy-issued tokens.
   * @default '1h' (1 hour)
   */
  jwtExpiresIn: z.string().default('1h'),
  /**
   * Issuer claim for proxy-signed JWTs.
   * @default 'urn:mj:mcp-server'
   */
  jwtIssuer: z.string().default('urn:mj:mcp-server'),
  /**
   * Enable the consent screen for users to select scopes.
   * When enabled, users will see a UI to approve/deny scope requests
   * after authenticating with the upstream provider.
   * @default false
   */
  enableConsentScreen: z.boolean().default(false),
});

/**
 * Zod schema for OAuth authentication settings.
 *
 * Token audience for validation is automatically derived from auth provider config
 * (e.g., WEB_CLIENT_ID for Azure AD), matching the same approach used by MJExplorer.
 * No additional configuration is required for basic OAuth to work.
 *
 * Validates the auth configuration section with defaults:
 * - mode: defaults to 'both' (accepts API keys or OAuth tokens)
 * - resourceIdentifier: MCP server URL for Protected Resource Metadata (auto-generated if not set)
 * - autoResourceIdentifier: defaults to true (auto-generate from server URL)
 */
const mcpServerAuthSettingsSchema = z.object({
  /** Authentication mode: 'apiKey' | 'oauth' | 'both' | 'none' */
  mode: z.enum(['apiKey', 'oauth', 'both', 'none']).default('both'),
  /** Resource identifier for MCP clients - the server URL (e.g., "http://localhost:3100") */
  resourceIdentifier: z.string().optional(),
  /**
   * @deprecated Token audience is now derived from auth provider config (same as MJExplorer).
   * This field is ignored - audience validation uses the provider's `audience` field
   * which is auto-populated from environment variables like WEB_CLIENT_ID.
   */
  tokenAudience: z.string().optional(),
  /**
   * OAuth scopes to include in Protected Resource Metadata.
   * Used for MCP client discovery - tells clients what scopes to request from the IdP.
   * For Azure AD: use ["api://{client-id}/.default"]
   * If not set, uses standard OIDC scopes ["openid", "profile", "email"]
   */
  scopes: z.array(z.string()).optional(),
  /** Auto-generate resourceIdentifier from server URL if not specified */
  autoResourceIdentifier: z.boolean().default(true),
  /**
   * OAuth Proxy settings - enables dynamic client registration for MCP clients.
   * When enabled, the MCP Server acts as an OAuth Authorization Server that
   * proxies authentication to the configured upstream provider (Azure AD, Auth0, etc.).
   */
  proxy: oauthProxySettingsSchema.optional(),
});

const mcpServerInfoSchema = z.object({
  port: z.coerce.number().optional().default(3100),
  entityTools: z.array(mcpServerEntityToolInfoSchema).optional(),
  actionTools: z.array(mcpServerActionToolInfoSchema).optional(),
  agentTools: z.array(mcpServerAgentToolInfoSchema).optional(),
  queryTools: mcpServerQueryToolInfoSchema.optional(),
  promptTools: z.array(mcpServerPromptToolInfoSchema).optional(),
  communicationTools: mcpServerCommunicationToolInfoSchema.optional(),
  enableMCPServer: z.boolean().optional().default(false),
  systemApiKey: z.string().optional(),
  /** OAuth authentication settings for the MCP Server */
  auth: mcpServerAuthSettingsSchema.optional(),
});

const configInfoSchema = z.object({
  databaseSettings: databaseSettingsInfoSchema,

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

  // MCP Server settings
  mcpServerSettings: mcpServerInfoSchema.optional(),

  mjCoreSchema: z.string(),

  // System API key from MJ_API_KEY environment variable
  // Note: This may come from DEFAULT_SERVER_CONFIG, but initConfig() also reads
  // directly from process.env to handle cases where dotenv runs after MJServer import
  apiKey: z.string().optional(),
});

export type DatabaseSettingsInfo = z.infer<typeof databaseSettingsInfoSchema>;
export type ConfigInfo = z.infer<typeof configInfoSchema>;
export type MCPServerEntityToolInfo = z.infer<typeof mcpServerEntityToolInfoSchema>;
export type MCPServerActionToolInfo = z.infer<typeof mcpServerActionToolInfoSchema>;
export type MCPServerAgentToolInfo = z.infer<typeof mcpServerAgentToolInfoSchema>;
export type MCPServerQueryToolInfo = z.infer<typeof mcpServerQueryToolInfoSchema>;
export type MCPServerPromptToolInfo = z.infer<typeof mcpServerPromptToolInfoSchema>;
export type MCPServerCommunicationToolInfo = z.infer<typeof mcpServerCommunicationToolInfoSchema>;
export type MCPServerAuthSettingsInfo = z.infer<typeof mcpServerAuthSettingsSchema>;
export type OAuthProxySettingsInfo = z.infer<typeof oauthProxySettingsSchema>;

// Config will be loaded asynchronously - exports are populated by initConfig()
export let configInfo: ConfigInfo;
export let dbUsername: string;
export let dbPassword: string;
export let dbHost: string;
export let dbDatabase: string;
export let dbPort: number;
export let dbTrustServerCertificate: string;
export let dbInstanceName: string | undefined;
export let mcpServerSettings: ConfigInfo['mcpServerSettings'];
export let mj_core_schema: string;
export let dbReadOnlyUsername: string | undefined;
export let dbReadOnlyPassword: string | undefined;
/** OAuth authentication settings, resolved with defaults */
export let mcpServerAuth: MCPServerAuthSettingsInfo;

let _initialized = false;

/**
 * Initializes the configuration by loading DEFAULT_SERVER_CONFIG dynamically.
 * This MUST be called before accessing any config values.
 *
 * The dynamic import ensures dotenv has already populated process.env
 * before @memberjunction/server reads environment variables.
 */
export async function initConfig(): Promise<ConfigInfo> {
  if (_initialized) {
    return configInfo;
  }

  // Dynamic import ensures dotenv has loaded before this module is evaluated
  const { DEFAULT_SERVER_CONFIG } = await import('@memberjunction/server');

  configInfo = loadConfig(DEFAULT_SERVER_CONFIG);

  // Ensure apiKey is read directly from process.env (dotenv has definitely run by now)
  // DEFAULT_SERVER_CONFIG.apiKey may have been evaluated before dotenv ran if @memberjunction/server
  // was imported elsewhere first
  const envApiKey = process.env.MJ_API_KEY;
  console.log(`[Config] apiKey sources: configInfo.apiKey=${configInfo.apiKey ? `"${configInfo.apiKey.substring(0, 10)}..." (${configInfo.apiKey.length} chars)` : 'undefined'}, process.env.MJ_API_KEY=${envApiKey ? `"${envApiKey.substring(0, 10)}..." (${envApiKey.length} chars)` : 'undefined'}`);

  if (!configInfo.apiKey && envApiKey) {
    console.log('[Config] Using MJ_API_KEY from process.env (DEFAULT_SERVER_CONFIG was stale)');
    configInfo.apiKey = envApiKey;
  }

  // Populate the exported variables
  dbUsername = configInfo.dbUsername;
  dbPassword = configInfo.dbPassword;
  dbHost = configInfo.dbHost;
  dbDatabase = configInfo.dbDatabase;
  dbPort = configInfo.dbPort;
  dbTrustServerCertificate = configInfo.dbTrustServerCertificate;
  dbInstanceName = configInfo.dbInstanceName;
  mcpServerSettings = configInfo.mcpServerSettings;
  mj_core_schema = configInfo.mjCoreSchema;
  dbReadOnlyUsername = configInfo.dbReadOnlyUsername;
  dbReadOnlyPassword = configInfo.dbReadOnlyPassword;

  // Resolve auth settings with defaults
  mcpServerAuth = resolveAuthSettings(configInfo.mcpServerSettings?.auth, configInfo.mcpServerSettings?.port);

  _initialized = true;
  return configInfo;
}

/** Minimum required length for JWT signing secret (32 bytes = 256 bits) */
const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validates the JWT signing secret for the OAuth proxy.
 *
 * @param secret - The JWT signing secret (may be base64 encoded)
 * @returns Object with validation result and decoded secret
 */
function validateJwtSigningSecret(secret: string | undefined): {
  valid: boolean;
  error?: string;
  decodedSecret?: string;
} {
  if (!secret) {
    return { valid: false, error: 'JWT signing secret is not configured' };
  }

  // Try to decode base64 first to get actual byte length
  let secretBytes: Buffer;
  try {
    // Check if it looks like base64 (only alphanumeric, +, /, =)
    if (/^[A-Za-z0-9+/=]+$/.test(secret) && secret.length % 4 === 0) {
      secretBytes = Buffer.from(secret, 'base64');
      // If base64 decode gives reasonable output, use it
      if (secretBytes.length >= MIN_JWT_SECRET_LENGTH) {
        return { valid: true, decodedSecret: secret };
      }
    }
    // Otherwise treat as raw string
    secretBytes = Buffer.from(secret, 'utf-8');
  } catch {
    secretBytes = Buffer.from(secret, 'utf-8');
  }

  if (secretBytes.length < MIN_JWT_SECRET_LENGTH) {
    return {
      valid: false,
      error: `JWT signing secret is too short (${secretBytes.length} bytes). Minimum required: ${MIN_JWT_SECRET_LENGTH} bytes (256 bits). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    };
  }

  return { valid: true, decodedSecret: secret };
}

/**
 * Resolves OAuth authentication settings with defaults.
 *
 * @param authConfig - The raw auth configuration from mj.config.cjs
 * @param port - The MCP server port for auto-generating resourceIdentifier
 * @returns Resolved auth settings with all defaults applied
 */
function resolveAuthSettings(
  authConfig: z.infer<typeof mcpServerAuthSettingsSchema> | undefined,
  port: number | undefined
): MCPServerAuthSettingsInfo {
  // Start with defaults
  const defaults: MCPServerAuthSettingsInfo = {
    mode: 'both',
    autoResourceIdentifier: true,
  };

  if (!authConfig) {
    return defaults;
  }

  // Merge with config values
  const resolved: MCPServerAuthSettingsInfo = {
    mode: authConfig.mode ?? defaults.mode,
    resourceIdentifier: authConfig.resourceIdentifier,
    tokenAudience: authConfig.tokenAudience,
    scopes: authConfig.scopes,
    autoResourceIdentifier: authConfig.autoResourceIdentifier ?? defaults.autoResourceIdentifier,
    proxy: authConfig.proxy,
  };

  // Auto-generate resourceIdentifier if needed
  if (!resolved.resourceIdentifier && resolved.autoResourceIdentifier) {
    const serverPort = port ?? 3100;
    resolved.resourceIdentifier = `http://localhost:${serverPort}`;
  }

  // Validate JWT signing secret if OAuth proxy is enabled with JWT signing
  if (resolved.proxy?.enabled && resolved.proxy?.jwtSigningSecret) {
    const secretValidation = validateJwtSigningSecret(resolved.proxy.jwtSigningSecret);
    if (!secretValidation.valid) {
      console.error(`[Config] OAuth Proxy Error: ${secretValidation.error}`);
      console.error(`[Config] OAuth Proxy will be DISABLED due to invalid JWT signing secret`);
      console.warn(`[Config] Falling back to API key authentication only`);

      // Disable the proxy but keep the rest of auth settings
      resolved.proxy = {
        ...resolved.proxy,
        enabled: false,
      };

      // If mode was 'oauth', fall back to 'apiKey'
      if (resolved.mode === 'oauth') {
        console.warn(`[Config] Auth mode changed from 'oauth' to 'apiKey' because OAuth proxy is disabled`);
        resolved.mode = 'apiKey';
      }
    } else {
      console.log(`[Config] JWT signing secret validated (${MIN_JWT_SECRET_LENGTH}+ bytes)`);
    }
  }

  return resolved;
}

/**
 * Loads and validates the MCP server configuration.
 *
 * Configuration loading order:
 * 1. Searches for mj.config.cjs in the current directory and parent directories
 * 2. Merges found configuration with DEFAULT_SERVER_CONFIG
 * 3. Validates the merged configuration using Zod schema
 *
 * @param defaultConfig - The default server configuration to use as base
 * @returns Validated configuration object
 * @throws Error if configuration validation fails
 */
function loadConfig(defaultConfig: Record<string, unknown>): ConfigInfo {
  const configSearchResult = explorer.search(process.cwd());

  // Start with DEFAULT_SERVER_CONFIG as base
  let mergedConfig = defaultConfig;

  // If user config exists, merge it with defaults
  if (configSearchResult && !configSearchResult.isEmpty) {
    LogStatus(`MCP Server: Config file found at ${configSearchResult.filepath}`);

    // Merge user config with defaults (user config takes precedence)
    mergedConfig = mergeConfigs(defaultConfig, configSearchResult.config);
  } else {
    LogStatus(`MCP Server: No config file found, using DEFAULT_SERVER_CONFIG`);
  }

  // Validate the merged configuration
  const configParsing = configInfoSchema.safeParse(mergedConfig);
  if (!configParsing.success) {
    LogError('Error parsing config file', null, JSON.stringify(configParsing.error.issues, null, 2));
    throw new Error('Configuration validation failed');
  }
  return configParsing.data;
}
