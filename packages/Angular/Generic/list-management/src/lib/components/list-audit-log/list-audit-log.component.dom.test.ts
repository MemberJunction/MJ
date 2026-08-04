import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { RunViewParams } from '@memberjunction/core';
import { ListAuditLogComponent } from './list-audit-log.component';

/**
 * DOM spec for <mj-list-audit-log>. Extends BaseAngularComponent and loads via
 * `RunView.FromMetadataProvider(this.ProviderToUse)`, so we pass a fake straight into `[Provider]`
 * (recipe A — no global swap). loadEntries() first reads `md.Entities` to resolve the 'MJ: Lists'
 * entity (hence the fake's `entities` stub), then runs three queries: audit logs, then users +
 * audit-log-types for display-name hydration. The fake serves each by EntityName so the row
 * hydration (UserName / EventType) is tested end-to-end. (See guides/ANGULAR_TESTING_GUIDE.md §6.)
 */
const MOD = {
  imports: [CommonModule, FormsModule, SharedGenericModule],
  declarations: [ListAuditLogComponent],
};

const LOGS = [
  { ID: 'l1', UserID: 'u1', AuditLogTypeID: 'ty1', Description: 'Shared with Ada', Details: null, __mj_CreatedAt: '2026-01-02T00:00:00Z' },
  { ID: 'l2', UserID: 'u1', AuditLogTypeID: 'ty1', Description: 'Viewed list', Details: '{"x":1}', __mj_CreatedAt: '2026-01-01T00:00:00Z' },
];
const USERS = [{ ID: 'u1', Name: 'Ada Lovelace' }];
const TYPES = [{ ID: 'ty1', Name: 'Shared' }];

const byEntity = (logs: unknown[]) => (p: RunViewParams) =>
  p.EntityName === 'MJ: Audit Logs' ? logs : p.EntityName === 'MJ: Users' ? USERS : p.EntityName === 'MJ: Audit Log Types' ? TYPES : [];

async function renderLoaded(logs: unknown[] = LOGS) {
  const f = renderComponentFixture(ListAuditLogComponent, {
    ...MOD,
    inputs: {
      // entities stub satisfies the `md.Entities.find(e => e.Name === 'MJ: Lists')` lookup in loadEntries()
      Provider: createFakeProvider({ runViewResults: byEntity(logs), entities: [{ Name: 'MJ: Lists', ID: 'lists-1' }] }),
      ListID: 'list-1',
    },
  });
  await new Promise((r) => setTimeout(r, 0)); // let the (multi-query) load settle
  f.detectChanges();
  return f;
}

describe('ListAuditLogComponent (DOM)', () => {
  it('renders a row per loaded audit entry, hydrated with user and event-type names', async () => {
    const f = await renderLoaded();
    const rows = queryAll(f, '.audit-table tbody tr');
    expect(rows.length).toBe(2);
    expect(text(f, '.audit-table tbody tr .audit-cell-user')).toBe('Ada Lovelace'); // hydrated from MJ: Users
    expect(text(f, '.audit-table tbody tr .event-chip')).toBe('Shared'); // hydrated from MJ: Audit Log Types
  });

  it('shows the empty state when there are no audit entries', async () => {
    const f = await renderLoaded([]);
    expect(query(f, '.audit-state--empty')).not.toBeNull();
    expect(query(f, '.audit-table')).toBeNull();
  });
});
