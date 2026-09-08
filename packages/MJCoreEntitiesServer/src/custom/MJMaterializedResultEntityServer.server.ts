import { BaseEntity, BaseEntityResult, EntityDeleteOptions, IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMaterializedResultEntity, MJMaterializedResultQueryEntity } from '@memberjunction/core-entities';

/**
 * Server-side `MJ: Materialized Results` entity. Removes the `MJ: Materialized Result Queries` join row(s)
 * that reference this materialization BEFORE the row itself is deleted.
 *
 * The join FKs deliberately have NO `ON DELETE CASCADE` (the MaterializedResult↔Query cascade is kept at the
 * application layer so a physical snapshot is never silently dropped by the DB engine). When a *Query* is
 * deleted, the generated `spDeleteQuery` already cascades its join row; this override covers the REVERSE
 * direction — deleting the MaterializedResult directly — which would otherwise surface a raw
 * `FK_MaterializedResultQuery_MaterializedResult` violation. FK-cleanup-before-delete pattern
 * (guides/BASE_ENTITY_SERVER_PATTERNS.md).
 *
 * Out of scope here (tracked as follow-ups): dropping the physical `materialized_vw<…>` snapshot table/view on
 * delete, and whether deleting a source Query should cascade-delete or block on its materialization — both
 * involve DDL on the delete path and a cascade-vs-block semantics decision.
 */
@RegisterClass(BaseEntity, 'MJ: Materialized Results')
export class MJMaterializedResultEntityServer extends MJMaterializedResultEntity {
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        if (this.IsSaved) {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const rv = RunView.FromMetadataProvider(md);
            const links = await rv.RunView<MJMaterializedResultQueryEntity>(
                {
                    EntityName: 'MJ: Materialized Result Queries',
                    ExtraFilter: `MaterializedResultID='${this.ID.replace(/'/g, "''")}'`,
                    ResultType: 'entity_object',
                },
                this.ContextCurrentUser,
            );
            if (!links.Success) {
                return this.failDelete(`Failed to load linked MaterializedResultQuery rows: ${links.ErrorMessage ?? 'unknown error'}`);
            }
            for (const link of links.Results ?? []) {
                const deleted = await link.Delete();
                if (!deleted) {
                    return this.failDelete(`Failed to delete linked MaterializedResultQuery ${link.ID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        }
        return super.Delete(options);
    }

    /** Records a delete failure on the result history and returns false (Delete does not throw on a logical failure). */
    private failDelete(message: string): boolean {
        LogError(`MJMaterializedResultEntityServer.Delete: ${message}`);
        const result = new BaseEntityResult();
        result.StartedAt = new Date();
        result.Success = false;
        result.Type = 'delete';
        result.Message = message;
        result.EndedAt = new Date();
        this.RegisterResultHistoryEntry(result);
        return false;
    }
}
