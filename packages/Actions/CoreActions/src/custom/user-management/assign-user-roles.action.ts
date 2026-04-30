import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { DatabaseProviderBase, Metadata } from "@memberjunction/core";
import { MJUserRoleEntity } from "@memberjunction/core-entities";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

/**
 * Assigns one or more roles to a user by creating UserRole associations.
 * This action accepts either a single role name or an array of role names.
 * It gracefully handles both cases and assigns all specified roles to the user.
 */
@RegisterClass(BaseAction, "AssignUserRolesAction")
export class AssignUserRolesAction extends BaseAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const userID = params.Params.find(p => p.Name === 'UserID')?.Value as string;
            const roleNamesParam = params.Params.find(p => p.Name === 'RoleNames')?.Value;
            const roleNameParam = params.Params.find(p => p.Name === 'RoleName')?.Value;

            // Validate required fields
            if (!userID) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'UserID is required'
                };
            }

            // Handle both single and multiple role inputs
            let roleNames: string[] = [];
            
            if (roleNamesParam) {
                // If RoleNames is provided, use it
                if (Array.isArray(roleNamesParam)) {
                    roleNames = roleNamesParam;
                } else if (typeof roleNamesParam === 'string') {
                    roleNames = [roleNamesParam];
                }
            } else if (roleNameParam) {
                // If RoleName (singular) is provided, use it
                if (Array.isArray(roleNameParam)) {
                    roleNames = roleNameParam;
                } else if (typeof roleNameParam === 'string') {
                    roleNames = [roleNameParam];
                }
            }

            if (roleNames.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'RoleNames or RoleName must be provided as a string or array'
                };
            }

            const md = params.Provider ?? new Metadata();

            // Validate user exists - check UserCache first
            // For newly created users, the cache might not be updated yet
            const user = UserCache.Users?.find(u => UUIDsEqual(u.ID, userID));
            const existingRoleIDs = user?.UserRoles ? user.UserRoles.map(ur => ur.RoleID) : [];

            // Get all roles and validate they exist using Metadata cache
            const allRoles = md.Roles;
            const foundRoles = roleNames.map(name => {
                return allRoles.find(r => r.Name === name);
            }).filter(r => r != null);
            
            const foundRoleNames = foundRoles.map(r => r.Name);
            const missingRoles = roleNames.filter(name => !foundRoleNames.includes(name));

            if (missingRoles.length > 0) {
                return {
                    Success: false,
                    ResultCode: 'ROLES_NOT_FOUND',
                    Message: `The following roles do not exist: ${missingRoles.join(', ')}`
                };
            }

            // Separate roles that need to be assigned from those already present
            const rolesToAssign = foundRoles.filter(role =>
                !existingRoleIDs.some(id => UUIDsEqual(id, role.ID))
            );
            const skippedRoles = foundRoles
                .filter(role => existingRoleIDs.some(id => UUIDsEqual(id, role.ID)))
                .map(role => role.Name);

            // Assign all roles atomically — any failure rolls back the whole batch
            const assignedRoles: { roleID: string, roleName: string, userRoleID: string }[] = [];
            const errors: string[] = [];

            if (rolesToAssign.length > 0) {
                const provider = (params.Provider ?? Metadata.Provider) as DatabaseProviderBase;
                await provider.BeginTransaction();
                try {
                    for (const role of rolesToAssign) {
                        const userRole = await md.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', params.ContextUser);
                        userRole.UserID = userID;
                        userRole.RoleID = role.ID;

                        if (!await userRole.Save()) {
                            throw new Error(`Failed to assign role '${role.Name}': ${userRole.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        }
                        assignedRoles.push({
                            roleID: role.ID,
                            roleName: role.Name,
                            userRoleID: userRole.ID
                        });
                    }
                    await provider.CommitTransaction();
                } catch (e) {
                    await provider.RollbackTransaction();
                    // Roll back the in-memory tracking too, since none of them persisted
                    assignedRoles.length = 0;
                    errors.push(e instanceof Error ? e.message : String(e));
                }
            }

            // Prepare result
            let message = '';
            if (assignedRoles.length > 0) {
                message += `Successfully assigned ${assignedRoles.length} role(s): ${assignedRoles.map(r => r.roleName).join(', ')}. `;
            }
            if (skippedRoles.length > 0) {
                message += `Skipped ${skippedRoles.length} already assigned role(s): ${skippedRoles.join(', ')}. `;
            }
            if (errors.length > 0) {
                message += `Errors: ${errors.join('; ')}`;
            }

            // Add output parameters
            params.Params.push({
                Name: 'AssignedRoleIDs',
                Value: assignedRoles.map(r => r.roleID),
                Type: 'Output'
            });
            params.Params.push({
                Name: 'AssignedUserRoleIDs',
                Value: assignedRoles.map(r => r.userRoleID),
                Type: 'Output'
            });
            params.Params.push({
                Name: 'AssignedRoleNames',
                Value: assignedRoles.map(r => r.roleName),
                Type: 'Output'
            });
            params.Params.push({
                Name: 'AssignedCount',
                Value: assignedRoles.length,
                Type: 'Output'
            });

            // With atomic TG, any error means zero roles were persisted — it's a full failure, not partial.
            const hasErrors = errors.length > 0;
            return {
                Success: !hasErrors && (assignedRoles.length > 0 || skippedRoles.length > 0),
                ResultCode: hasErrors ? 'FAILED' : 'SUCCESS',
                Message: message.trim(),
                Params: params.Params
            };

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error assigning user roles: ${e.message}`
            };
        }
    }
}