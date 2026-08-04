/**
 * @fileoverview Thin Angular wrapper over the server-side record-comparison capability.
 *
 * The field-delta computation runs server-side via `@memberjunction/record-comparison`'s
 * `RecordComparisonEngine`, reached through the `RecordComparison.Compare` **Remote Operation**.
 * This service does nothing but resolve the provider (multi-provider aware) and invoke the typed
 * operation — it never inlines `gql`, never touches the engine, and holds no state. The Remote
 * Operation marshals over the generic `ExecuteRemoteOperation` transport on the client and runs
 * in-process on the server, so there is no bespoke resolver/client to maintain.
 */

import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata, RemoteOpResult } from '@memberjunction/core';
import {
    RecordComparisonCompareOperation,
    type RecordComparisonCompareInput,
    type RecordComparisonCompareOutput,
} from '@memberjunction/core-entities';

@Injectable({ providedIn: 'root' })
export class RecordComparisonService {
    /**
     * Compute a field-level comparison of a set of records on the server.
     *
     * The provider is resolved per multi-provider rules: the caller may pass an explicit
     * {@link IMetadataProvider}; otherwise the global `Metadata.Provider` is used. The operation
     * never throws for logical failures — inspect `result.Success` / `result.ErrorMessage`, and
     * read the typed payload from `result.Output`.
     *
     * @param input    The entity, keys (column 0 = survivor/reference), and optional field include-list.
     * @param provider Optional metadata provider to scope the request to a specific server.
     * @returns The wrapped typed comparison result.
     */
    public async GetRecordComparison(
        input: RecordComparisonCompareInput,
        provider?: IMetadataProvider | null,
    ): Promise<RemoteOpResult<RecordComparisonCompareOutput>> {
        const p = provider ?? Metadata.Provider;
        return new RecordComparisonCompareOperation().Execute(input, { provider: p ?? undefined });
    }
}
