import type { RecommendationRequest, RecommendationResult } from './Engine';

/**
 * Base class for all recommendation providers
 */
export abstract class RecommendationProviderBase {
  /**
   * For each entry in the request.Recommendations array, the provider's external API is called to
   * produce zero or more {@link RecommendationItemEntity} records.
   *
   * @param request - The Recommendations to request from this provider
   */
  public abstract Recommend(request: Pick<RecommendationRequest, 'Recommendations'>): Promise<RecommendationResult>;
}
