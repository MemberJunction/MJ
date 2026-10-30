/**
 * Gate G0.4 "W1 → S9.4": on the W1-signal s42 scoring (NA, 2024), every row whose top per-record driver is Auto Renew
 * shows the direction its own Auto Renew value pushes the risk: "Lowers Risk" for an auto-renewing member, "Raises
 * Risk" for one who is not (717 rows, all of them, with both kinds of member present so neither direction passes
 * vacuously). Drivers are measured from the mean training row, so a member without
 * auto-renew is driven up by the absence of what lowers the average member's risk. The drawer's badge reads
 * `RowDriver.Up`, which is `AtRiskRules.DriverRaisesRisk`; `Up === false` is the green "Lowers Risk" badge
 * (PSRowDriversComponent's own DOM test pins that copy).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe, HarnessDatasets } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The NA 2024 rows of the seeded W1-signal s42 scoring whose top per-record driver is Auto Renew. */
const AUTO_RENEW_TOP_DRIVER_ROWS = 717;

export const PsGateW1S94Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-4.G0.4', Name: 'G0.4 W1 → S9.4: every Auto Renew top-driver row shows the direction its Auto Renew value pushes the risk', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Details: details, Model: model, Dataset: dataset } = await PsGateSpecs.W1RecordProcess(h);
      const rows = ContainmentProbe.TopDriverRows(details, 'Auto Renew', model);
      const autoRenew = HarnessDatasets.ColumnByRowID(dataset, 'AutoRenew');
      const on = rows.filter((r) => autoRenew.Get(r.RecordID) === '1');
      const off = rows.filter((r) => autoRenew.Get(r.RecordID) === '0');
      const onLowers = on.filter((r) => !r.RaisesRisk).length;
      const offRaises = off.filter((r) => r.RaisesRisk).length;
      const following = onLowers + offRaises;
      PsGate.Assert({
        // Both kinds of member must be among the rows, or one of the two directions would pass with nothing to check.
        Passed: rows.length === AUTO_RENEW_TOP_DRIVER_ROWS && on.length > 0 && off.length > 0 && following === rows.length,
        Measured: { autoRenewTopDriverRows: rows.length, autoRenewOn: on.length, onLowersRisk: onLowers, autoRenewOff: off.length, offRaisesRisk: offRaises },
        Detail: `${following} of ${rows.length} Auto Renew top-driver rows show their own Auto Renew direction (${onLowers} of ${on.length} auto-renewing rows "Lowers Risk", ${offRaises} of ${off.length} others "Raises Risk"); ${AUTO_RENEW_TOP_DRIVER_ROWS} expected, with at least one row of each Auto Renew value`,
      });
    },
  },
];

for (const c of PsGateW1S94Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-4', PsGate.Lifecycle);
