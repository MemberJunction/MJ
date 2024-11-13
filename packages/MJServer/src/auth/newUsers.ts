import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config.js";
import { UserEntity, UserRoleEntity } from "@memberjunction/core-entities";

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

            return user;
        }
        catch (e) {
            LogError(e);
            return undefined;
        }
    }
}
