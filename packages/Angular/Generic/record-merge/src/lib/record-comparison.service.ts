/**
 * @fileoverview Thin Angular wrapper over the server-side record-comparison capability.
 *
 * The field-delta computation runs server-side via
 * `@memberjunction/core-entities-server`'s `RecordComparisonEngine`, reached through
 * the typed {@link GraphQLRecordComparisonClient} transport. This service does nothing
 * but resolve the GraphQL provider (multi-provider aware) and delegate — it never
 * inlines `gql`, never touches the engine, and holds no state.
 *
 * Mirrors the server-delegation half of {@link ClusteringService}.
 */

import { Injectable } from '@angular/core';
import { IMetadataProvider, Metadata } from '@memberjunction/core';
import {
    GraphQLDataProvider,
    GraphQLRecordComparisonClient,
    GetRecordComparisonInput,
    GetRecordComparisonResult,
} from '@memberjunction/graphql-dataprovider';

@Injectable({ providedIn: 'root' })
export class RecordComparisonService {
    /**
     * Compute a field-level comparison of a set of records on the server.
     *
     * The provider is resolved per multi-provider rules: the caller may pass an explicit
     * {@link IMetadataProvider}; otherwise the global `Metadata.Provider` is used. The
     * provider must be a {@link GraphQLDataProvider} (the browser transport); when it is
     * not, this method returns `null` so callers can branch (e.g. compute in-browser or
     * skip). The underlying client never throws — on a server-side failure it returns a
     * `{ Success: false, ErrorMessage }` result.
     *
     * @param input    The entity, keys (column 0 = survivor/reference), and optional field include-list.
     * @param provider Optional metadata provider to scope the request to a specific server.
     * @returns The typed comparison result, or `null` when no GraphQL provider is available.
     */
    public async GetRecordComparison(
        input: GetRecordComparisonInput,
        provider?: IMetadataProvider | null,
    ): Promise<GetRecordComparisonResult | null> {
        const gqlProvider = this.resolveGraphQLProvider(provider);
        if (!gqlProvider) {
            return null;
        }
        const client = new GraphQLRecordComparisonClient(gqlProvider);
        return client.GetRecordComparison(input);
    }

    /**
     * Resolve a {@link GraphQLDataProvider} from the supplied provider (or the global
     * default). Returns `null` when the active provider is not a GraphQL provider.
     */
    private resolveGraphQLProvider(provider?: IMetadataProvider | null): GraphQLDataProvider | null {
        const p = provider ?? Metadata.Provider;
        return p instanceof GraphQLDataProvider ? p : null;
    }
}
