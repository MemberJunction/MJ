/**
 * @fileoverview A trivial in-memory {@link IClusterVectorSource}.
 *
 * Useful for tests, demos, and callers that already have vectors in hand and
 * just want to run the engine pipeline over them. Server / client transport
 * adapters (fetching from Entity Document Runs over SQL or GraphQL) are wired
 * in separate increments — this provides the clean seam in the meantime.
 */

import { ClusterConfig, ClusterInputVector, IClusterVectorSource } from '../types';

/**
 * An {@link IClusterVectorSource} backed by an in-memory array of vectors.
 * Honors the config's `MaxRecords` cap.
 */
export class InMemoryVectorSource implements IClusterVectorSource {
    /**
     * @param vectors The vectors to serve.
     */
    constructor(private readonly vectors: ClusterInputVector[]) {}

    /** @inheritdoc */
    public async FetchVectors(config: ClusterConfig): Promise<ClusterInputVector[]> {
        const max = config.MaxRecords && config.MaxRecords > 0 ? config.MaxRecords : this.vectors.length;
        return this.vectors.slice(0, max);
    }
}
