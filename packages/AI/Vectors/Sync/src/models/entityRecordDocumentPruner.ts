import type { VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { EntityInfo, EntityPermissionType, IMetadataProvider, LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import type { MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';

/** The `MJ: Entity Record Documents` columns the pruner reads. */
export type PrunableRecordDocument = {
  ID: string;
  RecordID: string;
  VectorID: string | null;
  /** Used to keep the newest row when several exist for one record. */
  __mj_UpdatedAt?: Date | string | null;
};

/** Where a document's vectors live, so the pruner can remove them along with the rows. */
export type RecordDocumentVectorTarget = {
  /** The vector database driver; a read-only driver (it reads the rows themselves) gets no vector call. */
  VectorDB: VectorDBBase | null;
  /** Provider-side index name. */
  IndexName?: string;
  /** The vector index's parsed `ProviderConfig` (namespace routing, etc.). */
  ProviderConfig?: Record<string, unknown>;
};

/** Outcome of {@link RemoveRecordDocuments}. Failures are logged and counted, never thrown. */
export type RemoveRecordDocumentsResult = {
  /** Entity Record Document rows deleted. */
  RemovedRows: number;
  /** Vector IDs sent to the vector database's DeleteRecords. */
  RemovedVectors: number;
  /** Rows or vector batches that failed. */
  Failed: number;
};

/** Which stored rows a full run removes, and which vector IDs must survive because a kept row uses them. */
export type RecordDocumentPrunePlan = {
  Remove: PrunableRecordDocument[];
  /** Vector IDs of rows that stay; a removed row sharing one does not take the vector with it. */
  KeepVectorIDs: Set<string>;
};

const REMOVE_BATCH_SIZE = 100;
const ENTITY_RECORD_DOCUMENTS = 'MJ: Entity Record Documents';

/**
 * Why the user may not remove Entity Record Documents (and their vectors), or null when they may.
 * Vectors are deleted before their rows, so the row-level Delete permission check in BaseEntity
 * comes too late to protect them; this check runs first. A user whose deletes of Entity Record
 * Documents are row-filtered is refused as well: BaseEntity would refuse some of the row deletes
 * only after their vectors were gone.
 */
export function RecordDocumentDeleteDenial(user: UserInfo, provider?: IMetadataProvider): string | null {
  const md: IMetadataProvider = provider ?? Metadata.Provider;
  const erdEntity = md.Entities.find(e => e.Name === ENTITY_RECORD_DOCUMENTS);
  if (!erdEntity) {
    return `entity "${ENTITY_RECORD_DOCUMENTS}" not found`;
  }
  if (!erdEntity.GetUserPermisions(user).CanDelete) {
    return `user ${user.Email ?? user.ID} cannot delete ${ENTITY_RECORD_DOCUMENTS}`;
  }
  if (erdEntity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Delete, '').length > 0) {
    return `deletes of ${ENTITY_RECORD_DOCUMENTS} are row-filtered for user ${user.Email ?? user.ID}`;
  }
  return null;
}

/**
 * Why a completed run may not prune orphans for the user, or null when it may. The run pages the
 * source entity as that user, so a user whose reads of the source entity are row-filtered (role
 * row-level security or an API-key row filter) pages only part of it, and every record outside the
 * filter would look orphaned. The prune also needs Delete permission on Entity Record Documents.
 */
export function OrphanPruneDenial(sourceEntity: EntityInfo, user: UserInfo, provider?: IMetadataProvider): string | null {
  const deleteDenial = RecordDocumentDeleteDenial(user, provider);
  if (deleteDenial) {
    return deleteDenial;
  }
  if (sourceEntity.GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '').length > 0) {
    return `reads of "${sourceEntity.Name}" are row-filtered for user ${user.Email ?? user.ID}, so the run did not see every record`;
  }
  return null;
}

const DELETE_CONCURRENCY = 10;

function updatedTime(row: PrunableRecordDocument): number {
  const v = row.__mj_UpdatedAt;
  if (v == null) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Splits rows that share a RecordID into the newest one (kept) and the rest (duplicates).
 * Rows are grouped by RecordID as stored (record IDs are compact composite-key strings).
 */
export function SplitDuplicateRecordDocuments<T extends PrunableRecordDocument>(rows: ReadonlyArray<T>): { Keep: Map<string, T>; Duplicates: T[] } {
  const keep = new Map<string, T>();
  const duplicates: T[] = [];
  for (const row of rows) {
    const key = String(row.RecordID);
    const current = keep.get(key);
    if (!current) {
      keep.set(key, row);
    } else if (updatedTime(row) > updatedTime(current)) {
      duplicates.push(current);
      keep.set(key, row);
    } else {
      duplicates.push(row);
    }
  }
  return { Keep: keep, Duplicates: duplicates };
}

/**
 * Plans the end-of-run prune for one entity document: rows whose RecordID the run did not page
 * (deleted, re-keyed, or now excluded by the document's record filter), plus duplicate rows for
 * one RecordID (the newest stays).
 *
 * @param stored every stored Entity Record Document row for the document
 * @param seenRecordIDs every RecordID the completed run paged
 */
export function PlanRecordDocumentPrune(stored: ReadonlyArray<PrunableRecordDocument>, seenRecordIDs: ReadonlySet<string>): RecordDocumentPrunePlan {
  const { Keep, Duplicates } = SplitDuplicateRecordDocuments(stored);
  const remove: PrunableRecordDocument[] = [...Duplicates];
  const keepVectorIDs = new Set<string>();
  for (const [recordID, row] of Keep) {
    if (seenRecordIDs.has(recordID)) {
      if (row.VectorID) keepVectorIDs.add(row.VectorID);
    } else {
      remove.push(row);
    }
  }
  return { Remove: remove, KeepVectorIDs: keepVectorIDs };
}

/**
 * Removes Entity Record Document rows and their vectors, in batches of 100.
 *
 * For each batch, the rows' stored `VectorID`s go to `VectorDB.DeleteRecords` (rows without one, and
 * IDs in `keepVectorIDs`, are skipped), then the rows are deleted. A read-only driver
 * (`SimpleVectorServiceProvider`) holds no vectors of its own — it reads these rows — so only the
 * rows are deleted; its index cache drops them on the delete event.
 *
 * Every caller goes through {@link RecordDocumentDeleteDenial} here: a user it refuses removes
 * nothing, and every row counts as failed.
 *
 * Failures are logged and counted, never thrown: callers run this as cleanup after the work that
 * matters has finished.
 */
export async function RemoveRecordDocuments(
  rows: ReadonlyArray<PrunableRecordDocument>,
  target: RecordDocumentVectorTarget,
  contextUser: UserInfo,
  provider?: IMetadataProvider,
  keepVectorIDs?: ReadonlySet<string>
): Promise<RemoveRecordDocumentsResult> {
  const result: RemoveRecordDocumentsResult = { RemovedRows: 0, RemovedVectors: 0, Failed: 0 };
  const md: IMetadataProvider = provider ?? Metadata.Provider;
  if (rows.length === 0) {
    return result;
  }
  const denial = RecordDocumentDeleteDenial(contextUser, md);
  if (denial) {
    LogStatus(`RemoveRecordDocuments: removed nothing: ${denial}`);
    result.Failed = rows.length;
    return result;
  }
  const deleteVectors = target.VectorDB != null && !target.VectorDB.IsReadOnly;

  for (let i = 0; i < rows.length; i += REMOVE_BATCH_SIZE) {
    const batch = rows.slice(i, i + REMOVE_BATCH_SIZE);

    if (deleteVectors && target.VectorDB) {
      const vectorIDs = [...new Set(batch.map(r => r.VectorID).filter((v): v is string => !!v && !keepVectorIDs?.has(v)))];
      if (vectorIDs.length > 0) {
        const records: VectorRecord[] = vectorIDs.map(id => ({ id, values: [] }));
        try {
          const response = await target.VectorDB.DeleteRecords(records, target.IndexName, target.ProviderConfig);
          if (response.success) {
            result.RemovedVectors += vectorIDs.length;
          } else {
            result.Failed++;
            LogError(`RemoveRecordDocuments: vector delete failed for ${vectorIDs.length} vector(s): ${response.message}`);
          }
        } catch (e) {
          result.Failed++;
          LogError(`RemoveRecordDocuments: vector delete threw for ${vectorIDs.length} vector(s): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    for (let j = 0; j < batch.length; j += DELETE_CONCURRENCY) {
      const chunk = batch.slice(j, j + DELETE_CONCURRENCY);
      const outcomes = await Promise.all(chunk.map(row => deleteRecordDocumentRow(row.ID, md, contextUser)));
      for (const ok of outcomes) {
        if (ok) result.RemovedRows++; else result.Failed++;
      }
    }
  }
  return result;
}

async function deleteRecordDocumentRow(id: string, md: IMetadataProvider, contextUser: UserInfo): Promise<boolean> {
  try {
    const erd = await md.GetEntityObject<MJEntityRecordDocumentEntity>('MJ: Entity Record Documents', contextUser);
    const loaded = await erd.Load(id);
    if (!loaded) {
      // Already gone (another run or server removed it): nothing left to do.
      return true;
    }
    const deleted = await erd.Delete();
    if (!deleted) {
      LogError(`RemoveRecordDocuments: could not delete Entity Record Document ${id}: ${erd.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return deleted;
  } catch (e) {
    LogError(`RemoveRecordDocuments: error deleting Entity Record Document ${id}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
