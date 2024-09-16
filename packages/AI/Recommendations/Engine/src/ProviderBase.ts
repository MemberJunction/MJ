import { RecommendationEntity, RecommendationItemEntity } from '@memberjunction/core-entities';
import type { RecommendationRequest, RecommendationResult } from './Engine';
import { Metadata, UserInfo } from '@memberjunction/core';

/**
 * Base class for all recommendation providers
 */
export abstract class RecommendationProviderBase {
  private _md: Metadata;
  private _ContextUser: UserInfo;
  public constructor(ContextUser: UserInfo) {
    this._ContextUser = ContextUser;
    this._md = new Metadata();
  }
  public get ContextUser(): UserInfo {
    return this._ContextUser;
  }
  /**
   * For each entry in the request.Recommendations array, the provider's external API is called to
   * produce zero or more {@link RecommendationItemEntity} records.
   *
   * @param request - The Recommendations to request from this provider
   */
  public abstract Recommend(request: RecommendationRequest): Promise<RecommendationResult>;

  /**
   * This method is used by subclasses to update a Recommendation record in the database to set the RecommendationRunID column. In addition,
   * this method will save all the RecommendationItem records associated with the Recommendation record and link them to the Recommendation record.
   * @param recommendation 
   * @param RunID 
   */
  protected async SaveRecommendation(recommendation: RecommendationEntity, RunID: string, items: RecommendationItemEntity[]): Promise<boolean> {
    recommendation.RecommendationRunID = RunID;
    let bResult: boolean = await recommendation.Save();
    if (bResult) {
      for (const item of items) {
        item.RecommendationID = recommendation.ID;
        bResult = bResult && await item.Save();
      }
    }
    return bResult;
  } 
}
