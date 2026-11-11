import { describe, it, expect, vi, beforeEach } from 'vitest';

const runViewMock = vi.fn();

vi.mock('@memberjunction/core', () => ({
  Metadata: { Provider: {} },
  RunView: { FromMetadataProvider: () => ({ RunView: runViewMock }) },
}));
vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@angular/core', () => ({ Injectable: () => (c: unknown) => c }));

import { ListManagementService } from '../lib/services/list-management.service';

type MembershipCacheView = { membershipCache: { Size: number; MaxSize: number } };

describe('ListManagementService membership cache', () => {
  beforeEach(() => {
    runViewMock.mockReset();
    runViewMock.mockResolvedValue({ Success: true, Results: [{ ListID: 'l1', RecordID: 'r1' }] });
  });

  it('is bounded: browsing many distinct record sets never exceeds the max size', async () => {
    const service = new ListManagementService();
    const cache = (service as unknown as MembershipCacheView).membershipCache;

    for (let i = 0; i < cache.MaxSize + 25; i++) {
      await service.GetRecordMembership('e1', [`record-${i}`]);
    }
    expect(cache.Size).toBe(cache.MaxSize);
  });

  it('serves repeat lookups for the same record set from cache', async () => {
    const service = new ListManagementService();
    await service.GetRecordMembership('e1', ['a', 'b']);
    await service.GetRecordMembership('e1', ['b', 'a']);
    expect(runViewMock).toHaveBeenCalledTimes(1);
  });
});
