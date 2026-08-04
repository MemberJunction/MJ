import { createMockFileSystem, createMockSqlAdapter } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleConfig } from './mocks/fixtures.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Adapter mocks — DatabaseProvisionPhase creates adapters via `new`
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
const mockSql = createMockSqlAdapter();

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

vi.mock('../adapters/SqlServerAdapter.js', () => {
  return {
    SqlServerAdapter: class {
      CheckConnectivity = mockSql.CheckConnectivity;
    },
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import {
  DatabaseProvisionPhase,
  type DatabaseProvisionContext,
} from '../phases/DatabaseProvisionPhase.js';

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

  describe('interactive mode', () => {
    it('should emit prompt event with PromptId run-db-script when Yes=false', async () => {
      const { emitter, emitSpy } = createMockEmitter();

      // Auto-resolve the prompt so the phase continues
      emitter.On('prompt', (e) => {
        e.Resolve('yes');
      });

      const ctx = makeContext({ Yes: false, Emitter: emitter });

      await phase.Run(ctx);

      const prompts = emittedEvents(emitSpy, 'prompt') as Array<{ PromptId: string }>;
      expect(prompts.length).toBe(1);
      expect(prompts[0].PromptId).toBe('run-db-script');
    });
  });

  describe('non-interactive (--yes) mode', () => {
    it('should skip prompt and emit warn about non-interactive mode', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });

      await phase.Run(ctx);

      const warns = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      expect(warns.length).toBeGreaterThanOrEqual(1);
      expect(warns[0].Message).toContain('Non-interactive mode');

      // No prompt events should be emitted
      const prompts = emittedEvents(emitSpy, 'prompt');
      expect(prompts.length).toBe(0);
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
  });
});
