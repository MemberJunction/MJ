import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { EVALUATE_DRIFT_DRIVER_CLASS } from '../../actions/driver-classes';

interface ScheduledJobRecord {
  fields: {
    Name: string;
    Description: string;
    Status: MJScheduledJobEntity['Status'];
    CronExpression: string;
    Timezone: string;
    Configuration: Record<string, string | number | boolean>;
  };
  primaryKey: {
    ID: string;
  };
  sync?: {
    lastModified: string;
    checksum: string;
  };
}

interface ActionParamRecord {
  fields: {
    Name: string;
    Type: 'Input' | 'Output' | 'Both';
  };
  primaryKey: {
    ID: string;
  };
}

interface ActionRecord {
  fields: {
    Name: string;
    DriverClass: string;
    Status: string;
  };
  primaryKey: {
    ID: string;
  };
  relatedEntities?: {
    'MJ: Action Params'?: ActionParamRecord[];
    'MJ: Action Result Codes'?: Array<{ primaryKey: { ID: string } }>;
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

describe('Predictive Studio maintenance job and action metadata (D9, R2, R3, R5)', () => {
  const jobs = JSON.parse(
    readFileSync(path.join(repoRoot, 'metadata/scheduled-jobs/.predictive-studio-maintenance-job.json'), 'utf8'),
  ) as ScheduledJobRecord[];

  const actions = JSON.parse(
    readFileSync(path.join(repoRoot, 'metadata/actions/predictive-studio/.predictive-studio-actions.json'), 'utf8'),
  ) as ActionRecord[];

  it('preserves the disabled Predictive Studio Maintenance placeholder job and adds the disabled opt-in Predictive Studio Drift Evaluation job (R2)', () => {
    expect(jobs).toHaveLength(2);

    const maintenanceJob = jobs.find((j) => j.fields.Name === 'Predictive Studio Maintenance');
    expect(maintenanceJob).toBeDefined();
    expect(maintenanceJob?.primaryKey.ID).toBe('2CCE4280-9B29-4DCC-86A4-E5AF765909D1');
    expect(maintenanceJob?.fields.Status).toBe('Disabled');
    expect(maintenanceJob?.fields.Configuration).toEqual({});
    expect(maintenanceJob?.sync).toBeDefined();

    const driftJob = jobs.find((j) => j.fields.Name === 'Predictive Studio Drift Evaluation');
    expect(driftJob).toBeDefined();
    expect(driftJob?.fields.Status).toBe('Disabled');
    expect(driftJob?.fields.Description).toContain('RetrainingPolicy.driftEnabled');
    expect(driftJob?.fields.Configuration).toEqual({
      ActionID: `@lookup:MJ: Actions.DriverClass=${EVALUATE_DRIFT_DRIVER_CLASS}`,
    });
    expect(driftJob?.primaryKey.ID).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
    expect(driftJob?.sync).toBeUndefined();
  });

  it('registers Evaluate Feature and Prediction Drift with non-sequential uuidgen IDs and declares every param used in evaluate-drift.action.ts (R3, R5)', () => {
    const driftAction = actions.find((a) => a.fields.DriverClass === EVALUATE_DRIFT_DRIVER_CLASS);
    expect(driftAction).toBeDefined();
    expect(driftAction?.fields.Name).toBe('Evaluate Feature and Prediction Drift');
    expect(driftAction?.fields.Status).toBe('Active');

    const allIds = [
      driftAction!.primaryKey.ID,
      ...(driftAction!.relatedEntities?.['MJ: Action Params'] ?? []).map((p) => p.primaryKey.ID),
      ...(driftAction!.relatedEntities?.['MJ: Action Result Codes'] ?? []).map((r) => r.primaryKey.ID),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of allIds) {
      expect(id).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
      expect(id.startsWith('6A2D5E81-')).toBe(false);
    }

    const declaredParamNames = new Set(
      (driftAction!.relatedEntities?.['MJ: Action Params'] ?? []).map((p) => p.fields.Name),
    );
    const actionSource = readFileSync(
      path.join(repoRoot, 'packages/AI/PredictiveStudio/Engine/src/actions/evaluate-drift.action.ts'),
      'utf8',
    );
    const paramRegex = /\b(?:getStringParam|getNumericParam|getBooleanParam|getJsonObjectParam|addOutputParam)\s*\(\s*params\s*,\s*'([^']+)'/g;
    const codeParamNames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(actionSource)) !== null) {
      codeParamNames.add(match[1]);
    }

    expect(codeParamNames.size).toBeGreaterThanOrEqual(20);
    for (const name of codeParamNames) {
      expect(declaredParamNames.has(name), `Expected MJ: Action Params to declare '${name}'`).toBe(true);
    }
  });
});
