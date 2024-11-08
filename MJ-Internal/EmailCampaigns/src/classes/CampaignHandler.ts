import { EntityInfo, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { ListDetailEntityType, ListEntity, ListEntityType } from "@memberjunction/core-entities";
import { GetListRecordsParams, SendEmailsParams } from '../models/CampaignHandler.types';
import { RelatedDatahandler } from './RelatedDataHandler';
import { MessageRecipient } from '../../../../packages/Communication/base-types/dist';

export class CampaignHander {

    public async SendEmails(params: SendEmailsParams): Promise<void> {
      const batchSize: number = params.ListBatchSize || 100;

      let fetchNextBatch: boolean = true;
      let offset: number = 0;

      const list: ListEntity = await this.GetList(params.ListID, params.CurrentUser);
      if(!list) {
        throw new Error(`No list found with ID: ${params.ListID}`);
      }

      LogStatus(`Processing list: ${list.Name}`);
      const rdh: RelatedDatahandler = new RelatedDatahandler();

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

        const recipients: MessageRecipient[] = allData.map((data) => {
          
        });

        offset++;
        if(listRecords.length < batchSize || (params.MaxListRecords && offset * batchSize >= params.MaxListRecords)) {
          fetchNextBatch = false;
        }
      }
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
}