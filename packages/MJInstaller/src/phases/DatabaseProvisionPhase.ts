/**
 * Phase C — Database Provisioning
 *
 * Generates idempotent SQL scripts for database setup and prompts the user
 * to execute them manually in SSMS or Azure Data Studio. Then validates
 * that SQL Server is reachable at the configured host:port.
 *
 * Two scripts are generated:
 * 1. **`mj-db-setup.sql`** — Creates the database (if not exists), `__mj` schema,
 *    SQL logins, database users, and role grants. All statements are idempotent
 *    (safe to run multiple times).
 * 2. **`mj-db-validate.sql`** — Verifies the schema, users, and roles exist.
 *    Run this to confirm the setup script was executed correctly.
 *
 * The phase does **not** execute SQL directly — it generates scripts and asks
 * the user to run them. This design avoids requiring a SQL driver dependency
 * in the installer and gives users full visibility into what's being executed.
 *
 * @module phases/DatabaseProvisionPhase
 * @see SqlServerAdapter — used for TCP connectivity validation.
 * @see ConfigurePhase — provides the database credentials used in script generation.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { SqlServerAdapter } from '../adapters/SqlServerAdapter.js';

/**
 * Input context for the database provisioning phase.
 *
 * @see DatabaseProvisionPhase.Run
 */
export interface DatabaseProvisionContext {
  /** Absolute path to the target install directory. */
  Dir: string;
  /** Current install config with database credentials from the configure phase. */
  Config: PartialInstallConfig;
  /** Non-interactive mode — skips the "run this script" prompt. */
  Yes: boolean;
  /** Event emitter for progress, prompt, and log events. */
  Emitter: InstallerEventEmitter;
}

/**
 * Result of the database provisioning phase.
 *
 * @see DatabaseProvisionPhase.Run
 */
export interface DatabaseProvisionResult {
  /** Absolute paths of the SQL script files that were generated. */
  ScriptsGenerated: string[];
  /** Whether the post-script TCP connectivity validation passed. */
  ValidationPassed: boolean;
}

/**
 * Phase C — Generates SQL provisioning scripts and validates database connectivity.
 *
 * @example
 * ```typescript
 * const dbPhase = new DatabaseProvisionPhase();
 * const result = await dbPhase.Run({
 *   Dir: '/path/to/install',
 *   Config: { DatabaseHost: 'localhost', DatabasePort: 1433, DatabaseName: 'MJ' },
 *   Yes: false,
 *   Emitter: emitter,
 * });
 * console.log(`Scripts: ${result.ScriptsGenerated.join(', ')}`);
 * ```
 */
export class DatabaseProvisionPhase {
  private fileSystem = new FileSystemAdapter();
  private sqlAdapter = new SqlServerAdapter();

  /**
   * Execute the database provisioning phase: generate scripts, prompt user,
   * and validate connectivity.
   *
   * @param context - Database provision input with directory, config, mode, and emitter.
   * @returns Script paths and validation result.
   * @throws {InstallerError} With code `DB_UNREACHABLE` if SQL Server connectivity fails after script execution.
   */
  async Run(context: DatabaseProvisionContext): Promise<DatabaseProvisionResult> {
    const { Config: config, Emitter: emitter } = context;

    // Step 1: Generate SQL scripts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Generating database setup scripts...',
    });

    const scripts = this.generateSetupScript(config);
    const scriptPath = path.join(context.Dir, 'mj-db-setup.sql');
    await this.fileSystem.WriteText(scriptPath, scripts);

    const validateScript = this.generateValidateScript(config);
    const validatePath = path.join(context.Dir, 'mj-db-validate.sql');
    await this.fileSystem.WriteText(validatePath, validateScript);

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `SQL scripts saved to:\n  - ${scriptPath}\n  - ${validatePath}`,
    });

    // Step 2: Prompt user to execute the script
    if (!context.Yes) {
      await this.promptForScriptExecution(emitter, scriptPath);
    } else {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'database',
        Message: 'Non-interactive mode: skipping SQL script execution prompt. Run mj-db-setup.sql manually if needed.',
      });
    }

    // Step 3: Validate connectivity
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Validating database connectivity...',
    });

    const host = config.DatabaseHost ?? 'localhost';
    const port = config.DatabasePort ?? 1433;
    const connectivity = await this.sqlAdapter.CheckConnectivity(host, port);

    if (!connectivity.Reachable) {
      throw new InstallerError(
        'database',
        'DB_UNREACHABLE',
        `Cannot connect to SQL Server at ${host}:${port}. ${connectivity.ErrorMessage ?? ''}`,
        `Ensure SQL Server is running and accessible. Then run the setup script: ${scriptPath}`
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Database connectivity verified at ${host}:${port} (${connectivity.LatencyMs}ms)`,
    });

    return {
      ScriptsGenerated: [scriptPath, validatePath],
      ValidationPassed: true,
    };
  }

  // ---------------------------------------------------------------------------
  // SQL script generation
  // ---------------------------------------------------------------------------

  private generateSetupScript(config: PartialInstallConfig): string {
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const codeGenUser = config.CodeGenUser ?? 'MJ_CodeGen';
    const codeGenPassword = config.CodeGenPassword ?? 'CHANGE_ME';
    const apiUser = config.APIUser ?? 'MJ_Connect';
    const apiPassword = config.APIPassword ?? 'CHANGE_ME';

    return `-- MemberJunction Database Setup Script
-- Generated by MJ Installer
-- This script is idempotent (safe to run multiple times)
--
-- Run this script as a sysadmin against your SQL Server instance.
-- It creates the database, logins, users, and role grants.

--============================================================================
-- 1. Create database (if not exists)
--============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = '${dbName}')
BEGIN
    CREATE DATABASE [${dbName}];
    PRINT 'Created database: ${dbName}';
END
ELSE
    PRINT 'Database already exists: ${dbName}';
GO

USE [${dbName}];
GO

--============================================================================
-- 2. Create __mj schema (if not exists)
--============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj')
BEGIN
    EXEC('CREATE SCHEMA [__mj]');
    PRINT 'Created schema: __mj';
END
GO

--============================================================================
-- 3. Create logins (server-level)
--============================================================================
USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '${codeGenUser}')
BEGIN
    CREATE LOGIN [${codeGenUser}] WITH PASSWORD = '${codeGenPassword}';
    PRINT 'Created login: ${codeGenUser}';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '${apiUser}')
BEGIN
    CREATE LOGIN [${apiUser}] WITH PASSWORD = '${apiPassword}';
    PRINT 'Created login: ${apiUser}';
END
GO

--============================================================================
-- 4. Create database users
--============================================================================
USE [${dbName}];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${codeGenUser}')
BEGIN
    CREATE USER [${codeGenUser}] FOR LOGIN [${codeGenUser}];
    PRINT 'Created user: ${codeGenUser}';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${apiUser}')
BEGIN
    CREATE USER [${apiUser}] FOR LOGIN [${apiUser}];
    PRINT 'Created user: ${apiUser}';
END
GO

--============================================================================
-- 5. Grant roles
--============================================================================
-- CodeGen needs elevated permissions for schema modifications
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'db_owner' AND mp.name = '${codeGenUser}')
BEGIN
    ALTER ROLE db_owner ADD MEMBER [${codeGenUser}];
    PRINT 'Granted db_owner to ${codeGenUser}';
END
GO

-- API user needs read/write + execute
IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'db_datareader' AND mp.name = '${apiUser}')
BEGIN
    ALTER ROLE db_datareader ADD MEMBER [${apiUser}];
    PRINT 'Granted db_datareader to ${apiUser}';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = 'db_datawriter' AND mp.name = '${apiUser}')
BEGIN
    ALTER ROLE db_datawriter ADD MEMBER [${apiUser}];
    PRINT 'Granted db_datawriter to ${apiUser}';
END
GO

GRANT EXECUTE TO [${apiUser}];
GO

PRINT '';
PRINT '=== MemberJunction database setup complete ===';
PRINT 'Database: ${dbName}';
PRINT 'CodeGen user: ${codeGenUser}';
PRINT 'API user: ${apiUser}';
`;
  }

  private generateValidateScript(config: PartialInstallConfig): string {
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const codeGenUser = config.CodeGenUser ?? 'MJ_CodeGen';
    const apiUser = config.APIUser ?? 'MJ_Connect';

    return `-- MemberJunction Database Validation Script
-- Generated by MJ Installer
-- Run this to verify the database setup is correct.

USE [${dbName}];
GO

PRINT 'Checking database: ${dbName}';
PRINT '';

-- Check __mj schema
IF EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj')
    PRINT '[PASS] __mj schema exists';
ELSE
    PRINT '[FAIL] __mj schema NOT found';

-- Check users
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${codeGenUser}')
    PRINT '[PASS] User ${codeGenUser} exists';
ELSE
    PRINT '[FAIL] User ${codeGenUser} NOT found';

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${apiUser}')
    PRINT '[PASS] User ${apiUser} exists';
ELSE
    PRINT '[FAIL] User ${apiUser} NOT found';

PRINT '';
PRINT '=== Validation complete ===';
`;
  }

  // ---------------------------------------------------------------------------
  // Prompt helper
  // ---------------------------------------------------------------------------

  private async promptForScriptExecution(
    emitter: InstallerEventEmitter,
    scriptPath: string
  ): Promise<void> {
    await new Promise<string>((resolve) => {
      emitter.Emit('prompt', {
        Type: 'prompt',
        PromptId: 'run-db-script',
        PromptType: 'confirm',
        Message: `Please run "${scriptPath}" in SSMS or Azure Data Studio, then confirm to continue.`,
        Default: 'yes',
        Resolve: resolve,
      });
    });
  }
}
