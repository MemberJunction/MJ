import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJVersionLabelEntity } from '@memberjunction/core-entities';
import { CreateLabelParams, LabelFilter, VersionLabelStatus } from './types';
import {
    ENTITY_VERSION_LABELS,
    sqlEquals,
    sqlContains,
    loadEntityById,
} from './constants';

/**
 * Manages the lifecycle of version labels: creation, querying, archiving,
 * and status updates. Does NOT handle snapshot capture — that is delegated
 * to SnapshotBuilder by the VersionHistoryEngine facade.
 */
export class LabelManager {
    /**
     * Create a new version label and persist it. Does not capture any snapshot
     * items — the caller (VersionHistoryEngine) handles that separately.
     */
    public async CreateLabel(params: CreateLabelParams, contextUser: UserInfo): Promise<MJVersionLabelEntity> {
        this.validateCreateParams(params);

        const md = new Metadata();
        const label = await md.GetEntityObject<MJVersionLabelEntity>(ENTITY_VERSION_LABELS, contextUser);

        label.Name = params.Name;
        label.Description = params.Description ?? null;
        label.Scope = params.Scope ?? 'Record';
        label.CreatedByUserID = contextUser.ID;
        label.ExternalSystemID = params.ExternalSystemID ?? null;
        label.ParentID = params.ParentID ?? null;
        label.Status = 'Active';

        this.applyEntityScope(label, params, md);
        this.applyRecordScope(label, params);

        const saved = await label.Save();
        if (!saved) {
            throw new Error(`Failed to save version label '${params.Name}'`);
        }

        LogStatus(`VersionHistory: Created label '${params.Name}' (${label.ID}) with scope ${label.Scope}`);
        return label;
    }

    /**
     * Load a single version label by ID.
     */
    public async GetLabel(labelId: string, contextUser: UserInfo): Promise<MJVersionLabelEntity> {
        const label = await loadEntityById<MJVersionLabelEntity>(ENTITY_VERSION_LABELS, labelId, contextUser);
        if (!label) {
            throw new Error(`Version label '${labelId}' not found`);
        }
        return label;
    }

    /**
     * Query version labels with optional filters.
     */
    public async GetLabels(filter: LabelFilter, contextUser: UserInfo): Promise<MJVersionLabelEntity[]> {
        const rv = new RunView();
        const filterParts = this.buildFilterClauses(filter);
        const extraFilter = filterParts.length > 0 ? filterParts.join(' AND ') : '';
        const orderBy = filter.OrderBy ?? '__mj_CreatedAt DESC';
        const maxRows = filter.MaxResults ?? 100;

        const result = await rv.RunView<MJVersionLabelEntity>({
            EntityName: ENTITY_VERSION_LABELS,
            ExtraFilter: extraFilter,
            OrderBy: orderBy,
            MaxRows: maxRows,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success) {
            LogError(`LabelManager.GetLabels failed: ${result.ErrorMessage}`);
            return [];
        }

        return result.Results;
    }

    /**
     * Archive a label (set status to Archived).
     */
    public async ArchiveLabel(labelId: string, contextUser: UserInfo): Promise<boolean> {
        return this.updateLabelStatus(labelId, 'Archived', contextUser);
    }

    /**
     * Mark a label as having been used for a restore.
     */
    public async MarkLabelRestored(labelId: string, contextUser: UserInfo): Promise<boolean> {
        return this.updateLabelStatus(labelId, 'Restored', contextUser);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private validateCreateParams(params: CreateLabelParams): void {
        if (!params.Name || params.Name.trim().length === 0) {
            throw new Error('Version label Name is required');
        }
        if (params.Scope === 'Entity' && !params.EntityName) {
            throw new Error('Entity scope requires EntityName');
        }
        if (params.Scope === 'Record') {
            if (!params.EntityName) throw new Error('Record scope requires EntityName');
            if (!params.RecordKey) throw new Error('Record scope requires RecordKey');
        }
    }

    private applyEntityScope(label: MJVersionLabelEntity, params: CreateLabelParams, md: Metadata): void {
        if (params.EntityName && (params.Scope === 'Entity' || params.Scope === 'Record')) {
            const entityInfo = md.EntityByName(params.EntityName);
            if (!entityInfo) {
                throw new Error(`Entity '${params.EntityName}' not found in metadata`);
            }
            label.EntityID = entityInfo.ID;
        }
    }

    private applyRecordScope(label: MJVersionLabelEntity, params: CreateLabelParams): void {
        if (params.RecordKey && params.Scope === 'Record') {
            label.RecordID = params.RecordKey.ToConcatenatedString();
        }
    }

    private async updateLabelStatus(
        labelId: string,
        status: VersionLabelStatus,
        contextUser: UserInfo
    ): Promise<boolean> {
        const label = await this.GetLabel(labelId, contextUser);
        label.Status = status;
        const saved = await label.Save();
        if (!saved) {
            LogError(`LabelManager: Failed to update label '${labelId}' to status '${status}'`);
            return false;
        }
        LogStatus(`VersionHistory: Label '${label.Name}' (${labelId}) status updated to ${status}`);
        return true;
    }

    /**
     * Build safe SQL filter clauses from a LabelFilter.
     * Uses escapeSqlString for all user-supplied values.
     */
    private buildFilterClauses(filter: LabelFilter): string[] {
        const clauses: string[] = [];

        if (filter.Scope) {
            clauses.push(sqlEquals('Scope', filter.Scope));
        }
        if (filter.Status) {
            clauses.push(sqlEquals('Status', filter.Status));
        }
        if (filter.EntityName) {
            const md = new Metadata();
            const entityInfo = md.EntityByName(filter.EntityName);
            if (entityInfo) {
                clauses.push(sqlEquals('EntityID', entityInfo.ID));
            }
        }
        if (filter.RecordID) {
            clauses.push(sqlEquals('RecordID', filter.RecordID));
        }
        if (filter.CreatedByUserID) {
            clauses.push(sqlEquals('CreatedByUserID', filter.CreatedByUserID));
        }
        if (filter.NameContains) {
            clauses.push(sqlContains('Name', filter.NameContains));
        }

        return clauses;
    }
}
