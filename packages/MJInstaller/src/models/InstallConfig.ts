/**
 * User-provided configuration for a MemberJunction install.
 *
 * Configuration values are gathered via a layered resolution chain:
 * 1. **Defaults** — {@link InstallConfigDefaults} provides base values.
 * 2. **Environment variables** — {@link resolveFromEnvironment} reads `MJ_INSTALL_*` env vars.
 * 3. **Config file** — {@link loadConfigFile} reads a JSON file (`--config <path>`).
 * 4. **Programmatic** — `RunOptions.Config` or `CreatePlanInput.Config`.
 * 5. **Interactive prompts** — the {@link ConfigurePhase} emits `prompt` events;
 *    in `--yes` mode, remaining gaps are filled with defaults.
 *
 * The fully resolved config is written to `.env`, `mj.config.cjs`, and
 * Explorer `environment.ts` files by the configure phase.
 *
 * @module models/InstallConfig
 * @see ConfigurePhase — resolves and writes configuration files.
 * @see InstallConfigDefaults — default values for optional fields.
 * @see resolveFromEnvironment — reads config from `MJ_INSTALL_*` env vars.
 * @see loadConfigFile — reads config from a JSON file.
 * @see mergeConfigs — merges multiple partial configs (later wins).
 */
import fs from 'node:fs/promises';
export interface InstallConfig {
  // ── Database ──────────────────────────────────────────────────────────

  /** SQL Server hostname or IP address (default: `"localhost"`). */
  DatabaseHost: string;

  /** SQL Server TCP port (default: `1433`). */
  DatabasePort: number;

  /** Target database name (common value: `"MemberJunction"`; no auto-applied default). */
  DatabaseName: string;

  /** Whether to trust self-signed TLS certificates (common for local dev instances). */
  DatabaseTrustCert: boolean;

  // ── CodeGen credentials ───────────────────────────────────────────────

  /**
   * SQL login used by `mj codegen` to read/write schema metadata.
   * Typically granted `db_owner` role (common value: `"MJ_CodeGen"`; no auto-applied default).
   */
  CodeGenUser: string;

  /** Password for the CodeGen SQL login. */
  CodeGenPassword: string;

  // ── MJAPI credentials ────────────────────────────────────────────────

  /**
   * SQL login used by MJAPI at runtime for read/write data access.
   * Typically granted `db_datareader`, `db_datawriter`, and `EXECUTE`
   * (common value: `"MJ_Connect"`; no auto-applied default).
   */
  APIUser: string;

  /** Password for the MJAPI SQL login. */
  APIPassword: string;

  // ── Ports ─────────────────────────────────────────────────────────────

  /** TCP port for the MJAPI GraphQL server (default: `4000`). */
  APIPort: number;

  /** TCP port for the MJExplorer Angular dev server (default: `4200` for distribution, `4201` for monorepo). */
  ExplorerPort: number;

  // ── Install mode ──────────────────────────────────────────────────────

  /**
   * Installation mode selection.
   * - `'distribution'` (default) — Downloads the lightweight bootstrap ZIP containing
   *   only MJAPI, MJExplorer, GeneratedEntities, and GeneratedActions as workspace
   *   packages. All `@memberjunction/*` packages come from npm.
   * - `'monorepo'` — Downloads the full MemberJunction source repository. Use this
   *   if you need to work on MJ framework code itself.
   */
  InstallMode: 'distribution' | 'monorepo';

  // ── Auth provider ─────────────────────────────────────────────────────

  /**
   * Authentication provider selection.
   * - `'entra'` — Microsoft Entra (MSAL) authentication.
   * - `'auth0'` — Auth0 authentication.
   * - `'none'` — skip authentication setup (default for fresh installs).
   */
  AuthProvider: 'entra' | 'auth0' | 'none';

  /**
   * Provider-specific configuration values (e.g., TenantID, ClientID, Domain).
   * Keys vary by {@link AuthProvider}:
   * - Entra: `TenantID`, `ClientID`
   * - Auth0: `Domain`, `ClientID`, `ClientSecret`
   */
  AuthProviderValues?: Record<string, string>;

  // ── AI API keys (optional) ────────────────────────────────────────────

  /** OpenAI API key for AI features. Leave blank to skip. */
  OpenAIKey?: string;

  /** Anthropic API key for AI features. Leave blank to skip. */
  AnthropicKey?: string;

  /** Mistral API key for AI features. Leave blank to skip. */
  MistralKey?: string;

  /**
   * Base64-encoded 32-byte encryption key used for MJ field-level encryption.
   * If omitted, the installer will generate one automatically.
   */
  BaseEncryptionKey?: string;

  // ── New user creation (optional) ──────────────────────────────────────

  /**
   * Optional new user to create in the MJ database during install.
   * Populated interactively when the user opts in, or via `--config`.
   */
  CreateNewUser?: {
    /** Login username (defaults to email if left blank). */
    Username: string;
    /** Email address for the new user. */
    Email: string;
    /** First name. */
    FirstName: string;
    /** Last name. */
    LastName: string;
  };
}

/**
 * Partial configuration that can be loaded from a `--config` JSON file
 * or passed programmatically. Fields not present will be prompted for
 * interactively during the {@link ConfigurePhase}, or filled with
 * {@link InstallConfigDefaults} in `--yes` mode.
 */
export type PartialInstallConfig = Partial<InstallConfig>;

/**
 * Sensible defaults for {@link InstallConfig} fields.
 *
 * Applied as the base layer when creating a plan via
 * {@link InstallerEngine.CreatePlan}. User-supplied and prompted values
 * override these defaults.
 */
export const InstallConfigDefaults: PartialInstallConfig = {
  DatabaseHost: 'localhost',
  DatabasePort: 1433,
  DatabaseTrustCert: false,
  APIPort: 4000,
  ExplorerPort: 4200,
  AuthProvider: 'none',
  InstallMode: 'distribution',
};

// ── Environment variable mapping ──────────────────────────────────────────

/**
 * Maps `MJ_INSTALL_*` environment variables to {@link InstallConfig} fields.
 *
 * Used internally by {@link resolveFromEnvironment}.
 */
const ENV_VAR_MAP: ReadonlyArray<{
  EnvVar: string;
  Field: keyof InstallConfig;
  Parse: (value: string) => unknown;
}> = [
  { EnvVar: 'MJ_INSTALL_DB_HOST',           Field: 'DatabaseHost',     Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_DB_PORT',           Field: 'DatabasePort',     Parse: (v) => parseInt(v, 10) },
  { EnvVar: 'MJ_INSTALL_DB_NAME',           Field: 'DatabaseName',     Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_DB_TRUST_CERT',     Field: 'DatabaseTrustCert', Parse: parseBooleanEnv },
  { EnvVar: 'MJ_INSTALL_CODEGEN_USER',      Field: 'CodeGenUser',      Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_CODEGEN_PASSWORD',  Field: 'CodeGenPassword',  Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_API_USER',          Field: 'APIUser',          Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_API_PASSWORD',      Field: 'APIPassword',      Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_API_PORT',          Field: 'APIPort',          Parse: (v) => parseInt(v, 10) },
  { EnvVar: 'MJ_INSTALL_EXPLORER_PORT',     Field: 'ExplorerPort',     Parse: (v) => parseInt(v, 10) },
  { EnvVar: 'MJ_INSTALL_AUTH_PROVIDER',     Field: 'AuthProvider',     Parse: (v) => v as InstallConfig['AuthProvider'] },
  { EnvVar: 'MJ_INSTALL_OPENAI_KEY',        Field: 'OpenAIKey',        Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_ANTHROPIC_KEY',     Field: 'AnthropicKey',     Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_MISTRAL_KEY',       Field: 'MistralKey',       Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_BASE_ENCRYPTION_KEY', Field: 'BaseEncryptionKey', Parse: (v) => v },
  { EnvVar: 'MJ_INSTALL_MODE',              Field: 'InstallMode',       Parse: (v) => v as InstallConfig['InstallMode'] },
];

/**
 * Auth-provider-specific environment variable mappings.
 *
 * These are resolved separately because they populate the nested
 * {@link InstallConfig.AuthProviderValues} record.
 */
const AUTH_ENV_VAR_MAP: ReadonlyArray<{
  EnvVar: string;
  Key: string;
}> = [
  { EnvVar: 'MJ_INSTALL_ENTRA_TENANT_ID',      Key: 'TenantID' },
  { EnvVar: 'MJ_INSTALL_ENTRA_CLIENT_ID',      Key: 'ClientID' },
  { EnvVar: 'MJ_INSTALL_AUTH0_DOMAIN',          Key: 'Domain' },
  { EnvVar: 'MJ_INSTALL_AUTH0_CLIENT_ID',       Key: 'ClientID' },
  { EnvVar: 'MJ_INSTALL_AUTH0_CLIENT_SECRET',   Key: 'ClientSecret' },
];

/**
 * Parse a string environment variable as a boolean.
 *
 * Accepts `'true'`, `'1'`, `'yes'` (case-insensitive) as truthy;
 * everything else is falsy.
 */
function parseBooleanEnv(value: string): boolean {
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

// ── Public functions ──────────────────────────────────────────────────────

/**
 * Read `MJ_INSTALL_*` environment variables and return a partial config.
 *
 * Only fields with a corresponding env var set are included. Fields without
 * an env var are omitted (not set to `undefined`), so they won't override
 * values from earlier layers in the config chain.
 *
 * @returns A partial config containing only the fields that have env vars set.
 *
 * @example
 * ```bash
 * export MJ_INSTALL_DB_HOST=prod-sql.example.com
 * export MJ_INSTALL_DB_NAME=MemberJunction
 * export MJ_INSTALL_CODEGEN_PASSWORD=secret123
 * ```
 * ```typescript
 * const envConfig = resolveFromEnvironment();
 * // { DatabaseHost: 'prod-sql.example.com', DatabaseName: 'MemberJunction', CodeGenPassword: 'secret123' }
 * ```
 */
export function resolveFromEnvironment(): PartialInstallConfig {
  const config: PartialInstallConfig = {};

  for (const mapping of ENV_VAR_MAP) {
    const value = process.env[mapping.EnvVar];
    if (value !== undefined && value !== '') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (config as Record<string, unknown>)[mapping.Field] = mapping.Parse(value);
    }
  }

  // Resolve auth provider values from dedicated env vars
  const authValues: Record<string, string> = {};
  let hasAuthValues = false;
  for (const mapping of AUTH_ENV_VAR_MAP) {
    const value = process.env[mapping.EnvVar];
    if (value !== undefined && value !== '') {
      authValues[mapping.Key] = value;
      hasAuthValues = true;
    }
  }
  if (hasAuthValues) {
    config.AuthProviderValues = authValues;
  }

  return config;
}

/** Canonical PascalCase keys accepted in `install.config.json`. */
const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  'DatabaseHost', 'DatabasePort', 'DatabaseName', 'DatabaseTrustCert',
  'CodeGenUser', 'CodeGenPassword', 'APIUser', 'APIPassword',
  'APIPort', 'ExplorerPort', 'AuthProvider', 'AuthProviderValues',
  'OpenAIKey', 'AnthropicKey', 'MistralKey', 'BaseEncryptionKey', 'InstallMode', 'CreateNewUser',
]);

/**
 * Aliases for legacy camelCase keys that shipped in pre-5.34 `install.config.json`
 * templates. The newer installer expects {@link KNOWN_KEYS} (PascalCase), but
 * we accept these too so existing user-authored config files don't silently
 * fall through to defaults.
 *
 * Maps `legacyKey` → canonical `PascalCaseKey`.
 */
const LEGACY_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  dbUrl: 'DatabaseHost',
  dbPort: 'DatabasePort',
  dbDatabase: 'DatabaseName',
  dbTrustServerCertificate: 'DatabaseTrustCert',
  codeGenLogin: 'CodeGenUser',
  codeGenPwD: 'CodeGenPassword',
  mjAPILogin: 'APIUser',
  mjAPIPwD: 'APIPassword',
  graphQLPort: 'APIPort',
  openAIAPIKey: 'OpenAIKey',
  anthropicAPIKey: 'AnthropicKey',
  mistralAPIKey: 'MistralKey',
});

/**
 * Legacy auth-provider-related keys that translate into a nested
 * {@link InstallConfig.AuthProviderValues} object on the canonical side.
 */
const LEGACY_AUTH_KEYS: ReadonlySet<string> = new Set([
  'authType', 'msalWebClientId', 'msalTenantId',
  'auth0ClientId', 'auth0ClientSecret', 'auth0Domain',
]);

/**
 * Legacy new-user-creation keys that translate into a nested
 * {@link InstallConfig.CreateNewUser} object on the canonical side.
 */
const LEGACY_USER_KEYS: ReadonlySet<string> = new Set([
  'createNewUser', 'userName', 'userEmail', 'userFirstName', 'userLastName',
]);

/**
 * Load a JSON config file and return it as a partial install config.
 *
 * Accepts both the canonical PascalCase keys ({@link InstallConfig}) and a
 * curated set of legacy camelCase aliases for backward compatibility with
 * `install.config.json` files written against pre-5.34 docs.
 *
 * Throws when the file is present but **no** recognized keys are found —
 * this catches the "I copied the old template and edited values but the
 * installer silently ignored everything" failure mode that was previously
 * a silent default-fallthrough.
 *
 * @param filePath - Absolute or relative path to the JSON config file.
 * @returns A partial config containing the fields recognized from the file.
 * @throws If the file cannot be read, contains invalid JSON, isn't an object,
 *         or contains keys but none are recognized.
 *
 * @example
 * ```typescript
 * const fileConfig = await loadConfigFile('./install.config.json');
 * ```
 */
export async function loadConfigFile(filePath: string): Promise<PartialInstallConfig> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file must contain a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }

  const input = parsed as Record<string, unknown>;
  const config: PartialInstallConfig = {};
  const authValues: Record<string, string> = {};
  const newUser: Partial<NonNullable<InstallConfig['CreateNewUser']>> = {};
  let createNewUserOptIn = false;
  let recognized = 0;

  for (const key of Object.keys(input)) {
    const value = input[key];

    // 1. Canonical PascalCase key
    if (KNOWN_KEYS.has(key)) {
      (config as Record<string, unknown>)[key] = value;
      recognized++;
      continue;
    }

    // 2. Direct legacy alias (1:1 rename, no value transformation)
    if (Object.prototype.hasOwnProperty.call(LEGACY_KEY_ALIASES, key)) {
      const canonicalKey = LEGACY_KEY_ALIASES[key];
      (config as Record<string, unknown>)[canonicalKey] = canonicalizeLegacyValue(canonicalKey, value);
      recognized++;
      continue;
    }

    // 3. Legacy auth keys → AuthProviderValues / AuthProvider
    if (LEGACY_AUTH_KEYS.has(key)) {
      applyLegacyAuthKey(key, value, config, authValues);
      recognized++;
      continue;
    }

    // 4. Legacy CreateNewUser keys → nested object
    if (LEGACY_USER_KEYS.has(key)) {
      if (key === 'createNewUser') {
        createNewUserOptIn = stringIsYes(value);
      } else if (typeof value === 'string') {
        applyLegacyUserKey(key, value, newUser);
      }
      recognized++;
      continue;
    }
  }

  if (Object.keys(authValues).length > 0) {
    config.AuthProviderValues = { ...(config.AuthProviderValues ?? {}), ...authValues };
  }
  if (createNewUserOptIn && (newUser.Email || newUser.Username)) {
    config.CreateNewUser = {
      Username: newUser.Username ?? newUser.Email ?? '',
      Email: newUser.Email ?? '',
      FirstName: newUser.FirstName ?? '',
      LastName: newUser.LastName ?? '',
    };
  }

  if (Object.keys(input).length > 0 && recognized === 0) {
    throw new Error(
      `Config file at ${filePath} contains ${Object.keys(input).length} key(s) but none are recognized. ` +
      `Expected PascalCase keys like DatabaseHost, APIPort, AuthProvider. ` +
      `See docs at packages/MJInstaller/install-in-minutes-new.md ("Config File Format") for the supported schema, ` +
      `or check the install.config.json template at the repository root.`
    );
  }

  return config;
}

/**
 * Some legacy keys carry string-encoded values ("Y"/"N") where the canonical
 * field is a boolean. Translate them in-place when we map.
 */
function canonicalizeLegacyValue(canonicalKey: string, value: unknown): unknown {
  if (canonicalKey === 'DatabaseTrustCert' && typeof value === 'string') {
    return stringIsYes(value);
  }
  return value;
}

/** Apply a single legacy auth-related key to the building config. */
function applyLegacyAuthKey(
  key: string,
  value: unknown,
  config: PartialInstallConfig,
  authValues: Record<string, string>
): void {
  if (key === 'authType' && typeof value === 'string') {
    const upper = value.toUpperCase();
    if (upper === 'MSAL' || upper === 'ENTRA') {
      config.AuthProvider = 'entra';
    } else if (upper === 'AUTH0') {
      config.AuthProvider = 'auth0';
    } else if (upper === 'NONE' || value === '') {
      config.AuthProvider = 'none';
    }
    return;
  }
  if (typeof value !== 'string') return;
  switch (key) {
    case 'msalWebClientId': authValues.ClientID = value; break;
    case 'msalTenantId':    authValues.TenantID = value; break;
    case 'auth0ClientId':   authValues.ClientID = value; break;
    case 'auth0ClientSecret': authValues.ClientSecret = value; break;
    case 'auth0Domain':     authValues.Domain = value; break;
  }
}

/** Apply a single legacy CreateNewUser-related key to the building object. */
function applyLegacyUserKey(
  key: string,
  value: string,
  newUser: Partial<NonNullable<InstallConfig['CreateNewUser']>>
): void {
  switch (key) {
    case 'userName':      newUser.Username  = value; break;
    case 'userEmail':     newUser.Email     = value; break;
    case 'userFirstName': newUser.FirstName = value; break;
    case 'userLastName':  newUser.LastName  = value; break;
  }
}

/** "Y"/"y"/"yes"/"true"/"1" → true; anything else → false. */
function stringIsYes(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const lower = value.trim().toLowerCase();
  return lower === 'y' || lower === 'yes' || lower === 'true' || lower === '1';
}

/**
 * Merge multiple partial configs into one. Later sources override earlier ones.
 *
 * Only fields that are explicitly present (not `undefined`) in a source
 * override the corresponding field from earlier sources. The
 * `AuthProviderValues` record is shallow-merged (keys from later sources
 * override keys from earlier sources, but unmentioned keys are preserved).
 *
 * @param sources - Partial configs in priority order (lowest first).
 * @returns A single merged partial config.
 *
 * @example
 * ```typescript
 * const merged = mergeConfigs(
 *   InstallConfigDefaults,          // lowest priority
 *   resolveFromEnvironment(),       // env vars override defaults
 *   await loadConfigFile('c.json'), // file overrides env vars
 *   runOptions.Config ?? {},        // CLI overrides file
 * );
 * ```
 */
export function mergeConfigs(...sources: PartialInstallConfig[]): PartialInstallConfig {
  const result: PartialInstallConfig = {};

  for (const source of sources) {
    for (const key of Object.keys(source) as (keyof InstallConfig)[]) {
      const value = source[key];
      if (value === undefined) continue;

      if (key === 'AuthProviderValues' && typeof value === 'object' && value !== null) {
        // Shallow-merge AuthProviderValues
        result.AuthProviderValues = {
          ...result.AuthProviderValues,
          ...(value as Record<string, string>),
        };
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }

  return result;
}
