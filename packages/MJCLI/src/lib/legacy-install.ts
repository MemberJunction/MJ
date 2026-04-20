/**
 * Legacy interactive installer (pre-engine).
 *
 * Preserves the original `mj install` behavior from v3.x for the
 * ZIP-only distribution workflow.  Access via `mj install --legacy`.
 */

import type { Command } from '@oclif/core';
import { confirm, input, select } from '@inquirer/prompts';
import dotenv from 'dotenv';
import recast from 'recast';
import fs from 'fs-extra';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ZodError, z } from 'zod';

// Directories are relative to execution cwd
const GENERATED_ENTITIES_DIR = 'GeneratedEntities';
const SQL_SCRIPTS_DIR = 'SQL Scripts';
const GENERATED_DIR = 'generated';
const MJ_BASE_DIR = 'MJ_BASE';
const MJAPI_DIR = 'MJAPI';
const MJEXPLORER_DIR = 'MJExplorer';

type LegacyConfig = z.infer<typeof configSchema>;
const configSchema = z.object({
  dbUrl: z.string().min(1),
  dbInstance: z.string(),
  dbTrustServerCertificate: z.coerce
    .boolean()
    .default(false)
    .transform((v) => (v ? 'Y' : 'N')),
  dbDatabase: z.string().min(1),
  dbPort: z.number({ coerce: true }).int().positive(),
  codeGenLogin: z.string(),
  codeGenPwD: z.string(),
  mjAPILogin: z.string(),
  mjAPIPwD: z.string(),
  graphQLPort: z.number({ coerce: true }).int().positive().optional(),
  authType: z.enum(['MSAL', 'AUTH0', 'BOTH']),
  msalWebClientId: z.string().optional(),
  msalTenantId: z.string().optional(),
  auth0ClientId: z.string().optional(),
  auth0ClientSecret: z.string().optional(),
  auth0Domain: z.string().optional(),
  createNewUser: z.coerce.boolean().optional(),
  userEmail: z.string().email().or(z.literal('')).optional().default(''),
  userFirstName: z.string().optional(),
  userLastName: z.string().optional(),
  userName: z.string().optional(),
  openAIAPIKey: z.string().optional(),
  anthropicAPIKey: z.string().optional(),
  mistralAPIKey: z.string().optional(),
});

export class LegacyInstaller {
  private cmd: Command;
  private verbose: boolean;

  constructor(cmd: Command, verbose: boolean) {
    this.cmd = cmd;
    this.verbose = verbose;
  }

  async Run(): Promise<void> {
    this.checkNodeVersion();
    this.checkAvailableDiskSpace(2);
    this.verifyDirs(GENERATED_ENTITIES_DIR, SQL_SCRIPTS_DIR, MJAPI_DIR, MJEXPLORER_DIR);

    const userConfig = await this.getUserConfiguration();

    this.cmd.log('Setting up MemberJunction Distribution...');
    if (this.verbose) {
      this.cmd.log(JSON.stringify(userConfig, null, 2));
    }

    this.bootstrapGeneratedEntities();
    this.writeEnvFile(userConfig);
    this.bootstrapMjapi(userConfig);

    await this.processMjExplorer(userConfig);

    this.cmd.log('Installation complete!');
  }

  // ---------------------------------------------------------------------------
  // Top-level steps
  // ---------------------------------------------------------------------------

  private bootstrapGeneratedEntities(): void {
    this.cmd.log('\nBootstrapping GeneratedEntities...');
    this.cmd.log('Running npm install...');
    execSync('npm install', { stdio: 'inherit', cwd: GENERATED_ENTITIES_DIR });
  }

  private bootstrapMjapi(userConfig: LegacyConfig): void {
    this.cmd.log('\n\nBootstrapping MJAPI...');
    this.cmd.log('   Running npm link for generated code...');
    execSync('npm link ../GeneratedEntities ../GeneratedActions', { stdio: 'inherit', cwd: MJAPI_DIR });

    this.cmd.log('Running CodeGen...');
    this.renameFolderToMjBase(userConfig.dbDatabase);

    dotenv.config();
    this.cmd.config.runCommand('codegen');
  }

  private async processMjExplorer(userConfig: LegacyConfig): Promise<void> {
    this.cmd.log('\nProcessing MJExplorer...');
    this.cmd.log('\n   Updating environment files...');
    const config = {
      CLIENT_ID: userConfig.msalWebClientId,
      TENANT_ID: userConfig.msalTenantId,
      CLIENT_AUTHORITY: userConfig.msalTenantId
        ? `https://login.microsoftonline.com/${userConfig.msalTenantId}`
        : '',
      AUTH_TYPE: userConfig.authType === 'AUTH0' ? 'auth0' : userConfig.authType.toLowerCase(),
      AUTH0_DOMAIN: userConfig.auth0Domain,
      AUTH0_CLIENTID: userConfig.auth0ClientId,
    };

    await this.updateEnvironmentFiles(path.join(MJEXPLORER_DIR, 'src', 'environments'), config);

    this.cmd.log('   Running npm link for GeneratedEntities...');
    execSync('npm link ../GeneratedEntities', { stdio: 'inherit', cwd: MJEXPLORER_DIR });
  }

  // ---------------------------------------------------------------------------
  // Preflight checks
  // ---------------------------------------------------------------------------

  private checkNodeVersion(): void {
    const validNodeVersion = Number(process.version.replace(/^v(\d+).*/, '$1')) >= 20;
    if (!validNodeVersion) {
      this.cmd.error('MemberJunction requires Node.js version 20 or higher.', { exit: 1 });
    }
  }

  private checkAvailableDiskSpace(numGB = 2): void {
    try {
      this.cmd.log(`Checking for at least ${numGB}GB of free disk space...`);
      const GBToBytes = 1024 * 1024 * 1024;
      const requiredSpace = numGB * GBToBytes;
      let freeSpace: number;

      if (os.platform() === 'win32') {
        const command = `wmic LogicalDisk where DeviceID="C:" get FreeSpace`;
        const output = execSync(command).toString();
        const lines = output.trim().split('\n');
        freeSpace = parseInt(lines[1].trim());
      } else {
        const command = `df -k / | tail -1 | awk '{ print $4; }'`;
        freeSpace = parseInt(execSync(command).toString().trim()) * 1024;
      }

      if (freeSpace >= requiredSpace) {
        this.cmd.log(`   Sufficient disk space available: ${Math.round(freeSpace / GBToBytes)} GB`);
      } else {
        this.cmd.error(
          `Insufficient disk space. Required: ${requiredSpace} bytes, Available: ${Math.round(freeSpace / GBToBytes)} GB`,
          { exit: 1 }
        );
      }
    } catch {
      this.cmd.error('Error checking disk space', { exit: 1 });
    }
  }

  private verifyDirs(...dirs: string[]): void {
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        this.cmd.error(`Unable to locate required package at '${path.join(fs.realpathSync('.'), dir)}'`, {
          exit: 1,
          suggestions: ['Run the install from the same directory as the extracted MemberJunction distribution'],
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  private async getUserConfiguration(): Promise<LegacyConfig> {
    let userConfig: LegacyConfig | undefined;
    try {
      const configObject = await fs.readJSON('install.config.json');
      userConfig = configSchema.parse(configObject);
    } catch (e) {
      if (e instanceof ZodError) {
        this.cmd.log(
          `Invalid config file found at '${path.join(fs.realpathSync('.'), 'install.config.json')}'${
            this.verbose ? '' : ', retry with --verbose for details'
          }`
        );
        if (this.verbose) {
          console.table(e.issues);
        }
      } else {
        this.cmd.log(`No config file found at '${path.join(fs.realpathSync('.'), 'install.config.json')}'`);
      }
    }

    if (!userConfig) {
      userConfig = await this.promptForConfiguration();
    }
    return userConfig;
  }

  private async promptForConfiguration(): Promise<LegacyConfig> {
    this.cmd.log(
      '\n>>> Please answer the following questions to setup the .env files for CodeGen. After this process you can manually edit the .env file as desired.'
    );
    const dbUrl = await input({
      message: 'Enter the database server hostname:',
      validate: (v) => configSchema.shape.dbDatabase.safeParse(v).success,
    });
    const dbInstance = await input({
      message: 'If you are using a named instance on that server, if so, enter the name here, if not leave blank:',
    });
    const dbTrustServerCertificate = (await confirm({
      message: 'Does the database server use a self-signed certificate? If you are using a local instance, enter Y:',
    }))
      ? 'Y'
      : 'N';
    const dbDatabase = await input({
      message: 'Enter the database name on that server:',
      validate: (v) => configSchema.shape.dbDatabase.safeParse(v).success,
    });
    const dbPort = await input({
      message: 'Enter the port the database server listens on',
      validate: (v) => configSchema.shape.dbPort.safeParse(v).success,
      default: '1433',
    });
    const codeGenLogin = await input({ message: 'Enter the database login for CodeGen:' });
    const codeGenPwD = await input({ message: 'Enter the database password for CodeGen:' });

    this.cmd.log(
      '\n>>> Please answer the following questions to setup the .env files for MJAPI. After this process you can manually edit the .env file in CodeGen as desired.'
    );
    const mjAPILogin = await input({ message: 'Enter the database login for MJAPI:' });
    const mjAPIPwD = await input({ message: 'Enter the database password for MJAPI:' });
    const graphQLPort = await input({
      message: 'Enter the port to use for the GraphQL API',
      validate: (v) => configSchema.shape.graphQLPort.safeParse(v).success,
      default: '4000',
    });

    const authConfig = await this.promptForAuthConfiguration();
    const userSetup = await this.promptForUserSetup();
    const aiKeys = await this.promptForAiKeys();

    return configSchema.parse({
      dbUrl,
      dbInstance,
      dbTrustServerCertificate,
      dbDatabase,
      dbPort,
      codeGenLogin,
      codeGenPwD,
      mjAPILogin,
      mjAPIPwD,
      graphQLPort,
      ...authConfig,
      ...userSetup,
      ...aiKeys,
    });
  }

  private async promptForAuthConfiguration(): Promise<Record<string, string>> {
    const authType = await select({
      message: 'Will you be using Microsoft Entra (formerly Azure AD), Auth0, or both for authentication services for MJAPI:',
      choices: [
        { name: 'Microsoft Entra (MSAL)', value: 'MSAL' },
        { name: 'Auth0', value: 'AUTH0' },
        { name: 'Both', value: 'BOTH' },
      ],
    });
    const msalTenantId = ['BOTH', 'MSAL'].includes(authType) ? await input({ message: 'Enter the web client ID for Entra:' }) : '';
    const msalWebClientId = ['BOTH', 'MSAL'].includes(authType) ? await input({ message: 'Enter the tenant ID for Entra:' }) : '';
    const auth0ClientId = ['BOTH', 'AUTH0'].includes(authType) ? await input({ message: 'Enter the client ID for Auth0:' }) : '';
    const auth0ClientSecret = ['BOTH', 'AUTH0'].includes(authType) ? await input({ message: 'Enter the client secret for Auth0:' }) : '';
    const auth0Domain = ['BOTH', 'AUTH0'].includes(authType) ? await input({ message: 'Enter the domain for Auth0:' }) : '';

    return { authType, msalTenantId, msalWebClientId, auth0ClientId, auth0ClientSecret, auth0Domain };
  }

  private async promptForUserSetup(): Promise<Record<string, string>> {
    const createNewUser = await confirm({ message: 'Do you want to create a new user in the database? (Y/N):' });

    const userEmail = createNewUser
      ? await input({
          message: 'Enter the new user email',
          validate: (v) => configSchema.shape.userEmail.safeParse(v).success,
        })
      : '';
    const userFirstName = createNewUser ? await input({ message: 'Enter the new user first name:' }) : '';
    const userLastName = createNewUser ? await input({ message: 'Enter the new user last name::' }) : '';
    const userName = createNewUser
      ? await input({ message: 'Enter the new user name (leave blank to use email):', default: userEmail })
      : '';

    return { createNewUser: createNewUser ? 'Y' : 'N', userEmail, userFirstName, userLastName, userName };
  }

  private async promptForAiKeys(): Promise<Record<string, string>> {
    const openAIAPIKey = await input({ message: 'Enter the OpenAI API Key (leave blank if not using):' });
    const anthropicAPIKey = await input({ message: 'Enter the Anthropic API Key (leave blank if not using):' });
    const mistralAPIKey = await input({ message: 'Enter the Mistral API Key (leave blank if not using):' });

    return { openAIAPIKey, anthropicAPIKey, mistralAPIKey };
  }

  // ---------------------------------------------------------------------------
  // File generation
  // ---------------------------------------------------------------------------

  private writeEnvFile(userConfig: LegacyConfig): void {
    this.cmd.log('\nProcessing Config...');
    this.cmd.log('   Updating ');
    this.cmd.log('   Setting up .env and mj.config.cjs...');
    const dotenvContent = `#Database Setup
DB_HOST='${userConfig.dbUrl}'
DB_PORT=${userConfig.dbPort}
CODEGEN_DB_USERNAME='${userConfig.codeGenLogin}'
CODEGEN_DB_PASSWORD='${userConfig.codeGenPwD}'
DB_USERNAME='${userConfig.mjAPILogin}'
DB_PASSWORD='${userConfig.mjAPIPwD}'
DB_DATABASE='${userConfig.dbDatabase}'
${userConfig.dbInstance ? "DB_INSTANCE_NAME='" + userConfig.dbInstance + "'" : ''}
${userConfig.dbTrustServerCertificate === 'Y' ? 'DB_TRUST_SERVER_CERTIFICATE=1' : ''}

#OUTPUT CODE is used for output directories like SQL Scripts
OUTPUT_CODE='${userConfig.dbDatabase}'

# Name of the schema that MJ has been setup in. This defaults to __mj
MJ_CORE_SCHEMA='__mj'

# If using Advanced Generation or the MJAI library, populate this with the API key for the AI vendor you are using
# Also, you need to configure the settings under advancedGeneration in the mj.config.cjs file, including choosing the vendor.
AI_VENDOR_API_KEY__OpenAILLM='${userConfig.openAIAPIKey}'
AI_VENDOR_API_KEY__MistralLLM='${userConfig.mistralAPIKey}'
AI_VENDOR_API_KEY__AnthropicLLM='${userConfig.anthropicAPIKey}'

PORT=${userConfig.graphQLPort}

UPDATE_USER_CACHE_WHEN_NOT_FOUND=1
UPDATE_USER_CACHE_WHEN_NOT_FOUND_DELAY=5000

# AUTHENTICATION SECTION - you can use MSAL or Auth0 or both for authentication services for MJAPI
# MSAL Section
WEB_CLIENT_ID=${userConfig.msalWebClientId}
TENANT_ID=${userConfig.msalTenantId}

# Auth0 Section
AUTH0_CLIENT_ID=${userConfig.auth0ClientId}
AUTH0_CLIENT_SECRET=${userConfig.auth0ClientSecret}
AUTH0_DOMAIN=${userConfig.auth0Domain}

# Skip API URL, KEY and Org ID
# YOU MUST ENTER IN THE CORRECT URL and ORG ID for your Skip API USE BELOW
ASK_SKIP_API_URL = 'http://localhost:8000'
ASK_SKIP_ORGANIZATION_ID = 1
`;
    fs.writeFileSync('.env', dotenvContent);
  }

  private renameFolderToMjBase(dbDatabase: string): void {
    const oldFolderPath = path.join(SQL_SCRIPTS_DIR, GENERATED_DIR, MJ_BASE_DIR);
    const newFolderPath = path.join(SQL_SCRIPTS_DIR, GENERATED_DIR, dbDatabase);
    if (!fs.existsSync(oldFolderPath)) {
      this.cmd.warn(`SQL scripts not found at '${oldFolderPath}', skipping rename`);
      return;
    }

    try {
      fs.moveSync(oldFolderPath, newFolderPath);
      this.cmd.log(`Renamed ${oldFolderPath} to ${newFolderPath} successfully.`);
    } catch (err) {
      this.cmd.logToStderr(`An error occurred while renaming the '${oldFolderPath}' folder: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async updateEnvironmentFiles(dirPath: string, config: Record<string, string | undefined>): Promise<void> {
    try {
      const envFilePattern = /environment.*\.ts$/;
      const files = await fs.readdir(dirPath);
      const envFiles = files.filter((file) => envFilePattern.test(file));

      for (const file of envFiles) {
        if (this.verbose) {
          this.cmd.log(`Updating ${file}`);
        }
        const filePath = path.join(dirPath, file);
        const data = await fs.readFile(filePath, 'utf8');

        let updatedData = data;
        Object.entries(config).forEach(([key, value = '']) => {
          const regex = new RegExp(`(["\']?${key}["\']?:\\s*["\'])([^"\']*)(["\'])`, 'g');
          const escapedValue = value.replaceAll('$', () => '$$');
          updatedData = updatedData.replace(regex, `$1${escapedValue}$3`);
        });

        await fs.writeFile(filePath, updatedData, 'utf8');
        this.cmd.log(`Updated ${file}`);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }

  async UpdateConfigNewUserSetup(userName?: string, firstName?: string, lastName?: string, email?: string): Promise<void> {
    try {
      const configFileContent = await fs.readFile('mj.config.cjs', 'utf8');
      const ast = recast.parse(configFileContent);

      const n = recast.types.namedTypes;
      const b = recast.types.builders;
      recast.types.visit(ast, {
        visitObjectExpression(visitPath) {
          const properties = visitPath.node.properties;

          const newUserSetupProperty = properties.find(
            (prop) => n.Property.check(prop) && n.Identifier.check(prop.key) && prop.key.name === 'newUserSetup'
          );

          const newUserSetupValue = b.objectExpression([
            b.property('init', b.identifier('userName'), b.literal(userName || '')),
            b.property('init', b.identifier('firstName'), b.literal(firstName || '')),
            b.property('init', b.identifier('lastName'), b.literal(lastName || '')),
            b.property('init', b.identifier('email'), b.literal(email || '')),
          ]);

          if (newUserSetupProperty && newUserSetupProperty.type === 'Property') {
            newUserSetupProperty.value = newUserSetupValue;
          } else {
            properties.push(b.property('init', b.identifier('newUserSetup'), newUserSetupValue));
          }

          return false;
        },
      });

      const updatedConfigFileContent = recast.prettyPrint(ast).code;
      await fs.writeFile('mj.config.cjs', updatedConfigFileContent);
      this.cmd.log(`      Updated mj.config.cjs`);
    } catch (err) {
      this.cmd.logToStderr(`Error updating mj.config.cjs: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
