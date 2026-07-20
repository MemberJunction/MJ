import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, hasClass, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { RunViewParams } from '@memberjunction/core';
import { APIUsagePanelComponent } from './api-usage-panel.component';

/**
 * DOM coverage for <mj-api-usage-panel> — a data-bound (standalone:false) analytics dashboard.
 * It loads API keys (for label lookup) + usage logs via RunView through ProviderToUse in ngOnInit,
 * then computes summary KPIs (total requests / errors / success rate / unique keys+endpoints).
 * A createFakeProvider returns keys for "MJ: API Keys" and logs for "MJ: API Key Usage Logs".
 * Tests assert the rendered KPI values, the endpoint/key breakdowns, empty states, and the default
 * time-range button. mj-empty-state is a light stub; the drill-down mj-window is never opened.
 * Async ngOnInit flips IsLoading, so tests await microtasks then a non-strict detectChanges.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class StubLoading { @Input() text = ''; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '<span class="stub-empty">{{ Title }}</span>' })
class StubEmptyState { @Input() Variant = ''; @Input() Icon = ''; @Input() Title = ''; @Input() Message = ''; @Input() Size = ''; }

const log = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', APIKeyID: 'k1', Endpoint: '/x', Method: 'GET', StatusCode: 200, ResponseTimeMs: 100, __mj_CreatedAt: new Date().toISOString(), ...over });

const key = (over: Partial<Record<string, unknown>>) => ({ ID: 'k1', Label: 'My Key', ...over });

async function render(logs: unknown[], keys: unknown[] = [key({})]) {
  const provider = createFakeProvider({
    runViewResults: (p: RunViewParams) => (p.EntityName === 'MJ: API Keys' ? keys : logs),
  });
  const fixture = renderComponentFixture(APIUsagePanelComponent, {
    imports: [CommonModule, StubLoading, StubEmptyState],
    declarations: [APIUsagePanelComponent],
    inputs: { Provider: provider },
  });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

describe('APIUsagePanelComponent (DOM)', () => {
  it('renders total request and error KPIs from the loaded logs', async () => {
    const fixture = await render([
      log({ ID: '1', StatusCode: 200 }),
      log({ ID: '2', StatusCode: 200 }),
      log({ ID: '3', StatusCode: 500 }),
    ]);
    const values = queryAll(fixture, '.kpi-card .kpi-value').map(el => el.textContent?.trim());
    // order: Total Requests, Success Rate, Errors, Avg Response Time, Active Keys, Unique Endpoints
    expect(values[0]).toBe('3');       // total requests
    expect(values[1]).toBe('67%');     // success rate (2/3)
    expect(values[2]).toBe('1');       // errors (one 5xx)
  });

  it('computes unique key and endpoint counts', async () => {
    const fixture = await render([
      log({ ID: '1', APIKeyID: 'k1', Endpoint: '/a' }),
      log({ ID: '2', APIKeyID: 'k2', Endpoint: '/b' }),
      log({ ID: '3', APIKeyID: 'k1', Endpoint: '/a' }),
    ]);
    const values = queryAll(fixture, '.kpi-card .kpi-value').map(el => el.textContent?.trim());
    expect(values[4]).toBe('2'); // unique keys (k1, k2)
    expect(values[5]).toBe('2'); // unique endpoints (/a, /b)
  });

  it('marks the default 7 Days time-range button active', async () => {
    const fixture = await render([log({ ID: '1' })]);
    const active = queryAll(fixture, '.time-btn.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('7 Days');
  });

  it('resolves the API key label into the Top Keys breakdown', async () => {
    const fixture = await render([log({ ID: '1', APIKeyID: 'k1' })], [key({ ID: 'k1', Label: 'Production Key' })]);
    expect(text(fixture, '.key-list .key-label')).toBe('Production Key');
  });

  it('shows a compact empty state when there are no logs', async () => {
    const fixture = await render([]);
    // TotalRequests 0 → success rate KPI shows 100% and the chart/breakdown empty states render
    expect(query(fixture, '.stub-empty')).not.toBeNull();
  });
});
