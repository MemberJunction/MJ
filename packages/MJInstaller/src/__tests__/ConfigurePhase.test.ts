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
    it('should not overwrite existing .env', async () => {
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

      // Root .env should NOT be in FilesWritten (preserved)
      const rootEnvWritten = result.FilesWritten.some(f => f.endsWith('.env') && !f.includes('MJAPI'));
      expect(rootEnvWritten).toBe(false);
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
      expect(mjapiEnvContent).toBe('DB_HOST=localhost');
    });

    it('should not overwrite existing mj.config.cjs', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('mj.config.cjs')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.ReadText.mockResolvedValue('module.exports = { settings: {} };');
      mockFs.ListFiles.mockResolvedValue([]);

      const ctx = makeContext({ Yes: true });
      const result = await phase.Run(ctx);

      // mj.config.cjs should NOT be in FilesWritten (preserved)
      const configWritten = result.FilesWritten.some(f => f.endsWith('mj.config.cjs'));
      expect(configWritten).toBe(false);
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
      expect(patchedContent).toContain("userName: 'jdoe'");
      expect(patchedContent).toContain("email: 'jdoe@example.com'");
      expect(patchedContent).toContain("firstName: 'John'");
      expect(patchedContent).toContain("lastName: 'Doe'");
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
      expect(content).toContain("userName: 'new@example.com'");
      expect(content).not.toContain("userName: 'old@example.com'");
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
      expect(content).toContain("userName: 'inserted@example.com'");
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
      expect(envContent).toContain('PORT=4001');
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
  });
});
