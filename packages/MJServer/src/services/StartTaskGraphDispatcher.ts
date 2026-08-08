/**
 * @fileoverview Boots the durable task-graph dispatcher inside MJServer.
 *
 * Phase 2 landed the dispatcher and the submission path but never started anything, so a submitted
 * graph persisted correctly and then sat in `Pending` forever. Submission being durable is only
 * half the promise — something has to *pick the work up*.
 *
 * The continuation deliverer is supplied here for the same reason the agent runner is: posting into
 * a conversation is a host concern the package deliberately refuses to know about.
 *
 * Registration of the package's Remote Operations is a separate concern handled by the generated
 * class-registration manifests (`ServerBootstrap` / `ServerBootstrapLite`), which import the
 * subclasses so their `@RegisterClass` decorators run. `LoadTaskGraphOperations` is called here
 * anyway as a cheap guard: a host that starts a dispatcher but never loaded a manifest would accept
 * submissions that route to the CodeGen contract-only base and silently do nothing.
 *
 * @module @memberjunction/server
 */
import { UserInfo } from '@memberjunction/core';
import { LoadTaskGraphOperations, TaskGraphDispatcher } from '@memberjunction/task-graph';
import sql from 'mssql';
import { DurableEntityActionRegistry } from '@memberjunction/actions-base';
import { CreateTaskGraphProviderFactory } from './TaskGraphProviderFactory.js';
import { TaskGraphActionRunner } from './TaskGraphActionRunner.js';
import { TaskGraphAgentRunner } from './TaskGraphAgentRunner.js';
import { DurableEntityActionTaskSubmitter } from './DurableEntityActionTaskSubmitter.js';
import { TaskGraphContinuationDeliverer } from './TaskGraphContinuationDeliverer.js';
import { PubSubManager } from '../generic/PubSubManager.js';
import { TaskGraphFrameBroadcaster } from '../resolvers/TaskGraphFrameResolver.js';

/**
 * Starts one dispatcher for this process and returns it.
 *
 * The instance ID must be stable for the process lifetime and distinct per instance — it is what
 * lets reconciliation tell "my own orphaned work, reclaim it" from "another live instance's work,
 * leave it alone". `pid` plus hostname satisfies both: stable while the process lives, and never
 * reused by a peer.
 *
 * The dispatcher self-registers with `ShutdownRegistry`, so the caller does not wire teardown.
 */
export async function StartTaskGraphDispatcher(
    pool: sql.ConnectionPool,
    contextUser: UserInfo,
    instanceID?: string,
): Promise<TaskGraphDispatcher> {
    LoadTaskGraphOperations();

    const providerFactory = CreateTaskGraphProviderFactory(pool);
    const pubSub = PubSubManager.Instance.PubSubEngine;
    const dispatcher = new TaskGraphDispatcher(
        providerFactory,
        new TaskGraphAgentRunner(),
        contextUser,
        { InstanceID: instanceID ?? `${process.env.HOSTNAME ?? 'mjapi'}-${process.pid}` },
        // Without this the dispatcher had nowhere to deliver: a finished graph logged its outcome,
        // marked itself delivered, and said nothing to the conversation that asked for it.
        new TaskGraphContinuationDeliverer(providerFactory, contextUser),
        // Live signal. Supplied only when a PubSub engine exists — in a worker or a test there is
        // nobody to publish to, and the dispatcher runs identically without one.
        pubSub ? new TaskGraphFrameBroadcaster(pubSub) : undefined,
        // Action nodes — the third execution shape, beside agents and people. Durable After* entity
        // actions land as these.
        new TaskGraphActionRunner(),
    );
    await dispatcher.Start();

    // Registered only AFTER the dispatcher is running, and only here. A submitter without a
    // dispatcher writes Task rows nobody picks up — strictly worse than staying inline, because the
    // work is now both undone and invisible in the place it used to be logged.
    DurableEntityActionRegistry.Instance.Register(new DurableEntityActionTaskSubmitter(providerFactory));

    return dispatcher;
}
