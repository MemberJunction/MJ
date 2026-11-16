import { describe, expect, it } from 'vitest';
import { PSVersionedListComponent } from './versioned-list.component';
import type { VersionRowFields } from './lineage-reads';

const root = '11111111-2222-4333-8444-555555555555';
const other = '33333333-4444-4555-8666-777777777777';

describe('PSVersionedListComponent.LatestPerLineage', () => {
  it('keeps the latest version of each lineage, matching lineage IDs in any case, newest first', () => {
    const rows: VersionRowFields[] = [
      { ID: root, LineageRootID: root, Version: 1, Name: 'Renewal', __mj_CreatedAt: '2026-01-01T00:00:00Z' },
      { ID: 'AAAAAAAA-0000-4000-8000-000000000002', LineageRootID: root.toLowerCase(), Version: 2, Name: 'Renewal v2', __mj_CreatedAt: '2026-03-01T00:00:00Z' },
      { ID: other, LineageRootID: other, Version: 1, Name: 'Visits', __mj_CreatedAt: '2026-02-01T00:00:00Z' },
    ];
    expect(PSVersionedListComponent.LatestPerLineage(rows)).toEqual([
      { LatestID: 'AAAAAAAA-0000-4000-8000-000000000002', Name: 'Renewal v2', LatestVersion: 2, UpdatedAt: '2026-03-01T00:00:00Z' },
      { LatestID: other, Name: 'Visits', LatestVersion: 1, UpdatedAt: '2026-02-01T00:00:00Z' },
    ]);
  });
});
