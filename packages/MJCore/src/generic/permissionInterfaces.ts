import { UserInfo } from './securityInfo';
import { LogError } from './logging';
import { RunView } from '../views/runView';
import { IMetadataProvider } from './interfaces';

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
        action: PermissionAction,
        provider?: IMetadataProvider
    ): Promise<PermissionCheckResult>;

    /**
     * Get all effective permissions a user has on a specific resource. Returns an empty
     * array when the user has no access.
     */
    GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * Get all resources within this domain that the user has access to. Powers the
     * Sharing Center's "User Access Report" view.
     *
     * @param resourceType Optional filter to one resource type within the domain.
     */
    GetUserResources(user: UserInfo, resourceType?: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * Get all permissions granted on a specific resource across every grantee. Powers
     * the Sharing Center's "Resource Access Report" view.
     */
    GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * Get all permissions this user has granted to other users within this domain.
     * Powers the end-user Sharing Center's "Shared by me" tab.
     *
     * Only meaningful for subsystems that support user-granted sharing (Dashboards,
     * Artifacts, Collections, Resource Permissions, Access Control Rules). Role-only
     * subsystems (Entity Permissions, Application Roles, AI Agent Permissions,
     * Query Permissions) return `[]`.
     *
     * Default implementation on {@link PermissionProviderBase} returns `[]`, so
     * providers that don't support this shape don't have to override.
     */
    GetPermissionsGrantedByUser(grantor: UserInfo, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * Get all permissions where this user is the direct grantee AND someone *else* is
     * the grantor (or the resource owner). Powers the end-user Sharing Center's
     * "Shared with me" tab — things other users have shared with me, excluding my
     * own resources and role-inherited access.
     *
     * Default returns `[]` — role-only subsystems have no "shared with me" concept.
     */
    GetPermissionsSharedWithUser(grantee: UserInfo, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * The resource type names this provider operates on, suitable for populating
     * a "Resource Type" picker in admin reports. Providers with a single backing
     * table return a one-element array (e.g., `['Dashboards']`). Providers that
     * span multiple (Resource Permissions, Entity Permissions, Access Control
     * Rules) return the live catalog. An empty array means "not enumerable" —
     * consumers can fall back to free-text input.
     *
     * @param provider Optional metadata provider whose catalog to read. Falls back to
     *   `Metadata.Provider` when omitted; pass an explicit provider in multi-tenant
     *   contexts so the picker reflects the right server's entities.
     *
     * Default implementation returns `[]`.
     */
    GetResourceTypes(provider?: IMetadataProvider): string[];
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
        action: PermissionAction,
        provider?: IMetadataProvider
    ): Promise<PermissionCheckResult>;

    abstract GetEffectivePermissions(user: UserInfo, resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    abstract GetUserResources(user: UserInfo, resourceType?: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    abstract GetResourcePermissions(resourceType: string, resourceId: string, provider?: IMetadataProvider): Promise<NormalizedPermission[]>;

    /**
     * Default implementation returns `[]` — role-only providers don't support user-granted
     * sharing. User-granted-sharing providers (Dashboards, Artifacts, Collections, Resource
     * Permissions, Access Control Rules) should override this to query their source table.
     */
    async GetPermissionsGrantedByUser(_grantor: UserInfo, _provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        return [];
    }

    /**
     * Default implementation returns `[]` — role-only providers have no "shared with me"
     * concept. User-grantee providers should override this to return only permissions where
     * `grantee` is the direct grantee AND someone else is the grantor/owner.
     */
    async GetPermissionsSharedWithUser(_grantee: UserInfo, _provider?: IMetadataProvider): Promise<NormalizedPermission[]> {
        return [];
    }

    /**
     * Default implementation returns `[]` — providers should override to advertise
     * their supported resource types (see {@link IPermissionProvider.GetResourceTypes}).
     */
    GetResourceTypes(_provider?: IMetadataProvider): string[] {
        return [];
    }

    // ----- Shared helpers used by concrete providers ------------------------
    //
    // These helpers consolidate patterns that used to be copy-pasted across the
    // 9 concrete providers. Keeping them as `protected` methods on the base
    // means providers get them automatically once they extend PermissionProviderBase,
    // and mocked subclasses in tests don't need to re-stub them.

    /**
     * Build a {@link NormalizedPermission} with `DomainName` and `Effect`
     * pre-filled from the provider. Centralizes the ~10-field literal that
     * used to be constructed in every `GetUserResources` / `GetEffectivePermissions` /
     * `GetResourcePermissions` implementation.
     *
     * `Effect` defaults to `'Allow'` since the vast majority of providers don't
     * support Deny. Providers that emit Deny records (`EntityPermissionProvider`)
     * pass `{ effect: 'Deny' }` explicitly.
     */
    protected buildNormalizedPermission(args: {
        resourceType: string;
        resourceId: string | null;
        resourceName?: string;
        granteeType: GranteeType;
        granteeId: string | null;
        granteeName?: string;
        actions: PermissionAction[];
        sourceRecordId?: string;
        expiresAt?: Date;
        effect?: 'Allow' | 'Deny';
    }): NormalizedPermission {
        return {
            DomainName: this.DomainName,
            ResourceType: args.resourceType,
            ResourceID: args.resourceId,
            ResourceName: args.resourceName,
            GranteeType: args.granteeType,
            GranteeID: args.granteeId,
            GranteeName: args.granteeName,
            Actions: args.actions,
            Effect: args.effect ?? 'Allow',
            SourceRecordID: args.sourceRecordId,
            ExpiresAt: args.expiresAt,
        };
    }

    /**
     * Map a `{ Read?: boolean, Update?: boolean, … }` descriptor to a canonical
     * `PermissionAction[]`. Replaces the 9 hand-rolled copies that each walked
     * their row's CRUD-ish booleans and pushed action names.
     *
     * Output order matches the canonical order declared in {@link PermissionAction}.
     * Entries that are `null`/`undefined`/`false` are skipped.
     *
     * @example
     * ```typescript
     * const actions = this.boolsToActions({
     *     Read: row.CanRead,
     *     Update: row.CanEdit,       // domain-specific flag name
     *     Delete: row.CanDelete,
     *     Share: row.CanShare,
     * });
     * // → ['Read', 'Update', 'Delete', 'Share']  // in this order, where truthy
     * ```
     */
    protected boolsToActions(flags: Partial<Record<PermissionAction, boolean | null | undefined>>): PermissionAction[] {
        const order: PermissionAction[] = ['Read', 'Create', 'Update', 'Delete', 'Share', 'Execute', 'Admin'];
        const out: PermissionAction[] = [];
        for (const action of order) {
            if (flags[action]) out.push(action);
        }
        return out;
    }

    /**
     * Standard RunView wrapper that logs failures with `<ProviderClass>.<methodName>:`
     * prefix and returns the row list (or `[]` on failure). Replaces the boilerplate
     * that each provider previously carried around its RunView calls.
     *
     * @example
     * ```typescript
     * const rows = await this.fetchRows<MyRow>(
     *     'MJ: AI Agent Permissions',
     *     `AgentID='${agentId}'`,
     *     ['ID', 'AgentID', 'CanView', 'CanRun'],
     *     'fetchPermissionsForAgent'
     * );
     * ```
     */
    protected async fetchRows<T>(
        entityName: string,
        extraFilter: string,
        fields: string[],
        methodName: string
    ): Promise<T[]> {
        const rv = new RunView();
        const result = await rv.RunView<T>({
            EntityName: entityName,
            ExtraFilter: extraFilter,
            Fields: fields,
            ResultType: 'simple',
        });
        if (!result.Success) {
            LogError(`${this.constructor.name}.${methodName}: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    /**
     * Given a list of IDs, fetch `{ID, <nameField>}` from `entityName` and return
     * a `Map<ID, name>`. Used by providers whose domain views don't denormalize
     * a resource name onto the permission row (AI Agents, Artifacts, Collections).
     *
     * Returns an empty Map when `ids` is empty or the RunView fails — callers should
     * treat a missing key as "name unknown."
     */
    protected async bulkLookupNames(
        entityName: string,
        ids: string[],
        nameField = 'Name'
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        if (ids.length === 0) return map;
        const escaped = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
        const rows = await this.fetchRows<{ ID: string } & Record<string, string | null>>(
            entityName,
            `ID IN (${escaped})`,
            ['ID', nameField],
            'bulkLookupNames'
        );
        for (const r of rows) {
            const name = r[nameField];
            if (name) map.set(r.ID, name);
        }
        return map;
    }
}

/**
 * A single audit entry returned by {@link IPermissionProvider} (when it implements auditing)
 * or by the unified `PermissionEngine.GetAuditTimeline()` aggregator. Each entry represents
 * one Create/Update/Delete event against a permission record.
 */
export interface PermissionAuditEntry {
    /** When the change happened (from the underlying RecordChange row). */
    ChangedAt: Date;
    /** The user who made the change. Null when the change was system-generated. */
    ChangedByUserID: string | null;
    /** Human-readable name of the user, when the audit row carries it. */
    ChangedByUserName?: string;
    /** The permission domain this entry belongs to (matches PermissionDomain.Name). */
    DomainName: string;
    /** The backing permission entity that changed (e.g., `"MJ: Dashboard Permissions"`). */
    EntityName: string;
    /** Primary key of the changed permission row. */
    RecordID: string;
    /** The type of change. */
    ChangeType: 'Create' | 'Update' | 'Delete' | 'Snapshot';
    /** Human-readable summary of the change (from RecordChange.ChangesDescription). */
    Summary?: string;
    /** ID of the backing RecordChange row itself (useful for "view full diff" deep links). */
    SourceRecordChangeID: string;
}

/**
 * Filter options for `PermissionEngine.GetAuditTimeline()`. All fields are optional;
 * an empty filter returns the most recent entries across all domains.
 */
export interface PermissionAuditFilter {
    /** Limit to changes on a specific domain (e.g., `"Dashboard Permissions"`). */
    DomainName?: string;
    /** Start of the date range (inclusive). */
    StartDate?: Date;
    /** End of the date range (inclusive). */
    EndDate?: Date;
    /** Limit to changes made by this user. */
    ChangedByUserID?: string;
    /** Limit to a specific permission record. */
    RecordID?: string;
    /** Maximum rows to return (default 500). */
    MaxRows?: number;
}

/**
 * Thrown by {@link IPermissionProvider} consumers (typically via
 * `PermissionEngine.AuthorizeOrThrow`) when a user lacks a required permission.
 *
 * Actions, AI Agents, and other programmatic callers should catch this specific error
 * so they can differentiate "denied" from other runtime failures and surface a clear
 * "Access denied: <reason>" message.
 */
export class PermissionDeniedError extends Error {
    public readonly DomainName: string;
    public readonly ResourceType: string;
    public readonly ResourceID: string | null;
    public readonly Action: PermissionAction;
    public readonly Reason: string;

    constructor(result: PermissionCheckResult & { ResourceType: string; ResourceID: string | null; Action: PermissionAction }) {
        super(`Permission denied: ${result.DomainName} / ${result.ResourceType} / ${result.Action} — ${result.Reason}`);
        this.name = 'PermissionDeniedError';
        this.DomainName = result.DomainName;
        this.ResourceType = result.ResourceType;
        this.ResourceID = result.ResourceID;
        this.Action = result.Action;
        this.Reason = result.Reason;
        // Preserve stack through transpilation
        Object.setPrototypeOf(this, PermissionDeniedError.prototype);
    }
}
