import { createMockFileSystem, createMockProcessRunner, createMockSqlAdapter } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { samplePartialConfig } from './mocks/fixtures.js';
import type { PreflightContext } from '../phases/PreflightPhase.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';

// ---------------------------------------------------------------------------
// Adapter mocks — PreflightPhase creates adapters via `new` in its constructor
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
vi.mock('../adapters/FileSystemAdapter.js', () => {
  return {
    FileSystemAdapter: function FileSystemAdapter() { return mockFs; },
  };
});

const mockProcess = createMockProcessRunner();
vi.mock('../adapters/ProcessRunner.js', () => {
  return {
    ProcessRunner: function ProcessRunner() { return mockProcess; },
  };
});

const mockSql = createMockSqlAdapter();
vi.mock('../adapters/SqlServerAdapter.js', () => {
  return {
    SqlServerAdapter: function SqlServerAdapter() { return mockSql; },
  };
});

// ---------------------------------------------------------------------------
// Mock node:net — isPortInUse creates a net.createServer() internally
// ---------------------------------------------------------------------------

let netServerBehavior: 'listening' | 'EADDRINUSE' | 'other-error' = 'listening';

vi.mock('node:net', () => {
  const mockServer = {
    once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      // Defer event emission until listen() is called
      if (event === 'listening' && netServerBehavior === 'listening') {
        // store so listen() can fire it
        (mockServer as Record<string, unknown>)._listeningCb = cb;
      }
      if (event === 'error') {
        (mockServer as Record<string, unknown>)._errorCb = cb;
      }
    }),
    listen: vi.fn(() => {
      if (netServerBehavior === 'listening') {
        const cb = (mockServer as Record<string, (...args: unknown[]) => void>)._listeningCb;
        if (cb) cb();
      } else if (netServerBehavior === 'EADDRINUSE') {
        const cb = (mockServer as Record<string, (...args: unknown[]) => void>)._errorCb;
        if (cb) cb({ code: 'EADDRINUSE' });
      } else {
        const cb = (mockServer as Record<string, (...args: unknown[]) => void>)._errorCb;
        if (cb) cb({ code: 'EACCES' });
      }
    }),
    close: vi.fn((cb?: () => void) => { if (cb) cb(); }),
  };

  return {
    default: { createServer: vi.fn(() => ({ ...mockServer, once: vi.fn(mockServer.once), listen: vi.fn(mockServer.listen), close: vi.fn(mockServer.close) })) },
    createServer: vi.fn(() => ({ ...mockServer, once: vi.fn(mockServer.once), listen: vi.fn(mockServer.listen), close: vi.fn(mockServer.close) })),
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { PreflightPhase } from '../phases/PreflightPhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<PreflightContext>): PreflightContext {
  const { emitter } = createMockEmitter();
  return {
    TargetDir: '/test/install',
    Config: samplePartialConfig(),
    SkipDB: false,
    Emitter: emitter,
    ...overrides,
  };
}

/**
 * Set process.version to a specific value for a test.
 * Returns a cleanup function.
 */
function mockNodeVersion(version: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'version');
  Object.defineProperty(process, 'version', { value: version, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(process, 'version', original);
    }
  };
}

/**
 * Set process.platform to a specific value for a test.
 * Returns a cleanup function.
 */
function mockPlatform(platform: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(process, 'platform', original);
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreflightPhase', () => {
  let phase: PreflightPhase;

  beforeEach(() => {
    // Reset all mock call history before each test
    for (const key of Object.keys(mockFs) as (keyof typeof mockFs)[]) {
      mockFs[key].mockReset();
    }
    for (const key of Object.keys(mockProcess) as (keyof typeof mockProcess)[]) {
      mockProcess[key].mockReset();
    }
    mockSql.CheckConnectivity.mockReset();

    phase = new PreflightPhase();

    // Default happy-path mocks
    mockProcess.RunSimple.mockResolvedValue('10.9.0');
    mockFs.GetFreeDiskSpace.mockResolvedValue(10_000_000_000); // 10 GB
    mockFs.CanWrite.mockResolvedValue(true);
    mockFs.FileExists.mockResolvedValue(true);
    mockFs.DirectoryExists.mockResolvedValue(true);
    mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 15 });
    netServerBehavior = 'listening';
  });

  // ─── Node version checks ───────────────────────────────────────────

  describe('Node.js version check', () => {
    it('should pass for Node v22+', async () => {
      const restore = mockNodeVersion('v22.0.0');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        const nodeCheck = result.Diagnostics.Checks.find(c => c.Name === 'Node.js version');
        expect(nodeCheck).toBeDefined();
        expect(nodeCheck!.Status).toBe('pass');
        expect(nodeCheck!.Message).toContain('v22.0.0');
      } finally {
        restore();
      }
    });

    it('should fail for Node v16', async () => {
      const restore = mockNodeVersion('v16.0.0');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        const nodeCheck = result.Diagnostics.Checks.find(c => c.Name === 'Node.js version');
        expect(nodeCheck).toBeDefined();
        expect(nodeCheck!.Status).toBe('fail');
        expect(nodeCheck!.Message).toContain('v16.0.0');
        expect(nodeCheck!.Message).toContain('>= 22');
        expect(result.Passed).toBe(false);
      } finally {
        restore();
      }
    });

    it('should emit info recommendation when on v22 (below recommended v24)', async () => {
      const restore = mockNodeVersion('v22.11.0');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        const recCheck = result.Diagnostics.Checks.find(c => c.Name === 'Node.js recommendation');
        expect(recCheck).toBeDefined();
        expect(recCheck!.Status).toBe('info');
        expect(recCheck!.Message).toContain('24');
      } finally {
        restore();
      }
    });

    it('should not emit recommendation for v24+', async () => {
      const restore = mockNodeVersion('v24.0.0');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        const recCheck = result.Diagnostics.Checks.find(c => c.Name === 'Node.js recommendation');
        expect(recCheck).toBeUndefined();
      } finally {
        restore();
      }
    });
  });

  // ─── npm check ─────────────────────────────────────────────────────

  describe('npm check', () => {
    it('should pass when npm is found', async () => {
      mockProcess.RunSimple.mockResolvedValue('10.9.0');
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const npmCheck = result.Diagnostics.Checks.find(c => c.Name === 'npm');
      expect(npmCheck).toBeDefined();
      expect(npmCheck!.Status).toBe('pass');
      expect(npmCheck!.Message).toContain('10.9.0');
    });

    it('should fail when npm is not found (RunSimple throws)', async () => {
      mockProcess.RunSimple.mockRejectedValue(new Error('npm not found'));
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const npmCheck = result.Diagnostics.Checks.find(c => c.Name === 'npm');
      expect(npmCheck).toBeDefined();
      expect(npmCheck!.Status).toBe('fail');
      expect(npmCheck!.Message).toContain('not found');
    });
  });

  // ─── Disk space check ──────────────────────────────────────────────

  describe('Disk space check', () => {
    it('should pass when disk space exceeds 2GB', async () => {
      mockFs.GetFreeDiskSpace.mockResolvedValue(5 * 1024 * 1024 * 1024); // 5 GB
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const diskCheck = result.Diagnostics.Checks.find(c => c.Name === 'Disk space');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.Status).toBe('pass');
      expect(diskCheck!.Message).toContain('5.0 GB');
    });

    it('should fail when disk space is below 2GB', async () => {
      mockFs.GetFreeDiskSpace.mockResolvedValue(0.5 * 1024 * 1024 * 1024); // 0.5 GB
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const diskCheck = result.Diagnostics.Checks.find(c => c.Name === 'Disk space');
      expect(diskCheck).toBeDefined();
      expect(diskCheck!.Status).toBe('fail');
      expect(diskCheck!.Message).toContain('0.5 GB');
      expect(result.Passed).toBe(false);
    });
  });

  // ─── Port availability ─────────────────────────────────────────────

  describe('Port availability check', () => {
    it('should pass when port is available (server can listen)', async () => {
      netServerBehavior = 'listening';
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const apiPortCheck = result.Diagnostics.Checks.find(c => c.Name.includes('4000') && c.Name.includes('API'));
      expect(apiPortCheck).toBeDefined();
      expect(apiPortCheck!.Status).toBe('pass');
    });

    it('should warn when port is in use (EADDRINUSE)', async () => {
      netServerBehavior = 'EADDRINUSE';
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const apiPortCheck = result.Diagnostics.Checks.find(c => c.Name.includes('4000') && c.Name.includes('API'));
      expect(apiPortCheck).toBeDefined();
      expect(apiPortCheck!.Status).toBe('warn');
      expect(apiPortCheck!.Message).toContain('in use');
    });
  });

  // ─── SQL connectivity ──────────────────────────────────────────────

  describe('SQL Server connectivity check', () => {
    it('should pass when SQL Server is reachable', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({ Reachable: true, LatencyMs: 10 });
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const sqlCheck = result.Diagnostics.Checks.find(c => c.Name === 'SQL Server connectivity');
      expect(sqlCheck).toBeDefined();
      expect(sqlCheck!.Status).toBe('pass');
      expect(sqlCheck!.Message).toContain('10ms');
    });

    it('should fail when SQL Server is not reachable', async () => {
      mockSql.CheckConnectivity.mockResolvedValue({
        Reachable: false,
        ErrorMessage: 'Connection refused',
      });
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const sqlCheck = result.Diagnostics.Checks.find(c => c.Name === 'SQL Server connectivity');
      expect(sqlCheck).toBeDefined();
      expect(sqlCheck!.Status).toBe('fail');
      expect(sqlCheck!.Message).toContain('Connection refused');
      expect(result.Passed).toBe(false);
    });

    it('should skip SQL check when SkipDB is true', async () => {
      const ctx = makeContext({ SkipDB: true });
      const result = await phase.Run(ctx);
      const sqlCheck = result.Diagnostics.Checks.find(c => c.Name === 'SQL Server connectivity');
      expect(sqlCheck).toBeUndefined();
      expect(mockSql.CheckConnectivity).not.toHaveBeenCalled();
    });
  });

  // ─── OS detection ──────────────────────────────────────────────────

  describe('OS detection', () => {
    it('should detect Windows from process.platform win32', async () => {
      const restore = mockPlatform('win32');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        expect(result.DetectedOS).toBe('windows');
        const osCheck = result.Diagnostics.Checks.find(c => c.Name === 'Operating system');
        expect(osCheck).toBeDefined();
        expect(osCheck!.Status).toBe('info');
        expect(osCheck!.Message).toContain('Windows');
      } finally {
        restore();
      }
    });

    it('should detect macOS from process.platform darwin', async () => {
      const restore = mockPlatform('darwin');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        expect(result.DetectedOS).toBe('macos');
      } finally {
        restore();
      }
    });

    it('should detect Linux from process.platform linux', async () => {
      const restore = mockPlatform('linux');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        expect(result.DetectedOS).toBe('linux');
      } finally {
        restore();
      }
    });

    it('should report other for unknown platforms', async () => {
      const restore = mockPlatform('freebsd');
      try {
        const ctx = makeContext();
        const result = await phase.Run(ctx);
        expect(result.DetectedOS).toBe('other');
      } finally {
        restore();
      }
    });
  });

  // ─── Write permissions ─────────────────────────────────────────────

  describe('Write permissions check', () => {
    it('should pass when directory is writable', async () => {
      mockFs.CanWrite.mockResolvedValue(true);
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const writeCheck = result.Diagnostics.Checks.find(c => c.Name === 'Write permissions');
      expect(writeCheck).toBeDefined();
      expect(writeCheck!.Status).toBe('pass');
    });

    it('should fail when directory is not writable', async () => {
      mockFs.CanWrite.mockResolvedValue(false);
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      const writeCheck = result.Diagnostics.Checks.find(c => c.Name === 'Write permissions');
      expect(writeCheck).toBeDefined();
      expect(writeCheck!.Status).toBe('fail');
      expect(writeCheck!.Message).toContain('/test/install');
      expect(result.Passed).toBe(false);
    });
  });

  // ─── Aggregate pass/fail ───────────────────────────────────────────

  describe('Run aggregation', () => {
    it('should return Passed=true when all checks pass', async () => {
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      expect(result.Passed).toBe(true);
    });

    it('should return Passed=false when any hard check fails', async () => {
      mockFs.CanWrite.mockResolvedValue(false);
      const ctx = makeContext();
      const result = await phase.Run(ctx);
      expect(result.Passed).toBe(false);
      expect(result.Diagnostics.HasFailures).toBe(true);
    });
  });

  // ─── RunDiagnostics (doctor mode) ──────────────────────────────────

  describe('RunDiagnostics', () => {
    it('should include config file checks for .env and mj.config.cjs', async () => {
      // .env exists, mj.config.cjs exists, mj.config.js does not exist
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return true;
        if (path.endsWith('mj.config.cjs')) return true;
        if (path.endsWith('mj.config.js')) return false;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunDiagnostics('/test/install', samplePartialConfig(), emitter);

      const envCheck = diagnostics.Checks.find(c => c.Name === '.env file');
      expect(envCheck).toBeDefined();
      expect(envCheck!.Status).toBe('pass');

      const configCheck = diagnostics.Checks.find(c => c.Name === 'mj.config.cjs');
      expect(configCheck).toBeDefined();
      expect(configCheck!.Status).toBe('pass');
    });

    it('should warn when .env is missing', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return false;
        if (path.endsWith('mj.config.cjs')) return true;
        if (path.endsWith('mj.config.js')) return false;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunDiagnostics('/test/install', samplePartialConfig(), emitter);

      const envCheck = diagnostics.Checks.find(c => c.Name === '.env file');
      expect(envCheck).toBeDefined();
      expect(envCheck!.Status).toBe('warn');
      expect(envCheck!.SuggestedFix).toContain('mj install');
    });

    it('should warn about mj.config.js (wrong filename)', async () => {
      mockFs.FileExists.mockImplementation(async (path: string) => {
        if (path.endsWith('.env')) return true;
        if (path.endsWith('mj.config.cjs')) return true;
        if (path.endsWith('mj.config.js')) return true;
        return false;
      });
      mockFs.DirectoryExists.mockResolvedValue(true);

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunDiagnostics('/test/install', samplePartialConfig(), emitter);

      const wrongFile = diagnostics.Checks.find(c => c.Name === 'mj.config.js (wrong filename)');
      expect(wrongFile).toBeDefined();
      expect(wrongFile!.Status).toBe('warn');
      expect(wrongFile!.SuggestedFix).toContain('Rename');
    });

    it('should check for codegen artifacts', async () => {
      // mj_generatedentities does not exist
      mockFs.DirectoryExists.mockImplementation(async (path: string) => {
        if (path.includes('mj_generatedentities')) return false;
        return true;
      });
      mockFs.FileExists.mockResolvedValue(true);

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunDiagnostics('/test/install', samplePartialConfig(), emitter);

      const codegenCheck = diagnostics.Checks.find(c => c.Name === 'CodeGen artifacts');
      expect(codegenCheck).toBeDefined();
      expect(codegenCheck!.Status).toBe('fail');
      expect(codegenCheck!.SuggestedFix).toContain('mj codegen');
    });

    it('should pass codegen artifact check when mj_generatedentities exists', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(true);

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunDiagnostics('/test/install', samplePartialConfig(), emitter);

      const codegenCheck = diagnostics.Checks.find(c => c.Name === 'CodeGen artifacts');
      expect(codegenCheck).toBeDefined();
      expect(codegenCheck!.Status).toBe('pass');
    });
  });

  // ─── Event emission ────────────────────────────────────────────────

  describe('event emission', () => {
    it('should emit diagnostic events for each check', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      await phase.Run(ctx);

      const diagnosticEvents = emittedEvents(emitSpy, 'diagnostic');
      // At minimum: node, npm, disk, 2 ports, sql, OS, write = 8 checks
      expect(diagnosticEvents.length).toBeGreaterThanOrEqual(8);
    });

    it('should emit step:progress events', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      await phase.Run(ctx);

      const progressEvents = emittedEvents(emitSpy, 'step:progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });
  });
});
