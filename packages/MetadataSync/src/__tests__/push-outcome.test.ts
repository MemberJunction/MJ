import { describe, it, expect } from 'vitest';
import {
    PushAbortedError,
    describeRollbackOutcome,
    describeCommittedWrites,
    describeCommitFailure,
    type CommittedWrite,
} from '../lib/push-outcome';

const cwd = '/repo';
const writes: CommittedWrite[] = [
    { filePath: '/repo/meta/a/.vendors.json', entityName: 'MJ: AI Vendors', recordPath: 'MJ: AI Vendors[0]', status: 'updated' },
    { filePath: '/repo/meta/a/.vendors.json', entityName: 'MJ: AI Vendors', recordPath: 'MJ: AI Vendors[1]', status: 'created' },
    { filePath: '/repo/meta/b/.models.json', entityName: 'MJ: AI Models', recordPath: 'MJ: AI Models[0]', status: 'updated' },
];

describe('describeRollbackOutcome', () => {
    it('says nothing was saved only when the rollback worked and nothing committed elsewhere', () => {
        const lines = describeRollbackOutcome(true, [], cwd);
        expect(lines).toEqual(['✓ Database transaction rolled back successfully. Nothing from this push was saved.']);
    });

    it('never says "rolled back successfully" when records were committed outside the transaction', () => {
        const lines = describeRollbackOutcome(true, writes, cwd);
        expect(lines.join('\n')).not.toMatch(/rolled back successfully/);
        expect(lines[0]).toMatch(/3 created or updated records were already committed/);
        expect(lines).toContain('   meta/a/.vendors.json: 2 committed');
        expect(lines).toContain('      created MJ: AI Vendors at MJ: AI Vendors[1]');
    });

    it('reports a failed rollback, with any committed records', () => {
        const lines = describeRollbackOutcome(false, writes.slice(0, 1), cwd);
        expect(lines[0]).toMatch(/rollback failed/);
        expect(lines).toContain('   meta/a/.vendors.json: 1 committed');
    });
});

describe('describeCommittedWrites', () => {
    it('groups records by file, in first-seen order', () => {
        expect(describeCommittedWrites(writes, cwd)).toEqual([
            '   meta/a/.vendors.json: 2 committed',
            '      updated MJ: AI Vendors at MJ: AI Vendors[0]',
            '      created MJ: AI Vendors at MJ: AI Vendors[1]',
            '   meta/b/.models.json: 1 committed',
            '      updated MJ: AI Models at MJ: AI Models[0]',
        ]);
    });
});

describe('describeCommitFailure', () => {
    it('explains deferred foreign keys on PostgreSQL', () => {
        const text = describeCommitFailure(new Error('violates foreign key constraint'), 'postgresql');
        expect(text).toMatch(/rejected the commit/);
        expect(text).toMatch(/violates foreign key constraint/);
        expect(text).toMatch(/not tied to a single record/);
    });

    it('does not mention deferred constraints on SQL Server', () => {
        expect(describeCommitFailure(new Error('boom'), 'sqlserver')).not.toMatch(/PostgreSQL/);
    });
});

describe('PushAbortedError', () => {
    it('keeps the original message and cause, and knows whether anything stayed committed', () => {
        const cause = new Error('Name cannot be null');
        const clean = new PushAbortedError({ mode: 'atomic', rolledBack: true, committedWrites: [], cause });
        expect(clean.message).toBe('Name cannot be null');
        expect(clean.cause).toBe(cause);
        expect(clean.NothingCommitted).toBe(true);

        const dirty = new PushAbortedError({ mode: 'parallel', rolledBack: true, committedWrites: writes, cause });
        expect(dirty.NothingCommitted).toBe(false);
        expect(dirty).toBeInstanceOf(Error);
    });
});
