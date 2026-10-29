import { describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from '../archiveSeed/ArchiveSeedDeps.js';
import { DispatchArchiveSeedWork, PlanArchiveSeedResume, type ArchiveSeedDispatchTarget } from '../archiveSeed/ArchiveSeedDispatch.js';

const STORED = { ID: 'stored' } as UserInfo;
const SYSTEM = { ID: 'system' } as UserInfo;
const PROVIDER = {} as IMetadataProvider;
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

describe('DispatchArchiveSeedWork', () => {
  function Job(result: Promise<void> = Promise.resolve()): ArchiveSeedDispatchTarget & { Resume: ReturnType<typeof vi.fn>; FailUnresolvableOwner: ReturnType<typeof vi.fn> } {
    return { Resume: vi.fn(() => result), FailUnresolvableOwner: vi.fn(() => result) };
  }

  it('resumes the job as its stored owner and does not wait for it', () => {
    const job = Job(new Promise<void>(() => undefined));
    expect(DispatchArchiveSeedWork(itemFor('stored'), 'job-1', SYSTEM, PROVIDER, job, records)).toBeUndefined();
    expect(job.Resume).toHaveBeenCalledWith('job-1', STORED, PROVIDER);
    expect(job.FailUnresolvableOwner).not.toHaveBeenCalled();
  });

  it('fails the job as the system user when its owner no longer resolves', () => {
    const job = Job();
    DispatchArchiveSeedWork(itemFor('gone'), 'job-2', SYSTEM, PROVIDER, job, records);
    expect(job.FailUnresolvableOwner).toHaveBeenCalledWith('job-2', SYSTEM, PROVIDER);
    expect(job.Resume).not.toHaveBeenCalled();
  });

  it('never throws, even when the hand-off rejects', async () => {
    const job = Job(Promise.reject(new Error('boom')));
    expect(() => DispatchArchiveSeedWork(itemFor('stored'), 'job-3', SYSTEM, PROVIDER, job, records)).not.toThrow();
    await new Promise<void>(resolve => setImmediate(resolve));
  });
});
