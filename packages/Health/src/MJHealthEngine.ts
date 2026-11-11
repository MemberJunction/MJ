import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseHealthProbe } from './BaseHealthProbe';
import { BaseLiveCrudVerifier } from './LiveCrudVerifier';
import type { HealthEvaluateOptions, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, InstanceHealthReport } from './types';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MODE = 'passive';

/**
 * Singleton that discovers every registered `BaseHealthProbe` subclass via the MJGlobal
 * ClassFactory, runs them against a deterministic timeout budget, and rolls their signal
 * evaluations up into a single `InstanceHealthReport`.
 *
 * Probes register themselves with `@RegisterClass(BaseHealthProbe, '<ProbeKey>')` — the engine
 * never needs to know about a specific probe class, so MJ Core and every installed Open App can
 * ship probes independently with zero coordination.
 */
export class MJHealthEngine extends BaseSingleton<MJHealthEngine> {
  protected constructor() {
    super();
  }

  public static get Instance(): MJHealthEngine {
    return super.getInstance<MJHealthEngine>();
  }

  /**
   * All probes currently registered with the ClassFactory, regardless of mode or owning app.
   */
  public GetRegisteredProbes(): BaseHealthProbe[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseHealthProbe).map((reg) => new (reg.SubClass as new () => BaseHealthProbe)());
  }

  /**
   * Every `BaseLiveCrudVerifier` currently registered with the ClassFactory, regardless of owning
   * app. Exposed at the engine level (mirroring {@link GetRegisteredProbes}) so a fleet dashboard
   * or CLI can enumerate the full live-verification surface — built-in probes plus every
   * Open App-supplied synthetic CRUD/permission verifier — without reaching into
   * `LiveEntityCrudProbe` directly.
   */
  public GetRegisteredLiveCrudVerifiers(): BaseLiveCrudVerifier[] {
    return MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseLiveCrudVerifier).map(
      (reg) => new (reg.SubClass as new () => BaseLiveCrudVerifier)(),
    );
  }

  /**
   * Every signal declared across all registered probes, regardless of whether they have ever
   * been evaluated. Useful for building a static catalog (e.g. for an MJC fleet dashboard) that
   * knows about every possible signal and its playbooks before any runtime evaluation occurs.
   */
  public GetSignalCatalog(): readonly HealthSignalDefinition[] {
    return this.GetRegisteredProbes().flatMap((probe) => probe.SignalDefinitions);
  }

  /**
   * Evaluates every registered probe matching the requested `Mode` (and optional `AppFilter`),
   * and rolls the resulting signal evaluations up into an `InstanceHealthReport`.
   */
  public async Evaluate(options: HealthEvaluateOptions): Promise<InstanceHealthReport> {
    const mode = options.Mode ?? DEFAULT_MODE;
    const timeoutMs = options.TimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    const probes = this.GetRegisteredProbes().filter((probe) => probe.Mode === mode && (!options.AppFilter || probe.OwnerApp === options.AppFilter));

    const context: HealthProbeContext = {
      DatabaseProvider: options.DatabaseProvider,
      MetadataProvider: options.MetadataProvider,
      SystemUser: options.SystemUser,
      Mode: mode,
      AppFilter: options.AppFilter,
      TimeoutMs: timeoutMs,
    };

    const perProbeResults = await Promise.all(probes.map((probe) => this.evaluateProbeSafely(probe, context)));
    const signals = perProbeResults.flat();

    return this.buildReport(signals, {
      mode,
      durationMs: Date.now() - startedAt,
      mjVersion: options.MJVersion ?? 'unknown',
      databasePlatform: options.DatabasePlatform ?? 'sqlserver',
    });
  }

  /**
   * Runs a single probe under the shared timeout budget, converting any thrown error or timeout
   * into a `RED` evaluation for every signal the probe declares — so one misbehaving probe can
   * never block or poison the evaluation of its siblings.
   */
  private async evaluateProbeSafely(probe: BaseHealthProbe, context: HealthProbeContext): Promise<HealthSignalEvaluation[]> {
    const probeStartedAt = Date.now();
    try {
      return await this.runWithTimeout(probe.Evaluate(context), context.TimeoutMs, probe.ProbeKey);
    } catch (error) {
      LogError(`MJHealthEngine: probe '${probe.ProbeKey}' failed: ${error instanceof Error ? error.message : String(error)}`);
      return probe.SignalDefinitions.map((definition) => this.buildFailureEvaluation(definition, error, probeStartedAt));
    }
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, probeKey: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Probe '${probeKey}' timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildFailureEvaluation(definition: HealthSignalDefinition, error: unknown, startedAt: number): HealthSignalEvaluation {
    return {
      Code: definition.Code,
      Title: definition.Title,
      Layer: definition.Layer,
      OwnerApp: definition.OwnerApp,
      Mode: definition.Mode,
      Status: 'RED',
      Summary: `Probe threw an unhandled exception: ${error instanceof Error ? error.message : String(error)}`,
      ObservedMetrics: {},
      EvaluatedAt: new Date().toISOString(),
      DurationMs: Date.now() - startedAt,
      ActivePlaybook: definition.RedPlaybook,
      DiagnosticError: error instanceof Error ? (error.stack ?? error.message) : String(error),
    };
  }

  private buildReport(
    signals: HealthSignalEvaluation[],
    meta: { mode: 'passive' | 'live-test'; durationMs: number; mjVersion: string; databasePlatform: 'sqlserver' | 'postgresql' },
  ): InstanceHealthReport {
    const summaryCounts = { Green: 0, Yellow: 0, Red: 0 };
    for (const signal of signals) {
      if (signal.Status === 'GREEN') summaryCounts.Green++;
      else if (signal.Status === 'YELLOW') summaryCounts.Yellow++;
      else summaryCounts.Red++;
    }

    return {
      OverallStatus: this.rollUpStatus(summaryCounts),
      MJVersion: meta.mjVersion,
      DatabasePlatform: meta.databasePlatform,
      EvaluatedAt: new Date().toISOString(),
      TotalDurationMs: meta.durationMs,
      Mode: meta.mode,
      SummaryCounts: summaryCounts,
      Signals: signals,
    };
  }

  private rollUpStatus(counts: { Green: number; Yellow: number; Red: number }): HealthStatus {
    if (counts.Red > 0) return 'RED';
    if (counts.Yellow > 0) return 'YELLOW';
    return 'GREEN';
  }
}
