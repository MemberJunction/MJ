import { RecommendationEntity } from "@memberjunction/core-entities";
import { RecommendationRequest, RecommendationResult } from "./Engine";



/**
 * Base class for all recommendation providers
 */
export abstract class RecommendationProviderBase {
    public abstract Recommend(request: RecommendationRequest): Promise<RecommendationResult>;
}