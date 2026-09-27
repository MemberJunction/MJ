import { LegacyQueueRouterRegistry } from '@memberjunction/queue';
import { WorkQueueLegacyRouter } from './WorkQueueLegacyRouter';

let registeredRouter: WorkQueueLegacyRouter | null = null;

/**
 * Installs the work-queue router into @memberjunction/queue's routing seam. Idempotent. Runs as an import side
 * effect of this package's entry point, so a server opts in simply by importing the package (ServerBootstrap's
 * class-registration manifest does).
 */
export function RegisterLegacyQueueBridge(): void {
    if (registeredRouter && LegacyQueueRouterRegistry.Instance.Router === registeredRouter) {
        return;
    }
    registeredRouter = new WorkQueueLegacyRouter();
    LegacyQueueRouterRegistry.Instance.Register(registeredRouter);
}
