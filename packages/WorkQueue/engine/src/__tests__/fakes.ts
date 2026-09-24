import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import type { EntityTransactionScope, ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { SubscriptionBinding, SubscriptionPolicy, TopicBinding, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { SqlParam, WorkQueueExecutorSource, WorkQueueIndependentExecutor } from '../sql/WorkQueueSqlExecutor';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';

export interface RecordedCall {
    SQL: string;
    Params: SqlParam[];
    Options?: ExecuteSQLOptions;
    /** Which executor ran the statement: 'source', or 'independent#N' for the Nth minted instance. */
    Executor: string;
    /** True when that executor had an open transaction scope. */
    InTransaction: boolean;
}

type QueuedResponse = { Kind: 'Rows'; Rows: object[] } | { Kind: 'Error'; Error: Error };

/**
 * Records every statement and answers with queued row sets (or errors) in order. An empty queue answers with no
 * rows. `CreateIndependentInstance()` returns a **tagged child** that shares this executor's response queue, call log
 * and event log, so tests can assert *which* executor ran a statement (03 §11 "Executor ownership"): a regression that
 * issues queue SQL on the shared source, or an in-transaction statement outside its transaction, is visible.
 */
export class RecordingExecutor implements WorkQueueExecutorSource, WorkQueueIndependentExecutor {
    public readonly Calls: RecordedCall[];
    public readonly Events: string[];
    public readonly MJCoreSchemaName = '__mj';
    public readonly Dialect: SQLDialect;
    public readonly Tag: string;
    private readonly responses: QueuedResponse[];
    private readonly root: RecordingExecutor;
    private minted = 0;
    private openScopes = 0;

    constructor(public readonly PlatformKey: DatabasePlatform = 'sqlserver', parent?: RecordingExecutor) {
        this.Dialect = PlatformKey === 'sqlserver' ? new SQLServerDialect() : new PostgreSQLDialect();
        this.root = parent ? parent.root : this;
        this.Calls = parent ? parent.Calls : [];
        this.Events = parent ? parent.Events : [];
        this.responses = parent ? parent.responses : [];
        this.Tag = parent ? `independent#${++parent.root.minted}` : 'source';
    }

    public QuoteIdentifier(name: string): string {
        return this.PlatformKey === 'sqlserver' ? `[${name}]` : `"${name}"`;
    }

    public BuildParameterPlaceholder(index: number): string {
        return this.PlatformKey === 'sqlserver' ? `@p${index}` : `$${index + 1}`;
    }

    public QueueRows(rows: object[]): this {
        this.responses.push({ Kind: 'Rows', Rows: rows });
        return this;
    }

    public QueueError(error: Error): this {
        this.responses.push({ Kind: 'Error', Error: error });
        return this;
    }

    /** Calls run by the executor with this tag (`'source'`, `'independent#1'`, …). */
    public CallsOn(tag: string): RecordedCall[] {
        return this.Calls.filter(call => call.Executor === tag);
    }

    public async ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions): Promise<T[]> {
        this.Calls.push({ SQL: sql, Params: parameters ?? [], Options: options, Executor: this.Tag, InTransaction: this.openScopes > 0 });
        const next = this.responses.shift();
        if (!next) {
            return [];
        }
        if (next.Kind === 'Error') {
            throw next.Error;
        }
        return next.Rows as T[];
    }

    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Events.push('begin');
        this.openScopes++;
        let settled = false;
        const settle = (event: string): void => {
            if (!settled) {
                settled = true;
                this.openScopes--;
                this.Events.push(event);
            }
        };
        return {
            IsNested: false,
            Commit: async () => settle('commit'),
            Rollback: async () => settle('rollback'),
        };
    }

    public async CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor> {
        this.Events.push('independent');
        return new RecordingExecutor(this.PlatformKey, this);
    }

    public async ReleaseIndependentInstance(): Promise<void> {
        this.Events.push('release');
    }
}

export const TEST_USER = {} as UserInfo;

export const TOPIC_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
export const SUBSCRIPTION_ID = 'BBBBBBBB-0000-0000-0000-000000000001';

export function TopicBindingFixture(overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'import.ready',
        IsFifo: false,
        MaxPayloadBytes: 262144,
        Config: { TopicID: TOPIC_ID },
        ...overrides,
    };
}

export function SubscriptionBindingFixture(
    policy: Partial<SubscriptionPolicy> = {},
    config: Record<string, WorkJson> = {},
): SubscriptionBinding {
    return {
        Policy: {
            SubscriptionName: 'venue-import',
            TopicName: 'import.ready',
            PartitionMode: 'None',
            MaxAttempts: 5,
            BackoffBaseSeconds: 10,
            BackoffMaxSeconds: 900,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
            ...policy,
        },
        Filter: null,
        HostType: 'MJWorker',
        Config: { SubscriptionID: SUBSCRIPTION_ID, TopicID: TOPIC_ID, ...config },
    };
}

export class RecordingLogger implements WorkLogger {
    public readonly Lines: string[] = [];
    public Info(message: string): void { this.Lines.push(`INFO ${message}`); }
    public Warn(message: string): void { this.Lines.push(`WARN ${message}`); }
    public Error(message: string): void { this.Lines.push(`ERROR ${message}`); }
}

export function TestDeps(executor: RecordingExecutor): TransportDriverDeps {
    return { ContextUser: TEST_USER, Executor: executor, Log: new RecordingLogger(), InstanceID: 'test-host:1:abcd' };
}
