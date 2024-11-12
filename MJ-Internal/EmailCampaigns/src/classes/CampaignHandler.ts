import { EntityInfo, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { ListDetailEntityType, ListEntity, ListEntityType } from "@memberjunction/core-entities";
import { GetListRecordsParams, GetRecommendationsParams, SendEmailsParams } from '../models/CampaignHandler.types';
import { RelatedDatahandler } from './RelatedDataHandler';
import { Message, MessageRecipient } from "@memberjunction/communication-types";
import { MJGlobal } from '@memberjunction/global';
import { DataModifier } from './DataModifier';
import { dataModifierClassName, messageBuilderClassName } from '../Config';
import { CommunicationEngine  } from '@memberjunction/communication-engine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { MessageBuilder } from './MessageBuilder';
import { RecommendationEngineBase, RecommendationRequest, RecommendationResult } from '@memberjunction/ai-recommendations';

export class CampaignHander {
  private dataModifier: DataModifier;

  public constructor() {
    this.dataModifier = this.GetDataModifier();
  }

  public async Config(currentUser: UserInfo): Promise<void> {
    await CommunicationEngine.Instance.Config(false, currentUser);
    await TemplateEngineServer.Instance.Config(false, currentUser);
    await RecommendationEngineBase.Instance.Config(false, currentUser);
  }

  public async SendEmails(params: SendEmailsParams): Promise<void> {

    if(!params.CurrentUser){
      throw new Error('params.CurrentUser is required.');
    }

    const batchSize: number = params.ListBatchSize || 100;

    let fetchNextBatch: boolean = true;
    let offset: number = 0;

    const list: ListEntity = await this.GetList(params.ListID, params.CurrentUser);
    if(!list) {
      throw new Error(`No list found with ID: ${params.ListID}`);
    }

    LogStatus(`Processing list: ${list.Name}`);

    const rdh: RelatedDatahandler = new RelatedDatahandler();
    const message: Message = await this.GetMessageObject(params.CurrentUser);

    while(fetchNextBatch) {
      const getListParams: GetListRecordsParams = {
        List: list,
        ListBatchSize: batchSize,
        Offset: offset,
        CurrentUser: params.CurrentUser
      };

      const listRecords: Record<string, any>[] = await this.GetRecordsByListID(getListParams);
      LogStatus(`Processing batch ${offset + 1}. Batch size: ${listRecords.length}`);

      const allData: Record<string, any>[] = await Promise.all(listRecords.map(async (record) => {
        const relatedData = await rdh.GetData({
          SourceRecordEntityName: list.Entity,
          RecordID: record.ID,
          RecommendationRunID: params.RecommendationRunID,
          CurrentUser: params.CurrentUser
        });

        return relatedData;
      }));

      const recipients: MessageRecipient[] = [];
      await Promise.all(allData.map(async (data: any) => {
        const recipient: MessageRecipient | null = await this.dataModifier.GetMessageRecipient(data, params.CurrentUser);
        if(recipient) {
          recipients.push(recipient);
        }
      }));

      await CommunicationEngine.Instance.SendMessages("SendGrid", "Email", message, recipients, false);

      offset++;
      if(listRecords.length < batchSize || (params.MaxListRecords && offset * batchSize >= params.MaxListRecords)) {
        fetchNextBatch = false;
      }
    }
  }

  public async GetRecommendations(params: GetRecommendationsParams): Promise<RecommendationResult> {
    const recommendationParams: RecommendationRequest = {
      ListID: params.ListID,
      CurrentUser: params.CurrentUser,
      Options: params.ContextData
    };

    const results: RecommendationResult = await RecommendationEngineBase.Instance.Recommend(recommendationParams);
    return results;
  }

  private async GetList(listID: string, currentUser? :UserInfo): Promise<ListEntity> {
      const rv: RunView = new RunView();

      const rvListResult = await rv.RunView<ListEntity>({
          EntityName: 'Lists',
          ExtraFilter: `ID = '${listID}'`,
          ResultType: 'entity_object'
      }, currentUser);
  
      if(!rvListResult.Success) {
        throw new Error(`Error getting list with ID: ${listID}: ${rvListResult.ErrorMessage}`);
      }
  
      if(rvListResult.Results.length == 0) {
        throw new Error(`No list found with ID: ${listID}`);
      }
  
      return rvListResult.Results[0];
  }

  private async GetRecordsByListID<T>(params: GetListRecordsParams): Promise<T[]> {
      const rv: RunView = new RunView();
      const md: Metadata = new Metadata();
  
      const rvListDetailsResult = await rv.RunView({
        /* Getting the List Details to get the record IDs */
        EntityName: 'List Details',
        ExtraFilter: `ListID = '${params.List.ID}'`,
        ResultType: 'simple',
        MaxRows: params.ListBatchSize,
        StartRow: Math.max(0, (params.Offset - 1) * params.ListBatchSize)
      }, params.CurrentUser);
  
      if(!rvListDetailsResult.Success) {
        throw new Error(`Error getting list details for listID: ${params.List.ID}: ${rvListDetailsResult.ErrorMessage}`);
      }
  
      //list is empty, just exit early
      if(rvListDetailsResult.Results.length == 0) {
        return [];
      }

      const entity: EntityInfo | undefined = md.EntityByID(params.List.EntityID);
      if(!entity){
        throw new Error(`Entity with ID ${params.List.EntityID} not found.`);
      }

      const needsQuotes: string = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const recordIDs: string = rvListDetailsResult.Results.map((ld: ListDetailEntityType) => `${needsQuotes}${ld.RecordID}${needsQuotes}`).join(',');
      
      const rvEntityResult: RunViewResult<T> = await rv.RunView<T>({
        EntityName: params.List.Entity,
        ExtraFilter: `${entity.FirstPrimaryKey.Name} IN (${recordIDs})`,
      }, params.CurrentUser);
  
      if(!rvEntityResult.Success) {
        throw new Error(`Error getting entity records for list: ${params.List.Name}: ${rvEntityResult.ErrorMessage}`);
      }

      return rvEntityResult.Results;
  }

  private GetDataModifier(): DataModifier {
    const modifier: DataModifier | null = MJGlobal.Instance.ClassFactory.CreateInstance(DataModifier, dataModifierClassName);
    if(!modifier) {
      throw new Error(`DataModifier class not found: ${dataModifierClassName}`);
    }

    if(modifier.constructor.name === 'DataModifier') {
      throw new Error(`DataModifier ${dataModifierClassName} returned an instance of the base class.`);
    }

    return modifier;
  }

  private async GetMessageObject(currentUser: UserInfo): Promise<Message> {
    const builder: MessageBuilder | null = MJGlobal.Instance.ClassFactory.CreateInstance(MessageBuilder, messageBuilderClassName);
    if(!builder) {
      throw new Error(`MessageBuilder class not found: ${dataModifierClassName}`);
    }

    if(builder.constructor.name === 'MessageBuilder') {
      throw new Error(`MessageBuilder ${dataModifierClassName} returned an instance of the base class.`);
    }

    const obj: Message = await builder.GetMessage(currentUser);
    return obj;
  }
}