import { MJGlobal } from '@memberjunction/global';
import { IMetadataProvider, IRunViewProvider, RunViewResult } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';

/**
 * Parameters for running either a stored or dynamic view. 
 * A stored view is a view that is saved in the database and can be run either by ID or Name. 
 * A dynamic view is one that is not stored in the database and you provide parameters to return data as 
 * desired programatically.
 */
export type RunViewParams = {
    /**
     * optional - ID of the UserView record to run, if provided, ViewName is ignored
     */
    ViewID?: string
    /**
     * optional - Name of the UserView record to run, if you are using this, make sure to use a naming convention 
     * so that your view names are unique. For example use a prefix like __Entity_View_ etc so that you're 
     * likely to have a single result. If more than one view is available that matches a provided view name an 
     * exception will be thrown.
     */
    ViewName?: string
    /**
     * optional - this is the loaded instance of the BaseEntity (UserViewEntityComplete or a subclass of it). 
     * This is the preferred parameter to use IF you already have a view entity object loaded up in your code 
     * becuase by passing this in, the RunView() method doesn't have to lookup all the metadata for the view and it is faster.
     * If you provide ViewEntity, ViewID/ViewName are ignored.
     */
    ViewEntity?: BaseEntity
    /**
     * optional - this is only used if ViewID/ViewName/ViewEntity are not provided, it is used for 
     * Dynamic Views in combination with the optional ExtraFilter
     */
    EntityName?: string
    /**
     * An optional SQL WHERE clause that you can add to the existing filters on a stored view. For dynamic views, you can either 
     * run a view without a filter (if the entity definition allows it with AllowAllRowsAPI=1) or filter with any valid SQL WHERE clause.
     */
    ExtraFilter?: string
    /**
     * An optional SQL ORDER BY clause that you can use for dynamic views, as well as to OVERRIDE the stored view's sorting order.
     */
    OrderBy?: string
    /**
     * An optional array of field names that you want returned. The RunView() function will always return ID so you don't need to ask for that. If you leave this null then
     * for a dynamic view all fields are returned, and for stored views, the fields stored in it view configuration are returned.
      */
    Fields?: string[]
    /**
     * optional - string that represents a user "search" - typically from a text search option in a UI somewhere. This field is then used in the view filtering to search whichever fields are configured to be included in search in the Entity Fields definition.
     * Search String is combined with the stored view filters as well as ExtraFilter with an AND. 
     */
    UserSearchString?: string
    /**
     * optional - if provided, records that were returned in the specified UserViewRunID will NOT be allowed in the result set. 
     * This is useful if you want to run a particular view over time and exclude a specific prior run's resulting data set. If you
     * want to exclude ALL data returned from ALL prior runs, use the ExcludeDataFromAllPriorViewRuns property instead.
     */
    ExcludeUserViewRunID?: string
    /**
     * optional - if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true.
     * This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.
     */
    ExcludeDataFromAllPriorViewRuns?: boolean
    /**
     * optional - if you are providing the optional ExcludeUserViewRunID property, you can also optionally provide 
     * this filter which will negate the specific list of record IDs that are excluded by the ExcludeUserViewRunID property.
     * This can be useful if you want to ensure a certain class of data is always allowed into your view and not filtered out
     * by a prior view run.
     * 
     */
    OverrideExcludeFilter?: string
    /**
     * optional - if set to true, the LIST OF ID values from the view run will be stored in the User View Runs entity and the
     * newly created UserViewRun.ID value will be returned in the RunViewResult that the RunView() function sends back to ya.
     */
    SaveViewResults?: boolean
    /**
     * optional - if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you
     * want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.
     */
    IgnoreMaxRows?: boolean
    /**
     * optional - if provided, and if IgnoreMaxRows = false, this value will be used to constrain the total # of rows returned by the view. If this is not provided, either the default settings at the entity-level will be used, or if the entity has no UserViewMaxRows setting, all rows will be returned that match any filter, if provided.
     */
    MaxRows?: number
    /**
     * optional - if provided, this value will be used to offset the rows returned. 
     */
    StartRow?: number
    /**
     * optional - if set to true, the view run will ALWAYS be logged to the Audit Log, regardless of the entity's property settings for logging view runs.
     */
    ForceAuditLog?: boolean
    /**
     * optional - if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.
     */
    AuditLogDescription?: string

    /**
     * Result Type is: 'simple', 'entity_object', or 'count_only' and defaults to 'simple'. If 'entity_object' is specified, the Results[] array will contain
     * BaseEntity-derived objects instead of simple objects. This is useful if you want to work with the data in a more strongly typed manner and/or 
     * if you plan to do any update/delete operations on the data after it is returned. The 'count_only' option will return no rows, but the TotalRowCount property of the RunViewResult object will be populated.
     */
    ResultType?: 'simple' | 'entity_object' | 'count_only';
} 

/**
 * Class for running views in a generic, tier-independent manner - uses a provider model for 
 * implementation transparently from the viewpoint of the consumer of the class. By default the RunView class you create will
 * connect to the DEFAULT provider. If you want your RunView to connect to a different provider, you can pass in the provider
 * to the constructor.
 */
export class RunView  {
    private _provider: IRunViewProvider | null = null;
    /**
     * Optionally, you can pass in a provider to the constructor. If you do not, the static RunView.Provider property is used.
     * @param Provider 
     */
    constructor(Provider: IRunViewProvider | null = null) {
        if (Provider)
            this._provider = Provider;
    }

    /**
     * This property is used to get the IRunViewProvider implementation that is used by this instance of the RunView class. If a provider was specified to the constructor, that provider is used, otherwise the static RunView.Provider property is used.
     */
    public get ProviderToUse(): IRunViewProvider {
        return this._provider || RunView.Provider;
    }

    /**
     * Used to check to see if the entity in question is active or not
     * If it is not active, it will throw an exception or log a warning depending on the status of the entity being
     * either Deprecated or Disabled.
     * @param entityName 
     * @param callerName 
     */
    protected async EntityStatusCheck(params: RunViewParams, callerName: string) {
        const md = (this.ProviderToUse as any as IMetadataProvider);
        const entityName = await RunView.GetEntityNameFromRunViewParams(params, md);
        const entity = md.Entities.find(e => e.Name.trim().toLowerCase() === entityName?.trim().toLowerCase());
        if (!entity) {
            throw new Error(`Entity ${entityName} not found in metadata`);
        }
        EntityInfo.AssertEntityActiveStatus(entity, callerName);
    }

    /**
     * Runs a view based on the provided parameters, see documentation for RunViewParams for more
     * @param params 
     * @param contextUser if provided, this user is used for permissions and logging. For server based calls, this is generally required because there is no "Current User" since this object is shared across all requests.
     * @returns 
     */
    public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        this.EntityStatusCheck(params, 'RunView');

        // FIRST, if the resultType is entity_object, we need to run the view with ALL fields in the entity
        // so that we can get the data to populate the entity object with.
        if (params.ResultType === 'entity_object') {
            // we need to get the entity definition and then get all the fields for it
            const p = <IMetadataProvider><any>this.ProviderToUse;
            const entity = p.Entities.find(e => e.Name.trim().toLowerCase() === params.EntityName.trim().toLowerCase());
            if (!entity)
                throw new Error(`Entity ${params.EntityName} not found in metadata`);
            params.Fields = entity.Fields.map(f => f.Name); // just override whatever was passed in with all the fields - or if nothing was passed in, we set it. For loading the entity object, we need ALL the fields.
        }

        // Run the view
        const result = await this.ProviderToUse.RunView<T>(params, contextUser);
        // Transform the result set into BaseEntity-derived objects, if needed
        await this.TransformSimpleObjectToEntityObject(params, result, contextUser);

        return result;
    }

    /**
     * Runs multiple views based on the provided parameters, see documentation for RunViewParams for more information
     * @param params 
     * @param contextUser 
     * @returns 
     */
    public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        if (params && params.length > 0) {
            const p = <IMetadataProvider><any>this.ProviderToUse;
        
            for (const param of params) {
                this.EntityStatusCheck(param, 'RunView');

                // FIRST, if the resultType is entity_object, we need to run the view with ALL fields in the entity
                // so that we can get the data to populate the entity object with.
                if (param.ResultType === 'entity_object') {
                    // we need to get the entity definition and then get all the fields for it
                    const entity: EntityInfo | undefined = p.Entities.find(e => e.Name.trim().toLowerCase() === param.EntityName.trim().toLowerCase());
                    if (!entity){
                        throw new Error(`Entity ${param.EntityName} not found in metadata`);
                    }
                    param.Fields = entity.Fields.map(f => f.Name); // just override whatever was passed in with all the fields - or if nothing was passed in, we set it. For loading the entity object, we need ALL the fields.
                }
            }
    
            // NOW, run the view
            const results: RunViewResult<T>[] = await this.ProviderToUse.RunViews<T>(params, contextUser);
    
            for(const [index, result] of results.entries()){
                await this.TransformSimpleObjectToEntityObject(params[index], result, contextUser);
            }
    
            return results;    
        }
        else {
            return [];
        }
    }

    protected async TransformSimpleObjectToEntityObject(param: RunViewParams, result: RunViewResult, contextUser?: UserInfo) {
        // only if needed (e.g. ResultType==='entity_object'), transform the result set into BaseEntity-derived objects
        if (param.ResultType === 'entity_object' && result && result.Success){
            // we need to transform each of the items in the result set into a BaseEntity-derived object
            const p = <IMetadataProvider><any>this.ProviderToUse;
            
            // Create entities and load data in parallel for better performance
            const entityPromises = result.Results.map(async (item) => {
                const entity = await p.GetEntityObject(param.EntityName, contextUser);
                await entity.LoadFromData(item);
                return entity;
            });
            
            result.Results = await Promise.all(entityPromises);
        }
    }

    private static _globalProviderKey: string = 'MJ_RunViewProvider';
    /**
     * This is the static provider property that is used to get/set the IRunViewProvider implementation that is used by the RunView class.
     * This property can be overridden on a per-instance basis by passing in the optional Provider parameter to the RunView constructor.
     */
    public static get Provider(): IRunViewProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[RunView._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IRunViewProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[RunView._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }


    /**
     * Utility method that calculates the entity name for a given RunViewParams object by looking at the EntityName property as well as the ViewID/ViewName/ViewEntity properties as needed.
     * @param params 
     * @returns 
     */
    public static async GetEntityNameFromRunViewParams(params: RunViewParams, provider: IMetadataProvider | null = null): Promise<string> {
        const p = provider ? provider : <IMetadataProvider><any>RunView.Provider;

        if (params.EntityName)
            return params.EntityName;
        else if (params.ViewEntity) {
            const entityID = params.ViewEntity.Get('EntityID'); // using weak typing because this is MJCore and we don't want to use the sub-classes from core-entities as that would create a circular dependency
            const entity = p.Entities.find(e => e.ID === entityID);
            if (entity)
                return entity.Name
        }
        else if (params.ViewID || params.ViewName) {
            // we don't have a view entity loaded, so load it up now
            const rv = new RunView(<IRunViewProvider><any>p);
            const result = await rv.RunView({
                EntityName: "User Views",
                ExtraFilter: params.ViewID ? `ID = '${params.ViewID}'` : `Name = '${params.ViewName}'`,
                ResultType: 'entity_object'
            });
            if (result && result.Success && result.Results.length > 0) {
                return result.Results[0].Entity; // virtual field in the User Views entity called Entity
            }
        }
        else
            return null;
    }
}