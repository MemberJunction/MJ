import { describe, it, expect, vi } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { LiveEntityCrudProbe, LIVE_ENTITY_CRUD_SIGNAL_CODE } from '../../probes/LiveEntityCrudProbe';
import { BaseLiveCrudVerifier, LiveCrudVerifierResult } from '../../LiveCrudVerifier';
import type { HealthProbeContext } from '../../types';

// AppFilter: '__mj' scopes these legacy tests to the built-in SELECT 1 round trip only — the
// 'some-open-app'-owned fixture verifiers registered below (module scope, shared across this
// file's tests) would otherwise also run and inflate the rollback-call assertions.
function makeContext(provider: DatabaseProviderStub): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'live-test',
    AppFilter: '__mj',
    TimeoutMs: 15_000,
  };
}

describe('LiveEntityCrudProbe', () => {
  it('reports YELLOW when zero verifiers are registered or supplied and always rolls back', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{}]);
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const commitSpy = vi.spyOn(provider, 'CommitTransaction');
    const probe = new LiveEntityCrudProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(LIVE_ENTITY_CRUD_SIGNAL_CODE);
    expect(evaluation.Status).toBe('YELLOW');
    expect(evaluation.Summary).toContain('no BaseLiveCrudVerifier is registered');
    expect(evaluation.ObservedMetrics.RegisteredVerifierCount).toBe(0);
    expect(evaluation.ActivePlaybook).toBeDefined();
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).not.toHaveBeenCalled();
  });

  it('reports GREEN on built-in signal when a verifier is registered or supplied in context', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{}]);
    const probe = new LiveEntityCrudProbe();

    const evaluations = await probe.Evaluate(makeVerifierContext(provider, 'some-open-app'));
    const builtIn = evaluations.find((e) => e.Code === LIVE_ENTITY_CRUD_SIGNAL_CODE);

    expect(builtIn?.Status).toBe('GREEN');
    expect(builtIn?.ObservedMetrics.RegisteredVerifierCount).toBeGreaterThanOrEqual(1);
    expect(builtIn?.ActivePlaybook).toBeUndefined();
  });

  it('reports RED and still rolls back when the synthetic write fails', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('write path broken'));
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const probe = new LiveEntityCrudProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('write path broken');
    expect(rollbackSpy).toHaveBeenCalledTimes(1);
  });

  it('declares itself as a live-test probe owned by MJ Core', () => {
    const probe = new LiveEntityCrudProbe();
    expect(probe.Mode).toBe('live-test');
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.SignalDefinitions[0].Layer).toBe('live-test');
  });
});

@RegisterClass(BaseLiveCrudVerifier, 'test.greenVerifier')
class GreenVerifier extends BaseLiveCrudVerifier {
  public override get VerifierKey(): string {
    return 'test.greenVerifier';
  }
  public override get OwnerApp(): string {
    return 'some-open-app';
  }
  public override get Title(): string {
    return 'Green Test Verifier';
  }
  public override async Verify(): Promise<LiveCrudVerifierResult> {
    return { Success: true, Summary: 'synthetic reach check passed', ObservedMetrics: { RowsTouched: 1 } };
  }
}

@RegisterClass(BaseLiveCrudVerifier, 'test.failingVerifier')
class FailingVerifier extends BaseLiveCrudVerifier {
  public override get VerifierKey(): string {
    return 'test.failingVerifier';
  }
  public override get OwnerApp(): string {
    return 'some-open-app';
  }
  public override get Title(): string {
    return 'Failing Test Verifier';
  }
  public override async Verify(): Promise<LiveCrudVerifierResult> {
    return { Success: false, Summary: 'synthetic reach check did not find the record', DiagnosticError: 'record not visible under RLS' };
  }
}

/** `@RegisterClass` side effect reference — see the identical pattern in MJHealthEngine.test.ts. */
const FIXTURE_VERIFIERS = [GreenVerifier, FailingVerifier];

function makeVerifierContext(provider: DatabaseProviderBase, appFilter?: string): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'live-test',
    AppFilter: appFilter,
    TimeoutMs: 15_000,
  };
}

describe('LiveEntityCrudProbe — BaseLiveCrudVerifier discovery', () => {
  it('registers every fixture verifier with the ClassFactory', () => {
    const probe = new LiveEntityCrudProbe();
    const keys = probe.SignalDefinitions.map((s) => s.Code);
    for (const verifier of FIXTURE_VERIFIERS) {
      const v = new verifier();
      expect(keys).toContain(`LIVE.${v.OwnerApp.toUpperCase()}.${v.VerifierKey.toUpperCase()}`);
    }
  });

  it('runs a successful verifier inside a rolled-back transaction and reports GREEN', async () => {
    const provider = new DatabaseProviderStub();
    const rollbackSpy = vi.spyOn(provider, 'RollbackTransaction');
    const probe = new LiveEntityCrudProbe();

    const evaluations = await probe.Evaluate(makeVerifierContext(provider, 'some-open-app'));
    const greenEval = evaluations.find((e) => e.Code === 'LIVE.SOME-OPEN-APP.TEST.GREENVERIFIER');

    expect(greenEval?.Status).toBe('GREEN');
    expect(greenEval?.ObservedMetrics).toEqual({ RowsTouched: 1 });
    // Both the built-in round trip and the verifier each open+rollback their own scope.
    expect(rollbackSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reports RED with the diagnostic when a verifier reports failure', async () => {
    const provider = new DatabaseProviderStub();
    const probe = new LiveEntityCrudProbe();

    const evaluations = await probe.Evaluate(makeVerifierContext(provider, 'some-open-app'));
    const failEval = evaluations.find((e) => e.Code === 'LIVE.SOME-OPEN-APP.TEST.FAILINGVERIFIER');

    expect(failEval?.Status).toBe('RED');
    expect(failEval?.DiagnosticError).toContain('record not visible under RLS');
    expect(failEval?.ActivePlaybook).toBeDefined();
  });

  it('filters verifiers by AppFilter, same as probes', async () => {
    const provider = new DatabaseProviderStub();
    const probe = new LiveEntityCrudProbe();

    const evaluations = await probe.Evaluate(makeVerifierContext(provider, '__mj'));

    expect(evaluations.some((e) => e.Code.startsWith('LIVE.SOME-OPEN-APP.'))).toBe(false);
  });

  it('reports RED when the shared rollback fails during a verifier run, even though Verify succeeded', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'RollbackTransaction').mockRejectedValue(new Error('savepoint vanished'));
    const probe = new LiveEntityCrudProbe();

    const evaluations = await probe.Evaluate(makeVerifierContext(provider, 'some-open-app'));
    const greenEval = evaluations.find((e) => e.Code === 'LIVE.SOME-OPEN-APP.TEST.GREENVERIFIER');

    expect(greenEval?.Status).toBe('RED');
    expect(greenEval?.DiagnosticError).toContain('savepoint vanished');
  });

  it('executes multiple verifiers sequentially without overlapping execution', async () => {
    const provider = new DatabaseProviderStub();
    const probe = new LiveEntityCrudProbe();
    const sequence: string[] = [];

    class SeqVerifier1 extends BaseLiveCrudVerifier {
      public override get VerifierKey() {
        return 'seq.v1';
      }
      public override get OwnerApp() {
        return 'seq-app';
      }
      public override get Title() {
        return 'V1';
      }
      public override async Verify(): Promise<LiveCrudVerifierResult> {
        sequence.push('v1:start');
        await new Promise((r) => setTimeout(r, 10));
        sequence.push('v1:end');
        return { Success: true, Summary: 'v1 done' };
      }
    }

    class SeqVerifier2 extends BaseLiveCrudVerifier {
      public override get VerifierKey() {
        return 'seq.v2';
      }
      public override get OwnerApp() {
        return 'seq-app';
      }
      public override get Title() {
        return 'V2';
      }
      public override async Verify(): Promise<LiveCrudVerifierResult> {
        sequence.push('v2:start');
        await new Promise((r) => setTimeout(r, 10));
        sequence.push('v2:end');
        return { Success: true, Summary: 'v2 done' };
      }
    }

    const context: HealthProbeContext = {
      DatabaseProvider: provider,
      MetadataProvider: provider,
      SystemUser: {} as UserInfo,
      Mode: 'live-test',
      AppFilter: 'seq-app',
      TimeoutMs: 15_000,
      LiveCrudVerifier: [new SeqVerifier1(), new SeqVerifier2()],
    };

    const evals = await probe.Evaluate(context);
    expect(sequence).toEqual(['v1:start', 'v1:end', 'v2:start', 'v2:end']);
    expect(evals.length).toBe(3); // builtIn + v1 + v2
  });
});
