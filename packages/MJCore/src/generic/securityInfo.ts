import { BaseInfo } from "./baseInfo";
import { IMetadataProvider } from "./interfaces";
import { Metadata } from "./metadata";

/**
 * Information about a single user
 */
export class UserInfo extends BaseInfo {
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
    public get UserRoles(): UserRoleInfo[] {
        return this._UserRoles;
    } 

    constructor (md: IMetadataProvider, initData: any = null) {
        super()
        this.copyInitData(initData)
        if (initData) 
            this.SetupUserRoles(md, initData.UserRoles || initData._UserRoles)
    }

    public SetupUserRoles(md: IMetadataProvider, userRoles: UserRoleInfo[]) {
        if (userRoles) {
            const mdRoles = md.Roles;
            this._UserRoles=  [];
            for (let i = 0; i < userRoles.length; i++) {
                // 
                const uri = new UserRoleInfo(userRoles[i])
                this._UserRoles.push(uri)
    
                const match = mdRoles.find(r => r.Name.trim().toLowerCase() == uri.RoleName.trim().toLowerCase()) 
                if (match)
                    uri._setRole(match)
            }
        }
    }
}

/**
 * Information about a role that a user is linked to
 */
export class UserRoleInfo extends BaseInfo {
    UserID: number = null
    RoleName: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    User: string = null

    private _RoleInfo: RoleInfo = null
    public get RoleInfo(): RoleInfo {
        return this._RoleInfo
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
 * Information about a single role
 */
export class RoleInfo extends BaseInfo {
    Name: string = null
    Description: string = null
    AzureID: string = null
    SQLName: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

export class RowLevelSecurityFilterInfo extends BaseInfo {
    Name: string = null
    Description: string = null
    FilterText: string = null
    __mj_CreatedAt: Date = null
    __mj_UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }

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
 * Represents detailed information about an authorization in the system, 
 * including its relationship to roles and the ability for a given user to execute actions that require this authorization.
 *  
 **/
export class AuthorizationInfo extends BaseInfo {
    /**
     * The unique identifier for the parent authorization, if applicable.
     * @type {number|null}
     */
    ParentID: number = null
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
    
                const match = mdRoles.find(r => r.Name.trim().toLowerCase() == ari.RoleName.trim().toLowerCase()) 
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
                const matchingRole = this.Roles.find(r => r.RoleName == user.UserRoles[i].RoleName)
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
            return this.Roles.find(r => r.RoleName == role.Name) != null
        }
        return false
    }
}

export const AuthorizationRoleType = {
    Allow: 'Allow',
    Deny: 'Deny',
} as const;

export type AuthorizationRoleType = typeof AuthorizationRoleType[keyof typeof AuthorizationRoleType];


export class AuthorizationRoleInfo extends BaseInfo {
    ID: string = null
    AuthorizationName: string = null
    RoleName: string = null
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
 * This class handles the execution of various types of authorization evaluations and contains utility methods as well.
 */
export class AuthorizationEvaluator {
    /**
     * Determines if the current user can execute actions under the provided authorization.
     * @param auth 
     * @returns 
     */
    public CurrentUserCanExecute(auth: AuthorizationInfo) {
        const md = new Metadata();
        if (!md.CurrentUser)
            throw new Error('No current user is set for authorization evaluation')

        return this.UserCanExecute(auth, md.CurrentUser)
    }

    /**
     * Determines if a given user can execute actions under the provided authorization.
     * 
     * @param {AuthorizationInfo} auth - The authorization to check for execution rights.
     * @param {UserInfo} user - The user to check for execution rights.
     * @returns {boolean} True if the user can execute actions under the authorization, otherwise false.
     */
    public UserCanExecute(auth: AuthorizationInfo, user: UserInfo) {
        return auth.UserCanExecute(user)
    }

    /**
     * Returns an array of authorizations that a given user can execute based on their roles.
     */
    public GetUserAuthorizations(user: UserInfo): AuthorizationInfo[] {
        const md = new Metadata();
        const ret: AuthorizationInfo[] = []
        if (user && user.UserRoles) {
            for (const a of md.Authorizations) {
                // for each system authorization, check to see if any of our roles can execute it
                if (a.UserCanExecute(user))
                    ret.push(a);
            }
            return ret;
        }
        else
            throw new Error('User must be provided to evaluate authorizations')
    }
}

export class AuditLogTypeInfo extends BaseInfo {
    ParentID: number = null
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