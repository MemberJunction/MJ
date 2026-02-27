import { Arg, Ctx, Field, ObjectType, Query, Resolver } from "type-graphql";
import { AppContext } from "../types.js";
import { DataContext } from "@memberjunction/data-context";
import { GetReadOnlyDataSource, GetReadOnlyProvider } from "../util.js";
import { Metadata } from "@memberjunction/core";
import { MJDataContextItemEntity } from "@memberjunction/core-entities";
import { ResolverBase } from "../generic/ResolverBase.js";

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

        try {
            const ds = GetReadOnlyDataSource(appCtx.dataSources, {
                allowFallbackToReadWrite: true,
            })
            const md = GetReadOnlyProvider(appCtx.providers, {allowFallbackToReadWrite: true});
            const dciData = await md.GetEntityObject<MJDataContextItemEntity>("MJ: Data Context Items", appCtx.userPayload.userRecord);
            if (await dciData.Load(DataContextItemID)) {
                const dci = DataContext.CreateDataContextItem(); // use class factory to get whatever lowest level sub-class is registered
                await dci.LoadMetadataFromEntityRecord(dciData, Metadata.Provider, appCtx.userPayload.userRecord);
                // now the metadata is loaded so we can call the regular load function
                if (await dci.LoadData(ds)) {
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
                ErrorMessage: e,
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

        try {
            // our job here is to load the entire data context, so we do that with the Data Context object
            const dc = new DataContext();
            const ds = GetReadOnlyDataSource(appCtx.dataSources, {
                allowFallbackToReadWrite: true,
            })
            const success = await dc.Load(DataContextID, ds, true, false, 0, appCtx.userPayload.userRecord);
            if (success) {
                const retVal =   {
                    Success: true,
                    ErrorMessages: null,
                    Results: dc.Items.map((item) => {
                        return JSON.stringify(item.Data);
                    }),
                }
                return retVal;
            }
            else {
                return {
                    Success: false,
                    ErrorMessages: ['Error loading data context'],
                    Results: null,    
                }
            }
        }
        catch (e) {
            return {
                Success: false,
                ErrorMessages: [e],
                Results: null,
            }
        }
    }
}