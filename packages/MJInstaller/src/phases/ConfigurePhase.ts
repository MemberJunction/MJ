/**
 * Phase E — Configuration
 *
 * Gathers user configuration via prompt events (or reads from `--config` /
 * `--yes` defaults), then generates the three configuration file families:
 *
 * 1. **`.env`** — Database credentials, API keys, port settings, auth config.
 *    Written to both the repo root and `packages/MJAPI/.env`.
 * 2. **`mj.config.cjs`** — CodeGen configuration (host, port, database, schema,
 *    optional new user setup).
 * 3. **Explorer environment files** — `environment.ts` and `environment.development.ts`
 *    in `packages/MJExplorer/src/environments/`.
 *
 * **Preserve-vs-create strategy**: If a configuration file already exists, it
 * is preserved (not overwritten). This allows users to re-run the installer
 * without losing hand-edited configuration. Only missing files are created.
 *
 * @module phases/ConfigurePhase
 * @see InstallConfig — the full configuration interface.
 * @see InstallConfigDefaults — default values for auto-mode.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { InstallConfig, PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

/**
 * Input context for the configure phase.
 *
 * @see ConfigurePhase.Run
 */
export interface ConfigureContext {
  /** Absolute path to the target install directory. */
  Dir: string;
  /** Partial config — missing fields will be prompted for interactively. */
  Config: PartialInstallConfig;
  /** Non-interactive mode — use defaults for missing fields. */
  Yes: boolean;
  /** Event emitter for progress, prompt, and log events. */
  Emitter: InstallerEventEmitter;
}

/**
 * Result of the configure phase.
 *
 * @see ConfigurePhase.Run
 */
export interface ConfigureResult {
  /** Fully resolved configuration (all fields populated). */
  Config: InstallConfig;
  /** Absolute paths of files that were created (not preserved). */
  FilesWritten: string[];
}

/**
 * Phase E — Gathers configuration and generates `.env`, `mj.config.cjs`,
 * and Explorer environment files.
 *
 * @example
 * ```typescript
 * const configure = new ConfigurePhase();
 * const result = await configure.Run({
 *   Dir: '/path/to/install',
 *   Config: { DatabaseHost: 'localhost' },
 *   Yes: false,
 *   Emitter: emitter,
 * });
 * console.log(`Created: ${result.FilesWritten.join(', ')}`);
 * ```
 */
export class ConfigurePhase {
  private fileSystem = new FileSystemAdapter();

  /**
   * Execute the configure phase: resolve config, generate files.
   *
   * @param context - Configure input with directory, partial config, mode, and emitter.
   * @returns The fully resolved config and list of files written.
   */
  async Run(context: ConfigureContext): Promise<ConfigureResult> {
    const { Emitter: emitter } = context;
    const filesWritten: string[] = [];
    const filesPreserved: string[] = [];

    // Step 1: Gather config values (prompts or defaults)
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'configure',
      Message: 'Gathering configuration...',
    });

    const config = await this.resolveConfig(context.Config, context.Yes, emitter);

    // Step 2: .env files — preserve existing, create if missing
    const envPath = path.join(context.Dir, '.env');
    const mjapiEnvPath = path.join(context.Dir, 'packages', 'MJAPI', '.env');

    if (await this.fileSystem.FileExists(envPath)) {
      filesPreserved.push(envPath);
      // If MJAPI .env doesn't exist but root does, copy root → MJAPI
      const mjapiDir = path.dirname(mjapiEnvPath);
      if (await this.fileSystem.DirectoryExists(mjapiDir) && !(await this.fileSystem.FileExists(mjapiEnvPath))) {
        const rootEnvContent = await this.fileSystem.ReadText(envPath);
        await this.fileSystem.WriteText(mjapiEnvPath, rootEnvContent);
        filesWritten.push(mjapiEnvPath);
      } else if (await this.fileSystem.FileExists(mjapiEnvPath)) {
        filesPreserved.push(mjapiEnvPath);
      }
    } else {
      await this.writeEnvFile(envPath, config);
      filesWritten.push(envPath);
      const mjapiDir = path.dirname(mjapiEnvPath);
      if (await this.fileSystem.DirectoryExists(mjapiDir)) {
        await this.writeEnvFile(mjapiEnvPath, config);
        filesWritten.push(mjapiEnvPath);
      }
    }

    // Step 3: mj.config.cjs — preserve existing, create if missing
    const configCjsPath = path.join(context.Dir, 'mj.config.cjs');
    if (await this.fileSystem.FileExists(configCjsPath)) {
      filesPreserved.push(configCjsPath);
      // If user is creating a new user, patch that section into the existing config
      if (config.CreateNewUser) {
        const existingContent = await this.fileSystem.ReadText(configCjsPath);
        const updatedContent = this.patchNewUserSetup(existingContent, config.CreateNewUser);
        await this.fileSystem.WriteText(configCjsPath, updatedContent);
      }
    } else {
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'configure',
        Message: 'Writing mj.config.cjs...',
      });
      await this.writeMjConfigCjs(configCjsPath, config);
      filesWritten.push(configCjsPath);
    }

    // Step 4: Explorer environment files — preserve existing, create if missing
    const envFilesResult = await this.updateExplorerEnvironments(context.Dir, config, emitter);
    filesWritten.push(...envFilesResult.Written);
    filesPreserved.push(...envFilesResult.Preserved);

    // Summary
    const parts: string[] = [];
    if (filesWritten.length > 0) {
      parts.push(`${filesWritten.length} file(s) created`);
    }
    if (filesPreserved.length > 0) {
      parts.push(`${filesPreserved.length} existing file(s) preserved`);
    }
    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Configuration complete. ${parts.join(', ')}.`,
    });

    if (filesWritten.length > 0 && context.Yes) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'configure',
        Message: 'Config files were created with default/empty values. '
          + 'Edit .env and packages/MJExplorer/src/environments/ with your '
          + 'database credentials and auth provider settings before starting services.',
      });
    }

    return { Config: config, FilesWritten: filesWritten };
  }

  // ---------------------------------------------------------------------------
  // Config resolution — prompts for any missing values
  // ---------------------------------------------------------------------------

  private async resolveConfig(
    partial: PartialInstallConfig,
    yes: boolean,
    emitter: InstallerEventEmitter
  ): Promise<InstallConfig> {
    const config = { ...partial };

    // Database settings
    config.DatabaseHost = config.DatabaseHost ?? await this.promptInput(
      emitter, 'db-host', 'Database server hostname:', 'localhost', yes
    );
    config.DatabasePort = config.DatabasePort ?? parseInt(await this.promptInput(
      emitter, 'db-port', 'Database server port:', '1433', yes
    ), 10);
    config.DatabaseName = config.DatabaseName ?? await this.promptInput(
      emitter, 'db-name', 'Database name:', 'MemberJunction', yes
    );
    config.DatabaseTrustCert = config.DatabaseTrustCert ?? (await this.promptConfirm(
      emitter, 'db-trust-cert', 'Trust self-signed server certificate? (common for local instances)', false, yes
    ));

    // CodeGen credentials
    config.CodeGenUser = config.CodeGenUser ?? await this.promptInput(
      emitter, 'codegen-user', 'CodeGen database login:', 'MJ_CodeGen', yes
    );
    config.CodeGenPassword = config.CodeGenPassword ?? await this.promptInput(
      emitter, 'codegen-password', 'CodeGen database password:', '', yes
    );

    // MJAPI credentials
    config.APIUser = config.APIUser ?? await this.promptInput(
      emitter, 'api-user', 'MJAPI database login:', 'MJ_Connect', yes
    );
    config.APIPassword = config.APIPassword ?? await this.promptInput(
      emitter, 'api-password', 'MJAPI database password:', '', yes
    );

    // Ports
    config.APIPort = config.APIPort ?? parseInt(await this.promptInput(
      emitter, 'api-port', 'GraphQL API port:', '4000', yes
    ), 10);
    config.ExplorerPort = config.ExplorerPort ?? parseInt(await this.promptInput(
      emitter, 'explorer-port', 'Explorer UI port:', '4200', yes
    ), 10);

    // Auth provider
    if (!config.AuthProvider) {
      if (yes) {
        config.AuthProvider = 'none';
      } else {
        const authChoice = await this.promptSelect(emitter, 'auth-provider',
          'Authentication provider:', [
            { Label: 'None (skip auth for now)', Value: 'none' },
            { Label: 'Microsoft Entra (MSAL)', Value: 'entra' },
            { Label: 'Auth0', Value: 'auth0' },
          ], 'none'
        );
        config.AuthProvider = authChoice as InstallConfig['AuthProvider'];
      }
    }

    // Auth provider-specific values
    if (config.AuthProvider === 'entra' || config.AuthProvider === 'auth0') {
      config.AuthProviderValues = config.AuthProviderValues ?? {};
      if (config.AuthProvider === 'entra') {
        config.AuthProviderValues.TenantID = config.AuthProviderValues.TenantID ?? await this.promptInput(
          emitter, 'entra-tenant-id', 'Entra Tenant ID:', '', yes
        );
        config.AuthProviderValues.ClientID = config.AuthProviderValues.ClientID ?? await this.promptInput(
          emitter, 'entra-client-id', 'Entra Web Client ID:', '', yes
        );
      } else if (config.AuthProvider === 'auth0') {
        config.AuthProviderValues.Domain = config.AuthProviderValues.Domain ?? await this.promptInput(
          emitter, 'auth0-domain', 'Auth0 Domain:', '', yes
        );
        config.AuthProviderValues.ClientID = config.AuthProviderValues.ClientID ?? await this.promptInput(
          emitter, 'auth0-client-id', 'Auth0 Client ID:', '', yes
        );
        config.AuthProviderValues.ClientSecret = config.AuthProviderValues.ClientSecret ?? await this.promptInput(
          emitter, 'auth0-client-secret', 'Auth0 Client Secret:', '', yes
        );
      }
    }

    // AI keys (optional, skip in --yes mode)
    if (!yes) {
      config.OpenAIKey = config.OpenAIKey ?? await this.promptInput(
        emitter, 'openai-key', 'OpenAI API Key (leave blank to skip):', '', false
      );
      config.AnthropicKey = config.AnthropicKey ?? await this.promptInput(
        emitter, 'anthropic-key', 'Anthropic API Key (leave blank to skip):', '', false
      );
      config.MistralKey = config.MistralKey ?? await this.promptInput(
        emitter, 'mistral-key', 'Mistral API Key (leave blank to skip):', '', false
      );

      // New user setup (optional)
      const createUser = await this.promptConfirm(
        emitter, 'create-user', 'Create a new user in the database?', false, false
      );
      if (createUser) {
        const email = await this.promptInput(emitter, 'user-email', 'New user email:', '', false);
        const firstName = await this.promptInput(emitter, 'user-first-name', 'First name:', '', false);
        const lastName = await this.promptInput(emitter, 'user-last-name', 'Last name:', '', false);
        const username = await this.promptInput(emitter, 'user-name', 'Username (leave blank to use email):', email, false);
        config.CreateNewUser = { Email: email, FirstName: firstName, LastName: lastName, Username: username };
      }
    }

    return config as InstallConfig;
  }

  // ---------------------------------------------------------------------------
  // File generation
  // ---------------------------------------------------------------------------

  private async writeEnvFile(envPath: string, config: InstallConfig): Promise<void> {
    const trustCert = config.DatabaseTrustCert ? 'DB_TRUST_SERVER_CERTIFICATE=1' : '';
    const authType = this.mapAuthType(config.AuthProvider);

    const content = `#Database Setup
DB_HOST='${config.DatabaseHost}'
DB_PORT=${config.DatabasePort}
CODEGEN_DB_USERNAME='${config.CodeGenUser}'
CODEGEN_DB_PASSWORD='${config.CodeGenPassword}'
DB_USERNAME='${config.APIUser}'
DB_PASSWORD='${config.APIPassword}'
DB_DATABASE='${config.DatabaseName}'
${trustCert}

#OUTPUT CODE is used for output directories like SQL Scripts
OUTPUT_CODE='${config.DatabaseName}'

# Name of the schema that MJ has been setup in. This defaults to __mj
MJ_CORE_SCHEMA='__mj'

# AI API Keys
AI_VENDOR_API_KEY__OpenAILLM='${config.OpenAIKey ?? ''}'
AI_VENDOR_API_KEY__MistralLLM='${config.MistralKey ?? ''}'
AI_VENDOR_API_KEY__AnthropicLLM='${config.AnthropicKey ?? ''}'

GRAPHQL_PORT=${config.APIPort}

UPDATE_USER_CACHE_WHEN_NOT_FOUND=1
UPDATE_USER_CACHE_WHEN_NOT_FOUND_DELAY=5000

# AUTHENTICATION SECTION
WEB_CLIENT_ID=${config.AuthProviderValues?.ClientID ?? ''}
TENANT_ID=${config.AuthProviderValues?.TenantID ?? ''}

# Auth0 Section
AUTH0_CLIENT_ID=${config.AuthProviderValues?.ClientID ?? ''}
AUTH0_CLIENT_SECRET=${config.AuthProviderValues?.ClientSecret ?? ''}
AUTH0_DOMAIN=${config.AuthProviderValues?.Domain ?? ''}

# Skip API
ASK_SKIP_API_URL='http://localhost:8000'
ASK_SKIP_ORGANIZATION_ID=1
`;

    await this.fileSystem.WriteText(envPath, content);
  }

  private async writeMjConfigCjs(configPath: string, config: InstallConfig): Promise<void> {
    // Generate a minimal mj.config.cjs for fresh installs
    const newUserSection = config.CreateNewUser
      ? `  newUserSetup: {
    userName: '${config.CreateNewUser.Username}',
    firstName: '${config.CreateNewUser.FirstName}',
    lastName: '${config.CreateNewUser.LastName}',
    email: '${config.CreateNewUser.Email}',
  },`
      : '';

    const content = `module.exports = {
  settings: {
    host: '${config.DatabaseHost}',
    port: ${config.DatabasePort},
    database: '${config.DatabaseName}',
    mjCoreSchema: '__mj',
  },
${newUserSection}
  output: [],
  commands: [],
};
`;

    await this.fileSystem.WriteText(configPath, content);
  }

  private patchNewUserSetup(
    content: string,
    newUser: NonNullable<InstallConfig['CreateNewUser']>
  ): string {
    const newUserBlock = `newUserSetup: {
    userName: '${newUser.Username}',
    firstName: '${newUser.FirstName}',
    lastName: '${newUser.LastName}',
    email: '${newUser.Email}',
  }`;

    // Try to replace existing newUserSetup block
    const existingPattern = /newUserSetup:\s*\{[^}]*\}/;
    if (existingPattern.test(content)) {
      return content.replace(existingPattern, newUserBlock);
    }

    // Insert before the closing of module.exports
    const insertPoint = content.lastIndexOf('};');
    if (insertPoint >= 0) {
      return content.slice(0, insertPoint) + '  ' + newUserBlock + ',\n' + content.slice(insertPoint);
    }

    return content;
  }

  private async updateExplorerEnvironments(
    dir: string,
    config: InstallConfig,
    emitter: InstallerEventEmitter
  ): Promise<{ Written: string[]; Preserved: string[] }> {
    const envDirCandidates = [
      path.join(dir, 'packages', 'MJExplorer', 'src', 'environments'),
      path.join(dir, 'apps', 'MJExplorer', 'src', 'environments'),
      path.join(dir, 'MJExplorer', 'src', 'environments'),
    ];

    // Find the first existing parent (MJExplorer/src/) to determine
    // the correct environments directory location.
    let envDir: string | null = null;
    for (const candidate of envDirCandidates) {
      const parentDir = path.dirname(candidate);
      if (await this.fileSystem.DirectoryExists(parentDir)) {
        envDir = candidate;
        break;
      }
    }

    if (!envDir) {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'configure',
        Message: 'Could not locate MJExplorer/src/ directory. Skipping environment file generation.',
      });
      return { Written: [], Preserved: [] };
    }

    const filesWritten: string[] = [];
    const filesPreserved: string[] = [];

    // Create the environments directory if it doesn't exist
    // (it's gitignored, so it won't be in release archives)
    const dirExists = await this.fileSystem.DirectoryExists(envDir);
    if (!dirExists) {
      await this.fileSystem.CreateDirectory(envDir);
    }

    const envFiles = dirExists
      ? await this.fileSystem.ListFiles(envDir, /environment.*\.ts$/)
      : [];

    if (envFiles.length > 0) {
      // Existing environment files found — preserve them
      for (const file of envFiles) {
        filesPreserved.push(path.join(envDir, file));
      }
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'configure',
        Message: `Existing environment files found (${envFiles.join(', ')}), preserving.`,
      });
    } else {
      // No environment files — create them from scratch
      const envContent = this.generateEnvironmentFile(config, true);
      const devContent = this.generateEnvironmentFile(config, false);

      const envPath = path.join(envDir, 'environment.ts');
      const devPath = path.join(envDir, 'environment.development.ts');

      await this.fileSystem.WriteText(envPath, envContent);
      await this.fileSystem.WriteText(devPath, devContent);
      filesWritten.push(envPath, devPath);

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'configure',
        Message: 'Created environment.ts and environment.development.ts',
      });
    }

    return { Written: filesWritten, Preserved: filesPreserved };
  }

  private generateEnvironmentFile(config: InstallConfig, production: boolean): string {
    const authType = this.mapAuthType(config.AuthProvider);
    const clientId = config.AuthProviderValues?.ClientID ?? '';
    const tenantId = config.AuthProviderValues?.TenantID ?? '';
    const authority = tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : '';
    const auth0Domain = config.AuthProviderValues?.Domain ?? '';
    const apiPort = config.APIPort ?? 4000;

    const explorerPort = config.ExplorerPort ?? 4200;
    const redirectUri = `http://localhost:${explorerPort}`;

    return `export const environment = {
  production: ${production},
  GRAPHQL_URI: 'http://localhost:${apiPort}/',
  GRAPHQL_WS_URI: 'ws://localhost:${apiPort}/',
  REDIRECT_URI: '${redirectUri}',
  AUTH_TYPE: '${authType}',
  MJ_CORE_SCHEMA_NAME: '__mj',
  CLIENT_ID: '${clientId}',
  TENANT_ID: '${tenantId}',
  CLIENT_AUTHORITY: '${authority}',
  AUTH0_DOMAIN: '${auth0Domain}',
  AUTH0_CLIENTID: '${clientId}',
  NODE_ENV: '${production ? 'production' : 'development'}',
  AUTOSAVE_DEBOUNCE_MS: 2000,
};
`;
  }

  // ---------------------------------------------------------------------------
  // Prompt helpers
  // ---------------------------------------------------------------------------

  private promptInput(
    emitter: InstallerEventEmitter,
    id: string,
    message: string,
    defaultValue: string,
    yes: boolean
  ): Promise<string> {
    if (yes) return Promise.resolve(defaultValue);

    return new Promise<string>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: id,
        PromptType: 'input',
        Message: message,
        Default: defaultValue,
        Resolve: resolve,
      });
    });
  }

  private promptConfirm(
    emitter: InstallerEventEmitter,
    id: string,
    message: string,
    defaultValue: boolean,
    yes: boolean
  ): Promise<boolean> {
    if (yes) return Promise.resolve(defaultValue);

    return new Promise<boolean>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: id,
        PromptType: 'confirm',
        Message: message,
        Default: defaultValue ? 'yes' : 'no',
        Resolve: (answer: string) => {
          resolve(answer === 'yes' || answer === 'y' || answer === 'true');
        },
      });
    });
  }

  private promptSelect(
    emitter: InstallerEventEmitter,
    id: string,
    message: string,
    choices: { Label: string; Value: string }[],
    defaultValue: string
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: id,
        PromptType: 'select',
        Message: message,
        Choices: choices,
        Default: defaultValue,
        Resolve: resolve,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapAuthType(provider: InstallConfig['AuthProvider']): 'msal' | 'auth0' {
    switch (provider) {
      case 'entra': return 'msal';
      case 'auth0': return 'auth0';
      // 'none' defaults to 'msal' because the MJEnvironmentConfig type
      // requires AUTH_TYPE to be 'msal' | 'auth0'. With an empty CLIENT_ID
      // the MSAL provider will simply skip authentication.
      case 'none': return 'msal';
      default: return 'msal';
    }
  }
}
