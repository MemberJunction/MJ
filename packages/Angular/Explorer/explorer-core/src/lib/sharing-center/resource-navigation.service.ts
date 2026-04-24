import { CompositeKey, NormalizedPermission } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { NavigationService } from '@memberjunction/ng-shared';

/**
 * Resolves a `{DomainName, ResourceType, ResourceID}` triple to an MJ Explorer tab
 * via {@link NavigationService}. Extracted as a standalone class so downstream apps
 * can register a subclass to add or override mappings for domains we don't ship
 * a default for (AI Agents, Collections, Query Permissions, etc.).
 *
 * Instantiated by {@link UserSharingCenterComponent} through `MJGlobal.ClassFactory`;
 * subclasses automatically win via registration priority (see Angular CLAUDE.md's
 * ClassFactory rules) because they import and extend this class.
 *
 * @example
 * ```typescript
 * @RegisterClass(ResourceNavigationService)
 * export class MyAppResourceNavigationService extends ResourceNavigationService {
 *     override OpenResource(row: NormalizedPermission): boolean {
 *         if (row.DomainName === 'AI Agent Permissions' && row.ResourceID) {
 *             this.navigationService.OpenEntityRecord('AI Agents', this.keyFor(row.ResourceID));
 *             return true;
 *         }
 *         return super.OpenResource(row);
 *     }
 * }
 * ```
 */
@RegisterClass(ResourceNavigationService)
export class ResourceNavigationService {
    protected navigationService!: NavigationService;

    /**
     * Called by {@link UserSharingCenterComponent} after construction. We can't take
     * the NavigationService through the constructor because `ClassFactory.CreateInstance`
     * doesn't plumb dependency injection — so the component wires it in explicitly.
     */
    public Initialize(navigationService: NavigationService): void {
        this.navigationService = navigationService;
    }

    /**
     * Attempt to open the resource described by this permission row.
     * Returns `true` when a navigation was issued, `false` when no mapping exists
     * for this domain/resource combination (the caller typically keeps the dialog
     * open in that case so the user can try another row).
     */
    public OpenResource(row: NormalizedPermission): boolean {
        if (!row.ResourceID) return false;

        switch (row.DomainName) {
            case 'Dashboard Permissions':
                this.navigationService.OpenDashboard(row.ResourceID, row.ResourceName ?? 'Dashboard');
                return true;

            case 'Artifact Permissions':
                this.navigationService.OpenArtifact(row.ResourceID, row.ResourceName);
                return true;

            case 'Query Permissions':
                this.navigationService.OpenQuery(row.ResourceID, row.ResourceName ?? 'Query');
                return true;

            case 'Resource Permissions':
            case 'Access Control Rules':
                // Resource Permissions.ResourceType and Access Control Rules.Entity both
                // carry the target entity name, so the generic record opener does the job.
                if (row.ResourceType) {
                    this.navigationService.OpenEntityRecord(row.ResourceType, this.keyFor(row.ResourceID));
                    return true;
                }
                return false;

            default:
                // No default mapping for AI Agents / Collections / Application Roles / etc.
                // — downstream apps can override this method to add them.
                return false;
        }
    }

    protected keyFor(recordId: string): CompositeKey {
        const key = new CompositeKey();
        key.KeyValuePairs.push({ FieldName: 'ID', Value: recordId });
        return key;
    }
}
