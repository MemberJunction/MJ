import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubDropdownComponent, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MJPageSearchComponent, MJRefreshButtonComponent } from '@memberjunction/ng-ui-components';
import { KPICardComponent } from '../../widgets/kpi-card.component';
import { AnalyticsRealtimeSessionsComponent } from './realtime-sessions.component';

/**
 * DOM coverage for <app-analytics-realtime-sessions> — the Realtime Voice sessions grid. Its filter
 * bar is built from the MJ catalog: `mj-page-search` for the free-text box, four named `mj-dropdown`s
 * (status / target agent / user / host, each leading with an "All" option) and `mj-refresh-button`.
 * An empty result set renders an `mj-empty-state` inside the table rather than a bare text row.
 * `mj-dropdown` / `mj-empty-state` / `mj-loading` are stubbed; the provider returns no rows.
 */

async function render(): Promise<ComponentFixture<AnalyticsRealtimeSessionsComponent>> {
  TestBed.configureTestingModule({
    declarations: [AnalyticsRealtimeSessionsComponent, KPICardComponent],
    imports: [FormsModule, StubLoadingComponent, StubEmptyStateComponent, StubDropdownComponent, MJPageSearchComponent, MJRefreshButtonComponent],
  });
  const fixture = TestBed.createComponent(AnalyticsRealtimeSessionsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: [] }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsRealtimeSessionsComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('builds its filter bar from named MJ controls, not native selects', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render();
    expect(queryAll(fixture, 'select.filter-select').length).toBe(0);
    expect(query(fixture, '.filterbar mj-page-search')).not.toBeNull();
    expect(query(fixture, '.filterbar mj-refresh-button')).not.toBeNull();
    const dropdowns = fixture.debugElement.queryAll(By.directive(StubDropdownComponent)).map((d) => d.componentInstance as StubDropdownComponent);
    expect(dropdowns.map((d) => d.AriaLabel)).toEqual(['Status', 'Target agent', 'User', 'Host instance']);
  });

  it('leads every filter list with an "All" option whose value clears the filter', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render();
    const c = fixture.componentInstance;
    for (const options of [c.StatusOptions, c.TargetOptions, c.UserOptions, c.HostOptions]) {
      expect(options[0].Value).toBe('');
      expect(options[0].Label).toMatch(/: All$/);
    }
    c.OnStatusFilterChanged('Active');
    expect(c.StatusFilter).toBe('Active');
    c.OnStatusFilterChanged(null);
    expect(c.StatusFilter).toBe('');
  });

  it('renders the no-results state inside the table when nothing matches', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render();
    const emptyTitles = queryAll(fixture, '.data-table .stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toContain('No sessions match the current filters');
  });
});
