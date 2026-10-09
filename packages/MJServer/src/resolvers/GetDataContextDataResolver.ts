import { Arg, Ctx, Field, ObjectType, Query, Resolver } from "type-graphql";
import type { DatabaseProviderBase, UserInfo } from "@memberjunction/core";
import { IsValidUUID, UUIDsEqual } from "@memberjunction/global";
import { DataContext, DataContextItem } from "@memberjunction/data-context";
import { MJDataContextEntity, MJDataContextItemEntity } from "@memberjunction/core-entities";
import { RenderPipeline } from "@memberjunction/generic-database-provider";
import { AppContext } from "../types.js";
import { GetReadOnlyProvider } from "../util.js";
import { ResolverBase } from "../generic/ResolverBase.js";
import { IsScopeLimitedPrincipal } from "../auth/scopeLimitedPrincipal.js";

@ObjectType()
export class GetDataContextItemDataOutputType {
    @Field(() => Boolean)
    Success: boolean;

    /**
     * If not successful, this will be the error message.
     */
    @Field(() => String, { nullable: true })
    ErrorMessage: string | null;

    /**
     * If successful, this will be the JSON for the data context item's data.
     */
    @Field(() => String, { nullable: true })  
    Result: string | null;
}

@ObjectType()
export class GetDataContextDataOutputType {
    @Field(() => Boolean)
    Success: boolean;

    @Field(() => [String], { nullable: 'itemsAndList' }) // Allow nulls inside array & entire field nullable
    ErrorMessages: (string | null)[];

    /**
     * Each data context item's results will be converted to JSON and returned as a string
     */
    @Field(() => [String], { nullable: 'itemsAndList' }) // Allow nulls inside array & entire field nullable
    Results: (string | null)[];
}


/**
 * Loads the data of data contexts and their items.
 *
 * Items of type `sql` hold raw SQL, which is held to the rules ExecuteAdhocQuery applies to
 * caller-supplied SQL. It runs only for the data context's owner or an administrator (Owner-type
 * user), never for a scope-limited session, only on the read-only provider, and only as a single read
 * statement over entity base views the caller may read in full. Items of the other types load through
 * entity permissions for the calling user.
 */
@Resolver()
export class GetDataContextDataResolver extends ResolverBase {
    /**
     * Returns data for a given data context item.
     * @param DataContextItemID
     */
    @Query(() => GetDataContextItemDataOutputType)
    async GetDataContextItemData(
        @Arg('DataContextItemID', () => String) DataContextItemID: string,
        @Ctx() appCtx: AppContext
    ) {
        // Check API key scope authorization for data context read
        await this.CheckAPIKeyScopeAuthorization('datacontext:read', DataContextItemID, appCtx.userPayload);
        if (!IsValidUUID(DataContextItemID)) {
            return { Success: false, ErrorMessage: 'DataContextItemID must be a UUID', Result: null };
        }

        try {
            const user: UserInfo = appCtx.userPayload.userRecord;
            const md = GetReadOnlyProvider(appCtx.providers, {allowFallbackToReadWrite: true});
            const dciData = await md.GetEntityObject<MJDataContextItemEntity>("MJ: Data Context Items", user);
            if (await dciData.Load(DataContextItemID)) {
                const dci = DataContext.CreateDataContextItem(); // use class factory to get whatever lowest level sub-class is registered
                await dci.LoadMetadataFromEntityRecord(dciData, md, user);
                const ownerID = dci.Type === 'sql' ? await this.loadDataContextOwnerID(dciData.DataContextID, md, user) : null;
                const sqlProvider = this.authorizeSQLItems([dci], ownerID, appCtx);
                // now the metadata is loaded so we can call the regular load function
                if (await dci.LoadData(sqlProvider, false, false, 0, user)) {
                    return {
                        Success: true,
                        ErrorMessage: null,
                        Result: JSON.stringify(dci.Data),
                    }
                }
                else {
                    return {
                        Success: false,
                        ErrorMessage: 'Error loading data context item data',
                        Result: null,
                    }
                }
            }
            else {
                return {
                    Success: false,
                    ErrorMessage: 'Error loading data context item metadata',
                    Result: null,
                }
            }    
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e),
                Result: null,
            }
        }
    }

    /**
     * Returns data for a given data context.
     * @param DataContextID
     */
    @Query(() => GetDataContextDataOutputType)
    async GetDataContextData(
        @Arg('DataContextID', () => String) DataContextID: string,
        @Ctx() appCtx: AppContext
    ) {
        // Check API key scope authorization for data context read
        await this.CheckAPIKeyScopeAuthorization('datacontext:read', DataContextID, appCtx.userPayload);
        // DataContext.LoadMetadata places this ID in the item filter, so it must be a plain UUID.
        if (!IsValidUUID(DataContextID)) {
            return { Success: false, ErrorMessages: ['DataContextID must be a UUID'], Results: null };
        }

        try {
            // our job here is to load the entire data context, so we do that with the Data Context object
            const user: UserInfo = appCtx.userPayload.userRecord;
            const md = GetReadOnlyProvider(appCtx.providers, { allowFallbackToReadWrite: true });
            const dc = new DataContext();
            if (await dc.LoadMetadata(DataContextID, user, md)) {
                const sqlProvider = this.authorizeSQLItems(dc.Items, dc.MJDataContextEntity.UserID, appCtx);
                if (await dc.LoadData(sqlProvider, true, false, 0, user)) {
                    return {
                        Success: true,
                        ErrorMessages: null,
                        Results: dc.Items.map((item) => {
                            return JSON.stringify(item.Data);
                        }),
                    }
                }
            }
            return {
                Success: false,
                ErrorMessages: ['Error loading data context'],
                Results: null,
            }
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessages: [e instanceof Error ? e.message : String(e)],
                Results: null,
            }
        }
    }

    /**
     * Authorizes running the `sql` items among `items` and returns the read-only provider they run on,
     * or null when there are none. Throws with the reason when they may not run.
     */
    private authorizeSQLItems(items: DataContextItem[], ownerID: string | null, appCtx: AppContext): DatabaseProviderBase | null {
        const sqlItems = items.filter((item) => item.Type === 'sql');
        if (sqlItems.length === 0) {
            return null;
        }
        const user: UserInfo | undefined = appCtx.userPayload?.userRecord;
        if (!user || IsScopeLimitedPrincipal(user)) {
            throw new Error('SQL data context items cannot be run by a scope-limited or unidentified session.');
        }
        if (!this.mayRunDataContextSQL(ownerID, user)) {
            throw new Error('Only the owner of this data context, or an administrator, may run its SQL items.');
        }
        const provider = GetReadOnlyProvider(appCtx.providers, { allowFallbackToReadWrite: false });
        if (!provider) {
            throw new Error('No read-only data source is configured, so SQL data context items cannot run.');
        }
        for (const item of sqlItems) {
            this.screenItemSQL(item.SQL ?? '', provider, user);
        }
        return provider;
    }

    /** True when `user` owns the data context or is an administrator (Owner-type user). */
    private mayRunDataContextSQL(ownerID: string | null, user: UserInfo): boolean {
        const isOwner = !!ownerID && UUIDsEqual(ownerID, user.ID);
        return isOwner || user.Type?.trim().toLowerCase() === 'owner';
    }

    /**
     * Throws unless `sqlText` is a single read statement whose every table reference is an entity base
     * view `user` may read without row-level or field-level narrowing. It is the check ExecuteAdhocQuery
     * makes on the rendered SQL.
     */
    private screenItemSQL(sqlText: string, provider: DatabaseProviderBase, user: UserInfo): void {
        const rendered = RenderPipeline.Run(sqlText, { Platform: provider.PlatformKey, ContextUser: user, RequireReadStatement: true });
        this.assertFullQueryUsesReadableEntityViews(rendered.Trace.AfterTemplates, provider, user, 'data context SQL');
    }

    /** Returns the owner (`UserID`) of a data context, or null when the caller cannot load it. */
    private async loadDataContextOwnerID(dataContextID: string, provider: DatabaseProviderBase, user: UserInfo): Promise<string | null> {
        const dataContext = await provider.GetEntityObject<MJDataContextEntity>('MJ: Data Contexts', user);
        return (await dataContext.Load(dataContextID)) ? dataContext.UserID : null;
    }
}
