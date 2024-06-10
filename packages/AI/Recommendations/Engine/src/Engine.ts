import { BaseEngine, UserInfo } from '@memberjunction/core';
import { RecommendationEntity, RecommendationProviderEntity, RecommendationRunEntity } from '@memberjunction/core-entities';


/**
 * Used to make requests to providers
 */
export class RecommendationRequest {
    /**
     * Array of the requested recommendations
     */
    Recommendations: RecommendationEntity[] = [];

    /**
     * The specific provider to use for the request. Leave this undefined if you want to use the default recommendation. 
     */
    Provider?: RecommendationProviderEntity;
}

/**
 * This response is generated for each Recommend() request
 */
export class RecommendationResult {
    Success: boolean;
    Request: RecommendationRequest;
    ErrorMessage: string;

    constructor (request: RecommendationRequest) {
        this.Request = request;
    }
}

/**
 * Engine class to be used for running all recommendation requests
 */
export class RecommendationEngineBase extends BaseEngine<RecommendationEngineBase> {

    private _RecommendationProviders: RecommendationProviderEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const params = [
            {
                PropertyName: '_RecommendationProviders',
                EntityName: 'Recommendation Providers'
            }
        ];
        return await this.Load(params, forceRefresh, contextUser);        
    }

    /**
     * Call this method with a provider and a request and a result will be generated 
     * @param request 
     */
    public async Recommend(request: RecommendationRequest): Promise<RecommendationRunEntity> {
        throw ("not implemented")
    }
}