import { BaseEntity, CompositeKey, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { CreateLabelParams, LabelFilter, VersionLabelStatus } from './types';

/**
 * Entity name constants. These entities are created by the version label
 * migration and will get CodeGen-generated subclasses in a future run.
 * Until then we work with BaseEntity generically.
 */
const ENTITY_VERSION_LABELS = 'MJ: Version Labels';

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
    public async CreateLabel(params: CreateLabelParams, contextUser: UserInfo): Promise<BaseEntity> {
        const md = new Metadata();
        const label = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABELS, contextUser);

        label.Set('Name', params.Name);
        label.Set('Description', params.Description ?? null);
        label.Set('Scope', params.Scope ?? 'System');
        label.Set('CreatedByUserID', contextUser.ID);
        label.Set('ExternalSystemID', params.ExternalSystemID ?? null);
        label.Set('Status', 'Active');

        if (params.EntityName && (params.Scope === 'Entity' || params.Scope === 'Record')) {
            const entityInfo = md.EntityByName(params.EntityName);
            if (!entityInfo) {
                throw new Error(`Entity '${params.EntityName}' not found in metadata`);
            }
            label.Set('EntityID', entityInfo.ID);
        }

        if (params.RecordKey && params.Scope === 'Record') {
            label.Set('RecordID', params.RecordKey.ToConcatenatedString());
        }

        const saved = await label.Save();
        if (!saved) {
            throw new Error(`Failed to save version label '${params.Name}'`);
        }

        LogStatus(`VersionHistory: Created label '${params.Name}' (${label.Get('ID')}) with scope ${label.Get('Scope')}`);
        return label;
    }

    /**
     * Load a single version label by ID.
     */
    public async GetLabel(labelId: string, contextUser: UserInfo): Promise<BaseEntity> {
        const md = new Metadata();
        const label = await md.GetEntityObject<BaseEntity>(ENTITY_VERSION_LABELS, contextUser);
        const loaded = await label.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: labelId }]));
        if (!loaded) {
            throw new Error(`Version label '${labelId}' not found`);
        }
        return label;
    }

    /**
     * Query version labels with optional filters.
     */
    public async GetLabels(filter: LabelFilter, contextUser: UserInfo): Promise<BaseEntity[]> {
        const rv = new RunView();
        const filterParts = this.buildFilterClauses(filter);
        const extraFilter = filterParts.length > 0 ? filterParts.join(' AND ') : '';
        const orderBy = filter.OrderBy ?? '__mj_CreatedAt DESC';
        const maxRows = filter.MaxResults ?? 100;

        const result = await rv.RunView<BaseEntity>({
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

    /**
     * Update a label's status.
     */
    private async updateLabelStatus(
        labelId: string,
        status: VersionLabelStatus,
        contextUser: UserInfo
    ): Promise<boolean> {
        const label = await this.GetLabel(labelId, contextUser);
        label.Set('Status', status);
        const saved = await label.Save();
        if (!saved) {
            LogError(`LabelManager: Failed to update label '${labelId}' to status '${status}'`);
            return false;
        }
        LogStatus(`VersionHistory: Label '${label.Get('Name')}' (${labelId}) status updated to ${status}`);
        return true;
    }

    /**
     * Build SQL filter clauses from a LabelFilter.
     */
    private buildFilterClauses(filter: LabelFilter): string[] {
        const clauses: string[] = [];

        if (filter.Scope) {
            clauses.push(`Scope = '${filter.Scope}'`);
        }
        if (filter.Status) {
            clauses.push(`Status = '${filter.Status}'`);
        }
        if (filter.EntityName) {
            const md = new Metadata();
            const entityInfo = md.EntityByName(filter.EntityName);
            if (entityInfo) {
                clauses.push(`EntityID = '${entityInfo.ID}'`);
            }
        }
        if (filter.RecordID) {
            clauses.push(`RecordID = '${filter.RecordID}'`);
        }
        if (filter.CreatedByUserID) {
            clauses.push(`CreatedByUserID = '${filter.CreatedByUserID}'`);
        }
        if (filter.NameContains) {
            clauses.push(`Name LIKE '%${filter.NameContains.replace(/'/g, "''")}%'`);
        }

        return clauses;
    }
}
