import { describe, it, expect } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { BaseHealthProbe } from '../BaseHealthProbe';
import { MJHealthEngine } from '../MJHealthEngine';
import type { HealthEvaluateOptions, HealthSignalDefinition, HealthSignalEvaluation, ProbeExecutionMode } from '../types';

const NO_OP_PLAYBOOK = {
  AgentInstructions: 'n/a',
  AllowedAutonomousActions: [],
  MaxAutonomousAttempts: 0,
  RetryCooldownSeconds: 60,
  HumanEscalationCriteria: 'n/a',
};

function makeDefinition(code: string, overrides: Partial<HealthSignalDefinition> = {}): HealthSignalDefinition {
  return {
    Code: code,
    Title: code,
    Layer: 'core',
    OwnerApp: '__mj',
    Mode: 'passive',
    Description: code,
    YellowPlaybook: NO_OP_PLAYBOOK,
    RedPlaybook: NO_OP_PLAYBOOK,
    ...overrides,
  };
}

function makeEvaluation(definition: HealthSignalDefinition, status: HealthSignalEvaluation['Status']): HealthSignalEvaluation {
  return {
    Code: definition.Code,
    Title: definition.Title,
    Layer: definition.Layer,
    OwnerApp: definition.OwnerApp,
    Mode: definition.Mode,
    Status: status,
    Summary: `${definition.Code} is ${status}`,
    ObservedMetrics: {},
    EvaluatedAt: new Date().toISOString(),
    DurationMs: 1,
  };
}

@RegisterClass(BaseHealthProbe, 'test.green')
class GreenProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.green';
  }
  public override get OwnerApp() {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.GREEN')];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    return [makeEvaluation(this.SignalDefinitions[0], 'GREEN')];
  }
}

@RegisterClass(BaseHealthProbe, 'test.yellow')
class YellowProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.yellow';
  }
  public override get OwnerApp() {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.YELLOW')];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    return [makeEvaluation(this.SignalDefinitions[0], 'YELLOW')];
  }
}

@RegisterClass(BaseHealthProbe, 'test.throws')
class ThrowingProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.throws';
  }
  public override get OwnerApp() {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.THROWS')];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    throw new Error('boom');
  }
}

@RegisterClass(BaseHealthProbe, 'test.slow')
class SlowProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.slow';
  }
  public override get OwnerApp() {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.SLOW')];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [makeEvaluation(this.SignalDefinitions[0], 'GREEN')];
  }
}

@RegisterClass(BaseHealthProbe, 'test.open-app')
class OpenAppProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.open-app';
  }
  public override get OwnerApp() {
    return 'some-open-app';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'passive';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.OPENAPP', { OwnerApp: 'some-open-app' })];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    return [makeEvaluation(this.SignalDefinitions[0], 'GREEN')];
  }
}

@RegisterClass(BaseHealthProbe, 'test.live')
class LiveProbe extends BaseHealthProbe {
  public override get ProbeKey() {
    return 'test.live';
  }
  public override get OwnerApp() {
    return '__mj';
  }
  public override get Mode(): ProbeExecutionMode {
    return 'live-test';
  }
  public override get SignalDefinitions() {
    return [makeDefinition('TEST.LIVE', { Mode: 'live-test' })];
  }
  public override async Evaluate(): Promise<HealthSignalEvaluation[]> {
    return [makeEvaluation(this.SignalDefinitions[0], 'GREEN')];
  }
}

/**
 * `@RegisterClass` registers each fixture probe as a side effect of module evaluation — this
 * array exists only to give that side effect an explicit reference, so lint doesn't flag the
 * classes as unused and the fixture set reads as one deliberate list.
 */
const FIXTURE_PROBES = [GreenProbe, YellowProbe, ThrowingProbe, SlowProbe, OpenAppProbe, LiveProbe];

function makeEvaluateOptions(overrides: Partial<HealthEvaluateOptions> = {}): HealthEvaluateOptions {
  const provider = new DatabaseProviderStub();
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    ...overrides,
  };
}

describe('MJHealthEngine', () => {
  it('registers every fixture probe with the ClassFactory', () => {
    const registeredKeys = MJHealthEngine.Instance.GetRegisteredProbes().map((p) => p.ProbeKey);
    for (const probe of FIXTURE_PROBES) {
      expect(registeredKeys).toContain(new probe().ProbeKey);
    }
  });

  it('rolls up OverallStatus to RED when any signal is RED', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: '__mj' }));
    const codes = report.Signals.map((s) => s.Code);
    expect(codes).toContain('TEST.GREEN');
    expect(codes).toContain('TEST.YELLOW');
    expect(codes).toContain('TEST.THROWS');
    expect(report.OverallStatus).toBe('RED');
    expect(report.SummaryCounts.Red).toBeGreaterThanOrEqual(1);
    expect(report.SummaryCounts.Yellow).toBeGreaterThanOrEqual(1);
  });

  it('converts a thrown probe exception into a RED evaluation with the RedPlaybook attached', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: '__mj' }));
    const throwsSignal = report.Signals.find((s) => s.Code === 'TEST.THROWS');
    expect(throwsSignal?.Status).toBe('RED');
    expect(throwsSignal?.DiagnosticError).toContain('boom');
    expect(throwsSignal?.ActivePlaybook).toBe(NO_OP_PLAYBOOK);
  });

  it('converts a probe that exceeds TimeoutMs into a RED evaluation', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: '__mj', TimeoutMs: 20 }));
    const slowSignal = report.Signals.find((s) => s.Code === 'TEST.SLOW');
    expect(slowSignal?.Status).toBe('RED');
    expect(slowSignal?.DiagnosticError).toMatch(/timed out/i);
  });

  it('filters probes by AppFilter', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: 'some-open-app' }));
    expect(report.Signals.map((s) => s.Code)).toEqual(['TEST.OPENAPP']);
  });

  it('filters probes by Mode', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: '__mj', Mode: 'live-test' }));
    expect(report.Signals.map((s) => s.Code)).toEqual(['TEST.LIVE']);
  });

  it('reports GREEN overall status when every evaluated signal is GREEN', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(makeEvaluateOptions({ AppFilter: 'some-open-app' }));
    expect(report.OverallStatus).toBe('GREEN');
    expect(report.SummaryCounts).toEqual({ Green: 1, Yellow: 0, Red: 0 });
  });

  it('GetSignalCatalog returns the declared signal for every registered probe', () => {
    const catalog = MJHealthEngine.Instance.GetSignalCatalog();
    const codes = catalog.map((s) => s.Code);
    expect(codes).toContain('TEST.GREEN');
    expect(codes).toContain('TEST.OPENAPP');
    expect(codes).toContain('TEST.LIVE');
  });

  it('stamps MJVersion and DatabasePlatform from the evaluate options', async () => {
    const report = await MJHealthEngine.Instance.Evaluate(
      makeEvaluateOptions({ AppFilter: 'some-open-app', MJVersion: '6.3.0-edge.0', DatabasePlatform: 'postgresql' }),
    );
    expect(report.MJVersion).toBe('6.3.0-edge.0');
    expect(report.DatabasePlatform).toBe('postgresql');
  });
});
