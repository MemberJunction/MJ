import { BaseEngine, Metadata, UserInfo, LogStatus, RunView, EntityInfo, LogError, IMetadataProvider, BaseEnginePropertyConfig, CompositeKey } from '@memberjunction/core';
import { MJListDetailEntityType, MJListEntity, MJListEntityType, MJRecommendationEntity, MJRecommendationProviderEntity, MJRecommendationRunEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { RecommendationProviderBase } from './ProviderBase';
import { RecommendationRequest, RecommendationResult } from './generic/types';

/**
 * Engine class to be used for running all recommendation requests
 */
export class RecommendationEngineBase extends BaseEngine<RecommendationEngineBase> {
  private _RecommendationProviders: MJRecommendationProviderEntity[] = [];

  public static get Instance(): RecommendationEngineBase {
    return super.getInstance<RecommendationEngineBase>();
  }

  public get RecommendationProviders(): MJRecommendationProviderEntity[] {
    return this._RecommendationProviders;
  }

  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
    const params: Array<Partial<BaseEnginePropertyConfig>> = [
      {
        PropertyName: '_RecommendationProviders',
        EntityName: 'MJ: Recommendation Providers',
        CacheLocal: true
      },
    ];

    return await this.Load(params, provider, forceRefresh, contextUser);
  }

  public async Recommend<T>(request: RecommendationRequest<T>): Promise<RecommendationResult> {
    super.TryThrowIfNotLoaded();

    let provider: MJRecommendationProviderEntity = request.Provider;
    if (!provider){
      if(this.RecommendationProviders.length == 0) {
        throw new Error('No recommendation provider provider and no provider found in metadata');
      }
      else{
        provider = this.RecommendationProviders[0];
      }
    }

    LogStatus(`Recommendation Engine is using provider: ${provider.Name}`);

    // get the driver
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<RecommendationProviderBase>(RecommendationProviderBase, provider.Name);

    if(!driver) {
      throw new Error(`Could not find driver for provider: ${provider.Name}`);
    }

    const recommendations: MJRecommendationEntity[] = await this.GetRecommendationEntities(request);
    LogStatus(`Processing ${recommendations.length} recommendations`);

    if(recommendations.length == 0) {
      return {
        Success: true,
        ErrorMessage: 'No records found to get recommendations for',
      } as any;
    }
    
    request.Recommendations = recommendations;

    // load the run
    const recommendationRunEntity = await this.ProviderToUse.GetEntityObject<MJRecommendationRunEntity>('MJ: Recommendation Runs', request.CurrentUser);
    recommendationRunEntity.NewRecord();

    // update status for current run
    recommendationRunEntity.Status = 'In Progress';
    recommendationRunEntity.RecommendationProviderID = provider.ID;
    recommendationRunEntity.StartDate = new Date();
    recommendationRunEntity.RunByUserID = request.CurrentUser ? request.CurrentUser.ID : super.ContextUser.ID;

    const saveResult: boolean = await recommendationRunEntity.Save();
    if(!saveResult) {
      LogStatus(`Error saving RecommendationRun entity: `, undefined, recommendationRunEntity.LatestResult);
      throw new Error('Error creating Recommendation Run entity');
    }

    if(request.CreateErrorList){
      const errorList: MJListEntity | null = await this.CreateRecommendationErrorList(recommendationRunEntity.ID, recommendations[0].SourceEntityID, request.CurrentUser);
      if(errorList){
        request.ErrorListID = errorList.ID;
      }
    }

    request.RunID = recommendationRunEntity.ID;
    const recommendResult: RecommendationResult = await driver.Recommend(request);
    recommendationRunEntity.Status = recommendResult.Success ? 'Completed' : 'Error';
    recommendationRunEntity.Description = recommendResult.ErrorMessage;

    const postRunSaveResult: boolean = await recommendationRunEntity.Save();
    if(!postRunSaveResult) {
      LogStatus(`Error saving RecommendationRun entity: `, undefined, recommendationRunEntity.LatestResult);
      throw new Error('Error updating Recommendation Run entity');
    }

    return recommendResult;
  }

  private async GetRecommendationEntities(request: RecommendationRequest): Promise<MJRecommendationEntity[]> {
    if(request.Recommendations){
      const invalidEntities: MJRecommendationEntity[] = request.Recommendations.filter((r) => !this.IsNullOrUndefined(r.RecommendationRunID) || r.IsSaved);
      if(invalidEntities.length > 0){
        throw new Error(`Recommendation entities must be new, not saved and have their RecommendationRunID not set. Invalid entities: ${invalidEntities.map((r) => r.ID).join(',')}`);
      }

      return request.Recommendations;
    }
    else if(request.ListID){
      return await this.GetRecommendationsByListID(request.ListID, request.CurrentUser);
    }
    else if(request.EntityAndRecordsInfo){
      const entityName = request.EntityAndRecordsInfo.EntityName;
      const recordIDs = request.EntityAndRecordsInfo.RecordIDs;

      if(!entityName){
        throw new Error('Entity name is required in EntityAndRecordsInfo');
      }

      if(!recordIDs){
        throw new Error('RecordIDs are required in EntityAndRecordsInfo');
      }

      return await this.GetRecommendationsByRecordIDs(entityName, recordIDs, request.CurrentUser);
    }
  }

  private async GetRecommendationsByListID(listID: string, currentUser?: UserInfo): Promise<MJRecommendationEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const md = this.ProviderToUse;

    const rvListDetailsResult = await rv.RunViews([
      { /* Getting the List to get the entity name */
        EntityName: 'MJ: Lists',
        ExtraFilter: `ID = '${listID}'`,
        ResultType: 'simple'
      },
      { /* Getting the List Details to get the record IDs */
        EntityName: 'MJ: List Details',
        ExtraFilter: `ListID = '${listID}'`,
        ResultType: 'simple',
        IgnoreMaxRows: true,
      }
    ], currentUser);

    const listViewResult = rvListDetailsResult[0];
    if(!listViewResult.Success) {
      throw new Error(`Error getting list with ID: ${listID}: ${listViewResult.ErrorMessage}`);
    }

    if(listViewResult.Results.length == 0) {
      throw new Error(`No list found with ID: ${listID}`);
    }

    const list: MJListEntityType = listViewResult.Results[0];
    const entityName: string = list.Entity;
    LogStatus(`Getting recommendations for list: ${list.Name}. Entity: ${entityName}`);

    const entityID: string = list.EntityID;
    const entity: EntityInfo = md.Entities.find((e) => UUIDsEqual(e.ID, entityID));

    const listDetailsResult = rvListDetailsResult[1];
    if(!listDetailsResult.Success) {
      throw new Error(`Error getting list details for listID: ${listID}: ${listDetailsResult.ErrorMessage}`);
    }

    //list is empty, just exit early
    if(listDetailsResult.Results.length == 0) {
      return [];
    }

    const recordIDs: string[] = listDetailsResult.Results.map((ld: MJListDetailEntityType) => ld.RecordID);
    const rvEntityResult = await rv.RunView<Record<string, unknown>>({
      EntityName: entityName,
      ExtraFilter: this.BuildPrimaryKeyFilter(entity, recordIDs),
      IgnoreMaxRows: true,
    }, currentUser);

    if(!rvEntityResult.Success) {
      throw new Error(`Error getting entity records for listID: ${listID}: ${rvEntityResult.ErrorMessage}`);
    }

    let recommendations: MJRecommendationEntity[] = [];
    for(const row of rvEntityResult.Results) {
      const recommendationEntity: MJRecommendationEntity = await md.GetEntityObject<MJRecommendationEntity>('MJ: Recommendations', currentUser);
      recommendationEntity.NewRecord();
      recommendationEntity.SourceEntityID = entityID;
      recommendationEntity.SourceEntityRecordID = CompositeKey.FromEntityRecord(entity, row).ToCompactURLSegment();
      recommendations.push(recommendationEntity);
    }

    return recommendations;
  }

  private async GetRecommendationsByRecordIDs(entityName: string, recordIDs: Array<string | number>, currentUser?: UserInfo): Promise<MJRecommendationEntity[]> {
    const md = this.ProviderToUse;
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);

    const entity: EntityInfo = md.Entities.find((e) => e.Name.toLowerCase() == entityName.toLowerCase());
    if(!entity) {
      throw new Error(`Unable to get recommendations by entity info: Entity not found with name: ${entityName}`);
    }

    LogStatus(`Getting recommendations for entity: ${entityName}`);
    if(recordIDs.length === 0) {
      return [];
    }

    const rvEntityResult = await rv.RunView<Record<string, unknown>>({
      EntityName: entityName,
      ExtraFilter: this.BuildPrimaryKeyFilter(entity, recordIDs),
      IgnoreMaxRows: true,
    }, currentUser);

    if(!rvEntityResult.Success) {
      throw new Error(`Error getting entity records for entity: ${entityName}: ${rvEntityResult.ErrorMessage}`);
    }

    let recommendations: MJRecommendationEntity[] = [];
    for(const row of rvEntityResult.Results) {
      const recommendationEntity: MJRecommendationEntity = await md.GetEntityObject<MJRecommendationEntity>('MJ: Recommendations', currentUser);
      recommendationEntity.NewRecord();
      recommendationEntity.SourceEntityID = entity.ID;
      recommendationEntity.SourceEntityRecordID = CompositeKey.FromEntityRecord(entity, row).ToCompactURLSegment();
      recommendations.push(recommendationEntity);
    }

    return recommendations;
  }

  /**
   * Builds the filter that selects exactly the given records of `entity`. Each id is a compact
   * CompositeKey URL segment — what `MJ: List Details.RecordID` holds and what callers pass to
   * {@link GetRecommendationsByRecordIDs}: the bare value for a single-column key (whatever the
   * column is called), `F1|v1||F2|v2` for a composite key. A single-column key uses one `IN (...)`;
   * a composite key needs one `(F1=.. AND F2=..)` term per record, since no single column can be
   * compared against a multi-column value.
   */
  protected BuildPrimaryKeyFilter(entity: EntityInfo, recordIDs: Array<string | number>): string {
    if (entity.PrimaryKeys.length === 1) {
      const quote: string = entity.FirstPrimaryKey.NeedsQuotes ? "'" : ''; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
      const values: string = recordIDs.map((id) => `${quote}${String(id).replace(/'/g, "''")}${quote}`).join(',');
      return `${entity.FirstPrimaryKey.Name} IN (${values})`; // first-pk-ok: guarded by PrimaryKeys.length === 1 above
    }
    return recordIDs.map((id) => `(${CompositeKey.FromURLSegment(entity, String(id)).ToWhereClause()})`).join(' OR ');
  }

  private async CreateRecommendationErrorList(recommendationRunID: string, entityID: string, currentUser?: UserInfo): Promise<MJListEntity | null> {
    const md = this.ProviderToUse;
    const list: MJListEntity = await md.GetEntityObject<MJListEntity>('MJ: Lists', currentUser);
    list.Name = `Recommendation Run ${recommendationRunID} Errors`;
    list.EntityID = entityID;
    list.UserID = currentUser ? currentUser.ID : super.ContextUser.ID;

    const saveResult: boolean = await list.Save();
    if(!saveResult) {
      LogError(`Error saving Recommendation Error List entity: `, undefined, list.LatestResult);
      return null;
    }
    else{
      LogStatus(`Error list created for recommendation run: ${recommendationRunID}. List ID: ${list.ID}`);
    }

    return list;
  }

  private IsNullOrUndefined(value: unknown): boolean {
    return value === null || value === undefined;
  }
}