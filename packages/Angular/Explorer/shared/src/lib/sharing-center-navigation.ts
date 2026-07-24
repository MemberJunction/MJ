import { firstValueFrom } from 'rxjs';
import { CompositeKey, NormalizedPermission } from '@memberjunction/core';
import { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import { NavigationService } from './navigation.service';

/**
 * Opens a resource surfaced by the user Sharing Center with the Explorer route
 * that understands that resource's permission domain.
 *
 * Both the quick-glance dialog and the full Sharing Center use this helper so
 * a resource always opens to the same destination regardless of entry point.
 */
export async function OpenSharedResourceInExplorer(
    row: NormalizedPermission,
    navigationService: NavigationService,
    appManager: ApplicationManager
): Promise<boolean> {
    if (!row.ResourceID) {
        return false;
    }

    switch (row.DomainName) {
        case 'Dashboard Permissions':
            navigationService.OpenDashboard(row.ResourceID, row.ResourceName ?? 'Dashboard');
            return true;

        case 'Artifact Permissions':
            navigationService.OpenArtifact(row.ResourceID, row.ResourceName);
            return true;

        case 'Collection Permissions':
            return OpenSharedCollection(row.ResourceID, navigationService, appManager);

        case 'Query Permissions':
            navigationService.OpenQuery(row.ResourceID, row.ResourceName ?? 'Query');
            return true;

        case 'Resource Permissions':
        case 'Access Control Rules':
            if (!row.ResourceType) {
                return false;
            }
            const key = new CompositeKey();
            key.KeyValuePairs.push({ FieldName: 'ID', Value: row.ResourceID });
            navigationService.OpenEntityRecord(row.ResourceType, key);
            return true;

        default:
            return false;
    }
}

/** Opens the full application from the quick-glance dialog without assuming an app ID. */
export async function OpenSharingCenterApplication(
    navigationService: NavigationService,
    appManager: ApplicationManager
): Promise<boolean> {
    const apps = await firstValueFrom(appManager.Applications).catch((): BaseApplication[] => []);
    const application = apps.find((app) => app.Name === 'Sharing Center');
    if (!application) {
        return false;
    }

    const navItems = await application.GetNavItems();
    const navItem = navItems.find(
        (item) => item.DriverClass === 'SharingCenterResource' && (item.Status ?? 'Active') === 'Active'
    );
    if (!navItem) {
        return false;
    }

    await navigationService.SwitchToApp(application.ID, navItem.Label);
    return true;
}

/** Collections live in the Chat app, whose identity is not fixed across deployments. */
async function OpenSharedCollection(
    collectionId: string,
    navigationService: NavigationService,
    appManager: ApplicationManager
): Promise<boolean> {
    const apps = await firstValueFrom(appManager.Applications).catch((): BaseApplication[] => []);
    for (const app of apps) {
        const navItems = await app.GetNavItems();
        const collectionsNav = navItems.find(
            (item) => item.DriverClass === 'ChatCollectionsResource' && (item.Status ?? 'Active') === 'Active'
        );
        if (collectionsNav) {
            await navigationService.SwitchToApp(app.ID, collectionsNav.Label, { collectionId });
            return true;
        }
    }
    return false;
}
