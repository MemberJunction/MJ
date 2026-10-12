/**
 * Phase C — Database Provisioning
 *
 * Makes sure the database exists and the CodeGen and API logins can use it, so
 * the migrate phase that follows has somewhere to run.
 *
 * Supports both SQL Server and PostgreSQL.
 *
 * @module phases/DatabaseProvisionPhase
 * @see SqlServerAdapter — SQL Server TCP check, sign-in check, and script execution.
 * @see PostgresAdapter — PostgreSQL connectivity check, login verification, and script execution.
 * @see ConfigurePhase — provides the database credentials used in script generation.
 */

import path from 'node:path';
import type { InstallerEventEmitter, PromptEvent } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { SqlServerAdapter, SqlBatchError, type SqlLoginTarget } from '../adapters/SqlServerAdapter.js';
import { PostgresAdapter } from '../adapters/PostgresAdapter.js';

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
  /**
   * Non-interactive mode. Nothing is asked: the database is set up automatically
   * when administrator credentials are configured, and the phase fails with
   * instructions when it is not set up and none are.
   */
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
  /**
   * Whether both logins were confirmed able to sign in to the database. `false`
   * only when the check itself could not run (for example a TLS error), in which
   * case the migrate phase is the first real test.
   */
  ValidationPassed: boolean;
  /** Whether this run executed `mj-db-setup.sql`. */
  SetupScriptExecuted: boolean;
}

/** Outcome of signing in as the CodeGen and API logins. */
type ProvisionCheck =
  | { Status: 'ready' }
  | { Status: 'not-set-up'; Detail: string }
  | { Status: 'unknown'; Detail: string };

/** An administrator login supplied for running the setup script. */
interface AdminCredentials {
  User: string;
  Password: string;
}

/** How many times an interactive install asks again after the administrator login is refused. */
const ADMIN_LOGIN_ATTEMPTS = 3;

/**
 * Wrap a name as a T-SQL identifier, doubling any `]` so that no database or
 * login name can break out of the brackets.
 */
export function QuoteSqlIdentifier(name: string): string {
  return `[${name.replace(/]/g, ']]')}]`;
}

/**
 * Escape text for use inside a T-SQL `'...'` literal by doubling `'`. The
 * caller supplies the surrounding quotes.
 */
export function EscapeSqlString(text: string): string {
  return text.replace(/'/g, "''");
}

/**
 * Split a script into batches on lines that contain only `GO`, the way SSMS
 * and `sqlcmd` do. Batches with nothing but comments and blank lines are dropped.
 */
export function SplitSqlBatches(script: string): string[] {
  return script
    .split(/^[ \t]*GO[ \t]*$/im)
    .map((batch) => batch.trim())
    .filter((batch) => batch.split(/\r?\n/).some((line) => line.trim() !== '' && !line.trim().startsWith('--')));
}

/**
 * Quote a PostgreSQL identifier by wrapping in double quotes and doubling any
 * inner double quotes.
 */
export function QuotePgIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Escape text for use inside a PostgreSQL `'...'` literal by doubling `'`.
 */
export function EscapePgString(text: string): string {
  return text.replace(/'/g, "''");
}

/**
 * SQL Server script generation for database provisioning.
 */
class SqlServerScriptGenerator {
  /**
   * Returns true when `userName` is a SQL Server built-in sysadmin principal that
   * cannot be the target of `CREATE LOGIN` / `CREATE USER` / role-grant statements.
   */
  private isBuiltInSysadmin(userName: string): boolean {
    return userName.trim().toLowerCase() === 'sa';
  }

  /** SQL for the server-level CREATE LOGIN block, or a skip-comment for `sa`. */
  private loginBlock(user: string, password: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping CREATE LOGIN [${user}] — sa is a built-in sysadmin and already exists in every SQL Server instance.
PRINT 'Skipped CREATE LOGIN: ${EscapeSqlString(user)} (built-in sysadmin)';
GO`;
    }
    return `IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = '${EscapeSqlString(user)}')
BEGIN
    CREATE LOGIN ${QuoteSqlIdentifier(user)} WITH PASSWORD = N'${EscapeSqlString(password)}';
    PRINT 'Created login: ${EscapeSqlString(user)}';
END
GO`;
  }

  /** SQL for the database-level CREATE USER block, or a skip-comment for `sa`. */
  private userBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping CREATE USER [${user}] — SQL Server rejects \`CREATE USER FOR LOGIN [sa]\` with Msg 15405 (special principal).
-- sa already has implicit sysadmin permissions in every database; no user-mapping is required.
PRINT 'Skipped CREATE USER: ${EscapeSqlString(user)} (built-in sysadmin)';
GO`;
    }
    return `IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${EscapeSqlString(user)}')
BEGIN
    CREATE USER ${QuoteSqlIdentifier(user)} FOR LOGIN ${QuoteSqlIdentifier(user)};
    PRINT 'Created user: ${EscapeSqlString(user)}';
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
    WHERE rp.name = '${role}' AND mp.name = '${EscapeSqlString(user)}')
BEGIN
    ALTER ROLE ${role} ADD MEMBER ${QuoteSqlIdentifier(user)};
    PRINT 'Granted ${role} to ${EscapeSqlString(user)}';
END
GO`;
  }

  /** SQL for a `GRANT EXECUTE TO [user]` block, or a skip-comment for `sa`. */
  private grantExecuteBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `-- Skipping GRANT EXECUTE TO [${user}] — sa is sysadmin and has EXECUTE permission implicitly.
GO`;
    }
    return `GRANT EXECUTE TO ${QuoteSqlIdentifier(user)};
GO`;
  }

  /** SQL asserting that `user` exists in the database. */
  private validateUserBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `PRINT '[PASS] User ${EscapeSqlString(user)} is a built-in sysadmin (maps to dbo; no database principal expected)';`;
    }
    return `IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${EscapeSqlString(user)}')
    PRINT '[PASS] User ${EscapeSqlString(user)} exists';
ELSE
    PRINT '[FAIL] User ${EscapeSqlString(user)} NOT found';`;
  }

  GenerateSetupScript(config: PartialInstallConfig): string {
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
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = '${EscapeSqlString(dbName)}')
BEGIN
    CREATE DATABASE ${QuoteSqlIdentifier(dbName)};
    PRINT 'Created database: ${EscapeSqlString(dbName)}';
END
ELSE
    PRINT 'Database already exists: ${EscapeSqlString(dbName)}';
GO

USE ${QuoteSqlIdentifier(dbName)};
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
USE ${QuoteSqlIdentifier(dbName)};
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
PRINT 'Database: ${EscapeSqlString(dbName)}';
PRINT 'CodeGen user: ${EscapeSqlString(codeGenUser)}';
PRINT 'API user: ${EscapeSqlString(apiUser)}';
`;
  }

  GenerateValidateScript(config: PartialInstallConfig): string {
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const codeGenUser = config.CodeGenUser ?? 'MJ_CodeGen';
    const apiUser = config.APIUser ?? 'MJ_Connect';

    return `-- MemberJunction Database Validation Script
-- Generated by MJ Installer
-- Run this to verify the database setup is correct.

USE ${QuoteSqlIdentifier(dbName)};
GO

PRINT 'Checking database: ${EscapeSqlString(dbName)}';
PRINT '';

-- Check __mj schema
IF EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj')
    PRINT '[PASS] __mj schema exists';
ELSE
    PRINT '[FAIL] __mj schema NOT found';

-- Check users
${this.validateUserBlock(codeGenUser)}

${this.validateUserBlock(apiUser)}

PRINT '';
PRINT '=== Validation complete ===';
`;
  }
}

/**
 * PostgreSQL script generation for database provisioning.
 */
class PostgreSQLScriptGenerator {
  GenerateSetupScript(config: PartialInstallConfig): string {
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const codeGenUser = config.CodeGenUser ?? 'mj_codegen';
    const codeGenPassword = config.CodeGenPassword ?? 'CHANGE_ME';
    const apiUser = config.APIUser ?? 'mj_connect';
    const apiPassword = config.APIPassword ?? 'CHANGE_ME';

    return `-- MemberJunction Database Setup Script (PostgreSQL)
-- Generated by MJ Installer
-- This script is idempotent (safe to run multiple times)
--
-- Run this script as the 'postgres' superuser:
--   psql -h localhost -U postgres -f mj-db-setup.sql
--
-- Note: The database creation must happen outside a transaction/DO block,
-- so you must run this script using psql, not via a prepared statement.

-- ============================================================================
-- This script assumes it is being run via psql (not within a DO block).
-- It will execute the following as separate commands:
-- ============================================================================

-- Step 1: Create database if not exists
-- (This must be run outside a transaction, so psql must execute it directly)

-- Step 2: Create extensions and roles in the target database
-- (This uses a DO block since it needs transaction context)

-- Step 3: Create schema and grant privileges
-- (This also uses a DO block)

DO \\$\\$
DECLARE
    v_db_exists boolean;
    v_role_exists boolean;
BEGIN
    -- Check if database exists
    SELECT EXISTS(
        SELECT 1 FROM pg_database WHERE datname = '${EscapePgString(dbName)}'
    ) INTO v_db_exists;

    IF NOT v_db_exists THEN
        RAISE NOTICE 'Creating database: ${EscapePgString(dbName)}';
        EXECUTE 'CREATE DATABASE ${QuotePgIdentifier(dbName)}';
    ELSE
        RAISE NOTICE 'Database already exists: ${EscapePgString(dbName)}';
    END IF;
END \\$\\$;

-- Connect to the target database for the remaining setup
\\c ${QuotePgIdentifier(dbName)}

-- Create extensions if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create roles (logins) if not present
DO \\$\\$
BEGIN
    -- Create CodeGen role if it doesn't exist
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = '${EscapePgString(codeGenUser)}') THEN
        RAISE NOTICE 'Creating role: ${EscapePgString(codeGenUser)}';
        EXECUTE 'CREATE USER ${QuotePgIdentifier(codeGenUser)} WITH PASSWORD ' || quote_literal('${EscapePgString(codeGenPassword)}') || ' LOGIN';
    ELSE
        RAISE NOTICE 'Role already exists: ${EscapePgString(codeGenUser)}';
    END IF;

    -- Create API role if it doesn't exist
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = '${EscapePgString(apiUser)}') THEN
        RAISE NOTICE 'Creating role: ${EscapePgString(apiUser)}';
        EXECUTE 'CREATE USER ${QuotePgIdentifier(apiUser)} WITH PASSWORD ' || quote_literal('${EscapePgString(apiPassword)}') || ' LOGIN';
    ELSE
        RAISE NOTICE 'Role already exists: ${EscapePgString(apiUser)}';
    END IF;
END \\$\\$;

-- Create schema if not present
CREATE SCHEMA IF NOT EXISTS __mj;

-- Grant ownership to CodeGen role
ALTER SCHEMA __mj OWNER TO ${QuotePgIdentifier(codeGenUser)};

-- Grant privileges on schema to API role
GRANT USAGE ON SCHEMA __mj TO ${QuotePgIdentifier(apiUser)};
GRANT USAGE ON SCHEMA public TO ${QuotePgIdentifier(apiUser)};

-- Grant privileges on existing and future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA __mj TO ${QuotePgIdentifier(apiUser)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${QuotePgIdentifier(apiUser)};

-- Grant privileges on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA __mj TO ${QuotePgIdentifier(apiUser)};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${QuotePgIdentifier(apiUser)};

-- Grant privileges on functions/procedures
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA __mj TO ${QuotePgIdentifier(apiUser)};
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${QuotePgIdentifier(apiUser)};
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA __mj TO ${QuotePgIdentifier(apiUser)};
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO ${QuotePgIdentifier(apiUser)};

-- Set default privileges for future objects (CodeGen creates these)
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA __mj
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA __mj
  GRANT USAGE, SELECT ON SEQUENCES TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA __mj
  GRANT EXECUTE ON FUNCTIONS TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA __mj
  GRANT EXECUTE ON PROCEDURES TO ${QuotePgIdentifier(apiUser)};
ALTER DEFAULT PRIVILEGES FOR USER ${QuotePgIdentifier(codeGenUser)} IN SCHEMA public
  GRANT EXECUTE ON PROCEDURES TO ${QuotePgIdentifier(apiUser)};

-- CodeGen role needs elevated permissions
ALTER ROLE ${QuotePgIdentifier(codeGenUser)} CREATEDB CREATEROLE;
GRANT ALL PRIVILEGES ON DATABASE ${QuotePgIdentifier(dbName)} TO ${QuotePgIdentifier(codeGenUser)};
GRANT ALL PRIVILEGES ON SCHEMA __mj TO ${QuotePgIdentifier(codeGenUser)};
GRANT ALL PRIVILEGES ON SCHEMA public TO ${QuotePgIdentifier(codeGenUser)};
ALTER DEFAULT PRIVILEGES IN SCHEMA __mj GRANT ALL ON TABLES TO ${QuotePgIdentifier(codeGenUser)};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${QuotePgIdentifier(codeGenUser)};

-- Final message
SELECT 'MemberJunction database setup complete' as "Status";
`;
  }

  GenerateValidateScript(config: PartialInstallConfig): string {
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const codeGenUser = config.CodeGenUser ?? 'mj_codegen';
    const apiUser = config.APIUser ?? 'mj_connect';

    return `-- MemberJunction Database Validation Script (PostgreSQL)
-- Generated by MJ Installer
-- Run this to verify the database setup is correct.
--
-- psql -h localhost -U postgres -d ${QuotePgIdentifier(dbName)} -f mj-db-validate.sql

DO \\$\\$
BEGIN
    RAISE NOTICE 'Checking database: ${EscapePgString(dbName)}';
    RAISE NOTICE '';

    -- Check __mj schema
    IF EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '__mj') THEN
        RAISE NOTICE '[PASS] __mj schema exists';
    ELSE
        RAISE NOTICE '[FAIL] __mj schema NOT found';
    END IF;

    -- Check CodeGen role
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = '${EscapePgString(codeGenUser)}') THEN
        RAISE NOTICE '[PASS] CodeGen role exists: ${EscapePgString(codeGenUser)}';
    ELSE
        RAISE NOTICE '[FAIL] CodeGen role NOT found: ${EscapePgString(codeGenUser)}';
    END IF;

    -- Check API role
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = '${EscapePgString(apiUser)}') THEN
        RAISE NOTICE '[PASS] API role exists: ${EscapePgString(apiUser)}';
    ELSE
        RAISE NOTICE '[FAIL] API role NOT found: ${EscapePgString(apiUser)}';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '=== Validation complete ===';
END \\$\\$;
`;
  }
}

/**
 * Phase C — Generates SQL provisioning scripts and validates database connectivity.
 *
 * @example
 * ```typescript
 * const dbPhase = new DatabaseProvisionPhase();
 * const result = await dbPhase.Run({
 *   Dir: '/path/to/install',
 *   Config: { DatabasePlatform: 'postgresql', DatabaseHost: 'localhost', DatabasePort: 5432, DatabaseName: 'MJ' },
 *   Yes: false,
 *   Emitter: emitter,
 * });
 * console.log(`Scripts: ${result.ScriptsGenerated.join(', ')}`);
 * ```
 */
export class DatabaseProvisionPhase {
  private fileSystem = new FileSystemAdapter();
  private sqlAdapter = new SqlServerAdapter();
  private pgAdapter = new PostgresAdapter();

  /**
   * Execute the database provisioning phase: generate the scripts, make sure
   * the database server is reachable, and set the database up if it is not already.
   *
   * @param context - Database provision input with directory, config, mode, and emitter.
   * @returns Script paths, whether setup was confirmed, and whether the script ran.
   * @throws {InstallerError} `DB_UNREACHABLE` when the database server cannot be reached;
   *   `DB_NOT_SET_UP` when the database is not set up and no administrator login
   *   was given (or the user chose to run the script and it still is not);
   *   `DB_ADMIN_LOGIN_FAILED` when the administrator login is refused;
   *   `DB_SETUP_FAILED` when the setup script fails or leaves a login unable to sign in.
   */
  async Run(context: DatabaseProvisionContext): Promise<DatabaseProvisionResult> {
    const { Config: config, Emitter: emitter } = context;
    const platform = config.DatabasePlatform ?? 'sqlserver';

    // Step 1: Generate SQL scripts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Generating database setup scripts...',
    });

    const [setupScript, validateScript] = this.generateScripts(platform, config);
    const scriptPath = path.join(context.Dir, 'mj-db-setup.sql');
    const validatePath = path.join(context.Dir, 'mj-db-validate.sql');
    await this.fileSystem.WriteText(scriptPath, setupScript);
    await this.fileSystem.WriteText(validatePath, validateScript);
    const scriptsGenerated = [scriptPath, validatePath];

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `SQL scripts saved to:\n  - ${scriptPath}\n  - ${validatePath}`,
    });

    // Step 2: Check connectivity to the database server
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Validating database connectivity...',
    });

    const envValues = await this.readEnvDbTarget(context.Dir);
    const host = envValues?.host ?? config.DatabaseHost ?? 'localhost';
    const defaultPort = platform === 'postgresql' ? 5432 : 1433;
    const port = envValues?.port ?? config.DatabasePort ?? defaultPort;

    const connectivity = platform === 'postgresql'
      ? await this.pgAdapter.CheckConnectivity(host, port)
      : await this.sqlAdapter.CheckConnectivity(host, port);

    if (!connectivity.Reachable) {
      const dbType = platform === 'postgresql' ? 'PostgreSQL' : 'SQL Server';
      throw new InstallerError(
        'database',
        'DB_UNREACHABLE',
        `Cannot connect to ${dbType} at ${host}:${port}. ${connectivity.ErrorMessage ?? ''}`,
        `Ensure ${dbType} is running and reachable from this machine, then run the install again.`
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `Database server reachable at ${host}:${port} (${connectivity.LatencyMs}ms).`,
    });

    // Step 3: Is the database already set up?
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const before = await this.checkProvisioned(platform, host, port, config);

    if (before.Status === 'ready') {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Database "${dbName}" is already set up; both logins can connect.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: true, SetupScriptExecuted: false };
    }

    if (before.Status === 'unknown') {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'database',
        Message: `Could not check whether database "${dbName}" is set up: ${before.Detail}. Continuing; if it is not set up, run ${scriptPath} as a database administrator.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: false, SetupScriptExecuted: false };
    }

    // Step 4: Set it up — automatically with administrator credentials, or by hand.
    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `Database "${dbName}" is not set up yet: ${before.Detail}.`,
    });

    const admin = await this.resolveAdminCredentials(context, platform, host, port, dbName, scriptPath);
    if (admin) {
      await this.runSetupScript(platform, host, port, admin, setupScript, scriptPath, emitter);
    } else if (context.Yes) {
      const dbType = platform === 'postgresql' ? 'PostgreSQL' : 'SQL Server';
      throw new InstallerError(
        'database',
        'DB_NOT_SET_UP',
        `Database "${dbName}" is not set up: ${before.Detail}.`,
        `Set MJ_INSTALL_DB_ADMIN_USER and MJ_INSTALL_DB_ADMIN_PASSWORD to a login that can create databases (such as 'postgres' for PostgreSQL or 'sa' for SQL Server) and the installer will set it up, or run ${scriptPath} as a ${dbType} administrator. Then run the install again.`
      );
    } else {
      await this.promptForScriptExecution(emitter, scriptPath);
    }

    // Step 5: Confirm both logins now work.
    const after = await this.checkProvisioned(platform, host, port, config);
    if (after.Status === 'ready') {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Database "${dbName}" is set up; both logins can connect.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: true, SetupScriptExecuted: admin !== null };
    }

    if (after.Status === 'unknown') {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'database',
        Message: `Could not confirm the database setup: ${after.Detail}. Continuing.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: false, SetupScriptExecuted: admin !== null };
    }

    throw new InstallerError(
      'database',
      admin ? 'DB_SETUP_FAILED' : 'DB_NOT_SET_UP',
      `Database "${dbName}" is still not usable after setup: ${after.Detail}.`,
      `Check the output of ${scriptPath}, then run the install again.`
    );
  }

  // ---------------------------------------------------------------------------
  // Platform-specific helpers
  // ---------------------------------------------------------------------------

  private generateScripts(platform: string, config: PartialInstallConfig): [string, string] {
    if (platform === 'postgresql') {
      const gen = new PostgreSQLScriptGenerator();
      return [gen.GenerateSetupScript(config), gen.GenerateValidateScript(config)];
    }
    const gen = new SqlServerScriptGenerator();
    return [gen.GenerateSetupScript(config), gen.GenerateValidateScript(config)];
  }

  // ---------------------------------------------------------------------------
  // Setup check and execution
  // ---------------------------------------------------------------------------

  /**
   * Try to connect as both the CodeGen and API logins to verify provisioning.
   */
  private async checkProvisioned(
    platform: string,
    host: string,
    port: number,
    config: PartialInstallConfig
  ): Promise<ProvisionCheck> {
    const database = config.DatabaseName ?? 'MemberJunction';
    const logins = [
      { Role: 'CodeGen', User: config.CodeGenUser ?? (platform === 'postgresql' ? 'mj_codegen' : 'MJ_CodeGen'), Password: config.CodeGenPassword ?? '' },
      { Role: 'API', User: config.APIUser ?? (platform === 'postgresql' ? 'mj_connect' : 'MJ_Connect'), Password: config.APIPassword ?? '' },
    ];

    for (const login of logins) {
      if (platform === 'postgresql') {
        const result = await this.pgAdapter.TryLogin(host, port, login.User, login.Password, database);
        if (result.Success) continue;
        if (result.IsLoginRejected || result.IsDatabaseMissing) {
          const detail = `the ${login.Role} login "${login.User}" cannot connect to database "${database}"`;
          return { Status: 'not-set-up', Detail: detail };
        }
        const detail = `the ${login.Role} login "${login.User}" failed to connect (${result.ErrorMessage ?? 'unknown error'})`;
        return { Status: 'unknown', Detail: detail };
      } else {
        const result = await this.sqlAdapter.TryLogin({
          Host: host,
          Port: port,
          TrustServerCertificate: config.DatabaseTrustCert ?? false,
          Database: database,
          User: login.User,
          Password: login.Password,
        });
        if (result.Ok) continue;
        const detail = `the ${login.Role} login "${login.User}" cannot sign in to "${database}" (${result.ErrorMessage ?? 'no detail'})`;
        return result.LoginRejected ? { Status: 'not-set-up', Detail: detail } : { Status: 'unknown', Detail: detail };
      }
    }
    return { Status: 'ready' };
  }

  /**
   * Find administrator credentials to run the setup script with.
   */
  private async resolveAdminCredentials(
    context: DatabaseProvisionContext,
    platform: string,
    host: string,
    port: number,
    dbName: string,
    scriptPath: string
  ): Promise<AdminCredentials | null> {
    const { Config: config, Emitter: emitter } = context;

    if (config.DatabaseAdminUser && config.DatabaseAdminPassword !== undefined) {
      const configured = { User: config.DatabaseAdminUser, Password: config.DatabaseAdminPassword };
      if (platform === 'postgresql') {
        const result = await this.pgAdapter.TryLogin(host, port, configured.User, configured.Password, 'postgres');
        if (result.Success) return configured;
        throw new InstallerError(
          'database',
          'DB_ADMIN_LOGIN_FAILED',
          `The administrator login "${configured.User}" could not sign in: ${result.ErrorMessage ?? 'no detail'}.`,
          `Check DatabaseAdminUser / DatabaseAdminPassword (or MJ_INSTALL_DB_ADMIN_USER / MJ_INSTALL_DB_ADMIN_PASSWORD), or run ${scriptPath} as a database administrator.`
        );
      } else {
        const result = await this.sqlAdapter.TryLogin({
          Host: host,
          Port: port,
          TrustServerCertificate: config.DatabaseTrustCert ?? false,
          Database: 'master',
          User: configured.User,
          Password: configured.Password,
        });
        if (result.Ok) return configured;
        throw new InstallerError(
          'database',
          'DB_ADMIN_LOGIN_FAILED',
          `The administrator login "${configured.User}" could not sign in: ${result.ErrorMessage ?? 'no detail'}.`,
          `Check DatabaseAdminUser / DatabaseAdminPassword (or MJ_INSTALL_DB_ADMIN_USER / MJ_INSTALL_DB_ADMIN_PASSWORD), or run ${scriptPath} as a SQL administrator.`
        );
      }
    }

    if (context.Yes) return null;

    const dbType = platform === 'postgresql' ? 'PostgreSQL' : 'SQL Server';
    const defaultAdmin = platform === 'postgresql' ? 'postgres' : 'sa';

    const method = await this.prompt(emitter, {
      PromptId: 'db-setup-method',
      PromptType: 'select',
      Message: `Database "${dbName}" is not set up yet. How should it be set up?`,
      Choices: [
        { Label: `Set it up now (you will be asked for a ${dbType} admin login such as ${defaultAdmin})`, Value: 'auto' },
        { Label: `I'll run ${path.basename(scriptPath)} myself`, Value: 'manual' },
      ],
      Default: 'auto',
    });
    if (method !== 'auto') return null;

    for (let attempt = 1; attempt <= ADMIN_LOGIN_ATTEMPTS; attempt++) {
      const user = await this.prompt(emitter, {
        PromptId: 'db-admin-user',
        PromptType: 'input',
        Message: `${dbType} admin login (needs rights to create databases and users):`,
        Default: config.DatabaseAdminUser ?? defaultAdmin,
      });
      const password = await this.prompt(emitter, {
        PromptId: 'db-admin-password',
        PromptType: 'password',
        Message: `Password for ${user}:`,
      });

      if (platform === 'postgresql') {
        const result = await this.pgAdapter.TryLogin(host, port, user, password, 'postgres');
        if (result.Success) return { User: user, Password: password };
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'database',
          Message: `"${user}" could not sign in: ${result.ErrorMessage ?? 'no detail'}`,
        });
      } else {
        const result = await this.sqlAdapter.TryLogin({
          Host: host,
          Port: port,
          TrustServerCertificate: config.DatabaseTrustCert ?? false,
          Database: 'master',
          User: user,
          Password: password,
        });
        if (result.Ok) return { User: user, Password: password };
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'database',
          Message: `"${user}" could not sign in: ${result.ErrorMessage ?? 'no detail'}`,
        });
      }
    }

    throw new InstallerError(
      'database',
      'DB_ADMIN_LOGIN_FAILED',
      `No administrator login could sign in after ${ADMIN_LOGIN_ATTEMPTS} attempts.`,
      `Run ${scriptPath} as a ${dbType} administrator, then run the install again.`
    );
  }

  /** Run the setup script. */
  private async runSetupScript(
    platform: string,
    host: string,
    port: number,
    admin: AdminCredentials,
    setupScript: string,
    scriptPath: string,
    emitter: InstallerEventEmitter
  ): Promise<void> {
    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Setting up the database as "${admin.User}" (running ${path.basename(scriptPath)})...`,
    });

    try {
      if (platform === 'postgresql') {
        const result = await this.pgAdapter.ExecuteScript(
          host,
          port,
          'postgres',
          admin.User,
          admin.Password,
          setupScript
        );
        if (!result.Success) {
          throw new Error(result.ErrorMessage ?? 'unknown error');
        }
      } else {
        await this.sqlAdapter.ExecuteBatches(
          {
            Host: host,
            Port: port,
            TrustServerCertificate: false,
            Database: 'master',
            User: admin.User,
            Password: admin.Password,
          },
          SplitSqlBatches(setupScript),
          (message) => emitter.Emit('log', { Type: 'log', Level: 'verbose', Message: `    ${message}` })
        );
      }
    } catch (err) {
      const where = err instanceof SqlBatchError ? ` (batch ${err.BatchNumber})` : '';
      throw new InstallerError(
        'database',
        'DB_SETUP_FAILED',
        `${path.basename(scriptPath)} failed${where}: ${err instanceof Error ? err.message : String(err)}`,
        `Make sure "${admin.User}" has the necessary privileges, or run ${scriptPath} yourself as a database administrator. Then run the install again.`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt helper
  // ---------------------------------------------------------------------------

  private async promptForScriptExecution(
    emitter: InstallerEventEmitter,
    scriptPath: string
  ): Promise<void> {
    await this.prompt(emitter, {
      PromptId: 'run-db-script',
      PromptType: 'confirm',
      Message: `Please run "${scriptPath}" as a database administrator, then confirm to continue.`,
      Default: 'yes',
    });
  }

  /** Emit a prompt event and wait for the frontend's answer. */
  private prompt(
    emitter: InstallerEventEmitter,
    prompt: Omit<PromptEvent, 'Type' | 'Resolve'>
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      emitter.Emit('prompt', { Type: 'prompt', ...prompt, Resolve: resolve });
    });
  }

  /**
   * Best-effort read of `<targetDir>/.env` to extract the database host/port.
   */
  private async readEnvDbTarget(targetDir: string): Promise<{ host?: string; port?: number } | null> {
    const envPath = path.join(targetDir, '.env');
    try {
      if (!(await this.fileSystem.FileExists(envPath))) return null;
      const raw = await this.fileSystem.ReadText(envPath);
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const host = this.parseDotenvValue(raw, 'PG_HOST') ?? this.parseDotenvValue(raw, 'DB_HOST');
      const portStr = this.parseDotenvValue(raw, 'PG_PORT') ?? this.parseDotenvValue(raw, 'DB_PORT');
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
   * Minimal dotenv-style key extractor.
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
