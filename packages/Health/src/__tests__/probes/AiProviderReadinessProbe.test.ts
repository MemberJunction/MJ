import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import type { UserInfo } from '@memberjunction/core';
import { AiProviderReadinessProbe, AI_PROVIDER_READINESS_SIGNAL_CODE } from '../../probes/AiProviderReadinessProbe';
import type { HealthProbeContext } from '../../types';

function makeContext(provider: DatabaseProviderStub): HealthProbeContext {
  return {
    DatabaseProvider: provider,
    MetadataProvider: provider,
    SystemUser: {} as UserInfo,
    Mode: 'passive',
    TimeoutMs: 15_000,
  };
}

describe('AiProviderReadinessProbe', () => {
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    if (origOpenAI !== undefined) process.env.OPENAI_API_KEY = origOpenAI;
    else delete process.env.OPENAI_API_KEY;
    if (origAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = origAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it('reports RED when zero active inference-provider catalog routes exist', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockResolvedValue([{ ActiveRouteCount: 0 }]);
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Code).toBe(AI_PROVIDER_READINESS_SIGNAL_CODE);
    expect(evaluation.Status).toBe('RED');
    expect(evaluation.ActivePlaybook).toBeDefined();
  });

  it('reports RED on stock install when catalog rows exist but no API keys or credentials are configured', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
      if (sql.includes('AIModelVendor')) return [{ ActiveRouteCount: 5 }];
      if (sql.includes('AICredentialBinding')) return [{ BindingCount: 0 }];
      return [];
    });
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.Summary).toContain('zero API keys or credentials are configured');
  });

  it('reports YELLOW when exactly one inference provider is configured (no fallback)', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-test-12345678';
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
      if (sql.includes('AIModelVendor')) return [{ ActiveRouteCount: 5 }];
      if (sql.includes('AICredentialBinding')) return [{ BindingCount: 0 }];
      return [];
    });
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('YELLOW');
  });

  it('reports GREEN when two or more active providers are configured', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-test-12345678';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-12345678';
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string) => {
      if (sql.includes('AIModelVendor')) return [{ ActiveRouteCount: 5 }];
      if (sql.includes('AICredentialBinding')) return [{ BindingCount: 0 }];
      return [];
    });
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('GREEN');
    expect(evaluation.ObservedMetrics.ReadyInferenceProviderCount).toBe(2);
    expect(evaluation.ActivePlaybook).toBeUndefined();
  });

  it('reports RED with a diagnostic when the query throws', async () => {
    const provider = new DatabaseProviderStub();
    vi.spyOn(provider, 'ExecuteSQL').mockRejectedValue(new Error('permission denied'));
    const probe = new AiProviderReadinessProbe();

    const [evaluation] = await probe.Evaluate(makeContext(provider));

    expect(evaluation.Status).toBe('RED');
    expect(evaluation.DiagnosticError).toContain('permission denied');
  });

  it('declares exactly one signal owned by MJ Core, in passive mode', () => {
    const probe = new AiProviderReadinessProbe();
    expect(probe.OwnerApp).toBe('__mj');
    expect(probe.Mode).toBe('passive');
    expect(probe.SignalDefinitions).toHaveLength(1);
  });
});
