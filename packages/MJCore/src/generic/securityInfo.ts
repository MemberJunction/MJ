import { BaseInfo } from "./baseInfo";
import { IMetadataProvider } from "./interfaces";
import { LogError } from "./logging";
// NOTE: Circular import with metadata.ts is intentional and safe.
// Both modules reference each other at the type/getter level only;
// all cross-module calls happen inside function bodies (never at
// class-field initialisation time), so the modules are fully
// evaluated before any getter is invoked.  This is the same
// pattern already used by queryInfo.ts ↔ metadata.ts.
import { Metadata } from "./metadata";
import { DatabasePlatform } from "./platformSQL";
import { ParsePlatformVariants, PlatformVariantsJSON, ResolvePlatformVariant } from "./platformVariants";
import { UUIDsEqual } from "@memberjunction/global";

/**
 * Represents the tenant context for a given request in a multi-tenant deployment.
 * Attached to `UserInfo.TenantContext` by server middleware when multi-tenancy is enabled.
 *
 * **Extensibility**: This interface is intentionally minimal. Middle-layer packages
 * (e.g., a SaaS layer) should **extend** it with richer properties rather than
 * widening this base:
 *
 * ```typescript
 * export interface MySaaSTenantContext extends TenantContext {
 *     organizationName: string;
 *     contactID: string;
 *     // ... additional fields
 * }
 * ```
 *
 * Because `UserInfo.TenantContext` is typed as `TenantContext`, any subtype satisfies
 * it via structural typing. Hooks in the extending layer can downcast:
 *
 * ```typescript
 * const ctx = contextUser.TenantContext as MySaaSTenantContext;
 * ```
 */
export interface TenantContext {
    /** The unique identifier of the tenant (e.g., OrganizationID value) */
    TenantID: string;
    /** How this tenant context was determined */
    Source: 'header' | 'linkedEntity' | 'custom';
}

/**
 * Per-session resource scope carried on {@link UserInfo} for a magic-link resource share.
 * Sourced from the verified session token's claims. RLS filters reference it via the
 * `{{ScopeResourceID}}` / `{{ScopeResourceType}}` tokens to pin a shared resource (and
 * its FK-reachable dependents) without broadening the granted role.
 */
export interface MagicLinkScope {
    /** Primary-key value of the shared resource (stringified). */
    ResourceID?: string;
    /** ResourceType name/id of the shared resource. */
    ResourceType?: string;
}

/**
 * Returning-visitor context carried on {@link UserInfo} for a public web-widget guest session,
 * sourced from the verified session token's claims. Lets a server-created conversation (the voice
 * path, which mints its conversation server-side) stamp the same returning-visitor anchor + linked
 * identity the text path stamps client-side, so cross-session memory works uniformly across modalities.
 * Not a database/GraphQL field — an in-memory, per-session carrier.
 */
export interface WidgetVisitorContext {
    /** Durable, opaque returning-visitor anchor (stamped on Conversation.VisitorKey). */
    VisitorKey?: string;
    /** The prior conversation this visit chains from (stamped on Conversation.LastConversationID). */
    LastConversationID?: string;
    /** Resolved polymorphic identity entity id (stamped on the existing Conversation.LinkedEntityID when set; also on AIAgentSession.LinkedEntityID). */
    LinkedEntityID?: string;
    /** Resolved polymorphic identity record id (stamped on the existing Conversation.LinkedRecordID when set; also on AIAgentSession.LinkedRecordID). */
    LinkedRecordID?: string;
}

/**
 * Identity of the public web-widget instance a guest session was minted for, carried on
 * {@link UserInfo} and sourced from the verified session token's `mj_widget_id` claim. Lets a
 * privileged server-side dispatch resolve the AUTHORITATIVE pinned support agent (and other
 * per-widget configuration) from the trusted token rather than from client-supplied arguments —
 * the backstop that lets a widget guest run only its widget's pinned agent. In-memory, per-session;
 * not a database/GraphQL field.
 */
export interface WidgetGuestContext {
    /** The MJ: Conversation Widget Instances row id this guest session is bound to. */
    WidgetID: string;
}

/**
 * A list of all users who have or had access to the system.
 * Contains user profile information, authentication details, and role assignments.
 */
export class UserInfo extends BaseInfo {
    /**
     * Unique identifier for the user
     */
    ID: string = null;

    /**
     * Name of the user that is used in various places in UIs/etc, can be anything including FirstLast, Email, a Handle, etc
     */
    Name: string = null
    
    /**
     * User's first name or given name
     */
    FirstName: string = null
    
    /**
     * User's last name or surname
     */
    LastName: string = null
    
    /**
     * User's professional title or salutation
     */
    Title: string = null
    
    /**
     * Unique email address for the user. This field must be unique across all users in the system
     */
    Email: string = null
    
    /**
     * User account type (User, Owner)
     */
    Type: string = null
    
    /**
     * Whether this user account is currently active and can log in
     */
    IsActive: boolean = null
    
    /**
     * Type of record this user is linked to (None, Employee, Contact, etc.)
     */
    LinkedRecordType: 'None' | 'Employee' | 'Other' = null
    
    /**
     * Foreign key reference to the Employee entity
     */
    EmployeeID: number = null
    
    /**
     * Foreign key reference to the Entities table
     */
    LinkedEntityID: number = null
    
    /**
     * ID of the specific record this user is linked to
     */
    LinkedEntityRecordID: number = null
    
    /**
     * Timestamp when the user record was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the user record was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    /**
     * Concatenated first and last name
     */
    FirstLast: string = null
    
    /**
     * Employee's concatenated first and last name
     */
    EmployeeFirstLast: string = null
    
    /**
     * Employee's email address
     */
    EmployeeEmail: string = null
    
    /**
     * Employee's job title
     */
    EmployeeTitle: string = null
    
    /**
     * Name of the employee's supervisor
     */
    EmployeeSupervisor: string = null
    
    /**
     * Email address of the employee's supervisor
     */
    EmployeeSupervisorEmail: string = null

    private _TenantContext?: TenantContext = undefined;

    /**
     * Tenant context for multi-tenant data isolation.
     * Set at request time by server middleware when multi-tenancy is enabled.
     * When undefined, no tenant filtering is applied.
     *
     * Uses a getter/setter so that `Object.keys()` does not enumerate it —
     * the GraphQLDataProvider builds CurrentUser queries from `Object.keys(new UserInfo())`,
     * and TenantContext is not a database/GraphQL field.
     */
    public get TenantContext(): TenantContext | undefined {
        return this._TenantContext;
    }
    public set TenantContext(value: TenantContext | undefined) {
        this._TenantContext = value;
    }

    private _MagicLinkScope?: MagicLinkScope = undefined;

    /**
     * Per-session resource scope for a magic-link share. Set at request time from the
     * verified session token's claims (the link's ResourceType/ResourceID). Consumed by
     * RLS filters via the `{{ScopeResourceID}}` / `{{ScopeResourceType}}` tokens in
     * {@link RowLevelSecurityFilterInfo.MarkupFilterText}, so a resource-share link can
     * be scoped to exactly one resource (and its FK-reachable dependents) without the
     * granted role being broad. Same getter/setter (non-enumerable) rationale as
     * TenantContext — it is not a database/GraphQL field.
     */
    public get MagicLinkScope(): MagicLinkScope | undefined {
        return this._MagicLinkScope;
    }
    public set MagicLinkScope(value: MagicLinkScope | undefined) {
        this._MagicLinkScope = value;
    }

    private _WidgetVisitorContext?: WidgetVisitorContext = undefined;

    /**
     * Returning-visitor context for a public web-widget guest session. Set at request time from the
     * verified session token's claims (the widget mint embeds the resolved VisitorKey / prior
     * conversation / resolved identity). Consumed when a conversation is created server-side (the voice
     * path) so it carries the same returning-visitor anchor + resolved identity the text path stamps
     * client-side. Same getter/setter (non-enumerable) rationale as MagicLinkScope — not a DB/GraphQL field.
     */
    public get WidgetVisitorContext(): WidgetVisitorContext | undefined {
        return this._WidgetVisitorContext;
    }
    public set WidgetVisitorContext(value: WidgetVisitorContext | undefined) {
        this._WidgetVisitorContext = value;
    }

    private _WidgetGuestContext?: WidgetGuestContext = undefined;

    /**
     * Widget-instance identity for a public web-widget guest session. Set at request time from the
     * verified session token's `mj_widget_id` claim. Read by the privileged agent-dispatch path to
     * resolve the authoritative pinned agent for this guest (never trusting a client-supplied agent
     * id). Same getter/setter (non-enumerable) rationale as MagicLinkScope — not a DB/GraphQL field.
     */
    public get WidgetGuestContext(): WidgetGuestContext | undefined {
        return this._WidgetGuestContext;
    }
    public set WidgetGuestContext(value: WidgetGuestContext | undefined) {
        this._WidgetGuestContext = value;
    }

    private _IsMagicLinkAnonymous: boolean = false;

    /**
     * True when this request resolves to the shared Anonymous magic-link principal whose
     * roles are synthesized in memory per-session (never persisted, so anonymous sessions
     * can't accrete privileges across links). The server reads this to serve the synthesized
     * {@link UserRoles} for the session's own user row instead of the DB query (which returns
     * empty for the role-less shared principal by design). Same getter/setter (non-enumerable)
     * rationale as TenantContext/MagicLinkScope — it is not a database/GraphQL field.
     */
    public get IsMagicLinkAnonymous(): boolean {
        return this._IsMagicLinkAnonymous;
    }
    public set IsMagicLinkAnonymous(value: boolean) {
        this._IsMagicLinkAnonymous = value;
    }

    private _UserRoles: UserRoleInfo[] = []
    /**
     * Gets the roles assigned to this user.
     * @returns {UserRoleInfo[]} Array of user role assignments
     */
    public get UserRoles(): UserRoleInfo[] {
        return this._UserRoles;
    } 

    /**
     * Constructs a new instance of the UserInfo class, optionally initializing it with the provided metadata and initial data.
     * If newGlobalRoles are provided, the user roles will be set up to validate against those roles instead of fetching them from the metadata provider.
     * @param md 
     * @param initData 
     * @param newGlobalRoles 
     */
    constructor (md: IMetadataProvider = null, initData: any = null) {
        super();
        this.copyInitData(initData);
        if (initData){
            this._UserRoles = initData.UserRoles || initData._UserRoles;
        }
    }
}

/**
 * Associates users with roles in the system, managing role-based access control and permission inheritance.
 */
export class UserRoleInfo extends BaseInfo {
    /**
     * Foreign key reference to the Users table
     */
    UserID: string = null
    
    /**
     * Foreign key reference to the Roles table
     */
    RoleID: string = null
    
    /**
     * Timestamp when the user-role association was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the user-role association was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    /**
     * Name of the user
     */
    User: string = null
    
    /**
     * Name of the role
     */
    Role: string = null
    
    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

/**
 * Roles are used for security administration and can have zero to many Users as members.
 * Defines groups of permissions that can be assigned to multiple users.
 */
export class RoleInfo extends BaseInfo {
    /**
     * Unique identifier for the role
     */
    ID: string = null
    
    /**
     * Name of the role
     */
    Name: string = null
    
    /**
     * Description of the role
     */
    Description: string = null
    
    /**
     * The unique ID of the role in the directory being used for authentication, for example an ID in Azure
     */
    DirectoryID: string = null
    
    /**
     * The name of the role in the database, this is used for auto-generating permission statements by CodeGen
     */
    SQLName: string = null
    
    /**
     * Timestamp when the role was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the role was last updated
     */
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

/**
 * Defines data access rules that filter records based on user context, implementing fine-grained security at the row level.
 */
export class RowLevelSecurityFilterInfo extends BaseInfo {
    /**
     * Unique identifier for the row level security filter
     */
    ID: string = null
    
    /**
     * Name of the row level security filter
     */
    Name: string = null
    
    /**
     * Description of the row level security filter
     */
    Description: string = null
    
    /**
     * SQL WHERE clause template that filters records based on user context variables
     */
    FilterText: string = null
    /**
     * JSON column containing platform-specific SQL variants for the FilterText.
     * Stores alternative filter SQL for platforms other than the default.
     */
    PlatformVariants: string | null = null

    /**
     * Timestamp when the filter was created
     */
    __mj_CreatedAt: Date = null

    /**
     * Timestamp when the filter was last updated
     */
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }

    private _parsedVariants: PlatformVariantsJSON | null | undefined = undefined;
    /**
     * Lazily parses and caches the PlatformVariants JSON.
     */
    private get ParsedVariants(): PlatformVariantsJSON | null {
        if (this._parsedVariants === undefined) {
            this._parsedVariants = ParsePlatformVariants(this.PlatformVariants);
        }
        return this._parsedVariants;
    }

    /**
     * Resolves the FilterText for a given database platform.
     * Checks PlatformVariants first; falls back to the base FilterText property.
     * @param platform - The target database platform
     * @returns The appropriate filter text for the platform
     */
    public GetPlatformFilterText(platform: DatabasePlatform): string {
        const variant = ResolvePlatformVariant(this.ParsedVariants, 'FilterText', platform);
        return variant ?? this.FilterText;
    }

    /**
     * Replaces user-specific tokens in the filter text with actual user values.
     * Tokens are in the format {{UserFieldName}} where FieldName is any property of the UserInfo object.
     * @param {UserInfo} user - The user whose properties will be substituted into the filter text
     * @returns {string} The filter text with all user tokens replaced with actual values
     */
    public MarkupFilterText(user: UserInfo): string {
        let ret = this.FilterText
        if (user) {
            const keys = Object.keys(user)
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const val = (user as unknown as Record<string, unknown>)[key]
                if (val !== null && typeof val !== 'object') {
                    ret = ret.replace(new RegExp(`{{User${key}}}`, 'g'), String(val))
                }
            }
            // Per-session magic-link resource scope. Fail-closed: an absent scope resolves
            // to '' so a resource-pinned predicate (e.g. ID = '{{ScopeResourceID}}') matches
            // NO rows rather than leaking — a session without the scope sees nothing.
            const scope = user.MagicLinkScope;
            ret = ret.replace(/\{\{ScopeResourceID\}\}/g, scope?.ResourceID ?? '');
            ret = ret.replace(/\{\{ScopeResourceType\}\}/g, scope?.ResourceType ?? '');
        }
        const unresolvedMatch = ret.match(/\{\{User\w+\}\}/);
        if (unresolvedMatch) {
            LogError('RLS filter has unresolved token after markup: ' + unresolvedMatch[0] + ' in filter: ' + this.FilterText);
        }
        return ret;
    }
}

/**
 * Stores the fundamental permissions and access rights that can be granted to users and roles throughout the system.
 */
export class AuthorizationInfo extends BaseInfo {
    /**
     * Unique identifier for the authorization
     */
    ID: string = null
    
    /**
     * The unique identifier for the parent authorization, if applicable
     */
    ParentID: string = null
    
    /**
     * Name of the authorization
     */
    Name: string = null
    
    /**
     * Indicates whether this authorization is currently active and can be granted to users or roles
     */
    IsActive: boolean = null
    
    /**
     * When set to 1, Audit Log records are created whenever this authorization is invoked for a user
     */
    UseAuditLog: boolean = null

    /**
     * Description of the authorization
     */
    Description: string = null
    
    /**
     * Timestamp when the authorization was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the authorization was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
    /**
     * Name of the parent authorization
     */
    Parent: string

    /**
     * Returns the role assignments for this authorization.
     *
     * **Lazy resolution** — filters from the global `Metadata.Provider.AuthorizationRoles`
     * collection on every call, like `QueryInfo.Permissions` filters from
     * `Metadata.Provider.QueryPermissions`.  No result caching is applied because
     * `AuthorizationRoleInfo` objects are lightweight and the collection is small.
     */
    public get Roles(): AuthorizationRoleInfo[] {
        return Metadata.Provider?.AuthorizationRoles?.filter( // global-provider-ok: AuthorizationInfo is a metadata DTO — resolves roles from the global provider like QueryInfo.Permissions
            ar => UUIDsEqual(ar.AuthorizationID, this.ID)
        ) ?? [];
    }

    /**
     * @param initData - Raw data row from the metadata dataset / database view.
     *   `copyInitData` maps this into the typed properties (ID, Name, ParentID, etc.).
     * @param _md - Accepted but unused; retained so the signature matches the universal
     *   `new m.class(dataRow, metadataProvider)` convention used by
     *   `MetadataFromSimpleObjectWithoutUser`.
     */
    constructor (initData: any = null, _md?: IMetadataProvider) {
        super()
        this.copyInitData(initData)
    }

    /**
     * Determines if a given user can execute actions under this authorization based on their roles.
     *
     * Evaluation rules (fixed in Phase 2b):
     * - Match by `AuthorizationRoleInfo.RoleID` (the FK to Roles), not the authorization-role PK.
     * - Honour the `Type` column: any matching Deny row wins; without a Deny, at least one Allow is required.
     *
     * @param {UserInfo} user - The user to check for execution rights.
     * @returns {boolean} True if the user has a matching Allow role and no matching Deny role; false otherwise.
     */
    public UserCanExecute(user: UserInfo): boolean {
        if (!this.IsActive || !user || !user.UserRoles) return false;
        let hasAllow = false;
        for (const userRole of user.UserRoles) {
            const matchingAuthRoles = this.Roles.filter(r => UUIDsEqual(r.RoleID, userRole.RoleID));
            for (const ar of matchingAuthRoles) {
                if (ar.AuthorizationType() === AuthorizationRoleType.Deny) return false; // Deny wins globally
                if (ar.AuthorizationType() === AuthorizationRoleType.Allow) hasAllow = true;
            }
        }
        return hasAllow;
    }

    /**
     * Determines if a given role can execute actions under this authorization.
     *
     * Phase 2b also honours Deny semantics for consistency with {@link UserCanExecute}.
     *
     * @param {RoleInfo} role - The role to check for execution rights.
     * @returns {boolean} True if an Allow authorization-role exists for this role and no Deny does.
     */
    public RoleCanExecute(role: RoleInfo): boolean {
        if (!this.IsActive) return false;
        const matchingAuthRoles = this.Roles.filter(r => UUIDsEqual(r.RoleID, role.ID));
        if (matchingAuthRoles.length === 0) return false;
        let hasAllow = false;
        for (const ar of matchingAuthRoles) {
            if (ar.AuthorizationType() === AuthorizationRoleType.Deny) return false;
            if (ar.AuthorizationType() === AuthorizationRoleType.Allow) hasAllow = true;
        }
        return hasAllow;
    }
}

export const AuthorizationRoleType = {
    Allow: 'Allow',
    Deny: 'Deny',
} as const;

export type AuthorizationRoleType = typeof AuthorizationRoleType[keyof typeof AuthorizationRoleType];


/**
 * Links authorizations to roles, defining which permissions are granted to users assigned to specific roles in the system.
 */
export class AuthorizationRoleInfo extends BaseInfo {
    /**
     * Unique identifier for the authorization-role mapping
     */
    ID: string = null
    
    /**
     * Foreign key reference to the Authorizations table
     */
    AuthorizationID: string = null
    
    /**
     * Foreign key reference to the Roles table
     */
    RoleID: string = null
    
    /**
     * Specifies whether this authorization is granted to ('Allow') or explicitly denied ('Deny') for the role. Deny overrides Allow from all other roles a user may be part of
     */
    Type: string = null
    
    /**
     * Timestamp when the authorization-role mapping was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the authorization-role mapping was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
    /**
     * Name of the authorization
     */
    Authorization: string
    
    /**
     * Name of the role
     */
    Role: string

    private _RoleInfo: RoleInfo = null
    public get RoleInfo(): RoleInfo {
        return this._RoleInfo
    }

    public AuthorizationType(): AuthorizationRoleType {
        return this.Type.trim().toLowerCase() === 'allow' ? AuthorizationRoleType.Allow : AuthorizationRoleType.Deny
    }

    _setRole(role: RoleInfo) {
        this._RoleInfo = role
    }

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}


/**
 * Defines the types of events that can be recorded in the audit log, enabling categorization and filtering of system activities.
 */
export class AuditLogTypeInfo extends BaseInfo {
    /**
     * Unique identifier for the audit log type
     */
    ID: string = null
    
    /**
     * Foreign key reference to the parent Audit Log Type
     */
    ParentID: string = null
    
    /**
     * Name of the audit log type
     */
    Name: string = null
    
    /**
     * Description of the audit log type
     */
    Description: string = null
    
    /**
     * Name of the associated authorization
     */
    AuthorizationName: string = null
    
    /**
     * Timestamp when the audit log type was created
     */
    __mj_CreatedAt: Date = null
    
    /**
     * Timestamp when the audit log type was last updated
     */
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
    /**
     * Name of the parent audit log type
     */
    Parent: string

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}