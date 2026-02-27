import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { SSOLoginParams, SSOLoginResult } from '../interfaces';

/**
 * Shape of the LearnWorlds SSO API response
 */
interface LWApiSSOResponse {
  url: string;
  user_id?: string;
}

/**
 * Action to generate an SSO login URL for a LearnWorlds user
 */
@RegisterClass(BaseAction, 'SSOLoginAction')
export class SSOLoginAction extends LearnWorldsBaseAction {
  /**
   * Generates an SSO login URL for a LearnWorlds user.
   * Requires either Email or UserID to identify the user.
   */
  public async GenerateSSOUrl(params: SSOLoginParams, contextUser: UserInfo): Promise<SSOLoginResult> {
    this.SetCompanyContext(params.CompanyID);

    this.validateSSOParams(params);

    const body = this.buildSSORequestBody(params);
    const response = await this.makeLearnWorldsRequest<LWApiSSOResponse>('sso', 'POST', body, contextUser);

    return {
      LoginURL: response.url,
      LearnWorldsUserID: response.user_id,
    };
  }

  /**
   * Validates that either Email or UserID is provided
   */
  private validateSSOParams(params: SSOLoginParams): void {
    if (!params.Email && !params.UserID) {
      throw new Error('Either Email or UserID is required for SSO login');
    }
  }

  /**
   * Builds the SSO request body based on which identifier is provided
   */
  private buildSSORequestBody(params: SSOLoginParams): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    if (params.Email) {
      this.validateEmail(params.Email);
      body.email = params.Email;
    } else if (params.UserID) {
      body.user_id = params.UserID;
    }

    if (params.RedirectTo) {
      body.redirect_to = this.validateRedirectTo(params.RedirectTo);
    }

    return body;
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const ssoParams: SSOLoginParams = {
        CompanyID: this.getRequiredStringParam(Params, 'CompanyID'),
        Email: this.getOptionalStringParam(Params, 'Email'),
        UserID: this.getOptionalStringParam(Params, 'UserID'),
        RedirectTo: this.getOptionalStringParam(Params, 'RedirectTo'),
      };

      const result = await this.GenerateSSOUrl(ssoParams, ContextUser);

      this.setOutputParam(Params, 'LoginURL', result.LoginURL);
      this.setOutputParam(Params, 'LearnWorldsUserID', result.LearnWorldsUserID);

      return this.buildSuccessResult(`SSO URL generated successfully`, Params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error generating SSO URL: ${errorMessage}`, Params);
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'Email', Type: 'Input', Value: null },
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'RedirectTo', Type: 'Input', Value: null },
      { Name: 'LoginURL', Type: 'Output', Value: null },
      { Name: 'LearnWorldsUserID', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Generates an SSO login URL for a LearnWorlds user';
  }
}
