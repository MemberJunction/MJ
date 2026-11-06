import { describe, it, expect } from 'vitest';
import {
    ChosenIndexForSave,
    IndexesForSelection,
    SelectDatabase,
    SelectEmbeddingModel,
    SelectIndex,
    VectorIndexOption,
    VectorStoreSelection,
} from '../AI/components/vectors/vector-store-selection';

const PINECONE = 'DB-PINECONE';
const LOCAL = 'DB-LOCAL';
const GEMINI = 'MODEL-GEMINI';
const GTE = 'MODEL-GTE';

const contentIndex: VectorIndexOption = { ID: 'IDX-CONTENT', Name: 'More Cheese Content (Pinecone)', VectorDatabaseID: PINECONE, EmbeddingModelID: GEMINI };
const localGte: VectorIndexOption = { ID: 'IDX-LOCAL-GTE', Name: 'Default - SVS + gte-small (Local)', VectorDatabaseID: LOCAL, EmbeddingModelID: GTE };
const localGemini: VectorIndexOption = { ID: 'IDX-LOCAL-GEMINI', Name: 'people-gemini', VectorDatabaseID: LOCAL, EmbeddingModelID: GEMINI };
const indexes = [contentIndex, localGte, localGemini];

describe('vector store selection', () => {
    it('reproduces the reported case: switching to the local store drops the Pinecone index instead of saving it', () => {
        const start: VectorStoreSelection = { EmbeddingModelID: GEMINI, VectorDatabaseID: PINECONE, VectorIndexID: contentIndex.ID };
        const afterDb = SelectDatabase(start, indexes, LOCAL);
        const afterModel = SelectEmbeddingModel(afterDb, indexes, GTE);

        expect(afterModel).toEqual({ EmbeddingModelID: GTE, VectorDatabaseID: LOCAL, VectorIndexID: '' });
        expect(ChosenIndexForSave(afterModel, indexes)).toBeNull();
    });

    it('moves the model and database dropdowns to a chosen index', () => {
        const start: VectorStoreSelection = { EmbeddingModelID: GTE, VectorDatabaseID: LOCAL, VectorIndexID: '' };
        expect(SelectIndex(start, indexes, contentIndex.ID)).toEqual({
            EmbeddingModelID: GEMINI, VectorDatabaseID: PINECONE, VectorIndexID: contentIndex.ID,
        });
    });

    it('goes back to Auto when Auto or an unknown index is picked', () => {
        const start: VectorStoreSelection = { EmbeddingModelID: GEMINI, VectorDatabaseID: PINECONE, VectorIndexID: contentIndex.ID };
        expect(SelectIndex(start, indexes, '').VectorIndexID).toBe('');
        expect(SelectIndex(start, indexes, 'IDX-GONE')).toEqual({ EmbeddingModelID: GEMINI, VectorDatabaseID: PINECONE, VectorIndexID: '' });
    });

    it('keeps a chosen index when a dropdown change still matches it', () => {
        const start: VectorStoreSelection = { EmbeddingModelID: GEMINI, VectorDatabaseID: LOCAL, VectorIndexID: localGemini.ID };
        expect(SelectDatabase(start, indexes, LOCAL).VectorIndexID).toBe(localGemini.ID);
        expect(SelectEmbeddingModel(start, indexes, GEMINI).VectorIndexID).toBe(localGemini.ID);
    });

    it('drops a chosen index when the model changes away from it', () => {
        const start: VectorStoreSelection = { EmbeddingModelID: GEMINI, VectorDatabaseID: LOCAL, VectorIndexID: localGemini.ID };
        expect(SelectEmbeddingModel(start, indexes, GTE).VectorIndexID).toBe('');
    });

    it('offers only indexes that match both the database and the model shown', () => {
        expect(IndexesForSelection(indexes, LOCAL, GTE).map(i => i.ID)).toEqual([localGte.ID]);
        expect(IndexesForSelection(indexes, LOCAL, GEMINI).map(i => i.ID)).toEqual([localGemini.ID]);
        expect(IndexesForSelection(indexes, PINECONE, GTE)).toEqual([]);
    });

    it('compares IDs case-insensitively', () => {
        expect(IndexesForSelection(indexes, LOCAL.toLowerCase(), GTE.toLowerCase()).map(i => i.ID)).toEqual([localGte.ID]);
        const lower: VectorStoreSelection = { EmbeddingModelID: GTE.toLowerCase(), VectorDatabaseID: LOCAL.toLowerCase(), VectorIndexID: localGte.ID.toLowerCase() };
        expect(ChosenIndexForSave(lower, indexes)?.ID).toBe(localGte.ID);
    });

    it('never lets Save use a chosen index that disagrees with the dropdowns', () => {
        const stale: VectorStoreSelection = { EmbeddingModelID: GTE, VectorDatabaseID: LOCAL, VectorIndexID: contentIndex.ID };
        expect(ChosenIndexForSave(stale, indexes)).toBeNull();
    });
});
