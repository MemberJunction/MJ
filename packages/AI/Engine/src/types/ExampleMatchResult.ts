import { MJAIAgentExampleEntity } from '@memberjunction/core-entities';

/**
 * Metadata stored with each example embedding in the vector service.
 * Includes the full entity to avoid re-loading from database.
 */
export interface ExampleEmbeddingMetadata {
    id: string;
    agentId: string;
    userId: string | null;
    companyId: string | null;
    type: string;
    exampleInput: string;
    exampleOutput: string;
    successScore: number | null;
    exampleEntity: MJAIAgentExampleEntity;
}

/**
 * Result from semantic search for similar examples.
 * Returns full entity object to avoid database round-trip.
 */
export interface ExampleMatchResult {
    example: MJAIAgentExampleEntity;
    similarity: number;
}
