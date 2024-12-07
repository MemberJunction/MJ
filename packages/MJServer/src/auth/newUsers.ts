import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config.js";
import { UserEntity, UserRoleEntity, UserApplicationEntity, UserApplicationEntityEntity } from "@memberjunction/core-entities";

@RegisterClass(NewUserBase)
export class NewUserBase {
    public async createNewUser(firstName: string, lastName: string, email: string, linkedRecordType: string = 'None', linkedEntityId?: string, linkedEntityRecordId?: string): Promise<UserEntity | null> {
        try {
            let contextUser: UserInfo | null = null;

            const contextUserForNewUserCreation: string = configInfo?.userHandling?.contextUserForNewUserCreation;
            if(contextUserForNewUserCreation){
                contextUser = UserCache.Instance.UserByName(contextUserForNewUserCreation);
            }

            if (!contextUser) {
                LogError(`Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, using an existing user with the Owner role instead`);

                contextUser = UserCache.Users.find(user => user.Type.trim().toLowerCase() ==='owner')!;
                if (!contextUser) {
                    LogError(`No existing users found in the database with the Owner role, cannot create a new user`);
                    return null;
                }
            }

            const md: Metadata = new Metadata();
            const user = await md.GetEntityObject<UserEntity>('Users', contextUser) // To-Do - change this to be a different defined user for the user creation process
            user.NewRecord();
            user.Name = email;
            user.IsActive = true;
            user.FirstName = firstName;
            user.LastName = lastName;
            user.Email = email;
            user.Type = 'User';
            user.LinkedRecordType = linkedRecordType;

            if (linkedEntityId){
                user.LinkedEntityID = linkedEntityId;
            }

            if (linkedEntityRecordId){
                user.LinkedEntityRecordID = linkedEntityRecordId;
            }

            const saveResult: boolean = await user.Save();
            if(!saveResult){
                LogError(`Failed to create new user ${firstName} ${lastName} ${email}:`, undefined, user.LatestResult);
                return null;
            }

            if(configInfo.userHandling && configInfo.userHandling.newUserRoles){
                // user created, now create however many roles we need to create for this user based on the config settings
                LogStatus(`User ${user.Email} created, assigning roles`);
                for (const role of configInfo.userHandling.newUserRoles) {
                    const userRoleEntity: UserRoleEntity = await md.GetEntityObject<UserRoleEntity>('User Roles', contextUser);
                    userRoleEntity.NewRecord();
                    userRoleEntity.UserID = user.ID;
                    const userRole = md.Roles.find(r => r.Name === role);

                    if (!userRole) {
                        LogError(`Role ${role} not found in the database, cannot assign to new user ${user.Name}`);
                        continue;
                    }

                    userRoleEntity.RoleID = userRole.ID;
                    const roleSaveResult: boolean = await userRoleEntity.Save();
                    if(!roleSaveResult){
                        LogError(`Failed to assign role ${role} to new user ${user.Name}:`, undefined, userRoleEntity.LatestResult);
                    }
                }
            }

            // Create UserApplication records if specified in the config
            if (configInfo.newUserSetup?.CreateUserApplicationRecords) {
                for (let i = 0; i < configInfo.newUserSetup.UserApplications.length; i++) {
                    const applicationName = configInfo.newUserSetup.UserApplications[i];
                    const applicationID = md.Applications.find(a => a.Name === applicationName)?.ID;
                    if (!applicationID) {
                        LogError("   Application not found: " + applicationName + ", skipping");
                        continue;
                    }
                    const userApplication = <UserApplicationEntity>await md.GetEntityObject('User Applications', contextUser);
                    userApplication.NewRecord();
                    userApplication.UserID = user.ID;
                    userApplication.ApplicationID = applicationID;
                    userApplication.IsActive = true;
                    userApplication.SortOrder = i + 1;
                    if (await userApplication.Save()) {
                        LogStatus("   Created User Application: " + applicationName);

                        // Create UserApplicationEntity records if specified in the config
                        if (configInfo.newUserSetup.IncludeAllUserApplicationEntities) {
                            const applicationEntities = md.ApplicationEntities.filter(ae => ae.ApplicationID === applicationID);
                            for (let j = 0; j < applicationEntities.length; j++) {
                                const userApplicationEntity = <UserApplicationEntityEntity>await md.GetEntityObject('User Application Entities', contextUser);
                                userApplicationEntity.NewRecord();
                                userApplicationEntity.UserApplicationID = userApplication.ID;
                                userApplicationEntity.EntityID = applicationEntities[j].EntityID;
                                userApplicationEntity.SortOrder = j + 1;
                                if (await userApplicationEntity.Save()) {
                                    LogStatus("   Created User Application Entity: " + applicationEntities[j].EntityID);
                                }
                                else {
                                    LogError("   Failed to create User Application Entity: " + applicationEntities[j].EntityID);
                                }
                            }
                        }
                    }
                    else {
                        LogError("   Failed to create User Application: " + applicationName);
                    }
                }
            }

            return user;
        }
        catch (e) {
            LogError(e);
            return undefined;
        }
    }
}
