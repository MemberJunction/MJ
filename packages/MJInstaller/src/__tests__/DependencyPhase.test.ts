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
    // turbo prints ONE comma-separated Failed: line. The fixtures these replaced
    // used one line per package — a shape turbo has never emitted — which is why
    // they agreed with the broken regex. See #4562.
    it('should return BuildPartial=true when only scoped codegen-managed packages fail', async () => {
      const buildOutput = 'Failed:    @memberjunction/ng-core-entity-forms#build, @memberjunction/server-bootstrap#build';

      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: buildOutput, Stderr: '' }));

      const result = await phase.Run(makeContext());

      expect(result.BuildPartial).toBe(true);
      expect(result.BuildSuccess).toBe(false);
    });

    it('should return BuildPartial=true when both unscoped generated packages fail', async () => {
      // The expected state of every distribution install: the assembler strips
      // src/generated/**, so both packages fail until CodeGen writes them.
      const buildOutput = 'Failed:    mj_generatedactions#build, mj_generatedentities#build';

      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: buildOutput, Stderr: '' }));

      expect((await phase.Run(makeContext())).BuildPartial).toBe(true);
    });

    it('should tolerate the same failures when turbo colourises its output', async () => {
      // Regression guard for #4562: with FORCE_COLOR set, turbo wraps each name
      // in SGR escapes and the old regex matched nothing, hard-failing an install
      // that was in its expected pre-CodeGen state.
      const ESC = '\u001B';
      const buildOutput =
        `${ESC}[1mFailed:    ${ESC}[31m${ESC}[1mmj_generatedactions#build${ESC}[0m, ` +
        `${ESC}[31m${ESC}[1mmj_generatedentities#build${ESC}[0m${ESC}[0m`;

      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: buildOutput, Stderr: '' }));

      expect((await phase.Run(makeContext())).BuildPartial).toBe(true);
    });

    it('should name every failed package in the warning, not just the first', async () => {
      const buildOutput = 'Failed:    mj_generatedactions#build, mj_generatedentities#build';

      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: buildOutput, Stderr: '' }));

      const { emitter, emitSpy } = createMockEmitter();
      await phase.Run(makeContext({ Emitter: emitter }));

      const warnEvents = emittedEvents(emitSpy, 'warn') as Array<{ Message: string }>;
      const buildWarns = warnEvents.filter((w) => w.Message.includes('partially succeeded'));
      expect(buildWarns).toHaveLength(1);
      expect(buildWarns[0].Message).toContain('mj_generatedactions');
      expect(buildWarns[0].Message).toContain('mj_generatedentities');
    });
  });

  describe('build non-codegen failure', () => {
    it('should throw BUILD_FAILED when a non-codegen package fails', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: 'Failed:    @memberjunction/core#build', Stderr: '' }));

      await expect(phase.Run(makeContext())).rejects.toThrow(InstallerError);
    });

    it('should NOT swallow a real failure listed behind a codegen-managed one', async () => {
      // Regression guard for #4562: the old regex captured only mj_generatedactions,
      // concluded "all failures are codegen-managed", and reported the install as
      // successful while mj_api had actually failed to build.
      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: 'Failed:    mj_generatedactions#build, mj_api#build', Stderr: '' }));

      await expect(phase.Run(makeContext())).rejects.toThrow(/mj_api/);
    });

    it('should hard-fail when turbo reports a failure it cannot attribute', async () => {
      mockRunner.Run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(fail({ ExitCode: 2, Stdout: ' ERROR  run failed: command  exited (2)', Stderr: '' }));

      await expect(phase.Run(makeContext())).rejects.toThrow(/could not be attributed/i);
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

    it('rewrites the npm-shim build, prebuild, and setup scripts on pre-flip bundles', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false); // distribution layout
      mockFs.ReadJSON.mockResolvedValue({
        packageManager: 'npm@11.7.0',
        scripts: {
          'build': 'npm run build:stream',
          'build:stream': 'turbo --log-order=stream build',
          'prebuild': 'node -e "try { require.resolve(\'turbo\') } catch (e) { console.error(\'\\n❌ Dependencies not installed. Run: npm install\\n\'); process.exit(1); }"',
          'setup': "echo 'Please run: npm run mj:migrate && npm run mj:codegen && npm run build'",
        },
      });
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      const write = mockFs.WriteJSON.mock.calls.find(([p2]) => String(p2).endsWith('package.json'));
      expect(write).toBeDefined();
      const scripts = (write![1] as { scripts: Record<string, string> }).scripts;
      expect(scripts['build']).toBe('turbo --log-order=stream build');
      expect(scripts['prebuild']).not.toContain('Run: npm install');
      expect(scripts['prebuild']).toContain('pnpm install (or npm install)');
      expect(scripts['setup']).not.toContain('npm run');
    });

    it('leaves customized build scripts alone', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockFs.ReadJSON.mockResolvedValue({
        scripts: { 'build': 'my-custom-build --flag' },
      });
      mockRunner.Run.mockResolvedValue(ok());

      await phase.Run(makeContext());

      const write = mockFs.WriteJSON.mock.calls.find(([p2]) => String(p2).endsWith('package.json'));
      expect(write).toBeDefined();
      const scripts = (write![1] as { scripts: Record<string, string> }).scripts;
      expect(scripts['build']).toBe('my-custom-build --flag');
    });

    it('logs the effective package-manager version probed in the install dir after pinning', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockRunner.Run.mockResolvedValue(ok());
      mockRunner.RunSimple.mockClear().mockResolvedValue('10.33.0');

      const { emitter, emitSpy } = createMockEmitter();
      await phase.Run(makeContext({ Emitter: emitter }));

      // Probed IN the install dir, so a corepack/pnpm self-switch driven by the
      // freshly written packageManager pin is what gets recorded.
      expect(mockRunner.RunSimple).toHaveBeenCalledWith('pnpm', ['--version'], '/test/install');
      const logs = emittedEvents(emitSpy, 'log') as Array<{ Message: string }>;
      expect(logs.some((l) => l.Message.includes('pnpm 10.33.0'))).toBe(true);
    });

    it('does not fail the install when the effective-version probe errors', async () => {
      mockFs.DirectoryExists.mockResolvedValue(false);
      mockRunner.Run.mockResolvedValue(ok());
      mockRunner.RunSimple.mockClear().mockRejectedValue(new Error('probe failed'));

      const result = await phase.Run(makeContext());
      expect(result.InstallSuccess).toBe(true);
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
