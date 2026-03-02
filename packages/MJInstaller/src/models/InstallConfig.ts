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

  /** TCP port for the MJExplorer Angular dev server (default: `4200`). */
  ExplorerPort: number;

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

/**
 * Load a JSON config file and return it as a partial install config.
 *
 * The file should be a JSON object whose keys match {@link InstallConfig}
 * field names. Unknown keys are silently ignored. Invalid JSON causes
 * the returned promise to reject.
 *
 * @param filePath - Absolute or relative path to the JSON config file.
 * @returns A partial config containing the fields defined in the file.
 * @throws If the file cannot be read or contains invalid JSON.
 *
 * @example
 * ```typescript
 * const fileConfig = await loadConfigFile('./mj-install.json');
 * ```
 */
export async function loadConfigFile(filePath: string): Promise<PartialInstallConfig> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file must contain a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }

  // Pick only known InstallConfig keys — ignore unknown fields
  const known = parsed as Record<string, unknown>;
  const config: PartialInstallConfig = {};
  const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
    'DatabaseHost', 'DatabasePort', 'DatabaseName', 'DatabaseTrustCert',
    'CodeGenUser', 'CodeGenPassword', 'APIUser', 'APIPassword',
    'APIPort', 'ExplorerPort', 'AuthProvider', 'AuthProviderValues',
    'OpenAIKey', 'AnthropicKey', 'MistralKey', 'CreateNewUser',
  ]);

  for (const key of Object.keys(known)) {
    if (KNOWN_KEYS.has(key)) {
      (config as Record<string, unknown>)[key] = known[key];
    }
  }

  return config;
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
