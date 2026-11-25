/**
 * `MonitoringResultSchemas` (M6.3): the period row's stored JSON columns read back, and the sidecar's `/monitor/drift`
 * answer checked before it is stored (M6-3). Each reader names a malformed value; none casts.
 */
import { describe, it, expect } from 'vitest';
import { RETRAIN_TRIGGER_KINDS } from '../evaluation-protocol';
import { MONITORING_CHALLENGER_OUTCOMES, MONITORING_ROLLBACK_CHECK_KINDS } from '../monitoring-contracts';
import { MonitoringResultSchemas } from '../monitoring-result-schemas';

const PRIMARY = { metric: 'log-loss', value: 0.41, interval: { level: 0.95, lower: 0.38, upper: 0.44 }, n: 200 };
const LOOK = { input: 'EngagementZ', kind: 'mean', z: 5.2, p: 0.0005, pAdjusted: 0.0005, q: 0.0171, look: 1, flagged: true };

describe('MonitoringResultSchemas stored columns', () => {
  it('reads a stored PrimaryScore and names a malformed one', () => {
    expect(MonitoringResultSchemas.ParsePrimaryScore(JSON.stringify(PRIMARY))).toEqual({ Ok: true, Value: PRIMARY });
    const bad = MonitoringResultSchemas.ParsePrimaryScore(JSON.stringify({ ...PRIMARY, value: 'high' }));
    expect(bad.Ok).toBe(false);
    if (bad.Ok === false) expect(bad.Errors.join('; ')).toContain('PrimaryScore.value');
  });

  it('refuses an empty or non-JSON column, naming it', () => {
    const empty = MonitoringResultSchemas.ParseCalibration('');
    const text = MonitoringResultSchemas.ParseCalibration('{not json');
    expect([empty.Ok, text.Ok]).toEqual([false, false]);
    if (text.Ok === false) expect(text.Errors.join('; ')).toContain('Calibration');
  });

  it('reads a stored Calibration report', () => {
    const report = { method: 'platt', intercept: 0.1, slope: 0.95, reliability: [{ binLower: 0, binUpper: 0.5, meanPredicted: 0.3, observedRate: 0.31, n: 120 }] };
    expect(MonitoringResultSchemas.ParseCalibration(JSON.stringify(report))).toEqual({ Ok: true, Value: report });
  });

  it('reads every retrain trigger kind in TriggersFired and refuses a kind that is not one', () => {
    const fired = RETRAIN_TRIGGER_KINDS.map((kind) => ({ kind, reason: `${kind} held` }));
    expect(MonitoringResultSchemas.ParseTriggersFired(JSON.stringify(fired))).toEqual({ Ok: true, Value: fired });
    const unknown = MonitoringResultSchemas.ParseTriggersFired(JSON.stringify([{ kind: 'input-drift', reason: 'drift alone never retrains' }]));
    expect(unknown.Ok).toBe(false);
    if (unknown.Ok === false) expect(unknown.Errors.join('; ')).toContain('TriggersFired.0.kind');
  });

  it('a job Configuration that is not JSON is a named failure', () => {
    const r = MonitoringResultSchemas.ParseJobSpec('{');
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors.join('; ')).toContain('Configuration');
  });
});

describe('MonitoringResultSchemas.ParseMonitorDriftResponse (M6-3)', () => {
  it('accepts the contract\'s response', () => {
    const response = { look: 1, q: 0.0171, replays: 2000, results: [LOOK], alarms: [LOOK] };
    expect(MonitoringResultSchemas.ParseMonitorDriftResponse(response)).toEqual({ Ok: true, Value: response });
  });

  it('names each mismatch: an unknown input kind, a non-numeric z, a missing member and an unknown key', () => {
    const r = MonitoringResultSchemas.ParseMonitorDriftResponse({
      look: 1, q: 0.0171, results: [{ ...LOOK, kind: 'median', z: '5.2' }], alarms: [{ ...LOOK, extra: true }],
    });
    expect(r.Ok).toBe(false);
    if (r.Ok === false) {
      const all = r.Errors.join('\n');
      for (const path of ['results.0.kind', 'results.0.z', 'replays', 'alarms.0']) expect(all).toContain(path);
    }
  });
});

describe('the stored outcome lists', () => {
  it('list every challenger outcome and rollback check kind once', () => {
    expect(new Set(MONITORING_CHALLENGER_OUTCOMES).size).toBe(MONITORING_CHALLENGER_OUTCOMES.length);
    expect(new Set(MONITORING_ROLLBACK_CHECK_KINDS).size).toBe(MONITORING_ROLLBACK_CHECK_KINDS.length);
    expect(MONITORING_CHALLENGER_OUTCOMES).toContain('withheld');
    expect(MONITORING_ROLLBACK_CHECK_KINDS).toContain('rolled-back');
  });
});
