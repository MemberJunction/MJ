import { createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { samplePartialConfig } from './mocks/fixtures.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Adapter mocks — MigratePhase creates ProcessRunner via `new`
// ---------------------------------------------------------------------------

const mockRunner = createMockProcessRunner();

vi.mock('../adapters/ProcessRunner.js', () => {
  return {
    ProcessRunner: class {
      Run = mockRunner.Run;
      RunSimple = mockRunner.RunSimple;
      CommandExists = mockRunner.CommandExists;
      killTree = mockRunner.killTree;
      killByPort = mockRunner.killByPort;
    },
  };
});

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { MigratePhase, type MigrateContext } from '../phases/MigratePhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<MigrateContext>): MigrateContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Config: samplePartialConfig(),
    Emitter: emitter,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MigratePhase', () => {
  let phase: MigratePhase;

  beforeEach(() => {
    phase = new MigratePhase();

    // Clear call history and set default: successful migration
    mockRunner.Run.mockClear().mockResolvedValue({
      ExitCode: 0,
      Stdout: 'Migration completed',
      Stderr: '',
      TimedOut: false,
    });
  });

  // -----------------------------------------------------------------------
  // Success path
  // -----------------------------------------------------------------------

  describe('success', () => {
    it('should return Success=true and stdout Output when exit code is 0', async () => {
      mockRunner.Run.mockResolvedValue({
        ExitCode: 0,
        Stdout: 'Applied 12 migrations',
        Stderr: '',
        TimedOut: false,
      });
      const ctx = makeContext();

      const result = await phase.Run(ctx);

      expect(result.Success).toBe(true);
      expect(result.Output).toBe('Applied 12 migrations');
    });

    it('should emit log info "Database migrations completed successfully." on success', async () => {
      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });

      await phase.Run(ctx);

      const logs = emittedEvents(emitSpy, 'log') as Array<{ Level: string; Message: string }>;
      const infoLogs = logs.filter((l) => l.Level === 'info');
      expect(infoLogs.some((l) => l.Message.includes('Database migrations completed successfully'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Command invocation
  // -----------------------------------------------------------------------

  describe('command invocation', () => {
    it('should run npx with args [mj, migrate, --verbose]', async () => {
      const ctx = makeContext({ Dir: '/some/dir' });

      await phase.Run(ctx);

      expect(mockRunner.Run).toHaveBeenCalledTimes(1);
      const [cmd, args] = mockRunner.Run.mock.calls[0];
      expect(cmd).toBe('npx');
      expect(args).toEqual(['mj', 'migrate', '--verbose']);
    });

    it('should pass correct Cwd from context.Dir', async () => {
      const ctx = makeContext({ Dir: '/custom/path' });

      await phase.Run(ctx);

      const options = mockRunner.Run.mock.calls[0][2];
      expect(options.Cwd).toBe('/custom/path');
    });

    it('should set 5-minute (300000ms) timeout', async () => {
      const ctx = makeContext();

      await phase.Run(ctx);

      const options = mockRunner.Run.mock.calls[0][2];
      expect(options.TimeoutMs).toBe(300_000);
    });
  });

  // -----------------------------------------------------------------------
  // Timeout
  // -----------------------------------------------------------------------

  describe('timeout', () => {
    it('should throw InstallerError with MIGRATE_TIMEOUT when process times out', async () => {
      mockRunner.Run.mockResolvedValue({
        ExitCode: 1,
        Stdout: '',
        Stderr: '',
        TimedOut: true,
      });
      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('MIGRATE_TIMEOUT');
        expect(ie.Phase).toBe('migrate');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Failure
  // -----------------------------------------------------------------------

  describe('failure', () => {
    it('should throw InstallerError with MIGRATE_FAILED when exit code is non-zero', async () => {
      mockRunner.Run.mockResolvedValue({
        ExitCode: 1,
        Stdout: 'partial output',
        Stderr: 'SQL error on line 42',
        TimedOut: false,
      });
      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('MIGRATE_FAILED');
        expect(ie.Phase).toBe('migrate');
      }
    });

    it('should include combined stdout and stderr in the error message', async () => {
      mockRunner.Run.mockResolvedValue({
        ExitCode: 1,
        Stdout: 'stdout line 1',
        Stderr: 'stderr line 1',
        TimedOut: false,
      });
      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        const ie = err as InstallerError;
        expect(ie.message).toContain('stdout line 1');
        expect(ie.message).toContain('stderr line 1');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Streaming callbacks
  // -----------------------------------------------------------------------

  describe('streaming output', () => {
    it('should emit step:progress events via OnStdout callback', async () => {
      mockRunner.Run.mockImplementation(async (_cmd: string, _args: string[], options: Record<string, unknown>) => {
        const onStdout = options?.OnStdout as ((line: string) => void) | undefined;
        if (onStdout) {
          onStdout('Applying migration V001');
          onStdout('Applying migration V002');
        }
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });

      await phase.Run(ctx);

      const progresses = emittedEvents(emitSpy, 'step:progress') as Array<{ Message: string }>;
      expect(progresses.some((p) => p.Message === 'Applying migration V001')).toBe(true);
      expect(progresses.some((p) => p.Message === 'Applying migration V002')).toBe(true);
    });

    it('should emit log verbose events via OnStderr callback', async () => {
      mockRunner.Run.mockImplementation(async (_cmd: string, _args: string[], options: Record<string, unknown>) => {
        const onStderr = options?.OnStderr as ((line: string) => void) | undefined;
        if (onStderr) {
          onStderr('flyway warning: pending migrations');
        }
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });

      await phase.Run(ctx);

      const logs = emittedEvents(emitSpy, 'log') as Array<{ Level: string; Message: string }>;
      const verboseLogs = logs.filter((l) => l.Level === 'verbose');
      expect(verboseLogs.some((l) => l.Message.includes('flyway warning: pending migrations'))).toBe(true);
    });
  });
});
