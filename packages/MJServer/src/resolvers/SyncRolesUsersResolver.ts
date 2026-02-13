import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { EntityDeleteOptions, EntitySaveOptions, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { MJRoleEntity, MJUserEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

@ObjectType()
export class SyncRolesAndUsersResultType {
  @Field(() => Boolean)
  Success: boolean;
}


@InputType()
export class RoleInputType {
    @Field(() => String)
    ID: string;

    @Field(() => String)
    Name: string;
    
    @Field(() => String, {nullable: true})
    Description: string;
}


export enum UserType {
  Owner = "Owner",
  User = "User",
}

registerEnumType(UserType, {
  name: "UserType", // GraphQL Enum Name
  description: "Defines whether a user is an Owner or a User",
});

@InputType()
export class UserInputType {
    @Field(() => String)
    ID!: string;

    @Field(() => String)
    Name!: string;

    @Field(() => String)
    Email!: string;

    // the next field needs to have GraphQL enum with only Owner or User being allowed
    @Field(() => UserType) 
    Type!: UserType;

    @Field(() => String, {nullable: true})
    FirstName: string;

    @Field(() => String, {nullable: true})
    LastName: string;
    
    @Field(() => String, {nullable: true})
    Title: string;

    @Field(() => [RoleInputType], {nullable: true})
    Roles?: RoleInputType[];
}


@InputType()
export class RolesAndUsersInputType {
    @Field(() => [UserInputType])
    public Users: UserInputType[];
  
    @Field(() => [RoleInputType])
    public Roles: RoleInputType[];
}


export class SyncRolesAndUsersResolver {
    /**
     * This mutation will sync both the roles and the users, and the user/role relationships in the system with the data provided in the input.
     * Roles are matched by the name (case insensitive) and users are matched by email
     * @param data 
     */
    @RequireSystemUser()
    @Mutation(() => SyncRolesAndUsersResultType)
    async SyncRolesAndUsers(
    @Arg('data', () => RolesAndUsersInputType ) data: RolesAndUsersInputType,
    @Ctx() context: AppContext
    ) {
        try {
            // first we sync the roles, then the users 
            const roleResult = await this.SyncRoles(data.Roles, context);
            if (roleResult?.Success) {
                const usersResult = await this.SyncUsers(data.Users, context);
                if (usersResult?.Success) {
                    // refresh the user cache, don't set an auto-refresh
                    // interval here becuase that is alreayd done at startup
                    // and will keep going on its own as per the config. This is a
                    // special one-time refresh since we made changes here.
                    await UserCache.Instance.Refresh(context.dataSource);
                }
                return usersResult;
            }
            else {
                return roleResult;
            }
        } 
        catch (err) {
            LogError(err);
            throw new Error('Error syncing roles and users\n\n' + err);
        }
    }

    /**
     * This mutation will sync the roles in the system with the data provided in the input, using the role name for matching (case insensitive)
     * @param data 
     */
    @RequireSystemUser()
    @Mutation(() => SyncRolesAndUsersResultType)
    async SyncRoles(
    @Arg('roles', () => [RoleInputType]) roles: RoleInputType[],
    @Ctx() context: AppContext
    ) : Promise<SyncRolesAndUsersResultType> {
        try {
            // we iterate through the provided roles and we remove roles that are not in the input and add roles that are new
            // and update roles that already exist
            const rv = new RunView();
            const result = await rv.RunView<MJRoleEntity>({
                EntityName: "MJ: Roles",
                ResultType: 'entity_object'
            }, context.userPayload.userRecord);
    
            if (result && result.Success) {
                const currentRoles = result.Results;
                if (await this.DeleteRemovedRoles(currentRoles, roles, context.userPayload.userRecord, context.userPayload)) {
                    if ( await this.AddNewRoles(currentRoles, roles, context.userPayload.userRecord, context.userPayload)) {
                        return await this.UpdateExistingRoles(currentRoles, roles, context.userPayload);
                    }
                }
            }

            return { Success: false }; // if we get here, something went wrong
        } catch (err) {
            LogError(err);
            throw new Error('Error syncing roles and users\n\n' + err);
        }
    }

    protected async UpdateExistingRoles(currentRoles: MJRoleEntity[], futureRoles: RoleInputType[], userPayload: UserPayload): Promise<SyncRolesAndUsersResultType> {
        // go through the future roles and update any that are in the current roles
        const md = new Metadata();
        let ok: boolean = true;

        for (const update of futureRoles) {
            const currentRole = currentRoles.find(r => r.Name.trim().toLowerCase() === update.Name.trim().toLowerCase());
            if (currentRole) {
                currentRole.Description = update.Description;
                ok = ok && await currentRole.Save();  
            }
        }
        return { Success: ok };
    }

    protected async AddNewRoles(currentRoles: MJRoleEntity[], futureRoles: RoleInputType[], user: UserInfo, userPayload: UserPayload): Promise<boolean> {
        // go through the future roles and add any that are not in the current roles
        const md = new Metadata();
        let ok: boolean = true;

        for (const add of futureRoles) {
            if (!currentRoles.find(r => r.Name.trim().toLowerCase() === add.Name.trim().toLowerCase())) {
                const role = await md.GetEntityObject<MJRoleEntity>("MJ: Roles", user);
                role.Name = add.Name;
                role.Description = add.Description;
                ok = ok && await role.Save();  
            }
        }
        return ok;
    }


    protected async DeleteRemovedRoles(currentRoles: MJRoleEntity[], futureRoles: RoleInputType[], user: UserInfo, userPayload: UserPayload): Promise<boolean> {
        const rv = new RunView();
        let ok: boolean = true;

        // iterate through the existing roles and remove any that are not in the input
        for (const remove of currentRoles) {
            if (!this.IsStandardRole(remove.Name)) {
                if (!futureRoles.find(r => r.Name.trim().toLowerCase() === remove.Name.trim().toLowerCase())) {
                    ok = ok && await this.DeleteSingleRole(remove, rv, user, userPayload);
                }    
            }
        }
        return ok;
    }

    public get StandardRoles(): string[] {
        return ['Developer', 'Integration', 'UI']
    }
    public IsStandardRole(roleName: string): boolean {
        return this.StandardRoles.find(r => r.toLowerCase() === roleName.toLowerCase()) !== undefined;
    }

    protected async DeleteSingleRole(role: MJRoleEntity, rv: RunView, user: UserInfo, userPayload: UserPayload): Promise<boolean> {
        // first, remove all the UserRole records that match this role
        let ok: boolean = true;

        const r2 = await rv.RunView<MJUserRoleEntity>({
            EntityName: "MJ: User Roles",
            ExtraFilter: "RoleID = '" + role.ID + "'",
            ResultType: 'entity_object'
        }, user);
        if (r2.Success) {
            for (const ur of r2.Results) {
                ok = ok && await ur.Delete(); // remove the user role
            }
        }

        return ok && role.Delete(); // remove the role
    }

    /**
     * This mutation will sync the just the users in the system with the data provided in the input, matches existing users by email
     * @important This method will NOT work if the roles are not already in sync, meaning if User/Role relationships exist in the input data where the Role doesn't already exist in this system the sync will fail
     * @param data 
     */
    @RequireSystemUser()
    @Mutation(() => SyncRolesAndUsersResultType)
    async SyncUsers(
    @Arg('users', () => [UserInputType]) users: UserInputType[],
    @Ctx() context: AppContext
    ) : Promise<SyncRolesAndUsersResultType> {
        try {
            // first, we sync up the users and then the user roles. 
            // for syncing users we first remove users that are no longer in the input, then we add new users and update existing users
            const rv = new RunView();
            const result = await rv.RunView<MJUserEntity>({
                EntityName: "MJ: Users",
                ResultType: 'entity_object'
            }, context.userPayload.userRecord);
            if (result && result.Success) {
                // go through current users and remove those that are not in the input
                const currentUsers = result.Results;
                if (await this.DeleteRemovedUsers(currentUsers, users, context.userPayload.userRecord, context.userPayload)) {
                    if (await this.AddNewUsers(currentUsers, users, context.userPayload)) {
                        if (await this.UpdateExistingUsers(currentUsers, users, context.userPayload)) {
                            if (await this.SyncUserRoles(users, context.userPayload.userRecord, context.userPayload)) {
                                return { Success: true };
                            }    
                        }
                    }
                }
            }

            return { Success: false }; // if we get here, something went wrong
        } catch (err) {
            LogError(err);
            throw new Error('Error syncing roles and users\n\n' + err);
        }
    }

    protected async UpdateExistingUsers(currentUsers: MJUserEntity[], futureUsers: UserInputType[], userPayload: UserPayload): Promise<boolean> {  
        // go through the future users and update any that are in the current users
        let ok: boolean = true;

        for (const update of futureUsers) {
            const current = currentUsers.find(c => c.Email?.trim().toLowerCase() === update.Email?.trim().toLowerCase());
            if (current) {
                current.Name = update.Name;
                current.Type = update.Type;
                current.FirstName = update.FirstName;
                current.LastName = update.LastName;
                current.Title = update.Title;
                ok = ok && await current.Save();  
            }
        }
        return ok;
    }
    protected async AddNewUsers(currentUsers: MJUserEntity[], futureUsers: UserInputType[], userPayload: UserPayload): Promise<boolean> {
        // add users that are not in the current users
        const md = new Metadata();
        let ok: boolean = true;

        for (const add of futureUsers) {
            const match = currentUsers.find(currentUser => currentUser.Email?.trim().toLowerCase() === add.Email?.trim().toLowerCase());
            if (match) {
                // make sure the IsActive bit is set to true
                match.IsActive = true;
                ok = ok && await match.Save();  
            }  
            else {
                const user = await md.GetEntityObject<MJUserEntity>("MJ: Users", userPayload.userRecord);
                user.Name = add.Name;
                user.Type = add.Type;
                user.Email = add.Email;
                user.FirstName = add.FirstName;
                user.LastName = add.LastName;
                user.Title = add.Title;
                user.IsActive = true;

                ok = ok && await user.Save();  
            }
        }
        return ok;
    }

    protected async DeleteRemovedUsers(currentUsers: MJUserEntity[], futureUsers: UserInputType[], u: UserInfo, userPayload: UserPayload): Promise<boolean> {
        // remove users that are not in the future users
        const rv = new RunView();
        const md = new Metadata();

        let ok: boolean = true;
        //const tg = await md.CreateTransactionGroup(); HAVING PROBLEMS with this, so skipping for now, I think the entire thing is wrapped in a transaction and that's causing issues with two styles of trans wrappers
        for (const remove of currentUsers) {
            if (remove.Type.trim().toLowerCase() !== 'owner') {
                if (!futureUsers.find(r => r.Email.trim().toLowerCase() === remove.Email.trim().toLowerCase())) {
                    ok = ok && await this.DeleteSingleUser(remove, rv, u, userPayload);
                }
            }
        }
        return ok;
    }

    protected async DeleteSingleUser(user: MJUserEntity, rv: RunView, u: UserInfo, userPayload: UserPayload): Promise<boolean> {
        // first, remove all the UserRole records that match this user
        let ok: boolean = true;

        const r2 = await rv.RunView<MJUserRoleEntity>({
            EntityName: "MJ: User Roles",
            ExtraFilter: "UserID = '" + user.ID + "'",
            ResultType: 'entity_object'
        }, u);
        if (r2.Success) {
            for (const ur of r2.Results) {
                //ur.TransactionGroup = tg;
                ok = ok && await ur.Delete(); // remove the user role
            }
        }
        if (await user.Delete()) {
            return ok;
        }
        else {
            // in some cases there are a lot of fkey constraints that prevent the user from being deleted, so we mark the user as inactive instead
            user.IsActive = false;
            return await user.Save() && ok;
        }
    }

    protected async SyncUserRoles(users: UserInputType[], u: UserInfo, userPayload: UserPayload): Promise<boolean> {
        // for each user in the users array, make sure there is a User Role that matches. First, get a list of all DATABASE user and roels so we have that for fast lookup in memory
        const rv = new RunView();
        const md = new Metadata();

        const p1 = rv.RunView<MJUserEntity>({
            EntityName: "MJ: Users",
            ResultType: 'entity_object'
        }, u);
        const p2 = rv.RunView<MJRoleEntity>({
            EntityName: "MJ: Roles",
            ResultType: 'entity_object'
        }, u);
        const p3 = rv.RunView<MJUserRoleEntity>({
            EntityName: "MJ: User Roles",
            ResultType: 'entity_object'
        }, u);

        // await both 
        const [uResult,rResult, urResult] = await Promise.all([p1, p2, p3]);

        if (uResult.Success && rResult.Success && urResult.Success) {
            // we have the DB users and roles, and user roles
            const dbUsers = uResult.Results;
            const dbRoles = rResult.Results;    
            const dbUserRoles = urResult.Results;
            let ok: boolean = true;

            // now, we can do lookups in memory from those DB roles and Users for their ID values
            // now we will iterate through the users input type and for each role, make sure it is in there     
            //const tg = await md.CreateTransactionGroup();
            for (const user of users) {
                const dbUser = dbUsers.find(u => u.Email.trim().toLowerCase() === user.Email.trim().toLowerCase());
                if (dbUser) {
                    for (const role of user.Roles) {
                        const dbRole = dbRoles.find(r => r.Name.trim().toLowerCase() === role.Name.trim().toLowerCase());
                        if (dbRole) {
                            // now we need to make sure there is a user role that matches this user and role
                            if (!dbUserRoles.find(ur => ur.UserID === dbUser.ID && ur.RoleID === dbRole.ID)) {
                                // we need to add a user role
                                const ur = await md.GetEntityObject<MJUserRoleEntity>("MJ: User Roles", u);
                                ur.UserID = dbUser.ID;
                                ur.RoleID = dbRole.ID;
                                ok = ok && await ur.Save();  
                            }
                        }
                    }
                    // now, we check for DB user roles that are NOT in the user.Roles property as they are no longer part of the user's roles
                    const thisUserDBRoles = dbUserRoles.filter(ur => ur.UserID === dbUser.ID);
                    for (const dbUserRole of thisUserDBRoles) {
                        const role = user.Roles.find(r => r.Name.trim().toLowerCase() === dbRoles.find(rr => rr.ID === dbUserRole.RoleID)?.Name.trim().toLowerCase());
                        if (!role && !this.IsStandardRole(dbUserRole.Role)) {
                            // this user role is no longer in the user's roles, we need to remove it
                            //dbUserRole.TransactionGroup = tg;
                            ok = ok && await dbUserRole.Delete(); // remove the user role - we use await for the DELETE, not the save
                        }
                    }
                }
            }
            return ok;
        }
        else {
            return false;
        }
    }
}
 
