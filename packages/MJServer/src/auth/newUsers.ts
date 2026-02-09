import { ApplicationInfo, EntitySaveOptions, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config.js";
import { UserEntity, UserRoleEntity, UserApplicationEntity, UserApplicationEntityEntity, ApplicationEntityType, ApplicationEntityEntityType } from "@memberjunction/core-entities";

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
                    if(roleSaveResult){
                        LogStatus(`Assigned role ${role} to new user ${user.Name}`);
                    }
                    else{
                        LogError(`Failed to assign role ${role} to new user ${user.Name}:`, undefined, userRoleEntity.LatestResult);
                    }
                    
                }
            }

            // Create UserApplication records if specified in the config
            if (configInfo.userHandling && configInfo.userHandling.CreateUserApplicationRecords) {
                LogStatus("Creating User Applications for new user: " + user.Name);

                // Determine which applications to create UserApplication records for
                // If UserApplications config array has entries, use those
                // Otherwise, fall back to applications with DefaultForNewUser = true
                let applicationsToCreate: ApplicationInfo[] = [];

                if (configInfo.userHandling.UserApplications && configInfo.userHandling.UserApplications.length > 0) {
                    // Use explicitly configured applications
                    for (const appName of configInfo.userHandling.UserApplications) {
                        const toLowerCase: string = appName.trim().toLocaleLowerCase();
                        const application: ApplicationInfo | undefined = md.Applications.find(a => a.Name.trim().toLocaleLowerCase() === toLowerCase);
                        if (application) {
                            applicationsToCreate.push(application);
                        } else {
                            LogError(`Application ${appName} not found in the Metadata, cannot assign to new user ${user.Name}`);
                        }
                    }
                } else {
                    // Fall back to DefaultForNewUser applications from metadata, sorted by DefaultSequence
                    LogStatus(`No UserApplications configured, using DefaultForNewUser applications for new user ${user.Name}`);
                    applicationsToCreate = md.Applications
                        .filter(a => a.DefaultForNewUser)
                        .sort((a, b) => (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100));
                    LogStatus(`Found ${applicationsToCreate.length} applications with DefaultForNewUser=true`);
                }

                // Create UserApplication records for each application
                for (const [appIndex, application] of applicationsToCreate.entries()) {
                    const userApplication: UserApplicationEntity = await md.GetEntityObject<UserApplicationEntity>('User Applications', contextUser);
                    userApplication.NewRecord();
                    userApplication.UserID = user.ID;
                    userApplication.ApplicationID = application.ID;
                    userApplication.Sequence = appIndex; // Set sequence based on order
                    userApplication.IsActive = true;

                    const userApplicationSaveResult: boolean = await userApplication.Save();
                    if(userApplicationSaveResult){
                        LogStatus(`Created User Application ${application.Name} for new user ${user.Name}`);

                        //now create a UserApplicationEntity records for each entity in the application
                        const rv: RunView = new RunView();
                        const rvResult: RunViewResult<ApplicationEntityEntityType> = await rv.RunView({
                            EntityName: 'Application Entities',
                            ExtraFilter: `ApplicationID = '${application.ID}' and DefaultForNewUser = 1`,
                        }, contextUser);

                        if(!rvResult.Success){
                            LogError(`Failed to load Application Entities for Application ${application.Name} for new user ${user.Name}:`, undefined, rvResult.ErrorMessage);
                            continue;
                        }

                        LogStatus(`Creating ${rvResult.Results.length} User Application Entities for User Application ${application.Name} for new user ${user.Name}`);

                        for(const [index, appEntity] of rvResult.Results.entries()){
                            const userAppEntity: UserApplicationEntityEntity = await md.GetEntityObject<UserApplicationEntityEntity>('User Application Entities', contextUser);
                            userAppEntity.NewRecord();
                            userAppEntity.UserApplicationID = userApplication.ID;
                            userAppEntity.EntityID = appEntity.EntityID;
                            userAppEntity.Sequence = index;

                            const userAppEntitySaveResult: boolean = await userAppEntity.Save();
                            if(userAppEntitySaveResult){
                                LogStatus(`Created User Application Entity ${appEntity.Entity} for new user ${user.Name}`);
                            }
                            else{
                                LogError(`Failed to create User Application Entity for new user ${user.Name}:`, undefined, userAppEntity.LatestResult);
                            }
                        }
                    }
                    else{
                        LogError(`Failed to create User Application ${application.Name} for new user ${user.Name}:`, undefined, userApplication.LatestResult);
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
