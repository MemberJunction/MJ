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

    /**
     * Agent invocation mode - controls how agent can be called (optional)
     * Values: 'Any', 'Top-Level', 'Sub-Agent'
     */
    invocationMode?: string;

    /**
     * Name of the default artifact type this agent produces (optional)
     * NULL if agent doesn't produce artifacts (orchestration/utility agents)
     * Examples: "Research Content", "Report", "Diagram"
     */
    defaultArtifactType?: string;
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
    /**
     * Agent invocation mode - controls how agent can be called
     * Values: 'Any', 'Top-Level', 'Sub-Agent'
     */
    invocationMode?: string;

    /**
     * Name of the default artifact type this agent produces
     * NULL if agent doesn't produce artifacts
     */
    defaultArtifactType?: string;
}
