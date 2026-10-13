import { createMockFileSystem, createMockSqlAdapter, createMockPgAdapter } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleConfig } from './mocks/fixtures.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Adapter mocks — DatabaseProvisionPhase creates adapters via `new`
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
const mockSql = createMockSqlAdapter();
const mockPg = createMockPgAdapter();

vi.mock('../adapters/FileSystemAdapter.js', () => {
  return {
    FileSystemAdapter: class {
      WriteText = mockFs.WriteText;
      ReadText = mockFs.ReadText;
      ReadJSON = mockFs.ReadJSON;
      WriteJSON = mockFs.WriteJSON;
      FileExists = mockFs.FileExists;
      DirectoryExists = mockFs.DirectoryExists;
      CreateDirectory = mockFs.CreateDirectory;
      ExtractZip = mockFs.ExtractZip;
      IsDirectoryEmpty = mockFs.IsDirectoryEmpty;
      ListDirectoryEntries = mockFs.ListDirectoryEntries;
      GetFreeDiskSpace = mockFs.GetFreeDiskSpace;
      CanWrite = mockFs.CanWrite;
      CreateTempDir = mockFs.CreateTempDir;
      RemoveDir = mockFs.RemoveDir;
      RemoveFile = mockFs.RemoveFile;
      ListFiles = mockFs.ListFiles;
      GetModifiedTime = mockFs.GetModifiedTime;
      FindFiles = mockFs.FindFiles;
    },
  };
});

vi.mock('../adapters/SqlServerAdapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters/SqlServerAdapter.js')>();
  return {
    SqlBatchError: actual.SqlBatchError,
    SqlServerAdapter: class {
      CheckConnectivity = mockSql.CheckConnectivity;
      TryLogin = mockSql.TryLogin;
      ExecuteBatches = mockSql.ExecuteBatches;
    },
  };
});

vi.mock('../adapters/PostgresAdapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../adapters/PostgresAdapter.js')>();
  return {
    PgStepError: actual.PgStepError,
    PostgresAdapter: class {
      CheckConnectivity = mockPg.CheckConnectivity;
      TryLogin = mockPg.TryLogin;
      ExecuteSteps = mockPg.ExecuteSteps;
    },
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  DatabaseProvisionPhase,
  SplitSqlBatches,
  QuoteSqlIdentifier,
  EscapeSqlString,
  QuotePgIdentifier,
  QuotePgLiteral,
  BuildPostgresSetupSteps,
  RenderPostgresSetupScript,
  GeneratePostgresValidateScript,
  POSTGRES_MJ_GROUP_ROLES,
  type DatabaseProvisionContext,
} from '../phases/DatabaseProvisionPhase.js';
import { PgStepError, type PgLoginTarget, type PgLoginResult } from '../adapters/PostgresAdapter.js';
import { SqlBatchError, type SqlLoginTarget, type SqlLoginResult } from '../adapters/SqlServerAdapter.js';
import type { PromptEvent } from '../events/InstallerEvents.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<DatabaseProvisionContext>): DatabaseProvisionContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Config: sampleConfig(),
    Yes: false,
    Emitter: emitter,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabaseProvisionPhase', () => {
  let phase: DatabaseProvisionPhase;

  beforeEach(() => {
    phase = new DatabaseProvisionPhase();

    // Clear call history and reset implementations to defaults
    mockFs.WriteText.mockClear().mockResolvedValue(undefined);
    mockSql.CheckConnectivity.mockClear().mockResolvedValue({ Reachable: true, LatencyMs: 12 });
    mockSql.TryLogin.mockReset().mockResolvedValue({ Ok: true, LoginRejected: false });
    mockSql.ExecuteBatches.mockReset().mockResolvedValue(undefined);
    mockPg.CheckConnectivity.mockReset().mockResolvedValue({ Reachable: true, LatencyMs: 9 });
    mockPg.TryLogin.mockReset().mockResolvedValue({ Ok: true, LoginRejected: false });
    mockPg.ExecuteSteps.mockReset().mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // Script generation — database name
  // -----------------------------------------------------------------------

  describe('setup script generation', () => {
    it('should generate setup script with the database name from config', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseName = 'CustomDB';

      await phase.Run(ctx);

      const writeCall = mockFs.WriteText.mock.calls[0];
      const scriptContent = writeCall[1] as string;
      expect(scriptContent).toContain("name = 'CustomDB'");
      expect(scriptContent).toContain('CREATE DATABASE [CustomDB]');
      expect(scriptContent).toContain('USE [CustomDB]');
    });

    it('should generate setup script with correct CodeGen and API users from config', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.CodeGenUser = 'CG_User';
      ctx.Config.APIUser = 'API_User';

      await phase.Run(ctx);

      const writeCall = mockFs.WriteText.mock.calls[0];
      const scriptContent = writeCall[1] as string;
      expect(scriptContent).toContain("name = 'CG_User'");
      expect(scriptContent).toContain("name = 'API_User'");
      expect(scriptContent).toContain('CREATE LOGIN [CG_User]');
      expect(scriptContent).toContain('CREATE LOGIN [API_User]');
    });

    it('should use defaults when config fields are missing', async () => {
      const ctx = makeContext({ Yes: true, Config: {} });

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;
      // Default database name
      expect(setupScript).toContain("name = 'MemberJunction'");
      expect(setupScript).toContain('CREATE DATABASE [MemberJunction]');
      // Default codegen user
      expect(setupScript).toContain("name = 'MJ_CodeGen'");
      // Default API user
      expect(setupScript).toContain("name = 'MJ_Connect'");
    });
  });

  // -----------------------------------------------------------------------
  // Built-in sysadmin (`sa`) handling — Msg 15405 guard
  // -----------------------------------------------------------------------

  describe('built-in sysadmin (sa) handling', () => {
    // The skip-comments themselves contain phrases like "CREATE LOGIN [sa]" inside `--`
    // comments, so naive `.toContain('CREATE LOGIN [sa]')` would false-positive. These
    // regexes use a `^(?!\s*--)\s*` anchor: line-start, NOT a comment line, then DDL.
    const realDdlCreateLoginSa = /^(?!\s*--)\s*CREATE LOGIN \[sa\]/m;
    const realDdlCreateUserSa = /^(?!\s*--)\s*CREATE USER \[sa\] FOR LOGIN \[sa\]/m;
    const realDdlAlterRoleSa = /^(?!\s*--)\s*ALTER ROLE \w+ ADD MEMBER \[sa\]/m;
    const realDdlGrantExecuteSa = /^(?!\s*--)\s*GRANT EXECUTE TO \[sa\]/m;

    it('skips CREATE LOGIN / CREATE USER / role-grant blocks when CodeGenUser is sa', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.CodeGenUser = 'sa';
      ctx.Config.CodeGenPassword = 'whatever';
      ctx.Config.APIUser = 'API_User';
      ctx.Config.APIPassword = 'apipw';

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;

      // sa-side: every relevant block should be a skip-comment, NOT a real DDL statement
      expect(setupScript).toContain('-- Skipping CREATE LOGIN [sa]');
      expect(setupScript).toContain('-- Skipping CREATE USER [sa]');
      expect(setupScript).toContain('-- Skipping ALTER ROLE db_owner ADD MEMBER [sa]');
      expect(setupScript).not.toMatch(realDdlCreateLoginSa);
      expect(setupScript).not.toMatch(realDdlCreateUserSa);
      expect(setupScript).not.toMatch(realDdlAlterRoleSa);

      // API user side: unchanged — real DDL still emitted
      expect(setupScript).toContain('CREATE LOGIN [API_User]');
      expect(setupScript).toContain('CREATE USER [API_User] FOR LOGIN [API_User]');
      expect(setupScript).toContain('ALTER ROLE db_datareader ADD MEMBER [API_User]');
      expect(setupScript).toContain('GRANT EXECUTE TO [API_User]');
    });

    it('skips role grants and GRANT EXECUTE when APIUser is sa', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.CodeGenUser = 'CG_User';
      ctx.Config.APIUser = 'sa';
      ctx.Config.APIPassword = 'doesntmatter';

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;

      // API side: skip-comments for db_datareader, db_datawriter, and GRANT EXECUTE
      expect(setupScript).toContain('-- Skipping ALTER ROLE db_datareader ADD MEMBER [sa]');
      expect(setupScript).toContain('-- Skipping ALTER ROLE db_datawriter ADD MEMBER [sa]');
      expect(setupScript).toContain('-- Skipping GRANT EXECUTE TO [sa]');
      expect(setupScript).not.toMatch(realDdlAlterRoleSa);
      expect(setupScript).not.toMatch(realDdlGrantExecuteSa);

      // CodeGen side: unchanged
      expect(setupScript).toContain('CREATE LOGIN [CG_User]');
      expect(setupScript).toContain('ALTER ROLE db_owner ADD MEMBER [CG_User]');
    });

    it('handles both CodeGen and API as sa (single-user dev / Docker scenario)', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.CodeGenUser = 'sa';
      ctx.Config.APIUser = 'sa';

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;

      // No CREATE LOGIN, CREATE USER, ALTER ROLE, or GRANT EXECUTE for sa should be emitted as DDL
      expect(setupScript).not.toMatch(realDdlCreateLoginSa);
      expect(setupScript).not.toMatch(realDdlCreateUserSa);
      expect(setupScript).not.toMatch(realDdlAlterRoleSa);
      expect(setupScript).not.toMatch(realDdlGrantExecuteSa);

      // Database creation step still runs (this is the whole reason for the fix —
      // step 1 was already succeeding before, the rest was the cosmetic noise)
      expect(setupScript).toContain('CREATE DATABASE');
    });

    it('case-insensitive match — recognises SA, Sa, sA as built-in sysadmin', async () => {
      for (const variant of ['SA', 'Sa', 'sA', '  sa  ']) {
        mockFs.WriteText.mockClear();
        const ctx = makeContext({ Yes: true });
        ctx.Config.CodeGenUser = variant;
        ctx.Config.APIUser = 'API_User';

        await phase.Run(ctx);

        const setupScript = mockFs.WriteText.mock.calls[0][1] as string;
        expect(setupScript).toContain(`-- Skipping CREATE LOGIN [${variant}]`);
        // Real DDL for this variant should NOT be emitted (escape the printable variant for regex)
        const escaped = variant.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const realDdlForVariant = new RegExp(`^(?!\\s*--)\\s*CREATE LOGIN \\[${escaped}\\]`, 'm');
        expect(setupScript).not.toMatch(realDdlForVariant);
      }
    });

    it('non-sa principal names get the full normal CREATE/USER/role chain (regression guard)', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.CodeGenUser = 'sammie'; // looks like sa but isn't
      ctx.Config.APIUser = 'salesforce'; // looks like sa-prefix but isn't

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;
      expect(setupScript).toContain('CREATE LOGIN [sammie]');
      expect(setupScript).toContain('CREATE LOGIN [salesforce]');
      expect(setupScript).toContain('CREATE USER [sammie] FOR LOGIN [sammie]');
      expect(setupScript).toContain('CREATE USER [salesforce] FOR LOGIN [salesforce]');
      expect(setupScript).not.toContain('-- Skipping CREATE');
    });
  });

  // -----------------------------------------------------------------------
  // File write paths
  // -----------------------------------------------------------------------

  describe('script file paths', () => {
    it('should write setup script to dir/mj-db-setup.sql', async () => {
      const ctx = makeContext({ Dir: '/my/project', Yes: true });

      await phase.Run(ctx);

      const setupPath = mockFs.WriteText.mock.calls[0][0] as string;
      expect(setupPath).toMatch(/[/\\]my[/\\]project[/\\]mj-db-setup\.sql$/);
    });

    it('should write validate script to dir/mj-db-validate.sql', async () => {
      const ctx = makeContext({ Dir: '/my/project', Yes: true });

      await phase.Run(ctx);

      const validatePath = mockFs.WriteText.mock.calls[1][0] as string;
      expect(validatePath).toMatch(/[/\\]my[/\\]project[/\\]mj-db-validate\.sql$/);
    });
  });

  // -----------------------------------------------------------------------
  // Interactive vs --yes mode
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Setting the database up
  // -----------------------------------------------------------------------

  /**
   * Simulate a server where the app logins are refused until the setup script
   * has run, and only `adminPassword` lets the admin login in.
   */
  function simulateServer(options: { adminPassword?: string; setupWorks?: boolean } = {}): { SetupRan: () => boolean } {
    let setupRan = false;
    mockSql.ExecuteBatches.mockImplementation(async () => {
      setupRan = options.setupWorks ?? true;
    });
    mockSql.TryLogin.mockImplementation(async (target: SqlLoginTarget): Promise<SqlLoginResult> => {
      if (target.Database === 'master') {
        return target.Password === (options.adminPassword ?? 'admin-pw')
          ? { Ok: true, LoginRejected: false }
          : { Ok: false, LoginRejected: true, ErrorMessage: `Login failed for user '${target.User}'.` };
      }
      return setupRan
        ? { Ok: true, LoginRejected: false }
        : { Ok: false, LoginRejected: true, ErrorMessage: `Login failed for user '${target.User}'.` };
    });
    return { SetupRan: () => setupRan };
  }

  /** Answer prompts by PromptId from a queue of answers per id. */
  function answerPrompts(emitter: ReturnType<typeof createMockEmitter>['emitter'], answers: Record<string, string[]>): PromptEvent[] {
    const seen: PromptEvent[] = [];
    emitter.On('prompt', (e) => {
      seen.push(e);
      const queue = answers[e.PromptId] ?? [];
      e.Resolve(queue.shift() ?? e.Default ?? '');
    });
    return seen;
  }

  describe('when the database is already set up', () => {
    it('signs in as both logins and does nothing else', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.ValidationPassed).toBe(true);
      expect(result.SetupScriptExecuted).toBe(false);
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
      expect(emittedEvents(emitSpy, 'prompt')).toHaveLength(0);
      const users = mockSql.TryLogin.mock.calls.map(([t]) => `${t.User}@${t.Database}`);
      expect(users).toEqual(['MJ_CodeGen@MemberJunction', 'MJ_Connect@MemberJunction']);
    });

    it('passes host, port, and trust-certificate settings to the sign-in check', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseTrustCert = true;

      await phase.Run(ctx);

      const target = mockSql.TryLogin.mock.calls[0][0];
      expect(target).toMatchObject({ Host: 'localhost', Port: 1433, TrustServerCertificate: true, Password: 'test_password_1' });
    });
  });

  describe('non-interactive (--yes) mode', () => {
    it('runs the setup script with the configured admin login, then confirms both logins', async () => {
      const server = simulateServer();
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });
      ctx.Config.DatabaseAdminUser = 'sa';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      const result = await phase.Run(ctx);

      expect(server.SetupRan()).toBe(true);
      expect(result.SetupScriptExecuted).toBe(true);
      expect(result.ValidationPassed).toBe(true);
      expect(emittedEvents(emitSpy, 'prompt')).toHaveLength(0);

      const [target, batches] = mockSql.ExecuteBatches.mock.calls[0];
      expect(target).toMatchObject({ Database: 'master', User: 'sa', Password: 'admin-pw' });
      expect(batches[0]).toContain('CREATE DATABASE [MemberJunction]');
      expect(batches.some((b) => b.includes('CREATE LOGIN [MJ_CodeGen]'))).toBe(true);
      expect(batches.every((b) => !/^\s*GO\s*$/im.test(b))).toBe(true);
    });

    it('fails with DB_NOT_SET_UP and instructions when no admin login is configured', async () => {
      simulateServer();
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });

      const error = await phase.Run(ctx).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InstallerError);
      expect((error as InstallerError).Code).toBe('DB_NOT_SET_UP');
      expect((error as InstallerError).SuggestedFix).toContain('MJ_INSTALL_DB_ADMIN_USER');
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
      expect(emittedEvents(emitSpy, 'prompt')).toHaveLength(0);
    });

    it('fails with DB_ADMIN_LOGIN_FAILED when the configured admin login is refused', async () => {
      simulateServer({ adminPassword: 'right' });
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'sa';
      ctx.Config.DatabaseAdminPassword = 'wrong';

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_ADMIN_LOGIN_FAILED' });
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
    });

    it('fails with DB_SETUP_FAILED naming the batch when the script fails', async () => {
      simulateServer();
      mockSql.ExecuteBatches.mockRejectedValue(new SqlBatchError(3, 'CREATE LOGIN permission denied'));
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'sa';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      const error = (await phase.Run(ctx).catch((e: unknown) => e)) as InstallerError;

      expect(error.Code).toBe('DB_SETUP_FAILED');
      expect(error.message).toContain('batch 3');
      expect(error.message).toContain('CREATE LOGIN permission denied');
    });

    it('fails with DB_SETUP_FAILED when the script runs but a login still cannot sign in', async () => {
      simulateServer({ setupWorks: false });
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'sa';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_SETUP_FAILED' });
    });

    it('never puts the admin password in an emitted event', async () => {
      simulateServer({ adminPassword: 'Sup3r-Secret!' });
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });
      ctx.Config.DatabaseAdminUser = 'sa';
      ctx.Config.DatabaseAdminPassword = 'Sup3r-Secret!';

      await phase.Run(ctx);

      const everything = JSON.stringify(emitSpy.mock.calls);
      expect(everything).not.toContain('Sup3r-Secret!');
    });
  });

  describe('interactive mode', () => {
    it('asks for an admin login and sets the database up when the user picks "set it up now"', async () => {
      simulateServer();
      const { emitter } = createMockEmitter();
      const prompts = answerPrompts(emitter, {
        'db-setup-method': ['auto'],
        'db-admin-user': ['sa'],
        'db-admin-password': ['admin-pw'],
      });
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.SetupScriptExecuted).toBe(true);
      expect(prompts.map((p) => p.PromptId)).toEqual(['db-setup-method', 'db-admin-user', 'db-admin-password']);
      expect(prompts[2].PromptType).toBe('password');
      expect(mockSql.ExecuteBatches.mock.calls[0][0]).toMatchObject({ User: 'sa', Password: 'admin-pw' });
    });

    it('asks again when the admin password is wrong', async () => {
      simulateServer();
      const { emitter, emitSpy } = createMockEmitter();
      answerPrompts(emitter, {
        'db-setup-method': ['auto'],
        'db-admin-user': ['sa', 'sa'],
        'db-admin-password': ['typo', 'admin-pw'],
      });
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.SetupScriptExecuted).toBe(true);
      const warns = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      expect(warns.some((w) => w.Message.includes('could not sign in'))).toBe(true);
    });

    it('gives up with DB_ADMIN_LOGIN_FAILED after three refused attempts', async () => {
      simulateServer();
      const { emitter } = createMockEmitter();
      answerPrompts(emitter, {
        'db-setup-method': ['auto'],
        'db-admin-password': ['a', 'b', 'c'],
      });
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_ADMIN_LOGIN_FAILED' });
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
    });

    it('lets the user run the script by hand, then confirms the result', async () => {
      const server = simulateServer();
      const { emitter } = createMockEmitter();
      const prompts: PromptEvent[] = [];
      emitter.On('prompt', (e) => {
        prompts.push(e);
        if (e.PromptId === 'run-db-script') {
          // The user runs the script in SSMS: emulate it by flipping the server state.
          void mockSql.ExecuteBatches({} as SqlLoginTarget, [], () => undefined).then(() => e.Resolve('yes'));
          return;
        }
        e.Resolve('manual');
      });
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(server.SetupRan()).toBe(true);
      expect(prompts.map((p) => p.PromptId)).toEqual(['db-setup-method', 'run-db-script']);
      expect(result.SetupScriptExecuted).toBe(false);
      expect(result.ValidationPassed).toBe(true);
    });

    it('fails with DB_NOT_SET_UP when the user says they ran the script but the logins still fail', async () => {
      simulateServer();
      const { emitter } = createMockEmitter();
      answerPrompts(emitter, { 'db-setup-method': ['manual'], 'run-db-script': ['yes'] });
      const ctx = makeContext({ Yes: false, Emitter: emitter });

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_NOT_SET_UP' });
    });
  });

  describe('when the sign-in check cannot tell', () => {
    it('warns, skips setup, and reports ValidationPassed=false', async () => {
      mockSql.TryLogin.mockResolvedValue({ Ok: false, LoginRejected: false, ErrorMessage: 'self-signed certificate' });
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.ValidationPassed).toBe(false);
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
      const warns = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      expect(warns[0].Message).toContain('self-signed certificate');
    });
  });

  describe('SQL quoting', () => {
    it('doubles ] in identifiers and \' in literals so names cannot break the script', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseName = "Odd]Name";
      ctx.Config.CodeGenUser = "o'brien";
      ctx.Config.CodeGenPassword = "pa'ss";

      await phase.Run(ctx);

      const setupScript = mockFs.WriteText.mock.calls[0][1] as string;
      expect(setupScript).toContain('CREATE DATABASE [Odd]]Name]');
      expect(setupScript).toContain("WHERE name = 'o''brien'");
      expect(setupScript).toContain("CREATE LOGIN [o'brien] WITH PASSWORD = N'pa''ss'");
    });

    it('QuoteSqlIdentifier and EscapeSqlString', () => {
      expect(QuoteSqlIdentifier('a]b')).toBe('[a]]b]');
      expect(EscapeSqlString("it's")).toBe("it''s");
    });
  });

  describe('SplitSqlBatches', () => {
    it('splits on GO lines in any case and drops comment-only batches', () => {
      const batches = SplitSqlBatches("-- header\nSELECT 1;\nGO\n-- only a comment\ngo\n  GO  \nPRINT 'GO';\nGO\n");
      expect(batches).toEqual(['-- header\nSELECT 1;', "PRINT 'GO';"]);
    });

    it('does not split on GO inside a line', () => {
      expect(SplitSqlBatches('SELECT 1 AS GOAL;\nGO')).toEqual(['SELECT 1 AS GOAL;']);
    });
  });

  // -----------------------------------------------------------------------
  // SQL connectivity validation
  // -----------------------------------------------------------------------

  describe('connectivity validation', () => {
    it('should return ValidationPassed=true and both script paths when SQL is reachable', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 8 });
      const ctx = makeContext({ Yes: true });

      const result = await phase.Run(ctx);

      expect(result.ValidationPassed).toBe(true);
      expect(result.ScriptsGenerated).toHaveLength(2);
      expect(result.ScriptsGenerated[0]).toMatch(/mj-db-setup\.sql$/);
      expect(result.ScriptsGenerated[1]).toMatch(/mj-db-validate\.sql$/);
    });

    it('should throw InstallerError with code DB_UNREACHABLE when SQL is not reachable', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({
        Reachable: false,
        LatencyMs: 5000,
        ErrorMessage: 'Connection refused',
      });
      const ctx = makeContext({ Yes: true });

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('DB_UNREACHABLE');
        expect(ie.Phase).toBe('database');
      }
    });

    it('should prefer DB_HOST/DB_PORT from .env over config defaults (Bug #6 fix)', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 8 });
      mockFs.FileExists.mockImplementation(async (p: string) => p.endsWith('.env'));
      mockFs.ReadText.mockResolvedValue("DB_HOST='envhost'\nDB_PORT=1444\nDB_USERNAME=sa\n");

      const ctx = makeContext({ Yes: true });
      await phase.Run(ctx);

      // Connectivity should hit the .env values, not config defaults
      expect(mockSql.CheckConnectivity).toHaveBeenCalledWith('envhost', 1444);
    });

    it('should fall back to config when .env is missing', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 8 });
      mockFs.FileExists.mockResolvedValue(false);

      const ctx = makeContext({
        Config: { DatabaseHost: 'cfg', DatabasePort: 5555 },
        Yes: true,
      });
      await phase.Run(ctx);

      expect(mockSql.CheckConnectivity).toHaveBeenCalledWith('cfg', 5555);
    });

    it('should prefer PG_HOST/PG_PORT from .env over DB_HOST/DB_PORT (PG install)', async () => {
      // Mirrors PreflightPhase: codegen-lib's DEFAULT_CODEGEN_CONFIG resolves
      // PG_* before DB_* on PostgreSQL installs, so the connectivity check
      // here must follow the same precedence to avoid a false-negative
      // unreachable error against the stale DB_HOST target.
      mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 8 });
      mockFs.FileExists.mockImplementation(async (p: string) => p.endsWith('.env'));
      mockFs.ReadText.mockResolvedValue("PG_HOST='pg.docker'\nPG_PORT=5433\nDB_HOST='ignored'\nDB_PORT=1433\n");

      const ctx = makeContext({ Yes: true });
      await phase.Run(ctx);

      expect(mockSql.CheckConnectivity).toHaveBeenCalledWith('pg.docker', 5433);
    });
  });

  // -----------------------------------------------------------------------
  // ScriptsGenerated array
  // -----------------------------------------------------------------------

  describe('result shape', () => {
    it('should return ScriptsGenerated array containing both script paths', async () => {
      const ctx = makeContext({ Dir: '/proj', Yes: true });
      const result = await phase.Run(ctx);

      expect(result.ScriptsGenerated).toHaveLength(2);
      expect(result.ScriptsGenerated[0]).toMatch(/mj-db-setup\.sql$/);
      expect(result.ScriptsGenerated[1]).toMatch(/mj-db-validate\.sql$/);
    });
  });

  // -----------------------------------------------------------------------
  // Validate script content
  // -----------------------------------------------------------------------

  describe('validate script generation', () => {
    it('should reference correct DB name and users in the validate script', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseName = 'TestDB';
      ctx.Config.CodeGenUser = 'CG';
      ctx.Config.APIUser = 'API';

      await phase.Run(ctx);

      const validateScript = mockFs.WriteText.mock.calls[1][1] as string;
      expect(validateScript).toContain('USE [TestDB]');
      expect(validateScript).toContain("name = 'CG'");
      expect(validateScript).toContain("name = 'API'");
    });

    it('does not assert a database principal for sa', async () => {
      // `sa` maps to dbo and never appears in sys.database_principals, so a
      // correct setup printed "[FAIL] User sa NOT found". The setup emitter in
      // this same file already special-cases built-in sysadmins (Msg 15405);
      // the validate emitter did not. See #4562.
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseName = 'TestDB';
      ctx.Config.CodeGenUser = 'sa';
      ctx.Config.APIUser = 'sa';

      await phase.Run(ctx);

      const validateScript = mockFs.WriteText.mock.calls[1][1] as string;
      expect(validateScript).not.toContain("name = 'sa'");
      expect(validateScript).toMatch(/sa.*sysadmin/i);
    });

    it('still asserts database principals for ordinary logins', async () => {
      const ctx = makeContext({ Yes: true });
      ctx.Config.DatabaseName = 'TestDB';
      ctx.Config.CodeGenUser = 'MJ_CodeGen';
      ctx.Config.APIUser = 'MJ_API';

      await phase.Run(ctx);

      const validateScript = mockFs.WriteText.mock.calls[1][1] as string;
      expect(validateScript).toContain("name = 'MJ_CodeGen'");
      expect(validateScript).toContain("name = 'MJ_API'");
    });
  });

  describe('connectivity reporting', () => {
    it('does not claim credentials were verified by a TCP probe', async () => {
      // SqlServerAdapter.CheckConnectivity opens a socket — no TLS, no login,
      // no SELECT 1. Claiming "connectivity verified" is what let a bad
      // DB_TRUST_SERVER_CERTIFICATE pass here and fail three phases later.
      const { emitter, emitSpy } = createMockEmitter();
      await phase.Run(makeContext({ Yes: true, Emitter: emitter }));

      const messages = [
        ...emittedEvents(emitSpy, 'log'),
        ...emittedEvents(emitSpy, 'step:progress'),
      ].map((e) => (e as { Message?: string }).Message ?? '').join('\n');

      expect(messages).not.toMatch(/connectivity verified/i);
      expect(messages).toMatch(/reachable/i);
    });
  });

  // -----------------------------------------------------------------------
  // PostgreSQL
  // -----------------------------------------------------------------------

  describe('PostgreSQL', () => {
    beforeEach(() => {
      // No install-folder .env unless a test supplies one.
      mockFs.ReadText.mockResolvedValue('');
    });

    function pgContext(overrides?: Partial<DatabaseProvisionContext>): DatabaseProvisionContext {
      const ctx = makeContext(overrides);
      ctx.Config = { ...sampleConfig(), DatabasePlatform: 'postgresql', DatabasePort: 5433, DatabaseTrustCert: false, ...(overrides?.Config ?? {}) };
      return ctx;
    }

    /** Logins are refused until the setup steps run; only `adminPassword` gets the admin in. */
    function simulatePgServer(options: { adminPassword?: string; setupWorks?: boolean } = {}): { SetupRan: () => boolean } {
      let setupRan = false;
      mockPg.ExecuteSteps.mockImplementation(async () => {
        setupRan = options.setupWorks ?? true;
      });
      mockPg.TryLogin.mockImplementation(async (target: PgLoginTarget): Promise<PgLoginResult> => {
        if (target.Database === 'postgres') {
          return target.Password === (options.adminPassword ?? 'admin-pw')
            ? { Ok: true, LoginRejected: false }
            : { Ok: false, LoginRejected: true, ErrorMessage: `password authentication failed for user "${target.User}"` };
        }
        return setupRan
          ? { Ok: true, LoginRejected: false }
          : { Ok: false, LoginRejected: true, ErrorMessage: `database "${target.Database}" does not exist` };
      });
      return { SetupRan: () => setupRan };
    }

    it('checks reachability over TCP with the PostgreSQL adapter, never the SQL Server one', async () => {
      const ctx = pgContext({ Yes: true });

      await phase.Run(ctx);

      expect(mockPg.CheckConnectivity).toHaveBeenCalledWith('localhost', 5433);
      expect(mockSql.CheckConnectivity).not.toHaveBeenCalled();
      expect(mockSql.TryLogin).not.toHaveBeenCalled();
    });

    it('defaults to port 5432 when neither .env nor config gives one', async () => {
      mockFs.FileExists.mockResolvedValueOnce(false);
      const ctx = pgContext({ Yes: true });
      delete ctx.Config.DatabasePort;

      await phase.Run(ctx);

      expect(mockPg.CheckConnectivity).toHaveBeenCalledWith('localhost', 5432);
    });

    it('fails with DB_UNREACHABLE naming PostgreSQL when the server cannot be reached', async () => {
      mockPg.CheckConnectivity.mockResolvedValue({ Reachable: false, LatencyMs: 5000, ErrorMessage: 'Connection refused at localhost:5433. Is PostgreSQL running?' });
      const ctx = pgContext({ Yes: true });

      const error = (await phase.Run(ctx).catch((e: unknown) => e)) as InstallerError;

      expect(error.Code).toBe('DB_UNREACHABLE');
      expect(error.message).toContain('Cannot connect to PostgreSQL at localhost:5433');
      expect(mockPg.TryLogin).not.toHaveBeenCalled();
    });

    it('reports "already set up" when both logins sign in to the MJ database', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = pgContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result).toMatchObject({ ValidationPassed: true, SetupScriptExecuted: false });
      expect(mockPg.ExecuteSteps).not.toHaveBeenCalled();
      expect(emittedEvents(emitSpy, 'prompt')).toHaveLength(0);
      expect(mockPg.TryLogin.mock.calls.map(([t]) => `${t.User}@${t.Database}:${t.Port}`)).toEqual([
        'MJ_CodeGen@MemberJunction:5433',
        'MJ_Connect@MemberJunction:5433',
      ]);
      const logs = emittedEvents(emitSpy, 'log') as Array<{ Message: string }>;
      expect(logs.some((l) => l.Message.includes('is already set up'))).toBe(true);
    });

    it('writes a psql setup script and a validation script', async () => {
      const ctx = pgContext({ Yes: true });

      await phase.Run(ctx);

      const [setupPath, setupScript] = mockFs.WriteText.mock.calls[0] as [string, string];
      const [validatePath, validateScript] = mockFs.WriteText.mock.calls[1] as [string, string];
      expect(setupPath).toMatch(/mj-db-setup\.sql$/);
      expect(validatePath).toMatch(/mj-db-validate\.sql$/);
      expect(setupScript).toContain('\\set ON_ERROR_STOP on');
      expect(setupScript).toContain(`SELECT 'CREATE DATABASE "MemberJunction"' WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'MemberJunction')\\gexec`);
      expect(setupScript.indexOf('\\connect "postgres"')).toBeLessThan(setupScript.indexOf('\\connect "MemberJunction"'));
      expect(setupScript).not.toMatch(/\bDO\s+\$/);
      expect(setupScript).not.toContain('\\$');
      expect(validateScript).toContain('\\connect "MemberJunction"');
      expect(validateScript).toContain('[PASS] __mj schema exists');
    });

    it('--yes with admin credentials runs the setup steps as the admin, then confirms both logins', async () => {
      const server = simulatePgServer();
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = pgContext({ Yes: true, Emitter: emitter });
      ctx.Config.DatabaseAdminUser = 'postgres';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      const result = await phase.Run(ctx);

      expect(server.SetupRan()).toBe(true);
      expect(result).toMatchObject({ ValidationPassed: true, SetupScriptExecuted: true });
      expect(emittedEvents(emitSpy, 'prompt')).toHaveLength(0);
      const [adminServer, steps] = mockPg.ExecuteSteps.mock.calls[0];
      expect(adminServer).toEqual({ Host: 'localhost', Port: 5433, User: 'postgres', Password: 'admin-pw' });
      expect(steps).toEqual(BuildPostgresSetupSteps(ctx.Config));
      // The admin login is checked against the maintenance database first.
      expect(mockPg.TryLogin.mock.calls.some(([t]) => t.User === 'postgres' && t.Database === 'postgres')).toBe(true);
      expect(mockSql.ExecuteBatches).not.toHaveBeenCalled();
    });

    it('--yes without admin credentials fails with DB_NOT_SET_UP', async () => {
      simulatePgServer();
      const ctx = pgContext({ Yes: true });

      const error = (await phase.Run(ctx).catch((e: unknown) => e)) as InstallerError;

      expect(error).toBeInstanceOf(InstallerError);
      expect(error.Code).toBe('DB_NOT_SET_UP');
      expect(error.SuggestedFix).toContain('MJ_INSTALL_DB_ADMIN_USER');
      expect(error.SuggestedFix).toContain('PostgreSQL superuser');
      expect(mockPg.ExecuteSteps).not.toHaveBeenCalled();
    });

    it('fails with DB_ADMIN_LOGIN_FAILED when the configured admin is refused', async () => {
      simulatePgServer({ adminPassword: 'right' });
      const ctx = pgContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'postgres';
      ctx.Config.DatabaseAdminPassword = 'wrong';

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_ADMIN_LOGIN_FAILED' });
      expect(mockPg.ExecuteSteps).not.toHaveBeenCalled();
    });

    it('fails with DB_SETUP_FAILED naming the step when a statement fails', async () => {
      simulatePgServer();
      mockPg.ExecuteSteps.mockRejectedValue(new PgStepError(2, 'Create database MemberJunction', 'permission denied to create database'));
      const ctx = pgContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'postgres';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      const error = (await phase.Run(ctx).catch((e: unknown) => e)) as InstallerError;

      expect(error.Code).toBe('DB_SETUP_FAILED');
      expect(error.message).toContain('step 2: Create database MemberJunction');
      expect(error.message).toContain('permission denied to create database');
    });

    it('fails with DB_SETUP_FAILED when setup runs but a login still cannot sign in', async () => {
      simulatePgServer({ setupWorks: false });
      const ctx = pgContext({ Yes: true });
      ctx.Config.DatabaseAdminUser = 'postgres';
      ctx.Config.DatabaseAdminPassword = 'admin-pw';

      await expect(phase.Run(ctx)).rejects.toMatchObject({ Code: 'DB_SETUP_FAILED' });
    });

    it('warns and skips setup when the sign-in check cannot tell', async () => {
      mockPg.TryLogin.mockResolvedValue({ Ok: false, LoginRejected: false, ErrorMessage: 'The server does not support SSL connections' });
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = pgContext({ Yes: true, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.ValidationPassed).toBe(false);
      expect(mockPg.ExecuteSteps).not.toHaveBeenCalled();
      const warns = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      expect(warns[0].Message).toContain('does not support SSL');
    });

    it('interactive: asks for a PostgreSQL admin (default postgres) with a password prompt', async () => {
      simulatePgServer();
      const { emitter } = createMockEmitter();
      const prompts: PromptEvent[] = [];
      emitter.On('prompt', (e) => {
        prompts.push(e);
        const answers: Record<string, string> = { 'db-setup-method': 'auto', 'db-admin-password': 'admin-pw' };
        e.Resolve(answers[e.PromptId] ?? e.Default ?? '');
      });
      const ctx = pgContext({ Yes: false, Emitter: emitter });

      const result = await phase.Run(ctx);

      expect(result.SetupScriptExecuted).toBe(true);
      expect(prompts.map((p) => p.PromptId)).toEqual(['db-setup-method', 'db-admin-user', 'db-admin-password']);
      expect(prompts[1].Default).toBe('postgres');
      expect(prompts[2].PromptType).toBe('password');
      expect(mockPg.ExecuteSteps.mock.calls[0][0]).toMatchObject({ User: 'postgres', Password: 'admin-pw' });
    });

    it('never puts the admin password in an emitted event', async () => {
      simulatePgServer({ adminPassword: 'Pg-Sup3r-Secret!' });
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = pgContext({ Yes: true, Emitter: emitter });
      ctx.Config.DatabaseAdminUser = 'postgres';
      ctx.Config.DatabaseAdminPassword = 'Pg-Sup3r-Secret!';

      await phase.Run(ctx);

      expect(JSON.stringify(emitSpy.mock.calls)).not.toContain('Pg-Sup3r-Secret!');
      expect(JSON.stringify(mockFs.WriteText.mock.calls)).not.toContain('Pg-Sup3r-Secret!');
    });
  });

  describe('PostgreSQL setup statements', () => {
    const config = {
      DatabaseName: 'mj_db',
      CodeGenUser: 'mj_codegen',
      CodeGenPassword: 'cg-pw',
      APIUser: 'mj_api',
      APIPassword: 'api-pw',
    };

    it('creates the database and roles in the maintenance database, then works inside the MJ database', () => {
      const steps = BuildPostgresSetupSteps(config);
      const databases = steps.map((s) => s.Database);
      const firstTarget = databases.indexOf('mj_db');

      expect(firstTarget).toBeGreaterThan(0);
      expect(databases.slice(0, firstTarget).every((d) => d === 'postgres')).toBe(true);
      expect(databases.slice(firstTarget).every((d) => d === 'mj_db')).toBe(true);

      const createDb = steps.find((s) => s.Sql.startsWith('CREATE DATABASE'));
      expect(createDb).toMatchObject({
        Database: 'postgres',
        Sql: 'CREATE DATABASE "mj_db"',
        SkipIf: { Sql: 'SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1', Param: 'mj_db' },
      });
    });

    it('sends one plain statement per step: no DO blocks, psql meta-commands, or trailing separators', () => {
      for (const step of BuildPostgresSetupSteps(config)) {
        expect(step.Sql).not.toMatch(/\bDO\s+\$/);
        expect(step.Sql).not.toMatch(/^\\/);
        expect(step.Sql.trim().endsWith(';')).toBe(false);
      }
    });

    it('creates the login roles with LOGIN only — no CREATEDB, CREATEROLE, or SUPERUSER', () => {
      const steps = BuildPostgresSetupSteps(config);
      const all = steps.map((s) => s.Sql).join('\n');

      expect(all).not.toMatch(/CREATEDB|CREATEROLE|SUPERUSER|BYPASSRLS/);
      expect(steps.find((s) => s.SkipIf?.Param === 'mj_codegen')?.Sql).toBe(`CREATE ROLE "mj_codegen" LOGIN PASSWORD 'cg-pw'`);
      expect(steps.find((s) => s.SkipIf?.Param === 'mj_api')?.Sql).toBe(`CREATE ROLE "mj_api" LOGIN PASSWORD 'api-pw'`);
    });

    it('creates the MJ group roles as NOLOGIN roles, skipping any that exist', () => {
      const steps = BuildPostgresSetupSteps(config);
      for (const role of POSTGRES_MJ_GROUP_ROLES) {
        expect(steps).toContainEqual({
          Database: 'postgres',
          Description: `Create group role ${role}`,
          Sql: `CREATE ROLE "${role}" NOLOGIN`,
          SkipIf: { Sql: 'SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', Param: role },
        });
      }
      expect(POSTGRES_MJ_GROUP_ROLES).toEqual(expect.arrayContaining(['cdp_Developer', 'cdp_Integration', 'cdp_UI']));
    });

    it('grants exactly the documented privileges in the MJ database', () => {
      const inDb = BuildPostgresSetupSteps(config).filter((s) => s.Database === 'mj_db').map((s) => s.Sql);

      expect(inDb).toEqual([
        'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
        'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
        'GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "mj_db" TO "mj_codegen"',
        'GRANT CONNECT, TEMPORARY ON DATABASE "mj_db" TO "mj_api"',
        'CREATE SCHEMA IF NOT EXISTS "__mj" AUTHORIZATION "mj_codegen"',
        'ALTER SCHEMA "__mj" OWNER TO "mj_codegen"',
        'GRANT USAGE ON SCHEMA "__mj" TO "mj_api"',
        'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "__mj" TO "mj_api"',
        'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "__mj" TO "mj_api"',
        'GRANT EXECUTE ON ALL ROUTINES IN SCHEMA "__mj" TO "mj_api"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "mj_codegen" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "mj_api"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "mj_codegen" GRANT USAGE, SELECT ON SEQUENCES TO "mj_api"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "mj_codegen" GRANT EXECUTE ON ROUTINES TO "mj_api"',
        'ALTER DEFAULT PRIVILEGES FOR ROLE "mj_codegen" GRANT USAGE ON SCHEMAS TO "mj_api"',
      ]);
    });

    it('turns on standard_conforming_strings before any password literal', () => {
      const steps = BuildPostgresSetupSteps(config);
      const scs = steps.findIndex((s) => s.Sql === 'SET standard_conforming_strings = on');
      const firstPassword = steps.findIndex((s) => s.Sql.includes('PASSWORD'));
      expect(scs).toBeGreaterThanOrEqual(0);
      expect(scs).toBeLessThan(firstPassword);
      expect(steps[scs].Database).toBe(steps[firstPassword].Database);
    });

    it('quotes hostile database names, role names, and passwords', () => {
      const steps = BuildPostgresSetupSteps({
        DatabaseName: 'my"db',
        CodeGenUser: 'cg"; DROP ROLE x; --',
        CodeGenPassword: `it's\\a$$b$mj$`,
        APIUser: 'Api User',
        APIPassword: "'; DROP DATABASE postgres; --",
      });
      const sql = steps.map((s) => s.Sql);

      expect(sql).toContain('CREATE DATABASE "my""db"');
      expect(sql).toContain(`CREATE ROLE "cg""; DROP ROLE x; --" LOGIN PASSWORD 'it''s\\a$$b$mj$'`);
      expect(sql).toContain(`CREATE ROLE "Api User" LOGIN PASSWORD '''; DROP DATABASE postgres; --'`);
      expect(steps.find((s) => s.Sql.startsWith('CREATE DATABASE'))?.SkipIf?.Param).toBe('my"db');
      expect(steps.every((s) => s.Database === 'postgres' || s.Database === 'my"db')).toBe(true);
    });

    it('renders the same statements as a psql script, with existence checks through \\gexec', () => {
      const steps = BuildPostgresSetupSteps({ ...config, CodeGenPassword: "o'k" });
      const script = RenderPostgresSetupScript(config, steps);

      expect(script).toContain('\\connect "postgres"');
      expect(script).toContain('\\connect "mj_db"');
      expect(script).toContain(
        `SELECT 'CREATE ROLE "mj_codegen" LOGIN PASSWORD ''o''''k''' WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'mj_codegen')\\gexec`
      );
      for (const step of steps.filter((s) => !s.SkipIf)) {
        expect(script).toContain(`${step.Sql};`);
      }
      // \connect appears once per change of database, never in the statements themselves.
      expect(script.match(/\\connect /g)).toHaveLength(2);
    });

    it('validation script checks the schema, both logins, and the API login\'s schema access', () => {
      const script = GeneratePostgresValidateScript(config);
      expect(script).toContain('\\connect "mj_db"');
      expect(script).toContain("[PASS] CodeGen login mj_codegen exists");
      expect(script).toContain("[PASS] API login mj_api exists");
      expect(script).toContain("has_schema_privilege('mj_api', '__mj', 'USAGE')");
    });

    it('QuotePgIdentifier and QuotePgLiteral', () => {
      expect(QuotePgIdentifier('a"b')).toBe('"a""b"');
      expect(QuotePgIdentifier('MixedCase')).toBe('"MixedCase"');
      expect(QuotePgLiteral("it's")).toBe("'it''s'");
      expect(QuotePgLiteral('back\\slash')).toBe("'back\\slash'");
    });
  });
});
