/**
 * History recorder for MJ Open Apps.
 *
 * Records installation state in the MJ: Open Apps table and creates
 * audit trail entries in MJ: Open App Install Histories.
 *
 * NOTE: This module depends on MJ entity APIs at runtime (Metadata, RunView).
 * The import is done dynamically to avoid a hard dependency on @memberjunction/core
 * from this package.
 */
import type {
    AppStatus,
    InstallAction,
    ErrorPhase,
    InstalledAppInfo,
    AppInstallCallbacks
} from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/**
 * Interface for the MJ data layer, injected by the CLI at runtime.
 * This avoids a hard package dependency on @memberjunction/core.
 */
export interface MJDataProvider {
    /** Creates a new record in the given entity */
    CreateRecord(entityName: string, values: Record<string, unknown>, contextUserId: string): Promise<string>;
    /** Updates an existing record in the given entity */
    UpdateRecord(entityName: string, id: string, values: Record<string, unknown>, contextUserId: string): Promise<void>;
    /** Finds a record by filter */
    FindRecord(entityName: string, filter: string): Promise<Record<string, unknown> | null>;
    /** Finds all records matching a filter */
    FindRecords(entityName: string, filter: string): Promise<Record<string, unknown>[]>;
}

/**
 * Records a new app installation in the MJ: Open Apps table.
 *
 * @param provider - MJ data provider
 * @param manifest - The validated app manifest
 * @param userId - The user performing the installation
 * @param callbacks - Progress callbacks
 * @returns The new OpenApp record ID
 */
export async function RecordAppInstallation(
    provider: MJDataProvider,
    manifest: MJAppManifest,
    userId: string,
    callbacks?: AppInstallCallbacks
): Promise<string> {
    callbacks?.OnProgress?.('Record', 'Recording app installation...');

    const values: Record<string, unknown> = {
        Name: manifest.name,
        DisplayName: manifest.displayName,
        Description: manifest.description ?? null,
        Version: manifest.version,
        Publisher: manifest.publisher.name,
        PublisherEmail: manifest.publisher.email ?? null,
        PublisherURL: manifest.publisher.url ?? null,
        RepositoryURL: manifest.repository,
        SchemaName: manifest.schema?.name ?? null,
        MJVersionRange: manifest.mjVersionRange,
        License: manifest.license ?? null,
        Icon: manifest.icon ?? null,
        Color: manifest.color ?? null,
        ManifestJSON: JSON.stringify(manifest),
        ConfigurationSchemaJSON: manifest.configuration
            ? JSON.stringify(manifest.configuration)
            : null,
        InstalledByUserID: userId,
        Status: 'Active' as AppStatus
    };

    const id = await provider.CreateRecord('MJ: Open Apps', values, userId);
    callbacks?.OnSuccess?.('Record', `App '${manifest.name}' recorded as installed`);
    return id;
}

/**
 * Updates an existing app record (e.g., after upgrade or status change).
 *
 * @param provider - MJ data provider
 * @param appId - The OpenApp record ID
 * @param updates - Fields to update
 * @param userId - The user performing the update
 */
export async function UpdateAppRecord(
    provider: MJDataProvider,
    appId: string,
    updates: Record<string, unknown>,
    userId: string
): Promise<void> {
    await provider.UpdateRecord('MJ: Open Apps', appId, updates, userId);
}

/**
 * Sets the status of an installed app.
 */
export async function SetAppStatus(
    provider: MJDataProvider,
    appId: string,
    status: AppStatus,
    userId: string
): Promise<void> {
    await UpdateAppRecord(provider, appId, { Status: status }, userId);
}

/**
 * Records an install history entry (install, upgrade, or remove).
 *
 * @param provider - MJ data provider
 * @param appId - The OpenApp record ID
 * @param action - The action performed
 * @param manifest - The manifest at this version
 * @param userId - The user who performed the action
 * @param details - Additional details (previous version, duration, errors)
 */
export async function RecordInstallHistoryEntry(
    provider: MJDataProvider,
    appId: string,
    action: InstallAction,
    manifest: MJAppManifest,
    userId: string,
    details: {
        PreviousVersion?: string;
        DurationSeconds?: number;
        Success: boolean;
        ErrorMessage?: string;
        ErrorPhase?: ErrorPhase;
        Summary?: string;
    }
): Promise<string> {
    const values: Record<string, unknown> = {
        OpenAppID: appId,
        Version: manifest.version,
        PreviousVersion: details.PreviousVersion ?? null,
        Action: action,
        ManifestJSON: JSON.stringify(manifest),
        Summary: details.Summary ?? null,
        ExecutedByUserID: userId,
        DurationSeconds: details.DurationSeconds ?? null,
        Success: details.Success,
        ErrorMessage: details.ErrorMessage ?? null,
        ErrorPhase: details.ErrorPhase ?? null
    };

    return provider.CreateRecord('MJ: Open App Install Histories', values, userId);
}

/**
 * Records dependency relationships for an installed app.
 *
 * @param provider - MJ data provider
 * @param appId - The OpenApp record ID
 * @param dependencies - Map of dependency app name to version range
 * @param userId - The user performing the operation
 */
export async function RecordAppDependencies(
    provider: MJDataProvider,
    appId: string,
    dependencies: Record<string, string>,
    userId: string
): Promise<void> {
    for (const [depName, versionRange] of Object.entries(dependencies)) {
        // Try to find the dependency app record
        const depApp = await provider.FindRecord(
            'MJ: Open Apps',
            `Name = '${depName}'`
        );

        const values: Record<string, unknown> = {
            OpenAppID: appId,
            DependsOnAppName: depName,
            DependsOnAppID: depApp ? depApp['ID'] : null,
            VersionRange: versionRange,
            InstalledVersion: depApp ? depApp['Version'] : null,
            Status: depApp ? 'Satisfied' : 'Missing'
        };

        await provider.CreateRecord('MJ: Open App Dependencies', values, userId);
    }
}

/**
 * Looks up an installed app by name.
 *
 * @param provider - MJ data provider
 * @param appName - The app name to look up
 * @returns The app record, or null if not found
 */
export async function FindInstalledApp(
    provider: MJDataProvider,
    appName: string
): Promise<InstalledAppInfo | null> {
    const record = await provider.FindRecord(
        'MJ: Open Apps',
        `Name = '${appName}'`
    );

    if (!record) {
        return null;
    }

    return record as unknown as InstalledAppInfo;
}

/**
 * Lists all installed apps.
 *
 * @param provider - MJ data provider
 * @returns Array of installed app records
 */
export async function ListInstalledApps(
    provider: MJDataProvider
): Promise<InstalledAppInfo[]> {
    const records = await provider.FindRecords('MJ: Open Apps', "Status <> 'Removing'");
    return records as unknown[] as InstalledAppInfo[];
}

/**
 * Checks if any installed apps depend on the given app.
 *
 * @param provider - MJ data provider
 * @param appName - The app name to check dependents for
 * @returns List of app names that depend on this app
 */
export async function FindDependentApps(
    provider: MJDataProvider,
    appName: string
): Promise<string[]> {
    const records = await provider.FindRecords(
        'MJ: Open App Dependencies',
        `DependsOnAppName = '${appName}'`
    );

    const appIds = records.map(r => r['OpenAppID'] as string);
    const dependentNames: string[] = [];

    for (const appId of appIds) {
        const app = await provider.FindRecord('MJ: Open Apps', `ID = '${appId}'`);
        if (app) {
            dependentNames.push(app['Name'] as string);
        }
    }

    return dependentNames;
}
