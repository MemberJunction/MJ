/**
 * Gate G6.8 "D2 → S8.3" (statistical): `EngagementZ` (whose mean moves +0.1 SD from period 3) is flagged within 1 period
 * of the shift in at least 372 of 400 D2 seeds, and the mean false-discovery proportion over the 3 looks is at most
 * 0.05: periods 0–2 are the reference, periods 3–5 the looks, BH across the three inputs at q(3) = 0.0171.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { SeedRule } from '@memberjunction/predictive-studio-truth-suite';
import type { MonitorDriftInput } from '@memberjunction/predictive-studio-core';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { MonitoringFixture } from './ps-gates/ps-gate-monitoring';

const INPUTS: readonly { readonly Name: string; readonly Kind: MonitorDriftInput['kind'] }[] = [
  { Name: 'EngagementZ', Kind: 'mean' }, { Name: 'TenureZ', Kind: 'mean' }, { Name: 'AutoRenew', Kind: 'proportion' },
];

export const PsGateD2S83Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-d2-s8-3.G6.8', Name: 'G6.8 D2 → S8.3: EngagementZ flagged within 1 period of the shift in ≥ 372 of 400 seeds; mean FDP ≤ 0.05', RequiresMutation: true,
    Fn: async () => {
      const seeds = MonitoringFixture.Seeds('D2');
      let detected = 0;
      let fdpSum = 0;
      for (const seed of seeds) {
        const rows = await MonitoringFixture.SeedRows('D2', seed);
        const years = (rows.get('T') || []).map((t) => Number(t.slice(0, 4)));
        const column = (name: string, from: number, to: number): number[] => (rows.get(name) || []).map(Number).filter((_, i) => years[i] >= from && years[i] <= to);
        let early = false;
        for (let look = 1; look <= 3; look++) {
          const year = 2021 + look;
          const inputs: MonitorDriftInput[] = INPUTS.map((i) => ({ name: i.Name, kind: i.Kind, reference: column(i.Name, 2019, 2021), current: column(i.Name, year, year) }));
          const flagged = await MonitoringFixture.Look(inputs, look, MonitoringFixture.Q3, seed * 10 + look);
          if (look <= 2 && flagged.includes('EngagementZ')) early = true;
          fdpSum += flagged.length === 0 ? 0 : flagged.filter((f) => f !== 'EngagementZ').length / flagged.length;
        }
        if (early) detected++;
      }
      const meanFdp = fdpSum / (3 * seeds.length);
      PsGate.Assert({
        Passed: seeds.length === 400 && SeedRule.Passes('detection-400', detected, seeds.length) && meanFdp <= 0.05,
        Measured: { seeds: seeds.length, detected, meanFdp, q: MonitoringFixture.Q3 },
        Detail: `EngagementZ flagged within 1 period of the shift in ${detected} of ${seeds.length} seeds (at least 372); mean FDP ${meanFdp.toFixed(4)} (at most 0.05)`,
      });
    },
  },
];

for (const c of PsGateD2S83Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-d2-s8-3', PsGate.Lifecycle);
