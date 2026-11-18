import type { IMetadataProvider } from '@memberjunction/core';
import type { WorkQueueProviderSource } from './BoundWorkHandler';

/** A provider that is its own connection-scoped instance over a shared pool, and can be given back. */
export interface IndependentProvider extends IMetadataProvider {
    ReleaseIndependentInstance(): Promise<void>;
}

/** A provider that can mint {@link IndependentProvider}s — `DatabaseProviderBase` on SQL Server and PostgreSQL. */
export interface IndependentProviderFactory {
    CreateIndependentInstance(): Promise<IndependentProvider>;
}

/**
 * Mints a connection-scoped provider for each delivery and releases it when the delivery settles (#6273). Use it when
 * deliveries run in parallel: handlers that share one provider share its transaction state, so their transactions
 * interleave. This is what MJAPI does per delivery; `mj queue work --concurrency N` uses it for N > 1.
 */
export class IndependentProviderSource implements WorkQueueProviderSource {
    constructor(private readonly base: IndependentProviderFactory) {}

    public async CreateProvider(): Promise<IMetadataProvider> {
        return this.base.CreateIndependentInstance();
    }

    public async ReleaseProvider(provider: IMetadataProvider): Promise<void> {
        if (IsIndependentProvider(provider)) {
            await provider.ReleaseIndependentInstance();
        }
    }
}

function IsIndependentProvider(provider: IMetadataProvider): provider is IndependentProvider {
    return 'ReleaseIndependentInstance' in provider && typeof provider.ReleaseIndependentInstance === 'function';
}
