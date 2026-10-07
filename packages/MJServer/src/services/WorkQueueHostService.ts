/**
 * @fileoverview Starts the durable work-queue host inside MJServer when `workQueue.enabled` is set.
 * @module MJServer/services
 */
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import sql from 'mssql';
import { LogError, LogStatus } from '@memberjunction/core';
import type { DatabaseProviderBase, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJWorkLogger, WorkQueueEngine, WorkQueueHost } from '@memberjunction/work-queue-engine';
import type { WorkQueueHostConfig, WorkQueueProviderSource } from '@memberjunction/work-queue-engine';
import { TaskGraphProviderFactory } from './TaskGraphProviderFactory.js';
import type { WorkQueueConfig } from './workQueueConfig.js';

export const WORK_QUEUE_DISABLE_ENV = 'MJ_DISABLE_WORK_QUEUE_HOST';

/** Matches the width of WorkQueueDelivery.LeaseOwner. */
const MAX_INSTANCE_ID_LENGTH = 200;

type EnvironmentVariables = Record<string, string | undefined>;

export interface StartableWorkQueueHost {
    Start(): Promise<void>;
}

/** Seams for tests; production uses DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES. */
export interface WorkQueueHostStartDependencies {
    Env: EnvironmentVariables;
    FindUserByEmail(email: string): UserInfo | undefined;
    ConfigureEngine(user: UserInfo, provider: DatabaseProviderBase): Promise<WorkQueueEngine>;
    CreateHost(config: WorkQueueHostConfig, engine: WorkQueueEngine, user: UserInfo, provider: DatabaseProviderBase, providerSource: WorkQueueProviderSource): StartableWorkQueueHost;
}

export const DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES: WorkQueueHostStartDependencies = {
    Env: process.env,
    FindUserByEmail: email => UserCache.Users.find(user => user.Email?.trim().toLowerCase() === email.trim().toLowerCase()),
    ConfigureEngine: async (user, provider) => {
        await WorkQueueEngine.Instance.Config(false, user, provider);
        await ReportTopologyIssues(WorkQueueEngine.Instance);
        return WorkQueueEngine.Instance;
    },
    CreateHost: (config, engine, user, provider, providerSource) =>
        new WorkQueueHost(config, engine, user, provider, new MJWorkLogger(), { ProviderSource: providerSource }),
};

/**
 * Topology rows, capability gating, driver bindings and database prerequisites (03 §11) — including SQL Server's
 * READ_COMMITTED_SNAPSHOT requirement (03 §7). Problems are logged, never thrown: the planner still gates each
 * subscription, and an operator can read the same list from WorkQueue.ValidateBindings.
 */
async function ReportTopologyIssues(engine: WorkQueueEngine): Promise<void> {
    try {
        for (const issue of await engine.ValidateTopology()) {
            const line = `[WorkQueue] ${issue.Severity}: ${issue.Subject} — ${issue.Message}`;
            if (issue.Severity === 'Error') {
                LogError(line);
            } else {
                LogStatus(line);
            }
        }
    } catch (error) {
        LogError(`[WorkQueue] Topology validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function IsWorkQueueHostDisabledByEnv(env: EnvironmentVariables): boolean {
    return env[WORK_QUEUE_DISABLE_ENV] === '1';
}

/**
 * Host and pid for humans reading logs; the random suffix for uniqueness — containers routinely share pid 1 and
 * HOSTNAME is not always exported. A restart is a new instance, so a dead process's leases simply expire.
 */
export function CreateWorkQueueInstanceID(env: EnvironmentVariables = process.env): string {
    const host = env.HOSTNAME ?? hostname();
    return `${host}-${process.pid}-${randomBytes(4).toString('hex')}`.slice(0, MAX_INSTANCE_ID_LENGTH);
}

export function BuildWorkQueueHostConfig(config: WorkQueueConfig, instanceID: string): WorkQueueHostConfig {
    return {
        InstanceID: instanceID,
        Subscriptions: config.subscriptions.map(entry => ({ Name: entry.name, Concurrency: entry.concurrency })),
        IdlePollMinMs: config.idlePollMinMs,
        IdlePollMaxMs: config.idlePollMaxMs,
        ShutdownDrainMs: config.shutdownDrainMs,
        SweeperIntervalMs: config.sweeperEnabled ? config.sweeperIntervalMs : 0,
        ReconcileIntervalMs: config.reconcileIntervalMs,
    };
}

/** A fresh SQL Server provider per delivery over the shared pool; the server provider otherwise. */
export class MJServerWorkQueueProviderSource implements WorkQueueProviderSource {
    private readonly factory: TaskGraphProviderFactory | null;

    constructor(pool: sql.ConnectionPool | null, private readonly fallback: IMetadataProvider) {
        this.factory = pool ? new TaskGraphProviderFactory(pool) : null;
    }

    public CreateProvider(): Promise<IMetadataProvider> {
        return this.factory ? this.factory.CreateProvider() : Promise.resolve(this.fallback);
    }
}

/** Returns the started host, or null when this instance runs no subscriptions. */
export async function StartWorkQueueHost(
    config: WorkQueueConfig,
    provider: DatabaseProviderBase,
    providerSource: WorkQueueProviderSource,
    dependencies: WorkQueueHostStartDependencies = DEFAULT_WORK_QUEUE_HOST_START_DEPENDENCIES,
): Promise<StartableWorkQueueHost | null> {
    if (!config.enabled) {
        return null;
    }
    if (IsWorkQueueHostDisabledByEnv(dependencies.Env)) {
        LogStatus(`[WorkQueue] Host disabled by ${WORK_QUEUE_DISABLE_ENV}=1 — this process publishes but runs no subscriptions.`);
        return null;
    }
    const user = dependencies.FindUserByEmail(config.systemUserEmail);
    if (!user) {
        throw new Error(`[WorkQueue] System user not found with email: ${config.systemUserEmail} — set workQueue.systemUserEmail in mj.config.cjs`);
    }
    const engine = await dependencies.ConfigureEngine(user, provider);
    const hostConfig = BuildWorkQueueHostConfig(config, CreateWorkQueueInstanceID(dependencies.Env));
    const host = dependencies.CreateHost(hostConfig, engine, user, provider, providerSource);
    await host.Start();
    LogStatus(`🔄 Work Queue host ${hostConfig.InstanceID}: ${hostConfig.Subscriptions.map(s => `${s.Name}×${s.Concurrency}`).join(', ')}`);
    return host;
}
