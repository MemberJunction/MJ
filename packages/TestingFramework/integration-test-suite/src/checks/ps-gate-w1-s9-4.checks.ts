/**
 * Gate G0.4 "W1 → S9.4": every W1-signal s42 row whose top per-record driver is Auto Renew renders "Lowers Risk" (488
 * of 488). The drawer's badge reads `RowDriver.Up`, which is `AtRiskRules.DriverRaisesRisk`; `Up === false` is the
 * green "Lowers Risk" badge (PSRowDriversComponent's own DOM test pins that copy), so the gate asserts the rule is false
 * for every such row of the record-process scoring.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The NA 2024 rows of the seeded W1-signal s42 scoring whose top per-record driver is Auto Renew. */
const AUTO_RENEW_TOP_DRIVER_ROWS = 488;

export const PsGateW1S94Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-4.G0.4', Name: 'G0.4 W1 → S9.4: every Auto Renew top-driver row lowers the displayed risk', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Details: details, Model: model } = await PsGateSpecs.W1RecordProcess(h);
      const raises = ContainmentProbe.TopDriverRaisesRisk(details, 'Auto Renew', model);
      const lowers = raises.filter((r) => r === false).length;
      PsGate.Assert({
        Passed: raises.length === AUTO_RENEW_TOP_DRIVER_ROWS && lowers === raises.length,
        Measured: { autoRenewTopDriverRows: raises.length, lowersRisk: lowers, raisesRisk: raises.length - lowers },
        Detail: `${lowers} of ${raises.length} AutoRenew top-driver rows lower the displayed risk ("Lowers Risk"); ${AUTO_RENEW_TOP_DRIVER_ROWS} expected`,
      });
    },
  },
];

for (const c of PsGateW1S94Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-4', PsGate.Lifecycle);
