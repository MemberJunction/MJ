import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { SafeJSONParse } from '@memberjunction/global';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { AtRiskRules, type RunDetailLike } from '@memberjunction/predictive-studio-core';
import { PSRowDriversComponent } from './ps-row-drivers.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

interface Artifact { targetVariable: string; lineage?: string | null; details: Array<{ recordId: string; resultPayload: string | null }> }

const FILE = process.env.TRUTH_RESULTS_DIR ? path.join(process.env.TRUTH_RESULTS_DIR, 'artifacts', 'w1-s42-recordprocess.json') : null;
const ARTIFACT: Artifact | null = FILE && existsSync(FILE) ? SafeJSONParse<Artifact>(readFileSync(FILE, 'utf8')) : null;

function rows() {
  const details: RunDetailLike[] = (ARTIFACT?.details || []).map((d) => ({ RecordID: d.recordId, ResultPayload: d.resultPayload }));
  const model = { Lineage: ARTIFACT?.lineage || null, TargetVariable: ARTIFACT?.targetVariable || null, ProblemType: 'classification' };
  return AtRiskRules.ParseAtRiskRows(details, AtRiskRules.BuildAtRiskOptions(model));
}

describe.skipIf(ARTIFACT === null)('component tier on the real W1 s42 scores', () => {
  it('every Auto Renew top-driver row renders "Lowers Risk" in green', () => {
    const autoRenew = rows().filter((r) => r.Drivers?.[0]?.Label === 'Auto Renew');
    expect(autoRenew.length).toBeGreaterThan(0);
    for (const r of autoRenew) {
      const fixture = renderComponentFixture(PSRowDriversComponent, { inputs: { Drivers: r.Drivers || [] } });
      expect(text(fixture, '[data-testid="ps-row-driver-label"]')).toContain('Auto Renew');
      expect(text(fixture, '[data-testid="ps-row-driver-badge"]')).toBe('Lowers Risk');
      expect(query(fixture, '[data-testid="ps-row-driver-badge"].green')).not.toBeNull();
      fixture.destroy();
    }
  });

  it('"Send to a list" takes between 1 and 200 members', () => {
    const members = AtRiskRules.SelectAtRiskListMembers(rows(), 200);
    expect(members.length).toBeGreaterThan(0);
    expect(members.length).toBeLessThanOrEqual(200);
  });
});
