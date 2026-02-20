/**
 * User-provided configuration for an MJ install.
 *
 * Gathered interactively (via prompt events) or pre-supplied via
 * --config file / --yes flag.
 */
export interface InstallConfig {
  // Database
  DatabaseHost: string;
  DatabasePort: number;
  DatabaseName: string;
  DatabaseTrustCert: boolean;

  // CodeGen credentials
  CodeGenUser: string;
  CodeGenPassword: string;

  // MJAPI credentials
  APIUser: string;
  APIPassword: string;

  // Ports
  APIPort: number;
  ExplorerPort: number;

  // Auth provider
  AuthProvider: 'entra' | 'auth0' | 'none';
  /** Provider-specific config values (e.g. TenantID, ClientID) */
  AuthProviderValues?: Record<string, string>;

  // AI API keys (optional)
  OpenAIKey?: string;
  AnthropicKey?: string;
  MistralKey?: string;

  // New user creation (optional)
  CreateNewUser?: {
    Username: string;
    Email: string;
    FirstName: string;
    LastName: string;
  };
}

/**
 * Partial config that can be loaded from a config file.
 * Fields not present will be prompted for interactively.
 */
export type PartialInstallConfig = Partial<InstallConfig>;

/**
 * Default values for InstallConfig fields.
 */
export const InstallConfigDefaults: PartialInstallConfig = {
  DatabaseHost: 'localhost',
  DatabasePort: 1433,
  DatabaseTrustCert: false,
  APIPort: 4000,
  ExplorerPort: 4200,
  AuthProvider: 'none',
};
