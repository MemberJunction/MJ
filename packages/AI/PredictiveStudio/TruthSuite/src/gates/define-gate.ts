import { it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { IsTierEnabled } from '@memberjunction/testing-integration';
import { GateRegistry } from '../registry/load';
import type { GateEntry, RunMode } from '../registry/types';
import { GateResults, type GateMeasurement } from './results';
import type { TruthHarness } from '../harness/types';
import { RunFixtures } from '../harness/run-fixtures';

/** Which gates a run executes: the run mode and the host requirements. */
export class GateSelection {
  private static readonly modeRank: Readonly<Record<RunMode, number>> = { pr: 0, nightly: 1, weekly: 2 };

  /** `TRUTH_RUN_MODE`; anything other than the three lanes is refused (a typo would silently run nothing). */
  public static CurrentRunMode(env: NodeJS.ProcessEnv = process.env): RunMode {
    const mode = env.TRUTH_RUN_MODE;
    if (mode === 'pr' || mode === 'nightly' || mode === 'weekly') return mode;
    throw new Error(`TRUTH_RUN_MODE must be pr | nightly | weekly (got ${mode || 'unset'})`);
  }

  /** A gate runs in its own lane and every larger one (pr ⊂ nightly ⊂ weekly). */
  public static IsSelected(gate: Pick<GateEntry, 'RunMode'>, mode: RunMode): boolean {
    return GateSelection.modeRank[gate.RunMode] <= GateSelection.modeRank[mode];
  }

  /** The first requirement this host lacks, as the `not-run` reason; null when the gate can run here. */
  public static MissingRequirement(gate: Pick<GateEntry, 'Requires'>, env: NodeJS.ProcessEnv): string | null {
    if (gate.Requires.includes('live-model') && !IsTierEnabled('live-model', env)) {
      return 'requires live-model: RUN_AGENT_TESTS is set to 0 (enable live-model tier with model keys configured)';
    }
    if (gate.Requires.includes('live-model') && !env.AI_VENDOR_API_KEY__GeminiLLM) {
      return 'requires live-model: AI_VENDOR_API_KEY__GeminiLLM is not set (the story generator runs on GeminiLLM, D2-33)';
    }
    if (gate.Requires.includes('sidecar-16gb') && env.TRUTH_ALLOW_HIGH_MEMORY !== '1') {
      return 'requires sidecar-16gb: W8 training needs more memory than the runner has (set TRUTH_ALLOW_HIGH_MEMORY=1 on a larger host)';
    }
    if (gate.Requires.includes('bizapps-common') && env.TRUTH_BIZAPPS_COMMON !== '1') {
      return 'requires bizapps-common: install bizapps-common with its Feature Pipeline changes and set TRUTH_BIZAPPS_COMMON=1';
    }
    return null;
  }
}

/** Gate declaration: the one way a gate body is registered (the registry validator counts its literal titles). */
export class TruthGate {
  /**
   * Register one gate as a vitest test. The body measures; it throws only when it cannot measure. Gate files call it
   * with a literal title — `TruthGate.Define('<TestName>', …)` — which is how the registry finds the gate.
   */
  public static Define(testName: string, body: (h: TruthHarness) => Promise<GateMeasurement>): void {
    const gate = GateRegistry.Find(GateRegistry.Load(), testName);
    it(testName, async () => {
      const started = performance.now();
      const skip = TruthGate.skipReason(gate);
      if (skip !== null) {
        GateResults.Write(gate, 'not-run', { Measurement: null, Error: null, DurationMs: 0, Note: skip });
        return;
      }
      let measurement: GateMeasurement | null = null;
      let error: string | null = null;
      try {
        measurement = await body(await RunFixtures.GetRunHarness());
      } catch (e) {
        error = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
      }
      const outcome = GateResults.DecideOutcome(gate.Status, measurement, error);
      GateResults.Write(gate, outcome, { Measurement: measurement, Error: error, DurationMs: performance.now() - started });
      if (outcome === 'fail' || outcome === 'error') {
        throw new Error(`${testName}: ${outcome} — ${error || measurement?.Detail || ''}`);
      }
    });
  }

  /** Why this run does not execute the gate (its lane, or a requirement the host lacks); null when it runs. */
  private static skipReason(gate: GateEntry): string | null {
    const mode = GateSelection.CurrentRunMode();
    return GateSelection.IsSelected(gate, mode)
      ? GateSelection.MissingRequirement(gate, process.env)
      : `runMode ${gate.RunMode} is not part of a ${mode} run`;
  }
}
