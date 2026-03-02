import { InstallPlan, type PhaseInfo } from '../models/InstallPlan.js';
import type { PhaseId } from '../errors/InstallerError.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';

describe('InstallPlan', () => {
  const tag = 'v5.2.0';
  const dir = '/test/install';
  const config: PartialInstallConfig = {
    DatabaseHost: 'localhost',
    DatabasePort: 1433,
  };

  describe('constructor', () => {
    it('should set Tag correctly', () => {
      const plan = new InstallPlan(tag, dir, config);
      expect(plan.Tag).toBe('v5.2.0');
    });

    it('should set Dir correctly', () => {
      const plan = new InstallPlan(tag, dir, config);
      expect(plan.Dir).toBe('/test/install');
    });

    it('should set Config correctly', () => {
      const plan = new InstallPlan(tag, dir, config);
      expect(plan.Config).toBe(config);
    });

    it('should set CreatedAt as a Date instance near now', () => {
      const before = Date.now();
      const plan = new InstallPlan(tag, dir, config);
      const after = Date.now();

      expect(plan.CreatedAt).toBeInstanceOf(Date);
      expect(plan.CreatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(plan.CreatedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('Phases', () => {
    it('should have exactly 9 entries', () => {
      const plan = new InstallPlan(tag, dir, config);
      expect(plan.Phases).toHaveLength(9);
    });

    it('should have deterministic phase order', () => {
      const plan = new InstallPlan(tag, dir, config);
      const phaseIds = plan.Phases.map((p: PhaseInfo) => p.Id);
      expect(phaseIds).toEqual([
        'preflight',
        'scaffold',
        'configure',
        'database',
        'platform',
        'dependencies',
        'migrate',
        'codegen',
        'smoke_test',
      ]);
    });

    it('should give each phase an Id, non-empty Description, and Skipped boolean', () => {
      const plan = new InstallPlan(tag, dir, config);
      for (const phase of plan.Phases) {
        expect(typeof phase.Id).toBe('string');
        expect(phase.Id.length).toBeGreaterThan(0);
        expect(typeof phase.Description).toBe('string');
        expect(phase.Description.length).toBeGreaterThan(0);
        expect(typeof phase.Skipped).toBe('boolean');
      }
    });

    it('should mark all phases as not skipped when no skipPhases provided', () => {
      const plan = new InstallPlan(tag, dir, config);
      for (const phase of plan.Phases) {
        expect(phase.Skipped).toBe(false);
      }
    });

    it('should mark specified phases as skipped', () => {
      const skipPhases = new Set<PhaseId>(['database', 'smoke_test']);
      const plan = new InstallPlan(tag, dir, config, skipPhases);

      const dbPhase = plan.Phases.find((p: PhaseInfo) => p.Id === 'database');
      const smokePhase = plan.Phases.find((p: PhaseInfo) => p.Id === 'smoke_test');

      expect(dbPhase!.Skipped).toBe(true);
      expect(smokePhase!.Skipped).toBe(true);
    });

    it('should leave non-skipped phases with Skipped=false when some are skipped', () => {
      const skipPhases = new Set<PhaseId>(['database']);
      const plan = new InstallPlan(tag, dir, config, skipPhases);

      const preflightPhase = plan.Phases.find((p: PhaseInfo) => p.Id === 'preflight');
      const scaffoldPhase = plan.Phases.find((p: PhaseInfo) => p.Id === 'scaffold');

      expect(preflightPhase!.Skipped).toBe(false);
      expect(scaffoldPhase!.Skipped).toBe(false);
    });
  });

  describe('Summarize', () => {
    it('should return a string containing the Tag', () => {
      const plan = new InstallPlan(tag, dir, config);
      const summary = plan.Summarize();
      expect(summary).toContain('v5.2.0');
    });

    it('should return a string containing the Dir', () => {
      const plan = new InstallPlan(tag, dir, config);
      const summary = plan.Summarize();
      expect(summary).toContain('/test/install');
    });

    it('should include "(skip)" for skipped phases', () => {
      const skipPhases = new Set<PhaseId>(['smoke_test']);
      const plan = new InstallPlan(tag, dir, config, skipPhases);
      const summary = plan.Summarize();

      // The skipped phase line should contain (skip)
      const lines = summary.split('\n');
      const smokeLine = lines.find((l) => l.includes('smoke_test'));
      expect(smokeLine).toBeDefined();
      expect(smokeLine).toContain('(skip)');
    });

    it('should contain "Install Plan" header', () => {
      const plan = new InstallPlan(tag, dir, config);
      const summary = plan.Summarize();
      expect(summary).toContain('Install Plan');
    });
  });
});
