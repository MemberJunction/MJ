import { describe, expect, it } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from '../archiveSeed/ArchiveSeedDeps.js';
import { PlanArchiveSeedResume } from '../archiveSeed/ArchiveSeedDispatch.js';

const STORED = { ID: 'stored' } as UserInfo;
const records = { ResolveUser: (id: string) => (id === 'stored' ? STORED : undefined) } as unknown as ArchiveSeedRecords;
const itemFor = (userID?: string) => ({ ArchiveSeed: userID ? { UserID: userID } : undefined }) as unknown as RSUPendingWork;

describe('PlanArchiveSeedResume', () => {
  it('resumes as the stored user when it resolves', () => {
    expect(PlanArchiveSeedResume(itemFor('stored'), records)).toEqual({ Kind: 'Resume', User: STORED });
  });
  it('fails the job, naming the owner, when the stored user no longer resolves', () => {
    expect(PlanArchiveSeedResume(itemFor('gone'), records)).toEqual({ Kind: 'FailOwnerMissing', UserID: 'gone' });
  });
  it('fails the job when no owner is recorded, never falling back to another user', () => {
    expect(PlanArchiveSeedResume(itemFor(), records)).toEqual({ Kind: 'FailOwnerMissing', UserID: '(none recorded)' });
  });
});
