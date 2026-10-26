import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { SavePinState } from '../lib/utils/pin-state';

/** A pin is saved on the row as stored, so a reply's streamed local text never rides along (A19). */
function providerWith(row: { Load: () => Promise<boolean>; Save: () => Promise<boolean>; IsPinned?: boolean }): IMetadataProvider {
  return { GetEntityObject: vi.fn(async () => row) } as unknown as IMetadataProvider;
}

describe('SavePinState', () => {
  it('loads the stored row and saves only the pin on it', async () => {
    const row = { Load: vi.fn(async () => true), Save: vi.fn(async () => true), IsPinned: false };
    expect(await SavePinState(providerWith(row), 'detail-1', true)).toBe(true);
    expect(row.Load).toHaveBeenCalledWith('detail-1');
    expect(row.IsPinned).toBe(true);
    expect(row.Save).toHaveBeenCalled();
  });

  it('reports a row that cannot be loaded, and saves nothing', async () => {
    const row = { Load: vi.fn(async () => false), Save: vi.fn(async () => true) };
    expect(await SavePinState(providerWith(row), 'gone', true)).toBe(false);
    expect(row.Save).not.toHaveBeenCalled();
  });
});
