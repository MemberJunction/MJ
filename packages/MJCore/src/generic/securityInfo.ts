import { BaseInfo } from "./baseInfo";
import { IMetadataProvider } from "./interfaces";

export class UserInfo extends BaseInfo {
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
    CreatedAt: Date = null
    UpdatedAt: Date = null

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

export class UserRoleInfo extends BaseInfo {
    UserID: number = null
    RoleName: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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

export class RoleInfo extends BaseInfo {
    Name: string = null
    Description: string = null
    AzureID: string = null
    SQLName: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}

export class RowLevelSecurityFilterInfo extends BaseInfo {
    Name: string = null
    Description: string = null
    FilterText: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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

export class AuthorizationInfo extends BaseInfo {
    ParentID: number = null
    Name: string = null
    IsActive: boolean = null
    UseAuditLog: boolean = null
    Description: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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

    public UserCanExecute(user: UserInfo): boolean {
        if (this.IsActive && user && user.UserRoles) {
            for (let i = 0; i < user.UserRoles.length; i++) {
                const matchingRole = this.Roles.find(r => r.RoleName == user.UserRoles[i].RoleName)
                if (matchingRole)
                    return true;
            }
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
    AuthorizationName: string = null
    RoleName: string = null
    Type: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

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

export class AuditLogTypeInfo extends BaseInfo {
    ParentID: number = null
    Name: string = null
    Description: string = null
    AuthorizationName: string = null
    CreatedAt: Date = null
    UpdatedAt: Date = null

    // virtual fields from base view
    Parent: string

    constructor (initData: any) {
        super();
        this.copyInitData(initData);
    }
}