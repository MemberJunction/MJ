/**
 * @fileoverview Concurrency-safe Node.js `AsyncLocalStorage` tracker for {@link ServerOperationScopeManager}.
 *
 * `@memberjunction/core` runs in browser bundles and therefore defaults to a browser-safe stack tracker.
 * On Node.js servers, `@memberjunction/generic-database-provider` statically imports `AsyncLocalStorage`
 * from `node:async_hooks` (matching `TransactionAffinity`) and installs {@link NodeAsyncServerOperationScopeTracker}
 * on `ServerOperationScopeManager.Instance` at module load so concurrent requests never leak write authority
 * across interleaved async execution chains.
 *
 * @module @memberjunction/generic-database-provider
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type {
    IServerOperationScopeTracker,
    ServerOperationScopeFrame,
} from '@memberjunction/core';

export class NodeAsyncServerOperationScopeTracker implements IServerOperationScopeTracker {
    private readonly _storage = new AsyncLocalStorage<ReadonlyArray<ServerOperationScopeFrame>>();

    public RunInScope<T>(frame: ServerOperationScopeFrame, fn: () => T): T {
        const current = this._storage.getStore() ?? [];
        const nextFrames: ReadonlyArray<ServerOperationScopeFrame> = [...current, frame];
        return this._storage.run(nextFrames, fn);
    }

    public GetActiveFrames(): ReadonlyArray<ServerOperationScopeFrame> {
        return this._storage.getStore() ?? [];
    }
}
