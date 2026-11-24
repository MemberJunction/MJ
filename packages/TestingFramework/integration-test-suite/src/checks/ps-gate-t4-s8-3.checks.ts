/**
 * Gate G6.6 "T4 → S8.3" (statistical): at most 28 of 400 T4 no-drift replays (the `n400` seeds) raise any drift alarm
 * at q(12) = 0.0095 over 12 monthly looks: each seed's series, its first 228 months the reference, through procedure M
 * on the suite sidecar (`/monitor/drift`, a `series` input). `SeedRule.Passes('false-alarm-400', …)`.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { SeedRule } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture } from './ps-gates/ps-gate-monitoring';

const REFERENCE_MONTHS = 228;
const LOOKS = 12;

export const PsGateT4S83Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-t4-s8-3.G6.6', Name: 'G6.6 T4 → S8.3: at most 28 of 400 no-drift replays raise any alarm at q(12) over 12 looks', RequiresMutation: true,
    Fn: async () => {
      const seeds = MonitoringFixture.Seeds('T4');
      let alarming = 0;
      for (const seed of seeds) {
        const series = ((await MonitoringFixture.SeedRows('T4', seed)).get('Target') || []).map(Number);
        const reference = series.slice(0, REFERENCE_MONTHS);
        let alarm = false;
        for (let look = 1; look <= LOOKS && !alarm; look++) {
          const flagged = await MonitoringFixture.Look([{ name: 'Target', kind: 'series', reference, current: [series[REFERENCE_MONTHS + look - 1]] }], look, MonitoringFixture.Q12(), seed * 100 + look);
          alarm = flagged.length > 0;
        }
        if (alarm) alarming++;
      }
      PsGate.Assert({
        Passed: seeds.length === 400 && SeedRule.Passes('false-alarm-400', alarming, seeds.length),
        Measured: { replays: seeds.length, alarming, q: MonitoringFixture.Q12() },
        Detail: `${alarming} of ${seeds.length} no-drift replays raised an alarm over ${LOOKS} looks at q(12) (at most 28)`,
      });
    },
  },
];

for (const c of PsGateT4S83Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-t4-s8-3', PsGate.Lifecycle);
