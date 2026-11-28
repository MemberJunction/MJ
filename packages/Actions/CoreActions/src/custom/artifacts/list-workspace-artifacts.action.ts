import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { GovernedArtifactService } from '@memberjunction/ai-agents';
import { BaseGovernedArtifactAction } from './base-governed-artifact.action';

/**
 * Action that lists governed workspace artifacts readable by the current user, optionally scoped to
 * a Collection or filtered by artifact type or name search.
 */
@RegisterClass(BaseAction, '__ListWorkspaceArtifacts')
export class ListWorkspaceArtifactsAction extends BaseGovernedArtifactAction {
    public static readonly AuthorizesCaller = true;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if (!params.ContextUser) {
            return {
                Success: false,
                ResultCode: 'MISSING_CONTEXT_USER',
                Message: 'ContextUser is required to list workspace artifacts.',
                Params: params.Params,
            };
        }

        const collectionId = this.getStringParam(params, 'CollectionID');
        const typeFilter = this.getStringParam(params, 'TypeFilter');
        const search = this.getStringParam(params, 'Search');
        const maxResults = this.getNumericParam(params, 'MaxResults');

        const outcome = await GovernedArtifactService.Instance.ListWorkspaceArtifacts({
            provider: this.resolveProvider(params),
            contextUser: params.ContextUser,
            collectionId,
            typeFilter,
            search,
            maxResults,
        });

        if (!outcome.success) {
            return {
                Success: false,
                ResultCode: 'LIST_FAILED',
                Message: outcome.errorMessage || 'Failed to list workspace artifacts.',
                Params: params.Params,
            };
        }

        this.setOutputParam(params, 'Artifacts', outcome.artifacts);
        this.setOutputParam(params, 'Count', outcome.artifacts.length);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify({
                count: outcome.artifacts.length,
                artifacts: outcome.artifacts,
            }),
            Params: params.Params,
        };
    }
}
