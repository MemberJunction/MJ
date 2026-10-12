/**
 * Phase C — Database Provisioning
 *
 * Makes sure the database exists and the CodeGen and API logins can use it, so
 * the migrate phase that follows has somewhere to run. Works on SQL Server and
 * PostgreSQL (`DatabasePlatform`).
 *
 * 1. Generates two idempotent scripts and saves them in the install folder:
 *    - **`mj-db-setup.sql`** — creates the database (if missing), the `__mj`
 *      schema, the logins (PostgreSQL: login roles), and the grants. On
 *      SQL Server it is a `GO`-separated script; on PostgreSQL it is a `psql`
 *      script rendered from the same ordered statements the installer runs.
 *    - **`mj-db-validate.sql`** — checks that the schema and logins exist.
 * 2. Checks that the server is reachable (a TCP check; no credentials are sent).
 * 3. Signs in as the CodeGen and API logins. If both work, the database is
 *    already set up and nothing else happens.
 * 4. Otherwise it runs the setup itself, signed in with an administrator
 *    login (`DatabaseAdminUser` / `DatabaseAdminPassword`, or
 *    `MJ_INSTALL_DB_ADMIN_USER` / `MJ_INSTALL_DB_ADMIN_PASSWORD`). Interactive
 *    installs ask for that login, and can still choose to run the script by hand.
 *    The administrator login is used only here and is never saved.
 * 5. Signs in as both logins again to confirm the setup worked.
 *
 * @module phases/DatabaseProvisionPhase
 * @see SqlServerAdapter — SQL Server TCP check, sign-in check, and script execution.
 * @see PostgresAdapter — PostgreSQL TCP check, sign-in check, and step execution.
 * @see ConfigurePhase — provides the database credentials used in script generation.
 */

import path from 'node:path';
import type { InstallerEventEmitter, PromptEvent } from '../events/InstallerEvents.js';
import type { InstallConfig, PartialInstallConfig } from '../models/InstallConfig.js';
import { InstallerError } from '../errors/InstallerError.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import { SqlServerAdapter, SqlBatchError, type SqlLoginResult } from '../adapters/SqlServerAdapter.js';
import { PostgresAdapter, PgStepError, type PgSetupStep } from '../adapters/PostgresAdapter.js';

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

/** The database platforms this phase can set up. */
export type DatabasePlatform = InstallConfig['DatabasePlatform'];

/** The server to work against, resolved once per run. */
interface ServerTarget {
  Platform: DatabasePlatform;
  Host: string;
  Port: number;
  /** SQL Server only: accept a self-signed server certificate. */
  TrustServerCertificate: boolean;
}

/** Wording and defaults that differ between the two platforms. */
interface PlatformLabels {
  /** Product name used in messages. */
  Server: string;
  /** Port used when neither `.env` nor config gives one. */
  DefaultPort: number;
  /** Database the administrator login is checked against. */
  MaintenanceDatabase: string;
  /** Administrator login suggested by the interactive prompt. */
  DefaultAdminUser: string;
  /** "as <AdminArticle>" in instructions. */
  AdminArticle: string;
  /** What `MJ_INSTALL_DB_ADMIN_USER` must name. */
  AdminRequirement: string;
  /** "you will be asked for <AdminExample>". */
  AdminExample: string;
  /** Interactive prompt for the administrator login. */
  AdminPrompt: string;
  /** How to run the script by hand ("run it <ManualTool>"). */
  ManualTool: string;
}

const PLATFORM_LABELS: Readonly<Record<DatabasePlatform, PlatformLabels>> = {
  sqlserver: {
    Server: 'SQL Server',
    DefaultPort: 1433,
    MaintenanceDatabase: 'master',
    DefaultAdminUser: 'sa',
    AdminArticle: 'a SQL administrator',
    AdminRequirement: 'a SQL login that can create databases and logins (such as sa)',
    AdminExample: 'a SQL admin login such as sa',
    AdminPrompt: 'SQL admin login (needs rights to create databases and logins):',
    ManualTool: 'in SSMS or Azure Data Studio',
  },
  postgresql: {
    Server: 'PostgreSQL',
    DefaultPort: 5432,
    MaintenanceDatabase: 'postgres',
    DefaultAdminUser: 'postgres',
    AdminArticle: 'a PostgreSQL superuser',
    AdminRequirement: 'a PostgreSQL superuser (such as postgres)',
    AdminExample: 'a PostgreSQL superuser such as postgres',
    AdminPrompt: 'PostgreSQL admin role (a superuser, such as postgres):',
    ManualTool: 'with psql',
  },
};

/**
 * Wrap a name as a PostgreSQL identifier, doubling any `"` so that no database
 * or role name can break out of the quotes. Quoted names keep their case, which
 * matches how the `pg` driver passes the user and database names when connecting.
 */
export function QuotePgIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Wrap text as a PostgreSQL string literal, doubling any `'`. The setup runs
 * `SET standard_conforming_strings = on` first, so backslashes stay literal.
 */
export function QuotePgLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/**
 * Group roles that MJ's PostgreSQL migrations and CodeGen grant object
 * permissions to. The newest baselines `GRANT ... TO "cdp_*"` without creating
 * the roles (MJ's own CI creates them first, as a superuser), and older
 * baselines create them only when missing. Creating them here, as `NOLOGIN`
 * roles, means the CodeGen login never needs `CREATEROLE`.
 */
export const POSTGRES_MJ_GROUP_ROLES: readonly string[] = Object.freeze([
  'cdp_BI',
  'cdp_CodeGen',
  'cdp_Developer',
  'cdp_Integration',
  'cdp_UI',
]);

/** Extensions MJ's PostgreSQL migrations require (they run `CREATE EXTENSION IF NOT EXISTS`). */
export const POSTGRES_MJ_EXTENSIONS: readonly string[] = Object.freeze(['pgcrypto', 'uuid-ossp']);

/** The PostgreSQL maintenance database the setup connects to before the MJ database exists. */
const POSTGRES_MAINTENANCE_DB = 'postgres';

/**
 * Build the ordered PostgreSQL setup statements. The installer runs exactly
 * these (one statement per query, never a split script), and
 * {@link RenderPostgresSetupScript} writes the same list as a `psql` script.
 *
 * Privileges (least privilege; mirrors `db_owner` vs. read/write/execute on SQL Server):
 * - **CodeGen login** — `LOGIN` only (no `CREATEDB`, `CREATEROLE`, or superuser).
 *   Owns the `__mj` schema, so `mj migrate` and CodeGen can create, alter, and
 *   replace the tables, views, functions, and triggers in it and grant on them;
 *   `CONNECT, CREATE, TEMPORARY` on the database, because Skyway runs
 *   `CREATE SCHEMA IF NOT EXISTS` before migrating (PostgreSQL checks the
 *   database `CREATE` privilege even when the schema exists) and Open Apps add schemas.
 * - **API login** — `LOGIN` only. `CONNECT, TEMPORARY` on the database,
 *   `USAGE` on `__mj`, `SELECT/INSERT/UPDATE/DELETE` on its tables,
 *   `USAGE, SELECT` on its sequences, `EXECUTE` on its routines — for what is
 *   there now and, through default privileges, for everything the CodeGen
 *   login creates later (including schemas it adds).
 * - **Administrator** (this setup only) — creates the database, the roles, and
 *   the `pgcrypto` / `uuid-ossp` extensions.
 *
 * @param config - Install config with the database name and both logins.
 * @returns The ordered steps.
 */
export function BuildPostgresSetupSteps(config: PartialInstallConfig): PgSetupStep[] {
  const dbName = config.DatabaseName ?? 'MemberJunction';
  const codeGenUser = config.CodeGenUser ?? 'MJ_CodeGen';
  const codeGenPassword = config.CodeGenPassword ?? 'CHANGE_ME';
  const apiUser = config.APIUser ?? 'MJ_Connect';
  const apiPassword = config.APIPassword ?? 'CHANGE_ME';
  const db = QuotePgIdentifier(dbName);
  const codeGen = QuotePgIdentifier(codeGenUser);
  const api = QuotePgIdentifier(apiUser);
  const schema = QuotePgIdentifier('__mj');
  const maintenance = POSTGRES_MAINTENANCE_DB;
  const roleExists = 'SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1';

  const steps: PgSetupStep[] = [
    // (a) Server level, connected to the maintenance database.
    {
      Database: maintenance,
      Description: 'Treat backslashes in string literals literally',
      Sql: 'SET standard_conforming_strings = on',
    },
    {
      Database: maintenance,
      Description: `Create database ${dbName}`,
      Sql: `CREATE DATABASE ${db}`,
      SkipIf: { Sql: 'SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1', Param: dbName },
    },
    // (b) Roles. Existing roles are left as they are (their passwords are not changed).
    ...POSTGRES_MJ_GROUP_ROLES.map((role): PgSetupStep => ({
      Database: maintenance,
      Description: `Create group role ${role}`,
      Sql: `CREATE ROLE ${QuotePgIdentifier(role)} NOLOGIN`,
      SkipIf: { Sql: roleExists, Param: role },
    })),
    {
      Database: maintenance,
      Description: `Create CodeGen login role ${codeGenUser}`,
      Sql: `CREATE ROLE ${codeGen} LOGIN PASSWORD ${QuotePgLiteral(codeGenPassword)}`,
      SkipIf: { Sql: roleExists, Param: codeGenUser },
    },
    {
      Database: maintenance,
      Description: `Create API login role ${apiUser}`,
      Sql: `CREATE ROLE ${api} LOGIN PASSWORD ${QuotePgLiteral(apiPassword)}`,
      SkipIf: { Sql: roleExists, Param: apiUser },
    },
  ];

  // (c) Inside the MJ database.
  const inDb = (Description: string, Sql: string): PgSetupStep => ({ Database: dbName, Description, Sql });
  steps.push(
    ...POSTGRES_MJ_EXTENSIONS.map((ext) => inDb(`Create extension ${ext}`, `CREATE EXTENSION IF NOT EXISTS ${QuotePgIdentifier(ext)}`)),
    inDb(`Let ${codeGenUser} connect and create schemas`, `GRANT CONNECT, CREATE, TEMPORARY ON DATABASE ${db} TO ${codeGen}`),
    inDb(`Let ${apiUser} connect`, `GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO ${api}`),
    inDb(`Create schema __mj owned by ${codeGenUser}`, `CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${codeGen}`),
    inDb(`Make ${codeGenUser} the owner of schema __mj`, `ALTER SCHEMA ${schema} OWNER TO ${codeGen}`),
    inDb(`Let ${apiUser} use schema __mj`, `GRANT USAGE ON SCHEMA ${schema} TO ${api}`),
    inDb(`Let ${apiUser} read and write existing __mj tables`, `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${api}`),
    inDb(`Let ${apiUser} use existing __mj sequences`, `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${api}`),
    inDb(`Let ${apiUser} execute existing __mj routines`, `GRANT EXECUTE ON ALL ROUTINES IN SCHEMA ${schema} TO ${api}`),
    inDb(
      `Let ${apiUser} read and write tables ${codeGenUser} creates`,
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${codeGen} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${api}`
    ),
    inDb(`Let ${apiUser} use sequences ${codeGenUser} creates`, `ALTER DEFAULT PRIVILEGES FOR ROLE ${codeGen} GRANT USAGE, SELECT ON SEQUENCES TO ${api}`),
    inDb(`Let ${apiUser} execute routines ${codeGenUser} creates`, `ALTER DEFAULT PRIVILEGES FOR ROLE ${codeGen} GRANT EXECUTE ON ROUTINES TO ${api}`),
    inDb(`Let ${apiUser} use schemas ${codeGenUser} creates`, `ALTER DEFAULT PRIVILEGES FOR ROLE ${codeGen} GRANT USAGE ON SCHEMAS TO ${api}`)
  );
  return steps;
}

/**
 * Render the setup steps as a `psql` script for people who run the setup by
 * hand. `\connect` and `\gexec` are psql meta-commands; they appear only in
 * this file, never in what the installer sends to the server.
 *
 * @param config - Install config (for the header).
 * @param steps - Steps from {@link BuildPostgresSetupSteps}.
 * @returns The script text.
 */
export function RenderPostgresSetupScript(config: PartialInstallConfig, steps: PgSetupStep[]): string {
  const dbName = config.DatabaseName ?? 'MemberJunction';
  const lines: string[] = [
    '-- MemberJunction Database Setup Script (PostgreSQL)',
    '-- Generated by MJ Installer',
    '-- This script is idempotent (safe to run multiple times)',
    '--',
    '-- Run it with psql as a PostgreSQL superuser, for example:',
    `--   psql -h <host> -p <port> -U postgres -d ${POSTGRES_MAINTENANCE_DB} -f mj-db-setup.sql`,
    `-- It creates the database ${dbName}, the CodeGen and API login roles, the MJ`,
    '-- group roles, the required extensions, the __mj schema, and the grants.',
    '',
    '\\set ON_ERROR_STOP on',
  ];

  let currentDatabase: string | null = null;
  steps.forEach((step, index) => {
    if (step.Database !== currentDatabase) {
      lines.push('', `\\connect ${QuotePgIdentifier(step.Database)}`);
      currentDatabase = step.Database;
    }
    lines.push('', `-- ${index + 1}. ${step.Description}`);
    if (step.SkipIf) {
      // psql's \gexec runs the statement only when the existence check finds nothing.
      const check = step.SkipIf.Sql.replace('$1', QuotePgLiteral(step.SkipIf.Param));
      lines.push(`SELECT ${QuotePgLiteral(step.Sql)} WHERE NOT EXISTS (${check})\\gexec`);
    } else {
      lines.push(`${step.Sql};`);
    }
  });

  lines.push('', "\\echo '=== MemberJunction database setup complete ==='", '');
  return lines.join('\n');
}

/**
 * Generate the PostgreSQL validation script: one `[PASS]` / `[FAIL]` row per check.
 *
 * @param config - Install config with the database name and both logins.
 * @returns The script text (`psql`).
 */
export function GeneratePostgresValidateScript(config: PartialInstallConfig): string {
  const dbName = config.DatabaseName ?? 'MemberJunction';
  const codeGenUser = config.CodeGenUser ?? 'MJ_CodeGen';
  const apiUser = config.APIUser ?? 'MJ_Connect';
  const check = (condition: string, label: string): string =>
    `SELECT CASE WHEN ${condition} THEN ${QuotePgLiteral(`[PASS] ${label}`)} ELSE ${QuotePgLiteral(`[FAIL] ${label}`)} END AS "Check"`;
  const roleCheck = (role: string, label: string): string =>
    check(`EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${QuotePgLiteral(role)} AND rolcanlogin)`, label);

  return [
    '-- MemberJunction Database Validation Script (PostgreSQL)',
    '-- Generated by MJ Installer',
    '-- Run this with psql to verify the database setup is correct.',
    '',
    `\\connect ${QuotePgIdentifier(dbName)}`,
    '',
    [
      check(`EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = '__mj')`, '__mj schema exists'),
      roleCheck(codeGenUser, `CodeGen login ${codeGenUser} exists`),
      roleCheck(apiUser, `API login ${apiUser} exists`),
      check(
        `(CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${QuotePgLiteral(apiUser)}) `
          + `AND EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = '__mj') `
          + `THEN has_schema_privilege(${QuotePgLiteral(apiUser)}, '__mj', 'USAGE') ELSE false END)`,
        `API login ${apiUser} can use schema __mj`
      ),
    ].join('\nUNION ALL\n') + ';',
    '',
  ].join('\n');
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
  private pgAdapter = new PostgresAdapter();

  /**
   * Execute the database provisioning phase: generate the scripts, make sure
   * the database server is reachable, and set the database up if it is not already.
   *
   * @param context - Database provision input with directory, config, mode, and emitter.
   * @returns Script paths, whether setup was confirmed, and whether the script ran.
   * @throws {InstallerError} `DB_UNREACHABLE` when the server cannot be reached;
   *   `DB_NOT_SET_UP` when the database is not set up and no administrator login
   *   was given (or the user chose to run the script and it still is not);
   *   `DB_ADMIN_LOGIN_FAILED` when the administrator login is refused;
   *   `DB_SETUP_FAILED` when the setup script fails or leaves a login unable to sign in.
   */
  async Run(context: DatabaseProvisionContext): Promise<DatabaseProvisionResult> {
    const { Config: config, Emitter: emitter } = context;
    const platform: DatabasePlatform = config.DatabasePlatform ?? 'sqlserver';
    const labels = PLATFORM_LABELS[platform];

    // Step 1: Generate SQL scripts
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Generating database setup scripts...',
    });

    const pgSteps = platform === 'postgresql' ? BuildPostgresSetupSteps(config) : [];
    const setupScript = platform === 'postgresql' ? RenderPostgresSetupScript(config, pgSteps) : this.generateSetupScript(config);
    const scriptPath = path.join(context.Dir, 'mj-db-setup.sql');
    await this.fileSystem.WriteText(scriptPath, setupScript);

    const validateScript = platform === 'postgresql' ? GeneratePostgresValidateScript(config) : this.generateValidateScript(config);
    const validatePath = path.join(context.Dir, 'mj-db-validate.sql');
    await this.fileSystem.WriteText(validatePath, validateScript);
    const scriptsGenerated = [scriptPath, validatePath];

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `SQL scripts saved to:\n  - ${scriptPath}\n  - ${validatePath}`,
    });

    // Step 2: Make sure the server is reachable (a TCP check; no credentials are sent).
    // Resolution order matches PreflightPhase.checkSqlConnectivity:
    //   1. .env in context.Dir (when present) — this is what the app will actually use.
    //   2. Explicit config.DatabaseHost / DatabasePort.
    //   3. Defaults (localhost and the platform's default port).
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'database',
      Message: 'Validating database connectivity...',
    });

    const envValues = await this.readEnvDbTarget(context.Dir);
    const host = envValues?.host ?? config.DatabaseHost ?? 'localhost';
    const port = envValues?.port ?? config.DatabasePort ?? labels.DefaultPort;
    const connectivity = platform === 'postgresql'
      ? await this.pgAdapter.CheckConnectivity(host, port)
      : await this.sqlAdapter.CheckConnectivity(host, port);

    if (!connectivity.Reachable) {
      throw new InstallerError(
        'database',
        'DB_UNREACHABLE',
        `Cannot connect to ${labels.Server} at ${host}:${port}. ${connectivity.ErrorMessage ?? ''}`,
        `Ensure ${labels.Server} is running and reachable from this machine, then run the install again.`
      );
    }

    emitter.Emit('log', {
      Type: 'log',
      Level: 'verbose',
      Message: `${labels.Server} reachable at ${host}:${port} (${connectivity.LatencyMs}ms).`,
    });

    // Step 3: Is the database already set up?
    const server: ServerTarget = { Platform: platform, Host: host, Port: port, TrustServerCertificate: config.DatabaseTrustCert ?? false };
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
        Message: `Could not check whether database "${dbName}" is set up: ${before.Detail}. Continuing; if it is not set up, run ${scriptPath} as ${labels.AdminArticle}.`,
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
      if (platform === 'postgresql') {
        await this.runPostgresSetup(server, admin, pgSteps, scriptPath, emitter);
      } else {
        await this.runSetupScript(server, admin, setupScript, scriptPath, emitter);
      }
    } else if (context.Yes) {
      throw new InstallerError(
        'database',
        'DB_NOT_SET_UP',
        `Database "${dbName}" is not set up: ${before.Detail}.`,
        `Set MJ_INSTALL_DB_ADMIN_USER and MJ_INSTALL_DB_ADMIN_PASSWORD to ${labels.AdminRequirement} and the installer will set it up, or run ${scriptPath} as ${labels.AdminArticle}. Then run the install again.`
      );
    } else {
      await this.promptForScriptExecution(emitter, scriptPath, labels);
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
      `Check the output of ${scriptPath} (run it ${labels.ManualTool} as ${labels.AdminArticle}), then run the install again.`
    );
  }

  // ---------------------------------------------------------------------------
  // Setup check and execution
  // ---------------------------------------------------------------------------

  /**
   * Sign in once with the platform's adapter. SQL Server results are passed
   * through unchanged; PostgreSQL results are mapped to the same shape.
   */
  private async tryLogin(server: ServerTarget, database: string, user: string, password: string): Promise<SqlLoginResult> {
    if (server.Platform === 'postgresql') {
      const result = await this.pgAdapter.TryLogin({ Host: server.Host, Port: server.Port, Database: database, User: user, Password: password });
      return { Ok: result.Ok, LoginRejected: result.LoginRejected, ErrorMessage: result.ErrorMessage };
    }
    return this.sqlAdapter.TryLogin({
      Host: server.Host,
      Port: server.Port,
      TrustServerCertificate: server.TrustServerCertificate,
      Database: database,
      User: user,
      Password: password,
    });
  }

  /**
   * Sign in to the target database as the CodeGen login and then the API login.
   * A login the server refuses means setup has not run; any other failure means
   * the check could not tell.
   */
  private async checkProvisioned(server: ServerTarget, config: PartialInstallConfig): Promise<ProvisionCheck> {
    const database = config.DatabaseName ?? 'MemberJunction';
    const logins = [
      { Role: 'CodeGen', User: config.CodeGenUser ?? 'MJ_CodeGen', Password: config.CodeGenPassword ?? '' },
      { Role: 'API', User: config.APIUser ?? 'MJ_Connect', Password: config.APIPassword ?? '' },
    ];

    for (const login of logins) {
      const result = await this.tryLogin(server, database, login.User, login.Password);
      if (result.Ok) continue;
      const detail = `the ${login.Role} login "${login.User}" cannot sign in to "${database}" (${result.ErrorMessage ?? 'no detail'})`;
      return result.LoginRejected ? { Status: 'not-set-up', Detail: detail } : { Status: 'unknown', Detail: detail };
    }
    return { Status: 'ready' };
  }

  /**
   * Find an administrator login to run the setup script with: from config or
   * `MJ_INSTALL_DB_ADMIN_*` first; otherwise, interactively, by asking. The login
   * is checked against the server's maintenance database (`master` / `postgres`)
   * before it is used. Returns `null` when the user chooses to run the script
   * themselves, or when nothing is configured in non-interactive mode.
   */
  private async resolveAdminCredentials(
    context: DatabaseProvisionContext,
    server: ServerTarget,
    dbName: string,
    scriptPath: string
  ): Promise<AdminCredentials | null> {
    const { Config: config, Emitter: emitter } = context;
    const labels = PLATFORM_LABELS[server.Platform];

    if (config.DatabaseAdminUser && config.DatabaseAdminPassword !== undefined) {
      const configured = { User: config.DatabaseAdminUser, Password: config.DatabaseAdminPassword };
      const result = await this.tryLogin(server, labels.MaintenanceDatabase, configured.User, configured.Password);
      if (result.Ok) return configured;
      throw new InstallerError(
        'database',
        'DB_ADMIN_LOGIN_FAILED',
        `The administrator login "${configured.User}" could not sign in: ${result.ErrorMessage ?? 'no detail'}.`,
        `Check DatabaseAdminUser / DatabaseAdminPassword (or MJ_INSTALL_DB_ADMIN_USER / MJ_INSTALL_DB_ADMIN_PASSWORD), or run ${scriptPath} as ${labels.AdminArticle}.`
      );
    }

    if (context.Yes) return null;

    const method = await this.prompt(emitter, {
      PromptId: 'db-setup-method',
      PromptType: 'select',
      Message: `Database "${dbName}" is not set up yet. How should it be set up?`,
      Choices: [
        { Label: `Set it up now (you will be asked for ${labels.AdminExample})`, Value: 'auto' },
        { Label: `I'll run ${path.basename(scriptPath)} myself`, Value: 'manual' },
      ],
      Default: 'auto',
    });
    if (method !== 'auto') return null;

    for (let attempt = 1; attempt <= ADMIN_LOGIN_ATTEMPTS; attempt++) {
      const user = await this.prompt(emitter, {
        PromptId: 'db-admin-user',
        PromptType: 'input',
        Message: labels.AdminPrompt,
        Default: config.DatabaseAdminUser ?? labels.DefaultAdminUser,
      });
      const password = await this.prompt(emitter, {
        PromptId: 'db-admin-password',
        PromptType: 'password',
        Message: `Password for ${user}:`,
      });
      const result = await this.tryLogin(server, labels.MaintenanceDatabase, user, password);
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
      `Run ${scriptPath} as ${labels.AdminArticle}, then run the install again.`
    );
  }

  /** Run the SQL Server setup script batch by batch as the administrator login. */
  private async runSetupScript(
    server: ServerTarget,
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
        {
          Host: server.Host,
          Port: server.Port,
          TrustServerCertificate: server.TrustServerCertificate,
          Database: 'master',
          User: admin.User,
          Password: admin.Password,
        },
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

  /**
   * Run the PostgreSQL setup as the administrator login: the same ordered
   * statements written to `mj-db-setup.sql`, each sent on its own (never a
   * split script), in the maintenance database first and then in the MJ database.
   */
  private async runPostgresSetup(
    server: ServerTarget,
    admin: AdminCredentials,
    steps: PgSetupStep[],
    scriptPath: string,
    emitter: InstallerEventEmitter
  ): Promise<void> {
    emitter.Emit('log', {
      Type: 'log',
      Level: 'info',
      Message: `Setting up the database as "${admin.User}" (running the statements in ${path.basename(scriptPath)})...`,
    });

    try {
      await this.pgAdapter.ExecuteSteps(
        { Host: server.Host, Port: server.Port, User: admin.User, Password: admin.Password },
        steps,
        (message) => emitter.Emit('log', { Type: 'log', Level: 'verbose', Message: `    ${message}` })
      );
    } catch (err) {
      const where = err instanceof PgStepError ? ` (step ${err.StepNumber}: ${err.StepDescription})` : '';
      throw new InstallerError(
        'database',
        'DB_SETUP_FAILED',
        `${path.basename(scriptPath)} failed${where}: ${err instanceof Error ? err.message : String(err)}`,
        `Make sure "${admin.User}" is a PostgreSQL superuser (or can create databases and roles), or run ${scriptPath} yourself with psql as a PostgreSQL superuser. Then run the install again.`
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
    scriptPath: string,
    labels: PlatformLabels
  ): Promise<void> {
    await this.prompt(emitter, {
      PromptId: 'run-db-script',
      PromptType: 'confirm',
      Message: `Please run "${scriptPath}" ${labels.ManualTool} as ${labels.AdminArticle}, then confirm to continue.`,
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
