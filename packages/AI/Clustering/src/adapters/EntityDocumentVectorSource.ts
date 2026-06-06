/**
 * @fileoverview An {@link IClusterVectorSource} backed by MJ Entity Record
 * Documents.
 *
 * Reads persisted embeddings from `MJ: Entity Record Documents.VectorJSON` via
 * RunView. Works anywhere a metadata provider is configured (server or client),
 * because it goes through the standard RunView path rather than raw SQL.
 *
 * Supports both single-document and **multi-entity-document** clustering. When
 * {@link ClusterConfig.EntityDocumentIDs} contains more than one ID, vectors from
 * all of them are merged into one analysis — but only after validating they share
 * the same embedding model + dimensionality. Incompatible combinations are
 * hard-blocked (an Error is thrown) rather than producing a meaningless layout,
 * because vectors from different embedding spaces are not co-clusterable.
 */

import { RunView, UserInfo, LogError, Metadata } from '@memberjunction/core';
import {
    MJEntityRecordDocumentEntity,
    MJEntityDocumentEntity,
} from '@memberjunction/core-entities';
import { ClusterConfig, ClusterInputVector, IClusterVectorSource } from '../types';

/**
 * Fetches clustering input vectors from persisted Entity Record Documents.
 */
export class EntityDocumentVectorSource implements IClusterVectorSource {
    /**
     * @param contextUser User context for the RunView calls (required server-side).
     */
    constructor(private readonly contextUser?: UserInfo) {}

    /** @inheritdoc */
    public async FetchVectors(config: ClusterConfig): Promise<ClusterInputVector[]> {
        const entityDocumentIDs = await this.resolveEntityDocumentIDs(config);
        if (entityDocumentIDs.length === 0) {
            LogError('EntityDocumentVectorSource: could not resolve any Entity Document ID to source vectors from.');
            return [];
        }

        // Multi-entity hard-block: refuse to merge incompatible embedding spaces.
        if (entityDocumentIDs.length > 1) {
            await this.assertCompatibleDocuments(entityDocumentIDs);
        }

        const vectors: ClusterInputVector[] = [];
        for (const docID of entityDocumentIDs) {
            const records = await this.fetchRecords(docID, config);
            vectors.push(...this.toInputVectors(records));
        }

        // Runtime safety net: even with the same model, refuse a mixed-length set.
        this.assertUniformDimensionality(vectors);
        return vectors;
    }

    /**
     * Resolve the set of Entity Document IDs to source vectors from. Prefers the
     * explicit multi-doc list; falls back to the single ID; finally resolves the
     * first active document for the config's entity.
     */
    private async resolveEntityDocumentIDs(config: ClusterConfig): Promise<string[]> {
        if (config.EntityDocumentIDs && config.EntityDocumentIDs.length > 0) {
            return config.EntityDocumentIDs.filter((id) => !!id && id.trim().length > 0);
        }
        const single = await this.resolveSingleEntityDocumentID(config);
        return single ? [single] : [];
    }

    /** Resolve a single Entity Document ID, defaulting to the first active doc for the entity. */
    private async resolveSingleEntityDocumentID(config: ClusterConfig): Promise<string | null> {
        if (config.EntityDocumentID) {
            return config.EntityDocumentID;
        }
        if (!config.EntityName && !config.EntityID) {
            return null;
        }

        const filterParts: string[] = [`Status = 'Active'`];
        if (config.EntityID) {
            filterParts.push(`EntityID = '${config.EntityID}'`);
        } else if (config.EntityName) {
            const md = new Metadata();
            const entity = md.EntityByName(config.EntityName);
            if (!entity) {
                return null;
            }
            filterParts.push(`EntityID = '${entity.ID}'`);
        }

        const rv = new RunView();
        const result = await rv.RunView<MJEntityDocumentEntity>(
            {
                EntityName: 'MJ: Entity Documents',
                ExtraFilter: filterParts.join(' AND '),
                OrderBy: '__mj_CreatedAt ASC',
                MaxRows: 1,
                ResultType: 'simple',
            },
            this.contextUser,
        );
        if (!result.Success || result.Results.length === 0) {
            return null;
        }
        return result.Results[0].ID;
    }

    /**
     * Validate that all selected Entity Documents share the same embedding model
     * (AIModelID). Throws a descriptive Error on mismatch — the caller surfaces it
     * to the user instead of running clustering over incomparable vectors.
     */
    private async assertCompatibleDocuments(docIDs: string[]): Promise<void> {
        const idList = docIDs.map((id) => `'${id}'`).join(', ');
        const rv = new RunView();
        const result = await rv.RunView<MJEntityDocumentEntity>(
            {
                EntityName: 'MJ: Entity Documents',
                ExtraFilter: `ID IN (${idList})`,
                ResultType: 'simple',
            },
            this.contextUser,
        );
        if (!result.Success) {
            throw new Error(`Could not validate selected entity documents: ${result.ErrorMessage}`);
        }

        const docs = result.Results;
        const distinctModels = new Set(docs.map((d) => (d.AIModelID || '').toLowerCase()));
        if (distinctModels.size > 1) {
            const summary = docs.map((d) => `"${d.Name}" (${d.AIModel || 'unknown model'})`).join(', ');
            throw new Error(
                `Cannot cluster across documents that use different embedding models — their vectors live in ` +
                `different spaces and are not comparable. Selected: ${summary}. ` +
                `Choose documents that all use the same embedding model.`,
            );
        }
    }

    /** Fetch the entity record documents that carry vector JSON for one document. */
    private async fetchRecords(
        entityDocumentID: string,
        config: ClusterConfig,
    ): Promise<MJEntityRecordDocumentEntity[]> {
        const filterParts: string[] = [`EntityDocumentID = '${entityDocumentID}'`, `VectorJSON IS NOT NULL`];
        if (config.Filter && config.Filter.trim().length > 0) {
            filterParts.push(`(${config.Filter.trim()})`);
        }

        const rv = new RunView();
        const result = await rv.RunView<MJEntityRecordDocumentEntity>(
            {
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: filterParts.join(' AND '),
                MaxRows: config.MaxRecords && config.MaxRecords > 0 ? config.MaxRecords : 5000,
                ResultType: 'simple',
            },
            this.contextUser,
        );
        if (!result.Success) {
            LogError(`EntityDocumentVectorSource: RunView failed: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /** Convert record documents to input vectors, parsing VectorJSON. */
    private toInputVectors(records: MJEntityRecordDocumentEntity[]): ClusterInputVector[] {
        const vectors: ClusterInputVector[] = [];
        for (const r of records) {
            const parsed = this.parseVector(r.VectorJSON);
            if (!parsed) {
                continue;
            }
            vectors.push({
                Key: r.RecordID,
                Vector: parsed,
                Label: r.RecordID,
                // EntityName is surfaced so the renderer can color points by source
                // entity (the "color by entity" legend mode for multi-entity runs).
                Metadata: { EntityID: r.EntityID, EntityName: r.Entity, EntityDocumentID: r.EntityDocumentID },
            });
        }
        return vectors;
    }

    /**
     * Throw if the merged vector set contains more than one vector length —
     * different dimensionalities cannot be projected/clustered together. This is a
     * runtime safety net behind the model-equality check in
     * {@link assertCompatibleDocuments}.
     */
    private assertUniformDimensionality(vectors: ClusterInputVector[]): void {
        if (vectors.length === 0) {
            return;
        }
        const lengths = new Set(vectors.map((v) => v.Vector.length));
        if (lengths.size > 1) {
            const sizes = [...lengths].sort((a, b) => a - b).join(', ');
            throw new Error(
                `Cannot cluster vectors of differing dimensionality (found lengths: ${sizes}). ` +
                `All selected documents must use the same embedding model.`,
            );
        }
    }

    /** Parse a VectorJSON string into a number[] of finite values, or null. */
    private parseVector(json: string | null): number[] | null {
        if (!json) {
            return null;
        }
        try {
            const parsed: unknown = JSON.parse(json);
            if (!Array.isArray(parsed)) {
                return null;
            }
            const nums = parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
            return nums.length > 0 ? nums : null;
        } catch {
            return null;
        }
    }
}
