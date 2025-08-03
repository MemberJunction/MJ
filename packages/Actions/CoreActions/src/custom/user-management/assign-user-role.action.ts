import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { CreateRecordAction } from "../crud/create-record.action";
import { BaseAction } from '@memberjunction/actions';
import { RunView } from "@memberjunction/core";

/**
 * Assigns a role to a user by creating a UserRole association.
 * This action extends CreateRecordAction to leverage existing record creation functionality
 * while adding role assignment-specific validation.
 */
@RegisterClass(BaseAction, "AssignUserRoleAction")
export class AssignUserRoleAction extends CreateRecordAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const userID = params.Params.find(p => p.Name === 'UserID')?.Value as string;
            const roleName = params.Params.find(p => p.Name === 'RoleName')?.Value as string;

            // Validate required fields
            if (!userID || !roleName) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'UserID and RoleName are required'
                };
            }

            const rv = new RunView();

            // Validate user exists
            const userCheck = await rv.RunView({
                EntityName: 'Users',
                ExtraFilter: `ID='${userID}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            if (!userCheck.Success || !userCheck.Results || userCheck.Results.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'USER_NOT_FOUND',
                    Message: `User ID '${userID}' does not exist`
                };
            }

            // Find role by name
            const roleCheck = await rv.RunView({
                EntityName: 'Roles',
                ExtraFilter: `Name='${roleName.replace(/'/g, "''")}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            if (!roleCheck.Success || !roleCheck.Results || roleCheck.Results.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'ROLE_NOT_FOUND',
                    Message: `Role '${roleName}' does not exist`
                };
            }

            const roleID = roleCheck.Results[0].ID;

            // Check if user already has this role
            const existingAssignment = await rv.RunView({
                EntityName: 'User Roles',
                ExtraFilter: `UserID='${userID}' AND RoleID='${roleID}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            if (existingAssignment.Success && existingAssignment.Results && existingAssignment.Results.length > 0) {
                return {
                    Success: false,
                    ResultCode: 'ALREADY_ASSIGNED',
                    Message: `User already has the role '${roleName}' assigned`
                };
            }

            // Prepare fields for base CreateRecordAction
            const fields: Record<string, any> = {
                UserID: userID,
                RoleID: roleID
            };

            // Transform parameters to match CreateRecordAction format
            const createParams: RunActionParams = {
                ...params,
                Params: [
                    { Name: 'EntityName', Value: 'User Roles', Type: 'Input' },
                    { Name: 'Fields', Value: fields, Type: 'Input' }
                ]
            };

            // Call parent CreateRecordAction
            const result = await super.InternalRunAction(createParams);

            if (result.Success) {
                // Extract the created UserRole ID and add output parameters
                const primaryKey = result.Params?.find(p => p.Name === 'PrimaryKey')?.Value as Record<string, any>;
                if (primaryKey) {
                    params.Params.push({
                        Name: 'UserRoleID',
                        Value: primaryKey.ID,
                        Type: 'Output'
                    });
                    params.Params.push({
                        Name: 'RoleID',
                        Value: roleID,
                        Type: 'Output'
                    });
                }
                
                return {
                    ...result,
                    Message: `Successfully assigned role '${roleName}' to user`,
                    Params: params.Params
                };
            }

            return result;

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error assigning user role: ${e.message}`
            };
        }
    }
}

export function LoadAssignUserRoleAction() {
    // Prevent tree shaking
}