import { createMockFileSystem } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleConfig } from './mocks/fixtures.js';
import type { ConfigureContext } from '../phases/ConfigurePhase.js';
import type { InstallConfig, PartialInstallConfig } from '../models/InstallConfig.js';

// ---------------------------------------------------------------------------
// Adapter mocks — ConfigurePhase creates FileSystemAdapter via `new`
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
vi.mock('../adapters/FileSystemAdapter.js', () => {
  return {
    FileSystemAdapter: function FileSystemAdapter() { return mockFs; },
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { ConfigurePhase } from '../phases/ConfigurePhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<ConfigureContext>): ConfigureContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Config: sampleConfig(),
    Yes: true,
    Emitter: emitter,
    ...overrides,
  };
}

/**
 * Extract all WriteText calls and find the one matching a path suffix.
 */
function findWrittenContent(pathSuffix: string): string | undefined {
  const calls = mockFs.WriteText.mock.calls as [string, string][];
  const match = calls.find(([p]) => p.endsWith(pathSuffix) || p.includes(pathSuffix));
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConfigurePhase', () => {
  let phase: ConfigurePhase;

  beforeEach(() => {
    // Reset all mock call history before each test
    for (const key of Object.keys(mockFs) as (keyof typeof mockFs)[]) {
      mockFs[key].mockReset();
    }

    phase = new ConfigurePhase();

    // Default: no files exist, directory structure exists
    mockFs.FileExists.mockResolvedValue(false);
    mockFs.DirectoryExists.mockImplementation(async (path: string) => {
      // MJAPI dir and Explorer environments parent dir exist
      if (path.includes('MJAPI')) return true;
      if (path.includes('MJExplorer')) return true;
      if (path.includes('environments')) return false; // environments dir itself does not exist
      return true;
    });
    mockFs.ReadText.mockResolvedValue('');
    mockFs.WriteText.mockResolvedValue(undefined);
    mockFs.CreateDirectory.mockResolvedValue(undefined);
    mockFs.ListFiles.mockResolvedValue([]);
  });

  // ─── .gitignore secret protection ──────────────────────────────────

  describe('.gitignore secret protection', () => {
    it('creates a .gitignore ignoring .env when none exists', async () => {
      // beforeEach default: FileExists → false (no .gitignore present)
      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      const gitignore = findWrittenContent('.gitignore');
      expect(gitignore).toBeDefined();
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.env.*');
      expect(gitignore).toContain('!.env.example');
      expect(result.FilesWritten.some((f) => f.endsWith('.gitignore'))).toBe(true);
    });

    it('appends only the missing env entries to an existing .gitignore (preserves user lines)', async () => {
      mockFs.FileExists.mockImplementation(async (p: string) => p.endsWith('.gitignore'));
      mockFs.ReadText.mockImplementation(async (p: string) =>
        p.endsWith('.gitignore') ? 'node_modules/\n.env\n' : '',
      );

      const ctx = makeContext({ Yes: true });
      await phase.Run(ctx);

      const gitignore = findWrittenContent('.gitignore');
      expect(gitignore).toBeDefined();
      expect(gitignore).toContain('node_modules/'); // existing line preserved
      expect(gitignore).toContain('.env.*'); // missing entries appended
      expect(gitignore).toContain('!.env.example');
      // .env already present → not duplicated as a standalone line
      const envLines = gitignore!.split(/\r?\n/).filter((l) => l.trim() === '.env');
      expect(envLines).toHaveLength(1);
    });

    it('does not rewrite a .gitignore that already covers env secrets', async () => {
      const complete = '.env\n.env.*\n!.env.example\n';
      mockFs.FileExists.mockImplementation(async (p: string) => p.endsWith('.gitignore'));
      mockFs.ReadText.mockImplementation(async (p: string) =>
        p.endsWith('.gitignore') ? complete : '',
      );

      const ctx = makeContext({ Yes: true });
      await phase.Run(ctx);

      const wroteGitignore = (mockFs.WriteText.mock.calls as [string, string][]).some(([p]) =>
        p.endsWith('.gitignore'),
      );
      expect(wroteGitignore).toBe(false);
    });
  });

  // ─── yes mode with full config ─────────────────────────────────────

  describe('yes mode with full config', () => {
    it('should write .env and mj.config.cjs without prompts', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });
      const result = await phase.Run(ctx);

      // Files should have been written
      expect(result.FilesWritten.length).toBeGreaterThan(0);

      // No prompt events should be emitted in yes mode
      const prompts = emittedEvents(emitSpy, 'prompt');
      expect(prompts).toHaveLength(0);
    });

    it('should write .env with correct database credentials', async () => {
      const config = sampleConfig();
      config.DatabaseHost = 'db-server.local';
      config.DatabasePort = 1434;
      config.DatabaseName = 'TestDB';
      config.APIUser = 'test_api';
      config.APIPassword = 'api_pass_123';
      config.CodeGenUser = 'test_codegen';
      config.CodeGenPassword = 'codegen_pass_456';

      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envContent = findWrittenContent('.env');
      expect(envContent).toBeDefined();
      expect(envContent).toContain("DB_HOST='db-server.local'");
      expect(envContent).toContain('DB_PORT=1434');
      expect(envContent).toContain("DB_DATABASE='TestDB'");
      expect(envContent).toContain("DB_USERNAME='test_api'");
      expect(envContent).toContain("DB_PASSWORD='api_pass_123'");
      expect(envContent).toContain("CODEGEN_DB_USERNAME='test_codegen'");
      expect(envContent).toContain("CODEGEN_DB_PASSWORD='codegen_pass_456'");
    });

    it('should write mj.config.cjs with host, port, and database', async () => {
      const config = sampleConfig();
      config.DatabaseHost = 'myhost';
      config.DatabasePort = 1500;
      config.DatabaseName = 'MyDB';

      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const configContent = findWrittenContent('mj.config.cjs');
      expect(configContent).toBeDefined();
      expect(configContent).toContain("host: 'myhost'");
      expect(configContent).toContain('port: 1500');
      expect(configContent).toContain("database: 'MyDB'");
      expect(configContent).toContain('encryptionKeys: {');
      expect(configContent).toContain('MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY ||');
    });
  });

  // ─── Auth provider mapping ─────────────────────────────────────────

  describe('auth provider mapping in .env', () => {
    it('should map AuthProvider none to AUTH_TYPE msal', async () => {
      const config = sampleConfig();
      config.AuthProvider = 'none';
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      // The .env uses AUTH_TYPE indirectly through environment files,
      // but let's verify the environment files are created with msal
      // The .env doesn't contain AUTH_TYPE directly, but environment files do.
      // Check that environment.ts was created with msal
      const envTsContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('environment.ts') && !p.includes('development')
      )?.[1];
      expect(envTsContent).toBeDefined();
      expect(envTsContent).toContain("AUTH_TYPE: 'msal'");
    });

    it('exports the environment object `as const` so union fields keep their literal types', async () => {
      const config = sampleConfig();
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envTsContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('environment.ts') && !p.includes('development')
      )?.[1];
      const envDevContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('environment.development.ts')
      )?.[1];
      expect(envTsContent).toContain('} as const;');
      expect(envDevContent).toContain('} as const;');
    });

    it('should map AuthProvider entra to AUTH_TYPE msal', async () => {
      const config = sampleConfig();
      config.AuthProvider = 'entra';
      config.AuthProviderValues = { TenantID: 'tenant-123', ClientID: 'client-abc' };
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envTsContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('environment.ts') && !p.includes('development')
      )?.[1];
      expect(envTsContent).toBeDefined();
      expect(envTsContent).toContain("AUTH_TYPE: 'msal'");
      expect(envTsContent).toContain("CLIENT_ID: 'client-abc'");
      expect(envTsContent).toContain("TENANT_ID: 'tenant-123'");
    });

    it('should map AuthProvider auth0 to AUTH_TYPE auth0', async () => {
      const config = sampleConfig();
      config.AuthProvider = 'auth0';
      config.AuthProviderValues = { Domain: 'myapp.auth0.com', ClientID: 'auth0-client' };
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envTsContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('environment.ts') && !p.includes('development')
      )?.[1];
      expect(envTsContent).toBeDefined();
      expect(envTsContent).toContain("AUTH_TYPE: 'auth0'");
      expect(envTsContent).toContain("AUTH0_DOMAIN: 'myapp.auth0.com'");
    });
  });

  // ─── Existing file preservation ────────────────────────────────────

  describe('existing file preservation', () => {
    it('should preserve existing .env values and append MJ_BASE_ENCRYPTION_KEY when missing', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return true; // .env exists
        return false;
      });
      // MJAPI .env does not exist but its dir does
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('EXISTING_CONTENT=true');
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      const rootEnvWritten = result.FilesWritten.some(f => f.endsWith('.env') && !f.includes('MJAPI'));
      expect(rootEnvWritten).toBe(true);

      const rootEnvContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('.env') && !p.includes('MJAPI')
      )?.[1];
      expect(rootEnvContent).toContain('EXISTING_CONTENT=true');
      expect(rootEnvContent).toContain("MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='");
    });

    it('should copy root .env to MJAPI when root exists but MJAPI does not', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env') && path.includes('MJAPI')) return false;
        if (path.endsWith('.env')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('DB_HOST=localhost');
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      // MJAPI .env should be written
      const mjapiEnvWritten = result.FilesWritten.some(f => f.includes('MJAPI') && f.endsWith('.env'));
      expect(mjapiEnvWritten).toBe(true);

      // Content should match root .env
      const mjapiEnvContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJAPI') && p.endsWith('.env')
      )?.[1];
      expect(mjapiEnvContent).toContain('DB_HOST=localhost');
      expect(mjapiEnvContent).toContain("MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='");
    });

    it('should sync DB_HOST/DB_PORT from root .env into existing MJAPI .env (Bug 5 fix)', async () => {
      // Both root and MJAPI .env exist; MJAPI has stale DB values
      mockFs.FileExists.mockResolvedValue(true);
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListFiles.mockResolvedValue([]);

      const rootEnv = [
        "DB_HOST='docker-sql'",
        'DB_PORT=1444',
        "DB_USERNAME='sa'",
        "DB_PASSWORD='Strong!Pass'",
        "MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='",
        '',
      ].join('\n');
      const mjapiEnv = [
        "DB_HOST='localhost'",
        'DB_PORT=1433',
        "DB_USERNAME='MJ_Connect'",
        "DB_PASSWORD=''",
        "ASK_SKIP_API_URL='http://localhost:8000'",  // MJAPI-only key — must survive
        '',
      ].join('\n');

      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('MJAPI') && p.endsWith('.env')) return mjapiEnv;
        if (p.endsWith('.env')) return rootEnv;
        return '';
      });

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      const mjapiEnvWritten = result.FilesWritten.find((f: string) => f.includes('MJAPI') && f.endsWith('.env'));
      expect(mjapiEnvWritten).toBeDefined();

      const writtenContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJAPI') && p.endsWith('.env')
      )?.[1] as string;

      // DB fields should match root .env, not the original MJAPI values
      expect(writtenContent).toContain("DB_HOST='docker-sql'");
      expect(writtenContent).toContain("DB_PORT='1444'");
      expect(writtenContent).toContain("DB_USERNAME='sa'");
      expect(writtenContent).toContain("DB_PASSWORD='Strong!Pass'");
      // MJAPI-only key should survive
      expect(writtenContent).toContain("ASK_SKIP_API_URL='http://localhost:8000'");
      // Original wrong DB values should be gone
      expect(writtenContent).not.toContain("DB_HOST='localhost'");
      expect(writtenContent).not.toContain("DB_USERNAME='MJ_Connect'");
    });

    it('should sync PG_HOST/PG_PORT and PG creds root → MJAPI when present (PG install)', async () => {
      // PostgreSQL install path — codegen-lib accepts PG_* env vars on PG
      // installs, so root → MJAPI sync must propagate those keys too.
      // Without this, a PG user editing root `.env` would leave MJAPI with
      // the original PG credentials and the API would silently connect to
      // the wrong target.
      mockFs.FileExists.mockResolvedValue(true);
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ListFiles.mockResolvedValue([]);

      const rootEnv = [
        "PG_HOST='pg.docker'",
        'PG_PORT=5433',
        "PG_DATABASE='mj_pg'",
        "PG_USERNAME='mj_codegen'",
        "PG_PASSWORD='PgStrong!Pass'",
        "MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='",
        '',
      ].join('\n');
      const mjapiEnv = [
        "PG_HOST='localhost'",
        'PG_PORT=5432',
        "PG_DATABASE='mj_old'",
        "PG_USERNAME='old_user'",
        "PG_PASSWORD='old_pwd'",
        "ASK_SKIP_API_URL='http://localhost:8000'",  // MJAPI-only key — must survive
        '',
      ].join('\n');

      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('MJAPI') && p.endsWith('.env')) return mjapiEnv;
        if (p.endsWith('.env')) return rootEnv;
        return '';
      });

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      const mjapiEnvWritten = result.FilesWritten.find((f: string) => f.includes('MJAPI') && f.endsWith('.env'));
      expect(mjapiEnvWritten).toBeDefined();

      const writtenContent = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJAPI') && p.endsWith('.env')
      )?.[1] as string;

      // PG fields should match root .env, not the original MJAPI values
      expect(writtenContent).toContain("PG_HOST='pg.docker'");
      expect(writtenContent).toContain("PG_PORT='5433'");
      expect(writtenContent).toContain("PG_DATABASE='mj_pg'");
      expect(writtenContent).toContain("PG_USERNAME='mj_codegen'");
      expect(writtenContent).toContain("PG_PASSWORD='PgStrong!Pass'");
      // MJAPI-only key should survive
      expect(writtenContent).toContain("ASK_SKIP_API_URL='http://localhost:8000'");
      // Original wrong PG values should be gone
      expect(writtenContent).not.toContain("PG_HOST='localhost'");
      expect(writtenContent).not.toContain("PG_USERNAME='old_user'");
    });

    it('should not overwrite existing mj.config.cjs', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('module.exports = { settings: {}, encryptionKeys: { MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY || "" } };');
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      // mj.config.cjs should NOT be in FilesWritten (preserved)
      const configWritten = result.FilesWritten.some(f => f.endsWith('mj.config.cjs'));
      expect(configWritten).toBe(false);
    });

    it('should patch MJ_BASE_ENCRYPTION_KEY into existing .env when missing', async () => {
      mockFs.FileExists.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('.env')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('DB_HOST=localhost');
      mockFs.ListFiles.mockResolvedValue([]);

      await phase.Run(makeContext({ Yes: true }));

      const envWriteCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('.env') && !p.includes('MJAPI')
      );
      expect(envWriteCall).toBeDefined();
      expect(envWriteCall?.[1]).toContain("MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='");
    });

    it('should patch encryptionKeys into existing mj.config.cjs when missing', async () => {
      mockFs.FileExists.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue(`module.exports = {
  settings: { host: 'localhost', port: 1433, database: 'MJ' },
  output: [],
};
`);
      mockFs.ListFiles.mockResolvedValue([]);

      await phase.Run(makeContext({ Yes: true }));

      const configWriteCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('mj.config.cjs')
      );
      expect(configWriteCall).toBeDefined();
      expect(configWriteCall?.[1]).toContain('encryptionKeys: {');
      expect(configWriteCall?.[1]).toContain('MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY ||');
    });

    it('should patch CreateNewUser into existing mj.config.cjs', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue(`module.exports = {
  settings: { host: 'localhost', port: 1433, database: 'MJ' },
  output: [],
};
`);
      mockFs.ListFiles.mockResolvedValue([]);

      const config = sampleConfig();
      config.CreateNewUser = {
        Username: 'jdoe',
        Email: 'jdoe@example.com',
        FirstName: 'John',
        LastName: 'Doe',
      };

      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      // Find the WriteText call for mj.config.cjs (patching writes to it)
      const configWriteCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('mj.config.cjs')
      );
      expect(configWriteCall).toBeDefined();
      const patchedContent = configWriteCall![1];
      expect(patchedContent).toContain("UserName: 'jdoe'");
      expect(patchedContent).toContain("Email: 'jdoe@example.com'");
      expect(patchedContent).toContain("FirstName: 'John'");
      expect(patchedContent).toContain("LastName: 'Doe'");
    });
  });

  // ─── patchNewUserSetup ─────────────────────────────────────────────

  describe('patchNewUserSetup', () => {
    it('should replace existing newUserSetup block', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue(`module.exports = {
  settings: { host: 'localhost' },
  newUserSetup: {
    userName: 'old@example.com',
    firstName: 'Old',
    lastName: 'User',
    email: 'old@example.com',
  },
  output: [],
};
`);
      mockFs.ListFiles.mockResolvedValue([]);

      const config = sampleConfig();
      config.CreateNewUser = {
        Username: 'new@example.com',
        Email: 'new@example.com',
        FirstName: 'New',
        LastName: 'User',
      };

      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const configWriteCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('mj.config.cjs')
      );
      expect(configWriteCall).toBeDefined();
      const content = configWriteCall![1];
      expect(content).toContain("UserName: 'new@example.com'");
      expect(content).not.toContain("UserName: 'old@example.com'");
    });

    it('should insert newUserSetup before closing }; when no existing block', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue(`module.exports = {
  settings: { host: 'localhost' },
  output: [],
};
`);
      mockFs.ListFiles.mockResolvedValue([]);

      const config = sampleConfig();
      config.CreateNewUser = {
        Username: 'inserted@example.com',
        Email: 'inserted@example.com',
        FirstName: 'Inserted',
        LastName: 'User',
      };

      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const configWriteCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.endsWith('mj.config.cjs')
      );
      expect(configWriteCall).toBeDefined();
      const content = configWriteCall![1];
      expect(content).toContain("UserName: 'inserted@example.com'");
      expect(content).toContain('};'); // closing still present
    });
  });

  // ─── Explorer environment files ────────────────────────────────────

  describe('Explorer environment files', () => {
    it('should create environment.ts and environment.development.ts when missing', async () => {
      // Simulate: MJExplorer/src exists but environments dir doesn't
      mockFs.DirectoryExists.mockImplementation(async (path: string) => {
        if (path.includes('environments')) return false;
        if (path.includes('MJExplorer/src') || path.includes('MJExplorer\\src')) return true;
        return true;
      });
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      // CreateDirectory should have been called for environments
      expect(mockFs.CreateDirectory).toHaveBeenCalled();

      // Both environment files should be written
      const envTsWritten = result.FilesWritten.some(f => f.endsWith('environment.ts'));
      const devTsWritten = result.FilesWritten.some(f => f.endsWith('environment.development.ts'));
      expect(envTsWritten).toBe(true);
      expect(devTsWritten).toBe(true);
    });

    it('should preserve existing environment files', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.ListFiles.mockImplementation(async (dir: string) => {
        if (dir.includes('environments')) return ['environment.ts', 'environment.development.ts'];
        return [];
      });

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      // Existing environment files should NOT be in FilesWritten
      const envTsWritten = result.FilesWritten.some(f => f.endsWith('environment.ts'));
      expect(envTsWritten).toBe(false);
    });

    it('should patch MJExplorer package.json start script with --port when ExplorerPort != 4200 (Bug 7 fix)', async () => {
      const startScriptBefore = 'cross-env NODE_OPTIONS=--max-old-space-size=16384 ng serve';
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockImplementation(async (p: string) => p.includes('MJExplorer') && p.endsWith('package.json'));
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('MJExplorer') && p.endsWith('package.json')) {
          return JSON.stringify({
            name: 'mj_explorer',
            scripts: {
              start: startScriptBefore,
              'start:stage': `${startScriptBefore} --configuration staging`,
              build: 'ng build',
            },
          });
        }
        return '';
      });
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({
        Config: { ...sampleConfig(), ExplorerPort: 4210 },
        Yes: true,
      });
      const result = await phase.Run(ctx);

      const writeCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJExplorer') && p.endsWith('package.json')
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall![1]);
      expect(written.scripts.start).toContain('--port 4210');
      expect(written.scripts['start:stage']).toContain('--port 4210');
      // Non-ng-serve scripts should NOT be touched
      expect(written.scripts.build).toBe('ng build');
      expect(result.FilesWritten.some((f: string) => f.includes('MJExplorer') && f.endsWith('package.json'))).toBe(true);
    });

    it('should NOT patch start script when ExplorerPort is 4200 (default)', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({
        Config: { ...sampleConfig(), ExplorerPort: 4200 },
        Yes: true,
      });
      await phase.Run(ctx);

      // No package.json should have been written for MJExplorer
      const explorerPkgWrite = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJExplorer') && p.endsWith('package.json')
      );
      expect(explorerPkgWrite).toBeUndefined();
    });

    it('should NOT patch when start script already declares --port', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockImplementation(async (p: string) => p.includes('MJExplorer') && p.endsWith('package.json'));
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('MJExplorer') && p.endsWith('package.json')) {
          return JSON.stringify({
            name: 'mj_explorer',
            scripts: { start: 'ng serve --port 9999' },
          });
        }
        return '';
      });
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({
        Config: { ...sampleConfig(), ExplorerPort: 4210 },
        Yes: true,
      });
      await phase.Run(ctx);

      const writeCall = mockFs.WriteText.mock.calls.find(
        ([p]: [string, string]) => p.includes('MJExplorer') && p.endsWith('package.json')
      );
      expect(writeCall).toBeUndefined();
    });

    it('should emit warn when Explorer directory cannot be found', async () => {
      // No MJExplorer/src dir exists in any candidate location
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.ListFiles.mockResolvedValue([]);

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });
      const result = await phase.Run(ctx);

      const warnEvents = emittedEvents(emitSpy, 'warn');
      const explorerWarn = warnEvents.find((e: unknown) =>
        (e as Record<string, string>).Message?.includes('MJExplorer')
      );
      expect(explorerWarn).toBeDefined();

      // No environment files should be written
      const envFilesWritten = result.FilesWritten.filter(f =>
        f.includes('environment')
      );
      expect(envFilesWritten).toHaveLength(0);
    });
  });

  // ─── OverwriteConfig flag ───────────────────────────────────────────

  describe('OverwriteConfig flag', () => {
    it('should overwrite existing .env when OverwriteConfig is true', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('OLD_CONTENT=should_be_replaced');
      mockFs.ListFiles.mockResolvedValue([]);

      const config = sampleConfig();
      config.DatabaseHost = 'new-host';
      const ctx = makeContext({ Config: config, Yes: true, OverwriteConfig: true });
      const result = await phase.Run(ctx);

      // .env should be in FilesWritten (overwritten, not preserved)
      const rootEnvWritten = result.FilesWritten.some(f => f.endsWith('.env') && !f.includes('MJAPI'));
      expect(rootEnvWritten).toBe(true);

      // Content should be freshly generated, not the old content
      const envContent = findWrittenContent('.env');
      expect(envContent).not.toContain('OLD_CONTENT');
      expect(envContent).toContain("DB_HOST='new-host'");
    });

    it('should overwrite existing mj.config.cjs when OverwriteConfig is true', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('module.exports = { old: true };');
      mockFs.ListFiles.mockResolvedValue([]);

      const config = sampleConfig();
      config.DatabaseHost = 'overwrite-host';
      const ctx = makeContext({ Config: config, Yes: true, OverwriteConfig: true });
      const result = await phase.Run(ctx);

      const configWritten = result.FilesWritten.some(f => f.endsWith('mj.config.cjs'));
      expect(configWritten).toBe(true);

      const configContent = findWrittenContent('mj.config.cjs');
      expect(configContent).not.toContain('old: true');
      expect(configContent).toContain("host: 'overwrite-host'");
    });

    it('should overwrite existing environment.ts files when OverwriteConfig is true', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.ListFiles.mockImplementation(async (dir: string) => {
        if (dir.includes('environments')) return ['environment.ts', 'environment.development.ts'];
        return [];
      });
      mockFs.ReadText.mockResolvedValue("AUTH_TYPE: 'auth0'");

      const config = sampleConfig();
      config.AuthProvider = 'entra';
      config.AuthProviderValues = { TenantID: 'new-tenant', ClientID: 'new-client' };
      const ctx = makeContext({ Config: config, Yes: true, OverwriteConfig: true });
      const result = await phase.Run(ctx);

      // Environment files should be in FilesWritten (overwritten, not preserved)
      const envTsWritten = result.FilesWritten.some(f => f.endsWith('environment.ts'));
      const devTsWritten = result.FilesWritten.some(f => f.endsWith('environment.development.ts'));
      expect(envTsWritten).toBe(true);
      expect(devTsWritten).toBe(true);
    });

    it('should preserve existing files when OverwriteConfig is false (default)', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return true;
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('module.exports = { settings: {}, encryptionKeys: { MJ_BASE_ENCRYPTION_KEY: process.env.MJ_BASE_ENCRYPTION_KEY || "" } };');
      mockFs.ListFiles.mockImplementation(async (dir: string) => {
        if (dir.includes('environments')) return ['environment.ts'];
        return [];
      });

      const ctx = makeContext({ Yes: true }); // OverwriteConfig not set
      const result = await phase.Run(ctx);

      // mj.config.cjs should NOT be in FilesWritten (preserved)
      const configWritten = result.FilesWritten.some(f => f.endsWith('mj.config.cjs'));
      expect(configWritten).toBe(false);
    });

    it('should log overwrite mode message when OverwriteConfig is true', async () => {
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.DirectoryExists.mockImplementation(async (path: string) => {
        if (path.includes('environments')) return false;
        if (path.includes('MJExplorer/src') || path.includes('MJExplorer\\src')) return true;
        return true;
      });
      mockFs.ListFiles.mockResolvedValue([]);

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, OverwriteConfig: true, Emitter: emitter });
      await phase.Run(ctx);

      const logEvents = emittedEvents(emitSpy, 'log');
      const overwriteLog = logEvents.find((e: unknown) =>
        (e as Record<string, string>).Message?.includes('Overwrite mode enabled')
      );
      expect(overwriteLog).toBeDefined();
    });
  });

  // ─── Warning about default values in yes mode ──────────────────────

  describe('yes mode default values warning', () => {
    it('should emit warn about default values when files are created in yes mode', async () => {
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.DirectoryExists.mockImplementation(async (path: string) => {
        if (path.includes('environments')) return false;
        if (path.includes('MJExplorer/src') || path.includes('MJExplorer\\src')) return true;
        return true;
      });
      mockFs.ListFiles.mockResolvedValue([]);

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Yes: true, Emitter: emitter });
      await phase.Run(ctx);

      const warnEvents = emittedEvents(emitSpy, 'warn');
      const defaultWarn = warnEvents.find((e: unknown) =>
        (e as Record<string, string>).Message?.includes('default/empty values')
      );
      expect(defaultWarn).toBeDefined();
    });
  });

  // ─── .env content details ──────────────────────────────────────────

  describe('.env content', () => {
    it('should include API port', async () => {
      const config = sampleConfig();
      config.APIPort = 4001;
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envContent = findWrittenContent('.env');
      expect(envContent).toBeDefined();
      expect(envContent).toContain('GRAPHQL_PORT=4001');
    });

    it('should include AI vendor keys when provided', async () => {
      const config = sampleConfig();
      config.OpenAIKey = 'sk-openai-test';
      config.AnthropicKey = 'sk-ant-test';
      config.MistralKey = 'sk-mistral-test';
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envContent = findWrittenContent('.env');
      expect(envContent).toBeDefined();
      expect(envContent).toContain("AI_VENDOR_API_KEY__OpenAILLM='sk-openai-test'");
      expect(envContent).toContain("AI_VENDOR_API_KEY__AnthropicLLM='sk-ant-test'");
      expect(envContent).toContain("AI_VENDOR_API_KEY__MistralLLM='sk-mistral-test'");
    });

    it('should include MJ_BASE_ENCRYPTION_KEY', async () => {
      const ctx = makeContext({ Yes: true });
      await phase.Run(ctx);

      const envContent = findWrittenContent('.env');
      expect(envContent).toBeDefined();
      expect(envContent).toContain("MJ_BASE_ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='");
    });

    it('should include DB_TRUST_SERVER_CERTIFICATE when TrustCert is true', async () => {
      const config = sampleConfig();
      config.DatabaseTrustCert = true;
      const ctx = makeContext({ Config: config, Yes: true });
      await phase.Run(ctx);

      const envContent = findWrittenContent('.env');
      expect(envContent).toBeDefined();
      expect(envContent).toContain('DB_TRUST_SERVER_CERTIFICATE=1');
    });
  });

  // ─── Config resolution output ──────────────────────────────────────

  describe('resolved config', () => {
    it('should return the fully resolved config in the result', async () => {
      const config = sampleConfig();
      const ctx = makeContext({ Config: config, Yes: true });
      const result = await phase.Run(ctx);

      expect(result.Config.DatabaseHost).toBe(config.DatabaseHost);
      expect(result.Config.DatabasePort).toBe(config.DatabasePort);
      expect(result.Config.DatabaseName).toBe(config.DatabaseName);
      expect(result.Config.AuthProvider).toBe(config.AuthProvider);
    });

    it('should generate a base encryption key when one is not provided', async () => {
      const config = sampleConfig();
      delete config.BaseEncryptionKey;

      const result = await phase.Run(makeContext({ Config: config, Yes: true }));

      expect(result.Config.BaseEncryptionKey).toBeDefined();
      expect(result.Config.BaseEncryptionKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });
});
