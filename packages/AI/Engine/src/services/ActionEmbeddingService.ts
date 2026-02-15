import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { MJActionEntity } from '@memberjunction/core-entities';
import { ActionMatchResult, ActionEmbeddingMetadata } from '../types/ActionMatchResult';
import { EmbedTextResult } from '@memberjunction/ai';
import { AIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { LogError } from '@memberjunction/core';

/**
 * Utility service for action embedding operations.
 * Uses action data already loaded by AIEngine - no separate initialization needed.
 * All methods are static - no instance state required.
 *
 * Follows the same pattern as AgentEmbeddingService for consistency.
 *
 * @example
 * ```typescript
 * // Generate embeddings during AIEngine initialization
 * const entries = await ActionEmbeddingService.GenerateActionEmbeddings(
 *   actions,
 *   (text) => aiEngine.EmbedTextLocal(text)
 * );
 *
 * // Find similar actions
 * const matches = await ActionEmbeddingService.FindSimilarActions(
 *   vectorService,
 *   "Search the web for information",
 *   (text) => aiEngine.EmbedTextLocal(text),
 *   5,
 *   0.7
 * );
 * ```
 */
export class ActionEmbeddingService {
    /**
     * Generate embeddings for actions using provided embedding function.
     * Called by AIEngine during AdditionalLoading.
     *
     * @param actions - Array of actions (already loaded by AIEngine)
     * @param embedFunction - Function to generate embeddings (from AIEngine)
     * @returns Vector entries ready for loading into vector service
     */
    public static async GenerateActionEmbeddings(
        actions: MJActionEntity[],
        embedFunction: (text: string) => Promise<{result: EmbedTextResult, model: AIModelEntityExtended} | null>
    ): Promise<VectorEntry<ActionEmbeddingMetadata>[]> {
        const entries: VectorEntry<ActionEmbeddingMetadata>[] = [];

        for (const action of actions) {
            try {
                // Create embedding text from action name and description
                const embeddingText = this.createEmbeddingText(action);

                // Generate embedding using provided function
                const embeddingResult = await embedFunction(embeddingText);

                if (!embeddingResult || !embeddingResult.result || embeddingResult.result.vector.length === 0) {
                    LogError(`Failed to generate embedding for action ${action.Name}`);
                    continue;
                }

                entries.push({
                    key: action.ID,
                    vector: embeddingResult.result.vector,
                    metadata: {
                        id: action.ID,
                        name: action.Name,
                        description: action.Description || '',
                        categoryName: action.Category || null,
                        status: action.Status || 'Active',
                        driverClass: action.DriverClass || ''
                    }
                });
            } catch (error) {
                LogError(`Error generating embedding for action ${action.Name}: ${error instanceof Error ? error.message : String(error)}`);
                // Continue with other actions
            }
        }

        return entries;
    }

    /**
     * Find actions similar to a given task description.
     *
     * @param vectorService - Vector service containing action embeddings
     * @param taskDescription - The task description to match against action capabilities
     * @param embedFunction - Function to generate embeddings (from AIEngine)
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching actions sorted by similarity score (highest first)
     *
     * @throws Error if embedding generation fails
     */
    public static async FindSimilarActions(
        vectorService: SimpleVectorService<ActionEmbeddingMetadata>,
        taskDescription: string,
        embedFunction: (text: string) => Promise<{result: EmbedTextResult, model: AIModelEntityExtended} | null>,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): Promise<ActionMatchResult[]> {
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

            // Map to ActionMatchResult format
            return results.map(r => ({
                actionId: r.key,
                actionName: r.metadata?.name || 'Unknown',
                description: r.metadata?.description || '',
                similarityScore: r.score,
                categoryName: r.metadata?.categoryName,
                status: r.metadata?.status,
                driverClass: r.metadata?.driverClass
            }));

        } catch (error) {
            LogError(`Error finding similar actions: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Find actions similar to a specific action.
     *
     * @param vectorService - Vector service containing action embeddings
     * @param actionId - The ID of the action to find similar actions to
     * @param topK - Maximum number of results to return (default: 5)
     * @param minSimilarity - Minimum similarity score 0-1 (default: 0.5)
     * @returns Array of matching actions (excludes the source action)
     *
     * @throws Error if action not found in embeddings
     */
    public static FindRelatedActions(
        vectorService: SimpleVectorService<ActionEmbeddingMetadata>,
        actionId: string,
        topK: number = 5,
        minSimilarity: number = 0.5
    ): ActionMatchResult[] {
        if (!vectorService.Has(actionId)) {
            throw new Error(`Action ${actionId} not found in embeddings`);
        }

        try {
            const results = vectorService.FindSimilar(
                actionId,
                topK,
                minSimilarity,
                'cosine'
            );

            return results.map(r => ({
                actionId: r.key,
                actionName: r.metadata?.name || 'Unknown',
                description: r.metadata?.description || '',
                similarityScore: r.score,
                categoryName: r.metadata?.categoryName,
                status: r.metadata?.status,
                driverClass: r.metadata?.driverClass
            }));

        } catch (error) {
            LogError(`Error finding related actions: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    /**
     * Get the similarity score between two specific actions.
     *
     * @param vectorService - Vector service containing action embeddings
     * @param actionId1 - First action ID
     * @param actionId2 - Second action ID
     * @returns Similarity score (0-1)
     *
     * @throws Error if either action is not found
     */
    public static GetSimilarity(
        vectorService: SimpleVectorService<ActionEmbeddingMetadata>,
        actionId1: string,
        actionId2: string
    ): number {
        if (!vectorService.Has(actionId1)) {
            throw new Error(`Action ${actionId1} not found in embeddings`);
        }

        if (!vectorService.Has(actionId2)) {
            throw new Error(`Action ${actionId2} not found in embeddings`);
        }

        return vectorService.Similarity(actionId1, actionId2);
    }

    /**
     * Create the embedding text from action properties.
     * Combines name and description with proper weighting.
     * @private
     */
    private static createEmbeddingText(action: MJActionEntity): string {
        // Weight the action name more heavily by repeating it
        // This ensures that name matches have higher similarity
        const parts = [
            action.Name,
            action.Name,  // Repeat for emphasis
            action.Description || ''
        ];

        return parts.filter(p => p.trim().length > 0).join('. ');
    }
}
