import { BaseSingleton } from "@memberjunction/global";
import { BehaviorSubject } from "rxjs";
import { UserInfo } from "./securityInfo";
import { RunView } from "../views/runView";
import { LogError } from "./logging";

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

                const rv = new RunView();
                for (const config of configs) {
                    const result = await rv.RunView({
                        EntityName: config.EntityName,
                        ResultType: 'entity_object',
                        ExtraFilter: config.Filter,
                        OrderBy: config.OrderBy
                    }, contextUser);

                    if (result.Success) {
                        (this as any)[config.PropertyName] = result.Results;
                    }
                }
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
     * Subclasses can override this method to perform additional loading tasks
     * @param contextUser 
     */
    protected async AdditionalLoading(contextUser?: UserInfo) {
        // Subclasses can override this method to perform additional loading tasks
    }

    public get Loaded(): boolean {
        return this._loaded;
    }

    public get LoadingSubject(): BehaviorSubject<boolean> {
        return this._loadingSubject;
    }

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
