/**
 * Three-way lockstep contract test for the 10-value Task union:
 *   TypeScript ALL_TASKS  ↔  migration CHECK constraints  ↔  sidecar Pydantic Literal
 *
 * Parses the actual migration SQL and schemas.py so drift in ANY copy fails here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { ALL_TASKS, TaskSchema, isTask } from '../tasks';
import { ALL_PORT_TYPES } from '../port-types';

const REPO_ROOT = resolve(__dirname, '../../../../../..');

function findMigration(): string {
  const dir = join(REPO_ROOT, 'migrations/v5');
  const file = readdirSync(dir).find((f) => f.includes('ML_Component_Framework'));
  if (!file) throw new Error('ML_Component_Framework migration not found in migrations/v5');
  return readFileSync(join(dir, file), 'utf-8');
}

function parseCheckValues(sql: string, constraintName: string): string[] {
  // CONSTRAINT [CK_x] CHECK ([Col] IN ('a', 'b', ...))
  const re = new RegExp(`CONSTRAINT \\[${constraintName}\\] CHECK \\(\\[[A-Za-z]+\\] IN \\(([^)]+)\\)`);
  const m = sql.match(re);
  if (!m) throw new Error(`constraint ${constraintName} not found/parseable`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('Task union three-way lockstep', () => {
  it('has exactly 10 members with no duplicates', () => {
    expect(ALL_TASKS).toHaveLength(10);
    expect(new Set(ALL_TASKS).size).toBe(10);
  });

  it('matches the migration CK_MLComponent_Task CHECK exactly', () => {
    const sql = findMigration();
    const dbValues = parseCheckValues(sql, 'CK_MLComponent_Task');
    expect(new Set(dbValues)).toEqual(new Set(ALL_TASKS));
  });

  it('matches the migration CK_MLModel_Task CHECK exactly (when present)', () => {
    const sql = findMigration();
    if (sql.includes('CK_MLModel_Task')) {
      const dbValues = parseCheckValues(sql, 'CK_MLModel_Task');
      expect(new Set(dbValues)).toEqual(new Set(ALL_TASKS));
    }
  });

  it('matches the sidecar Pydantic Task Literal exactly', () => {
    const py = readFileSync(
      join(REPO_ROOT, 'packages/AI/PredictiveStudio/Sidecar/src/python/app/schemas.py'),
      'utf-8',
    );
    const m = py.match(/Task = Literal\[([\s\S]*?)\]/);
    expect(m, 'Task Literal not found in schemas.py').toBeTruthy();
    const pyValues = [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(new Set(pyValues)).toEqual(new Set(ALL_TASKS));
  });

  it('TaskSchema accepts every member and rejects non-members', () => {
    for (const t of ALL_TASKS) expect(TaskSchema.safeParse(t).success).toBe(true);
    expect(TaskSchema.safeParse('time-series').success).toBe(false);
    expect(isTask('survival')).toBe(true);
    expect(isTask('uplift')).toBe(false); // uplift is a template family, not a Task
  });
});

describe('Port vocabulary', () => {
  it('has 29 unique members', () => {
    expect(ALL_PORT_TYPES).toHaveLength(29);
    expect(new Set(ALL_PORT_TYPES).size).toBe(29);
  });

  it('names describe data shapes (lowercase, no algorithm names)', () => {
    for (const p of ALL_PORT_TYPES) {
      expect(p).toBe(p.toLowerCase());
      expect(p).not.toMatch(/markov|xgboost|kmeans|arima/);
    }
  });
});
