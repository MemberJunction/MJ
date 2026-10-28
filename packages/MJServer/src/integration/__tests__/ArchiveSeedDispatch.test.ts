import { describe, expect, it } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from '../archiveSeed/ArchiveSeedDeps.js';
import { ResolveArchiveSeedResumeUser } from '../archiveSeed/ArchiveSeedDispatch.js';

const FALLBACK = { ID: 'system' } as UserInfo;
const STORED = { ID: 'stored' } as UserInfo;
const records = { ResolveUser: (id: string) => (id === 'stored' ? STORED : undefined) } as unknown as ArchiveSeedRecords;
const itemFor = (userID?: string) => ({ ArchiveSeed: userID ? { UserID: userID } : undefined }) as unknown as RSUPendingWork;

describe('ResolveArchiveSeedResumeUser', () => {
  it('uses the stored user when it resolves', () => {
    expect(ResolveArchiveSeedResumeUser(itemFor('stored'), FALLBACK, records)).toBe(STORED);
  });
  it('falls back when the stored user is unknown or absent', () => {
    expect(ResolveArchiveSeedResumeUser(itemFor('gone'), FALLBACK, records)).toBe(FALLBACK);
    expect(ResolveArchiveSeedResumeUser(itemFor(), FALLBACK, records)).toBe(FALLBACK);
  });
});
