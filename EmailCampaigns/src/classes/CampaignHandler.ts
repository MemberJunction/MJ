import { EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, TransactionGroupBase, UserInfo } from '@memberjunction/core';
import { EntityDocumentEntity, ListDetailEntity, ListDetailEntityType, ListEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateEntity, TemplateParamEntity } from "@memberjunction/core-entities";
import { CreateEntityDocumentParams, CreateEntityDocumentTemplateParams, CreateEntityDocumentTemplateResults, CreateListParams, GetListRecordsParams, GetRecommendationsParams, SendEmailsParams, UpsertTemplateContentParams } from '../models/CampaignHandler.types';
import { RelatedDatahandler } from './RelatedDataHandler';
import { Message, MessageRecipient } from "@memberjunction/communication-types";
import { MJGlobal } from '@memberjunction/global';
import { DataModifier } from './DataModifier';
import { dataModifierClassName, messageBuilderClassName } from '../Config';
import { CommunicationEngine  } from '@memberjunction/communication-engine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { MessageBuilder } from './MessageBuilder';
import { RecommendationEngineBase, RecommendationRequest, RecommendationResult } from '@memberjunction/ai-recommendations';
import * as fs from 'fs';
import { EntityVectorSyncer, VectorizeEntityParams } from '@memberjunction/ai-vector-sync';
import { AIEngine } from '@memberjunction/aiengine';

export class CampaignHander {
  private dataModifier: DataModifier;

  public constructor() {
    this.dataModifier = this.GetDataModifier();
  }

  public async Config(currentUser: UserInfo): Promise<void> {
    await CommunicationEngine.Instance.Config(false, currentUser);
    await TemplateEngineServer.Instance.Config(false, currentUser);
    await RecommendationEngineBase.Instance.Config(false, currentUser);
    await AIEngine.Instance.Config(false, currentUser);
  }

  public async SendEmails(params: SendEmailsParams): Promise<void> {

    if(!params.CurrentUser){
      throw new Error('params.CurrentUser is required.');
    }

    const md: Metadata = new Metadata();
    const batchSize: number = params.ListBatchSize || 100;

    let fetchNextBatch: boolean = true;
    let offset: number = params.StartingOffset || 0;

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

      const entityInfo: EntityInfo | undefined = md.EntityByName(list.Entity);
      if(!entityInfo){
        throw new Error(`Entity with name ${list.Entity} not found.`);
      }

      const allData: Record<string, any>[] = await Promise.all(listRecords.map(async (record) => {
        const relatedData = await rdh.GetData({
          SourceRecordEntityName: list.Entity,
          RecordID: record[entityInfo.FirstPrimaryKey.Name],
          RecommendationRunIDs: params.RecommendationRunIDs,
          CurrentUser: params.CurrentUser
        });

        return relatedData;
      }));

      const recipients: MessageRecipient[] = [];
      await Promise.all(allData.map(async (data: any) => {
        const recipient: MessageRecipient | null = await this.dataModifier.GetMessageRecipient(data, params.CurrentUser);
        if(recipient) {

          if(params.TestEmail) {
            recipient.To = params.TestEmail;
          }

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
    const recommendationParams: any = {
      ListID: params.ListID,
      CurrentUser: params.CurrentUser,
      Options: params.ContextData,
      CreateErrorList: params.CreateErrorList
    };

    const results: RecommendationResult = await RecommendationEngineBase.Instance.Recommend(recommendationParams);
    return results;
  }

  public async CreateEntityDocument(params: CreateEntityDocumentParams): Promise<EntityDocumentEntity> {
    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();

    const entity: EntityInfo | undefined = md.EntityByName(params.EntityName);
    if(!entity){
      throw new Error(`Entity with name ${params.EntityName} not found.`);
    }

    const vectorDatabaseName: string = params.VectorDatabaseName || 'Pinecone';
    const AIModelName: string = params.AIModelName || 'text-embedding-3-small';

    const rvResults = await rv.RunViews([
      {
        EntityName: 'Vector Databases',
        ExtraFilter: `Name = '${vectorDatabaseName}'`
      },
      {
        EntityName: 'AI Models',
        ExtraFilter: `Name = '${AIModelName}'`
      },
      {
        EntityName: 'Entity Document Types',
      }
    ], params.CurrentUser);

    if(!rvResults[0].Success) {
      LogError(rvResults[0].ErrorMessage);
      throw new Error(`Error getting vector database: ${rvResults[0].ErrorMessage}`);
    }

    if(rvResults[0].Results.length == 0) {
      throw new Error(`No vector database found with name: Pinecone`);
    }

    if(!rvResults[1].Success) {
      LogError(rvResults[1].ErrorMessage);
      throw new Error(`Error getting AI model: ${rvResults[1].ErrorMessage}`);
    }

    if(rvResults[1].Results.length == 0) {
      throw new Error(`No AI model found with name: Pinecone`);
    }

    if(!rvResults[2].Success) {
      LogError(rvResults[2].ErrorMessage);
      throw new Error(`Error getting Entity Document Type: ${rvResults[2].ErrorMessage}`);
    }

    if(rvResults[2].Results.length == 0) {
      throw new Error(`No Entity Document Type found`);
    }

    const VectorDatabaseID: string = rvResults[0].Results[0].ID;
    const AIModelID: string = rvResults[1].Results[0].ID;
    const entityDocumentTypeID: string = rvResults[2].Results[0].ID;

    const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>('Entity Documents', params.CurrentUser);
    entityDocument.Name = params.EntityDocumentName;
    entityDocument.EntityID = entity.ID;
    entityDocument.VectorDatabaseID = VectorDatabaseID;
    entityDocument.AIModelID = AIModelID;
    entityDocument.TemplateID = params.TemplateID;
    entityDocument.Status = 'Active';
    entityDocument.TypeID = entityDocumentTypeID;
    entityDocument.PotentialMatchThreshold = 0.8;
    entityDocument.AbsoluteMatchThreshold = 0.9;

    const saveResult: boolean = await entityDocument.Save();
    if(!saveResult) {
      LogError(entityDocument.LatestResult);
      throw new Error(`Error saving entity document`);
    }

    LogStatus(`Created entity document: ${entityDocument.Name} with ID: ${entityDocument.ID}`);
    return entityDocument;
  }

  public async CreateEntityDocumentTemplate(params: CreateEntityDocumentTemplateParams): Promise<CreateEntityDocumentTemplateResults> {
    const md: Metadata = new Metadata();
    const entity: EntityInfo | undefined = md.EntityByName(params.EntityName);
    if(!entity){
      throw new Error(`Entity with name ${params.EntityName} not found.`);
    }

    const templateEntity: TemplateEntity = await md.GetEntityObject<TemplateEntity>('Templates', params.CurrentUser);
    templateEntity.Name = params.TemplateName;
    templateEntity.Description = params.TemplateDescription || '';
    templateEntity.UserID = params.CurrentUser.ID;

    const saveResult: boolean = await templateEntity.Save();
    if(!saveResult) {
      LogError(templateEntity.LatestResult);
      throw new Error(`Error saving template`);
    }

    LogStatus(`Created template: ${templateEntity.Name} with ID: ${templateEntity.ID}`);

    //now create the template content record
    const rv: RunView = new RunView();

    const templateTypeName: string = params.TemplateType || 'HTML';
    const rvTemplateTypes = await rv.RunView<TemplateContentTypeEntity>({
      EntityName: 'Template Content Types',
      ExtraFilter: `Name = '${templateTypeName}'`,
    }, params.CurrentUser);

    if(!rvTemplateTypes.Success) {
      LogError(rvTemplateTypes.ErrorMessage);
      throw new Error(`Error getting template content types: ${rvTemplateTypes.ErrorMessage}`);
    }

    if(rvTemplateTypes.Results.length == 0) {
      LogError(`No template content type found with name: ${templateTypeName}`);
      throw new Error(`No template content type found with name: ${templateTypeName}`);
    }

    const templateContentType: TemplateContentTypeEntity = rvTemplateTypes.Results[0];

    const templateContent: TemplateContentEntity = await md.GetEntityObject<TemplateContentEntity>('Template Contents', params.CurrentUser);
    templateContent.TemplateID = templateEntity.ID;
    templateContent.TypeID = templateContentType.ID;
    templateContent.Priority = 1;
    templateContent.IsActive = true;

    let fields: string[] = [];
    if(params.Fields) {
      fields = params.Fields;
    }
    else{
      const includeNullableFields: boolean = params.IncludeNullableFields || false;
      for(const field of entity.Fields){
        if(!field.AllowsNull){
          fields.push(field.Name);
        }

        if(field.AllowsNull && includeNullableFields){
          fields.push(field.Name);
        }
      }
    }

    const templateParamName: string = params.TemplateParamName || 'Record';
    let templateText: string = fields.map((field: string) => `{${templateParamName}.${field}}`).join('\n');
    templateContent.TemplateText = templateText;

    const saveContentResult: boolean = await templateContent.Save();
    if(!saveContentResult) {
      LogError(templateContent.LatestResult);
      throw new Error(`Error saving template content`);
    }

    LogStatus(`Created template content for template: ${templateEntity.Name} with ID: ${templateContent.ID}`);

    //finally reate a template param record
    const templateParam: TemplateParamEntity = await md.GetEntityObject<TemplateParamEntity>('Template Params', params.CurrentUser);
    templateParam.TemplateID = templateEntity.ID;
    templateParam.Name = templateParamName;
    templateParam.Description = `The param that holds the ${entity.Name} record data`;
    templateParam.Type = 'Record';
    templateParam.IsRequired = true;
    templateParam.EntityID = entity.ID;

    const saveParamResult: boolean = await templateParam.Save();
    if(!saveParamResult) {
      LogError(templateParam.LatestResult);
      throw new Error(`Error saving template param`);
    }

    LogStatus(`Created template param for template: ${templateEntity.Name} with ID: ${templateParam.ID}`);

    const results: CreateEntityDocumentTemplateResults = {
      Template: templateEntity,
      TemplateContent: templateContent,
      TemplateParam: templateParam
    };

    return results;
  }

  public async CreateList(params: CreateListParams): Promise<void> {
    const md: Metadata = new Metadata();
    const entity: EntityInfo | undefined = md.EntityByName(params.EntityName);

    if(!entity){
      throw new Error(`Entity with name ${params.EntityName} not found.`);
    }

    const list: ListEntity = await md.GetEntityObject<ListEntity>('Lists', params.CurrentUser);
    list.Name = params.ListName
    list.Description = params.ListDescription || '';
    list.EntityID = entity.ID;
    list.UserID = params.CurrentUser.ID;

    const saveResult: boolean = await list.Save();
    if(!saveResult) {
      LogError("Error saving list: ", undefined, list.LatestResult);
      throw new Error(`Error saving list`);
    }

    LogStatus(`Created list: ${list.Name} with ID: ${list.ID}`);

    //now create the list details records
    const rv: RunView = new RunView();
    const rvResult = await rv.RunView({
      EntityName: entity.Name,
      ExtraFilter: params.Filter,
      IgnoreMaxRows: true
    }, params.CurrentUser);

    if(!rvResult.Success) {
      LogError(rvResult.ErrorMessage);
      throw new Error(`Error getting list details: ${rvResult.ErrorMessage}`);
    }

    LogStatus(`Adding ${rvResult.Results.length} records to list: ${list.Name}`);

    const batchSize: number = params.BatchSize || 25;
    let currentBatch: number = 1;
    for(let i = 0; i < rvResult.Results.length; i += batchSize) {
      LogStatus(`Processing batch ${currentBatch} of ${rvResult.Results.length / batchSize}`);

      const batch: any[] = rvResult.Results.slice(i, i + batchSize);
      await Promise.all(batch.map(async (record) => {
        const listDetail: ListDetailEntity = await md.GetEntityObject<ListDetailEntity>('List Details', params.CurrentUser);
        listDetail.ListID = list.ID;
        listDetail.RecordID = record[entity.FirstPrimaryKey.Name];
        const saveResult: boolean = await listDetail.Save(); //no need to await, its within a transaction group
        if(!saveResult) {
          LogError("Error saving list detail: ", undefined, listDetail.LatestResult);
        }
      }));

      currentBatch++;
    }
  }

  public async UpdateTemplateContent(params: UpsertTemplateContentParams): Promise<void> {
    const md: Metadata = new Metadata();
    const rv: RunView = new RunView();

    let templateContent: TemplateContentEntity = await md.GetEntityObject("Template Contents", params.CurrentUser);
    const loadResult: boolean = await templateContent.Load(params.TemplateContentID);

    if(!loadResult) {
      LogError(templateContent.LatestResult);
      throw new Error(`Error loading template content with ID: ${params.TemplateContentID}`);
    }

    if(params.TemplateText){
      templateContent.TemplateText = params.TemplateText;
    }
    else if(params.FilePath){
      const fileText: string = fs.readFileSync(params.FilePath, 'utf8');
      templateContent.TemplateText = fileText;
    }

    const saveResult: boolean = await templateContent.Save();
    if(!saveResult) {
      LogError("Failed to update template content");
      LogError(templateContent.LatestResult);
    }
    else{
      LogStatus(`Template ${templateContent.ID} successfully updated`);

      //update the template engine
      await TemplateEngineServer.Instance.Config(true, params.CurrentUser);
    }
  }

  public async VectorizeRecords(params: VectorizeEntityParams, currentUser: UserInfo): Promise<void> {
    let vectorizer = new EntityVectorSyncer();
    vectorizer.CurrentUser = currentUser;
    
    let entityDocument = await vectorizer.GetEntityDocument(params.entityDocumentID);
    if (!entityDocument) {
      throw new Error(`No active Entity Document found for entity ${params.entityID}`);
    }

    const request: VectorizeEntityParams = {
      entityID: entityDocument.EntityID,
      entityDocumentID: entityDocument.ID,
      batchCount: params.batchCount || 100,
      options: params.options,
      listID: params.listID,
      dataHandlerClassName: params.dataHandlerClassName
    };

    console.log('vectorizing entity...');
    await vectorizer.VectorizeEntity(request, currentUser);
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