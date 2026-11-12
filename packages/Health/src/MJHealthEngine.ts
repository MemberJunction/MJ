import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseHealthProbe } from './BaseHealthProbe';
import { BaseLiveCrudVerifier } from './LiveCrudVerifier';
import { LIVE_ENTITY_CRUD_SIGNAL_CODE } from './probes/LiveEntityCrudProbe';
import type { HealthEvaluateOptions, HealthProbeContext, HealthSignalDefinition, HealthSignalEvaluation, HealthStatus, InstanceHealthReport, ProbeExecutionMode } from './types';

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
   * Semantic health check runner supporting 'startup', 'readiness', 'live-test', and 'passive' checks.
   * Dispatches to `Evaluate()` with the matching `Mode`, timeout budgets, and options.
   */
  public async RunCheck(
    checkType: 'startup' | 'readiness' | 'live-test' | 'passive' = 'passive',
    options?: Partial<HealthEvaluateOptions>,
  ): Promise<InstanceHealthReport> {
    const mode: ProbeExecutionMode = checkType === 'live-test' ? 'live-test' : 'passive';
    const timeoutMs = options?.TimeoutMs ?? (checkType === 'startup' ? 5_000 : undefined);

    const mergedOptions: HealthEvaluateOptions = {
      DatabaseProvider: options?.DatabaseProvider!,
      MetadataProvider: options?.MetadataProvider!,
      SystemUser: options?.SystemUser!,
      Mode: mode,
      AppFilter: options?.AppFilter,
      TimeoutMs: timeoutMs,
      MJVersion: options?.MJVersion,
      DatabasePlatform: options?.DatabasePlatform,
      LiveCrudVerifier: options?.LiveCrudVerifier,
    };

    return this.Evaluate(mergedOptions);
  }

  /**
   * Evaluates every registered probe matching the requested `Mode` (and optional `AppFilter`),
   * and rolls the resulting signal evaluations up into an `InstanceHealthReport`.
   */
  public async Evaluate(options: HealthEvaluateOptions): Promise<InstanceHealthReport> {
    const mode = options.Mode ?? DEFAULT_MODE;
    const timeoutMs = options.TimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();

    const suppliedVerifiers = options.LiveCrudVerifier
      ? Array.isArray(options.LiveCrudVerifier)
        ? options.LiveCrudVerifier
        : [options.LiveCrudVerifier]
      : [];
    const allVerifiers = [...this.GetRegisteredLiveCrudVerifiers(), ...suppliedVerifiers];
    const hasMatchingVerifier = options.AppFilter
      ? allVerifiers.some((v) => v.OwnerApp === options.AppFilter)
      : false;

    const probes = this.GetRegisteredProbes().filter((probe) => {
      if (probe.Mode !== mode) return false;
      if (!options.AppFilter) return true;
      if (probe.OwnerApp === options.AppFilter) return true;
      if (probe.ProbeKey === LIVE_ENTITY_CRUD_SIGNAL_CODE && hasMatchingVerifier) return true;
      return false;
    });

    const context: HealthProbeContext = {
      DatabaseProvider: options.DatabaseProvider,
      MetadataProvider: options.MetadataProvider,
      SystemUser: options.SystemUser,
      Mode: mode,
      AppFilter: options.AppFilter,
      TimeoutMs: timeoutMs,
      LiveCrudVerifier: options.LiveCrudVerifier,
    };

    const perProbeResults: HealthSignalEvaluation[][] = [];
    if (mode === 'live-test') {
      // In live-test mode, execute probes sequentially to eliminate transaction savepoint
      // interleaving on the shared DatabaseProvider instance.
      for (const probe of probes) {
        perProbeResults.push(await this.evaluateProbeSafely(probe, context));
      }
    } else {
      perProbeResults.push(...await Promise.all(probes.map((probe) => this.evaluateProbeSafely(probe, context))));
    }
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      LogError(`MJHealthEngine: probe '${probe.ProbeKey}' failed: ${error.message}`);
      const definitions = [...probe.SignalDefinitions];
      if (probe.ProbeKey === LIVE_ENTITY_CRUD_SIGNAL_CODE && context.LiveCrudVerifier) {
        const supplied = Array.isArray(context.LiveCrudVerifier) ? context.LiveCrudVerifier : [context.LiveCrudVerifier];
        for (const v of supplied) {
          if (!definitions.some((d) => d.Code === v.VerifierKey || d.Code.endsWith(`.${v.VerifierKey}`))) {
            definitions.push({
              Code: `${v.OwnerApp.toUpperCase()}.${v.VerifierKey}`,
              Title: v.Title,
              Layer: 'live-test',
              OwnerApp: v.OwnerApp,
              Mode: 'live-test',
              Description: `Open App live verifier ${v.VerifierKey}`,
              YellowPlaybook: v.YellowPlaybook,
              RedPlaybook: v.RedPlaybook,
            });
          }
        }
      }
      return definitions.map((definition) => this.buildFailureEvaluation(definition, error, probeStartedAt));
    }
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, probeKey: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Probe '${probeKey}' timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private buildFailureEvaluation(definition: HealthSignalDefinition, error: Error, startedAt: number): HealthSignalEvaluation {
    return {
      Code: definition.Code,
      Title: definition.Title,
      Layer: definition.Layer,
      OwnerApp: definition.OwnerApp,
      Mode: definition.Mode,
      Status: 'RED',
      Summary: `Probe threw an unhandled exception: ${error.message}`,
      ObservedMetrics: {},
      EvaluatedAt: new Date().toISOString(),
      DurationMs: Date.now() - startedAt,
      ActivePlaybook: definition.RedPlaybook,
      DiagnosticError: error.stack ?? error.message,
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
