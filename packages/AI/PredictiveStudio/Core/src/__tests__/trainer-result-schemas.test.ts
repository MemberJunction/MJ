import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  JsonParse,
  TrainerContract,
  TrainerResultSchemas,
  type JsonValue,
  type MetricWithInterval,
  type TrainerCompleted,
  type TrainerFailed,
} from '../index';

const RUN_ID = '00000000-0000-0000-0000-000000000004';
const HEX = 'a'.repeat(64);
const score: MetricWithInterval = { metric: 'rmse', value: 4.97, interval: { level: 0.95, lower: 4.6, upper: 5.3 }, n: 400 };

const completed: TrainerCompleted = {
  status: 'completed',
  trainingRunId: RUN_ID,
  codeVersion: {
    psGitSha: 'c92d4a47f957dcc5054cb5bbd52f4a7b39acb673', sidecarVersion: '6.2.0', threads: 1, seed: 0,
    libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' },
  },
  computeSeconds: 3.5,
  innerScores: [{ candidate: 'glm_candidate', inner: score, folds: 15, optimistic: true }],
  finalist: 'glm_candidate',
  holdoutAccess: { accessedAt: '2026-10-28T03:00:00.000Z', count: 1, finalist: 'glm_candidate' },
  holdout: { primary: score, secondary: [] },
  baselines: [{ baseline: { kind: 'dummy', name: 'mean' }, role: 'dummy', holdout: score }],
  comparisons: { modelVsDummy: { value: 0.5, ci: [0.2, 0.8], beats: true } },
  gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
  artifacts: [{ candidate: 'glm_candidate', bytesBase64: 'YWJj', sha256: HEX, featureSchemaHash: HEX, classOrder: null }],
  incumbentDiff: null,
  calibration: null,
  slices: [{ slice: { kind: 'out-of-time', period: '2024-01-01' }, primary: score }],
  operatingPoint: null,
  cost: { computeSeconds: 3.5, tokens: 0, usd: 0, budget: { maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }, stoppedByBudget: false },
  importance: [{ sourceColumn: 'Tenure', permutationImportance: score }],
  leakageFlags: [{ kind: 'drop-column', sourceColumn: 'Tenure', scoreDrop: 0.1 }],
  predictionIntervalCoverage: [],
  residualDiagnostics: null,
  forecast: null,
  innerSplitContrast: null,
};

const failed: TrainerFailed = { status: 'failed', trainingRunId: RUN_ID, stage: 'inner-cv', message: 'fold 3 has one class', computeSeconds: 1.2 };

/** The value as it arrives on the wire: serialized and parsed back, so the test passes JSON rather than a typed object. */
function wire(value: object): JsonValue {
  const parsed = JsonParse.ParseJsonText(JSON.stringify(value), 'answer');
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

describe('TrainerContract.ParseTrainerResult', () => {
  it('accepts a completed and a failed answer unchanged', () => {
    expect(TrainerContract.ParseTrainerResult(wire(completed))).toEqual({ Ok: true, Value: completed });
    expect(TrainerContract.ParseTrainerResult(wire(failed))).toEqual({ Ok: true, Value: failed });
  });

  it('refuses a completed answer without its code version, naming the member', () => {
    const { codeVersion: _dropped, ...rest } = completed;
    const r = TrainerContract.ParseTrainerResult(wire(rest));
    expect(r.Ok).toBe(false);
    if (r.Ok === false) expect(r.Errors.join('\n')).toContain('codeVersion');
  });

  it('refuses an answer with a key the contract does not have, at any depth', () => {
    expect(TrainerContract.ParseTrainerResult(wire({ ...completed, legacyMetrics: {} })).Ok).toBe(false);
    expect(TrainerContract.ParseTrainerResult(wire({ ...failed, retryable: true })).Ok).toBe(false);
    const nested = { ...completed, holdout: { ...completed.holdout, primary: { ...score, extra: 1 } } };
    expect(TrainerContract.ParseTrainerResult(wire(nested)).Ok).toBe(false);
  });

  it('refuses an unknown status, failure stage or gate branch, and a non-UUID run ID', () => {
    expect(TrainerContract.ParseTrainerResult(wire({ ...failed, status: 'partial' })).Ok).toBe(false);
    expect(TrainerContract.ParseTrainerResult(wire({ ...failed, stage: 'oom' })).Ok).toBe(false);
    expect(TrainerContract.ParseTrainerResult(wire({ ...completed, gate: { ...completed.gate, branch: 'a:beats-best-simple' } })).Ok).toBe(false);
    expect(TrainerContract.ParseTrainerResult(wire({ ...failed, trainingRunId: 'R1' })).Ok).toBe(false);
  });

  it('refuses a non-JSON-object answer', () => {
    expect(TrainerContract.ParseTrainerResult('completed').Ok).toBe(false);
    expect(TrainerContract.ParseTrainerResult(null).Ok).toBe(false);
  });
});

/** Each `_Frozen` model's field names in the sidecar's trainer schemas, in declaration order. */
function pythonModelFields(source: string): Map<string, string[]> {
  const models = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of source.split('\n')) {
    const cls = /^class (\w+)\(_Frozen\):/.exec(line);
    if (cls) {
      current = [];
      models.set(cls[1], current);
      continue;
    }
    if (/^\S/.test(line)) current = null;
    const field = /^ {4}([A-Za-z]\w*): /.exec(line);
    if (current && field) current.push(field[1]);
  }
  return models;
}

describe('trainer answer schemas against the sidecar models', () => {
  const pythonFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../Sidecar/src/python/app/trainer_schemas.py');
  const python = pythonModelFields(readFileSync(pythonFile, 'utf8'));

  it('declares, for every mirrored model, exactly the members the pydantic model declares', () => {
    const names = Object.keys(TrainerResultSchemas.ModelFields);
    expect(names.length).toBe(41);
    for (const name of names) {
      expect({ name, fields: [...(python.get(name) ?? [])].sort() }).toEqual({ name, fields: [...TrainerResultSchemas.ModelFields[name]].sort() });
    }
  });

  it('mirrors every model the answer is built from', () => {
    const answerModels = ['TrainerCompleted', 'TrainerFailed', 'GateModel', 'GateKeepSimple', 'GateNoSignal', 'SplitContrast', 'ForecastEvaluation'];
    for (const name of answerModels) expect(Object.keys(TrainerResultSchemas.ModelFields)).toContain(name);
  });
});
