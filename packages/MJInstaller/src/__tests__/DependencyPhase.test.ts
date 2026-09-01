import { createMockProcessRunner, createMockFileSystem } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Adapter mocks — DependencyPhase creates ProcessRunner and FileSystemAdapter via `new`
// ---------------------------------------------------------------------------

const mockRunner = createMockProcessRunner();
const mockFs = createMockFileSystem();

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

vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: vi.fn(function () { return mockFs; }),
}));

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { DependencyPhase, tagToNpmVersion, type DependencyContext } from '../phases/DependencyPhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<DependencyContext>): DependencyContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Tag: 'v5.9.0',
    PackageManager: 'pnpm',
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
    mockFs.ReadJSON.mockClear().mockResolvedValue({});
    mockFs.WriteJSON.mockClear().mockResolvedValue(undefined);
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

  describe('install timeout', () => {
    it('should throw INSTALL_TIMEOUT when the install times out', async () => {
      mockRunner.Run.mockResolvedValueOnce({ ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true });

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('INSTALL_TIMEOUT');
        expect(ie.Phase).toBe('dependencies');
      }
    });
  });

  describe('install failure (non-ERESOLVE)', () => {
    it('should throw INSTALL_FAILED for non-ERESOLVE errors', async () => {
      mockRunner.Run.mockResolvedValueOnce(fail({ Stderr: 'ERR! code ENOENT' }));

      const ctx = makeContext();

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('INSTALL_FAILED');
        expect(ie.Phase).toBe('dependencies');
      }
    });
  });

  // -----------------------------------------------------------------------
  // ERESOLVE retry logic (npm-specific — pnpm has no --legacy-peer-deps)
  // -----------------------------------------------------------------------

  describe('ERESOLVE retry (npm)', () => {
    it('should retry with --legacy-peer-deps when ERESOLVE is detected', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' })) // first install
        .mockResolvedValueOnce(ok())   // retry install with --legacy-peer-deps
        .mockResolvedValueOnce(ok());  // build

      const ctx = makeContext({ PackageManager: 'npm' });
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

      const ctx = makeContext({ PackageManager: 'npm' });
      const result = await phase.Run(ctx);

      expect(result.Warnings.some((w) => w.includes('--legacy-peer-deps'))).toBe(true);
    });

    it('should throw INSTALL_FAILED when ERESOLVE retry also fails', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }))
        .mockResolvedValueOnce(fail({ Stderr: 'Still broken' })); // retry fails too

      const ctx = makeContext({ PackageManager: 'npm' });

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('INSTALL_FAILED');
      }
    });

    it('should throw INSTALL_TIMEOUT when ERESOLVE retry times out', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }))
        .mockResolvedValueOnce({ ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true }); // retry times out

      const ctx = makeContext({ PackageManager: 'npm' });

      try {
        await phase.Run(ctx);
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        const ie = err as InstallerError;
        expect(ie.Code).toBe('INSTALL_TIMEOUT');
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
    it('should return BuildPartial=true when only scoped codegen-managed packages fail', async () => {
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

    it('should return BuildPartial=true when unscoped generated packages fail', async () => {
      const buildOutput = [
        'Failed:    mj_generatedentities#build',
        'Failed:    mj_generatedactions#build',
      ].join('\n');

      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce(fail({ Stdout: buildOutput, Stderr: '' })); // build partial

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.BuildPartial).toBe(true);
      expect(result.BuildSuccess).toBe(false);
    });

    it('should return BuildPartial=true when mix of scoped and unscoped codegen packages fail', async () => {
      const buildOutput = [
        'Failed:    mj_generatedentities#build',
        'Failed:    @memberjunction/ng-core-entity-forms#build',
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

describe('tagToNpmVersion', () => {
  it('strips leading v from semver tags', () => {
    expect(tagToNpmVersion('v5.38.0')).toBe('5.38.0');
    expect(tagToNpmVersion('v0.0.1')).toBe('0.0.1');
    expect(tagToNpmVersion('v12.34.567')).toBe('12.34.567');
  });

  it('accepts semver tags without leading v', () => {
    expect(tagToNpmVersion('5.38.0')).toBe('5.38.0');
    expect(tagToNpmVersion('1.0.0')).toBe('1.0.0');
  });

  it('preserves prerelease and build-metadata suffixes', () => {
    expect(tagToNpmVersion('v5.38.0-beta.1')).toBe('5.38.0-beta.1');
    expect(tagToNpmVersion('5.38.0-rc.2')).toBe('5.38.0-rc.2');
    expect(tagToNpmVersion('v5.38.0+meta')).toBe('5.38.0+meta');
    expect(tagToNpmVersion('5.38.0-alpha.3+build.7')).toBe('5.38.0-alpha.3+build.7');
  });

  it('falls back to "latest" for branch refs (the real-world bug)', () => {
    expect(tagToNpmVersion('feature/some-branch')).toBe('latest');
    expect(tagToNpmVersion('main')).toBe('latest');
    expect(tagToNpmVersion('next')).toBe('latest');
    expect(tagToNpmVersion('feature/some-thing')).toBe('latest');
  });

  it('falls back to "latest" for commit SHAs', () => {
    expect(tagToNpmVersion('abc1234')).toBe('latest');
    expect(tagToNpmVersion('316b0a34eb7ab6e8045c879970537023b2f012c0')).toBe('latest');
  });

  it('falls back to "latest" for empty / garbage strings', () => {
    expect(tagToNpmVersion('')).toBe('latest');
    expect(tagToNpmVersion('not-a-version')).toBe('latest');
    expect(tagToNpmVersion('5.38')).toBe('latest'); // not full major.minor.patch
    expect(tagToNpmVersion('v5')).toBe('latest');
  });
});

// ---------------------------------------------------------------------------
// Package-manager awareness
// ---------------------------------------------------------------------------

describe('DependencyPhase package-manager awareness', () => {
  let phase: DependencyPhase;

  beforeEach(() => {
    phase = new DependencyPhase();
    mockRunner.Run.mockClear().mockReset();
    mockFs.ReadJSON.mockClear().mockResolvedValue({});
    mockFs.WriteJSON.mockClear().mockResolvedValue(undefined);
    mockFs.WriteText.mockClear().mockResolvedValue(undefined);
    mockFs.FileExists.mockClear().mockResolvedValue(true);
    mockFs.DirectoryExists.mockClear().mockResolvedValue(true);
  });

  describe('command selection', () => {
    it('installs and builds with pnpm by default', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())   // install
        .mockResolvedValueOnce(ok());  // build

      await phase.Run(makeContext());

      expect(mockRunner.Run.mock.calls[0][0]).toBe('pnpm');
      expect(mockRunner.Run.mock.calls[0][1]).toEqual(['install']);
      expect(mockRunner.Run.mock.calls[1][0]).toBe('pnpm');
      expect(mockRunner.Run.mock.calls[1][1]).toEqual(['run', 'build']);
    });

    it('installs with npm when the config overrides to npm', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok());

      await phase.Run(makeContext({ PackageManager: 'npm' }));

      expect(mockRunner.Run.mock.calls[0][0]).toBe('npm');
      expect(mockRunner.Run.mock.calls[0][1]).toEqual(['install']);
    });

    it('does not retry peer conflicts under pnpm', async () => {
      mockRunner.Run.mockResolvedValueOnce(fail({ Stderr: 'ERESOLVE unable to resolve dependency tree' }));

      try {
        await phase.Run(makeContext());
        expect.unreachable('Expected InstallerError to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InstallerError);
        expect((err as InstallerError).Code).toBe('INSTALL_FAILED');
      }
      // No --legacy-peer-deps retry: exactly one install invocation
      expect(mockRunner.Run).toHaveBeenCalledTimes(1);
    });
  });

  describe('workspace scaffold', () => {
    it('pins packageManager and rewrites npm-hoist mj scripts for pnpm', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false); // distribution layout
      mockFs.ReadJSON.mockResolvedValue({
        packageManager: 'npm@11.7.0',
        scripts: {
          'mj': 'node apps/MJAPI/node_modules/@memberjunction/cli/bin/run.js',
          'mj:migrate': 'node apps/MJAPI/node_modules/@memberjunction/cli/bin/run.js migrate',
          'mj:codegen': 'node apps/MJAPI/node_modules/@memberjunction/cli/bin/run.js codegen',
          'install:deps': 'npm install',
        },
      });
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      expect(mockFs.WriteJSON).toHaveBeenCalledWith(
        expect.stringContaining('package.json'),
        expect.objectContaining({
          packageManager: 'pnpm@10.33.0',
          scripts: expect.objectContaining({
            'mj': 'mj',
            'mj:migrate': 'mj migrate',
            'mj:codegen': 'mj codegen',
            'install:deps': 'pnpm install',
          }),
        })
      );
    });

    it('writes pnpm-workspace.yaml when missing under pnpm', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockFs.FileExists.mockImplementation(async (p: string) => !p.endsWith('pnpm-workspace.yaml'));
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      const wsWrite = mockFs.WriteText.mock.calls.find(([p]) => String(p).endsWith('pnpm-workspace.yaml'));
      expect(wsWrite).toBeDefined();
      const content = String(wsWrite![1]);
      expect(content).toContain("- 'apps/*'");
      expect(content).toContain("- 'packages/*'");
      expect(content).toContain('linkWorkspacePackages: true');
      expect(content).toContain('onlyBuiltDependencies:');
      expect(content).toContain('- esbuild');
    });

    it('does not write pnpm-workspace.yaml when it already exists', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockFs.FileExists.mockResolvedValue(true);
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      const wsWrite = mockFs.WriteText.mock.calls.find(([p]) => String(p).endsWith('pnpm-workspace.yaml'));
      expect(wsWrite).toBeUndefined();
    });

    it('does not write pnpm-workspace.yaml under npm', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockFs.FileExists.mockResolvedValue(false);
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext({ PackageManager: 'npm' }));

      const wsWrite = mockFs.WriteText.mock.calls.find(([p]) => String(p).endsWith('pnpm-workspace.yaml'));
      expect(wsWrite).toBeUndefined();
    });
  });

  describe('hoisting under pnpm', () => {
    it('skips the ng-auth-services root-dependency hoist under pnpm', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false); // distribution layout
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      const hoistWrite = mockFs.WriteJSON.mock.calls.find(([, data]) =>
        JSON.stringify(data).includes('@memberjunction/ng-auth-services')
      );
      expect(hoistWrite).toBeUndefined();
    });

    it('keeps the ng-auth-services hoist for npm distribution installs', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false); // distribution layout
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext({ PackageManager: 'npm' }));

      const hoistWrite = mockFs.WriteJSON.mock.calls.find(([, data]) =>
        JSON.stringify(data).includes('@memberjunction/ng-auth-services')
      );
      expect(hoistWrite).toBeDefined();
    });
  });
});
