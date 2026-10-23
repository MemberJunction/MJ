/**
 * Gate G0.5 "W1 → S9.5": the At-Risk list ("Send to a list", 1 to 200 members) built from the W1-signal s42 scores has a
 * mean true renewal probability below the population mean.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ContainmentProbe } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The arithmetic mean (NaN for an empty list, which the gate's size check already fails). */
class TruePMean {
  public static Of(xs: number[]): number {
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  }
}

export const PsGateW1S95Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-5.G0.5', Name: 'G0.5 W1 → S9.5: the At-Risk list has a mean true renewal probability below the population', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Details: details, Model: model, TruthCsv: truthCsv } = await PsGateSpecs.W1RecordProcess(h);
      const truth = PsGateSpecs.ReadTrueP(truthCsv);
      const all = details.map((d) => truth.Get(d.RecordID)).filter((v): v is number => v !== undefined);
      const members = ContainmentProbe.AtRiskListRecordIDs(details, model);
      const list = members.map((id) => truth.Get(id)).filter((v): v is number => v !== undefined);
      PsGate.Assert({
        Passed: list.length > 0 && members.length <= 200 && TruePMean.Of(list) < TruePMean.Of(all),
        Measured: { listSize: members.length, listWithTruth: list.length, listMeanTrueP: TruePMean.Of(list), populationMeanTrueP: TruePMean.Of(all) },
        Detail: `At-Risk list of ${members.length} has mean TrueP ${TruePMean.Of(list).toFixed(4)} vs population ${TruePMean.Of(all).toFixed(4)}`,
      });
    },
  },
];

for (const c of PsGateW1S95Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-5', PsGate.Lifecycle);
