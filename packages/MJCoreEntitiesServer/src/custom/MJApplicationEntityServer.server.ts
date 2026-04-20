import { BaseEntity, DatabaseProviderBase, EntityInfo, EntitySaveOptions, LogError, LogStatus, Metadata, RunView, IMetadataProvider } from "@memberjunction/core";
import { MJApplicationEntity, MJUserApplicationEntity } from "@memberjunction/core-entities";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";

/**
 * Server-Only custom sub-class for Applications entity.
 * Handles:
 * 1. Auto-generation of Path from Name (when AutoUpdatePath = true)
 * 2. Automatic UserApplication record creation when:
 *    a. A new application is created with DefaultForNewUser = true
 *    b. An existing application's DefaultForNewUser is changed from false to true
 */
@RegisterClass(BaseEntity, 'MJ: Applications')
export class MJApplicationEntityServer extends MJApplicationEntity {
    constructor(Entity: EntityInfo) {
        super(Entity);

        // Verify this is running server-side only
        const md = new Metadata();
        if (md.ProviderType !== 'Database')
            throw new Error('This class is only supported for server-side/database providers. Remove this package from your application.');
    }

    /**
     * Override Save to handle:
     * 1. Auto-generation of Path from Name
     * 2. Automatic UserApplication creation for default apps
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const provider = Metadata.Provider as DatabaseProviderBase;

        // Auto-generate Path from Name if AutoUpdatePath is true
        await this.autoGeneratePath();

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
     * Auto-generates Path from Name if AutoUpdatePath is true.
     * Path is a URL-friendly slug: lowercase, spaces to hyphens, special chars removed.
     * Handles duplicates by appending a number suffix.
     */
    protected async autoGeneratePath(): Promise<void> {
        // Only auto-generate if AutoUpdatePath is true
        if (!this.AutoUpdatePath) {
            return;
        }

        // Only auto-generate if Name changed or Path is empty
        const nameField = this.GetFieldByName('Name');
        const pathField = this.GetFieldByName('Path');
        const isNewRecord = !this.IsSaved;

        if (!isNewRecord && !nameField.Dirty && this.Path) {
            return; // Name hasn't changed and Path already exists
        }

        // Generate base slug from Name
        let baseSlug = this.generateSlugFromName(this.Name);

        // Check for duplicates and append number if needed
        const uniqueSlug = await this.ensureUniqueSlug(baseSlug);

        // Set the Path
        this.Path = uniqueSlug;
    }

    /**
     * Converts a name to a URL-friendly slug.
     * Example: "Data Explorer" -> "data-explorer"
     */
    protected generateSlugFromName(name: string): string {
        if (!name) {
            return '';
        }

        return name
            .toLowerCase()
            .trim()
            .replace(/['"]/g, '')           // Remove quotes and apostrophes
            .replace(/[()[\]{}]/g, '')      // Remove brackets and parentheses
            .replace(/[^a-z0-9\s-]/g, '')   // Remove other special characters
            .replace(/\s+/g, '-')           // Replace spaces with hyphens
            .replace(/-+/g, '-')            // Collapse multiple hyphens
            .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
    }

    /**
     * Ensures the slug is unique by appending a number suffix if needed.
     * Example: "my-app" -> "my-app-2" if "my-app" already exists.
     */
    protected async ensureUniqueSlug(baseSlug: string): Promise<string> {
        const rv = this.RunViewProviderToUse;

        // Look for existing applications with this path or path-N pattern
        const result = await rv.RunView<MJApplicationEntity>({
            EntityName: 'MJ: Applications',
            ExtraFilter: `Path = '${baseSlug}' OR Path LIKE '${baseSlug}-%'`,
            ResultType: 'simple'
        }, this.ContextCurrentUser);

        if (!result.Success || !result.Results || result.Results.length === 0) {
            return baseSlug; // No conflicts, use base slug
        }

        // Filter out the current record if we're updating
        const existingPaths = result.Results
            .filter((app: { ID: string }) => !UUIDsEqual(app.ID, this.ID))
            .map((app: { Path: string }) => app.Path);

        if (existingPaths.length === 0) {
            return baseSlug; // Only our own record has this path
        }

        // If base slug is not taken, use it
        if (!existingPaths.includes(baseSlug)) {
            return baseSlug;
        }

        // Find the next available number suffix
        let suffix = 2;
        while (existingPaths.includes(`${baseSlug}-${suffix}`)) {
            suffix++;
        }

        return `${baseSlug}-${suffix}`;
    }

    /**
     * Calculates the appropriate Sequence value for a new UserApplication record
     * using the application's DefaultSequence to determine placement.
     * If DefaultSequence fits between existing sequences, it's used directly.
     * Otherwise, the app is appended after the highest existing sequence.
     */
    protected calculateSequenceFromDefault(existingUserApps: {Sequence: number}[]): number {
        const defaultSeq = this.DefaultSequence ?? 100;

        if (existingUserApps.length === 0) {
            return defaultSeq;
        }

        // Check if DefaultSequence conflicts with an existing sequence
        const existingSequences = new Set(existingUserApps.map(ua => ua.Sequence || 0));
        if (!existingSequences.has(defaultSeq)) {
            return defaultSeq;
        }

        // Conflict exists — append after the highest existing sequence
        const maxSequence = Math.max(...existingSequences);
        return maxSequence + 1;
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
                    EntityName: 'MJ: Users',
                    ExtraFilter: 'IsActive = 1',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: User Applications',
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
                    UUIDsEqual(ua.UserID, user.ID) && UUIDsEqual(ua.ApplicationID, this.ID)
                );

                // Skip if already exists
                if (existingForUserApp.length > 0) {
                    LogStatus(`UserApplication already exists for user ${user.Name}, skipping`);
                    continue;
                }

                // Calculate sequence using DefaultSequence to place the app in its intended position
                const userApps = allUserApps.filter((ua: {UserID: string}) => UUIDsEqual(ua.UserID, user.ID));
                const sequence = this.calculateSequenceFromDefault(userApps);

                // Create new UserApplication record
                const userApp = await md.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', this.ContextCurrentUser);
                userApp.NewRecord();
                userApp.UserID = user.ID;
                userApp.ApplicationID = this.ID;
                userApp.Sequence = sequence;
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