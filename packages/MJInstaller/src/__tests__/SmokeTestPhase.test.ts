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
// Mock global fetch for health checks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { SmokeTestPhase } from '../phases/SmokeTestPhase.js';
import { InstallerError } from '../errors/InstallerError.js';

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
    mockFs.FileExists.mockResolvedValue(true);

    // Default: processes start fine
    mockRunner.Run.mockResolvedValue({
      ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false,
    });
    mockRunner.killByPort.mockReturnValue(undefined);

    // Default: health checks succeed immediately
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

      // Advance time past all health check sleeps
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      // If preCheck passed, we should get results
      expect(result).toBeDefined();
    });

    it('should throw MISSING_GENERATED_ENTITIES when both directories are missing', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);

      const ctx = makeContext();

      // preCheck rejects before any timers, so we can await directly
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);

      // Verify the error code in a separate assertion
      const ctx2 = makeContext();
      mockFs.DirectoryExists.mockResolvedValue(false);
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

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      expect(result).toBeDefined();
    });
  });

  // =========================================================================
  // Service health checks
  // =========================================================================

  describe('Health checks', () => {
    it('should return both services running when healthy', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const ctx = makeContext();
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      expect(result.ApiRunning).toBe(true);
      expect(result.ExplorerRunning).toBe(true);
    });

    it('should report API unhealthy when fetch always rejects', async () => {
      // Both services fail
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      // processRunner.Run should resolve eventually (timeout)
      mockRunner.Run.mockResolvedValue({
        ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true,
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const runPromise = phase.Run(ctx);

      // Advance enough time for all health check retries
      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      expect(result.ApiRunning).toBe(false);

      const warns = emittedEvents(emitSpy, 'warn');
      expect(warns.some((w: Record<string, unknown>) =>
        (w.Message as string).includes('MJAPI did not respond')
      )).toBe(true);
    });

    it('should report Explorer unhealthy when fetch fails for Explorer only', async () => {
      let fetchCallCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        // API health checks succeed, Explorer health checks fail
        if (url.includes('4000') || url.includes(':4000')) {
          return { ok: true, status: 200 };
        }
        throw new Error('ECONNREFUSED');
      });

      mockRunner.Run.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('start:explorer')) {
          return { ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true };
        }
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;
      expect(result.ApiRunning).toBe(true);
      expect(result.ExplorerRunning).toBe(false);
    });

    it('should use 127.0.0.1 instead of localhost for health checks', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      await runPromise;

      // Check that fetch was called with 127.0.0.1
      const fetchCalls = mockFetch.mock.calls.map((c: [string]) => c[0]);
      expect(fetchCalls.every((url: string) => url.includes('127.0.0.1'))).toBe(true);
      expect(fetchCalls.every((url: string) => !url.includes('localhost'))).toBe(true);
    });
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  describe('Cleanup', () => {
    it('should call killByPort with correct ports', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      await runPromise;

      expect(mockRunner.killByPort).toHaveBeenCalledWith(4000);
      expect(mockRunner.killByPort).toHaveBeenCalledWith(4200);
    });
  });

  // =========================================================================
  // Port configuration
  // =========================================================================

  describe('Port configuration', () => {
    it('should use custom ports from config', async () => {
      const config: PartialInstallConfig = {
        ...sampleConfig(),
        APIPort: 5000,
        ExplorerPort: 5200,
      };

      const ctx = makeContext({ Config: config });
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;

      expect(result.ApiUrl).toContain('5000');
      expect(result.ExplorerUrl).toContain('5200');
      expect(mockRunner.killByPort).toHaveBeenCalledWith(5000);
      expect(mockRunner.killByPort).toHaveBeenCalledWith(5200);
    });

    it('should use default ports (4000, 4200) when config does not specify', async () => {
      const config: PartialInstallConfig = {};

      const ctx = makeContext({ Config: config });
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;

      expect(result.ApiUrl).toBe('http://localhost:4000/');
      expect(result.ExplorerUrl).toBe('http://localhost:4200/');
    });

    it('should reflect port config in ApiUrl and ExplorerUrl', async () => {
      const config: PartialInstallConfig = {
        ...sampleConfig(),
        APIPort: 8080,
        ExplorerPort: 3000,
      };

      const ctx = makeContext({ Config: config });
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await runPromise;

      expect(result.ApiUrl).toBe('http://localhost:8080/');
      expect(result.ExplorerUrl).toBe('http://localhost:3000/');
    });
  });

  // =========================================================================
  // Service startup commands
  // =========================================================================

  describe('Service startup', () => {
    it('should start correct commands: npm run start:api and npm run start:explorer', async () => {
      const ctx = makeContext();
      const runPromise = phase.Run(ctx);

      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

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
});
