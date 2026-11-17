import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

let sharedWorkerRegistered = false;

/**
 * Registers the browser `SharedWorker` factory on {@link GraphQLDataProvider} at Explorer
 * bootstrap so open tabs share one origin WebSocket, L1 cache, and IndexedDB owner.
 * When `SharedWorker` is unsupported (e.g. mobile Safari) or disabled, {@link GraphQLDataProvider}
 * automatically falls back to `BroadcastChannel` + Web Locks.
 */
export function RegisterSharedTabKernelWorker(): void {
    if (sharedWorkerRegistered) {
        return;
    }
    sharedWorkerRegistered = true;

    GraphQLDataProvider.SetSharedWorkerFactory(() => {
        if (typeof SharedWorker === 'undefined') {
            return null;
        }
        // Category 1 / Angular bundler-required worker URL form: literal `new URL(..., import.meta.url)`
        // lets `@angular/build` emit the isolated ES module worker chunk automatically.
        return new SharedWorker(new URL('./shared-tab-kernel.worker', import.meta.url), {
            type: 'module',
            name: 'mj-shared-tab-kernel',
        });
    });
}
