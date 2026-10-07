import { describe, it, expect } from 'vitest';
import {
    ErrorText, ExecuteRows, ExecuteWrite, IsTransientDatabaseError, IsUniqueViolation,
    QualifiedTable, ToBoolean, ToIsoString, ToNumber,
} from '../sql/sqlExecution';
import { SqlParamList } from '../sql/SqlParamList';
import { IsWorkQueueExecutorSource, IsWorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('QualifiedTable', () => {
    it('qualifies a table with the core schema on both platforms', () => {
        expect(QualifiedTable(new RecordingExecutor(), 'WorkQueueDelivery')).toBe('[__mj].[WorkQueueDelivery]');
        expect(QualifiedTable(new RecordingExecutor('postgresql'), 'WorkQueueDelivery')).toBe('"__mj"."WorkQueueDelivery"');
    });
});

describe('ExecuteWrite', () => {
    it('runs the procedure call unchanged and reads AffectedRows from its result set', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const call = { SQL: 'EXEC [__mj].[spWorkQueueCompleteDelivery] @DeliveryID=@p0, @LeaseToken=@p1', Params: ['d1', 't1'] };
        const count = await ExecuteWrite(executor, call, TEST_USER);
        expect(count).toBe(1);
        expect(executor.Calls[0].SQL).toBe(call.SQL);
        expect(executor.Calls[0].Params).toEqual(['d1', 't1']);
        expect(executor.Calls[0].Options).toEqual({ isMutation: true });
    });

    it('accepts a string count, as PostgreSQL functions return it', async () => {
        const executor = new RecordingExecutor('postgresql').QueueRows([{ AffectedRows: '2' }]);
        const count = await ExecuteWrite(executor, { SQL: 'SELECT * FROM __mj."spWorkQueueCompleteDelivery"($1, $2)', Params: ['d1', 't1'] }, TEST_USER);
        expect(count).toBe(2);
    });

    it('returns zero when no rows come back', async () => {
        expect(await ExecuteWrite(new RecordingExecutor(), { SQL: 'DELETE FROM t', Params: [] }, TEST_USER)).toBe(0);
    });
});

describe('ExecuteRows', () => {
    it('returns rows unchanged', async () => {
        const executor = new RecordingExecutor().QueueRows([{ DeliveryID: 'a' }]);
        expect(await ExecuteRows(executor, { SQL: 'SELECT 1', Params: [] }, TEST_USER)).toEqual([{ DeliveryID: 'a' }]);
    });

    it('propagates execution errors', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('boom'));
        await expect(ExecuteRows(executor, { SQL: 'SELECT 1', Params: [] }, TEST_USER)).rejects.toThrow('boom');
    });
});

describe('error classification', () => {
    it('recognises a unique violation by platform code and index name', () => {
        const index = 'UQ_WorkQueueDelivery_InFlightPartition';
        const sqlServer = Object.assign(new Error(`Cannot insert duplicate key row in object with unique index '${index}'`), { number: 2601 });
        const postgres = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint: index.toLowerCase() });
        const wrapped = Object.assign(new Error(`Violation of UNIQUE KEY constraint '${index}'`), { originalError: { number: 2627 } });
        expect(IsUniqueViolation(sqlServer, index)).toBe(true);
        expect(IsUniqueViolation(postgres, index)).toBe(true);
        expect(IsUniqueViolation(wrapped, index)).toBe(true);
    });

    it('does not mistake other errors that mention the index for a unique violation', () => {
        const index = 'UQ_WorkQueueDelivery_InFlightPartition';
        expect(IsUniqueViolation(new Error(`deadlock victim while scanning ${index}`), index)).toBe(false);
        const otherIndex = Object.assign(new Error("duplicate key in 'UQ_Other'"), { number: 2601 });
        expect(IsUniqueViolation(otherIndex, index)).toBe(false);
    });

    it('classifies deadlocks and serialization failures as transient', () => {
        expect(IsTransientDatabaseError(new Error('Transaction was deadlocked on lock resources'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('ERROR 40P01: deadlock detected'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('could not serialize access'))).toBe(true);
        expect(IsTransientDatabaseError(Object.assign(new Error('x'), { number: 1205 }))).toBe(true);
        expect(IsTransientDatabaseError(Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' }))).toBe(true);
        expect(IsTransientDatabaseError(new Error('syntax error'))).toBe(false);
    });

    it('renders error text from errors, strings and objects', () => {
        expect(ErrorText(new Error('x'))).toBe('x');
        expect(ErrorText('y')).toBe('y');
        expect(ErrorText({ code: 1 })).toBe('{"code":1}');
    });
});

describe('value conversion', () => {
    it('normalises numbers from strings and bigints', () => {
        expect(ToNumber('42')).toBe(42);
        expect(ToNumber(BigInt(7))).toBe(7);
        expect(ToNumber(null)).toBeNull();
        expect(ToNumber('')).toBeNull();
        expect(ToNumber('abc')).toBeNull();
    });

    it('normalises bit values', () => {
        expect(ToBoolean(true)).toBe(true);
        expect(ToBoolean(1)).toBe(true);
        expect(ToBoolean('1')).toBe(true);
        expect(ToBoolean(0)).toBe(false);
        expect(ToBoolean(null)).toBe(false);
    });

    it('renders timestamps as ISO strings', () => {
        expect(ToIsoString(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
        expect(ToIsoString('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
        expect(ToIsoString(null)).toBeNull();
        expect(ToIsoString('not a date')).toBeNull();
    });
});

describe('SqlParamList', () => {
    it('hands out placeholders in order', () => {
        const params = new SqlParamList(new RecordingExecutor('postgresql'));
        expect(params.Add('a')).toBe('$1');
        expect(params.Add(2)).toBe('$2');
        expect(params.Values).toEqual(['a', 2]);
    });
});

describe('executor type guards', () => {
    it('accepts an executor with transactions and independent instances', () => {
        const executor = new RecordingExecutor();
        expect(IsWorkQueueTransactionalExecutor(executor)).toBe(true);
        expect(IsWorkQueueExecutorSource(executor)).toBe(true);
    });

    it('rejects objects that are not database providers', () => {
        expect(IsWorkQueueTransactionalExecutor({ ExecuteSQL: () => [] })).toBe(false);
        expect(IsWorkQueueExecutorSource(null)).toBe(false);
    });
});

describe('RecordingExecutor', () => {
    it('tags calls with the executor that ran them and whether a transaction was open', async () => {
        const source = new RecordingExecutor().QueueRows([{ A: 1 }]);
        const independent = await source.CreateIndependentInstance();
        const scope = await independent.BeginEntityTransaction();
        expect(await independent.ExecuteSQL('SELECT 1')).toEqual([{ A: 1 }]);
        await scope.Commit();
        await source.ExecuteSQL('SELECT 2');
        expect(source.Calls.map(call => [call.Executor, call.InTransaction])).toEqual([['independent#1', true], ['source', false]]);
        expect(source.CallsOn('independent#1')).toHaveLength(1);
        expect(source.Events).toEqual(['independent', 'begin', 'commit']);
    });
});
