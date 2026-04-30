/**
 * @module list-entities.action
 * @description Returns a summary list of entities created via the Database Designer.
 *
 * Queries MJ: Entity Settings for records with `MJ:UDT:Owner = contextUser.ID`
 * then joins with Entities metadata to build a human-readable summary.
 */

import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RunView, Metadata, UserInfo } from '@memberjunction/core';

import { UDT_SETTINGS, escapeSqlLiteral } from '@memberjunction/database-designer-core';

import { BaseDatabaseDesignerAction } from './base-database-designer.action.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntitySummary {
    EntityID: string;
    EntityName: string;
    SchemaName: string;
    TableName: string;
    Description: string | null;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Lists all entities created by the current user via the Database Designer.
 *
 * Input params: none — uses `ContextUser` for ownership lookup.
 *
 * Output params:
 *  - `Entities`     — Array of EntitySummary objects.
 *  - `EntityCount`  — Total number of entities owned by this user.
 */
@RegisterClass(BaseAction, 'List My Entities')
export class ListMyEntitiesAction extends BaseDatabaseDesignerAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const userID = params.ContextUser?.ID;
            if (!userID) {
                return {
                    Success: false,
                    ResultCode: 'NO_USER_CONTEXT',
                    Message: 'ContextUser is required to list owned entities.',
                };
            }

            const entities = await this.loadUserEntities(userID, params);

            this.addOutputParam(params, 'Entities', entities);
            this.addOutputParam(params, 'EntityCount', entities.length);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${entities.length} entity${entities.length === 1 ? '' : 'ies'} created by this user.`,
            };
        } catch (err) {
            return this.handleUnexpected(err, 'List My Entities');
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    /** Query Entity Settings for ownership records, then enrich from metadata. */
    private async loadUserEntities(
        userID: string,
        params: RunActionParams
    ): Promise<EntitySummary[]> {
        const rv = new RunView();
        const settingsResult = await rv.RunView<{ EntityID: string }>({
            EntityName: 'MJ: Entity Settings',
            ExtraFilter: `Name = '${UDT_SETTINGS.OWNER_KEY}' AND Value = '${escapeSqlLiteral(userID)}'`,
            Fields: ['EntityID'],
            ResultType: 'simple',
        }, params.ContextUser);

        if (!settingsResult.Success || settingsResult.Results.length === 0) {
            return [];
        }

        const entityIDs = settingsResult.Results.map(r => r.EntityID);
        return this.buildEntitySummaries(entityIDs, params.ContextUser);
    }

    /** Look up entity metadata for a list of entity IDs. */
    private buildEntitySummaries(
        entityIDs: string[],
        contextUser: UserInfo
    ): EntitySummary[] {
        const md = new Metadata(); // global-provider-ok: MJAPI server-side, single-provider deployment
        return entityIDs.reduce<EntitySummary[]>((acc, id) => {
            const info = md.Entities.find(e => UUIDsEqual(e.ID, id));
            if (info) {
                acc.push({
                    EntityID: info.ID,
                    EntityName: info.Name,
                    SchemaName: info.SchemaName ?? '',
                    TableName: info.BaseTable ?? '',
                    Description: info.Description ?? null,
                });
            }
            return acc;
        }, []);
    }
}
