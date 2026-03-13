import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';

/**
 * Metadata stored with each note embedding in the vector service.
 * Includes the full entity to avoid re-loading from database.
 */
export interface NoteEmbeddingMetadata {
    id: string;
    agentId: string | null;
    userId: string | null;
    companyId: string | null;
    type: string;
    noteText: string;
    noteEntity: MJAIAgentNoteEntity;
}

/**
 * Result from semantic search for similar notes.
 * Returns full entity object to avoid database round-trip.
 */
export interface NoteMatchResult {
    note: MJAIAgentNoteEntity;
    similarity: number;
}
