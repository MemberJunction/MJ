import { ApplicationInfo, DatabaseProviderBase, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { NewUserSetup } from "../Config/config";
import { MJUserEntity, MJUserRoleEntity, MJUserApplicationEntity, MJUserApplicationEntityEntity, MJApplicationEntityEntityType } from "@memberjunction/core-entities";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { logError, logStatus } from "./status_logging";
import { RegisterClass } from "@memberjunction/global";

/**
 * Base class for creating a new user in the system, you can sub-class this class to create your own user creation logic
 */
export class CreateNewUserBase {
    public async createNewUser(newUserSetup: NewUserSetup): Promise<{Success: boolean, Message: string, Severity: 'warning' | 'error' | undefined}> {
        try {   
            const matches: UserInfo = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() ==='owner')!;
            const currentUser = matches ? matches : UserCache.Users[0]; // if we don't find an Owner, use the first user in the cache
    
            if (!currentUser) {
                return {
                    Success: false,
                    Message: "No existing users found in the database, cannot create a new user",
                    Severity: 'error'
                };
            }
    
            if (newUserSetup) {
                // check for existing user by email
                const existingNewUser = UserCache.Users.find(u => u.Email === newUserSetup.Email);
                if (!existingNewUser) {
                    if (newUserSetup.Email && newUserSetup.Email.length > 0) {
                        logStatus("Attempting to create new user: " + newUserSetup.Email);
                        const md = new Metadata(); // global-provider-ok: CLI tool, single-provider context
                        const user = <MJUserEntity>await md.GetEntityObject('MJ: Users', currentUser);
                        user.NewRecord();
                        user.Name = newUserSetup.UserName ? newUserSetup.UserName : newUserSetup.Email;
                        user.FirstName = newUserSetup.FirstName;
                        user.LastName = newUserSetup.LastName;
                        user.Email = newUserSetup.Email;
                        user.Type = 'Owner';
                        user.IsActive = true;
                        // Create the user and all of its role/application/app-entity records atomically.
                        // If any Save fails partway through, the whole provisioning rolls back so we never
                        // leave a half-created user with partial roles/applications behind.
                        const provider = Metadata.Provider as DatabaseProviderBase; // global-provider-ok: CLI tool, single-provider context
                        await provider.BeginTransaction();
                        try {
                            if (!await user.Save()) {
                                throw new Error("Failed to save new user: " + newUserSetup.Email);
                            }

                            // User Roles
                            for (let i = 0; i < newUserSetup.Roles.length; i++) {
                                const roleName = newUserSetup.Roles[i];
                                const roleID = md.Roles.find(r => r.Name === roleName)?.ID;
                                if (!roleID) {
                                    logError("   Role not found: " + roleName + ", skipping");
                                    continue;
                                }
                                const userRole = <MJUserRoleEntity>await md.GetEntityObject('MJ: User Roles', currentUser);
                                userRole.NewRecord();
                                userRole.UserID = user.ID;
                                userRole.RoleID = roleID;
                                if (!await userRole.Save()) {
                                    throw new Error(`Failed to create User Role '${roleName}': ${userRole.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                                }
                                logStatus("   Created User Role: " + roleName);
                            }

                            // User Applications + nested User Application Entities
                            if (newUserSetup.CreateUserApplicationRecords) {
                                logStatus("Creating User Applications for new user: " + user.Name);
                                for(const appName of newUserSetup.UserApplications){
                                    const toLowerCase: string = appName.trim().toLocaleLowerCase();
                                    const application: ApplicationInfo | undefined = md.Applications.find(a => a.Name.trim().toLocaleLowerCase() === toLowerCase);
                                    if (!application) {
                                        logError(`Application ${appName} not found in the Metadata, cannot assign to new user ${user.Name}`);
                                        continue;
                                    }

                                    const userApplication: MJUserApplicationEntity = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', currentUser);
                                    userApplication.NewRecord();
                                    userApplication.UserID = user.ID;
                                    userApplication.ApplicationID = application.ID;
                                    userApplication.IsActive = true;

                                    if (!await userApplication.Save()) {
                                        throw new Error(`Failed to create User Application ${appName} for new user ${user.Name}: ${userApplication.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                                    }
                                    logStatus(`Created User Application ${appName} for new user ${user.Name}`);

                                    //now create MJUserApplicationEntity records for each entity in the application
                                    const rv: RunView = new RunView();
                                    const rvResult: RunViewResult<MJApplicationEntityEntityType> = await rv.RunView({
                                        EntityName: 'MJ: Application Entities',
                                        ExtraFilter: `ApplicationID = '${application.ID}' and DefaultForNewUser = 1`,
                                    }, currentUser);

                                    if(!rvResult.Success){
                                        LogError(`Failed to load Application Entities for Application ${appName} for new user ${user.Name}:`, undefined, rvResult.ErrorMessage);
                                        continue;
                                    }

                                    LogStatus(`Creating ${rvResult.Results.length} User Application Entities for User Application ${appName} for new user ${user.Name}`);

                                    for(const [index, appEntity] of rvResult.Results.entries()){
                                        const userAppEntity: MJUserApplicationEntityEntity = await md.GetEntityObject<MJUserApplicationEntityEntity>('MJ: User Application Entities', currentUser);
                                        userAppEntity.NewRecord();
                                        userAppEntity.UserApplicationID = userApplication.ID;
                                        userAppEntity.EntityID = appEntity.EntityID!;
                                        userAppEntity.Sequence = index;

                                        if (!await userAppEntity.Save()) {
                                            throw new Error(`Failed to create User Application Entity for new user ${user.Name}: ${userAppEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                                        }
                                        LogStatus(`Created User Application Entity ${appEntity.Entity} for new user ${user.Name}`);
                                    }
                                }
                            }

                            await provider.CommitTransaction();
                            logStatus("Finished creating new user: " + newUserSetup.Email);
                            return {
                                Success: true,
                                Message: "Successfully created new user: " + newUserSetup.Email,
                                Severity: undefined
                            };
                        } catch (txErr) {
                            await provider.RollbackTransaction();
                            return {
                                Success: false,
                                Message: txErr instanceof Error ? txErr.message : String(txErr),
                                Severity: 'error'
                            };
                        }
                    }
                    else {
                        return {
                            Success: false,
                            Message: "No email address provided for new user, cannot create new user. Params:" + JSON.stringify(newUserSetup),
                            Severity: 'warning'
                        };
                    }
                }
                else {
                    return {
                        Success: true,
                        Message: "New user setup is already complete, skipping",
                        Severity: undefined
                    }
                }
            }
            else {
                return {
                    Success: false,
                    Message: "No newUserSetup object provided, createNewUser() shouldn't be called without a valid object",
                    Severity: 'error'
                };
            }
        } 
        catch (err) {
            return {
                Success: false,
                Message: "Error attemping to create a new user: " + err,
                Severity: 'error'
            }
        }
    }
}
