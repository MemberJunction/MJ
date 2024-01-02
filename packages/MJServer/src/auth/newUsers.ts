import { LogError, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config";

@RegisterClass(NewUserBase)
export class NewUserBase {
    public async createNewUser(firstName: string, lastName: string, email: string, linkedRecordType: string = 'None', linkedEntityId?: number, linkedEntityRecordId?: number) {
        try {
            const md = new Metadata();
            const contextUser = UserCache.Instance.Users.find(u => u.Email.trim().toLowerCase() === configInfo?.userHandling?.contextUserForNewUserCreation?.trim().toLowerCase())
            if (!contextUser) {
                LogError(`Failed to load context user ${configInfo?.userHandling?.contextUserForNewUserCreation}, if you've not specified this on your config.json you must do so. This is the user that is contextually used for creating a new user record dynamically.`);
                return undefined;
            }
            const u = await md.GetEntityObject('Users', contextUser) // To-Do - change this to be a different defined user for the user creation process
            u.NewRecord();
            u.Name = email;
            u.IsActive = true;
            u.FirstName = firstName;
            u.LastName = lastName;
            u.Email = email;
            u.Type = 'User';
            u.LinkedRecordType = linkedRecordType;
            if (linkedEntityId)
                u.LinkedEntityID = linkedEntityId;
            if (linkedEntityRecordId)
                u.LinkedEntityRecordID = linkedEntityRecordId;

            if (await u.Save()) {
                // user created, now create however many roles we need to create for this user based on the config settings
                const ur = await md.GetEntityObject('User Roles', contextUser);
                let bSuccess: boolean = true;
                for (const role of configInfo.userHandling.newUserRoles) {
                    ur.NewRecord();
                    ur.UserID = u.ID;
                    ur.RoleName = role;
                    bSuccess = bSuccess && await ur.Save();
                }
                if (!bSuccess) {
                    LogError(`Failed to create roles for newly created user ${firstName} ${lastName} ${email}`);
                    return undefined;
                }
            }
            else {
                LogError(`Failed to create new user ${firstName} ${lastName} ${email}`);
                return undefined;
            }
            return u;        
        }
        catch (e) {
            LogError(e);
            return undefined;
        }
    }
}