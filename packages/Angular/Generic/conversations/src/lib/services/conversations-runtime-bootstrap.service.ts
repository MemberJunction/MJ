/**
 * @fileoverview Wires the framework-agnostic `@memberjunction/conversations-runtime`
 * to the Angular host's UI services at module bootstrap.
 *
 * The runtime knows nothing about Angular — it surfaces user-facing messages
 * through `INotificationAdapter` and clears running tasks through
 * `IActiveTaskTracker`. This service implements both adapters using MJ's
 * Angular notification + active-task services and registers them on the runtime
 * at first injection.
 *
 * Each Angular DI shim service (ConversationAgentService, ConversationStreamingService,
 * etc.) takes `ConversationsRuntimeBootstrap` as a constructor dependency so the
 * adapters are guaranteed registered before any shim method is called. Because
 * the bootstrap is `providedIn: 'root'`, the registration happens exactly once
 * per app, on the first injection of any shim.
 */

import { Injectable } from '@angular/core';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import { ActiveTasksService } from './active-tasks.service';

@Injectable({ providedIn: 'root' })
export class ConversationsRuntimeBootstrap {
    constructor(activeTasks: ActiveTasksService) {
        const runtime = ConversationsRuntime.Instance;

        // INotificationAdapter — bridge to MJNotificationService.CreateSimpleNotification.
        // Our NotificationLevel ('info' | 'success' | 'warning' | 'error') maps directly
        // to MJNotificationService's style values, so no translation is needed.
        runtime.UseNotificationAdapter({
            Notify: (level, message, ttlMs) => {
                MJNotificationService.Instance?.CreateSimpleNotification(
                    message,
                    level,
                    ttlMs ?? 5_000
                );
            },
        });

        // IActiveTaskTracker — bridge to ActiveTasksService.removeByAgentRunId.
        runtime.UseActiveTaskTracker({
            RemoveByAgentRunId: (agentRunId) => activeTasks.removeByAgentRunId(agentRunId),
        });
    }
}
