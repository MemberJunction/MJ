import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { TagParams, TagResult } from '../interfaces';

/**
 * Shape of the LearnWorlds tag operation API response
 */
interface LWApiTagResponse {
  tags?: string[];
}

/**
 * Action to detach tags from a LearnWorlds user
 */
@RegisterClass(BaseAction, 'DetachTagsAction')
export class DetachTagsAction extends LearnWorldsBaseAction {
  /**
   * Detaches one or more tags from a LearnWorlds user.
   */
  public async DetachTags(params: TagParams, contextUser: UserInfo): Promise<TagResult> {
    this.SetCompanyContext(params.CompanyID);

    if (!params.UserID) {
      throw new Error('UserID is required');
    }
    if (!params.Tags || params.Tags.length === 0) {
      throw new Error('At least one tag is required');
    }

    const response = await this.makeLearnWorldsRequest<LWApiTagResponse>(`users/${params.UserID}/tags`, 'DELETE', { tags: params.Tags }, contextUser);

    return {
      Success: true,
      UserID: params.UserID,
      Tags: response.tags || params.Tags,
    };
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const tagParams: TagParams = {
        CompanyID: this.getRequiredStringParam(Params, 'CompanyID'),
        UserID: this.getRequiredStringParam(Params, 'UserID'),
        Tags: this.getOptionalStringArrayParam(Params, 'Tags') || [],
      };

      const result = await this.DetachTags(tagParams, ContextUser);

      this.setOutputParam(Params, 'Success', result.Success);
      this.setOutputParam(Params, 'ResultTags', result.Tags);

      return this.buildSuccessResult(`Successfully detached ${result.Tags.length} tag(s) from user ${result.UserID}`, Params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error detaching tags: ${errorMessage}`, Params);
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'Tags', Type: 'Input', Value: null },
      { Name: 'Success', Type: 'Output', Value: null },
      { Name: 'ResultTags', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Detaches one or more tags from a LearnWorlds user';
  }
}
