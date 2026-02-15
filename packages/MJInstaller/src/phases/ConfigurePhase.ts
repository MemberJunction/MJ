/**
 * Phase E — Configure
 *
 * Gathers user configuration via prompt events (or reads from --config),
 * then generates .env, mj.config.cjs, and Explorer environment files.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { InstallConfig, PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

export interface ConfigureContext {
  /** Target directory for the installation */
  Dir: string;
  /** Partial config — missing fields will be prompted for */
  Config: PartialInstallConfig;
  /** Non-interactive mode */
  Yes: boolean;
  Emitter: InstallerEventEmitter;
}

export interface ConfigureResult {
  /** Fully resolved configuration */
  Config: InstallConfig;
  /** List of files written */
  FilesWritten: string[];
}

export class ConfigurePhase {
  private fileSystem = new FileSystemAdapter();

  async Run(context: ConfigureContext): Promise<ConfigureResult> {
    const { Emitter: emitter } = context;
    const filesWritten: string[] = [];

    // Step 1: Gather all config values
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'configure',
      Message: 'Gathering configuration...',
    });

    const config = await this.resolveConfig(context.Config, context.Yes, emitter);

    // Step 2: Write .env file
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'configure',
      Message: 'Writing .env file...',
    });
    const envPath = path.join(context.Dir, '.env');
    await this.writeEnvFile(envPath, config);
    filesWritten.push(envPath);

    // Step 3: Write/update mj.config.cjs
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'configure',
      Message: 'Writing mj.config.cjs...',
    });
    const configCjsPath = path.join(context.Dir, 'mj.config.cjs');
    await this.writeMjConfigCjs(configCjsPath, config);
    filesWritten.push(configCjsPath);

    // Step 4: Update Explorer environment files
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'configure',
      Message: 'Updating Explorer environment files...',
    });
    const envFilesWritten = await this.updateExplorerEnvironments(context.Dir, config, emitter);
    filesWritten.push(...envFilesWritten);

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Configuration complete. ${filesWritten.length} file(s) written.`,
    });

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

PORT=${config.APIPort}

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
    // Check if mj.config.cjs already exists — if so, only update newUserSetup
    const exists = await this.fileSystem.FileExists(configPath);

    if (exists && config.CreateNewUser) {
      const existingContent = await this.fileSystem.ReadText(configPath);
      const updatedContent = this.patchNewUserSetup(existingContent, config.CreateNewUser);
      await this.fileSystem.WriteText(configPath, updatedContent);
      return;
    }

    if (exists) {
      // Config exists, no new user — leave it alone
      return;
    }

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
  ): Promise<string[]> {
    const envDirs = [
      path.join(dir, 'apps', 'MJExplorer', 'src', 'environments'),
      path.join(dir, 'MJExplorer', 'src', 'environments'),
    ];

    const filesUpdated: string[] = [];

    for (const envDir of envDirs) {
      const dirExists = await this.fileSystem.DirectoryExists(envDir);
      if (!dirExists) continue;

      const envFiles = await this.fileSystem.ListFiles(envDir, /environment.*\.ts$/);

      const replacements: Record<string, string> = {
        CLIENT_ID: config.AuthProviderValues?.ClientID ?? '',
        TENANT_ID: config.AuthProviderValues?.TenantID ?? '',
        CLIENT_AUTHORITY: config.AuthProviderValues?.TenantID
          ? `https://login.microsoftonline.com/${config.AuthProviderValues.TenantID}`
          : '',
        AUTH_TYPE: this.mapAuthType(config.AuthProvider),
        AUTH0_DOMAIN: config.AuthProviderValues?.Domain ?? '',
        AUTH0_CLIENTID: config.AuthProviderValues?.ClientID ?? '',
      };

      for (const file of envFiles) {
        const filePath = path.join(envDir, file);
        let content = await this.fileSystem.ReadText(filePath);

        for (const [key, value] of Object.entries(replacements)) {
          const regex = new RegExp(`(["']?${key}["']?:\\s*["'])([^"']*)(['"])`, 'g');
          const escapedValue = value.replaceAll('$', '$$');
          content = content.replace(regex, `$1${escapedValue}$3`);
        }

        await this.fileSystem.WriteText(filePath, content);
        filesUpdated.push(filePath);

        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'configure',
          Message: `Updated ${file}`,
        });
      }
    }

    return filesUpdated;
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

  private mapAuthType(provider: InstallConfig['AuthProvider']): string {
    switch (provider) {
      case 'entra': return 'msal';
      case 'auth0': return 'auth0';
      case 'none': return '';
      default: return '';
    }
  }
}
