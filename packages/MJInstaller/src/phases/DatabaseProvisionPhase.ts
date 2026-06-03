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

    // Resolution order matches PreflightPhase.checkSqlConnectivity:
    //   1. .env in context.Dir (when present) — this is what the app will actually use.
    //   2. Explicit config.DatabaseHost / DatabasePort.
    //   3. Defaults (localhost:1433).
    const envValues = await this.readEnvDbTarget(context.Dir);
    const host = envValues?.host ?? config.DatabaseHost ?? 'localhost';
    const port = envValues?.port ?? config.DatabasePort ?? 1433;
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

  /**
   * Returns true when `userName` is a SQL Server built-in sysadmin principal that
   * cannot be the target of `CREATE LOGIN` / `CREATE USER` / role-grant statements.
   *
   * The only such principal we expect to see at this layer is `sa` — but case-
   * insensitive because SQL Server itself treats logins as case-insensitive by
   * default. Without this guard, an install that configures `sa` as the CodeGen
   * or API user (a common pattern in dev / Docker / single-user setups) produces
   * `Msg 15405, Cannot use the special principal 'sa'` errors throughout setup.
   * The database itself still gets created (step 1 succeeds before any sa-specific
   * statement runs), but the visible errors are confusing and the script reports
   * partial failure.
   */
  private isBuiltInSysadmin(userName: string): boolean {
    return userName.trim().toLowerCase() === 'sa';
  }

  /** SQL for the server-level CREATE LOGIN block, or a skip-comment for `sa`. */
  private loginBlock(user: string, password: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping CREATE LOGIN [${user}] — sa is a built-in sysadmin and already exists in every SQL Server instance.
PRINT 'Skipped CREATE LOGIN: ${user} (built-in sysadmin)';
GO`;
    }
    return `IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '${user}')
BEGIN
    CREATE LOGIN [${user}] WITH PASSWORD = '${password}';
    PRINT 'Created login: ${user}';
END
GO`;
  }

  /** SQL for the database-level CREATE USER block, or a skip-comment for `sa`. */
  private userBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping CREATE USER [${user}] — SQL Server rejects \`CREATE USER FOR LOGIN [sa]\` with Msg 15405 (special principal).
-- sa already has implicit sysadmin permissions in every database; no user-mapping is required.
PRINT 'Skipped CREATE USER: ${user} (built-in sysadmin)';
GO`;
    }
    return `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${user}')
BEGIN
    CREATE USER [${user}] FOR LOGIN [${user}];
    PRINT 'Created user: ${user}';
END
GO`;
  }

  /** SQL for an `ALTER ROLE <role> ADD MEMBER [user]` block, or a skip-comment for `sa`. */
  private roleGrantBlock(user: string, role: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping ALTER ROLE ${role} ADD MEMBER [${user}] — sa is sysadmin and has all permissions implicitly.
GO`;
    }
    return `IF NOT EXISTS (SELECT 1 FROM sys.database_role_members rm
    JOIN sys.database_principals rp ON rm.role_principal_id = rp.principal_id
    JOIN sys.database_principals mp ON rm.member_principal_id = mp.principal_id
    WHERE rp.name = '${role}' AND mp.name = '${user}')
BEGIN
    ALTER ROLE ${role} ADD MEMBER [${user}];
    PRINT 'Granted ${role} to ${user}';
END
GO`;
  }

  /** SQL for a `GRANT EXECUTE TO [user]` block, or a skip-comment for `sa`. */
  private grantExecuteBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping GRANT EXECUTE TO [${user}] — sa is sysadmin and has EXECUTE permission implicitly.
GO`;
    }
    return `GRANT EXECUTE TO [${user}];
GO`;
  }

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

${this.loginBlock(codeGenUser, codeGenPassword)}

${this.loginBlock(apiUser, apiPassword)}

--============================================================================
-- 4. Create database users
--============================================================================
USE [${dbName}];
GO

${this.userBlock(codeGenUser)}

${this.userBlock(apiUser)}

--============================================================================
-- 5. Grant roles
--============================================================================
-- CodeGen needs elevated permissions for schema modifications
${this.roleGrantBlock(codeGenUser, 'db_owner')}

-- API user needs read/write + execute
${this.roleGrantBlock(apiUser, 'db_datareader')}

${this.roleGrantBlock(apiUser, 'db_datawriter')}

${this.grantExecuteBlock(apiUser)}

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

  /**
   * Best-effort read of `<targetDir>/.env` to extract `DB_HOST` and `DB_PORT`.
   * Returns null when no `.env` exists or neither key is set, letting the
   * caller fall back to config / defaults. Errors are swallowed silently —
   * this is a diagnostic enhancement, not a hard requirement.
   *
   * Mirrors {@link PreflightPhase.readEnvDbTarget} — kept duplicated rather
   * than extracted because the two phases shouldn't be coupled through a
   * shared helper for a small piece of optional logic.
   */
  private async readEnvDbTarget(targetDir: string): Promise<{ host?: string; port?: number } | null> {
    const envPath = path.join(targetDir, '.env');
    try {
      if (!(await this.fileSystem.FileExists(envPath))) return null;
      const raw = await this.fileSystem.ReadText(envPath);
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const host = this.parseDotenvValue(raw, 'DB_HOST');
      const portStr = this.parseDotenvValue(raw, 'DB_PORT');
      const port = portStr ? parseInt(portStr, 10) : undefined;

      if (host || (port !== undefined && Number.isFinite(port))) {
        return { host: host ?? undefined, port: Number.isFinite(port) ? port : undefined };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Minimal dotenv-style key extractor — handles `KEY=value`, `KEY='value'`,
   * `KEY="value"`, ignores `#` comments and blank lines.
   */
  private parseDotenvValue(content: string, key: string): string | undefined {
    const lines = content.split(/\r?\n/);
    const pattern = new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`);
    for (const line of lines) {
      if (line.trim().startsWith('#')) continue;
      const match = line.match(pattern);
      if (!match) continue;
      let value = match[1];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value || undefined;
    }
    return undefined;
  }
}
