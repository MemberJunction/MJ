/** The monitoring job spec the driver and operation tests run under (binary log loss, monthly, one degradation trigger). */
import { EvaluationProtocol, type MonitoringJobSpec } from '@memberjunction/predictive-studio-core';

import { CURRENT } from './monitoring-world';

const nn = EvaluationProtocol.ToNonNegative;
export const SPEC: MonitoringJobSpec = {
  modelId: CURRENT, evaluationProtocolId: 'protocol-v1',
  schedule: { cronExpression: '0 3 1 * *', timezone: 'UTC' },
  outcomeJoin: { predictionUnitId: 'U1', runWhen: 'label-window-closed', joinOn: 'entity-and-as-of-date', excludeInTrainingRows: true },
  performance: { primaryScore: { family: 'binary', metric: 'log-loss' }, period: 'month', interval: { level: 0.95, method: 'bootstrap', resamples: 200, pairedTest: 'paired-bootstrap' }, calibration: true, minScoredRowsPerPeriod: 10 },
  drift: {
    features: 'all-model-features', statistic: 'z-mean', fdr: { method: 'benjamini-hochberg', q: 0.0171 },
    nullCalibration: { kind: 'empirical-replay', looks: 3, inputs: 1, replays: 4_000_000, q: 0.0171 }, documentedFalseAlarmRate: 0.05, action: 'alert',
  },
  challenger: {
    comparison: 'same-row-ids', score: { family: 'binary', metric: 'log-loss' }, onPass: 'publish-through-gate',
    rule: {
      comparators: [], incumbent: 'current-published', margin: nn(0.01), lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15',
      requiresHumanSignOff: false, signOffExpiryDays: 30, autoPublishKeepBaseline: false, rollbackOn: null,
    },
  },
  retrainTriggers: [{ kind: 'outcome-degradation', margin: nn(0.02), consecutivePeriods: 1 }],
  rollback: null,
  parity: { sampleRows: 100, tolerance: 1e-9 },
};
