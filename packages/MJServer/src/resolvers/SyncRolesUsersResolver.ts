import { Arg, Ctx, Field, InputType, Mutation, ObjectType, registerEnumType } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { DatabaseProviderBase, EntityDeleteOptions, EntitySaveOptions, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
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
        // Wrap roles + users in one DB transaction so a user-sync failure
        // rolls back any role changes made earlier in this call. Prior code
        // attempted this with a TransactionGroup but ran into nesting issues —
        // direct DB transactions per the plan doc avoid that.
        try {
            const provider = Metadata.Provider as DatabaseProviderBase;
            await provider.BeginTransaction();
            try {
                const roleResult = await this.DoSyncRoles(data.Roles, context.userPayload.userRecord, context.userPayload);
                if (!roleResult.Success) {
                    await provider.RollbackTransaction();
                    return roleResult;
                }

                const usersResult = await this.DoSyncUsers(data.Users, context.userPayload.userRecord, context.userPayload);
                if (!usersResult.Success) {
                    await provider.RollbackTransaction();
                    return usersResult;
                }

                await provider.CommitTransaction();

                // refresh the user cache — one-time, since the normal auto-refresh is already scheduled
                await UserCache.Instance.Refresh(context.dataSource);
                return usersResult;
            } catch (txErr) {
                await provider.RollbackTransaction();
                throw txErr;
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
        // Wrap delete + add + update of roles in one DB transaction so any failure
        // rolls back the whole batch. Keeps the sync idempotent across retries.
        try {
            const provider = Metadata.Provider as DatabaseProviderBase;
            await provider.BeginTransaction();
            try {
                const result = await this.DoSyncRoles(roles, context.userPayload.userRecord, context.userPayload);
                if (result.Success) {
                    await provider.CommitTransaction();
                } else {
                    await provider.RollbackTransaction();
                }
                return result;
            } catch (txErr) {
                await provider.RollbackTransaction();
                throw txErr;
            }
        } catch (err) {
            LogError(err);
            throw new Error('Error syncing roles and users\n\n' + err);
        }
    }

    /** Transaction-free core of SyncRoles — expected to be invoked inside an outer transaction. */
    protected async DoSyncRoles(roles: RoleInputType[], user: UserInfo, userPayload: UserPayload): Promise<SyncRolesAndUsersResultType> {
        const rv = new RunView();
        const result = await rv.RunView<MJRoleEntity>({
            EntityName: "MJ: Roles",
            ResultType: 'entity_object'
        }, user);

        if (!result || !result.Success) {
            return { Success: false };
        }

        const currentRoles = result.Results;
        if (!await this.DeleteRemovedRoles(currentRoles, roles, user, userPayload)) {
            return { Success: false };
        }
        if (!await this.AddNewRoles(currentRoles, roles, user, userPayload)) {
            return { Success: false };
        }
        return await this.UpdateExistingRoles(currentRoles, roles, userPayload);
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
        // Wrap delete + add + update + role-sync of users in one DB transaction.
        try {
            const provider = Metadata.Provider as DatabaseProviderBase;
            await provider.BeginTransaction();
            try {
                const result = await this.DoSyncUsers(users, context.userPayload.userRecord, context.userPayload);
                if (result.Success) {
                    await provider.CommitTransaction();
                } else {
                    await provider.RollbackTransaction();
                }
                return result;
            } catch (txErr) {
                await provider.RollbackTransaction();
                throw txErr;
            }
        } catch (err) {
            LogError(err);
            throw new Error('Error syncing roles and users\n\n' + err);
        }
    }

    /** Transaction-free core of SyncUsers — expected to be invoked inside an outer transaction. */
    protected async DoSyncUsers(users: UserInputType[], user: UserInfo, userPayload: UserPayload): Promise<SyncRolesAndUsersResultType> {
        const rv = new RunView();
        const result = await rv.RunView<MJUserEntity>({
            EntityName: "MJ: Users",
            ResultType: 'entity_object'
        }, user);

        if (!result || !result.Success) {
            return { Success: false };
        }

        const currentUsers = result.Results;
        if (!await this.DeleteRemovedUsers(currentUsers, users, user, userPayload)) return { Success: false };
        if (!await this.AddNewUsers(currentUsers, users, userPayload)) return { Success: false };
        if (!await this.UpdateExistingUsers(currentUsers, users, userPayload)) return { Success: false };
        if (!await this.SyncUserRoles(users, user, userPayload)) return { Success: false };
        return { Success: true };
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
                ok = ok && await ur.Delete(); // remove the user role — part of the outer transaction
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

            // now, we can do lookups in memory from those DB roles and Users for their ID values.
            // now we will iterate through the users input type and for each role, make sure it is in there.
            // Saves/Deletes below run inside the outer SyncUsers/SyncRolesAndUsers transaction.
            for (const user of users) {
                const dbUser = dbUsers.find(u => u.Email.trim().toLowerCase() === user.Email.trim().toLowerCase());
                if (dbUser) {
                    for (const role of user.Roles) {
                        const dbRole = dbRoles.find(r => r.Name.trim().toLowerCase() === role.Name.trim().toLowerCase());
                        if (dbRole) {
                            // now we need to make sure there is a user role that matches this user and role
                            if (!dbUserRoles.find(ur => UUIDsEqual(ur.UserID, dbUser.ID) && UUIDsEqual(ur.RoleID, dbRole.ID))) {
                                // we need to add a user role
                                const ur = await md.GetEntityObject<MJUserRoleEntity>("MJ: User Roles", u);
                                ur.UserID = dbUser.ID;
                                ur.RoleID = dbRole.ID;
                                ok = ok && await ur.Save();  
                            }
                        }
                    }
                    // now, we check for DB user roles that are NOT in the user.Roles property as they are no longer part of the user's roles
                    const thisUserDBRoles = dbUserRoles.filter(ur => UUIDsEqual(ur.UserID, dbUser.ID));
                    for (const dbUserRole of thisUserDBRoles) {
                        const role = user.Roles.find(r => r.Name.trim().toLowerCase() === dbRoles.find(rr => UUIDsEqual(rr.ID, dbUserRole.RoleID))?.Name.trim().toLowerCase());
                        if (!role && !this.IsStandardRole(dbUserRole.Role)) {
                            // this user role is no longer in the user's roles, we need to remove it
                            ok = ok && await dbUserRole.Delete();
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
 
