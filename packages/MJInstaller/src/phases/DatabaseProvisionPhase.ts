/**
 * Phase C — Database Provisioning
 *
 * Makes sure the database exists and the CodeGen and API logins can use it, so
 * the migrate phase that follows has somewhere to run.
 *
 * 1. Generates two idempotent scripts and saves them in the install folder:
 *    - **`mj-db-setup.sql`** — creates the database (if missing), the `__mj`
 *      schema, the SQL logins, the database users, and the role grants.
 *    - **`mj-db-validate.sql`** — checks that the schema and users exist.
 * 2. Checks that SQL Server is reachable.
 * 3. Signs in as the CodeGen and API logins. If both work, the database is
 *    already set up and nothing else happens.
 * 4. Otherwise it runs `mj-db-setup.sql` itself, signed in with an administrator
 *    login (`DatabaseAdminUser` / `DatabaseAdminPassword`, or
 *    `MJ_INSTALL_DB_ADMIN_USER` / `MJ_INSTALL_DB_ADMIN_PASSWORD`). Interactive
 *    installs ask for that login, and can still choose to run the script by hand.
 *    The administrator login is used only here and is never saved.
 * 5. Signs in as both logins again to confirm the setup worked.
 *
 * @module phases/DatabaseProvisionPhase
 * @see SqlServerAdapter — TCP check, sign-in check, and script execution.
 * @see ConfigurePhase — provides the database credentials used in script generation.
 */

import path from 'node:path';
import type { InstallerEventEmitter, PromptEvent } from '../events/InstallerEvents.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { SqlServerAdapter, SqlBatchError, type SqlLoginTarget } from '../adapters/SqlServerAdapter.js';

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
   * Execute the database provisioning phase: generate the scripts, make sure
   * SQL Server is reachable, and set the database up if it is not already.
   *
   * @param context - Database provision input with directory, config, mode, and emitter.
   * @returns Script paths, whether setup was confirmed, and whether the script ran.
   * @throws {InstallerError} `DB_UNREACHABLE` when SQL Server cannot be reached;
   *   `DB_NOT_SET_UP` when the database is not set up and no administrator login
   *   was given (or the user chose to run the script and it still is not);
   *   `DB_ADMIN_LOGIN_FAILED` when the administrator login is refused;
   *   `DB_SETUP_FAILED` when the setup script fails or leaves a login unable to sign in.
   */
  async Run(context: DatabaseProvisionContext): Promise<DatabaseProvisionResult> {
    const { Config: config, Emitter: emitter } = context;

    // Step 1: Generate SQL scripts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Generating database setup scripts...',
    });

    const setupScript = this.generateSetupScript(config);
    const scriptPath = path.join(context.Dir, 'mj-db-setup.sql');
    await this.fileSystem.WriteText(scriptPath, setupScript);

    const validateScript = this.generateValidateScript(config);
    const validatePath = path.join(context.Dir, 'mj-db-validate.sql');
    await this.fileSystem.WriteText(validatePath, validateScript);
    const scriptsGenerated = [scriptPath, validatePath];

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `SQL scripts saved to:\n  - ${scriptPath}\n  - ${validatePath}`,
    });

    // Step 2: Make sure SQL Server is reachable.
    // Resolution order matches PreflightPhase.checkSqlConnectivity:
    //   1. .env in context.Dir (when present) — this is what the app will actually use.
    //   2. Explicit config.DatabaseHost / DatabasePort.
    //   3. Defaults (localhost:1433).
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Validating database connectivity...',
    });

    const envValues = await this.readEnvDbTarget(context.Dir);
    const host = envValues?.host ?? config.DatabaseHost ?? 'localhost';
    const port = envValues?.port ?? config.DatabasePort ?? 1433;
    const connectivity = await this.sqlAdapter.CheckConnectivity(host, port);

    if (!connectivity.Reachable) {
      throw new InstallerError(
        'database',
        'DB_UNREACHABLE',
        `Cannot connect to SQL Server at ${host}:${port}. ${connectivity.ErrorMessage ?? ''}`,
        'Ensure SQL Server is running and reachable from this machine, then run the install again.'
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `SQL Server reachable at ${host}:${port} (${connectivity.LatencyMs}ms).`,
    });

    // Step 3: Is the database already set up?
    const server = { Host: host, Port: port, TrustServerCertificate: config.DatabaseTrustCert ?? false };
    const dbName = config.DatabaseName ?? 'MemberJunction';
    const before = await this.checkProvisioned(server, config);

    if (before.Status === 'ready') {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Database "${dbName}" is already set up; the CodeGen and API logins both sign in.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: true, SetupScriptExecuted: false };
    }

    if (before.Status === 'unknown') {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'database',
        Message: `Could not check whether database "${dbName}" is set up: ${before.Detail}. Continuing; if it is not set up, run ${scriptPath} as a SQL administrator.`,
      });
      return { ScriptsGenerated: scriptsGenerated, ValidationPassed: false, SetupScriptExecuted: false };
    }

    // Step 4: Set it up — automatically with an administrator login, or by hand.
    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `Database "${dbName}" is not set up yet: ${before.Detail}.`,
    });

    const admin = await this.resolveAdminCredentials(context, server, dbName, scriptPath);
    if (admin) {
      await this.runSetupScript(server, admin, setupScript, scriptPath, emitter);
    } else if (context.Yes) {
      throw new InstallerError(
        'database',
        'DB_NOT_SET_UP',
        `Database "${dbName}" is not set up: ${before.Detail}.`,
        `Set MJ_INSTALL_DB_ADMIN_USER and MJ_INSTALL_DB_ADMIN_PASSWORD to a SQL login that can create databases and logins (such as sa) and the installer will set it up, or run ${scriptPath} as a SQL administrator. Then run the install again.`
      );
    } else {
      await this.promptForScriptExecution(emitter, scriptPath);
    }

    // Step 5: Confirm both logins now work.
    const after = await this.checkProvisioned(server, config);
    if (after.Status === 'ready') {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Database "${dbName}" is set up; the CodeGen and API logins both sign in.`,
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
      `Check the output of ${scriptPath} (run it in SSMS or Azure Data Studio as a SQL administrator), then run the install again.`
    );
  }

  // ---------------------------------------------------------------------------
  // Setup check and execution
  // ---------------------------------------------------------------------------

  /**
   * Sign in to the target database as the CodeGen login and then the API login.
   * A login SQL Server refuses means setup has not run; any other failure means
   * the check could not tell.
   */
  private async checkProvisioned(
    server: Omit<SqlLoginTarget, 'Database' | 'User' | 'Password'>,
    config: PartialInstallConfig
  ): Promise<ProvisionCheck> {
    const database = config.DatabaseName ?? 'MemberJunction';
    const logins = [
      { Role: 'CodeGen', User: config.CodeGenUser ?? 'MJ_CodeGen', Password: config.CodeGenPassword ?? '' },
      { Role: 'API', User: config.APIUser ?? 'MJ_Connect', Password: config.APIPassword ?? '' },
    ];

    for (const login of logins) {
      const result = await this.sqlAdapter.TryLogin({ ...server, Database: database, User: login.User, Password: login.Password });
      if (result.Ok) continue;
      const detail = `the ${login.Role} login "${login.User}" cannot sign in to "${database}" (${result.ErrorMessage ?? 'no detail'})`;
      return result.LoginRejected ? { Status: 'not-set-up', Detail: detail } : { Status: 'unknown', Detail: detail };
    }
    return { Status: 'ready' };
  }

  /**
   * Find an administrator login to run the setup script with: from config or
   * `MJ_INSTALL_DB_ADMIN_*` first; otherwise, interactively, by asking. The login
   * is checked against `master` before it is used. Returns `null` when the user
   * chooses to run the script themselves, or when nothing is configured in
   * non-interactive mode.
   */
  private async resolveAdminCredentials(
    context: DatabaseProvisionContext,
    server: Omit<SqlLoginTarget, 'Database' | 'User' | 'Password'>,
    dbName: string,
    scriptPath: string
  ): Promise<AdminCredentials | null> {
    const { Config: config, Emitter: emitter } = context;

    if (config.DatabaseAdminUser && config.DatabaseAdminPassword !== undefined) {
      const configured = { User: config.DatabaseAdminUser, Password: config.DatabaseAdminPassword };
      const result = await this.sqlAdapter.TryLogin({ ...server, Database: 'master', ...configured });
      if (result.Ok) return configured;
      throw new InstallerError(
        'database',
        'DB_ADMIN_LOGIN_FAILED',
        `The administrator login "${configured.User}" could not sign in: ${result.ErrorMessage ?? 'no detail'}.`,
        `Check DatabaseAdminUser / DatabaseAdminPassword (or MJ_INSTALL_DB_ADMIN_USER / MJ_INSTALL_DB_ADMIN_PASSWORD), or run ${scriptPath} as a SQL administrator.`
      );
    }

    if (context.Yes) return null;

    const method = await this.prompt(emitter, {
      PromptId: 'db-setup-method',
      PromptType: 'select',
      Message: `Database "${dbName}" is not set up yet. How should it be set up?`,
      Choices: [
        { Label: 'Set it up now (you will be asked for a SQL admin login such as sa)', Value: 'auto' },
        { Label: `I'll run ${path.basename(scriptPath)} myself`, Value: 'manual' },
      ],
      Default: 'auto',
    });
    if (method !== 'auto') return null;

    for (let attempt = 1; attempt <= ADMIN_LOGIN_ATTEMPTS; attempt++) {
      const user = await this.prompt(emitter, {
        PromptId: 'db-admin-user',
        PromptType: 'input',
        Message: 'SQL admin login (needs rights to create databases and logins):',
        Default: config.DatabaseAdminUser ?? 'sa',
      });
      const password = await this.prompt(emitter, {
        PromptId: 'db-admin-password',
        PromptType: 'password',
        Message: `Password for ${user}:`,
      });
      const result = await this.sqlAdapter.TryLogin({ ...server, Database: 'master', User: user, Password: password });
      if (result.Ok) return { User: user, Password: password };
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'database',
        Message: `"${user}" could not sign in: ${result.ErrorMessage ?? 'no detail'}`,
      });
    }

    throw new InstallerError(
      'database',
      'DB_ADMIN_LOGIN_FAILED',
      `No administrator login could sign in after ${ADMIN_LOGIN_ATTEMPTS} attempts.`,
      `Run ${scriptPath} as a SQL administrator, then run the install again.`
    );
  }

  /** Run the setup script batch by batch as the administrator login. */
  private async runSetupScript(
    server: Omit<SqlLoginTarget, 'Database' | 'User' | 'Password'>,
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
      await this.sqlAdapter.ExecuteBatches(
        { ...server, Database: 'master', User: admin.User, Password: admin.Password },
        SplitSqlBatches(setupScript),
        (message) => emitter.Emit('log', { Type: 'log', Level: 'verbose', Message: `    ${message}` })
      );
    } catch (err) {
      const where = err instanceof SqlBatchError ? ` (batch ${err.BatchNumber})` : '';
      throw new InstallerError(
        'database',
        'DB_SETUP_FAILED',
        `${path.basename(scriptPath)} failed${where}: ${err instanceof Error ? err.message : String(err)}`,
        `Make sure "${admin.User}" can create databases and logins, or run ${scriptPath} yourself as a SQL administrator. Then run the install again.`
      );
    }
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

  /**
   * SQL asserting that `user` exists in the database, or a self-reporting
   * pass-comment for a built-in sysadmin.
   *
   * `sa` maps to `dbo` and never appears in `sys.database_principals`, so the
   * plain existence check reports `[FAIL] User sa NOT found` on a perfectly
   * correct setup. The setup emitter already skips sa-specific DDL for the same
   * reason (Msg 15405); validation has to agree with it.
   */
  private validateUserBlock(user: string): string {
    if (this.isBuiltInSysadmin(user)) {
      return `PRINT '[PASS] User ${EscapeSqlString(user)} is a built-in sysadmin (maps to dbo; no database principal expected)';`;
    }
    return `IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = '${EscapeSqlString(user)}')
    PRINT '[PASS] User ${EscapeSqlString(user)} exists';
ELSE
    PRINT '[FAIL] User ${EscapeSqlString(user)} NOT found';`;
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

  private generateValidateScript(config: PartialInstallConfig): string {
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
      Message: `Please run "${scriptPath}" in SSMS or Azure Data Studio as a SQL administrator, then confirm to continue.`,
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
   * Returns null when no `.env` exists or neither key is set, letting the
   * caller fall back to config / defaults. Errors are swallowed silently —
   * this is a diagnostic enhancement, not a hard requirement.
   *
   * Reads `PG_HOST` / `PG_PORT` first, then falls back to `DB_HOST` / `DB_PORT`
   * so a PostgreSQL install with PG-named env vars doesn't yield a stale
   * connectivity target. Matches codegen-lib's `DEFAULT_CODEGEN_CONFIG`
   * env-var precedence and {@link PreflightPhase.readEnvDbTarget}.
   *
   * Mirrors {@link PreflightPhase.readEnvDbTarget} — kept duplicated rather
   * than extracted because the two phases shouldn't be coupled through a
   * shared helper for a small piece of optional logic. Keep both copies in
   * sync when changing key precedence.
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
