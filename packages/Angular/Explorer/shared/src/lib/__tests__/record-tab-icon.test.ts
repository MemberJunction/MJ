/**
 * Tests for ResolveRecordTypeIcon — the shared record TYPE icon resolution
 * (golden-layout tab slot, mobile record bar, and switcher sheet all resolve
 * through it so a record shows one icon everywhere).
 */
import { describe, it, expect, vi } from 'vitest';
import { ResolveRecordTypeIcon } from '../record-tab-icon';
import type { IMetadataProvider } from '@memberjunction/core';

vi.mock('@memberjunction/core', () => ({}));

describe('ResolveRecordTypeIcon', () => {
  const providerWith = (icon: string | undefined): IMetadataProvider =>
    ({ EntityByName: vi.fn().mockReturnValue(icon === undefined ? undefined : { Icon: icon }) }) as unknown as IMetadataProvider;

  it('returns the entity icon when metadata has one', () => {
    expect(ResolveRecordTypeIcon({ Entity: 'MJ: Actions' }, providerWith('fa-solid fa-bolt')))
      .toBe('fa-solid fa-bolt');
  });

  it('falls back when the entity has no icon', () => {
    expect(ResolveRecordTypeIcon({ Entity: 'MJ: Actions' }, providerWith('')))
      .toBe('fa-regular fa-file-lines');
  });

  it('falls back when the entity is unknown to metadata', () => {
    expect(ResolveRecordTypeIcon({ Entity: 'Nope' }, providerWith(undefined)))
      .toBe('fa-regular fa-file-lines');
  });

  it('falls back for missing configuration, non-string Entity, or null provider', () => {
    expect(ResolveRecordTypeIcon(undefined, providerWith('fa-x'))).toBe('fa-regular fa-file-lines');
    expect(ResolveRecordTypeIcon({ Entity: 42 }, providerWith('fa-x'))).toBe('fa-regular fa-file-lines');
    expect(ResolveRecordTypeIcon({ Entity: 'MJ: Actions' }, null)).toBe('fa-regular fa-file-lines');
  });
});
