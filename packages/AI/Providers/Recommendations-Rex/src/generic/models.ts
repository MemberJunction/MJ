import { UserInfo } from "@memberjunction/global";

export type RasaResponse<T = Record<string, any>> = {
    code: number,
    status_code: number,
    metadata: {
        errors: string,
        next_link: string,
        record_count: number,
        request: string,
        response_time: number,
        timestamp: number,
        token_expiration: number,
        total_community_count: number | null,
        total_query_count: number | null,
    },
    request?: Record<string, any>,
    results: T[],
};

export type RasaTokenResponse = {
    'rasa-token': string
};

export type GetEmbeddingParams = {
    /**
     * Access token received from the /tokens endpoint
     */
    AccessToken: string,
    /**
     * Identifier for an entity
     */
    EntityID: string,
    /**
     * Entity type
     */
    EntityType: 'article' | 'person' | 'session' | 'others',
    /**
     * Data source for locating the entity
     */
    Source: 'rasa' | 'mj.pinecone'
    /**
     * Optionally exclude embedding results in the API response
     */
    ExcludeEmbeddings?: boolean
};

export type GetEmbeddingResponse = {
    created: string,
    engine: string,
    id: string,
    model: string,
    source: string,
    type: string,
    vector_id: string,
    version: string
};

export type RecommendationResponse = {
    engine: string, 
    version: string, 
    id: string,
    model: string,
    score: number,
    source: string,
    type: string, 
    vector_id: string
};

export type GetRecommendationParams = {
    Options: RecommendContextData, 
    AccessToken: string, 
    VectorID: string,
    ErrorListID: string,
    CurrentUser?: UserInfo
};

export type GetRecommendationResults = {
    Recommendations: RecommendationResponse[] | null,
    ErrorMessage?: string
};

export type RecommendContextData = {
    EntityDocumentID: string,
    TypeMap: Record<string, string>
    type: string,
    filters: { type: string, max_results: number } []
};
