/**
 * Fixture for the Predictive Studio containment gate bundles. The gates drive Predictive Studio through MJAPI as the
 * browser does (client transport), on datasets the truth suite generates and loads into the private `pstruth` schema.
 * The harness lives in @memberjunction/predictive-studio-truth-suite; this file adapts it to the check contract.
 */
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, type BundleLifecycle, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { HarnessSidecar, RunFixtures, type GateMeasurement, type TruthHarness } from '@memberjunction/predictive-studio-truth-suite';

/** The adapter every PS gate bundle uses. */
export class PsGate {
  /**
   * The run harness bound to the check's client provider. Before anything else, the sidecar URL defaults to the truth
   * sidecar's: the process builds one sidecar client, on the first in-process engine call of any gate, so the default
   * must be in place before the first gate runs, whatever the suite order.
   */
  public static async Harness(ctx: IntegrationCheckContext): Promise<TruthHarness> {
    HarnessSidecar.DefaultToSuiteSidecar();
    if (!(ctx.Provider instanceof GraphQLDataProvider)) {
      throw new Error('Predictive Studio gates run on the client transport (Configuration.transport = "client").');
    }
    return RunFixtures.HarnessFor(ctx.Provider, ctx.User);
  }

  /** Log the measurement and fail the check when it did not pass. */
  public static Assert(m: GateMeasurement): void {
    console.log(`      → ${m.Detail}  ${JSON.stringify(m.Measured)}`);
    Assert(m.Passed, m.Detail);
  }

  /**
   * Bundle lifecycle: nothing to create up front (datasets load lazily per gate, and a load is skipped when the table's
   * stamp already names its rows); teardown removes the run's "PSTruth:" pipelines and models. Teardown never throws
   * (the lifecycle contract): a row it could not delete is logged.
   */
  public static readonly Lifecycle: BundleLifecycle = {
    Setup: async () => { /* nothing to create up front */ },
    Teardown: async (ctx) => {
      try {
        await RunFixtures.CleanupRun(ctx.User);
      } catch (e) {
        console.warn(`      ⚠ Predictive Studio gate teardown: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}
