import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallerEngine } from '../InstallerEngine.js';
import { InstallerError } from '../errors/InstallerError.js';
import type { InstallState } from '../models/InstallState.js';
import type { VersionInfo } from '../models/VersionInfo.js';

/* ------------------------------------------------------------------ */
/*  Mock all 9 phase classes + GitHubReleaseProvider + InstallState    */
/* ------------------------------------------------------------------ */

const mockPreflightRun = vi.fn();
const mockPreflightRunDiagnostics = vi.fn();
vi.mock('../phases/PreflightPhase.js', () => ({
  PreflightPhase: vi.fn(function () {
    return { Run: mockPreflightRun, RunDiagnostics: mockPreflightRunDiagnostics };
  }),
}));

const mockScaffoldRun = vi.fn();
vi.mock('../phases/ScaffoldPhase.js', () => ({
  ScaffoldPhase: vi.fn(function () {
    return { Run: mockScaffoldRun };
  }),
}));

const mockConfigureRun = vi.fn();
vi.mock('../phases/ConfigurePhase.js', () => ({
  ConfigurePhase: vi.fn(function () {
    return { Run: mockConfigureRun };
  }),
}));

const mockDatabaseRun = vi.fn();
vi.mock('../phases/DatabaseProvisionPhase.js', () => ({
  DatabaseProvisionPhase: vi.fn(function () {
    return { Run: mockDatabaseRun };
  }),
}));

const mockMigrateRun = vi.fn();
vi.mock('../phases/MigratePhase.js', () => ({
  MigratePhase: vi.fn(function () {
    return { Run: mockMigrateRun };
  }),
}));

const mockPlatformRun = vi.fn();
vi.mock('../phases/PlatformCompatPhase.js', () => ({
  PlatformCompatPhase: vi.fn(function () {
    return { Run: mockPlatformRun };
  }),
}));

const mockDependencyRun = vi.fn();
vi.mock('../phases/DependencyPhase.js', () => ({
  DependencyPhase: vi.fn(function () {
    return { Run: mockDependencyRun };
  }),
}));

const mockCodeGenRun = vi.fn();
const mockCodeGenRunKnownIssueChecks = vi.fn();
vi.mock('../phases/CodeGenPhase.js', () => ({
  CodeGenPhase: vi.fn(function () {
    return { Run: mockCodeGenRun, RunKnownIssueChecks: mockCodeGenRunKnownIssueChecks };
  }),
}));

const mockSmokeTestRun = vi.fn();
vi.mock('../phases/SmokeTestPhase.js', () => ({
  SmokeTestPhase: vi.fn(function () {
    return { Run: mockSmokeTestRun };
  }),
}));

const mockListReleases = vi.fn();
const mockGetReleaseByTag = vi.fn();
const mockDownloadRelease = vi.fn();
vi.mock('../adapters/GitHubReleaseProvider.js', () => ({
  GitHubReleaseProvider: vi.fn(function () {
    return {
      ListReleases: mockListReleases,
      GetReleaseByTag: mockGetReleaseByTag,
      DownloadRelease: mockDownloadRelease,
    };
  }),
}));

// Use vi.hoisted so these are available when the vi.mock factory runs (hoisted above const)
const { mockInstallStateLoad, mockStateInstance } = vi.hoisted(() => ({
  mockInstallStateLoad: vi.fn().mockResolvedValue(null),
  mockStateInstance: {
    Tag: '',
    Dir: '',
    StartedAt: new Date().toISOString(),
    GetPhaseStatus: vi.fn().mockReturnValue('pending'),
    MarkCompleted: vi.fn(),
    MarkFailed: vi.fn(),
    MarkSkipped: vi.fn(),
    Save: vi.fn().mockResolvedValue(undefined),
    FirstIncompletePhase: vi.fn().mockReturnValue(null),
  },
}));

// Full mock: constructor returns mockStateInstance, static Load is mockInstallStateLoad
vi.mock('../models/InstallState.js', () => {
  function FakeInstallState(dir: string, tag: string) {
    mockStateInstance.Dir = dir;
    mockStateInstance.Tag = tag;
    return mockStateInstance;
  }
  FakeInstallState.Load = mockInstallStateLoad;
  FakeInstallState.STATE_FILENAME = '.mj-install-state.json';
  return { InstallState: FakeInstallState };
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function defaultPhaseResults() {
  // Set up all phases to succeed by default
  mockPreflightRun.mockResolvedValue({
    Passed: true,
    Diagnostics: { Failures: [], Warnings: [] },
  });
  mockScaffoldRun.mockResolvedValue({
    Version: { Tag: 'v5.2.0' },
    ExtractedDir: '/test/install',
  });
  mockConfigureRun.mockResolvedValue({ Config: {} });
  mockDatabaseRun.mockResolvedValue({ ValidationPassed: true });
  mockMigrateRun.mockResolvedValue({ Success: true });
  mockPlatformRun.mockResolvedValue({ CrossEnvNeeded: false });
  mockDependencyRun.mockResolvedValue({ Warnings: [] });
  mockCodeGenRun.mockResolvedValue({ RetryUsed: false });
  mockSmokeTestRun.mockResolvedValue({ ApiRunning: true, ExplorerRunning: true });
}

const sampleVersion: VersionInfo = {
  Tag: 'v5.2.0',
  Name: 'v5.2.0',
  ReleaseDate: new Date('2025-02-15'),
  Prerelease: false,
  DownloadUrl: 'https://github.com/MemberJunction/MJ/archive/refs/tags/v5.2.0.zip',
};

/* ================================================================== */
/*  Tests                                                             */
/* ================================================================== */

describe('InstallerEngine', () => {
  let engine: InstallerEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset InstallState mock defaults (clearAllMocks doesn't reset implementations)
    mockInstallStateLoad.mockResolvedValue(null);
    mockStateInstance.GetPhaseStatus.mockReturnValue('pending');
    mockStateInstance.Save.mockResolvedValue(undefined);
    engine = new InstallerEngine();
    defaultPhaseResults();
  });

  // ── ListVersions ──────────────────────────────────────────────────

  describe('ListVersions', () => {
    it('delegates to GitHubReleaseProvider', async () => {
      mockListReleases.mockResolvedValue([sampleVersion]);
      const result = await engine.ListVersions();
      expect(result).toEqual([sampleVersion]);
      expect(mockListReleases).toHaveBeenCalledWith(false);
    });

    it('passes includePrerelease flag', async () => {
      mockListReleases.mockResolvedValue([]);
      await engine.ListVersions(true);
      expect(mockListReleases).toHaveBeenCalledWith(true);
    });
  });

  // ── CreatePlan ────────────────────────────────────────────────────

  describe('CreatePlan', () => {
    it('creates a plan with default phases', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test' });
      expect(plan.Tag).toBe('latest');
      expect(plan.Dir).toBe('/test');
      expect(plan.Phases.length).toBe(9);
      // No phases skipped by default
      const skipped = plan.Phases.filter((p) => p.Skipped);
      expect(skipped).toHaveLength(0);
    });

    it('uses provided tag', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.1.0' });
      expect(plan.Tag).toBe('v5.1.0');
    });

    it('skips database phase when SkipDB is true', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', SkipDB: true });
      const dbPhase = plan.Phases.find((p) => p.Id === 'database');
      expect(dbPhase?.Skipped).toBe(true);
    });

    it('skips smoke_test when SkipStart is true', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', SkipStart: true });
      const smokePhase = plan.Phases.find((p) => p.Id === 'smoke_test');
      expect(smokePhase?.Skipped).toBe(true);
    });

    it('skips smoke_test when Fast is true', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Fast: true });
      const smokePhase = plan.Phases.find((p) => p.Id === 'smoke_test');
      expect(smokePhase?.Skipped).toBe(true);
    });

    it('skips codegen phase when SkipCodeGen is true', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', SkipCodeGen: true });
      const codeGenPhase = plan.Phases.find((p) => p.Id === 'codegen');
      expect(codeGenPhase?.Skipped).toBe(true);
    });

    it('merges config overrides with defaults', async () => {
      const plan = await engine.CreatePlan({
        Dir: '/test',
        Config: { DatabaseHost: 'custom-host', DatabasePort: 5433 },
      });
      expect(plan.Config.DatabaseHost).toBe('custom-host');
      expect(plan.Config.DatabasePort).toBe(5433);
    });
  });

  // ── On / Off ──────────────────────────────────────────────────────

  describe('On / Off', () => {
    it('subscripted handler receives events during Run', async () => {
      const phaseStarts: string[] = [];
      const handler = (e: { Phase: string }) => phaseStarts.push(e.Phase);
      engine.On('phase:start', handler);

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      expect(phaseStarts.length).toBe(9);
      expect(phaseStarts[0]).toBe('preflight');
      expect(phaseStarts[8]).toBe('smoke_test');
    });

    it('Off removes handler so it stops receiving events', async () => {
      const phaseStarts: string[] = [];
      const handler = (e: { Phase: string }) => phaseStarts.push(e.Phase);
      engine.On('phase:start', handler);
      engine.Off('phase:start', handler);

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      expect(phaseStarts).toHaveLength(0);
    });
  });

  // ── Run ───────────────────────────────────────────────────────────

  describe('Run', () => {
    it('executes all 9 phases in order and returns success', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Success).toBe(true);
      expect(result.PhasesCompleted).toEqual([
        'preflight', 'scaffold', 'configure', 'database',
        'platform', 'dependencies', 'migrate', 'codegen', 'smoke_test',
      ]);
      expect(result.PhasesFailed).toEqual([]);
      expect(result.DurationMs).toBeGreaterThanOrEqual(0);
    });

    it('stops on first phase failure and returns partial result', async () => {
      // Must register error handler — Node EventEmitter throws on unhandled 'error' events
      engine.On('error', () => {});

      mockConfigureRun.mockRejectedValue(
        new InstallerError('configure', 'CONFIG_ERROR', 'Missing DB host', 'Provide DatabaseHost')
      );

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Success).toBe(false);
      expect(result.PhasesCompleted).toEqual(['preflight', 'scaffold']);
      expect(result.PhasesFailed).toEqual(['configure']);
    });

    it('emits phase:start and phase:end events for each phase', async () => {
      const events: Array<{ type: string; phase: string }> = [];
      engine.On('phase:start', (e) => events.push({ type: 'start', phase: e.Phase }));
      engine.On('phase:end', (e) => events.push({ type: 'end', phase: e.Phase }));

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      // Each phase should have a start and end
      expect(events.filter((e) => e.type === 'start')).toHaveLength(9);
      expect(events.filter((e) => e.type === 'end')).toHaveLength(9);
      // Start and end should alternate per phase
      expect(events[0]).toEqual({ type: 'start', phase: 'preflight' });
      expect(events[1]).toEqual({ type: 'end', phase: 'preflight' });
    });

    it('emits error event on phase failure', async () => {
      const errors: Array<{ phase: string }> = [];
      engine.On('error', (e) => errors.push({ phase: e.Phase }));

      mockMigrateRun.mockRejectedValue(
        new InstallerError('migrate', 'MIGRATE_FAILED', 'Migration failed', 'Check DB')
      );

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      expect(errors).toHaveLength(1);
      expect(errors[0].phase).toBe('migrate');
    });

    it('wraps non-InstallerError exceptions with UNEXPECTED_ERROR', async () => {
      const errors: Array<{ error: InstallerError }> = [];
      engine.On('error', (e) => errors.push({ error: e.Error }));

      mockPreflightRun.mockRejectedValue(new TypeError('something went wrong'));

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBeInstanceOf(InstallerError);
      expect(errors[0].error.Code).toBe('UNEXPECTED_ERROR');
      expect(errors[0].error.message).toContain('something went wrong');
    });

    it('skips phases marked as skipped in the plan', async () => {
      const plan = await engine.CreatePlan({
        Dir: '/test',
        Tag: 'v5.2.0',
        SkipDB: true,
        SkipStart: true,
      });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Success).toBe(true);
      // database and smoke_test should not appear in completed
      expect(result.PhasesCompleted).not.toContain('database');
      expect(result.PhasesCompleted).not.toContain('smoke_test');
      // Their Run methods should not have been called
      expect(mockDatabaseRun).not.toHaveBeenCalled();
      expect(mockSmokeTestRun).not.toHaveBeenCalled();
    });

    it('collects warnings from phases', async () => {
      mockDependencyRun.mockResolvedValue({ Warnings: ['Deprecated package found'] });
      mockSmokeTestRun.mockResolvedValue({ ApiRunning: false, ExplorerRunning: true });

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Success).toBe(true);
      expect(result.Warnings).toContain('Deprecated package found');
      expect(result.Warnings).toContain('MJAPI did not respond to health checks. Check the API logs.');
    });

    it('forwards fast flag to codegen phase', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true, Fast: true });

      // Verify CodeGenPhase.Run was called and check the context passed
      expect(mockCodeGenRun).toHaveBeenCalled();
      const callArgs = mockCodeGenRun.mock.calls[0][0];
      expect(callArgs.Fast).toBe(true);
    });

    it('passes config overrides from RunOptions', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, {
        Yes: true,
        Config: { DatabaseHost: 'override-host' },
      });

      // Preflight gets config — verify it was called
      expect(mockPreflightRun).toHaveBeenCalled();
    });

    it('reports codegen retry warning', async () => {
      mockCodeGenRun.mockResolvedValue({ RetryUsed: true });

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Warnings).toContain('Code generation required a retry to produce all artifacts.');
    });

    it('reports platform cross-env warning', async () => {
      mockPlatformRun.mockResolvedValue({ CrossEnvNeeded: true });

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Warnings).toContain(
        'cross-env was added as a dependency. It will be installed in the dependencies phase.'
      );
    });

    it('reports database validation warning', async () => {
      mockDatabaseRun.mockResolvedValue({ ValidationPassed: false });

      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      const result = await engine.Run(plan, { Yes: true });

      expect(result.Warnings).toContain(
        'Database validation did not pass. You may need to run the setup script manually.'
      );
    });
  });

  // ── Resume ────────────────────────────────────────────────────────

  describe('Resume', () => {
    it('throws InstallerError with NO_STATE_FILE when no state exists', async () => {
      mockInstallStateLoad.mockResolvedValue(null);

      await expect(engine.Resume('/test/dir')).rejects.toThrow(InstallerError);
      await expect(engine.Resume('/test/dir')).rejects.toThrow('No install state file found');
    });

    it('resumes from state file and runs remaining phases', async () => {
      // Create a mock state with preflight + scaffold completed
      const mockState = {
        Tag: 'v5.2.0',
        Dir: '/test/dir',
        StartedAt: new Date().toISOString(),
        GetPhaseStatus: vi.fn((id: string) => {
          if (id === 'preflight' || id === 'scaffold') return 'completed';
          return 'pending';
        }),
        MarkCompleted: vi.fn(),
        MarkFailed: vi.fn(),
        MarkSkipped: vi.fn(),
        Save: vi.fn().mockResolvedValue(undefined),
        FirstIncompletePhase: vi.fn().mockReturnValue('configure'),
      };
      mockInstallStateLoad.mockResolvedValue(mockState as unknown as InstallState);

      const result = await engine.Resume('/test/dir', { Yes: true });
      expect(result.Success).toBe(true);
      // Preflight and scaffold should be in completed (skipped via resume)
      // but their Run methods should NOT have been called
      expect(mockPreflightRun).not.toHaveBeenCalled();
      expect(mockScaffoldRun).not.toHaveBeenCalled();
      // Remaining phases should have been executed
      expect(mockConfigureRun).toHaveBeenCalled();
      expect(mockDatabaseRun).toHaveBeenCalled();
    });
  });

  // ── Doctor ────────────────────────────────────────────────────────

  describe('Doctor', () => {
    it('runs preflight diagnostics and returns results', async () => {
      const mockDiagnostics = {
        Checks: [],
        HasFailures: false,
        Failures: [],
        Warnings: [],
        LastInstall: null,
        AddCheck: vi.fn(),
      };
      mockPreflightRunDiagnostics.mockResolvedValue(mockDiagnostics);
      mockCodeGenRunKnownIssueChecks.mockResolvedValue([]);

      const result = await engine.Doctor('/test/dir');
      expect(result).toBe(mockDiagnostics);
      expect(mockPreflightRunDiagnostics).toHaveBeenCalledWith(
        '/test/dir',
        expect.objectContaining({}),
        expect.anything()
      );
    });

    it('includes last install info from state file', async () => {
      const mockDiagnostics = {
        Checks: [],
        HasFailures: false,
        Failures: [],
        Warnings: [],
        LastInstall: null as { Tag: string; Timestamp: string } | null,
        AddCheck: vi.fn(),
      };
      mockPreflightRunDiagnostics.mockResolvedValue(mockDiagnostics);
      mockCodeGenRunKnownIssueChecks.mockResolvedValue([]);

      const mockState = {
        Tag: 'v5.2.0',
        StartedAt: '2025-02-15T00:00:00.000Z',
      };
      mockInstallStateLoad.mockResolvedValue(mockState as unknown as InstallState);

      const result = await engine.Doctor('/test/dir');
      expect(result.LastInstall).toEqual({
        Tag: 'v5.2.0',
        Timestamp: '2025-02-15T00:00:00.000Z',
      });
    });

    it('adds known issue checks to diagnostics', async () => {
      const mockDiagnostics = {
        Checks: [],
        HasFailures: false,
        Failures: [],
        Warnings: [],
        LastInstall: null,
        AddCheck: vi.fn(),
      };
      mockPreflightRunDiagnostics.mockResolvedValue(mockDiagnostics);
      mockCodeGenRunKnownIssueChecks.mockResolvedValue([
        { Id: 'issue-1', Status: 'needs_patch', Description: 'Known bug', RelativePath: 'foo.ts' },
        { Id: 'issue-2', Status: 'ok', Description: 'Already fixed' },
      ]);

      await engine.Doctor('/test/dir');

      expect(mockDiagnostics.AddCheck).toHaveBeenCalledTimes(2);
      // First call: needs_patch → warn
      expect(mockDiagnostics.AddCheck).toHaveBeenCalledWith(
        expect.objectContaining({ Status: 'warn', Name: 'Known issue: issue-1' })
      );
      // Second call: ok → pass
      expect(mockDiagnostics.AddCheck).toHaveBeenCalledWith(
        expect.objectContaining({ Status: 'pass', Name: 'Known issue: issue-2' })
      );
    });
  });

  // ── detectOS (private, tested indirectly) ─────────────────────────

  describe('detectOS (indirect via platform phase)', () => {
    it('passes detected OS to PlatformCompatPhase', async () => {
      const plan = await engine.CreatePlan({ Dir: '/test', Tag: 'v5.2.0' });
      await engine.Run(plan, { Yes: true });

      expect(mockPlatformRun).toHaveBeenCalled();
      const callArgs = mockPlatformRun.mock.calls[0][0];
      // On Windows test env, this should be 'windows'
      expect(['windows', 'macos', 'linux', 'other']).toContain(callArgs.DetectedOS);
    });
  });
});
