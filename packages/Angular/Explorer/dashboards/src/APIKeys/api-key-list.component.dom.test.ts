import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { APIKeyListComponent } from './api-key-list.component';

/**
 * DOM coverage for <mj-api-key-list> — a data-bound (standalone:false) key grid with filter tabs.
 * It loads "MJ: API Keys" + "MJ: API Key Scopes" via RunView through ProviderToUse in ngOnInit, and
 * reads scope metadata from the APIKeysEngineBase singleton — which returns an empty Scopes array
 * when unconfigured (no throw), so every key renders with a "None" scope cell (its data path stays
 * inert in the test). A createFakeProvider supplies key rows. Tests assert the rendered rows + stat
 * counts, the empty state, and the KeySelected / CreateRequested outputs. mj-empty-state carries an
 * (Action) output the empty-state's CTA fires. Async ngOnInit flips IsLoading → await + detect.
 */

// NOTE: the component default-sorts by `__mj_CreatedAt DESC`, so any test that asserts row ORDER
// must give each key an explicit, DISTINCT __mj_CreatedAt (newest first in the rendered grid).
// A shared `new Date()` default would tie sub-millisecond and make the order flake on ms boundaries.
const key = (over: Partial<Record<string, unknown>>) =>
  ({ ID: '', Label: '', Description: null, User: 'ada@x.io', Hash: 'abcdef0123456789', Status: 'Active', ExpiresAt: null, LastUsedAt: null, __mj_CreatedAt: '2026-01-01T00:00:00.000Z', ...over });

const rowsFor = (keys: unknown[]) =>
  (p: { EntityName?: string }): unknown[] => (p.EntityName === 'MJ: API Key Scopes' ? [] : keys);

async function render(keys: unknown[], Filter: string = 'all') {
  const provider = createFakeProvider({ runViewResults: rowsFor(keys) });
  const fixture = renderComponentFixture(APIKeyListComponent, {
    imports: [CommonModule, FormsModule, StubLoadingComponent, StubEmptyStateComponent],
    declarations: [APIKeyListComponent],
    inputs: { Provider: provider, Filter },
  });
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
  fixture.detectChanges(false);
  return fixture;
}

describe('APIKeyListComponent (DOM)', () => {
  it('renders a grid row per loaded key with its label', async () => {
    const fixture = await render([
      key({ ID: 'k1', Label: 'Prod Key', __mj_CreatedAt: '2026-02-01T00:00:00.000Z' }),
      key({ ID: 'k2', Label: 'Dev Key', __mj_CreatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(queryAll(fixture, '.grid-row').length).toBe(2);
    const labels = queryAll(fixture, '.key-label').map(el => el.textContent?.trim());
    expect(labels).toEqual(['Prod Key', 'Dev Key']); // Prod is newer → sorts first (CreatedAt DESC)
  });

  it('shows the filtered/total count badge', async () => {
    const fixture = await render([key({ ID: 'k1', Label: 'Prod Key' })]);
    expect(text(fixture, '.count-badge')).toBe('1 of 1');
  });

  it('reflects Active status in the status badge and the All-tab count', async () => {
    const fixture = await render([
      key({ ID: 'k1', Label: 'A', Status: 'Active', __mj_CreatedAt: '2026-02-01T00:00:00.000Z' }),
      key({ ID: 'k2', Label: 'B', Status: 'Revoked', __mj_CreatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(text(fixture, '.filter-tab.active .tab-count')).toBe('2'); // All tab shows total
    const badges = queryAll(fixture, '.status-badge').map(el => el.textContent?.trim());
    expect(badges).toEqual(['Active', 'Revoked']); // A is newer → sorts first (CreatedAt DESC)
  });

  it('shows "None" in the scopes cell when a key has no assigned scopes', async () => {
    const fixture = await render([key({ ID: 'k1', Label: 'Prod Key' })]);
    expect(text(fixture, '.col-scopes .no-scopes')).toContain('None');
  });

  it('renders the empty state when no keys exist', async () => {
    const fixture = await render([]);
    expect(query(fixture, '.grid-row')).toBeNull();
    expect(text(fixture, '.stub-empty')).toBe('No API keys created yet');
    expect(text(fixture, '.stub-empty-action')).toBe('Generate Your First Key');
  });

  it('emits KeySelected with the key when a row is clicked', async () => {
    const fixture = await render([key({ ID: 'k1', Label: 'Prod Key' })]);
    const selected = capture(fixture.componentInstance.KeySelected);
    (query(fixture, '.grid-row') as HTMLElement).click();
    expect(selected.length).toBe(1);
    expect(selected[0].Label).toBe('Prod Key');
  });

  it('emits CreateRequested from the header Generate button', async () => {
    const fixture = await render([key({ ID: 'k1', Label: 'Prod Key' })]);
    const created = capture(fixture.componentInstance.CreateRequested);
    (query(fixture, '.create-btn') as HTMLElement).click();
    expect(created.length).toBe(1);
  });

  it('emits CreateRequested from the empty-state CTA', async () => {
    const fixture = await render([]);
    const created = capture(fixture.componentInstance.CreateRequested);
    (query(fixture, '.stub-empty-action') as HTMLElement).click();
    expect(created.length).toBe(1);
  });
});
