import { BaseInfo } from "./baseInfo";
import { IMetadataProvider } from "./interfaces";

/**
 * A list of all users who have or had access to the system.
 * Contains user profile information, authentication details, and role assignments.
 */
export class UserInfo extends BaseInfo {
    ID: string = null;

    /* Name of the user that is used in various places in UIs/etc, can be anything including FirstLast, Email, a Handle, etc */
    Name: string = null
    FirstName: string = null
    LastName: string = null
    Title: string = null
    Email: string = null
    Type: string = null
    IsActive: boolean = null
    LinkedRecordType: 'None' | 'Employee' | 'Other' = null
    EmployeeID: number = null
    LinkedEntityID: number = null
    LinkedEntityRecordID: number = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    FirstLast: string = null
    EmployeeFirstLast: string = null
    EmployeeEmail: string = null
    EmployeeTitle: string = null
    EmployeeSupervisor: string = null
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
    UserID: string = null
    RoleID: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    User: string = null
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
    ID: string = null
    Name: string = null
    Description: string = null
    DirectoryID: string = null
    SQLName: string = null
    __mj_CreatedAt: Date = null
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
    ID: string = null
    Name: string = null
    Description: string = null
    FilterText: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
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
    ID: string = null
    /**
     * The unique identifier for the parent authorization, if applicable.
     * @type {string|null}
     */
    ParentID: string = null
    Name: string = null
    /**
     * Indicates whether the authorization is active.
     * @type {boolean|null}
     */
    IsActive: boolean = null
    /**
     * Determines whether actions under this authorization will be logged for audit purposes.
     * @type {boolean|null}
     */
    UseAuditLog: boolean = null

    Description: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
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
    
                const match = mdRoles.find(r => r.ID === ari.RoleID) 
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
                const matchingRole = this.Roles.find(r => r.ID === user.UserRoles[i].RoleID)
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
            return this.Roles.find(r => r.ID === role.ID) != null
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
    ID: string = null
    AuthorizationID: string = null
    RoleID: string = null
    Type: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
    Authorization: string
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
    ID: string = null
    ParentID: string = null
    Name: string = null
    Description: string = null
    AuthorizationName: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields from base view
    Parent: string

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}