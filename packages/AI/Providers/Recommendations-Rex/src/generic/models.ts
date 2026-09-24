import { UserInfo } from "@memberjunction/core";

export type RasaResponse<T = Record<string, any>> = {
    code: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    status_code: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    metadata: {  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        errors: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        next_link: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        record_count: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        request: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        response_time: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        timestamp: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        token_expiration: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        total_community_count: number | null,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        total_query_count: number | null,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    },
    request?: Record<string, any>,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    results: T[],  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
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
    created: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    engine: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    id: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    model: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    source: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    type: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    vector_id: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    version: string  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type RecommendationResponse = {
    engine: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    version: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    model: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    score: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    source: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    type: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    vector_id: string  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
    type: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    filters: { type: string, max_results: number } []  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};
