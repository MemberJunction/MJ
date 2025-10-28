import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, UserInfo } from "@memberjunction/core";
import { CommunicationBaseMessageTypeEntity, CommunicationLogEntity, CommunicationProviderMessageTypeEntity, CommunicationRunEntity, EntityCommunicationFieldEntity, EntityCommunicationMessageTypeEntity } from "@memberjunction/core-entities";
import { CommunicationProviderEntityExtended, ProcessedMessage } from "./BaseProvider";
 

/**
 * Base class for communications. This class can be sub-classed if desired if you would like to modify the logic across ALL actions. To do so, sub-class this class and use the 
 * @RegisterClass decorator from the @memberjunction/global package to register your sub-class with the ClassFactory. This will cause your sub-class to be used instead of this base class when the Metadata object insantiates the ActionEngine.
 */
export class CommunicationEngineBase extends BaseEngine<CommunicationEngineBase> {
   /**
    * Returns the global instance of the class. This is a singleton class, so there is only one instance of it in the application. Do not directly create new instances of it, always use this method to get the instance.
    */
   public static get Instance(): CommunicationEngineBase {
      return super.getInstance<CommunicationEngineBase>();
   }
   
   private _Metadata: {
      BaseMessageTypes: CommunicationBaseMessageTypeEntity[],
      Providers: CommunicationProviderEntityExtended[],
      ProviderMessageTypes: CommunicationProviderMessageTypeEntity[],
      EntityCommunicationMessageTypes: EntityCommunicationMessageTypeEntity[],
      EntityCommunicationFields: EntityCommunicationFieldEntity[]
   } = {
      BaseMessageTypes: [],
      Providers: [],
      ProviderMessageTypes: [],
      EntityCommunicationMessageTypes: [],
      EntityCommunicationFields: []
   };

   /**
    * This method is called to configure the engine. It loads the metadata and caches it in the GlobalObjectStore. You must call this method before doing anything else with the engine.
    * If this method was previously run on the instance of the engine, it will return immediately without re-loading the metadata. If you want to force a reload of the metadata, you can pass true for the forceReload parameter.
    * @param forceRefresh If true, the metadata will be loaded from the database even if it was previously loaded.
    * @param contextUser If you are running on the server side you must pass this in, but it is not required in an environment where a user is authenticated directly, e.g. a browser or other client. 
    */
   public async Config(forceRefresh: boolean = false, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
      const config: Partial<BaseEnginePropertyConfig>[] = [
         {
               Type: 'dataset',
               DatasetName: 'Communication_Metadata',
               DatasetResultHandling: "single_property",
               PropertyName: "_Metadata"
         }
      ]

      await this.Load(config, provider, forceRefresh, contextUser); 
   }

   protected override async AdditionalLoading(contextUser?: UserInfo) {
      // a little post-processing done within the context of the base classes loading architecture...
      this._Metadata.Providers.forEach((provider) => {
         provider.MessageTypes = this._Metadata.ProviderMessageTypes.filter((pmt) => pmt.CommunicationProviderID === provider.ID);
      });
   }

   public get BaseMessageTypes(): CommunicationBaseMessageTypeEntity[] {
      return this._Metadata.BaseMessageTypes;
   }
   public get Providers(): CommunicationProviderEntityExtended[] {
      return this._Metadata.Providers;
   }
   public get ProviderMessageTypes(): CommunicationProviderMessageTypeEntity[] {
      return this._Metadata.ProviderMessageTypes;
   }

   public get Metadata() {
      return this._Metadata;
   }
 

   /**
   * Starts a communication run
   */
   protected async StartRun(): Promise<CommunicationRunEntity> {
      const md = new Metadata();
      const run = await md.GetEntityObject<CommunicationRunEntity>('Communication Runs', this.ContextUser);
      run.Status = 'Pending';
      run.Direction = 'Sending';
      run.StartedAt = new Date();
      run.UserID = this.ContextUser.ID;
      if (await run.Save()) {
         return run;
      }
      else {
         if (run.LatestResult) {
            console.error('Failed to save communication run:', run.LatestResult.CompleteMessage);
            
            if (run.LatestResult.CompleteMessage) {
               console.error('  Original error:', run.LatestResult.CompleteMessage);
            }
         }
         else {
               console.error('Failed to save communication run: No error details available');
         }
         return null; 
      }
   }

   /**
   * Ends a communication run
   * @param run 
   * @returns 
   */
   protected async EndRun(run: CommunicationRunEntity): Promise<boolean> {
      run.Status = 'Complete';
      run.EndedAt = new Date();
      return await run.Save();
   }

   /**
   * This method creates a new Communication Log record and saves it to the database with a status of pending. It returns the new Communication Log record.
   * @param processedMessage 
   * @param run 
   */
   protected async StartLog(processedMessage: ProcessedMessage, run?: CommunicationRunEntity): Promise<CommunicationLogEntity> {
      const md = new Metadata();
      const log = await md.GetEntityObject<CommunicationLogEntity>('Communication Logs', this.ContextUser);
      log.CommunicationRunID = run?.ID;
      log.Status = 'Pending';
      log.CommunicationProviderID = processedMessage.MessageType.CommunicationProviderID;
      log.CommunicationProviderMessageTypeID = processedMessage.MessageType.ID;
      log.MessageDate = new Date();
      log.Direction = 'Sending';
      log.MessageContent = JSON.stringify({
            To: processedMessage.To,
            From: processedMessage.From,
            Subject: processedMessage.ProcessedSubject,
            HTMLBody: processedMessage.ProcessedHTMLBody,
            TextBody: processedMessage.ProcessedBody,
      });
      
      if (await log.Save()) {
         return log;
      }
      else {
         if (log.LatestResult) {
            console.error('Failed to save communication log:', log.LatestResult.CompleteMessage);
            
            if (log.LatestResult.CompleteMessage) {
               console.error('  Original error:', log.LatestResult.CompleteMessage);
            }
         }
         else {
               console.error('Failed to save communication log: No error details available');
         }
         return null; 
      }
   }
}