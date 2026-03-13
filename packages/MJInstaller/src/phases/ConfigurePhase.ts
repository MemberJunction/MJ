/**
 * Phase E — Configuration
 *
 * Gathers user configuration via prompt events (or reads from `--config` /
 * `--yes` defaults), then generates the three configuration file families:
 *
 * 1. **`.env`** — Database credentials, API keys, port settings, auth config,
 *    and `MJ_BASE_ENCRYPTION_KEY` for field-level encryption.
 *    Written to both the repo root and `packages/MJAPI/.env`.
 * 2. **`mj.config.cjs`** — CodeGen configuration (host, port, database, schema,
 *    optional new user setup, and `encryptionKeys` block).
 * 3. **Explorer environment files** — `environment.ts` and
 *    `environment.development.ts` in `packages/MJExplorer/src/environments/`.
 *
 * **Preserve-vs-patch strategy**: If a configuration file already exists it is
 * preserved, but the installer will patch in `MJ_BASE_ENCRYPTION_KEY` and
 * `encryptionKeys` support if they are missing. This lets users re-run the
 * installer without losing hand-edited configuration while still gaining new
 * required settings.
 *
 * @module phases/ConfigurePhase
 * @see InstallConfig — the full configuration interface.
 * @see InstallConfigDefaults — default values for auto-mode.
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { InstallConfig, PartialInstallConfig } from '../models/InstallConfig.js';
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
  /** Absolute paths of files that were created or patched (not preserved). */
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

    // Step 2: .env files — preserve existing, create if missing, patch encryption key
    const envPath = path.join(context.Dir, '.env');
    const mjapiEnvPath = await this.resolveMjapiEnvPath(context.Dir);

    if (await this.fileSystem.FileExists(envPath)) {
      const existingRootEnv = await this.fileSystem.ReadText(envPath);
      const patchedRootEnv = this.ensureEnvVar(
        existingRootEnv,
        'MJ_BASE_ENCRYPTION_KEY',
        config.BaseEncryptionKey ?? ''
      );

      if (patchedRootEnv !== existingRootEnv) {
        await this.fileSystem.WriteText(envPath, patchedRootEnv);
        filesWritten.push(envPath);
      } else {
        filesPreserved.push(envPath);
      }

      // If MJAPI .env doesn't exist but root does, copy root → MJAPI
      const mjapiDir = path.dirname(mjapiEnvPath);
      if (await this.fileSystem.DirectoryExists(mjapiDir) && !(await this.fileSystem.FileExists(mjapiEnvPath))) {
        await this.fileSystem.WriteText(mjapiEnvPath, patchedRootEnv);
        filesWritten.push(mjapiEnvPath);
      } else if (await this.fileSystem.FileExists(mjapiEnvPath)) {
        const existingMjapiEnv = await this.fileSystem.ReadText(mjapiEnvPath);
        const patchedMjapiEnv = this.ensureEnvVar(
          existingMjapiEnv,
          'MJ_BASE_ENCRYPTION_KEY',
          config.BaseEncryptionKey ?? ''
        );

        if (patchedMjapiEnv !== existingMjapiEnv) {
          await this.fileSystem.WriteText(mjapiEnvPath, patchedMjapiEnv);
          filesWritten.push(mjapiEnvPath);
        } else {
          filesPreserved.push(mjapiEnvPath);
        }
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

    // Step 3: mj.config.cjs — preserve existing, create if missing, patch encryption + user
    const configCjsPath = path.join(context.Dir, 'mj.config.cjs');
    if (await this.fileSystem.FileExists(configCjsPath)) {
      const existingContent = await this.fileSystem.ReadText(configCjsPath);
      let updatedContent = this.ensureEncryptionKeysBlock(existingContent);

      if (config.CreateNewUser) {
        updatedContent = this.patchNewUserSetup(updatedContent, config.CreateNewUser);
      }

      if (updatedContent !== existingContent) {
        await this.fileSystem.WriteText(configCjsPath, updatedContent);
        filesWritten.push(configCjsPath);
      } else {
        filesPreserved.push(configCjsPath);
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

    // Step 3.5: Backfill auth values from any existing .env files into the
    // config so that Explorer environment patching has real values to work
    // with. This covers the case where the root .env was freshly written
    // with empty auth but apps/MJAPI/.env has real credentials from a
    // previous install or the bootstrap archive.
    await this.backfillAuthFromEnv(context.Dir, config);

    // Step 4: Explorer environment files — preserve existing, create if missing
    const envFilesResult = await this.updateExplorerEnvironments(context.Dir, config, emitter);
    filesWritten.push(...envFilesResult.Written);
    filesPreserved.push(...envFilesResult.Preserved);

    // Auth-not-configured warning — more specific than the generic defaults warning
    if (config.AuthProvider === 'none') {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'configure',
        Message: 'Authentication provider is not configured. '
          + 'MJExplorer will NOT start until you set up authentication. '
          + 'To fix: (1) Register an Azure AD (Entra) or Auth0 application, '
          + '(2) Edit packages/MJExplorer/src/environments/environment.ts — '
          + 'set AUTH_TYPE, CLIENT_ID, and TENANT_ID (for Entra) or '
          + 'AUTH_TYPE, AUTH0_DOMAIN, and AUTH0_CLIENTID (for Auth0), '
          + '(3) Update .env with the same credentials for MJAPI.',
      });
    }

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

  /**
   * Resolve a partial config into a fully populated {@link InstallConfig} by
   * prompting for missing values (or using defaults in `--yes` mode).
   *
   * Also generates a `BaseEncryptionKey` if one was not provided.
   *
   * @param partial - Config values already known (from CLI flags, env vars, or config file).
   * @param yes - When `true`, use defaults for all missing fields without prompting.
   * @param emitter - Event emitter used to send prompt events.
   * @returns A fully populated config object.
   */
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
    config.DatabaseTrustCert = config.DatabaseTrustCert ?? await this.promptConfirm(
      emitter, 'db-trust-cert', 'Trust self-signed server certificate? (common for local instances)', false, yes
    );

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
        const authChoice = await this.promptSelect(
          emitter,
          'auth-provider',
          'Authentication provider:',
          [
            { Label: 'None (skip auth for now)', Value: 'none' },
            { Label: 'Microsoft Entra (MSAL)', Value: 'entra' },
            { Label: 'Auth0', Value: 'auth0' },
          ],
          'none'
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
      } else {
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
        const username = await this.promptInput(
          emitter,
          'user-name',
          'Username (leave blank to use email):',
          email,
          false
        );
        config.CreateNewUser = { Email: email, FirstName: firstName, LastName: lastName, Username: username };
      }
    }

    // Encryption key — generate a cryptographically random 256-bit key if not provided
    config.BaseEncryptionKey = config.BaseEncryptionKey ?? this.generateBaseEncryptionKey();

    return config as InstallConfig;
  }

  // ---------------------------------------------------------------------------
  // File generation
  // ---------------------------------------------------------------------------

  /**
   * Write a fresh `.env` file with all config values including the encryption key.
   *
   * @param envPath - Absolute path to write the `.env` file.
   * @param config - Fully resolved config.
   */
  private async writeEnvFile(envPath: string, config: InstallConfig): Promise<void> {
    const trustCert = config.DatabaseTrustCert ? 'DB_TRUST_SERVER_CERTIFICATE=1' : '';

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

# Encryption key for MJ field-level encryption (base64-encoded, 256-bit)
MJ_BASE_ENCRYPTION_KEY='${config.BaseEncryptionKey ?? ''}'

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

  /**
   * Write a fresh `mj.config.cjs` with database settings, encryption keys,
   * and optional new user setup.
   *
   * @param configPath - Absolute path to write the config file.
   * @param config - Fully resolved config.
   */
  private async writeMjConfigCjs(configPath: string, config: InstallConfig): Promise<void> {
    const newUserSection = config.CreateNewUser
      ? `  newUserSetup: {
    userName: '${config.CreateNewUser.Username}',
    firstName: '${config.CreateNewUser.FirstName}',
    lastName: '${config.CreateNewUser.LastName}',
    email: '${config.CreateNewUser.Email}',
  },
`
      : '';

    const content = `module.exports = {
  settings: {
    host: '${config.DatabaseHost}',
    port: ${config.DatabasePort},
    database: '${config.DatabaseName}',
    mjCoreSchema: '__mj',
  },
  encryptionKeys: {
    MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY || '',
  },
${newUserSection}  output: [],
  commands: [],
};
`;

    await this.fileSystem.WriteText(configPath, content);
  }

  // ---------------------------------------------------------------------------
  // Patching helpers — update existing config files without full overwrite
  // ---------------------------------------------------------------------------

  /**
   * Patch or replace a `newUserSetup` block in an existing `mj.config.cjs`.
   *
   * If an existing `newUserSetup: { ... }` block is found it is replaced
   * in-place; otherwise the block is inserted before the closing `};`.
   *
   * @param content - Current file content.
   * @param newUser - New user details to insert.
   * @returns The patched content.
   */
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

  /**
   * Ensure an existing `mj.config.cjs` has the `encryptionKeys` block.
   *
   * If the block already exists (detected by `encryptionKeys :` pattern) the
   * content is returned unchanged. Otherwise the block is inserted after the
   * `settings: { ... }` block, or before the closing `};` as a fallback.
   *
   * @param content - Current `mj.config.cjs` file content.
   * @returns The content with `encryptionKeys` guaranteed to be present.
   */
  private ensureEncryptionKeysBlock(content: string): string {
    if (/encryptionKeys\s*:/.test(content)) {
      return content;
    }

    const block = `  encryptionKeys: {
    MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY || '',
  },
`;

    // Preferred: insert after the `settings: { ... },` block.
    // The settings block is always flat (host, port, database, mjCoreSchema)
    // so matching to the first `}` with a non-greedy quantifier is safe.
    const insertAfterSettings = content.match(/settings\s*:\s*\{[\s\S]*?\}\s*,?\n/);
    if (insertAfterSettings?.index !== undefined) {
      const insertAt = insertAfterSettings.index + insertAfterSettings[0].length;
      return content.slice(0, insertAt) + block + content.slice(insertAt);
    }

    // Fallback: insert before closing `};`
    const insertPoint = content.lastIndexOf('};');
    if (insertPoint >= 0) {
      return content.slice(0, insertPoint) + block + content.slice(insertPoint);
    }

    return content;
  }

  /**
   * Ensure a KEY=VALUE variable exists in a `.env` file.
   *
   * If `name` is already present (with any value, including empty), the
   * content is returned unchanged. Otherwise the variable is appended.
   *
   * @param content - Existing `.env` file content.
   * @param name - Environment variable name (e.g. `MJ_BASE_ENCRYPTION_KEY`).
   * @param value - Value to set if the variable is missing.
   * @returns The content with the variable guaranteed to be present.
   */
  private ensureEnvVar(content: string, name: string, value: string): string {
    const envVarPattern = new RegExp(`^${name}=`, 'm');
    if (envVarPattern.test(content)) {
      return content;
    }

    const suffix = content.endsWith('\n') ? '' : '\n';
    return `${content}${suffix}${name}='${value}'\n`;
  }

  // ---------------------------------------------------------------------------
  // Explorer environment files
  // ---------------------------------------------------------------------------

  /**
   * Create or preserve Explorer environment files (`environment.ts`,
   * `environment.development.ts`).
   *
   * Searches for `MJExplorer/src/environments/` under several candidate
   * parent paths (monorepo, distribution, flat). Existing files are preserved;
   * missing files are generated from the resolved config.
   *
   * @param dir - Repo root directory.
   * @param config - Fully resolved config.
   * @param emitter - Event emitter for progress/warn events.
   * @returns Lists of files written and files preserved.
   */
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
      // Existing environment files found — preserve structure but patch
      // empty auth/connection fields with resolved config values.
      let patchedCount = 0;
      for (const file of envFiles) {
        const filePath = path.join(envDir, file);
        filesPreserved.push(filePath);
        const patched = await this.patchExplorerEnvironmentFile(filePath, config);
        if (patched) patchedCount++;
      }
      const patchMsg = patchedCount > 0
        ? `, patched ${patchedCount} file(s) with auth/connection values`
        : '';
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'configure',
        Message: `Existing environment files found (${envFiles.join(', ')}), preserving${patchMsg}.`,
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

  /**
   * Generate the content for an Angular `environment.ts` file.
   *
   * @param config - Fully resolved config.
   * @param production - `true` for `environment.ts`, `false` for `environment.development.ts`.
   * @returns TypeScript source code for the environment file.
   */
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

  /**
   * Reads ALL existing .env files and backfills auth-related values into
   * the config object when they are missing. Merges non-empty values from
   * all candidates, so if the root `.env` has empty auth but
   * `apps/MJAPI/.env` has real credentials, those credentials are used.
   */
  private async backfillAuthFromEnv(dir: string, config: InstallConfig): Promise<void> {
    const candidates = [
      path.join(dir, '.env'),
      path.join(dir, 'apps', 'MJAPI', '.env'),
      path.join(dir, 'packages', 'MJAPI', '.env'),
    ];

    // Merge env vars from ALL existing .env files. Later files fill in
    // values that earlier files left empty, so the most complete file wins.
    const merged: Record<string, string> = {};
    for (const candidate of candidates) {
      if (await this.fileSystem.FileExists(candidate)) {
        const content = await this.fileSystem.ReadText(candidate);
        const vars = this.parseEnvFile(content);
        for (const [key, value] of Object.entries(vars)) {
          if (value && !merged[key]) {
            merged[key] = value;
          }
        }
      }
    }

    if (Object.keys(merged).length === 0) return;

    if (!config.AuthProviderValues) {
      config.AuthProviderValues = {};
    }

    const clientId = merged['WEB_CLIENT_ID'] || merged['VITE_WEB_CLIENT_ID'] || '';
    const tenantId = merged['TENANT_ID'] || merged['VITE_TENANT_ID'] || '';
    const auth0Domain = merged['AUTH0_DOMAIN'] || '';
    const auth0ClientId = merged['AUTH0_CLIENT_ID'] || '';
    const graphqlPort = merged['GRAPHQL_PORT'] || '';

    if (clientId && !config.AuthProviderValues.ClientID) {
      config.AuthProviderValues.ClientID = clientId;
    }
    if (tenantId && !config.AuthProviderValues.TenantID) {
      config.AuthProviderValues.TenantID = tenantId;
    }
    if (auth0Domain && !config.AuthProviderValues.Domain) {
      config.AuthProviderValues.Domain = auth0Domain;
    }
    if (auth0ClientId && !config.AuthProviderValues.ClientID) {
      config.AuthProviderValues.ClientID = auth0ClientId;
    }
    if (graphqlPort && !config.APIPort) {
      config.APIPort = parseInt(graphqlPort, 10);
    }

    // Infer AuthProvider from env values if it was defaulted to 'none'
    if (config.AuthProvider === 'none') {
      if (tenantId && clientId) {
        config.AuthProvider = 'entra';
      } else if (auth0Domain) {
        config.AuthProvider = 'auth0';
      }
    }
  }

  /**
   * Parses a simple .env file into key-value pairs.
   * Handles `KEY=VALUE`, `KEY='VALUE'`, and `KEY="VALUE"` formats.
   */
  private parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex < 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  }

  /**
   * Patches an existing Explorer environment file, filling in empty string
   * values for auth/connection fields from the resolved config.
   *
   * @returns `true` if the file was modified.
   */
  private async patchExplorerEnvironmentFile(
    filePath: string,
    config: InstallConfig
  ): Promise<boolean> {
    let content = await this.fileSystem.ReadText(filePath);
    const original = content;

    const clientId = config.AuthProviderValues?.ClientID ?? '';
    const tenantId = config.AuthProviderValues?.TenantID ?? '';
    const authority = tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : '';
    const auth0Domain = config.AuthProviderValues?.Domain ?? '';
    const apiPort = config.APIPort ?? 4000;
    const explorerPort = config.ExplorerPort ?? 4200;
    const authType = this.mapAuthType(config.AuthProvider);

    // Map of field name → desired value. Only patch if the current value is empty.
    const patches: Record<string, string> = {
      GRAPHQL_URI: `http://localhost:${apiPort}/`,
      GRAPHQL_WS_URI: `ws://localhost:${apiPort}/`,
      REDIRECT_URI: `http://localhost:${explorerPort}`,
      CLIENT_ID: clientId,
      TENANT_ID: tenantId,
      CLIENT_AUTHORITY: authority,
      AUTH_TYPE: authType,
      AUTH0_DOMAIN: auth0Domain,
      AUTH0_CLIENTID: clientId,
    };

    for (const [field, value] of Object.entries(patches)) {
      if (!value) continue;
      // Match: "FIELD": "" or "FIELD": '' or FIELD: "" or FIELD: ''
      const emptyPattern = new RegExp(
        `(["']?${field}["']?\\s*[:=]\\s*)(?:["']{2}|["']\\s*["'])`,
      );
      if (emptyPattern.test(content)) {
        content = content.replace(emptyPattern, `$1'${value}'`);
      }
    }

    if (content !== original) {
      await this.fileSystem.WriteText(filePath, content);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Prompt helpers
  // ---------------------------------------------------------------------------

  /**
   * Emit a text input prompt and return the user's response (or the default
   * value when in `--yes` mode).
   */
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

  /**
   * Emit a yes/no confirmation prompt and return the boolean result (or the
   * default value when in `--yes` mode).
   */
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

  /**
   * Emit a select-from-list prompt and return the chosen value (or the
   * default when in `--yes` mode).
   */
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

  /**
   * Map the user-facing auth provider name to the `AUTH_TYPE` string expected
   * by the Angular environment config.
   *
   * `'none'` defaults to `'msal'` because the `MJEnvironmentConfig` type
   * requires `AUTH_TYPE` to be `'msal' | 'auth0'`.
   *
   * **Important**: When `AuthProvider` is `'none'`, the Explorer will show a
   * validation error because `AUTH_TYPE='msal'` requires `CLIENT_ID` and
   * `TENANT_ID`. The caller should emit a warning when auth is unconfigured.
   */
  private mapAuthType(provider: InstallConfig['AuthProvider']): 'msal' | 'auth0' {
    switch (provider) {
      case 'entra': return 'msal';
      case 'auth0': return 'auth0';
      case 'none': return 'msal';
      default: return 'msal';
    }
  }

  /**
   * Resolve the path to the MJAPI `.env` file. Checks both `packages/MJAPI/`
   * (monorepo layout) and `apps/MJAPI/` (distribution layout).
   */
  private async resolveMjapiEnvPath(dir: string): Promise<string> {
    const candidates = [
      path.join(dir, 'packages', 'MJAPI', '.env'),
      path.join(dir, 'apps', 'MJAPI', '.env'),
    ];
    for (const candidate of candidates) {
      if (await this.fileSystem.DirectoryExists(path.dirname(candidate))) {
        return candidate;
      }
    }
    // Fallback to packages layout
    return candidates[0];
  }

  /**
   * Generate a cryptographically random 256-bit key encoded as base64.
   *
   * Used for MJ's field-level encryption (`MJ_BASE_ENCRYPTION_KEY`).
   *
   * @returns A 44-character base64 string (32 bytes).
   */
  private generateBaseEncryptionKey(): string {
    return randomBytes(32).toString('base64');
  }
}
