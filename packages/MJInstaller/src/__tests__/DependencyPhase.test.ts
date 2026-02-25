import { createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Adapter mocks — DependencyPhase creates ProcessRunner via `new`
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

import { DependencyPhase, type DependencyContext } from '../phases/DependencyPhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<DependencyContext>): DependencyContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Emitter: emitter,
    ...overrides,
  };
}

/** Shortcut for a success ProcessResult */
function ok(overrides?: Record<string, unknown>) {
  return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false, ...overrides };
}

/** Shortcut for a failure ProcessResult */
function fail(overrides?: Record<string, unknown>) {
  return { ExitCode: 1, Stdout: '', Stderr: '', TimedOut: false, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DependencyPhase', () => {
  let phase: DependencyPhase;

  beforeEach(() => {
    phase = new DependencyPhase();

    // Clear call history and reset implementation (each test configures its own chain)
    mockRunner.Run.mockClear().mockReset();
  });

  // -----------------------------------------------------------------------
  // Happy path: install + build both succeed
  // -----------------------------------------------------------------------

  describe('full success', () => {
    it('should return InstallSuccess=true, BuildSuccess=true, BuildPartial=false', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())   // npm install
        .mockResolvedValueOnce(ok());  // npm run build

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.InstallSuccess).toBe(true);
      expect(result.BuildSuccess).toBe(true);
      expect(result.BuildPartial).toBe(false);
      expect(result.Warnings).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // npm install failures
  // -----------------------------------------------------------------------

  describe('npm install timeout', () => {
    it('should throw NPM_INSTALL_TIMEOUT when npm install times out', async () => {
      mockRunner.Run.mockResolvedValueOnce({ ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true });

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('NPM_INSTALL_TIMEOUT');
        expect(ie.Phase).toBe('dependencies');
      }
    });
  });

  describe('npm install failure (non-ERESOLVE)', () => {
    it('should throw NPM_INSTALL_FAILED for non-ERESOLVE errors', async () => {
      mockRunner.Run.mockResolvedValueOnce(fail({ Stderr: 'ERR! code ENOENT' }));

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('NPM_INSTALL_FAILED');
        expect(ie.Phase).toBe('dependencies');
      }
    });
  });

  // -----------------------------------------------------------------------
  // ERESOLVE retry logic
  // -----------------------------------------------------------------------

  describe('ERESOLVE retry', () => {
    it('should retry with --legacy-peer-deps when ERESOLVE is detected', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' })) // first install
        .mockResolvedValueOnce(ok())   // retry install with --legacy-peer-deps
        .mockResolvedValueOnce(ok());  // build

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.InstallSuccess).toBe(true);

      // Verify the second call used --legacy-peer-deps
      const secondCallArgs = mockRunner.Run.mock.calls[1][1] as string[];
      expect(secondCallArgs).toContain('--legacy-peer-deps');
    });

    it('should add warning about legacy-peer-deps when ERESOLVE retry succeeds', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }))
        .mockResolvedValueOnce(ok())   // retry succeeds
        .mockResolvedValueOnce(ok());  // build succeeds

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.Warnings.some((w) => w.includes('--legacy-peer-deps'))).toBe(true);
    });

    it('should throw NPM_INSTALL_FAILED when ERESOLVE retry also fails', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }))
        .mockResolvedValueOnce(fail({ Stderr: 'Still broken' })); // retry fails too

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('NPM_INSTALL_FAILED');
      }
    });

    it('should throw NPM_INSTALL_TIMEOUT when ERESOLVE retry times out', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }))
        .mockResolvedValueOnce({ ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true }); // retry times out

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('NPM_INSTALL_TIMEOUT');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Vulnerability warnings
  // -----------------------------------------------------------------------

  describe('vulnerability warnings', () => {
    it('should add warning when stderr contains "vulnerabilit"', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok({ Stderr: '6 vulnerabilities (3 moderate, 3 high)' }))
        .mockResolvedValueOnce(ok());  // build

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.Warnings.some((w) => w.includes('vulnerabilities'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Build outcomes
  // -----------------------------------------------------------------------

  describe('build success', () => {
    it('should return BuildPartial=false when build exits with code 0', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce(ok());  // build

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.BuildSuccess).toBe(true);
      expect(result.BuildPartial).toBe(false);
    });
  });

  describe('build partial (codegen-only failures)', () => {
    it('should return BuildPartial=true when only codegen-managed packages fail', async () => {
      const buildOutput = [
        'Failed:    @memberjunction/ng-core-entity-forms#build',
        'Failed:    @memberjunction/server-bootstrap#build',
      ].join('\n');

      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce(fail({ Stdout: buildOutput, Stderr: '' })); // build partial

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.BuildPartial).toBe(true);
      expect(result.BuildSuccess).toBe(false);
    });
  });

  describe('build non-codegen failure', () => {
    it('should throw BUILD_FAILED when non-codegen packages fail', async () => {
      const buildOutput = 'Failed:    @memberjunction/core#build';

      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce(fail({ Stdout: buildOutput, Stderr: '' })); // build

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('BUILD_FAILED');
        expect(ie.Phase).toBe('dependencies');
      }
    });
  });

  describe('build timeout', () => {
    it('should throw BUILD_TIMEOUT when build times out', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce({ ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true }); // build timeout

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('BUILD_TIMEOUT');
      }
    });
  });

  // -----------------------------------------------------------------------
  // extractFailedTurboPackages parsing (tested via build behavior)
  // -----------------------------------------------------------------------

  describe('extractFailedTurboPackages (via build behavior)', () => {
    it('should correctly parse Failed: lines with package#build pattern', async () => {
      const buildOutput = [
        'some other output',
        'Failed:    @memberjunction/ng-core-entity-forms#build',
        'Failed:    @memberjunction/ng-bootstrap#build',
        'more output',
      ].join('\n');

      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ Stdout: buildOutput }));

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });

      const result = await phase.Run(ctx);

      // Both are codegen-managed, so should be partial
      expect(result.BuildPartial).toBe(true);

      // Warnings should list the failed packages
      const warnEvents = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      const buildWarns = warnEvents.filter((w) => w.Message.includes('partially succeeded'));
      expect(buildWarns.length).toBe(1);
      expect(buildWarns[0].Message).toContain('ng-core-entity-forms');
      expect(buildWarns[0].Message).toContain('ng-bootstrap');
    });
  });
});
