import { UserInfo } from './securityInfo';

/**
 * Canonical permission action vocabulary. Every provider maps its domain-specific
 * permission flags (CRUD booleans, View/Edit/Owner levels, custom flags) onto this set.
 */
export type PermissionAction = 'Read' | 'Create' | 'Update' | 'Delete' | 'Share' | 'Execute' | 'Admin';

/**
 * Who is being granted or denied a permission.
 */
export type GranteeType = 'User' | 'Role' | 'Everyone' | 'Public';

/**
 * A normalized permission record returned by any provider. Providers translate
 * their native storage (EntityPermission, DashboardPermission, ResourcePermission, etc.)
 * into this shape so the Sharing Center and programmatic APIs can treat all permissions uniformly.
 */
export interface NormalizedPermission {
    /** The permission domain that produced this record (matches PermissionDomain.Name). */
    DomainName: string;
    /** The specific resource type within the domain (e.g., entity name, resource type name). */
    ResourceType: string;
    /** The ID of the specific resource. Null for domain-wide grants. */
    ResourceID: string | null;
    /** Human-readable name of the resource when available. */
    ResourceName?: string;
    /** The type of grantee. */
    GranteeType: GranteeType;
    /** The ID of the grantee. Null for Everyone or Public grants. */
    GranteeID: string | null;
    /** Human-readable name of the grantee when available. */
    GranteeName?: string;
    /** Which actions this record permits. */
    Actions: PermissionAction[];
    /** Whether this is an Allow or Deny record. Providers that don't support Deny always return Allow. */
    Effect: 'Allow' | 'Deny';
    /** Source-specific record ID useful for editing the underlying permission row. */
    SourceRecordID?: string;
    /** Optional expiration timestamp. */
    ExpiresAt?: Date;
}

/**
 * Result of a single permission check.
 */
export interface PermissionCheckResult {
    /** True if the action is permitted. */
    Allowed: boolean;
    /** Which provider domain made the decision. */
    DomainName: string;
    /** Human-readable explanation of why the decision was made. Useful for debug logs and audit UIs. */
    Reason: string;
    /** The matching permission record when one exists. */
    MatchedPermission?: NormalizedPermission;
}

/**
 * The contract every permission provider implements. Providers are thin facades over
 * existing subsystem engines (EntityInfo.GetUserPermisions, DashboardEngine, etc.) —
 * they translate between the provider-specific API and this normalized shape.
 *
 * Concrete providers should NOT implement this interface directly — extend
 * {@link PermissionProviderBase} instead so the class is registerable with ClassFactory.
 */
export interface IPermissionProvider {
    /** Unique name for this provider's domain; must match PermissionDomain.Name. */
    readonly DomainName: string;

    /** Human-readable description of what this provider covers. */
    readonly Description: string;

    /** What grantee types this provider supports. */
    readonly SupportedGranteeTypes: GranteeType[];

    /** What actions this provider can evaluate. */
    readonly SupportedActions: PermissionAction[];

    /** Whether this provider supports explicit Deny records. */
    readonly SupportsDeny: boolean;

    /**
     * Check if a user has a specific permission on a specific resource.
     * @param user The user whose permissions are being checked (roles come from user.UserRoles).
     * @param resourceType The resource type within this domain (e.g., entity name, resource type name).
     * @param resourceId The specific resource ID; null for domain-wide checks.
     * @param action The action being requested.
     */
    CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult>;

    /**
     * Get all effective permissions a user has on a specific resource. Returns an empty
     * array when the user has no access.
     */
    GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string): Promise<NormalizedPermission[]>;

    /**
     * Get all resources within this domain that the user has access to. Powers the
     * Sharing Center's "User Access Report" view.
     *
     * @param resourceType Optional filter to one resource type within the domain.
     */
    GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]>;

    /**
     * Get all permissions granted on a specific resource across every grantee. Powers
     * the Sharing Center's "Resource Access Report" view.
     */
    GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]>;
}

/**
 * Abstract base class that every concrete permission provider extends. Serves as both
 * the TypeScript type and the runtime {@link https://github.com/MemberJunction/MJ ClassFactory}
 * key, mirroring the pattern used by BaseFormComponent / BaseResourceComponent.
 *
 * Register concrete providers with: `@RegisterClass(PermissionProviderBase, 'MyProviderName')`
 * where 'MyProviderName' matches the ProviderClassName column in the PermissionDomain catalog.
 *
 * @example
 * ```typescript
 * @RegisterClass(PermissionProviderBase, 'MJEntityPermissionProvider')
 * export class EntityPermissionProvider extends PermissionProviderBase {
 *     readonly DomainName = 'Entity Permissions';
 *     // ... implement abstract methods
 * }
 * ```
 */
export abstract class PermissionProviderBase implements IPermissionProvider {
    abstract readonly DomainName: string;
    abstract readonly Description: string;
    abstract readonly SupportedGranteeTypes: GranteeType[];
    abstract readonly SupportedActions: PermissionAction[];
    abstract readonly SupportsDeny: boolean;

    abstract CheckPermission(
        user: UserInfo,
        resourceType: string,
        resourceId: string | null,
        action: PermissionAction
    ): Promise<PermissionCheckResult>;

    abstract GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string): Promise<NormalizedPermission[]>;

    abstract GetUserResources(user: UserInfo, resourceType?: string): Promise<NormalizedPermission[]>;

    abstract GetResourcePermissions(resourceType: string, resourceId: string): Promise<NormalizedPermission[]>;
}
