/**
 * @module describe-entity.action
 * @description Returns detailed column-level metadata for a given entity.
 *
 * Useful for agents that need to inspect an existing entity before deciding
 * whether to modify it, or for display in the Database Designer UI.
 */

import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RunView, Metadata } from '@memberjunction/core';

import { escapeSqlLiteral } from '@memberjunction/database-designer-core';

import { BaseDatabaseDesignerAction } from './base-database-designer.action.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnInfo {
    Name: string;
    Type: string;
    IsNullable: boolean;
    MaxLength: number | null;
    Description: string | null;
    IsRequired: boolean;
}

interface EntityInfo {
    EntityID: string;
    EntityName: string;
    SchemaName: string;
    TableName: string;
    Description: string | null;
    Columns: ColumnInfo[];
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Describes a MemberJunction entity including all its columns.
 *
 * Input params — supply exactly one identifier:
 *  - `EntityID`   — The entity UUID.
 *  - `EntityName` — The human-readable entity name (e.g. "Project Milestones").
 *  - `TableName`  — The physical table name.  Optionally combine with
 *                   `SchemaName` to narrow by schema.
 *
 * Output params:
 *  - `EntityInfo` — Full EntityInfo object (see above) or null if not found.
 */
@RegisterClass(BaseAction, 'Describe Entity')
export class DescribeEntityAction extends BaseDatabaseDesignerAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const entityID = this.getStringParam(params, 'EntityID');
            const entityName = this.getStringParam(params, 'EntityName');
            const tableName = this.getStringParam(params, 'TableName');
            const schemaName = this.getStringParam(params, 'SchemaName');

            if (!entityID && !entityName && !tableName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'Provide at least one of: EntityID, EntityName, or TableName.',
                };
            }

            const entityInfo = await this.findEntity(entityID, entityName, tableName, schemaName, params);

            if (!entityInfo) {
                this.addOutputParam(params, 'EntityInfo', null);
                return {
                    Success: false,
                    ResultCode: 'ENTITY_NOT_FOUND',
                    Message: 'No entity was found matching the provided identifiers.',
                };
            }

            this.addOutputParam(params, 'EntityInfo', entityInfo);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Entity '${entityInfo.EntityName}' found with ${entityInfo.Columns.length} column(s).`,
            };
        } catch (err) {
            return this.handleUnexpected(err, 'Describe Entity');
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    /** Resolve the entity using whichever identifier the caller supplied. */
    private async findEntity(
        entityID: string | undefined,
        entityName: string | undefined,
        tableName: string | undefined,
        schemaName: string | undefined,
        params: RunActionParams
    ): Promise<EntityInfo | null> {
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment

        // Fast path: look up by ID or name in the in-memory metadata cache.
        let entity = entityID
            ? md.Entities.find(e => UUIDsEqual(e.ID, entityID))
            : entityName
            ? md.Entities.find(e => e.Name.toLowerCase() === entityName.toLowerCase())
            : md.Entities.find(
                e =>
                    e.BaseTable.toLowerCase() === (tableName ?? '').toLowerCase() &&
                    (!schemaName || (e.SchemaName ?? '').toLowerCase() === schemaName.toLowerCase())
            );

        if (!entity) return null;

        // Load columns from Entity Fields via RunView.
        const columns = await this.loadEntityColumns(entity.ID, params);
        return {
            EntityID: entity.ID,
            EntityName: entity.Name,
            SchemaName: entity.SchemaName ?? '',
            TableName: entity.BaseTable ?? '',
            Description: entity.Description ?? null,
            Columns: columns,
        };
    }

    /** Load column definitions for a given entity ID. */
    private async loadEntityColumns(
        entityID: string,
        params: RunActionParams
    ): Promise<ColumnInfo[]> {
        const rv = new RunView();
        const result = await rv.RunView<{
            Name: string;
            Type: string;
            AllowsNull: boolean;
            MaxLength: number | null;
            Description: string | null;
            IsRequired: boolean;
        }>({
            EntityName: 'MJ: Entity Fields',
            ExtraFilter: `EntityID = '${escapeSqlLiteral(entityID)}'`,
            Fields: ['Name', 'Type', 'AllowsNull', 'MaxLength', 'Description', 'IsRequired'],
            OrderBy: 'Sequence ASC',
            ResultType: 'simple',
        }, params.ContextUser);

        if (!result.Success) return [];

        return result.Results.map(f => ({
            Name: f.Name,
            Type: f.Type,
            IsNullable: f.AllowsNull,
            MaxLength: f.MaxLength,
            Description: f.Description,
            IsRequired: f.IsRequired,
        }));
    }
}
