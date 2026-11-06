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
    Configuration: Record<string, string | number | boolean>;
  };
}

interface ActionRecord {
  fields: {
    Name: string;
    DriverClass: string;
    Status: string;
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

describe('Predictive Studio maintenance job and action metadata (D9)', () => {
  const [job] = JSON.parse(
    readFileSync(path.join(repoRoot, 'metadata/scheduled-jobs/.predictive-studio-maintenance-job.json'), 'utf8'),
  ) as ScheduledJobRecord[];

  const actions = JSON.parse(
    readFileSync(path.join(repoRoot, 'metadata/actions/predictive-studio/.predictive-studio-actions.json'), 'utf8'),
  ) as ActionRecord[];

  it('wires the maintenance scheduled job to PredictiveStudioEvaluateDriftAction and registers the action in metadata', () => {
    expect(job.fields.Name).toBe('Predictive Studio Maintenance');
    expect(job.fields.Status).toBe('Active');
    expect(job.fields.Configuration).toEqual({
      ActionID: `@lookup:MJ: Actions.DriverClass=${EVALUATE_DRIFT_DRIVER_CLASS}`,
    });

    const driftAction = actions.find((a) => a.fields.DriverClass === EVALUATE_DRIFT_DRIVER_CLASS);
    expect(driftAction).toBeDefined();
    expect(driftAction?.fields.Name).toBe('Evaluate Feature and Prediction Drift');
    expect(driftAction?.fields.Status).toBe('Active');
  });
});
