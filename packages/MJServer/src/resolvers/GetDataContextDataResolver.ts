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


/** The outcome of loading one data context item: its data as JSON, or why it has none. */
interface ItemOutcome {
    Result: string | null;
    Error: string | null;
}

/** Which `sql` items of a data context may run: the read-only provider, and each refused item's reason. */
interface SQLItemGate {
    Provider: DatabaseProviderBase | null;
    Refusals: Map<DataContextItem, string>;
}

/**
 * Loads the data of data contexts and their items.
 *
 * Items of type `sql` hold raw SQL, which is held to the rules ExecuteAdhocQuery applies to
 * caller-supplied SQL. It runs only for the data context's owner or an administrator (Owner-type
 * user), never for a scope-limited session, only on the read-only provider, and only as a single read
 * statement over entity base views the caller may read in full. A SQL item that may not run is
 * refused on its own, and the other items still load. Items of the other types load through entity
 * permissions for the calling user.
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
                const gate = this.authorizeSQLItems([dci], ownerID, appCtx);
                // now the metadata is loaded so we can call the regular load function
                const outcome = await this.loadItem(dci, gate, user, false);
                return {
                    Success: outcome.Error === null,
                    ErrorMessage: outcome.Error,
                    Result: outcome.Result,
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
     * Returns data for a given data context. `Results` and `ErrorMessages` hold one entry per item, in
     * item order. `Success` is true, and `ErrorMessages` null, only when every item loaded.
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
            if (!(await dc.LoadMetadata(DataContextID, user, md))) {
                return {
                    Success: false,
                    ErrorMessages: ['Error loading data context'],
                    Results: null,
                }
            }
            const gate = this.authorizeSQLItems(dc.Items, dc.MJDataContextEntity.UserID, appCtx);
            const outcomes = await Promise.all(dc.Items.map((item) => this.loadItem(item, gate, user, true)));
            const allLoaded = outcomes.every((outcome) => outcome.Error === null);
            return {
                Success: allLoaded,
                ErrorMessages: allLoaded ? null : outcomes.map((outcome) => outcome.Error),
                Results: outcomes.map((outcome) => outcome.Result),
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
     * Decides which `sql` items among `items` may run. Returns the read-only provider they run on, and
     * the reason for each SQL item that may not run.
     */
    private authorizeSQLItems(items: DataContextItem[], ownerID: string | null, appCtx: AppContext): SQLItemGate {
        const refusals = new Map<DataContextItem, string>();
        const sqlItems = items.filter((item) => item.Type === 'sql');
        if (sqlItems.length === 0) {
            return { Provider: null, Refusals: refusals };
        }
        const user: UserInfo | undefined = appCtx.userPayload?.userRecord;
        const provider = GetReadOnlyProvider(appCtx.providers, { allowFallbackToReadWrite: false });
        for (const item of sqlItems) {
            const refusal = this.sqlItemRefusal(item, ownerID, user, provider);
            if (refusal !== null) {
                refusals.set(item, refusal);
            }
        }
        return { Provider: provider, Refusals: refusals };
    }

    /** Returns why `item` may not run for `user`, or null when it may. */
    private sqlItemRefusal(item: DataContextItem, ownerID: string | null, user: UserInfo | undefined, provider: DatabaseProviderBase | null): string | null {
        if (!user || IsScopeLimitedPrincipal(user)) {
            return 'SQL data context items cannot be run by a scope-limited or unidentified session.';
        }
        if (!this.mayRunDataContextSQL(ownerID, user)) {
            return 'Only the owner of this data context, or an administrator, may run its SQL items.';
        }
        if (!provider) {
            return 'No read-only data source is configured, so SQL data context items cannot run.';
        }
        return this.screenItemSQL(item.SQL ?? '', provider, user);
    }

    /** True when `user` owns the data context or is an administrator (Owner-type user). */
    private mayRunDataContextSQL(ownerID: string | null, user: UserInfo): boolean {
        const isOwner = !!ownerID && UUIDsEqual(ownerID, user.ID);
        return isOwner || user.Type?.trim().toLowerCase() === 'owner';
    }

    /**
     * Returns why `sqlText` may not run, or null when it is a single read statement whose every table
     * reference is an entity base view `user` may read without row-level or field-level narrowing. It is
     * the check ExecuteAdhocQuery makes on the rendered SQL.
     */
    private screenItemSQL(sqlText: string, provider: DatabaseProviderBase, user: UserInfo): string | null {
        try {
            const rendered = RenderPipeline.Run(sqlText, { Platform: provider.PlatformKey, ContextUser: user, RequireReadStatement: true });
            this.assertFullQueryUsesReadableEntityViews(rendered.Trace.AfterTemplates, provider, user, 'data context SQL');
            return null;
        }
        catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            return reason || 'The SQL of this item did not pass the read-only check.';
        }
    }

    /** Loads one item's data unless `gate` refused it. Returns the data as JSON, or why there is none. */
    private async loadItem(item: DataContextItem, gate: SQLItemGate, user: UserInfo, forceRefresh: boolean): Promise<ItemOutcome> {
        const refusal = gate.Refusals.get(item);
        if (refusal !== undefined) {
            return { Result: null, Error: refusal };
        }
        if (await item.LoadData(gate.Provider, forceRefresh, false, 0, user)) {
            return { Result: JSON.stringify(item.Data), Error: null };
        }
        return { Result: null, Error: item.DataLoadingError || 'Error loading data context item data' };
    }

    /** Returns the owner (`UserID`) of a data context, or null when the caller cannot load it. */
    private async loadDataContextOwnerID(dataContextID: string, provider: DatabaseProviderBase, user: UserInfo): Promise<string | null> {
        const dataContext = await provider.GetEntityObject<MJDataContextEntity>('MJ: Data Contexts', user);
        return (await dataContext.Load(dataContextID)) ? dataContext.UserID : null;
    }
}
