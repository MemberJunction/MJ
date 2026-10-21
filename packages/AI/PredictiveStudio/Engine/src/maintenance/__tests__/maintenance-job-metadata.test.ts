import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';

interface ScheduledJobRecord {
  fields: { Name: string; Description: string; Status: MJScheduledJobEntity['Status']; Configuration: Record<string, string | number | boolean> };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');

describe('Predictive Studio maintenance job metadata (F-MNT-1 contained)', () => {
  const [job] = JSON.parse(readFileSync(path.join(repoRoot, 'metadata/scheduled-jobs/.predictive-studio-maintenance-job.json'), 'utf8')) as ScheduledJobRecord[];

  it('is Disabled, has no Action, and says it is not wired', () => {
    expect(job.fields.Status).toBe('Disabled');
    expect(job.fields.Configuration).toEqual({});
    expect(job.fields.Name).toBe('Predictive Studio Maintenance (not wired)');
    expect(job.fields.Description).toMatch(/^Not wired:/);
  });
});
