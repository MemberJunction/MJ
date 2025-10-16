import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView } from '@memberjunction/core';
import { AIAgentEntityExtended } from '@memberjunction/core-entities';
import { AgentMatchResult, AgentEmbeddingMetadata } from '../types/AgentMatchResult';

/**
 * Service for finding similar agents using embedding-based semantic search.
 *
 * This service pre-computes embeddings for all agents and provides fast similarity search
 * using local embedding models and in-memory vector storage.
 *
 * @example
 * ```typescript
 * const service = new AgentEmbeddingService();
 * await service.initialize(contextUser);
 *
 * const matches = await service.findSimilarAgents(
 *   "Handle customer support inquiries",
 *   5,  // top 5
 *   0.7 // minimum 70% similarity
 * );
 * ```
 */
export class AgentEmbeddingService {
    private vectorService: SimpleVectorService<AgentEmbeddingMetadata>;
    private aiEngine: AIEngine;
    private initialized: boolean = false;
    private agentCount: number = 0;

    constructor() {
        this.vectorService = new SimpleVectorService();
        this.aiEngine = AIEngine.Instance;
    }

    /**
     * Initialize the service by loading all agents and computing their embeddings.
     *
     * This is a one-time operation that should be called at server startup or
     * before the first use of findSimilarAgents.
     *
     * @param contextUser - The user context for database access
     * @param includeInactive - Whether to include inactive agents (default: false)
     */
    public async initialize(contextUser?: any, includeInactive: boolean = false): Promise<void> {
        if (this.initialized) {
            console.log('AgentEmbeddingService already initialized');
            return;
        }

        const startTime = Date.now();
        console.log('AgentEmbeddingService: Initializing agent embeddings...');

        try {
            // Load all agents
            const rv = new RunView();
            const filter = includeInactive ? '' : "Status = 'Active'";
            const result = await rv.RunView<AIAgentEntityExtended>({
                EntityName: 'AI Agents',
                ExtraFilter: filter,
                OrderBy: 'Name',
                MaxRows: 10000,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success || !result.Results) {
                throw new Error(`Failed to load agents: ${result.ErrorMessage || 'Unknown error'}`);
            }

            const agents = result.Results;
            const entries: VectorEntry<AgentEmbeddingMetadata>[] = [];

            // Generate embeddings for each agent
            for (const agent of agents) {
                try {
                    // Create embedding text from agent name and description
                    const embeddingText = this.createEmbeddingText(agent);

                    // Generate embedding using local model
                    const embeddingResult = await this.aiEngine.EmbedTextLocal(embeddingText);

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
                            status: agent.Status || 'Active'
                        }
                    });
                } catch (error) {
                    console.error(`Error generating embedding for agent ${agent.Name}: ${error instanceof Error ? error.message : String(error)}`);
                    // Continue with other agents
                }
            }

            // Load vectors into the service
            this.vectorService.LoadVectors(entries);
            this.agentCount = entries.length;
            this.initialized = true;

            const duration = Date.now() - startTime;
            console.log(`AgentEmbeddingService: Loaded embeddings for ${this.agentCount} agents in ${duration}ms`);

        } catch (error) {
            console.error(`Failed to initialize AgentEmbeddingService: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Find agents similar to a given task description.
     *
     * @param taskDescription - The task description to match against agent capabilities
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching agents sorted by similarity score (highest first)
     *
     * @throws Error if service is not initialized
     */
    public async findSimilarAgents(
        taskDescription: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<AgentMatchResult[]> {
        if (!this.initialized) {
            throw new Error('AgentEmbeddingService not initialized. Call initialize() first.');
        }

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
            const queryEmbedding = await this.aiEngine.EmbedTextLocal(taskDescription);

            if (!queryEmbedding || !queryEmbedding.result || queryEmbedding.result.vector.length === 0) {
                throw new Error('Failed to generate embedding for task description');
            }

            // Find nearest neighbors using cosine similarity
            const results = this.vectorService.FindNearest(
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
                status: r.metadata?.status
            }));

        } catch (error) {
            console.error(`Error finding similar agents: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Find agents similar to a specific agent.
     *
     * @param agentId - The ID of the agent to find similar agents to
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching agents (excludes the source agent)
     *
     * @throws Error if service is not initialized or agent not found
     */
    public async findRelatedAgents(
        agentId: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<AgentMatchResult[]> {
        if (!this.initialized) {
            throw new Error('AgentEmbeddingService not initialized. Call initialize() first.');
        }

        if (!this.vectorService.Has(agentId)) {
            throw new Error(`Agent ${agentId} not found in embeddings`);
        }

        try {
            const results = this.vectorService.FindSimilar(
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
                status: r.metadata?.status
            }));

        } catch (error) {
            console.error(`Error finding related agents: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get the similarity score between two specific agents.
     *
     * @param agentId1 - First agent ID
     * @param agentId2 - Second agent ID
     * @returns Similarity score (0-1)
     *
     * @throws Error if either agent is not found
     */
    public getSimilarity(agentId1: string, agentId2: string): number {
        if (!this.initialized) {
            throw new Error('AgentEmbeddingService not initialized. Call initialize() first.');
        }

        if (!this.vectorService.Has(agentId1)) {
            throw new Error(`Agent ${agentId1} not found in embeddings`);
        }

        if (!this.vectorService.Has(agentId2)) {
            throw new Error(`Agent ${agentId2} not found in embeddings`);
        }

        return this.vectorService.Similarity(agentId1, agentId2);
    }

    /**
     * Check if the service is initialized.
     */
    public get isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get the number of agents loaded in the service.
     */
    public get loadedAgentCount(): number {
        return this.agentCount;
    }

    /**
     * Create the embedding text from agent properties.
     * Combines name and description with proper weighting.
     */
    private createEmbeddingText(agent: AIAgentEntityExtended): string {
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
