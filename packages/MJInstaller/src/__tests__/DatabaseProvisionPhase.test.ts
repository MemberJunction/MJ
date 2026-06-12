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
