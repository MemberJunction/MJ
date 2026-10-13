import { describe, it, expect } from 'vitest';
import type { DatabasePlatform } from '@memberjunction/sql-dialect';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { WorkQueueConsumeSql } from '../sql/WorkQueueConsumeSql';
import { WorkQueueOperatorSql } from '../sql/WorkQueueOperatorSql';
import { WorkQueuePublishSql } from '../sql/WorkQueuePublishSql';
import { DELIVERY, SUB, TOKEN } from './builderCalls';
import { RecordingExecutor } from './fakes';

describe('CreateWorkQueueSqlBuilder', () => {
    it('serves SQL Server with the shared builders rendering named-argument EXEC calls', () => {
        const builder = CreateWorkQueueSqlBuilder(new RecordingExecutor('sqlserver'));
        expect(builder.Publish).toBeInstanceOf(WorkQueuePublishSql);
        expect(builder.Consume).toBeInstanceOf(WorkQueueConsumeSql);
        expect(builder.Operator).toBeInstanceOf(WorkQueueOperatorSql);
        expect(builder.Consume.CompleteDelivery(DELIVERY, TOKEN).SQL).toBe('EXEC [__mj].[spWorkQueueCompleteDelivery] @DeliveryID=@p0, @LeaseToken=@p1');
    });

    it('serves PostgreSQL with the same builders rendering positional function calls', () => {
        const builder = CreateWorkQueueSqlBuilder(new RecordingExecutor('postgresql'));
        expect(builder.Publish).toBeInstanceOf(WorkQueuePublishSql);
        expect(builder.Consume.CompleteDelivery(DELIVERY, TOKEN).SQL).toBe('SELECT * FROM __mj."spWorkQueueCompleteDelivery"($1, $2)');
        expect(builder.Operator.SubscriptionStats(SUB, true).Params).toEqual([SUB, true]);
    });

    it('refuses a platform the procedures were never written for', () => {
        const executor = new RecordingExecutor('unknown-platform' as DatabasePlatform);
        expect(() => CreateWorkQueueSqlBuilder(executor)).toThrow("Work queue SQL is not implemented for platform 'unknown-platform'");
    });
});
