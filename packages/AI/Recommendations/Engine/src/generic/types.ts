import { UserInfo } from "@memberjunction/core";
import { RecommendationEntity, RecommendationItemEntity, RecommendationProviderEntity } from "@memberjunction/core-entities";

/**
 * Used to make requests to Recommendation providers
 */
export class RecommendationRequest {
    /**
     * The ID of the RecommendationRun record that will be created by the caller of a given provider. This must be created before a provider is called.
     * This is done automatically by the Recommendation Engine and can be populated manually if for some reason you want to call a provider directly outside
     * of the engine. This is a required field.
     */
    RunID: string;
  
    /**
     * Array of the requested recommendations. When preparing a batch of recommendations to request, do NOT set the RecommendationRunID or attempt
     * to save the Recommendation records. This will be done as the batch is processed. You cannot save a Recommendation record until a Run is created
     * which is done by the RecommendationEngineBase.Recommend() method.
     */
    Recommendations?: RecommendationEntity[] = [];
  
    /**
     * This is an optional field that can be passed in instead of the Recommendations field. If passed in,
     * the Recommendations field will be populated with Recommendation Entities whose Primary key value matches any of the RecordIDs passed in.
     */
    EntityAndRecordsInfo?: {
      /**
       * The name of the entity that the RecordIDs belong to
      */
      EntityName: string,
      /**
       * The RecordIDs to fetch recommendations for. Note that if the record IDs
       * 
       */
      RecordIDs: Array<string | number>,
    }
  
    ListID?: string;
  
    /**
     * The specific provider to use for the request. Leave this undefined if you want to use the default provider.
     */
    Provider?: RecommendationProviderEntity;
  
    /**
     * UserInfo object to use when applicable.
     */
    CurrentUser?: UserInfo;
  }
  
  /**
   * This response is generated for each Recommend() request
   */
  export class RecommendationResult {
    Success: boolean;
    Request: RecommendationRequest;
    ErrorMessage: string;
    RecommendationItems: RecommendationItemEntity[] = [];
  
    constructor(request: RecommendationRequest) {
      this.Request = request;
    }
  }