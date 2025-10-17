/**
 * Result from agent similarity matching
 */
export interface AgentMatchResult {
    /**
     * The agent's unique ID
     */
    agentId: string;

    /**
     * The agent's name
     */
    agentName: string;

    /**
     * The agent's description
     */
    description: string;

    /**
     * Cosine similarity score (0-1, where 1 = perfect match)
     */
    similarityScore: number;

    /**
     * Agent's system prompt (optional)
     */
    systemPrompt?: string;

    /**
     * Agent type name (optional)
     */
    typeName?: string;

    /**
     * Agent status (optional)
     */
    status?: string;
}

/**
 * Metadata about an agent for embedding purposes
 */
export interface AgentEmbeddingMetadata {
    id: string;
    name: string;
    description?: string;
    systemPrompt?: string;
    typeName?: string;
    status?: string;
}
