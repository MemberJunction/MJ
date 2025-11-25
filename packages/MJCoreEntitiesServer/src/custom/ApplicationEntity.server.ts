import { BaseEntity, DatabaseProviderBase, EntityInfo, EntitySaveOptions, LogError, LogStatus, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { ApplicationEntity, UserApplicationEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

/**
 * Server-Only custom sub-class for Applications entity.
 * Handles automatic UserApplication record creation when:
 * 1. A new application is created with DefaultForNewUser = true
 * 2. An existing application's DefaultForNewUser is changed from false to true
 */
@RegisterClass(BaseEntity, 'Applications')
export class ApplicationEntityServerEntity extends ApplicationEntity {
    constructor(Entity: EntityInfo) {
        super(Entity);

        // Verify this is running server-side only
        const md = new Metadata();
        if (md.ProviderType !== 'Database')
            throw new Error('This class is only supported for server-side/database providers. Remove this package from your application.');
    }

    /**
     * Override Save to handle automatic UserApplication creation for default apps
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const provider = Metadata.Provider as DatabaseProviderBase;

        // Track state before save
        const isNewRecord = !this.IsSaved;
        const defaultForNewUserField = this.GetFieldByName('DefaultForNewUser');
        const wasDefaultForNewUser = !isNewRecord && !defaultForNewUserField.Dirty
            ? this.DefaultForNewUser
            : false;
        const isNowDefaultForNewUser = this.DefaultForNewUser;

        // Determine if we need to create UserApplication records
        const shouldCreateUserApps = isNowDefaultForNewUser && (
            isNewRecord || // New app with DefaultForNewUser = 1
            (!wasDefaultForNewUser && isNowDefaultForNewUser) // Changed from false to true
        );

        // Start transaction
        await provider.BeginTransaction();

        try {
            // Save the application first
            if (!await super.Save(options)) {
                await provider.RollbackTransaction();
                return false;
            }

            // Create UserApplication records if needed
            if (shouldCreateUserApps) {
                await this.CreateUserApplicationsForAllUsers();
            }

            // Commit transaction
            await provider.CommitTransaction();
            return true;
        }
        catch (e) {
            // Rollback on error
            await provider.RollbackTransaction();
            LogError(`Failed to save Application ${this.Name}:`, e);
            throw e;
        }
    }

    /**
     * Creates UserApplication records for all users in the system for this application
     */
    protected async CreateUserApplicationsForAllUsers(): Promise<void> {
        try {
            LogStatus(`Creating UserApplication records for all users for application: ${this.Name}`);

            // Use the entity's provider
            const md = this.ProviderToUse as any as IMetadataProvider;
            const rv = this.RunViewProviderToUse;

            // Load all data in a single RunViews call
            const [usersResult, allUserAppsResult] = await rv.RunViews([
                {
                    EntityName: 'Users',
                    ExtraFilter: 'IsActive = 1',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'User Applications',
                    ExtraFilter: '', // Load all UserApplications
                    ResultType: 'simple'
                }
            ], this.ContextCurrentUser);

            if (!usersResult.Success) {
                throw new Error(`Failed to load users: ${usersResult.ErrorMessage}`);
            }

            if (!allUserAppsResult.Success) {
                throw new Error(`Failed to load user applications: ${allUserAppsResult.ErrorMessage}`);
            }

            const users = usersResult.Results || [];
            const allUserApps = allUserAppsResult.Results || [];

            LogStatus(`Found ${users.length} active users`);

            // For each user, create a UserApplication record
            for (const user of users) {
                // Filter existing UserApplications for this user/app combination (client-side)
                const existingForUserApp = allUserApps.filter((ua: any) =>
                    ua.UserID === user.ID && ua.ApplicationID === this.ID
                );

                // Skip if already exists
                if (existingForUserApp.length > 0) {
                    LogStatus(`UserApplication already exists for user ${user.Name}, skipping`);
                    continue;
                }

                // Calculate max sequence for this user (client-side)
                const userApps = allUserApps.filter((ua: any) => ua.UserID === user.ID);
                let maxSequence = 0;
                if (userApps.length > 0) {
                    maxSequence = Math.max(...userApps.map((ua: any) => ua.Sequence || 0));
                }

                // Create new UserApplication record
                const userApp = await md.GetEntityObject<UserApplicationEntity>('User Applications', this.ContextCurrentUser);
                userApp.NewRecord();
                userApp.UserID = user.ID;
                userApp.ApplicationID = this.ID;
                userApp.Sequence = maxSequence + 1;
                userApp.IsActive = true;

                const saveResult = await userApp.Save();
                if (saveResult) {
                    LogStatus(`Created UserApplication for user ${user.Name} with sequence ${userApp.Sequence}`);
                } else {
                    const errorMsg = userApp.LatestResult ? JSON.stringify(userApp.LatestResult) : 'Unknown error';
                    LogError(`Failed to create UserApplication for user ${user.Name}: ${errorMsg}`);
                }
            }

            LogStatus(`Completed UserApplication creation for application: ${this.Name}`);
        }
        catch (e) {
            LogError('Failed to create UserApplication records:', e);
            throw e; // Re-throw since we're in a transaction
        }
    }
}

export function LoadApplicationEntityServer() {
    // Force class to load and register with the system
}
