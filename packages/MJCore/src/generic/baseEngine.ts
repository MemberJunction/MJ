import { BaseSingleton } from "@memberjunction/global";
import { BehaviorSubject } from "rxjs";
import { UserInfo } from "./securityInfo";
import { RunView } from "../views/runView";
import { LogError } from "./logging";
import { Metadata } from "./metadata";
import { ProviderType } from "./interfaces";

/**
 * Property configuration for the BaseEngine class to automatically load/set properties on the class.
 */
export interface BaseEnginePropertyConfig {
    /**
     * The name of the property in the class instance
     */
    PropertyName: string;
    /**
     * The entity name to load from the database
     */
    EntityName: string;
    /**
     * Optional, filters to apply to the data load
     */
    Filter?: string;
    /**
     * Optional, order by clause to apply to the data load
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
    private _dataMap: Map<string, { entityName: string, data: any[] }> = new Map();
    private _expirationTimers: Map<string, number> = new Map();

    /**
     * Configures the engine by loading metadata from the database.  
     */
    public abstract Config(forceRefresh?: boolean, contextUser?: UserInfo);

    /**
     * This method should be called by sub-classes to load up their specific metadata requirements. For more complex metadata
     * loading or for post-processing of metadata loading done here, overide the AdditionalLoading method to add your logic.
     * @param configs 
     * @param contextUser 
     * @returns 
     */
    protected async Load(configs: BaseEnginePropertyConfig[], forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
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
                this._contextUser = contextUser;

                await this.LoadConfigs(configs, contextUser);
                await this.AdditionalLoading(contextUser); // Call the additional loading method
                this._loaded = true;
            } catch (e) {
                LogError(e);
            } finally {
                this._loadingSubject.next(false);
            }
        }
    }

    /**
     * Loads the specified metadata configurations.
     * @param configs - The metadata configurations to load
     * @param contextUser - The context user information
     */
    protected async LoadConfigs(configs: BaseEnginePropertyConfig[], contextUser: UserInfo): Promise<void> {
        await Promise.all(configs.map(config => this.LoadSingleConfig(config, contextUser)));
    }

    /**
     * Loads a single metadata configuration.
     * @param config - The metadata configuration to load
     * @param contextUser - The context user information
     */
    protected async LoadSingleConfig(config: BaseEnginePropertyConfig, contextUser: UserInfo): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: config.EntityName,
            ResultType: 'entity_object',
            ExtraFilter: config.Filter,
            OrderBy: config.OrderBy
        }, contextUser);

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
        this._dynamicConfigs.set(config.PropertyName, config);
        await this.LoadSingleConfig(config, contextUser || this._contextUser);
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
