/**
 * @fileoverview An {@link IClusterVectorSource} backed by MJ Entity Record
 * Documents.
 *
 * Reads persisted embeddings from `MJ: Entity Record Documents.VectorJSON` via
 * RunView. Works anywhere a metadata provider is configured (server or client),
 * because it goes through the standard RunView path rather than raw SQL. When an
 * `EntityDocumentID` is not supplied, the first active Entity Document for the
 * config's entity is resolved automatically.
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
        const entityDocumentID = await this.resolveEntityDocumentID(config);
        if (!entityDocumentID) {
            LogError('EntityDocumentVectorSource: could not resolve an Entity Document ID to source vectors from.');
            return [];
        }

        const records = await this.fetchRecords(entityDocumentID, config);
        return this.toInputVectors(records);
    }

    /** Resolve the Entity Document ID, defaulting to the first active doc for the entity. */
    private async resolveEntityDocumentID(config: ClusterConfig): Promise<string | null> {
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

    /** Fetch the entity record documents that carry vector JSON. */
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
                Metadata: { EntityID: r.EntityID, EntityDocumentID: r.EntityDocumentID },
            });
        }
        return vectors;
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
