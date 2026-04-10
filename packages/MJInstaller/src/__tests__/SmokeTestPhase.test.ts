import { createMockFileSystem, createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { sampleConfig } from './mocks/fixtures.js';
import type { SmokeTestContext } from '../phases/SmokeTestPhase.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';

// ---------------------------------------------------------------------------
// Adapter mocks — SmokeTestPhase creates adapters via `new` in constructor
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
const mockRunner = createMockProcessRunner();

vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: vi.fn(function () { return mockFs; }),
}));

vi.mock('../adapters/ProcessRunner.js', () => ({
  ProcessRunner: vi.fn(function () { return mockRunner; }),
}));

// ---------------------------------------------------------------------------
// Mock global fetch for HTTP health confirmation
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { SmokeTestPhase } from '../phases/SmokeTestPhase.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Types for ProcessRunner mock options
// ---------------------------------------------------------------------------

interface MockRunOptions {
  Cwd?: string;
  TimeoutMs?: number;
  OnStdout?: (line: string) => void;
  OnStderr?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<SmokeTestContext>): SmokeTestContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Config: sampleConfig(),
    Emitter: emitter,
    ...overrides,
  };
}

/**
 * Configure the ProcessRunner.Run mock to emit stdout lines via OnStdout.
 * Uses queueMicrotask so lines are emitted asynchronously (after the call
 * returns control) but before any timer-based timeouts fire.
 */
function mockRunWithStdout(
  apiLines: string[],
  explorerLines: string[]
): void {
  mockRunner.Run.mockImplementation(
    async (_cmd: string, args: string[], options?: MockRunOptions) => {
      const isApi = args.includes('start:api');
      const isExplorer = args.includes('start:explorer');
      const lines = isApi ? apiLines : isExplorer ? explorerLines : [];

      if (options?.OnStdout && lines.length > 0) {
        queueMicrotask(() => {
          for (const line of lines) {
            options.OnStdout!(line);
          }
        });
      }

      return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
    }
  );
}

/**
 * Flush all microtasks and pending timers. This handles the common case
 * where readiness resolves via queueMicrotask (no timer advancement needed)
 * and also handles the timeout path.
 */
async function flushAll(): Promise<void> {
  // Flush microtasks first (readiness via stdout)
  await vi.advanceTimersByTimeAsync(0);
  // Then advance timers for the timeout path and process promise resolution
  for (let i = 0; i < 60; i++) {
    await vi.advanceTimersByTimeAsync(5000);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmokeTestPhase', () => {
  let phase: SmokeTestPhase;

  beforeEach(() => {
    vi.useFakeTimers();

    // Clear call history and reset implementations on all shared mock methods
    for (const mock of [mockFs, mockRunner]) {
      for (const fn of Object.values(mock)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
    mockFetch.mockReset();

    phase = new SmokeTestPhase();

    // Default: mj_generatedentities exists (preCheck passes)
    mockFs.DirectoryExists.mockResolvedValue(true);

    // Default: no project files found for port detection (uses config defaults)
    mockFs.FileExists.mockResolvedValue(false);
    mockFs.ReadText.mockResolvedValue('');

    // Default: both services emit readiness markers
    mockRunWithStdout(
      ['Starting server...', '🚀 Server ready at http://localhost:4000/'],
      ['Compiling...', 'Application bundle generation complete.']
    );

    // Default: process cleanup succeeds
    mockRunner.killByPort.mockReturnValue(undefined);

    // Default: HTTP health confirmation succeeds
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Pre-check
  // =========================================================================

  describe('preCheck', () => {
    it('should pass when mj_generatedentities exists', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result).toBeDefined();
    });

    it('should throw MISSING_GENERATED_ENTITIES when both directories are missing', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);

      const ctx = makeContext();
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);

      mockFs.DirectoryExists.mockResolvedValue(false);
      const ctx2 = makeContext();
      await expect(phase.Run(ctx2)).rejects.toMatchObject({
        Code: 'MISSING_GENERATED_ENTITIES',
      });
    });

    it('should pass when mj_generatedentities missing but GeneratedEntities exists', async () => {
      mockFs.DirectoryExists.mockImplementation(async (p: string) => {
        if (p.includes('mj_generatedentities')) return false;
        if (p.includes('GeneratedEntities')) return true;
        return true;
      });

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // Port detection
  // =========================================================================

  describe('Port detection', () => {
    it('should detect API port from GRAPHQL_PORT in .env', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('MJAPI') && p.endsWith('.env')
      );
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.endsWith('.env')) return 'DB_HOST=localhost\nGRAPHQL_PORT=4001\nDB_DATABASE=MJ';
        return '';
      });

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiUrl).toBe('http://localhost:4001/');
    });

    it('should fall back to PORT if GRAPHQL_PORT not found', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('.env') && p.includes('MJAPI')
      );
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.endsWith('.env')) return 'PORT=5000\nDB_HOST=localhost';
        return '';
      });

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiUrl).toBe('http://localhost:5000/');
    });

    it('should detect Explorer port from package.json --port flag', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('MJExplorer') && p.includes('package.json')
      );
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('package.json')) {
          return JSON.stringify({ scripts: { start: 'ng serve --port 4201' } });
        }
        return '';
      });

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ExplorerUrl).toBe('http://localhost:4201/');
    });

    it('should fall back to config ports when project files missing', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(false);

      const config: PartialInstallConfig = {
        ...sampleConfig(),
        APIPort: 5000,
        ExplorerPort: 5200,
      };
      const ctx = makeContext({ Config: config });
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiUrl).toBe('http://localhost:5000/');
      expect(result.ExplorerUrl).toBe('http://localhost:5200/');
    });

    it('should use default ports (4000, 4200) when no config or project files', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);
      mockFs.FileExists.mockResolvedValue(false);

      const ctx = makeContext({ Config: {} });
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiUrl).toBe('http://localhost:4000/');
      expect(result.ExplorerUrl).toBe('http://localhost:4200/');
    });
  });

  // =========================================================================
  // Stdout-based readiness detection
  // =========================================================================

  describe('Readiness detection', () => {
    it('should detect both services as running via stdout markers', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiRunning).toBe(true);
      expect(result.ExplorerRunning).toBe(true);
    });

    it('should detect API via "Server ready at" marker', async () => {
      mockRunWithStdout(
        ['Loading entities...', 'Server ready at http://localhost:4000/'],
        ['Application bundle generation complete.']
      );

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiRunning).toBe(true);
    });

    it('should detect Explorer via "Compiled successfully" marker', async () => {
      mockRunWithStdout(
        ['Server ready at http://localhost:4000/'],
        ['Building...', 'Compiled successfully.']
      );

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ExplorerRunning).toBe(true);
    });

    it('should detect Explorer via "Local:" URL marker', async () => {
      mockRunWithStdout(
        ['Server ready at http://localhost:4000/'],
        ['Building...', 'Local:   http://localhost:4201/']
      );

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ExplorerRunning).toBe(true);
    });

    it('should fail immediately on EADDRINUSE fatal error', async () => {
      mockRunWithStdout(
        ['Starting server...', 'Error: listen EADDRINUSE: address already in use :::4000'],
        ['Application bundle generation complete.']
      );

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiRunning).toBe(false);
      expect(result.ExplorerRunning).toBe(true);

      const warns = emittedEvents(emitSpy, 'warn');
      const apiWarn = warns.find((w) =>
        (w as { Message: string }).Message.includes('MJAPI failed to start')
      );
      expect(apiWarn).toBeDefined();
      expect((apiWarn as { Message: string }).Message).toContain('EADDRINUSE');
    });

    it('should fail when process exits before becoming ready', async () => {
      mockRunner.Run.mockImplementation(
        async (_cmd: string, args: string[], options?: MockRunOptions) => {
          const isExplorer = args.includes('start:explorer');
          if (isExplorer && options?.OnStdout) {
            queueMicrotask(() => {
              options.OnStdout!('Application bundle generation complete.');
            });
          }
          // API exits immediately with error code
          return { ExitCode: 1, Stdout: '', Stderr: 'crash', TimedOut: false };
        }
      );

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      expect(result.ApiRunning).toBe(false);
    });

    it('should fail with timeout when no readiness marker is emitted', async () => {
      // Emit lines that don't match any readiness pattern
      mockRunWithStdout(
        ['Loading...', 'Still loading...'],
        ['Compiling...', 'Still compiling...']
      );

      // Make process resolve late (not immediately) so timeout fires first
      mockRunner.Run.mockImplementation(
        async (_cmd: string, _args: string[], options?: MockRunOptions) => {
          if (options?.OnStdout) {
            queueMicrotask(() => {
              options.OnStdout!('Loading...');
            });
          }
          // Return a promise that resolves very late
          return new Promise((resolve) => {
            setTimeout(() => resolve({
              ExitCode: 0, Stdout: '', Stderr: '', TimedOut: true,
            }), 300_000);
          });
        }
      );

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);

      // Advance past both readiness timeouts (120s API + 240s Explorer)
      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      expect(result.ApiRunning).toBe(false);
      expect(result.ExplorerRunning).toBe(false);
    });
  });

  // =========================================================================
  // HTTP health confirmation
  // =========================================================================

  describe('HTTP health confirmation', () => {
    it('should use 127.0.0.1 instead of localhost for HTTP check', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      const fetchCalls = mockFetch.mock.calls.map((c: [string]) => c[0]);
      expect(fetchCalls.length).toBeGreaterThan(0);
      expect(fetchCalls.every((url: string) => url.includes('127.0.0.1'))).toBe(true);
    });

    it('should still report ready when stdout succeeds but HTTP fails', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      const result = await runPromise;
      // Stdout says ready, HTTP failed — we trust stdout
      expect(result.ApiRunning).toBe(true);
      expect(result.ExplorerRunning).toBe(true);
    });
  });

  // =========================================================================
  // Parallel startup
  // =========================================================================

  describe('Parallel startup', () => {
    it('should start both commands: npm run start:api and npm run start:explorer', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      const runCalls = mockRunner.Run.mock.calls;
      const apiCall = runCalls.find(
        (c: [string, string[]]) => c[0] === 'npm' && c[1]?.includes('start:api')
      );
      expect(apiCall).toBeDefined();

      const explorerCall = runCalls.find(
        (c: [string, string[]]) => c[0] === 'npm' && c[1]?.includes('start:explorer')
      );
      expect(explorerCall).toBeDefined();
    });
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  describe('Cleanup', () => {
    it('should call killByPort with detected ports', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      expect(mockRunner.killByPort).toHaveBeenCalledWith(4000);
      expect(mockRunner.killByPort).toHaveBeenCalledWith(4200);
    });

    it('should call killByPort with custom config ports', async () => {
      const config: PartialInstallConfig = {
        ...sampleConfig(),
        APIPort: 5000,
        ExplorerPort: 5200,
      };

      const ctx = makeContext({ Config: config });
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      expect(mockRunner.killByPort).toHaveBeenCalledWith(5000);
      expect(mockRunner.killByPort).toHaveBeenCalledWith(5200);
    });
  });

  // =========================================================================
  // Error reporting
  // =========================================================================

  describe('Error reporting', () => {
    it('should include captured output in failure warning', async () => {
      mockRunner.Run.mockImplementation(
        async (_cmd: string, args: string[], options?: MockRunOptions) => {
          const isExplorer = args.includes('start:explorer');
          if (isExplorer && options?.OnStdout) {
            queueMicrotask(() => {
              options.OnStdout!('Application bundle generation complete.');
            });
          }
          if (!isExplorer && options?.OnStdout) {
            queueMicrotask(() => {
              options.OnStdout!('Starting server...');
              options.OnStdout!('Error: listen EADDRINUSE: port 4000');
            });
          }
          return { ExitCode: 1, Stdout: '', Stderr: '', TimedOut: false };
        }
      );

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      const warns = emittedEvents(emitSpy, 'warn');
      const apiWarn = warns.find((w) =>
        (w as { Message: string }).Message.includes('MJAPI failed to start')
      );
      expect(apiWarn).toBeDefined();
      expect((apiWarn as { Message: string }).Message).toContain('Starting server...');
      expect((apiWarn as { Message: string }).Message).toContain('EADDRINUSE');
    });

    it('should report "(No output captured)" when process produces no output', async () => {
      mockRunner.Run.mockImplementation(
        async (_cmd: string, args: string[], options?: MockRunOptions) => {
          const isExplorer = args.includes('start:explorer');
          if (isExplorer && options?.OnStdout) {
            queueMicrotask(() => {
              options.OnStdout!('Application bundle generation complete.');
            });
          }
          // API produces no output and exits immediately
          return { ExitCode: 1, Stdout: '', Stderr: '', TimedOut: false };
        }
      );

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const runPromise = phase.Run(ctx);
      await flushAll();

      await runPromise;

      const warns = emittedEvents(emitSpy, 'warn');
      const apiWarn = warns.find((w) =>
        (w as { Message: string }).Message.includes('MJAPI failed to start')
      );
      expect(apiWarn).toBeDefined();
      expect((apiWarn as { Message: string }).Message).toContain('No output captured');
    });
  });
});
