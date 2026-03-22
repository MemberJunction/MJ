/**
 * Metadata about a query for embedding purposes
 */
export interface QueryEmbeddingMetadata {
    id: string;
    name: string;
    description: string;
    category: string;
    status: string;
    reusable: boolean;
    sql: string;
    userQuestion: string;
}

/**
 * Result from query similarity matching
 */
export interface QueryMatchResult {
    /**
     * The query's unique ID
     */
    queryId: string;

    /**
     * The query's name
     */
    queryName: string;

    /**
     * The query's description
     */
    description: string;

    /**
     * The query's category name
     */
    category: string;

    /**
     * Cosine similarity score (0-1, where 1 = perfect match)
     */
    similarityScore: number;

    /**
     * Query status (Approved, Pending, etc.)
     */
    status: string;

    /**
     * Whether the query is marked as reusable for composition
     */
    reusable: boolean;

    /**
     * The query's SQL (only populated when requested)
     */
    sql?: string;

    /**
     * The natural language question this query answers
     */
    userQuestion?: string;
}
