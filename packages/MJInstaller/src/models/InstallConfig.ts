/**
 * User-provided configuration for a MemberJunction install.
 *
 * Configuration values are gathered in one of three ways:
 * 1. **Interactively** — the {@link ConfigurePhase} emits `prompt` events and
 *    the frontend collects user input.
 * 2. **Pre-supplied** — via a `--config <file>` JSON file or inline CLI flags.
 * 3. **Auto-defaulted** — in `--yes` (non-interactive) mode, missing fields
 *    fall back to {@link InstallConfigDefaults}.
 *
 * The fully resolved config is written to `.env`, `mj.config.cjs`, and
 * Explorer `environment.ts` files by the configure phase.
 *
 * @module models/InstallConfig
 * @see ConfigurePhase — resolves and writes configuration files.
 * @see InstallConfigDefaults — default values for optional fields.
 */
export interface InstallConfig {
  // ── Database ──────────────────────────────────────────────────────────

  /** SQL Server hostname or IP address (default: `"localhost"`). */
  DatabaseHost: string;

  /** SQL Server TCP port (default: `1433`). */
  DatabasePort: number;

  /** Target database name (default: `"MemberJunction"`). */
  DatabaseName: string;

  /** Whether to trust self-signed TLS certificates (common for local dev instances). */
  DatabaseTrustCert: boolean;

  // ── CodeGen credentials ───────────────────────────────────────────────

  /**
   * SQL login used by `mj codegen` to read/write schema metadata.
   * Typically granted `db_owner` role (default: `"MJ_CodeGen"`).
   */
  CodeGenUser: string;

  /** Password for the CodeGen SQL login. */
  CodeGenPassword: string;

  // ── MJAPI credentials ────────────────────────────────────────────────

  /**
   * SQL login used by MJAPI at runtime for read/write data access.
   * Typically granted `db_datareader`, `db_datawriter`, and `EXECUTE`
   * (default: `"MJ_Connect"`).
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
