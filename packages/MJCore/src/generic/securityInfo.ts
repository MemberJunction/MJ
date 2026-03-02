import { BaseInfo } from "./baseInfo";
import { IMetadataProvider } from "./interfaces";
import { DatabasePlatform } from "./platformSQL";
import { ParsePlatformVariants, PlatformVariantsJSON, ResolvePlatformVariant } from "./platformVariants";
import { UUIDsEqual } from "@memberjunction/global";

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
                const val = user[key]
                if (val && typeof val == 'string') {
                    ret = ret.replace(new RegExp(`{{User${key}}}`, 'g'), val)
                }
            }
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

    private _AuthorizationRoles: AuthorizationRoleInfo[] = []
    get Roles(): AuthorizationRoleInfo[] {
        return this._AuthorizationRoles
    }

    constructor (md: IMetadataProvider, initData: any = null) {
        super()
        this.copyInitData(initData)
        if (initData) 
            this.SetupAuthorizationRoles(md, initData.AuthorizationRoles || initData._AuthorizationRoles)
    }

    /**
     * Sets up the roles associated with this authorization using the provided metadata and initial data.
     * 
     * @param {IMetadataProvider} md - The metadata provider to fetch role information.
     * @param {AuthorizationRoleInfo[]} authorizationRoles - An array of `AuthorizationRoleInfo` instances or equivalent data to be associated with this authorization.
     */
    public SetupAuthorizationRoles(md: IMetadataProvider, authorizationRoles: AuthorizationRoleInfo[]) {
        if (authorizationRoles) {
            const mdRoles = md.Roles;
            this._AuthorizationRoles=  [];
            for (let i = 0; i < authorizationRoles.length; i++) {
                // 
                const ari = new AuthorizationRoleInfo(authorizationRoles[i])
                this._AuthorizationRoles.push(ari)
    
                const match = mdRoles.find(r => UUIDsEqual(r.ID, ari.RoleID))
                if (match)
                    ari._setRole(match)
            }
        }
    }

    /**
     * Determines if a given user can execute actions under this authorization based on their roles.
     * 
     * @param {UserInfo} user - The user to check for execution rights.
     * @returns {boolean} True if the user can execute actions under this authorization, otherwise false.
     */
    public UserCanExecute(user: UserInfo): boolean {
        if (this.IsActive && user && user.UserRoles) {
            for (let i = 0; i < user.UserRoles.length; i++) {
                const matchingRole = this.Roles.find(r => UUIDsEqual(r.ID, user.UserRoles[i].RoleID))
                if (matchingRole)
                    return true; // as soon as we find a single matching role we can bail out as the user can execute
            }
        }
        return false
    }

    /**
     * Determines if a given role can execute actions under this authorization.
     * 
     * @param {RoleInfo} role - The role to check for execution rights.
     * @returns {boolean} True if the role can execute actions under this authorization, otherwise false.
     */
    public RoleCanExecute(role: RoleInfo): boolean {
        if (this.IsActive) {
            return this.Roles.find(r => UUIDsEqual(r.ID, role.ID)) != null
        }
        return false
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