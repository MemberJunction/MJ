import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { UpdateUserParams, UpdateUserResult, UpdateUserSummary } from '../interfaces';
import { LearnWorldsUser, LWApiUser } from '../interfaces';

/**
 * Action to update an existing user in LearnWorlds
 */
@RegisterClass(BaseAction, 'UpdateUserAction')
export class UpdateUserAction extends LearnWorldsBaseAction {
  /**
   * Updates a user's profile in LearnWorlds.
   * Only sends non-undefined fields in the update body.
   */
  public async UpdateUser(params: UpdateUserParams, contextUser: UserInfo): Promise<UpdateUserResult> {
    this.SetCompanyContext(params.CompanyID);

    this.validatePathSegment(params.UserID, 'UserID');

    const { body, fieldsUpdated } = this.buildUpdateBody(params);

    if (fieldsUpdated.length === 0) {
      throw new Error('No fields provided to update');
    }

    const response = await this.makeLearnWorldsRequest<LWApiUser>(`users/${params.UserID}`, 'PUT', body, contextUser);

    const userDetails = this.mapResponseToUser(response);
    const summary = this.buildUpdateSummary(params.UserID, userDetails.email, fieldsUpdated);

    return { UserDetails: userDetails, Summary: summary };
  }

  /**
   * Builds the API request body from non-undefined params and tracks which fields were updated
   */
  private buildUpdateBody(params: UpdateUserParams): { body: Record<string, unknown>; fieldsUpdated: string[] } {
    const body: Record<string, unknown> = {};
    const fieldsUpdated: string[] = [];

    if (params.Email !== undefined) {
      body.email = params.Email;
      fieldsUpdated.push('Email');
    }
    if (params.Username !== undefined) {
      body.username = params.Username;
      fieldsUpdated.push('Username');
    }
    if (params.Password !== undefined) {
      body.password = params.Password;
      fieldsUpdated.push('Password');
    }
    if (params.FirstName !== undefined) {
      body.first_name = params.FirstName;
      fieldsUpdated.push('FirstName');
    }
    if (params.LastName !== undefined) {
      body.last_name = params.LastName;
      fieldsUpdated.push('LastName');
    }
    if (params.Role !== undefined) {
      body.role = this.validateRole(params.Role);
      fieldsUpdated.push('Role');
    }
    if (params.IsActive !== undefined) {
      body.is_active = params.IsActive;
      fieldsUpdated.push('IsActive');
    }
    if (params.Tags !== undefined) {
      body.tags = params.Tags;
      fieldsUpdated.push('Tags');
    }
    if (params.CustomFields !== undefined) {
      body.custom_fields = params.CustomFields;
      fieldsUpdated.push('CustomFields');
    }

    return { body, fieldsUpdated };
  }

  /**
   * Maps the raw LearnWorlds API response to a LearnWorldsUser
   */
  private mapResponseToUser(response: LWApiUser): LearnWorldsUser {
    return {
      id: response.id || response._id || '',
      email: response.email,
      username: response.username || response.email,
      firstName: response.first_name,
      lastName: response.last_name,
      fullName: response.full_name || `${response.first_name || ''} ${response.last_name || ''}`.trim(),
      status: this.mapUserStatus(response.status || 'active'),
      role: response.role || 'student',
      createdAt: this.parseLearnWorldsDate(response.created || response.created_at || ''),
      lastLoginAt: response.last_login ? this.parseLearnWorldsDate(response.last_login) : undefined,
      tags: response.tags || [],
      customFields: response.custom_fields || {},
    };
  }

  /**
   * Builds a summary of what was updated
   */
  private buildUpdateSummary(userId: string, email: string, fieldsUpdated: string[]): UpdateUserSummary {
    return {
      userId,
      email,
      fieldsUpdated,
    };
  }

  /**
   * Framework entry point that delegates to the typed public method
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const updateParams: UpdateUserParams = {
        CompanyID: this.getRequiredStringParam(Params, 'CompanyID'),
        UserID: this.getRequiredStringParam(Params, 'UserID'),
        Email: this.getOptionalStringParam(Params, 'Email'),
        Username: this.getOptionalStringParam(Params, 'Username'),
        Password: this.getOptionalStringParam(Params, 'Password'),
        FirstName: this.getOptionalStringParam(Params, 'FirstName'),
        LastName: this.getOptionalStringParam(Params, 'LastName'),
        Role: this.getOptionalStringParam(Params, 'Role'),
        IsActive: this.getOptionalBooleanParam(Params, 'IsActive', undefined),
        Tags: this.getOptionalStringArrayParam(Params, 'Tags'),
        CustomFields: this.getParamValue(Params, 'CustomFields') as Record<string, unknown> | undefined,
      };

      if (!updateParams.UserID) {
        return this.buildErrorResult('VALIDATION_ERROR', 'UserID is required', Params);
      }

      const result = await this.UpdateUser(updateParams, ContextUser);

      this.setOutputParam(Params, 'UserDetails', result.UserDetails);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully updated user ${result.UserDetails.email} (${result.Summary.fieldsUpdated.length} field(s) updated)`, Params);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error updating user: ${errorMessage}`, Params);
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'Email', Type: 'Input', Value: null },
      { Name: 'Username', Type: 'Input', Value: null },
      { Name: 'Password', Type: 'Input', Value: null },
      { Name: 'FirstName', Type: 'Input', Value: null },
      { Name: 'LastName', Type: 'Input', Value: null },
      { Name: 'Role', Type: 'Input', Value: null },
      { Name: 'IsActive', Type: 'Input', Value: null },
      { Name: 'Tags', Type: 'Input', Value: null },
      { Name: 'CustomFields', Type: 'Input', Value: null },
      { Name: 'UserDetails', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Updates an existing user profile in LearnWorlds with optional field-level changes';
  }
}
