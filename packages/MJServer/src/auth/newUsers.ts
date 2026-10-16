import { ApplicationInfo, CompositeKey, EntitySaveOptions, IMetadataProvider, LogError, LogStatus, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import { RecordCloneEngine } from "@memberjunction/record-cloning";
import { RegisterClass } from "@memberjunction/global";
import { ResolveConfiguredPrincipal } from "./principals.js";
import { configInfo } from "../config.js";
import { CreateIsolatedProvider } from "../isolatedProvider.js";
import { MJUserEntity, MJUserRoleEntity, MJUserApplicationEntity, MJUserApplicationEntityEntity, MJApplicationEntityType, MJApplicationEntityEntityType, UserInfoEngine } from "@memberjunction/core-entities";

export class NewUserBase {
    public async createNewUser(firstName: string, lastName: string, email: string, linkedRecordType: string = 'None', linkedEntityId?: string, linkedEntityRecordId?: string): Promise<MJUserEntity | null> {  // case-violation-ok-legacy-back-compat: a subclass overrides this; a stub preserves CALLING the old name but not OVERRIDING it
        try {
            const contextUser: UserInfo | null = ResolveConfiguredPrincipal(
                configInfo?.userHandling?.contextUserForNewUserCreation,
                'NewUser',
            );
            if (!contextUser) {
                LogError(`No system user or active Owner found in the database, cannot create a new user`);
                return null;
            }

            // Everything here, metadata lookups, entity objects and the transaction, goes through ONE
            // isolated provider. This runs in the JWT auth flow, before AppContext.providers exists, and
            // the global Metadata.Provider is shared by every concurrent request: a transaction opened
            // there nests into anyone else's and swallows their writes (see CreateIsolatedProvider).
            const provider = await CreateIsolatedProvider();

            // A configured template user is copied whole; a plain user is created only if it can't be.
            const template = configInfo?.userHandling?.newUserTemplate;
            if (template?.email) {
                const fromTemplate = await this.createFromTemplate(provider, contextUser, template.email, template.preset, firstName, lastName, email, linkedRecordType, linkedEntityId, linkedEntityRecordId);
                if (fromTemplate) return fromTemplate;
                LogError(`Could not create ${email} from template user ${template.email}; creating a plain user instead`);
            }

            const user = await provider.GetEntityObject<MJUserEntity>('MJ: Users', contextUser) // To-Do - change this to be a different defined user for the user creation process
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
            await provider.BeginTransaction();
            try {
                if (!await user.Save()) {
                    throw new Error(`Failed to create new user ${firstName} ${lastName} ${email}: ${user.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }

                if(configInfo.userHandling && configInfo.userHandling.newUserRoles){
                    LogStatus(`User ${user.Email} created, assigning roles`);
                    for (const role of configInfo.userHandling.newUserRoles) {
                        const userRole = provider.Roles.find(r => r.Name === role);
                        if (!userRole) {
                            LogError(`Role ${role} not found in the database, cannot assign to new user ${user.Name}`);
                            continue;
                        }

                        const userRoleEntity: MJUserRoleEntity = await provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', contextUser);
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
                            const application: ApplicationInfo | undefined = provider.Applications.find(a => a.Name.trim().toLocaleLowerCase() === toLowerCase);
                            if (application) {
                                applicationsToCreate.push(application);
                            } else {
                                LogError(`Application ${appName} not found in the Metadata, cannot assign to new user ${user.Name}`);
                            }
                        }
                    } else {
                        LogStatus(`No UserApplications configured, using DefaultForNewUser applications for new user ${user.Name}`);
                        // Bug F2: use the shared selector, which filters to Active apps flagged
                        // DefaultForNewUser (in DefaultSequence order). This path previously omitted the
                        // Status = 'Active' check, so an inactive default app could be provisioned here.
                        applicationsToCreate = UserInfoEngine.GetDefaultApplicationsForNewUser(provider);
                        LogStatus(`Found ${applicationsToCreate.length} active applications with DefaultForNewUser=true`);
                    }

                    for (const [appIndex, application] of applicationsToCreate.entries()) {
                        const userApplication: MJUserApplicationEntity = await provider.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', contextUser);
                        userApplication.NewRecord();
                        userApplication.UserID = user.ID;
                        userApplication.ApplicationID = application.ID;
                        userApplication.Sequence = appIndex;
                        userApplication.IsActive = true;

                        if (!await userApplication.Save()) {
                            throw new Error(`Failed to create User Application ${application.Name} for new user ${user.Name}: ${userApplication.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        }
                        LogStatus(`Created User Application ${application.Name} for new user ${user.Name}`);

                        const rv: RunView = RunView.FromMetadataProvider(provider);
                        // Boolean literal goes through the active provider's dialect:
                        //   SQL Server emits `= 1`, PostgreSQL emits `= TRUE`.
                        // This keeps the filter server-side (no client-side `.filter()`
                        // pass) and uses the single source-of-truth helper instead of
                        // hardcoded SQL that is correct on one dialect but breaks on
                        // the other.
                        const trueLit = provider.Dialect.BooleanLiteral(true);
                        const rvResult: RunViewResult<MJApplicationEntityEntityType> = await rv.RunView({
                            EntityName: 'MJ: Application Entities',
                            ExtraFilter: `ApplicationID = '${application.ID}' AND DefaultForNewUser = ${trueLit}`,
                        }, contextUser);

                        if(!rvResult.Success){
                            LogError(`Failed to load Application Entities for Application ${application.Name} for new user ${user.Name}:`, undefined, rvResult.ErrorMessage);
                            continue;
                        }

                        const defaultForNewUserEntities = rvResult.Results;

                        LogStatus(`Creating ${defaultForNewUserEntities.length} User Application Entities for User Application ${application.Name} for new user ${user.Name}`);

                        for(const [index, appEntity] of defaultForNewUserEntities.entries()){
                            const userAppEntity: MJUserApplicationEntityEntity = await provider.GetEntityObject<MJUserApplicationEntityEntity>('MJ: User Application Entities', contextUser);
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

    /**
     * Creates the new user as a copy of the template user `templateEmail`, through the `MJ: Users`
     * clone `preset`: its roles, apps, views, settings, dashboards and conversations come with it, owned
     * by the new user. The clone engine creates users inactive for review; a user signing in is active.
     *
     * @returns the new user, or null when the template is missing, isn't flagged IsTemplate, or the copy
     *          fails (the reason is logged and the caller falls back to a plain user).
     */
    protected async createFromTemplate(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        templateEmail: string,
        preset: string,
        firstName: string,
        lastName: string,
        email: string,
        linkedRecordType: string,
        linkedEntityId?: string,
        linkedEntityRecordId?: string
    ): Promise<MJUserEntity | null> {
        const lookup = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; IsTemplate: boolean }>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `Email = '${templateEmail.replace(/'/g, "''")}'`,
                Fields: ['ID', 'IsTemplate'],
                ResultType: 'simple',
                MaxRows: 1,
            },
            contextUser
        );
        const templateUser = lookup.Success ? lookup.Results[0] : undefined;
        if (!templateUser) {
            LogError(`userHandling.newUserTemplate: no user has the email ${templateEmail}`);
            return null;
        }
        if (!templateUser.IsTemplate) {
            LogError(`userHandling.newUserTemplate: ${templateEmail} is not marked as a template user (IsTemplate)`);
            return null;
        }

        const result = await new RecordCloneEngine(provider).Clone(
            {
                EntityName: 'MJ: Users',
                SourceRecordKey: CompositeKey.FromID(templateUser.ID),
                Preset: preset,
                PromptedValues: { Email: email, FirstName: firstName, LastName: lastName },
                Options: { Reason: `New user ${email} created at first sign-in from template ${templateEmail}` },
            },
            contextUser
        );
        const newKey = result.Roots?.[0]?.TargetKey.KeyValuePairs.find((kvp) => kvp.FieldName === 'ID')?.Value;
        if (!result.Success || !newKey) {
            const reasons = result.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message);
            LogError(`userHandling.newUserTemplate: copying ${templateEmail} failed: ${result.ErrorMessage || reasons.join('; ') || result.ResultCode}`);
            return null;
        }

        const user = await provider.GetEntityObject<MJUserEntity>('MJ: Users', contextUser);
        if (!(await user.Load(String(newKey)))) {
            LogError(`userHandling.newUserTemplate: the copy of ${templateEmail} for ${email} could not be loaded`);
            return null;
        }
        user.IsActive = true;
        user.LinkedRecordType = linkedRecordType;
        if (linkedEntityId) user.LinkedEntityID = linkedEntityId;
        if (linkedEntityRecordId) user.LinkedEntityRecordID = linkedEntityRecordId;
        if (!(await user.Save())) {
            LogError(`userHandling.newUserTemplate: could not activate ${email}: ${user.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }
        LogStatus(`Created user ${email} from template ${templateEmail} (${result.RecordsCloned ?? result.Created?.length ?? 0} records copied)`);
        return user;
    }
}
