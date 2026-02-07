import { confirm, input, select } from '@inquirer/prompts';
import * as dotenv from 'dotenv';
import * as recast from 'recast';
import { Command, Flags } from '@oclif/core';
import type { ParserOutput } from '@oclif/core/lib/interfaces/parser';
import * as fs from 'fs-extra';
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

type Config = z.infer<typeof configSchema>;
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

export default class Install extends Command {
  static description = 'Install MemberJunction';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    verbose: Flags.boolean({ char: 'v', description: 'Enable additional logging' }),
  };

  flags: ParserOutput<Install>['flags'];
  userConfig!: Config;

  async run(): Promise<void> {
    const parsed = await this.parse(Install);
    this.flags = parsed.flags;

    this.checkNodeVersion();
    this.checkAvailableDiskSpace(2);
    this.verifyDirs(GENERATED_ENTITIES_DIR, SQL_SCRIPTS_DIR, MJAPI_DIR, MJEXPLORER_DIR);

    this.userConfig = await this.getUserConfiguration();

    this.log('Setting up MemberJunction Distribution...');
    if (this.flags.verbose) {
      this.logJson({ userConfig: this.userConfig, flags: this.flags });
    }

    //*******************************************************************
    // Process GeneratedEntities
    //*******************************************************************
    this.log('\nBootstrapping GeneratedEntities...');
    this.log('Running npm install...');
    execSync('npm install', { stdio: 'inherit', cwd: GENERATED_ENTITIES_DIR });

    //*******************************************************************
    // Process Config
    //*******************************************************************
    this.log('\nProcessing Config...');
    this.log('   Updating ');
    this.log('   Setting up .env and mj.config.cjs...');
    const dotenvContent = `#Database Setup
DB_HOST='${this.userConfig.dbUrl}'
DB_PORT=${this.userConfig.dbPort}
CODEGEN_DB_USERNAME='${this.userConfig.codeGenLogin}'
CODEGEN_DB_PASSWORD='${this.userConfig.codeGenPwD}'
DB_USERNAME='${this.userConfig.mjAPILogin}'
DB_PASSWORD='${this.userConfig.mjAPIPwD}'
DB_DATABASE='${this.userConfig.dbDatabase}'
${this.userConfig.dbInstance ? "DB_INSTANCE_NAME='" + this.userConfig.dbInstance + "'" : ''}
${this.userConfig.dbTrustServerCertificate === 'Y' ? 'DB_TRUST_SERVER_CERTIFICATE=1' : ''}

#OUTPUT CODE is used for output directories like SQL Scripts
OUTPUT_CODE='${this.userConfig.dbDatabase}'

# Name of the schema that MJ has been setup in. This defaults to __mj
MJ_CORE_SCHEMA='__mj'

# If using Advanced Generation or the MJAI library, populate this with the API key for the AI vendor you are using
# Also, you need to configure the settings under advancedGeneration in the mj.config.cjs file, including choosing the vendor.
AI_VENDOR_API_KEY__OpenAILLM='${this.userConfig.openAIAPIKey}'
AI_VENDOR_API_KEY__MistralLLM='${this.userConfig.mistralAPIKey}'
AI_VENDOR_API_KEY__AnthropicLLM='${this.userConfig.anthropicAPIKey}'

PORT=${this.userConfig.graphQLPort}

UPDATE_USER_CACHE_WHEN_NOT_FOUND=1
UPDATE_USER_CACHE_WHEN_NOT_FOUND_DELAY=5000

# AUTHENTICATION SECTION - you can use MSAL or Auth0 or both for authentication services for MJAPI
# MSAL Section
WEB_CLIENT_ID=${this.userConfig.msalWebClientId}
TENANT_ID=${this.userConfig.msalTenantId}

# Auth0 Section
AUTH0_CLIENT_ID=${this.userConfig.auth0ClientId}
AUTH0_CLIENT_SECRET=${this.userConfig.auth0ClientSecret}
AUTH0_DOMAIN=${this.userConfig.auth0Domain}

# Skip API URL, KEY and Org ID
# YOU MUST ENTER IN THE CORRECT URL and ORG ID for your Skip API USE BELOW
ASK_SKIP_API_URL = 'http://localhost:8000'
ASK_SKIP_ORGANIZATION_ID = 1
`;
    fs.writeFileSync('.env', dotenvContent);

    //*******************************************************************
    // Process MJAPI
    //*******************************************************************
    this.log('\n\nBootstrapping MJAPI...');
    this.log('   Running npm link for generated code...');
    execSync('npm link ../GeneratedEntities ../GeneratedActions', { stdio: 'inherit', cwd: MJAPI_DIR });

    this.log('Running CodeGen...');
    this.renameFolderToMJ_BASE(this.userConfig.dbDatabase);

    // next, run CodeGen
    // We do not manually run the compilation for GeneratedEntities because CodeGen handles that, but notice above that we did npm install for GeneratedEntities otherwise when CodeGen attempts to compile it, it will fail.
    dotenv.config({ quiet: true });
    this.config.runCommand('codegen');

    // Process MJExplorer
    this.log('\nProcessing MJExplorer...');
    this.log('\n   Updating environment files...');
    const config = {
      CLIENT_ID: this.userConfig.msalWebClientId,
      TENANT_ID: this.userConfig.msalTenantId,
      CLIENT_AUTHORITY: this.userConfig.msalTenantId ? `https://login.microsoftonline.com/${this.userConfig.msalTenantId}` : '',
      AUTH_TYPE: this.userConfig.authType === 'AUTH0' ? 'auth0' : this.userConfig.authType.toLowerCase(),
      AUTH0_DOMAIN: this.userConfig.auth0Domain,
      AUTH0_CLIENTID: this.userConfig.auth0ClientId,
    };

    await this.updateEnvironmentFiles(path.join(MJEXPLORER_DIR, 'src', 'environments'), config);

    // keep on going with MJ Explorer - do the rest of the stuff
    this.log('   Running npm link for GeneratedEntities...');
    execSync('npm link ../GeneratedEntities', { stdio: 'inherit', cwd: MJEXPLORER_DIR });

    this.log('Installation complete!');
  }

  async getUserConfiguration() {
    let userConfig: Config | undefined;
    try {
      const configObject = await fs.readJSON('install.config.json');
      userConfig = configSchema.parse(configObject);
    } catch (e) {
      if (e instanceof ZodError) {
        this.log(
          `Invalid config file found at '${path.join(fs.realpathSync('.'), 'install.config.json')}'${
            this.flags.verbose ? '' : ', retry with --verbose for details'
          }`
        );
        if (this.flags.verbose) {
          console.table(e.issues);
        }
      } else {
        this.log(`No config file found at '${path.join(fs.realpathSync('.'), 'install.config.json')}'`);
      }
    }

    if (!userConfig) {
      this.log(
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

      this.log(
        '\n>>> Please answer the following questions to setup the .env files for MJAPI. After this process you can manually edit the .env file in CodeGen as desired.'
      );
      const mjAPILogin = await input({ message: 'Enter the database login for MJAPI:' });
      const mjAPIPwD = await input({ message: 'Enter the database password for MJAPI:' });
      const graphQLPort = await input({
        message: 'Enter the port to use for the GraphQL API',
        validate: (v) => configSchema.shape.graphQLPort.safeParse(v).success,
        default: '4000',
      });
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

      const openAIAPIKey = await input({ message: 'Enter the OpenAI API Key (leave blank if not using):' });
      const anthropicAPIKey = await input({ message: 'Enter the Anthropic API Key (leave blank if not using):' });
      const mistralAPIKey = await input({ message: 'Enter the Mistral API Key (leave blank if not using):' });

      userConfig = configSchema.parse({
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
        authType,
        msalWebClientId,
        msalTenantId,
        auth0ClientId,
        auth0ClientSecret,
        auth0Domain,
        createNewUser: createNewUser ? 'Y' : 'N',
        userEmail,
        userFirstName,
        userLastName,
        userName,
        openAIAPIKey,
        anthropicAPIKey,
        mistralAPIKey,
      });
    }
    return userConfig;
  }

  /**
   * Verifies that the specified directories exist.
   * @param {...string} dirs - The directories to check.
   */
  verifyDirs(...dirs: string[]) {
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        this.error(`Unable to locate required package at '${path.join(fs.realpathSync('.'), dir)}'`, {
          exit: 1,
          suggestions: ['Run the install from the same directory as the extracted MemberJunction distribution'],
        });
      }
    });
  }

  checkNodeVersion() {
    const validNodeVersion = Number(process.version.replace(/^v(\d+).*/, '$1')) >= 20;
    if (!validNodeVersion) {
      this.error('MemberJunction requires Node.js version 20 or higher.', { exit: 1 });
    }
  }

  /**
   * Checks if there is at least `numGB` GB of free disk space.
   * @param {number} numGB - The number of GB to check for.
   * @returns {boolean} True if there is enough free disk space, false otherwise.
   */
  checkAvailableDiskSpace(numGB = 2) {
    try {
      this.log(`Checking for at least ${numGB}GB of free disk space...`);
      // Define numGB GB in bytes
      const GBToBytes = 1024 * 1024 * 1024;
      const requiredSpace = numGB * GBToBytes;
      let freeSpace;

      if (os.platform() === 'win32') {
        // For Windows, check the C: drive
        const command = `wmic LogicalDisk where DeviceID="C:" get FreeSpace`;
        const output = execSync(command).toString();
        const lines = output.trim().split('\n');
        freeSpace = parseInt(lines[1].trim());
      } else {
        // For POSIX systems, check the root directory
        const command = `df -k / | tail -1 | awk '{ print $4; }'`;
        freeSpace = parseInt(execSync(command).toString().trim()) * 1024;
      }

      if (freeSpace >= requiredSpace) {
        this.log(`   Sufficient disk space available: ${Math.round(freeSpace / GBToBytes)} GB`);
        return true;
      } else {
        this.error(`Insufficient disk space. Required: ${requiredSpace} bytes, Available: ${Math.round(freeSpace / GBToBytes)} GB`, {
          exit: 1,
        });
      }
    } catch (error) {
      this.logToStderr(this.toErrorJson(error));
      this.error('Error checking disk space', { exit: 1 });
    }
  }

  /**
   * Updates environment files in a given directory.
   * @param {string} dirPath - The path to the directory containing environment files.
   * @param {object} config - The configuration object with values to update.
   */
  async updateEnvironmentFiles(dirPath: string, config: Record<string, string | undefined>) {
    try {
      // Define the pattern for environment files.
      const envFilePattern = /environment.*\.ts$/;

      // Read all files in the directory.
      const files = await fs.readdir(dirPath);

      // Filter for environment files.
      const envFiles = files.filter((file) => envFilePattern.test(file));

      // Update each environment file.
      for (const file of envFiles) {
        if (this.flags.verbose) {
          this.log(`Updating ${file}`);
        }
        const filePath = path.join(dirPath, file);
        const data = await fs.readFile(filePath, 'utf8');

        // Replace the values in the file.
        let updatedData = data;
        Object.entries(config).forEach(([key, value = '']) => {
          const regex = new RegExp(`(["\']?${key}["\']?:\\s*["\'])([^"\']*)(["\'])`, 'g');
          const escapedValue = value.replaceAll('$', () => '$$');
          updatedData = updatedData.replace(regex, `$1${escapedValue}$3`);
        });

        // Write the updated data back to the file.
        await fs.writeFile(filePath, updatedData, 'utf8');
        this.log(`Updated ${file}`);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }

  renameFolderToMJ_BASE(dbDatabase: string) {
    // rename the MJ_BASE set of SQL Scripts to our new dbname
    const oldFolderPath = path.join(SQL_SCRIPTS_DIR, GENERATED_DIR, MJ_BASE_DIR);
    const newFolderPath = path.join(SQL_SCRIPTS_DIR, GENERATED_DIR, dbDatabase); // Assuming dbDatabase holds the new name
    if (!fs.existsSync(oldFolderPath)) {
      this.warn(`SQL scripts not found at '${oldFolderPath}', skipping rename`);
      return;
    }

    try {
      fs.moveSync(oldFolderPath, newFolderPath);
      this.log(`Renamed ${oldFolderPath} to ${newFolderPath} successfully.`);
    } catch (err) {
      this.logToStderr(`An error occurred while renaming the '${oldFolderPath}' folder:`, err);
    }
  }

  /**
   * Updates newUserSetup in the mj.config.cjs file.
   * @param {string} userName - The new UserName to set.
   * @param {string} firstName - The new FirstName to set.
   * @param {string} lastName - The new LastName to set.
   * @param {string} email - The new Email to set.
   */
  async updateConfigNewUserSetup(userName?: string, firstName?: string, lastName?: string, email?: string) {
    try {
      // Read the mj.config.cjs file
      const configFileContent = await fs.readFile('mj.config.cjs', 'utf8');

      // Parse the content into an AST
      const ast = recast.parse(configFileContent);

      // Modify the AST
      const n = recast.types.namedTypes;
      const b = recast.types.builders;
      recast.types.visit(ast, {
        visitObjectExpression(path) {
          const properties = path.node.properties;

          // Check if newUserSetup key exists
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
            // Overwrite the existing newUserSetup key with an object
            newUserSetupProperty.value = newUserSetupValue;
          } else {
            // Add a new newUserSetup key
            properties.push(b.property('init', b.identifier('newUserSetup'), newUserSetupValue));
          }

          return false; // Stop traversing this path
        },
      });

      // Serialize the AST back to a string
      const updatedConfigFileContent = recast.prettyPrint(ast).code;

      // Write the updated content back to the file
      await fs.writeFile('mj.config.cjs', updatedConfigFileContent);
      this.log(`      Updated mj.config.cjs`);
    } catch (err) {
      this.logToStderr('Error:', err);
    }
  }
}
