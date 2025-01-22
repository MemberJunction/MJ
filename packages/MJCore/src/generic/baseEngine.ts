import { BaseSingleton, MJEvent, MJEventType, MJGlobal } from "@memberjunction/global";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { debounceTime } from "rxjs/operators";

import { UserInfo } from "./securityInfo";
import { RunView, RunViewParams } from "../views/runView";
import { LogError, LogStatus } from "./logging";
import { Metadata } from "./metadata";
import { DatasetItemFilterType, DatasetResultType, IMetadataProvider, IRunViewProvider, ProviderType, RunViewResult } from "./interfaces";
import { BaseInfo } from "./baseInfo"; 
import { BaseEntity, BaseEntityEvent } from "./baseEntity";
/**
 * Property configuration for the BaseEngine class to automatically load/set properties on the class.
 */
export class BaseEnginePropertyConfig extends BaseInfo {
    /**
     * The type of item to load, either 'entity' or 'dataset', defaults to 'entity'
     */
    Type: 'entity' | 'dataset' = 'entity';
    /**
     * The name of the property in the class instance
     */
    PropertyName: string;
    /**
     * The entity name to load from the database, required if Type is 'entity'
     */
    EntityName?: string;
    /**
     * The dataset name to load from the database, required if Type is 'dataset'
     */
    DatasetName?: string;
    /**
     * Optional, filters to apply to the data load, applies only when type is 'entity'. Use DatasetItemFilters for dataset filters.
     */
    Filter?: string;
    /**
     * Optional, filters to apply to each item in a dataset, only applies when type is 'dataset' and is optional in those cases.
     */
    DatasetItemFilters?: DatasetItemFilterType[];
    /**
     * Optional, only used if Type is 'dataset', specifies how to handle the results of the dataset load. Defaults to 'single_property' if not specified. When set to 'single_property', the entire dataset is set to the property specified by PropertyName. 
     * When set to 'individual_properties', each item in the dataset is set to a property on the object with the name of the item's key plus the item's Code name. 
     * For example, if the item's key is 'Demo' and the item's Code name is 'FirstItem', the property set on the object would be 'Demo_FirstItem'.
     */
    DatasetResultHandling?: 'single_property' | 'individual_properties' = 'single_property';
    /**
     * Optional, order by clause to apply to the data load, only applies when type is 'entity'
     */
    OrderBy?: string;
    /**
     * Optional, expiration time in milliseconds
     */
    Expiration?: number; 
    /**
     * Optional, whether to add the result to the object, defaults to true if not specified
     */
    AddToObject?: boolean;  
    /**
     * Optional, defaults to true. If set to false, AutoRefresh for this item will be disabled. By default, whenever a BaseEntity event is emitted for a save/delete, if the entity name
     * for this config matches the BaseEntity's entity name, the config will be refreshed. If this is set to false, that will not happen. NOTE: This is not a network notification mechanism,
     * it only works within the local tier, so for example within a browser application, that brower's engine sub-classes will be updated when changes are made to entities in that application
     * environment, and the same is true for MJAPI/Server based environments. If you need network based notification, additional infrastructure will be needed to implement that.
     */
    AutoRefresh?: boolean = true;

    constructor(init?: Partial<BaseEnginePropertyConfig>) {
        super();
        // now copy the values from init to this object
        if (init)
            Object.assign(this, init);
    }
}
 

/**
 * Abstract base class for any engine-style class which executes work on behalf of a caller typically using a provider-style architecture with plug-ins. This base class
 * provides a mechanism for loading metadata from the database and caching it for use by the engine. Subclasses must implement the Config abstract method and within that
 * generally it is recommended to call the Load method to load the metadata. Subclasses can also override the AdditionalLoading method to perform additional loading tasks. 
 */
export abstract class BaseEngine<T> extends BaseSingleton<T> {
    private _loaded: boolean = false;
    private _loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private _contextUser: UserInfo;
    private _metadataConfigs: BaseEnginePropertyConfig[] = [];
    private _dynamicConfigs: Map<string, BaseEnginePropertyConfig> = new Map();
    private _dataMap: Map<string, { entityName?: string, datasetName?: string, data: any[] }> = new Map();
    private _expirationTimers: Map<string, number> = new Map();
    private _entityEventSubjects: Map<string, Subject<BaseEntityEvent>> = new Map();
    private _provider: IMetadataProvider;

    /**
     * While the BaseEngine class is a singleton, normally, it is possible to have multiple instances of the class in an application if the class is used in multiple contexts that have different providers.
     */
    public constructor() {
        super();
    }

    /**
     * Returns the metadata provider to use for the engine. If a provider is set via the Config method, that provider will be used, otherwise the default provider will be used.
     */
    public get ProviderToUse(): IMetadataProvider {
        return this._provider || Metadata.Provider;
    }

    /**
     * Returns the RunView provider to use for the engine. This is the same underlying object as the @property ProviderTouse, but cast to IRunViewProvider. 
     * If a provider is set via the Config method, that provider will be used, otherwise the default provider will be used.
     */
    public get RunViewProviderToUse(): IRunViewProvider {
        return <IRunViewProvider><any>this.ProviderToUse;
    }

    /**
     * Returns a COPY of the metadata configs array for the engine. This is a copy so you can't modify the original configs by modifying this array.
     */
    public get Configs(): BaseEnginePropertyConfig[] {
        // do a full deep copy of the array to ensure no tampering
        return JSON.parse(JSON.stringify(this._metadataConfigs));
    }
 
    /**
     * Configures the engine by loading metadata from the database.  
     */
    public abstract Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider);

    /**
     * This method should be called by sub-classes to load up their specific metadata requirements. For more complex metadata
     * loading or for post-processing of metadata loading done here, overide the AdditionalLoading method to add your logic.
     * @param configs 
     * @param contextUser 
     * @returns 
     */
    protected async Load(configs: Partial<BaseEnginePropertyConfig>[], provider: IMetadataProvider, forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        if (Metadata.Provider.ProviderType === ProviderType.Database && !contextUser)
            throw new Error('For server-side use of all engine classes, you must provide the contextUser parameter')
        if (this._loadingSubject.value) {
            return new Promise<void>((resolve) => {
                const subscription = this._loadingSubject.subscribe((loading) => {
                    if (!loading) {
                        subscription.unsubscribe();
                        resolve();
                    }
                });
            });
        }

        if (!this._loaded || forceRefresh) {
            this._loadingSubject.next(true);
            try {
                this.SetProvider(provider);
                this._contextUser = contextUser;

                await this.LoadConfigs(configs, contextUser);
                await this.AdditionalLoading(contextUser); // Call the additional loading method
                await this.SetupGlobalEventListener();
                this._loaded = true;
            } catch (e) {
                LogError(e);
            } finally {
                this._loadingSubject.next(false);
            }
        }
    }

    /**********************************************************************
     * This section is for handling caching of multiple instances when needed
     * We use the primary singleton as the instance to store a cache of instances
     * that are tied to specific providers. This is useful when we have multiple
     * providers in a given app going to different connections.
     *********************************************************************/
    private static _providerInstances: Map<IMetadataProvider, any> = new Map();
    private static get ProviderInstances(): Map<IMetadataProvider, any> {
        return BaseEngine._providerInstances;
    }

    /**
     * This method will check for the existence of an instance of this engine class that is tied to a specific provider. If one exists, it will return it, otherwise it will create a new instance
     */
    public static GetProviderInstance<T>(provider: IMetadataProvider, subclassConstructor: new () => BaseEngine<T>): BaseEngine<T> {
        if (BaseEngine.ProviderInstances.has(provider)) {
            return BaseEngine.ProviderInstances.get(provider);
        }
        else {
            // we don't have an existing instance for this provider, so we need to create one
            const newInstance = new subclassConstructor();// (new (this.constructor())) as BaseEngine<T>;
            newInstance.SetProvider(provider);
            BaseEngine.ProviderInstances.set(provider, newInstance);
            return newInstance;
        }
    }

    /**
     * Internal method to set the provider when an engine is loaded
     * @param provider 
     */
    protected SetProvider(provider: IMetadataProvider) {
        this._provider = provider;
        BaseEngine.ProviderInstances.set(this.ProviderToUse /*use default provider if one wasn't provided to use*/, <T><any>this);
    }

    private _eventListener: Observable<MJEvent>;
    /**
     * This method is responsible for registering for MJGlobal events and listening for BaseEntity events where those
     * BaseEntity are related to the engine's configuration metadata. The idea is to auto-refresh the releated configs
     * when the BaseEntity is updated.
     */
    protected async SetupGlobalEventListener(): Promise<boolean> {
        try {
            if (!this._eventListener) {
                this._eventListener = MJGlobal.Instance.GetEventListener(false)
                this._eventListener.subscribe(async (event) => {
                    await this.HandleIndividualEvent(event);
                });
            }
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    /**
     * Subclasses of BaseEngine can override this method to handle individual MJGlobal events. This is typically done to optimize
     * the way refreshes are done when a BaseEntity is updated. If you are interested in only BaseEntity events, override
     * the HandleIndividualBaseEntityEvent method instead as this method primarily serves to filter all the events we get from MJGlobal
     * and only pass on BaseEntity events to HandleIndividualBaseEntityEvent.
     * @param event 
     */
    protected async HandleIndividualEvent(event: MJEvent): Promise<boolean> {
        // base class algo is simple - we just check to see if the event's entity name matches any of our entity names
        // and if so, we refresh the data by calling 
        if (event.event === MJEventType.ComponentEvent && event.eventCode === BaseEntity.BaseEventCode) {
            // we have an entity event
            const baseEntityEvent: BaseEntityEvent = event.args;
            return await this.HandleIndividualBaseEntityEvent(baseEntityEvent);
        }
    }

    /**
     * This method handles the individual base entity event and just checks to see if it is a delete or save event and if so, debounces it. 
     * Override this method if you want to have a different handling for the filtering of events that are debounced or if you don't want to debounce
     * at all you can do that in an override of this method.
     * @param event 
     */
    protected async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        try {
            if (event.type === 'delete' || event.type === 'save') {
                const eName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();
                const matchingAutoRefreshConfig: boolean = this.Configs.some((config: BaseEnginePropertyConfig) => {
                    return config.AutoRefresh && config.EntityName && config.EntityName.trim().toLowerCase() === eName
                });

                if (matchingAutoRefreshConfig){
                    return this.DebounceIndividualBaseEntityEvent(event);
                }
            }
            
            return true;
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }


    /**
     * This method handles the debouncing process, by default using the EntityEventDebounceTime property to set the debounce time. Debouncing is 
     * done on a per-entity basis, meaning that if the debounce time passes for a specific entity name, the event will be processed. This is done to
     * prevent multiple events from being processed in quick succession for a single entity which would cause a lot of wasted processing.
     * 
     * Override this method if you want to change how debouncing time such as having variable debounce times per-entity, etc.
     * @param event 
     * @returns 
     */
    protected async DebounceIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        try {
            const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();
    
            if (!this._entityEventSubjects.has(entityName)) {
                const subject = new Subject<BaseEntityEvent>();
                subject.pipe(
                    debounceTime(this.EntityEventDebounceTime)
                ).subscribe(async (e) => {
                    await this.ProcessEntityEvent(e);
                });
                this._entityEventSubjects.set(entityName, subject);
            }
    
            this._entityEventSubjects.get(entityName).next(event);
    
            return true;
        } catch (e) {
            LogError(e);
            return false;
        }
    }
    
    private _entityEventDebounceTime: number = 5000;// Default debounce time in milliseconds (5 seconds)
    /**
     * Overridable property to set the debounce time for entity events. Default is 5000 milliseconds (5 seconds).
     */
    protected get EntityEventDebounceTime(): number {
        return this._entityEventDebounceTime; 
    }
    
    /**
     * This method does the actual work of processing the entity event. It is not directly called from the event handler because we want to first debounce the events
     * which also introduces a delay which is usually desirable so that our processing is typically outside of the scope of any transaction processing that would have
     * originated the event.
     * 
     * This is the best method to override if you want to change the actual processing of an entity event but do NOT want to modify the debouncing behavior.
     */
    protected async ProcessEntityEvent(event: BaseEntityEvent): Promise<void> {
        try {
            const entityName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();
            let refreshCount = 0;
            for (const config of this.Configs) {
                if (config.AutoRefresh && config.Type === 'entity' && config.EntityName?.trim().toLowerCase() === entityName) {
                    LogStatus(`>>> Refreshing metadata for ${config.PropertyName} due to BaseEntity ${event.type} event for: ${event.baseEntity.EntityInfo.Name}, pkey: ${event.baseEntity.PrimaryKey.ToString()}`);
                    await this.LoadSingleConfig(config, this._contextUser);
                    refreshCount++;
                }
            }
            if (refreshCount > 0) {
                // we need to call AdditionalLoading here - because in many cases engine sub-classes do various kinds of data mashups 
                // after we have loaded - for example the TemplateEngine takes the TemplateContents and TemplateParams and stuffs them
                // into arrays in each template to make it easier to get Params/Contents for each Template. Such operations are common
                // and need to be done after the initial load and after any refreshes.
                await this.AdditionalLoading(this._contextUser);
            }    
        }
        catch (e) {
            LogError(e);
        }
    }
    


    /**
     * Utility method to upgrade an object to a BaseEnginePropertyConfig object.
     * @param obj 
     * @returns 
     */
    protected UpgradeObjectToConfig(obj: any): BaseEnginePropertyConfig {
        // if obj is not already an instance of BaseEnginePropertyConfig, create one
        if (obj instanceof BaseEnginePropertyConfig)
            return obj;
        else
            return new BaseEnginePropertyConfig(obj);
    }

    /**
     * Loads the specified metadata configurations.
     * @param configs - The metadata configurations to load
     * @param contextUser - The context user information
     */
    protected async LoadConfigs(configs: Partial<BaseEnginePropertyConfig>[], contextUser: UserInfo): Promise<void> {
        this._metadataConfigs = configs.map(c => this.UpgradeObjectToConfig(c));

        // now, break up the configs into two chunks, datasets and views of entities so we can load all the views in a single network call via RunViews()
        const entityConfigs = this._metadataConfigs.filter(c => c.Type === 'entity');
        const datasetConfigs = this._metadataConfigs.filter(c => c.Type === 'dataset');

        await Promise.all([...datasetConfigs.map(c => this.LoadSingleDatasetConfig(c, contextUser)),
                           this.LoadMultipleEntityConfigs(entityConfigs, contextUser)]);
    }

    /**
     * Loads a single metadata configuration.
     * @param config - The metadata configuration to load
     * @param contextUser - The context user information
     */
    protected async LoadSingleConfig(config: BaseEnginePropertyConfig, contextUser: UserInfo): Promise<void> {
        if (config.Type === 'dataset') 
            return await this.LoadSingleDatasetConfig(config, contextUser);
        else
            return await this.LoadSingleEntityConfig(config, contextUser);
    }    

    /**
     * Handles the process of loading a single config of type 'entity'.
     * @param config 
     * @param contextUser 
     */
    protected async LoadSingleEntityConfig(config: BaseEnginePropertyConfig, contextUser: UserInfo): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: config.EntityName,
            ResultType: 'entity_object',
            ExtraFilter: config.Filter,
            OrderBy: config.OrderBy
        }, contextUser);

        this.HandleSingleViewResult(config, result);
    }

    /**
     * Handles the result of a single view load.
     * @param config 
     * @param result 
     */
    protected HandleSingleViewResult(config: BaseEnginePropertyConfig, result: RunViewResult) {
        if (result.Success) {
            if (config.AddToObject !== false) {
                (this as any)[config.PropertyName] = result.Results;
            }
            this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: result.Results });

            if (config.Expiration) {
                this.SetExpirationTimer(config.PropertyName, config.Expiration);
            }
        }
    }

    /**
     * Handles the process of loading multiple entity configs in a single network call via RunViews()
     * @param configs 
     * @param contextUser 
     */
    protected async LoadMultipleEntityConfigs(configs: BaseEnginePropertyConfig[], contextUser: UserInfo): Promise<void> {
        if (configs && configs.length > 0) {
            const rv = new RunView();
            const viewConfigs = configs.map(c => {
                return <RunViewParams>{
                    EntityName: c.EntityName,
                    ResultType: 'entity_object',
                    ExtraFilter: c.Filter,
                    OrderBy: c.OrderBy
                };
            });
            const results = await rv.RunViews(viewConfigs, contextUser);
            // now loop through the results and process them
            for (let i = 0; i < configs.length; i++) {
                this.HandleSingleViewResult(configs[i], results[i]);
            }    
        }
    }

    /**
     * Handles the process of loading a single config of type 'dataset'.
     * @param config 
     * @param contextUser 
     */
    protected async LoadSingleDatasetConfig(config: BaseEnginePropertyConfig, contextUser: UserInfo): Promise<void> {
        const p = this.ProviderToUse;
        const result: DatasetResultType = await p.GetAndCacheDatasetByName(config.DatasetName, config.DatasetItemFilters)
        if (result.Success) {
            if (config.AddToObject !== false) {
                if (config.DatasetResultHandling === 'single_property') {
                    const singleObject = {};
                    for (const item of result.Results) {
                        //convert the results to entity objects before 
                        //adding them to the singleObject
                        const entities: BaseEntity[] = [];
                        for(const entityData of item.Results) {
                            const entity: BaseEntity = await p.GetEntityObject(item.EntityName, contextUser);
                            entity.SetMany(entityData);
                            entities.push(entity);
                        }

                        singleObject[item.Code] = entities;
                    }
                    (this as any)[config.PropertyName] = singleObject;
                }
                else {
                    // explode out the items within the DS into individual properties
                    for (const item of result.Results) {
                        (this as any)[`${config.PropertyName}_${item.Code}`] = item.Results;
                    }
                }
            }
            this._dataMap.set(config.PropertyName, { datasetName: config.DatasetName, data: result.Results });

            if (config.Expiration) {
                this.SetExpirationTimer(config.PropertyName, config.Expiration);
            }
        }
    }

    /**
     * Sets an expiration timer for a metadata property.
     * @param propertyName - The name of the property
     * @param expiration - The expiration time in milliseconds
     */
    private SetExpirationTimer(propertyName: string, expiration: number): void {
        if (this._expirationTimers.has(propertyName)) {
            clearTimeout(this._expirationTimers.get(propertyName));
        }
        const timer = setTimeout(() => this.RefreshItem(propertyName), expiration);
        this._expirationTimers.set(propertyName, timer as unknown as number);
    }

    /**
     * Adds a dynamic metadata configuration at runtime.
     * @param config - The metadata configuration to add
     * @param contextUser - The context user information
     */
    public async AddDynamicConfig(config: BaseEnginePropertyConfig, contextUser?: UserInfo): Promise<void> {
        const c = this.UpgradeObjectToConfig(config);
        this._dynamicConfigs.set(c.PropertyName, c);
        await this.LoadSingleConfig(c, contextUser || this._contextUser);
    }

    /**
     * Removes a dynamic metadata configuration at runtime.
     * @param propertyName - The name of the property to remove
     */
    public RemoveDynamicConfig(propertyName: string): void {
        this._dynamicConfigs.delete(propertyName);
        this._dataMap.delete(propertyName);
        if (this._expirationTimers.has(propertyName)) {
            clearTimeout(this._expirationTimers.get(propertyName));
            this._expirationTimers.delete(propertyName);
        }
    }


    /**
     * Refreshes a specific item.
     * @param propertyName - The name of the property to refresh
     */
    public async RefreshItem(propertyName: string): Promise<void> {
        const config = this._metadataConfigs.find(c => c.PropertyName === propertyName) || this._dynamicConfigs.get(propertyName);
        if (config) {
            await this.LoadSingleConfig(config, this._contextUser);
        }
    }

    /**
     * Refreshes all items
     */
    public async RefreshAllItems(): Promise<void> {
        await this.LoadConfigs([...this._metadataConfigs, ...Array.from(this._dynamicConfigs.values())], this._contextUser);
    }

    /**
     * Subclasses can override this method to perform additional loading tasks
     * @param contextUser 
     */
    protected async AdditionalLoading(contextUser?: UserInfo) {
        // Subclasses can override this method to perform additional loading tasks
    }

    /**
     * Returns true if the data has been loaded, false otherwise.
     */
    public get Loaded(): boolean {
        return this._loaded;
    }

    /**
     * Returns the loading subject. You can call await Config() and after Config() comes back as true that means you're loaded. However you can also directly subscribe to this subject to get updates on the loading status.
     */
    public get LoadingSubject(): BehaviorSubject<boolean> {
        return this._loadingSubject;
    }

    /**
     * Returns the context user set for the object, this is set via the Config() method.
     */
    public get ContextUser(): UserInfo {
        return this._contextUser;
    }

    /**
     * Helper method for sub-classes to have a single line of code that will make sure the data is loaded before proceeding and will throw an error if not loaded.
     */
    protected TryThrowIfNotLoaded() {
        if (!this.Loaded)
            throw new Error("Data not loaded, call Config() first.");
    }
}