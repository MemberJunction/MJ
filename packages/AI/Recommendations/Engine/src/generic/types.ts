import { UserInfo } from "@memberjunction/core";
import { MJRecommendationEntity, MJRecommendationItemEntity, MJRecommendationProviderEntity, MJRecommendationRunEntity } from "@memberjunction/core-entities";

/**
 * Used to make requests to Recommendation providers
 */
export class RecommendationRequest<T = Record<string, any>> {
    /**
     * The ID of the RecommendationRun record that will be created by the caller of a given provider. This must be created before a provider is called.
     * This is done automatically by the Recommendation Engine and can be populated manually if for some reason you want to call a provider directly outside
     * of the engine. This is a required field.
     */
    RunID?: string;
  
    /**
     * Array of the requested recommendations. When preparing a batch of recommendations to request, do NOT set the RecommendationRunID or attempt
     * to save the Recommendation records. This will be done as the batch is processed. You cannot save a Recommendation record until a Run is created
     * which is done by the RecommendationEngineBase.Recommend() method.
     */
    Recommendations?: MJRecommendationEntity[] = [];
  
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
        RecordIDs: Array<string | number>
    }
  
    ListID?: string;
  
    /**
     * The specific provider to use for the request. Leave this undefined if you want to use the default provider.
     */
    Provider?: MJRecommendationProviderEntity;
  
    /**
     * UserInfo object to use when applicable.
     */
    CurrentUser?: UserInfo;

    /**
     * Additional options to pass to the provider
     */
    Options?: T;

    /**
     * If true, creates a list that will contain additional informaton regarding errors
     * that may occur during the recommendation run
     */
    CreateErrorList?: boolean;

    /**
     * The ID of the error list, if one was created
     */
    ErrorListID?: string;
}
  
/**
 * This response is generated for each Recommend() request
 */
export class RecommendationResult {
    Request: RecommendationRequest;
    /**
     * The Recommendation Run entity that was created by the recommendation engine
     */
    RecommendationRun?: MJRecommendationRunEntity;
    /**
     * The Recommendation Item Entities that were created by the recommendation provider
     */
    RecommendationItems?: MJRecommendationItemEntity[] = [];
    Success: boolean;
    ErrorMessage: string;

    constructor(request: RecommendationRequest) {
        this.Request = request;
        this.Success = true;
        this.ErrorMessage = "";
    }

    /**
     * Appends the provided warningMessage param to the ErrorMessage property,
     * with "Warning: " prepended to the message and a newline character appended to the end.
     * The value of the Success property is not changed.
     */
    AppendWarning(warningMessage: string) {
        this.ErrorMessage += `Warning: ${warningMessage} \n`;
    }

    /**
     * Appends the provided errorMessage param to the ErrorMessage property,
     * with "Error: " prepended to the message and a newline character appended to the end.
     * Also sets the Success property to false.
     */
    AppendError(errorMessage: string) {
        this.Success = false;
        this.ErrorMessage += `Error: ${errorMessage} \n`;
    }

    /**
     * Returns the ErrorMessage property as an array of strings.
     * Useful in the event multiple errors or warnings were produced
     * during the recommendation run.
     */
    GetErrorMessages(): string[] {
        return this.ErrorMessage.split('\n');
    }
}