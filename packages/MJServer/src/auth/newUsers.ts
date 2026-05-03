import { ApplicationInfo, DatabaseProviderBase, EntitySaveOptions, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { configInfo } from "../config.js";
import { MJUserEntity, MJUserRoleEntity, MJUserApplicationEntity, MJUserApplicationEntityEntity, MJApplicationEntityType, MJApplicationEntityEntityType } from "@memberjunction/core-entities";

export class NewUserBase {
    public async createNewUser(firstName: string, lastName: string, email: string, linkedRecordType: string = 'None', linkedEntityId?: string, linkedEntityRecordId?: string): Promise<MJUserEntity | null> {
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

            const md: Metadata = new Metadata(); // global-provider-ok: new-user creation runs in the JWT auth flow, before AppContext.providers is built
            const user = await md.GetEntityObject<MJUserEntity>('MJ: Users', contextUser) // To-Do - change this to be a different defined user for the user creation process
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

            // Create the user and all of its role/application/app-entity records atomically.
            // If any Save fails partway through, the whole provisioning rolls back so we never
            // leave a half-created user with partial roles/applications behind.
            const provider = Metadata.Provider as DatabaseProviderBase; // global-provider-ok: new-user creation runs in the JWT auth flow, before AppContext.providers is built
            await provider.BeginTransaction();
            try {
                if (!await user.Save()) {
                    throw new Error(`Failed to create new user ${firstName} ${lastName} ${email}: ${user.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }

                if(configInfo.userHandling && configInfo.userHandling.newUserRoles){
                    LogStatus(`User ${user.Email} created, assigning roles`);
                    for (const role of configInfo.userHandling.newUserRoles) {
                        const userRole = md.Roles.find(r => r.Name === role);
                        if (!userRole) {
                            LogError(`Role ${role} not found in the database, cannot assign to new user ${user.Name}`);
                            continue;
                        }

                        const userRoleEntity: MJUserRoleEntity = await md.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', contextUser);
                        userRoleEntity.NewRecord();
                        userRoleEntity.UserID = user.ID;
                        userRoleEntity.RoleID = userRole.ID;
                        if (!await userRoleEntity.Save()) {
                            throw new Error(`Failed to assign role ${role} to new user ${user.Name}: ${userRoleEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        }
                        LogStatus(`Assigned role ${role} to new user ${user.Name}`);
                    }
                }

                if (configInfo.userHandling && configInfo.userHandling.CreateUserApplicationRecords) {
                    LogStatus("Creating User Applications for new user: " + user.Name);

                    let applicationsToCreate: ApplicationInfo[] = [];

                    if (configInfo.userHandling.UserApplications && configInfo.userHandling.UserApplications.length > 0) {
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
                        LogStatus(`No UserApplications configured, using DefaultForNewUser applications for new user ${user.Name}`);
                        applicationsToCreate = md.Applications
                            .filter(a => a.DefaultForNewUser)
                            .sort((a, b) => (a.DefaultSequence ?? 100) - (b.DefaultSequence ?? 100));
                        LogStatus(`Found ${applicationsToCreate.length} applications with DefaultForNewUser=true`);
                    }

                    for (const [appIndex, application] of applicationsToCreate.entries()) {
                        const userApplication: MJUserApplicationEntity = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', contextUser);
                        userApplication.NewRecord();
                        userApplication.UserID = user.ID;
                        userApplication.ApplicationID = application.ID;
                        userApplication.Sequence = appIndex;
                        userApplication.IsActive = true;

                        if (!await userApplication.Save()) {
                            throw new Error(`Failed to create User Application ${application.Name} for new user ${user.Name}: ${userApplication.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        }
                        LogStatus(`Created User Application ${application.Name} for new user ${user.Name}`);

                        const rv: RunView = new RunView();
                        const rvResult: RunViewResult<MJApplicationEntityEntityType> = await rv.RunView({
                            EntityName: 'MJ: Application Entities',
                            ExtraFilter: `ApplicationID = '${application.ID}' and DefaultForNewUser = 1`,
                        }, contextUser);

                        if(!rvResult.Success){
                            LogError(`Failed to load Application Entities for Application ${application.Name} for new user ${user.Name}:`, undefined, rvResult.ErrorMessage);
                            continue;
                        }

                        LogStatus(`Creating ${rvResult.Results.length} User Application Entities for User Application ${application.Name} for new user ${user.Name}`);

                        for(const [index, appEntity] of rvResult.Results.entries()){
                            const userAppEntity: MJUserApplicationEntityEntity = await md.GetEntityObject<MJUserApplicationEntityEntity>('MJ: User Application Entities', contextUser);
                            userAppEntity.NewRecord();
                            userAppEntity.UserApplicationID = userApplication.ID;
                            userAppEntity.EntityID = appEntity.EntityID;
                            userAppEntity.Sequence = index;

                            if (!await userAppEntity.Save()) {
                                throw new Error(`Failed to create User Application Entity for new user ${user.Name}: ${userAppEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                            }
                            LogStatus(`Created User Application Entity ${appEntity.Entity} for new user ${user.Name}`);
                        }
                    }
                }

                await provider.CommitTransaction();
            } catch (txErr) {
                await provider.RollbackTransaction();
                LogError(txErr);
                return null;
            }

            return user;
        }
        catch (e) {
            LogError(e);
            return undefined;
        }
    }
}
