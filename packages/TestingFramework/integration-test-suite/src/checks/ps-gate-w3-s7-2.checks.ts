/**
 * Gate G3.3 "W3 → S7.2" (owner PR 4, phase 3): on W3-leak-row s42, a `Status = 'Published'` write to a trained model
 * from each of the five paths outside the lifecycle gate (UI, GraphQL, engine call, agent tool, maintenance) is
 * refused `status-changed-outside-gate`, 5 of 5; the model keeps the status it had and no `MJ: Record Changes` row
 * changes its Status without a gate publish record (`StatusWritePaths`). The UI save runs with this process's copy of the
 * status guard removed (a browser has none), so its refusal is MJAPI's: `ui:refused(server)` (D4-106).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { RunFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { StatusWritePaths, type StatusWriteAttempt } from './ps-gates/ps-gate-status-writes';

/** The refusal reason the status guard names for a Status write the gate did not authorise. */
const OUTSIDE_GATE = 'status-changed-outside-gate';

/** How G3.3 judges and words one attempt. */
class PsGateW3S72Steps {
  /**
   * Refused by the status guard for being outside the gate (not some other failure); for `ui`, also with the client's
   * copy of the guard removed, so the refusal came from MJAPI.
   */
  public static Refused(a: StatusWriteAttempt): boolean {
    const byServer = a.Path !== 'ui' || a.ClientGuardRegistered === false;
    return !a.Saved && byServer && a.Message.includes(OUTSIDE_GATE);
  }

  /** `path:refused` (`ui:refused(server)`), `path:saved`, or `path:failed(<message>)` for a failure that is not the guard's refusal. */
  public static Outcome(a: StatusWriteAttempt): string {
    if (PsGateW3S72Steps.Refused(a)) return a.Path === 'ui' ? 'ui:refused(server)' : `${a.Path}:refused`;
    return a.Saved ? `${a.Path}:saved` : `${a.Path}:failed(${a.Message.slice(0, 160)})`;
  }
}

export const PsGateW3S72Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w3-s7-2.G3.3', Name: 'G3.3 W3 → S7.2: a Status write to Published from each of five paths outside the gate is refused, 5 of 5', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const w3 = await h.EnsureLoaded({ Kind: 'world', ID: 'W3-leak-row', Seed: 42 });
      const model = await RunFixtures.TrainedModel(h, 'G3.3', w3);
      const before = await h.ReadModel(model);
      const attempts = await StatusWritePaths.All(h, model, 'Published');     // five writers, one result each
      const refused = attempts.filter((a) => PsGateW3S72Steps.Refused(a)).length;
      const after = await h.ReadModel(model);
      const gateChanges = await StatusWritePaths.StatusChangesWithoutGate(h, model);   // Record Changes of Status with no gate authorisation
      PsGate.Assert({
        Passed: attempts.length === 5 && refused === 5 && after.Status !== 'Published' && after.Status === before.Status && gateChanges === 0,
        Measured: {
          paths: attempts.length, refused, statusBefore: before.Status, status: after.Status, statusChangesOutsideGate: gateChanges,
          outcomes: attempts.map((a) => PsGateW3S72Steps.Outcome(a)).join(' | '),
        },
        Detail: `${refused} of 5 out-of-gate Status writes refused ${OUTSIDE_GATE}; model ${before.Status} before, ${after.Status} after; `
          + `${gateChanges} Status change(s) recorded without a gate publish record`,
      });
    },
  },
];

for (const c of PsGateW3S72Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w3-s7-2', PsGate.Lifecycle);
