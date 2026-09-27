import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';

/**
 * Seam that lets a server move legacy queue tasks onto durable infrastructure without this package depending on
 * it. @memberjunction/work-queue-legacy-bridge registers the implementation; a process that never imports the
 * bridge (CodeGen, the CLI) has no router and runs every task in-process, exactly as before.
 */
export interface ILegacyQueueRouter {
    /**
     * Resolves true when the task was durably accepted elsewhere and must NOT also run in-process. Resolves false
     * (and must have committed nothing) when the task should run on the in-process queue.
     */
    TryRoute(queueTypeName: string, data: unknown, options: unknown, contextUser: UserInfo): Promise<boolean>;
}

export class LegacyQueueRouterRegistry extends BaseSingleton<LegacyQueueRouterRegistry> {
    private router: ILegacyQueueRouter | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): LegacyQueueRouterRegistry {
        return super.getInstance<LegacyQueueRouterRegistry>();
    }

    public get Router(): ILegacyQueueRouter | null {
        return this.router;
    }

    /** At most one router is held; registering again replaces the earlier one. */
    public Register(router: ILegacyQueueRouter): void {
        if (this.router && this.router !== router) {
            LogStatus('[QueueManager] The legacy queue router was replaced by a later registration');
        }
        this.router = router;
    }

    public Clear(): void {
        this.router = null;
    }

    public async TryRoute(queueTypeName: string, data: unknown, options: unknown, contextUser: UserInfo): Promise<boolean> {
        if (!this.router) {
            return false;
        }
        try {
            return await this.router.TryRoute(queueTypeName, data, options, contextUser);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`[QueueManager] The legacy queue router failed for '${queueTypeName}' (${message}); running in-process`);
            return false;
        }
    }
}
