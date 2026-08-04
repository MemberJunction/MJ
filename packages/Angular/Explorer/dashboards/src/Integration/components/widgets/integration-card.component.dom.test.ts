import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, capture } from '@memberjunction/ng-test-utils';
import { IntegrationCardComponent } from './integration-card.component';
import type { IntegrationSummary, IntegrationRunRow } from '../../services/integration-data.service';

/**
 * DOM coverage for <app-integration-card> — a pure @Input-driven summary card (no services). The
 * `Summary` input is a plain-object stand-in for IntegrationSummary; `Integration` only needs the
 * few BaseEntity fields the template reads (ID/Name/Integration/IsActive). Covers: title + status
 * chip + KPI rows, the LatestRun / TotalErrors / sparkline gating, the inactive class, and the
 * RunNowClick / ExpandToggle outputs. Module-declared; mjButton imported, CommonModule for `| number`.
 */

function run(over: Partial<IntegrationRunRow> = {}): IntegrationRunRow {
  return {
    ID: 'r1', CompanyIntegrationID: 'ci1', StartedAt: null, EndedAt: null, TotalRecords: 100,
    Status: 'Success', ErrorLog: null, Integration: 'HubSpot', Company: 'Acme', RunByUser: 'Jane', ...over,
  };
}

function summary(over: Partial<IntegrationSummary> = {}): IntegrationSummary {
  const base = {
    Integration: { ID: 'ci1', Name: 'HubSpot Sync', Integration: 'HubSpot', IsActive: true },
    SourceType: { Name: 'CRM', IconClass: 'fa-solid fa-plug' },
    Icon: null,
    LatestRun: run(),
    RecentRuns: [],
    StatusColor: 'green',
    RelativeTime: '5 minutes ago',
    TotalRecordsSyncedToday: 100,
    TotalErrors: 0,
    DurationMs: 65000,
  };
  return { ...base, ...over } as unknown as IntegrationSummary;
}

const render = (inputs: Record<string, unknown>) =>
  renderComponentFixture(IntegrationCardComponent, {
    imports: [CommonModule, MJButtonDirective],
    declarations: [IntegrationCardComponent],
    inputs,
  });

describe('IntegrationCardComponent (DOM)', () => {
  it('renders the integration title, source type, status chip, and relative time', () => {
    const fixture = render({ Summary: summary() });
    expect(text(fixture, '.card-title')).toContain('HubSpot Sync');
    expect(text(fixture, '.source-type-label')).toContain('CRM');
    expect(text(fixture, '.status-chip')).toContain('Healthy');
    expect(query(fixture, '.stat-row .stat-value')?.textContent).toContain('5 minutes ago');
  });

  it('applies the inactive class and disables Run Now when the integration is inactive', () => {
    const fixture = render({ Summary: summary({ Integration: { ID: 'ci1', Name: 'X', Integration: 'X', IsActive: false } as unknown as IntegrationSummary['Integration'] }) });
    expect(hasClass(fixture, '.integration-card', 'inactive')).toBe(true);
    const runBtn = queryAll(fixture, '.card-footer button').find((b) => b.textContent?.includes('Run Now')) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);
  });

  it('hides the error badge when there are no errors', () => {
    expect(query(render({ Summary: summary({ TotalErrors: 0 }) }), '.error-badge')).toBeNull();
  });

  it('shows the error badge with the count when TotalErrors > 0', () => {
    expect(text(render({ Summary: summary({ TotalErrors: 3, StatusColor: 'red' }) }), '.error-badge')).toContain('3');
  });

  it('hides the sparkline when there is only one recent run', () => {
    expect(query(render({ Summary: summary({ RecentRuns: [run()] }) }), '.sparkline')).toBeNull();
  });

  it('renders a sparkline bar per recent run with status classes when there is more than one', () => {
    const fixture = render({ Summary: summary({ RecentRuns: [run({ ID: 'a', Status: 'Success' }), run({ ID: 'b', Status: 'Failed' })] }) });
    expect(queryAll(fixture, '.spark-bar').length).toBe(2);
    expect(query(fixture, '.spark-bar.spark-success')).not.toBeNull();
    expect(query(fixture, '.spark-bar.spark-failed')).not.toBeNull();
  });

  it('emits RunNowClick and ExpandToggle with the integration id', () => {
    const fixture = render({ Summary: summary() });
    const runNow = capture(fixture.componentInstance.RunNowClick);
    const expand = capture(fixture.componentInstance.ExpandToggle);
    const buttons = queryAll(fixture, '.card-footer button') as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.includes('Run Now'))!.click();
    buttons.find((b) => b.textContent?.includes('History'))!.click();
    expect(runNow).toEqual(['ci1']);
    expect(expand).toEqual(['ci1']);
  });
});
