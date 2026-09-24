import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import type { ConformanceHarness, ConformanceTraits, SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { ToSubscriptionBinding, ToTopicBinding, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { WorkQueueTables } from '../constants';
import type { WorkQueueTableName } from '../constants';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { SqlParamList } from '../sql/SqlParamList';
import { ExecuteWrite, QualifiedTable } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../transports/OwnedExecutor';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';

export const DATABASE_CONFORMANCE_TRAITS: ConformanceTraits = {
    ReleaseConsumesAttempt: false,
    ExpiredLeaseDeadLetters: true,
    ReceiveWaitSeconds: 0,
};

/** The seeded Database transport (plan 05 Task 1). */
const SEEDED_DATABASE_TRANSPORT_ID = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
const CONFORMANCE_HANDLER_KEY = 'WorkQueueConformance';

export type ConformanceProvider = WorkQueueExecutorSource & Pick<IMetadataProvider, 'GetEntityObject'>;

export interface DatabaseConformanceHarness extends ConformanceHarness {
    /** Deletes every row this harness created. Call once after the suite. */
    Cleanup(): Promise<void>;
}

/** AdvanceTime cannot move the database clock, so rows are shifted back by whole seconds, never less than one. */
export function SecondsToShift(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Runs the core conformance kit against a real database. Writes real topic and subscription rows on the seeded
 * Database transport (the driver needs the foreign keys); its own SQL (AdvanceTime, cleanup deletes) runs on an
 * independent executor it owns, never on the shared provider (03 §11, F8).
 */
export async function CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo,
                                                       transportID = SEEDED_DATABASE_TRANSPORT_ID): Promise<DatabaseConformanceHarness> {
    const topics: MJWorkQueueTopicEntity[] = [];
    const subscriptions: MJWorkQueueSubscriptionEntity[] = [];
    const drivers: DatabaseTransportDriver[] = [];
    const sql = CreateWorkQueueSqlBuilder(provider);
    const owned = new OwnedExecutor(provider);
    const deps = { ContextUser: contextUser, Executor: provider, Log: new MJWorkLogger('[WorkQueueConformance]') };

    return {
        Capabilities: DATABASE_TRANSPORT_CAPABILITIES,
        Traits: DATABASE_CONFORMANCE_TRAITS,
        CreateDriver: async (): Promise<ITransportDriver> => {
            const driver = new DatabaseTransportDriver(provider, deps);
            drivers.push(driver);
            return driver;
        },
        CreateTopic: async (_driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> => {
            const topic = await provider.GetEntityObject<MJWorkQueueTopicEntity>(WorkQueueEntityNames.Topics, contextUser);
            topic.NewRecord();
            topic.Name = name;
            topic.TransportID = transportID;
            topic.IsFifo = overrides.IsFifo ?? false;
            topic.MaxPayloadBytes = overrides.MaxPayloadBytes ?? 262144;
            await SaveOrThrow(topic, name);
            topics.push(topic);
            return ToTopicBinding(topic);
        },
        CreateSubscription: async (_driver: ITransportDriver, binding: TopicBinding, name: string,
                                   overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> => {
            const topic = topics.find(t => t.Name === binding.TopicName);
            if (!topic) {
                throw new Error(`Conformance topic '${binding.TopicName}' was not created by this harness`);
            }
            const subscription = await provider.GetEntityObject<MJWorkQueueSubscriptionEntity>(WorkQueueEntityNames.Subscriptions, contextUser);
            subscription.NewRecord();
            ApplySubscriptionOverrides(subscription, topic.ID, name, overrides);
            await SaveOrThrow(subscription, name);
            subscriptions.push(subscription);
            return ToSubscriptionBinding(subscription, topic);
        },
        AdvanceTime: async (ms: number): Promise<void> => {
            for (const subscription of subscriptions) {
                await ExecuteWrite(await owned.Get(), sql.Consume.ShiftTimestampsForConformance(subscription.ID, SecondsToShift(ms)), contextUser);
            }
        },
        Dispose: async (): Promise<void> => undefined,
        Cleanup: async (): Promise<void> => {
            for (const driver of drivers.splice(0)) {
                await driver.Close();
            }
            await DeleteRuntimeRows(await owned.Get(), contextUser, subscriptions.map(s => s.ID), topics.map(t => t.ID));
            await owned.Release();
            for (const subscription of subscriptions.splice(0)) {
                await subscription.Delete();
            }
            for (const topic of topics.splice(0)) {
                await topic.Delete();
            }
        },
    };
}

function ApplySubscriptionOverrides(subscription: MJWorkQueueSubscriptionEntity, topicID: string, name: string,
                                    overrides: SubscriptionBindingOverrides): void {
    subscription.TopicID = topicID;
    subscription.Name = name;
    subscription.HostType = overrides.HostType ?? 'MJWorker';
    subscription.HandlerKey = subscription.HostType === 'MJWorker' ? CONFORMANCE_HANDLER_KEY : null;
    subscription.Filter = overrides.Filter ? JSON.stringify(overrides.Filter) : null;
    subscription.PartitionMode = overrides.PartitionMode ?? 'None';
    subscription.MaxAttempts = overrides.MaxAttempts ?? 5;
    subscription.BackoffBaseSeconds = overrides.BackoffBaseSeconds ?? 10;
    subscription.BackoffMaxSeconds = overrides.BackoffMaxSeconds ?? 900;
    subscription.LeaseSeconds = overrides.LeaseSeconds ?? 60;
    subscription.HeartbeatMode = overrides.HeartbeatMode ?? 'Auto';
    subscription.MaxProcessingSeconds = overrides.MaxProcessingSeconds ?? null;
}

async function SaveOrThrow(entity: MJWorkQueueTopicEntity | MJWorkQueueSubscriptionEntity, name: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`Conformance setup could not save '${name}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Deliveries first: they reference messages. Raw DML under the developer login — the harness is test-only. */
async function DeleteRuntimeRows(executor: WorkQueueSqlExecutor, contextUser: UserInfo, subscriptionIDs: string[], topicIDs: string[]): Promise<void> {
    await DeleteWhereIn(executor, contextUser, WorkQueueTables.Delivery, 'SubscriptionID', subscriptionIDs);
    const byTopic: WorkQueueTableName[] = [WorkQueueTables.Message, WorkQueueTables.Deduplication];
    for (const table of byTopic) {
        await DeleteWhereIn(executor, contextUser, table, 'TopicID', topicIDs);
    }
}

async function DeleteWhereIn(executor: WorkQueueSqlExecutor, contextUser: UserInfo, table: WorkQueueTableName, column: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    const params = new SqlParamList(executor);
    const cast = executor.PlatformKey === 'postgresql' ? '::uuid' : '';
    const placeholders = ids.map(id => `${params.Add(id)}${cast}`).join(', ');
    const dml = `DELETE FROM ${QualifiedTable(executor, table)} WHERE ${executor.QuoteIdentifier(column)} IN (${placeholders})`;
    await ExecuteWrite(executor, { SQL: executor.Dialect.AffectedRowCountSQL(dml, 'AffectedRows'), Params: params.Values }, contextUser);
}
