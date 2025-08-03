import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { Metadata, RunView } from "@memberjunction/core";
import { UserRoleEntity } from "@memberjunction/core-entities";

/**
 * Verifies if the current user has a specific role or permission to perform administrative tasks.
 * Supports checking for roles, authorizations, or entity permissions.
 */
@RegisterClass(BaseAction, "CheckUserPermissionAction")
export class CheckUserPermissionAction extends BaseAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const permissionType = params.Params.find(p => p.Name === 'PermissionType')?.Value as string || 'Role';
            const permissionName = params.Params.find(p => p.Name === 'PermissionName')?.Value as string;

            if (!permissionName) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'PermissionName parameter is required'
                };
            }

            // Validate permission type
            const validTypes = ['Role', 'Authorization', 'EntityPermission'];
            if (!validTypes.includes(permissionType)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_PERMISSION_TYPE',
                    Message: `Invalid permission type. Must be one of: ${validTypes.join(', ')}`
                };
            }

            const currentUser = params.ContextUser;
            if (!currentUser) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'No authenticated user context found'
                };
            }

            let hasPermission = false;
            const userRoles: string[] = [];

            // Check based on permission type
            switch (permissionType) {
                case 'Role':
                    // Get user's roles
                    const rv = new RunView();
                    const rolesResult = await rv.RunView<UserRoleEntity>({
                        EntityName: 'User Roles',
                        ExtraFilter: `UserID='${currentUser.ID}'`,
                        ResultType: 'entity_object'
                    }, currentUser);

                    if (rolesResult.Success && rolesResult.Results) {
                        rolesResult.Results.forEach(ur => userRoles.push(ur.Role));
                        hasPermission = rolesResult.Results.some(ur => ur.Role === permissionName);
                    }
                    break;

                case 'Authorization':
                    // Check authorization roles
                    const authRv = new RunView();
                    const authResult = await authRv.RunView({
                        EntityName: 'Authorization Roles',
                        ExtraFilter: `RoleID IN (SELECT RoleID FROM ${Metadata.Provider.ConfigData.MJCoreSchemaName}.vwUserRoles WHERE UserID='${currentUser.ID}') AND AuthorizationID IN (SELECT ID FROM ${Metadata.Provider.ConfigData.MJCoreSchemaName}.vwAuthorizations WHERE Name='${permissionName}')`,
                        ResultType: 'simple'
                    }, currentUser);

                    hasPermission = authResult.Success && authResult.Results && authResult.Results.length > 0;
                    break;

                case 'EntityPermission':
                    // Use the Metadata API to check entity permissions properly
                    const md = new Metadata();
                    const entityInfo = md.EntityByName(permissionName);
                    
                    if (!entityInfo) {
                        return {
                            Success: false,
                            ResultCode: 'ENTITY_NOT_FOUND',
                            Message: `Entity '${permissionName}' not found`
                        };
                    }
                    
                    // Get user permissions for this entity
                    const userPermissions = entityInfo.GetUserPermisions(currentUser);
                    hasPermission = userPermissions.CanCreate;
                    break;
            }

            // Add output parameters
            params.Params.push({
                Name: 'HasPermission',
                Value: hasPermission,
                Type: 'Output'
            });

            if (userRoles.length > 0) {
                params.Params.push({
                    Name: 'UserRoles',
                    Value: userRoles,
                    Type: 'Output'
                });
            }

            return {
                Success: true,
                ResultCode: hasPermission ? 'SUCCESS' : 'PERMISSION_DENIED',
                Message: hasPermission 
                    ? `User has required ${permissionType}: ${permissionName}`
                    : `User does not have required ${permissionType}: ${permissionName}`,
                Params: params.Params
            };

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error checking user permission: ${e.message}`
            };
        }
    }
}

export function LoadCheckUserPermissionAction() {
    // Prevent tree shaking
}