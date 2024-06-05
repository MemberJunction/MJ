import { LogError, RunView, UserInfo } from "@memberjunction/core";
import { CommunicationBaseMessageTypeEntity, CommunicationProviderEntity, CommunicationProviderMessageTypeEntity } from "@memberjunction/core-entities";
import { BaseSingleton, MJGlobal } from "@memberjunction/global";
import { BehaviorSubject } from "rxjs";
import { BaseCommunicationProvider, CommunicationProviderEntityExtended, Message, MessageResult } from "./BaseProvider";

/**
 * Base class for communications. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class CommunicationEngine extends BaseSingleton<CommunicationEngine> {
     // implement a singleton pattern for caching metadata. All uses of the engine will first call Config() to get started which is an async method. This method will load the metadata and cache it in a variable wtihin the "GlobalObjectStore"
     // which is an MJ utility that is available to all packages. This will allow the metadata to be loaded once and then used by all instances of the engine. This is important because the metadata is not expected to change during the lifecycle
    // of the application.
    private constructor() {
       super('MJ_Communication_Metadata');
    }
 
    /**
     * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
     */
    public static get Instance(): CommunicationEngine {
       return super.getInstance<CommunicationEngine>('MJ_Communication_Metadata');
    }
 
  
     // internal instance properties used for the singleton pattern
     private _loaded: boolean = false;
     private _loadingSubject: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
 
     private _BaseMessageTypes: CommunicationBaseMessageTypeEntity[];
     private _Providers: CommunicationProviderEntityExtended[];
     private _ProviderMessageTypes: CommunicationProviderMessageTypeEntity[];
     private _contextUser: UserInfo;
 
     /**
      * This method is called to configure the engine. It loads the metadata and caches it in the GlobalObjectStore. You must call this method before doing anything else with the engine.
      * If this method was previously run on the instance of the engine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
      * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
      * @param contextUser If you are running on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
      */
     public async Config(forceRefresh: boolean = false, contextUser?: UserInfo): Promise<void> {
         // make sure we don't do this more than once while the first call is still going on
         if (this._loadingSubject.value && !forceRefresh) {
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
             this._contextUser = contextUser;
 
             // Load metadata
             const rv = new RunView();
             try {
                const messageTypes = await rv.RunView({
                   EntityName: 'Communication Base Message Types',
                   ResultType: 'entity_object'
                }, contextUser);
                if (messageTypes.Success) {
                   this._BaseMessageTypes = messageTypes.Results;
                }

                const providers = await rv.RunView({
                    EntityName: 'Communication Providers',
                    ResultType: 'entity_object'
                 }, contextUser);
                if (providers.Success) {
                    this._Providers = providers.Results;
                }
 
                const providerMsgTypes = await rv.RunView({
                    EntityName: 'Communication Provider Message Types',
                    ResultType: 'entity_object'
                 }, contextUser);
                if (providerMsgTypes.Success) {
                    this._ProviderMessageTypes = providerMsgTypes.Results;
                    this._Providers.forEach((provider) => {
                        provider.MessageTypes = this._ProviderMessageTypes.filter((pmt) => pmt.CommunicationProviderID === provider.ID);
                    });
                }

                
                this._loaded = true;
             }
             catch (e) {
                LogError(e);
             }
             finally {
                 this._loadingSubject.next(false);
             }
         }
         else {
             // we have already loaded and have not been told to force the refresh
         }
     }
 
     public get BaseMessageTypes(): CommunicationBaseMessageTypeEntity[] {
       return this._BaseMessageTypes;
     }
     public get Providers(): CommunicationProviderEntityExtended[] {
        return this._Providers;
     }

     /**
      * Gets an instance of the class for the specified provider. The provider must be one of the providers that are configured in the system.
      * @param providerName 
      * @returns 
      */
     public GetProvider(providerName: string): BaseCommunicationProvider {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseCommunicationProvider>(BaseCommunicationProvider, providerName);
        if (instance) {
            // make sure the class we got back is NOT an instance of the base class, that is the default behavior of CreateInstance if we 
            // dont have a registration for the class we are looking for
            if (instance.constructor.name === 'BaseCommunicationProvider')
                throw new Error(`Provider ${providerName} not found.`);
            else
                return instance; // we got a valid instance of the sub-class we were looking for
        }
        else
            throw new Error(`Provider ${providerName} not found.`);
     }

     /**
      * Sends a single message using the specified provider. The provider must be one of the providers that are configured in the system.
      */
     public async SendSingleMessage(providerName: string, providerMessageTypeName: string, message: Message): Promise<MessageResult> {
        const provider = this.GetProvider(providerName);
        if (!provider)
            throw new Error(`Provider ${providerName} not found.`);

        const providerEntity = this.Providers.find((p) => p.Name === providerName);
        if (!providerEntity)
            throw new Error(`Provider ${providerName} not found.`);

        if (!message.MessageType) {
            // find the message type
            const providerMessageType = providerEntity.MessageTypes.find((pmt) => pmt.Name.trim().toLowerCase() === providerMessageTypeName.trim().toLowerCase());
            if (!providerMessageType)
                throw new Error(`Provider message type ${providerMessageTypeName} not found.`);
            message.MessageType = providerMessageType;
        }

        return provider.SendSingleMessage(message);
     }
}