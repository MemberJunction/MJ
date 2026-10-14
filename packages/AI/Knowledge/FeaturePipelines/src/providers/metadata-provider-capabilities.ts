/**
 * @fileoverview Capability checks on a metadata provider that `IMetadataProvider` does not declare, and the isolated
 * unit of work. Shared by the Feature Pipeline version registry and the Record Set Processor's write-back, which both
 * run a unit of work in an entity transaction on its own provider instance.
 * @module @memberjunction/feature-pipelines
 */
import { DatabaseProviderBase, type IEntityDataProvider, type IMetadataProvider } from '@memberjunction/core';

/** A metadata provider that also exposes the entity-transaction members of `IEntityDataProvider`. */
export type TransactionalMetadataProvider = IMetadataProvider & Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'>;

/**
 * Capability checks on a metadata provider, and the isolated unit of work built on them ({@link RunIsolated}: runs work
 * on its own provider instance unless the caller already holds a transaction). Every method is static.
 */
export class MetadataProviderCapabilities {
    /**
     * Whether the provider exposes the entity-transaction members (`SupportsEntityTransactions` and
     * `BeginEntityTransaction`; a database provider does, `IMetadataProvider` does not declare them).
     * `RunInEntityTransaction` then decides from `SupportsEntityTransactions` whether a transaction is actually opened;
     * a provider without the members runs the work untransacted.
     * @param p - the provider the unit of work runs on
     */
    public static IsTransactionalProvider(p: IMetadataProvider): p is TransactionalMetadataProvider {
        return 'BeginEntityTransaction' in p && typeof p.BeginEntityTransaction === 'function';
    }

    /**
     * Picks the provider one unit of work runs on (a record's write-back, a Feature Pipeline version-registry lock), and
     * runs it:
     *
     * - **A `DatabaseProviderBase` on which the caller holds a transaction** (`TransactionDepth > 0`): the unit runs on
     *   `provider` and its transaction joins the caller's as a savepoint, as `RunInWorkQueueTransaction` does with a
     *   caller executor. The caller then owns atomicity: the unit's failure rolls back to its savepoint and rethrows, and nothing it wrote is
     *   durable until the caller commits. Joining is required, not a preference: on a separate connection the unit
     *   would wait on rows the caller's open transaction has locked (the record the caller wrote, a lookup row created
     *   on `provider`) until the request timeout, since the caller cannot commit while it awaits the unit.
     * - **Any other `DatabaseProviderBase`**: the unit runs on its own instance from
     *   `DatabaseProviderBase.CreateIndependentInstance()` — same connection pool, its own transaction stack — released
     *   afterwards (`ReleaseIndependentInstance`, which rolls back anything left open and never closes the pool). Why:
     *   MJ's ambient transaction is a field of the provider instance. Opened on the caller's shared provider, it would
     *   take in every statement anyone else runs through that instance while it is open — another record's
     *   write-back, the run tracker's detail rows, watermark updates — and a rollback would undo them too, after they
     *   were reported done. On its own instance nothing else can join it, so concurrent records need no lock.
     *   The instance's metadata is NOT taken from `provider`: `CreateIndependentInstance` takes no argument and the new
     *   instance's `Config` adopts the process-global `Metadata.Provider`'s loaded metadata (or loads it in full when no
     *   global provider is registered). Every server host registers a global provider on the same database, so this is
     *   the same metadata there.
     *   A `DatabaseProviderBase` subclass that has not implemented `CreateIndependentInstance` throws from the base
     *   class; that error propagates — a loud failure, never a silent fallback to the shared transaction.
     * - **A provider that is not a `DatabaseProviderBase`** (a client provider such as `GraphQLDataProvider`, which has
     *   no local transaction to protect): the unit runs on `provider`.
     * @param provider - the caller's provider
     * @param work - the unit, given the provider every read, save and the transaction must use
     */
    public static async RunIsolated<T>(provider: IMetadataProvider, work: (unitProvider: IMetadataProvider) => Promise<T>): Promise<T> {
        // The transaction members live on DatabaseProviderBase; any other provider (a client provider) runs the unit on itself.
        if (!(provider instanceof DatabaseProviderBase) || provider.TransactionDepth > 0) {
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
