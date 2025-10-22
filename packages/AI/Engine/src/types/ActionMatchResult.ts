/**
 * Metadata stored with each action's vector embedding.
 * Used for filtering and result formatting.
 */
export interface ActionEmbeddingMetadata {
    /**
     * Unique identifier for the action
     */
    id: string;

    /**
     * Action name
     */
    name: string;

    /**
     * Action description (used in embedding generation)
     */
    description: string;

    /**
     * Category name for grouping/filtering
     */
    categoryName: string | null;

    /**
     * Action status (Active, Disabled, etc.)
     */
    status: string;

    /**
     * Driver class name for the action
     */
    driverClass: string;
}

/**
 * Result from semantic action search.
 * Returned by FindSimilarActions with similarity scores.
 */
export interface ActionMatchResult {
    /**
     * Unique identifier for the action
     */
    actionId: string;

    /**
     * Action name
     */
    actionName: string;

    /**
     * Action description
     */
    description: string;

    /**
     * Cosine similarity score (0-1)
     * Higher scores indicate better matches
     */
    similarityScore: number;

    /**
     * Category name for the action
     */
    categoryName?: string | null;

    /**
     * Action status
     */
    status?: string;

    /**
     * Driver class name
     */
    driverClass?: string;
}
