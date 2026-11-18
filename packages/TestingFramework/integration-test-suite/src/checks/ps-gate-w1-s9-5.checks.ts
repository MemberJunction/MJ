/**
 * Gate G0.5 "W1 → S9.5": the At-Risk list ("Send to a list") built from the W1-signal s42 scores holds every record at
 * or above the list's risk floor (40%), at most 200 of them, and its mean true renewal probability is at least 0.15
 * below the population mean (the measured gap is about 0.29; a list picked by a score with no signal has an expected
 * gap of 0, so the margin keeps an unranked list red).
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { AtRiskRules, AT_RISK_LIST_MIN_RISK_PCT } from '@memberjunction/predictive-studio-core';
import { ContainmentProbe } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateSpecs } from './ps-gates/ps-gate-specs';

/** The At-Risk list size "Send to a list" caps at. */
const AT_RISK_LIST_SIZE = 200;

/** How far below the population mean TrueP the list's mean TrueP must be. */
const MIN_TRUE_P_GAP = 0.15;

/** The arithmetic mean (NaN for an empty list, which the gate's size check already fails). */
class TruePMean {
  public static Of(xs: number[]): number {
    return xs.reduce((s, x) => s + x, 0) / xs.length;
  }
}

export const PsGateW1S95Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-w1-s9-5.G0.5', Name: 'G0.5 W1 → S9.5: the At-Risk list (every record at or above the risk floor, at most 200) has a mean true renewal probability at least 0.15 below the population', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const { Details: details, Model: model, TruthCsv: truthCsv } = await PsGateSpecs.W1RecordProcess(h);
      const truth = PsGateSpecs.ReadTrueP(truthCsv);
      const all = details.map((d) => truth.Get(d.RecordID)).filter((v): v is number => v !== undefined);
      const members = ContainmentProbe.AtRiskListRecordIDs(details, model);
      // The list is every row at or above the risk floor, capped at 200: its size is fixed by the scores, not by the cap.
      const qualifying = AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(model)).filter((r) => r.RiskPct >= AT_RISK_LIST_MIN_RISK_PCT).length;
      const expectedSize = Math.min(AT_RISK_LIST_SIZE, qualifying);
      const list = members.map((id) => truth.Get(id)).filter((v): v is number => v !== undefined);
      const listMean = TruePMean.Of(list);
      const populationMean = TruePMean.Of(all);
      PsGate.Assert({
        Passed: members.length > 0 && members.length === expectedSize && list.length === members.length && listMean <= populationMean - MIN_TRUE_P_GAP,
        Measured: { listSize: members.length, expectedSize, qualifying, listWithTruth: list.length, listMeanTrueP: listMean, populationMeanTrueP: populationMean, minGap: MIN_TRUE_P_GAP },
        Detail: `At-Risk list of ${members.length} (expected ${expectedSize}: ${qualifying} at or above ${AT_RISK_LIST_MIN_RISK_PCT}% risk, cap ${AT_RISK_LIST_SIZE}) has mean TrueP ${listMean.toFixed(4)} vs population ${populationMean.toFixed(4)} (needs a gap of at least ${MIN_TRUE_P_GAP})`,
      });
    },
  },
];

for (const c of PsGateW1S95Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-w1-s9-5', PsGate.Lifecycle);
