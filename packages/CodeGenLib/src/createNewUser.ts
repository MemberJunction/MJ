import { Metadata, UserInfo } from "@memberjunction/core";
import { NewUserSetup, saveConfigFileFromMemory } from "./config";
import { UserEntity, UserRoleEntity } from "@memberjunction/core-entities";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { logError, logStatus } from "./logging";
import { RegisterClass } from "@memberjunction/global";

/**
 * Base class for creating a new user in the system, you can sub-class this class to create your own user creation logic
 */
@RegisterClass(CreateNewUserBase)
export class CreateNewUserBase {
    public async createNewUser(newUserSetup: NewUserSetup): Promise<boolean> {
        try {   
            const matches: UserInfo = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() ==='owner');
            const currentUser = matches ? matches : UserCache.Users[0]; // if we don't find an Owner, use the first user in the cache
    
            if (!currentUser) {
                logError("No existing users found in the database, cannot create a new user");
                return false;
            }
    
            if (newUserSetup) {
                if (newUserSetup.IsComplete === false || newUserSetup.IsComplete === undefined || newUserSetup.IsComplete === null) {
                    if (newUserSetup.Email && newUserSetup.Email.length > 0) {
                        logStatus("Attempting to create new user: " + newUserSetup.Email);
                        const md = new Metadata();
                        const user = <UserEntity>await md.GetEntityObject('Users', currentUser);
                        user.NewRecord();
                        user.Name = newUserSetup.UserName ? newUserSetup.UserName : newUserSetup.Email;
                        user.FirstName = newUserSetup.FirstName;
                        user.LastName = newUserSetup.LastName;
                        user.Email = newUserSetup.Email;
                        user.Type = 'Owner';
                        user.IsActive = true;
                        if (await user.Save()) {
                            // save was successful, so we can create the User Roles
                            for (let i = 0; i < newUserSetup.Roles.length; i++) {
                                const roleName = newUserSetup.Roles[i];
                                const userRole = <UserRoleEntity>await md.GetEntityObject('User Roles', currentUser);
                                userRole.NewRecord();
                                userRole.UserID = user.ID;
                                userRole.RoleName = roleName;
                                if (await userRole.Save()) {
                                    logStatus("   Created User Role: " + roleName);
                                }
                                else {
                                    logError("   Failed to create User Role: " + roleName);
                                }
                            }
    
                            logStatus("Finished creating new user: " + newUserSetup.Email + ", saving config file");
                            newUserSetup.IsComplete = true; 
                            saveConfigFileFromMemory();
                            return true;
                        }
                        else {
                            // saving the user failed, so we don't atempt to create User Roles, throw error
                            logError("Failed to save user: " + newUserSetup.Email);
                            return false;
                        }
                    }
                    else {
                        logError("No email address provided for new user, cannot create new user", newUserSetup);
                        return false;
                    }
                }
                else {
                    logStatus("New user setup is already complete, skipping");
                }
            }
            else {
                logError("No newUserSetup object provided, createNewUser() shouldn't be called without a valid object");
                return false;
            }
            return true;
        } 
        catch (err) {
            logError("Error attemping to create a new user", err);
            return false;
        }
    }
}