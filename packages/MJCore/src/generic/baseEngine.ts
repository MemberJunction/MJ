import { BaseSingleton, MJEvent, MJEventType, MJGlobal } from "@memberjunction/global";
import { TelemetryManager } from "./telemetryManager";
import { BehaviorSubject, Observable, Subject } from "rxjs";
import { debounceTime } from "rxjs/operators";

import { UserInfo } from "./securityInfo";
import { RunView, RunViewParams } from "../views/runView";
import { LogError, LogStatus } from "./logging";
import { Metadata } from "./metadata";
import { DatasetItemFilterType, DatasetResultType, IMetadataProvider, IRunViewProvider, ProviderType, RunViewResult } from "./interfaces";
import { BaseInfo } from "./baseInfo";
import { BaseEntity, BaseEntityEvent } from "./baseEntity";
import { BaseEngineRegistry } from "./baseEngineRegistry";
import { IStartupSink } from "./RegisterForStartup";
import { LocalCacheManager } from "./localCacheManager";
import { ProviderBase } from "./providerBase";
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
    /**
     * Optional debounce time in milliseconds for this specific config.
     * If not specified, uses the engine's default EntityEventDebounceTime (5000ms).
     * This allows different entities to have different debounce delays.
     */
    DebounceTime?: number;

    /**
     * When set to true, the engine will use the LocalCacheManager to cache results locally.
     * On subsequent loads (unless forceRefresh is true), cached results will be returned
     * immediately without hitting the server if they are still valid.
     *
     * This is useful for frequently-accessed, relatively-static data that doesn't need
     * real-time freshness. The cache is automatically invalidated when entity data changes.
     *
     * @default false
     */
    CacheLocal?: boolean;

    /**
     * Optional TTL (time-to-live) in milliseconds for locally cached results when CacheLocal is true.
     * After this time, cached results will be considered stale and fresh data will be fetched.
     * If not specified, the LocalCacheManager's default TTL will be used (typically 5 minutes).
     */
    CacheLocalTTL?: number;

    constructor(init?: Partial<BaseEnginePropertyConfig>) {
        super();
        // now copy the values from init to this object
        if (init)
            Object.assign(this, init);
    }
}

/**
 * Options for the ConfigEx method - provides a more flexible way to configure engines
 */
export interface ConfigExOptions {
    /**
     * Force refresh from server, bypassing all caches. Default: false
     */
    forceRefresh?: boolean;
    /**
     * The user context for permission checks (required for server-side)
     */
    contextUser?: UserInfo;
    /**
     * Custom provider to use instead of the default
     */
    provider?: IMetadataProvider;
}

/**
 * Event emitted when engine data changes (e.g., after a refresh triggered by entity save/delete).
 * Subscribe to an engine's DataChange$ observable to react to data updates.
 */
export interface EngineDataChangeEvent {
    /**
     * The configuration that was refreshed. Contains PropertyName, EntityName, DatasetName, etc.
     */
    config: BaseEnginePropertyConfig;
    /**
     * The type of change that triggered this event.
     * - 'refresh': Full data reload from database (via RunView)
     * - 'add': Single entity was added to the array (immediate mutation)
     * - 'update': Single entity was updated in the array (immediate mutation)
     * - 'delete': Single entity was removed from the array (immediate mutation)
     */
    changeType: 'refresh' | 'add' | 'update' | 'delete';
    /**
     * The current data array. This is the same data now available on the engine property.
     */
    data: unknown[];
    /**
     * For 'add', 'update', or 'delete' events, this is the entity that was affected.
     * For 'refresh' events, this is undefined.
     */
    affectedEntity?: BaseEntity;
}

/**
 * Abstract base class for any engine-style class which executes work on behalf of a caller typically using a provider-style architecture with plug-ins. This base class
 * provides a mechanism for loading metadata from the database and caching it for use by the engine. Subclasses must implement the Config abstract method and within that
 * generally it is recommended to call the Load method to load the metadata. Subclasses can also override the AdditionalLoading method to perform additional loading tasks.
 */
export abstract class BaseEngine<T> extends BaseSingleton<T> implements IStartupSink {
    private _loaded: boolean = false;
    private _loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
    private _contextUser: UserInfo;
    private _metadataConfigs: BaseEnginePropertyConfig[] = [];
    private _dynamicConfigs: Map<string, BaseEnginePropertyConfig> = new Map();
    private _dataMap: Map<string, { entityName?: string, datasetName?: string, data: unknown[] }> = new Map();
    private _expirationTimers: Map<string, number> = new Map();
    private _entityEventSubjects: Map<string, Subject<BaseEntityEvent>> = new Map();
    private _provider: IMetadataProvider;
    private _dataChange$ = new Subject<EngineDataChangeEvent>();

    /**
     * While the BaseEngine class is a singleton, normally, it is possible to have multiple instances of the class in an application if the class is used in multiple contexts that have different providers.
     */
    public constructor() {
        super();
    }

    /**
     * Observable that emits when any data property changes due to a refresh.
     * Subscribe to this to react to engine data updates (e.g., sync Angular observables).
     *
     * Events are emitted after data is refreshed in response to BaseEntity save/delete events.
     * The event includes the full config and the new data array.
     *
     * @example
     * ```typescript
     * UserInfoEngine.Instance.DataChange$.subscribe(event => {
     *   if (event.config.PropertyName === 'UserApplications') {
     *     // Sync local state with engine's updated data
     *     this.refreshLocalAppList();
     *   }
     * });
     * ```
     */
    public get DataChange$(): Observable<EngineDataChangeEvent> {
        return this._dataChange$.asObservable();
    }

    /**
     * Notify listeners that a data property has changed.
     * Called automatically by HandleSingleViewResult after data refresh and by applyImmediateMutation for array operations.
     * Subclasses can also call this manually when modifying data arrays directly.
     *
     * @param config - The configuration for the property that changed
     * @param data - The current data array
     * @param changeType - The type of change: 'refresh', 'add', 'update', or 'delete'
     * @param affectedEntity - For add/update/delete, the entity that was affected
     */
    protected NotifyDataChange(
        config: BaseEnginePropertyConfig,
        data: unknown[],
        changeType: 'refresh' | 'add' | 'update' | 'delete' = 'refresh',
        affectedEntity?: BaseEntity
    ): void {
        const event: EngineDataChangeEvent = {
            config,
            changeType,
            data,
            affectedEntity
        };
        this._dataChange$.next(event);
    }

    /**
     * All BaseEngine sub-classes get an implementation of IStartupSink so they can be set the auto start in their
     * app container, if desired, simply by adding the @see @RegisterForStartup decorator. The BaseEngine implementation
     * of IStartupSink.HandleStartup is to simply call @see Config
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await this.Config(false, contextUser, provider);
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
     * Subclasses must implement this method to define their configuration behavior.
     *
     * Note: This method is called by ConfigEx() - prefer using ConfigEx() directly for new code
     * as it provides more flexible configuration options.
     */
    public abstract Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown>;

    /**
     * Extended configuration method with object-based options.
     * This provides a more flexible API compared to Config() with positional parameters.
     *
     * Internally calls Config() after setting up options that Load() can access.
     *
     * @param options - Configuration options object
     * @returns Promise that resolves when configuration is complete
     *
     * @example
     * ```typescript
     * await MyEngine.Instance.ConfigEx({
     *   forceRefresh: true,
     *   contextUser: currentUser
     * });
     * ```
     */
    public async ConfigEx(options: ConfigExOptions = {}): Promise<unknown> {
        // Call the abstract Config method which subclasses implement
        return await this.Config(
            options.forceRefresh ?? false,
            options.contextUser,
            options.provider
        );
    }

    /**
     * This method should be called by sub-classes to load up their specific metadata requirements. For more complex metadata
     * loading or for post-processing of metadata loading done here, overide the AdditionalLoading method to add your logic.
     * @param configs
     * @param contextUser
     * @returns
     */
    protected async Load(configs: Partial<BaseEnginePropertyConfig>[], provider: IMetadataProvider, forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
        if (this.ProviderToUse.ProviderType === ProviderType.Database && !contextUser)
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
            // Start telemetry tracking for engine load
            const entityNames = configs
                .filter(c => c.Type !== 'dataset' && c.EntityName)
                .map(c => c.EntityName);
            const datasetNames = configs
                .filter(c => c.Type === 'dataset' && c.DatasetName)
                .map(c => c.DatasetName);

            const eventId = TelemetryManager.Instance.StartEvent(
                'Engine',
                'Engine.Load',
                {
                    engineClass: this.constructor.name,
                    operation: forceRefresh ? 'refresh' : 'initial',
                    configCount: configs.length,
                    entityNames,
                    datasetNames
                },
                contextUser?.ID
            );

            this._loadingSubject.next(true);
            try {
                this.SetProvider(provider);
                this._contextUser = contextUser;

                // Register with the engine registry
                BaseEngineRegistry.Instance.RegisterEngine(this);

                await this.LoadConfigs(configs, contextUser);
                await this.AdditionalLoading(contextUser); // Call the additional loading method
                await this.SetupGlobalEventListener();
                this._loaded = true;

                // Notify registry that engine is loaded
                BaseEngineRegistry.Instance.NotifyEngineLoaded(this);
            } catch (e) {
                LogError(e);
            } finally {
                this._loadingSubject.next(false);
                TelemetryManager.Instance.EndEvent(eventId);
            }
        }
    }

    /**********************************************************************
     * This section is for handling caching of multiple instances when needed
     * We use the primary singleton as the instance to store a cache of instances
     * that are tied to specific providers. This is useful when we have multiple
     * providers in a given app going to different connections.
     *********************************************************************/
    // private static _providerInstances: Map<{provider: IMetadataProvider, subclassConstructor: any}, any> = new Map();
    // private static get ProviderInstances(): Map<{provider: IMetadataProvider, subclassConstructor: any}, any> {
    //     return BaseEngine._providerInstances;
    // }
    private static _providerInstances: { provider: IMetadataProvider, subclassConstructor: any, instance: any }[] = [];
    private static get ProviderInstances(): { provider: IMetadataProvider, subclassConstructor: any, instance: any }[] {
        return BaseEngine._providerInstances;
    }    

    /**
     * This method will check for the existence of an instance of this engine class that is tied to a specific provider. If one exists, it will return it, otherwise it will create a new instance
     */
    public static GetProviderInstance<T>(provider: IMetadataProvider, subclassConstructor: new () => BaseEngine<T>): BaseEngine<T> {
        const existingEntry = BaseEngine.ProviderInstances.find(
            entry => entry.provider === provider && entry.subclassConstructor === subclassConstructor
        );

        if (existingEntry) {
            return existingEntry.instance;
        }
        else {
            // we don't have an existing instance for this provider, so we need to create one
            const newInstance = new subclassConstructor(); 
            newInstance.SetProvider(provider);
//            BaseEngine.ProviderInstances.set({provider, subclassConstructor}, newInstance);
            //BaseEngine.ProviderInstances.push({ provider, subclassConstructor, instance: newInstance });
                    
            return newInstance;
        }
    }

    /**
     * Internal method to set the provider when an engine is loaded
     * @param provider 
     */
    protected SetProvider(provider: IMetadataProvider) {
        this._provider = provider;
//        BaseEngine.ProviderInstances.set({provider: this.ProviderToUse, subclassConstructor: this.constructor} /*use default provider if one wasn't provided to use*/, <T><any>this);

        this.CheckAddToProviderInstances(this.ProviderToUse);
    }

    protected CheckAddToProviderInstances(provider: IMetadataProvider) {
        const existingEntry = BaseEngine.ProviderInstances.find(
            entry => entry.provider === provider && entry.subclassConstructor === this.constructor
        );

        if (!existingEntry) {
            BaseEngine.ProviderInstances.push({
                provider: provider,
                subclassConstructor: this.constructor,
                instance: this
            });
        }
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
     * This method handles the individual base entity event. For events that can use immediate array mutations
     * (no Filter, OrderBy, or AdditionalLoading override), processing happens synchronously without debounce.
     * For events that require full view refresh, debouncing is applied to batch rapid successive changes.
     *
     * Override this method if you want to have a different handling for the filtering of events that are debounced
     * or if you don't want to debounce at all you can do that in an override of this method.
     * @param event
     */
    protected async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        try {
            if (event.type === 'delete' || event.type === 'save') {
                const eName = event.baseEntity.EntityInfo.Name.toLowerCase().trim();
                const matchingConfigs = this.Configs.filter((config: BaseEnginePropertyConfig) => {
                    return config.AutoRefresh && config.EntityName && config.EntityName.trim().toLowerCase() === eName;
                });

                if (matchingConfigs.length === 0) {
                    return true;
                }

                // Check if ALL matching configs can use immediate mutation
                const allCanUseImmediate = matchingConfigs.every(config => this.canUseImmediateMutation(config));

                if (allCanUseImmediate) {
                    // Process immediately without debounce - synchronous array mutations
                    for (const config of matchingConfigs) {
                        this.applyImmediateMutation(config, event);
                    }
                    return true;
                } else {
                    // At least one config requires full refresh, use debouncing
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
                // Find matching config to get custom debounce time
                const matchingConfig = this.Configs.find(c =>
                    c.EntityName?.trim().toLowerCase() === entityName
                );

                // Use config-specific debounce time or fall back to default
                const debounceTimeValue = matchingConfig?.DebounceTime ?? this.EntityEventDebounceTime;

                const subject = new Subject<BaseEntityEvent>();
                subject.pipe(
                    debounceTime(debounceTimeValue)
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
    
    private _entityEventDebounceTime: number = 1500; // Default debounce time in milliseconds (1.5 seconds)
    /**
     * Overridable property to set the debounce time for entity events. Default is 1500 milliseconds (1.5 seconds).
     * This debounce time is used when immediate array mutations cannot be applied (e.g., when Filter, OrderBy,
     * or AdditionalLoading overrides are present) and a full view refresh is required.
     *
     * Note: When immediate mutations ARE possible (no Filter, OrderBy, or AdditionalLoading override),
     * updates happen synchronously without any debounce delay.
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
                    // For UPDATE events, check if the exact object is already in our array.
                    // If so, it's already been mutated in place - no need to refresh.
                    if (event.type === 'save' && event.saveSubType === 'update') {
                        if (this.isEntityAlreadyInArray(config, event.baseEntity)) {
                            // Object already in array and updated in place, skip refresh
                            // LogStatus(`>>> Skipping refresh for ${config.PropertyName} - object already in array`);
                            continue;
                        }
                    }

                    // For CREATE events, check if the entity was already added to our array
                    // (e.g., by engine methods like InstallApplication that manually push).
                    if (event.type === 'save' && event.saveSubType === 'create') {
                        if (this.isEntityAlreadyInArray(config, event.baseEntity)) {
                            // Object already in array (manually added), skip refresh
                            // LogStatus(`>>> Skipping refresh for ${config.PropertyName} - newly created object already in array`);
                            continue;
                        }
                    }

                    // For DELETE events, check if the entity was already removed from our array
                    // (e.g., by engine methods like UninstallApplication that manually splice).
                    // Also check by primary key since the object reference may still exist but be removed.
                    if (event.type === 'delete') {
                        if (!this.isEntityInArrayByRefOrKey(config, event.baseEntity)) {
                            // Object not in array (already removed), skip refresh
                            // LogStatus(`>>> Skipping refresh for ${config.PropertyName} - deleted object not in array`);
                            continue;
                        }
                    }

                    // Check if we can use immediate array mutation instead of running a view
                    if (this.canUseImmediateMutation(config)) {
                        // LogStatus(`>>> Immediate mutation for ${config.PropertyName} due to BaseEntity ${event.type} event for: ${event.baseEntity.EntityInfo.Name}`);
                        this.applyImmediateMutation(config, event);
                    } else {
                        // LogStatus(`>>> Refreshing metadata for ${config.PropertyName} due to BaseEntity ${event.type} event for: ${event.baseEntity.EntityInfo.Name}, pkey: ${event.baseEntity.PrimaryKey.ToString()}`);
                        await this.LoadSingleConfig(config, this._contextUser);
                        refreshCount++;
                    }
                }
            }

            // Only call AdditionalLoading if we did full refreshes (not for immediate mutations)
            // Immediate mutations don't require AdditionalLoading since the entity object is already complete
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
     * Checks if the exact entity object reference is already in the config's data array.
     * Used to skip unnecessary refreshes for UPDATE events where the object was mutated in place.
     *
     * @param config - The configuration to check
     * @param entity - The entity to look for
     * @returns true if the exact object reference is already in the array
     */
    protected isEntityAlreadyInArray(config: BaseEnginePropertyConfig, entity: BaseEntity): boolean {
        const currentData = (this as Record<string, unknown>)[config.PropertyName] as BaseEntity[] | undefined;
        if (!currentData) {
            return false;
        }
        return currentData.indexOf(entity) >= 0;
    }

    /**
     * Checks if an entity is in the config's data array by object reference OR by primary key match.
     * Used for DELETE events where we need to know if the entity still exists in the array.
     * The object reference may still exist (entity.Delete() just marks it deleted), but if it was
     * manually spliced out by engine code, we check by primary key as fallback.
     *
     * @param config - The configuration to check
     * @param entity - The entity to look for
     * @returns true if the entity is in the array (by reference or by primary key)
     */
    protected isEntityInArrayByRefOrKey(config: BaseEnginePropertyConfig, entity: BaseEntity): boolean {
        const currentData = (this as Record<string, unknown>)[config.PropertyName] as BaseEntity[] | undefined;
        if (!currentData) {
            return false;
        }

        // First check by object reference
        if (currentData.indexOf(entity) >= 0) {
            return true;
        }

        // Fallback: check by primary key
        return this.findEntityIndexByPrimaryKeys(currentData, entity) >= 0;
    }

    /**
     * Determines if an immediate array mutation can be used instead of running a full view refresh.
     * Immediate mutations are only safe when:
     * 1. The config has no Filter (no server-side filtering that might exclude the entity)
     * 2. The config has no OrderBy (no server-side ordering that would need to be maintained)
     * 3. The subclass has not overridden AdditionalLoading (no post-processing that depends on full data)
     *
     * @param config - The configuration to check
     * @returns true if immediate mutation is safe, false if a full view refresh is needed
     */
    protected canUseImmediateMutation(config: BaseEnginePropertyConfig): boolean {
        // If there's a filter, we can't safely do immediate mutations because:
        // - For creates: the new entity might not match the filter
        // - For updates: the entity might now match or no longer match the filter
        if (config.Filter) {
            return false;
        }

        // If there's an OrderBy, we can't safely do immediate mutations because:
        // - For creates: we'd need to insert at the correct position
        // - For updates: the entity might need to move to a different position
        if (config.OrderBy) {
            return false;
        }

        // Check if AdditionalLoading is overridden in the subclass
        // If it is, we need to run full refresh to ensure post-processing happens
        if (this.hasAdditionalLoadingOverride()) {
            return false;
        }

        return true;
    }

    /**
     * Checks if the current instance has overridden the AdditionalLoading method.
     * We do this by comparing the method to the base class's method.
     *
     * @returns true if AdditionalLoading is overridden, false if using the base implementation
     */
    protected hasAdditionalLoadingOverride(): boolean {
        // Get the prototype chain to find the base class method
        const baseProto = BaseEngine.prototype;
        const instanceProto = Object.getPrototypeOf(this);

        // If the instance's AdditionalLoading is different from the base class's,
        // it means the subclass has overridden it
        return instanceProto.AdditionalLoading !== baseProto.AdditionalLoading;
    }

    /**
     * Applies an immediate array mutation based on the entity event type.
     * This is faster than running a full view refresh for simple add/update/delete operations.
     *
     * @param config - The configuration for the property being mutated
     * @param event - The entity event containing the affected entity and event type
     */
    protected applyImmediateMutation(config: BaseEnginePropertyConfig, event: BaseEntityEvent): void {
        const currentData = (this as Record<string, unknown>)[config.PropertyName] as BaseEntity[] | undefined;
        if (!currentData) {
            // No existing array, nothing to mutate
            return;
        }

        const entity = event.baseEntity;

        if (event.type === 'save') {
            if (event.saveSubType === 'create') {
                // For create, first check if the exact object is already in the array
                const existsByRef = currentData.indexOf(entity) >= 0;
                // if already in the array, nothing to do, but we keep going
                // in the method as there is stuff below the outer if block
                if (!existsByRef) {
                    // Check by composite primary key in case it was added with a different object reference
                    const indexByKey = this.findEntityIndexByPrimaryKeys(currentData, entity);
                    if (indexByKey >= 0) {
                        // Already exists by key, treat as update
                        currentData[indexByKey] = entity;
                        this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: currentData });
                        this.NotifyDataChange(config, currentData, 'update', entity);
                    } else {
                        // Add the new entity to the array
                        currentData.push(entity);
                        this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: currentData });
                        this.NotifyDataChange(config, currentData, 'add', entity);
                    }
                }
            } else {
                // Update: first check if the exact object is already in the array
                // if already in the array, we don't do anything but we keep going
                // in the method so stuff at end can be done 
                const existsByRef = currentData.indexOf(entity) >= 0;
                if (!existsByRef) {
                    // Find by composite primary key and replace
                    const index = this.findEntityIndexByPrimaryKeys(currentData, entity);
                    if (index >= 0) {
                        currentData[index] = entity;
                        this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: currentData });
                        this.NotifyDataChange(config, currentData, 'update', entity);
                    } else {
                        // Entity not found in array - this shouldn't happen normally,
                        // but if it does, add it (might have been created before we started listening)
                        currentData.push(entity);
                        this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: currentData });
                        this.NotifyDataChange(config, currentData, 'add', entity);
                    }
                }
            }
        } else if (event.type === 'delete') {
            // For delete, first try to find by object reference
            let index = currentData.indexOf(entity);
            if (index < 0) {
                // Not found by reference, search by composite primary key
                index = this.findEntityIndexByPrimaryKeys(currentData, entity);
            }

            if (index >= 0) {
                currentData.splice(index, 1);
                this._dataMap.set(config.PropertyName, { entityName: config.EntityName, data: currentData });
                this.NotifyDataChange(config, currentData, 'delete', entity);
            }
        }

        // Sync to LocalCacheManager if CacheLocal is enabled for this config
        // This keeps IndexedDB/localStorage in sync with in-memory array
        if (config.CacheLocal) {
            this.syncLocalCacheForConfig(config, event).catch(e => {
                // Log status but don't fail - cache will self-correct on next fetch
                LogStatus(`BaseEngine: Failed to sync local cache for ${config.EntityName}: ${e}`);
            });
        }
    }

    /**
     * Syncs an entity change to the LocalCacheManager for a config with CacheLocal enabled.
     * This ensures that IndexedDB/localStorage stays in sync with the engine's in-memory array.
     *
     * Only called for configs WITHOUT Filter/OrderBy (immediate mutation path).
     * Filtered/sorted configs use debounced refresh which handles its own caching.
     *
     * @param config - The configuration for the property being synced
     * @param event - The entity event containing the affected entity and event type
     */
    protected async syncLocalCacheForConfig(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
        // Check if LocalCacheManager is available and initialized
        if (!LocalCacheManager.Instance.IsInitialized) {
            return;
        }

        const entity = event.baseEntity;
        const entityInfo = entity.EntityInfo;

        // Get the connection string from the provider for fingerprint generation
        // The provider is needed because fingerprints include connection prefix
        const provider = this.ProviderToUse;
        let connectionString: string | undefined;
        if (provider && 'InstanceConnectionString' in provider) {
            connectionString = (provider as ProviderBase).InstanceConnectionString;
        }

        // Generate the same fingerprint that would be used when loading this data
        const params: RunViewParams = {
            EntityName: config.EntityName,
            ExtraFilter: config.Filter || '',
            OrderBy: config.OrderBy || '',
            ResultType: 'entity_object',
            MaxRows: -1,
            StartRow: 0
        };
        const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connectionString);

        // Get the primary key field name
        const primaryKeyFieldName = entityInfo.FirstPrimaryKey?.Name || 'ID';

        // Get the updated timestamp from the entity
        const updatedAt = entity.Get('__mj_UpdatedAt') as string | null || new Date().toISOString();

        if (event.type === 'delete') {
            // For deletes, remove the entity from cache
            // Use the first primary key value for simple keys
            const pkValue = entity.PrimaryKey.KeyValuePairs[0]?.Value;
            if (pkValue === null || pkValue === undefined) {
                LogStatus(`BaseEngine.syncLocalCacheForConfig: Cannot sync delete - primary key value is null for ${config.EntityName}`);
                return;
            }
            await LocalCacheManager.Instance.RemoveSingleEntity(
                fingerprint,
                String(pkValue),
                primaryKeyFieldName,
                updatedAt
            );
        } else {
            // For save (create or update), upsert the entity data
            // Use GetAll() to get a plain object representation
            const entityData = entity.GetAll();
            await LocalCacheManager.Instance.UpsertSingleEntity(
                fingerprint,
                entityData,
                primaryKeyFieldName,
                updatedAt
            );
        }
    }

    /**
     * Finds an entity in the array by matching all primary key columns.
     * Supports composite primary keys by comparing all PrimaryKey fields from EntityInfo.
     *
     * @param dataArray - The array of entities to search
     * @param targetEntity - The entity to find (using its primary key values)
     * @returns The index of the matching entity, or -1 if not found
     */
    protected findEntityIndexByPrimaryKeys(dataArray: BaseEntity[], targetEntity: BaseEntity): number {
        const primaryKeys = targetEntity.EntityInfo.PrimaryKeys;
        if (!primaryKeys || primaryKeys.length === 0) {
            // Fallback to single PrimaryKey property if no PrimaryKeys defined
            const pkValue = targetEntity.PrimaryKey.ToString();
            return dataArray.findIndex(e => e.PrimaryKey.ToString() === pkValue);
        }

        // Get target entity's primary key values
        const targetKeyValues = primaryKeys.map(pk => (targetEntity as unknown as Record<string, unknown>)[pk.Name]);

        return dataArray.findIndex(e => {
            // Compare all primary key values
            return primaryKeys.every((pk, idx) => {
                const entityValue = (e as unknown as Record<string, unknown>)[pk.Name];
                return entityValue === targetKeyValues[idx];
            });
        });
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
        const p = this.RunViewProviderToUse;
        const rv = new RunView(p);
        const result = await rv.RunView({
            EntityName: config.EntityName,
            ResultType: 'entity_object',
            ExtraFilter: config.Filter,
            OrderBy: config.OrderBy,
            _fromEngine: true,  // Mark as engine-initiated to avoid false positive telemetry warnings
            CacheLocal: config.CacheLocal,
            CacheLocalTTL: config.CacheLocalTTL
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

            // Notify listeners that this property's data has changed
            this.NotifyDataChange(config, result.Results);

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
            const p = this.RunViewProviderToUse;
            const rv = new RunView(p);
            const viewConfigs = configs.map(c => {
                return <RunViewParams>{
                    EntityName: c.EntityName,
                    ResultType: 'entity_object',
                    ExtraFilter: c.Filter,
                    OrderBy: c.OrderBy,
                    _fromEngine: true,  // Mark as engine-initiated to avoid false positive telemetry warnings
                    CacheLocal: c.CacheLocal,
                    CacheLocalTTL: c.CacheLocalTTL
                };
            });
            const results = await rv.RunViews(viewConfigs, contextUser);

            // Process results and record entity loads for redundancy detection
            const entityNames: string[] = [];
            for (let i = 0; i < configs.length; i++) {
                this.HandleSingleViewResult(configs[i], results[i]);
                if (configs[i].EntityName) {
                    entityNames.push(configs[i].EntityName);
                }
            }

            // Record which entities this engine loaded (for redundancy warnings)
            // Pass 'this' so the registry can use instance identity to prevent false positives
            // when a subclass and base class share the same singleton
            if (entityNames.length > 0) {
                BaseEngineRegistry.Instance.RecordEntityLoads(this, entityNames);
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