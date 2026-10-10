import type { SqlBuilderContext } from './WorkQueueSqlExecutor';
import { WorkQueueConsumeSql } from './WorkQueueConsumeSql';
import { WorkQueueOperatorSql } from './WorkQueueOperatorSql';
import { WorkQueuePublishSql } from './WorkQueuePublishSql';
import type { WorkQueueSqlBuilder } from './WorkQueueSqlBuilder';

/**
 * Builds the call builders for the provider's platform. Under CD9 (plan 12) one set of builders serves both
 * platforms — the SQL lives in the `spWorkQueue*` procedures and only the call syntax differs, which the context's
 * dialect supplies — so the factory's job is to refuse a platform the procedures have not been written for. If a
 * platform is added to `DatabasePlatform` later, the `never` assignment fails the build, which is the intent.
 */
export function CreateWorkQueueSqlBuilder(context: SqlBuilderContext): WorkQueueSqlBuilder {
    switch (context.PlatformKey) {
        case 'sqlserver':
        case 'postgresql':
            return {
                Publish: new WorkQueuePublishSql(context),
                Consume: new WorkQueueConsumeSql(context),
                Operator: new WorkQueueOperatorSql(context),
            };
    }
    const unsupported: never = context.PlatformKey;
    throw new Error(`Work queue SQL is not implemented for platform '${String(unsupported)}'`);
}
