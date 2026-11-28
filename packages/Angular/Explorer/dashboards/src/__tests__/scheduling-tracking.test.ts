import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  Component: () => (target: Function) => target,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: class {
    emit(): void {}
  },
  ChangeDetectorRef: class {
    detectChanges(): void {}
    markForCheck(): void {}
  },
  ChangeDetectionStrategy: { OnPush: 1 },
}));

vi.mock('@memberjunction/core', () => ({
  RunView: class {},
  Metadata: { Provider: {} },
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJScheduledJobEntity: class {},
  MJScheduledJobRunEntity: class {},
  MJScheduledJobTypeEntity: class {},
}));

vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}));

import { SchedulingOverviewComponent } from '../Scheduling/components/scheduling-overview.component';
import type { AlertCondition, ExecutionTrendData } from '../Scheduling/services/scheduling-instrumentation.service';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULING_ROOT = join(__dirname, '..', 'Scheduling');

function collectFiles(dir: string, extensions: readonly string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some(ext => fullPath.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Scheduling dashboard @for tracking expressions', () => {
  it('never uses bare object-identity tracking (track <item>) in any Scheduling template', () => {
    const files = collectFiles(SCHEDULING_ROOT, ['.html', '.ts']).filter(
      f => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
    );

    const forLoopRegex = /@for\s*\(\s*([A-Za-z_$][\w$]*)\s+of\s+[^;]+;\s*track\s+([^;)]+)/g;
    const identityViolations: string[] = [];
    let totalLoopsChecked = 0;

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = forLoopRegex.exec(content)) !== null) {
        totalLoopsChecked++;
        const loopVar = match[1].trim();
        const trackExpr = match[2].trim();
        if (trackExpr === loopVar) {
          identityViolations.push(`${relative(SCHEDULING_ROOT, file)}: @for (${loopVar} ...; track ${trackExpr})`);
        }
      }
    }

    expect(totalLoopsChecked).toBeGreaterThanOrEqual(9);
    expect(identityViolations).toEqual([]);
  });

  it('generates unique and refresh-stable keys for all AlertCondition variants via GetAlertTrackKey', () => {
    const overview = Object.create(SchedulingOverviewComponent.prototype) as SchedulingOverviewComponent;

    const initialAlerts: AlertCondition[] = [
      {
        type: 'stale-lock',
        severity: 'error',
        title: 'Stale Lock Detected',
        message: 'Job "Nightly Sync" has a stale lock held by worker-1',
        jobId: 'job-1',
        jobName: 'Nightly Sync',
      },
      {
        type: 'stale-lock',
        severity: 'error',
        title: 'Stale Lock Detected',
        message: 'Job "Hourly Digest" has a stale lock held by worker-2',
        jobId: 'job-2',
        jobName: 'Hourly Digest',
      },
      {
        type: 'high-failure',
        severity: 'warning',
        title: 'High Failure Rate',
        message: '15.0% failure rate over the last 7 days (3 failures)',
      },
      {
        type: 'job-expired',
        severity: 'warning',
        title: 'Expired Job',
        message: 'Job "Nightly Sync" has expired and is no longer running',
        jobId: 'job-1',
        jobName: 'Nightly Sync',
      },
      {
        type: 'job-expired',
        severity: 'warning',
        title: 'Expired Job',
        message: 'Job "Weekly Report" has expired and is no longer running',
        jobId: 'job-3',
        jobName: 'Weekly Report',
      },
    ];

    const initialKeys = initialAlerts.map(a => overview.GetAlertTrackKey(a));
    // Every alert key is unique (no NG0955 duplicate keys), even when job-1 has both stale-lock and job-expired
    expect(new Set(initialKeys).size).toBe(initialAlerts.length);

    // Refreshed clones with updated messages must yield the exact same keys (no NG0956)
    const refreshedAlerts: AlertCondition[] = initialAlerts.map((a, idx) => ({
      ...a,
      message: `${a.message} (refreshed #${idx})`,
    }));
    const refreshedKeys = refreshedAlerts.map(a => overview.GetAlertTrackKey(a));
    expect(refreshedKeys).toEqual(initialKeys);
  });

  it('produces unique primitive epoch-ms keys for ExecutionTrendData buckets across refreshes', () => {
    const baseMs = Date.UTC(2026, 10, 28, 0, 0, 0);
    const makeTrends = (): ExecutionTrendData[] =>
      Array.from({ length: 6 }, (_, i) => ({
        timestamp: new Date(baseMs + i * 60 * 60 * 1000),
        executions: i + 1,
        successes: i,
        failures: 1,
      }));

    const firstKeys = makeTrends().map(t => t.timestamp.getTime());
    const secondKeys = makeTrends().map(t => t.timestamp.getTime());

    expect(new Set(firstKeys).size).toBe(6);
    expect(secondKeys).toEqual(firstKeys);
  });
});
