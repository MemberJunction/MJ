/**
 * @fileoverview Capability checks on a metadata provider that `IMetadataProvider` does not declare, and the isolated
 * unit of work shared by transactional metadata consumers and the Record Set Processor's write-back.
 * @module @memberjunction/record-set-processor-base
 */
import { DatabaseProviderBase, type IEntityDataProvider, type IMetadataProvider } from '@memberjunction/core';

/** A metadata provider that also exposes the entity-transaction members of `IEntityDataProvider`. */
export type TransactionalMetadataProvider = IMetadataProvider & Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'>;

/** Capability checks on a metadata provider, and the isolated unit of work built on them. */
export class MetadataProviderCapabilities {
    /** Whether the provider exposes the entity-transaction members (a database provider does). */
    public static IsTransactionalProvider(p: IMetadataProvider): p is TransactionalMetadataProvider {
        return 'BeginEntityTransaction' in p && typeof p.BeginEntityTransaction === 'function';
    }

    /**
     * Runs one unit of work (a record's write-back, a version-registry lock) on its own provider instance
     * (`CreateIndependentInstance`, released afterwards), so no other statement on the shared provider lands in its
     * transaction. When the caller is in a transaction on `provider` (another scope's transaction does not count), the
     * unit joins it as a savepoint and the caller owns atomicity; a provider that is not a `DatabaseProviderBase` (a
     * client provider) runs the unit on itself.
     * @param provider - the caller's provider
     * @param work - the unit, given the provider every read, save and the transaction must use
     */
    public static async RunIsolated<T>(provider: IMetadataProvider, work: (unitProvider: IMetadataProvider) => Promise<T>): Promise<T> {
        // The transaction members live on DatabaseProviderBase; any other provider (a client provider) runs the unit on itself.
        if (!(provider instanceof DatabaseProviderBase) || (provider.CapturePostCommitToken()?.Epoch ?? null) !== null) {
            return work(provider);
        }
        const unit = await provider.CreateIndependentInstance();
        try {
            return await work(unit);
        } finally {
            await unit.ReleaseIndependentInstance();
        }
    }
}
