import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { AIAgentEntityExtended, AIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentMatchResult, AgentEmbeddingMetadata } from '../types/AgentMatchResult';
import { EmbedTextResult } from '@memberjunction/ai';

/**
 * Utility service for agent embedding operations.
 * Uses agent data already loaded by AIEngine - no separate initialization needed.
 * All methods are static - no instance state required.
 *
 * @example
 * ```typescript
 * // Generate embeddings during AIEngine initialization
 * const entries = await AgentEmbeddingService.GenerateAgentEmbeddings(
 *   agents,
 *   (text) => aiEngine.EmbedTextLocal(text)
 * );
 *
 * // Find similar agents
 * const matches = await AgentEmbeddingService.FindSimilarAgents(
 *   vectorService,
 *   "Handle customer support",
 *   (text) => aiEngine.EmbedTextLocal(text),
 *   5,
 *   0.7
 * );
 * ```
 */
export class AgentEmbeddingService {
    /**
     * Generate embeddings for agents using provided embedding function.
     * Called by AIEngine during AdditionalLoading.
     *
     * @param agents - Array of agents (already loaded by AIEngine)
     * @param embedFunction - Function to generate embeddings (from AIEngine)
     * @returns Vector entries ready for loading into vector service
     */
    public static async GenerateAgentEmbeddings(
        agents: AIAgentEntityExtended[],
        embedFunction: (text: string) => Promise<{result: EmbedTextResult, model: AIModelEntityExtended} | null>
    ): Promise<VectorEntry<AgentEmbeddingMetadata>[]> {
        const entries: VectorEntry<AgentEmbeddingMetadata>[] = [];

        for (const agent of agents) {
            try {
                // Create embedding text from agent name and description
                const embeddingText = this.createEmbeddingText(agent);

                // Generate embedding using provided function
                const embeddingResult = await embedFunction(embeddingText);

                if (!embeddingResult || !embeddingResult.result || embeddingResult.result.vector.length === 0) {
                    console.error(`Failed to generate embedding for agent ${agent.Name}`);
                    continue;
                }

                entries.push({
                    key: agent.ID,
                    vector: embeddingResult.result.vector,
                    metadata: {
                        id: agent.ID,
                        name: agent.Name,
                        description: agent.Description || '',
                        systemPrompt: '',  // SystemPrompt not available on extended class
                        typeName: agent.Type || '',
                        status: agent.Status || 'Active',
                        invocationMode: agent.InvocationMode || 'Any',
                        defaultArtifactType: agent.DefaultArtifactType || undefined,
                        parentId: agent.ParentID || undefined
                    }
                });
            } catch (error) {
                console.error(`Error generating embedding for agent ${agent.Name}: ${error instanceof Error ? error.message : String(error)}`);
                // Continue with other agents
            }
        }

        return entries;
    }

    /**
     * Find agents similar to a given task description.
     *
     * @param vectorService - Vector service containing agent embeddings
     * @param taskDescription - The task description to match against agent capabilities
     * @param embedFunction - Function to generate embeddings (from AIEngine)
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching agents sorted by similarity score (highest first)
     *
     * @throws Error if embedding generation fails
     */
    public static async FindSimilarAgents(
        vectorService: SimpleVectorService<AgentEmbeddingMetadata>,
        taskDescription: string,
        embedFunction: (text: string) => Promise<{result: EmbedTextResult, model: AIModelEntityExtended} | null>,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<AgentMatchResult[]> {
        if (!taskDescription || taskDescription.trim().length === 0) {
            throw new Error('taskDescription cannot be empty');
        }

        if (topK < 1) {
            throw new Error('topK must be at least 1');
        }

        if (minSimilarity < 0 || minSimilarity > 1) {
            throw new Error('minSimilarity must be between 0 and 1');
        }

        try {
            // Generate embedding for the task description
            const queryEmbedding = await embedFunction(taskDescription);

            if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
                throw new Error('Failed to generate embedding for task description');
            }

            // Find nearest neighbors using cosine similarity
            const results = vectorService.FindNearest(
                queryEmbedding.result.vector,
                topK,
                minSimilarity,
                'cosine'  // Best for text embeddings
            );

            // Map to AgentMatchResult format
            return results.map(r => ({
                agentId: r.key,
                agentName: r.metadata?.name || 'Unknown',
                description: r.metadata?.description || '',
                similarityScore: r.score,
                systemPrompt: r.metadata?.systemPrompt,
                typeName: r.metadata?.typeName,
                status: r.metadata?.status,
                invocationMode: r.metadata?.invocationMode,
                defaultArtifactType: r.metadata?.defaultArtifactType,
                parentId: r.metadata?.parentId
            }));

        } catch (error) {
            console.error(`Error finding similar agents: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Find agents similar to a specific agent.
     *
     * @param vectorService - Vector service containing agent embeddings
     * @param agentId - The ID of the agent to find similar agents to
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching agents (excludes the source agent)
     *
     * @throws Error if agent not found in embeddings
     */
    public static FindRelatedAgents(
        vectorService: SimpleVectorService<AgentEmbeddingMetadata>,
        agentId: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): AgentMatchResult[] {
        if (!vectorService.Has(agentId)) {
            throw new Error(`Agent ${agentId} not found in embeddings`);
        }

        try {
            const results = vectorService.FindSimilar(
                agentId,
                topK,
                minSimilarity,
                'cosine'
            );

            return results.map(r => ({
                agentId: r.key,
                agentName: r.metadata?.name || 'Unknown',
                description: r.metadata?.description || '',
                similarityScore: r.score,
                systemPrompt: r.metadata?.systemPrompt,
                typeName: r.metadata?.typeName,
                status: r.metadata?.status,
                invocationMode: r.metadata?.invocationMode,
                parentId: r.metadata?.parentId
            }));

        } catch (error) {
            console.error(`Error finding related agents: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get the similarity score between two specific agents.
     *
     * @param vectorService - Vector service containing agent embeddings
     * @param agentId1 - First agent ID
     * @param agentId2 - Second agent ID
     * @returns Similarity score (0-1)
     *
     * @throws Error if either agent is not found
     */
    public static GetSimilarity(
        vectorService: SimpleVectorService<AgentEmbeddingMetadata>,
        agentId1: string,
        agentId2: string
    ): number {
        if (!vectorService.Has(agentId1)) {
            throw new Error(`Agent ${agentId1} not found in embeddings`);
        }

        if (!vectorService.Has(agentId2)) {
            throw new Error(`Agent ${agentId2} not found in embeddings`);
        }

        return vectorService.Similarity(agentId1, agentId2);
    }

    /**
     * Create the embedding text from agent properties.
     * Combines name and description with proper weighting.
     * @private
     */
    private static createEmbeddingText(agent: AIAgentEntityExtended): string {
        // Weight the agent name more heavily by repeating it
        // This ensures that name matches have higher similarity
        const parts = [
            agent.Name,
            agent.Name,  // Repeat for emphasis
            agent.Description || ''
        ];

        return parts.filter(p => p.trim().length > 0).join('. ');
    }
}
