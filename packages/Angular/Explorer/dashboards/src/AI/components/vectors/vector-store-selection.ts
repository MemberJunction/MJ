/**
 * The Vectors tab's "where do this document's vectors go" choice: an embedding model, a vector
 * database and an index. The three dropdowns must always show what Save will store.
 *
 * They did not. Save used a chosen index's database and model in place of the dropdowns' values,
 * and the index stayed chosen when the database or model dropdown changed (the index list was
 * filtered to the new database, so the stale choice was no longer even visible). With the first
 * index pre-selected on load, a document saved with "gte-small" and the in-memory store showing
 * was stored with another index's Pinecone database and Gemini model.
 *
 * These functions keep the three consistent: an index is offered only when it matches both the
 * database and model shown, choosing one moves both dropdowns to its values, and changing either
 * dropdown drops an index that no longer matches back to Auto.
 */
import { UUIDsEqual } from '@memberjunction/global';

/** A vector index as the Vectors tab lists it. */
export interface VectorIndexOption {
    ID: string;
    Name: string;
    VectorDatabaseID: string;
    EmbeddingModelID: string;
}

/** The three dropdowns' values. An empty `VectorIndexID` is "Auto (create/find matching index)". */
export interface VectorStoreSelection {
    EmbeddingModelID: string;
    VectorDatabaseID: string;
    VectorIndexID: string;
}

/** True when the index stores vectors in this database with this embedding model. */
export function IndexMatchesSelection(index: VectorIndexOption, databaseID: string, embeddingModelID: string): boolean {
    return UUIDsEqual(index.VectorDatabaseID, databaseID) && UUIDsEqual(index.EmbeddingModelID, embeddingModelID);
}

/**
 * The indexes the Vector Index dropdown offers: those in the selected database built with the
 * selected embedding model. An index built with another model would override the model shown.
 */
export function IndexesForSelection(indexes: VectorIndexOption[], databaseID: string, embeddingModelID: string): VectorIndexOption[] {
    return indexes.filter(i => IndexMatchesSelection(i, databaseID, embeddingModelID));
}

/** The selection after the user picks an index: the model and database dropdowns follow it. */
export function SelectIndex(selection: VectorStoreSelection, indexes: VectorIndexOption[], indexID: string): VectorStoreSelection {
    const index = indexID ? indexes.find(i => UUIDsEqual(i.ID, indexID)) : undefined;
    if (!index) {
        return { ...selection, VectorIndexID: '' };
    }
    return { EmbeddingModelID: index.EmbeddingModelID, VectorDatabaseID: index.VectorDatabaseID, VectorIndexID: index.ID };
}

/** The selection after the user changes the database: a chosen index from another database goes back to Auto. */
export function SelectDatabase(selection: VectorStoreSelection, indexes: VectorIndexOption[], databaseID: string): VectorStoreSelection {
    return keepIndexOnlyIfItMatches({ ...selection, VectorDatabaseID: databaseID }, indexes);
}

/** The selection after the user changes the model: a chosen index built with another model goes back to Auto. */
export function SelectEmbeddingModel(selection: VectorStoreSelection, indexes: VectorIndexOption[], embeddingModelID: string): VectorStoreSelection {
    return keepIndexOnlyIfItMatches({ ...selection, EmbeddingModelID: embeddingModelID }, indexes);
}

/**
 * The index Save may use as chosen: the selected one, only when it matches the database and model
 * shown. Null means Auto (find or create the index for that database and model).
 */
export function ChosenIndexForSave(selection: VectorStoreSelection, indexes: VectorIndexOption[]): VectorIndexOption | null {
    if (!selection.VectorIndexID) {
        return null;
    }
    const index = indexes.find(i => UUIDsEqual(i.ID, selection.VectorIndexID));
    return index && IndexMatchesSelection(index, selection.VectorDatabaseID, selection.EmbeddingModelID) ? index : null;
}

function keepIndexOnlyIfItMatches(selection: VectorStoreSelection, indexes: VectorIndexOption[]): VectorStoreSelection {
    return ChosenIndexForSave(selection, indexes) ? selection : { ...selection, VectorIndexID: '' };
}
