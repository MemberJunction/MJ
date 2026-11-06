import { BaseEntity, BaseEntityEvent, LogError, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { EntityVectorSyncer } from './entityVectorSync';

/** Resolves the user the cleanup runs as. */
export type DeleteCleanupUserResolver = () => Promise<UserInfo | undefined> | UserInfo | undefined;

/** What one delete event asks the listener to clean up. */
export type RecordVectorCleanupRequest = {
  EntityID: string;
  EntityName: string;
  /** The deleted record's ID in the form the sync stores (`CompositeKey.ToCompactURLSegment()`). */
  RecordID: string;
};

const ENTITY_RECORD_DOCUMENTS = 'MJ: Entity Record Documents';

/**
 * Removes a deleted record's vectors and `MJ: Entity Record Documents` rows when the record is
 * deleted (#406). The rows have no foreign key to the source record, so nothing cascades; without
 * this, search and duplicate detection keep returning the record until the next full sync prunes it.
 *
 * Listens to local BaseEntity `delete` events only: a `remote-invalidate` event is another server's
 * delete, and that server runs the cleanup. Entities with no active entity document cost one cached
 * lookup. The cleanup is fire-and-forget; a failure is logged, and the next full sync's prune removes
 * what is left.
 */
export class EntityVectorDeleteListener {
  /**
   * Turns a BaseEntity event into a cleanup request, or null when there is nothing to do. Reads the
   * key synchronously: the deleted entity is reset right after its delete event is raised.
   */
  public static CleanupRequestFor(ev: BaseEntityEvent): RecordVectorCleanupRequest | null {
    if (ev.type !== 'delete' || !ev.baseEntity) return null;
    const info = ev.baseEntity.EntityInfo;
    if (!info || info.Name === ENTITY_RECORD_DOCUMENTS) return null;
    const recordID = ev.baseEntity.PrimaryKey?.ToCompactURLSegment();
    if (!recordID) return null;
    return { EntityID: info.ID, EntityName: info.Name, RecordID: recordID };
  }

  /** True when the entity has at least one active entity document, i.e. may have stored vectors. */
  public static HasActiveEntityDocument(entityID: string): boolean {
    return KnowledgeHubMetadataEngine.Instance.EntityDocuments.some(
      d => d.Status === 'Active' && UUIDsEqual(d.EntityID, entityID)
    );
  }

  /**
   * Runs the cleanup for one request. Returns the number of Entity Record Documents removed.
   * Never throws.
   */
  public static async Cleanup(request: RecordVectorCleanupRequest, resolveUser: DeleteCleanupUserResolver): Promise<number> {
    try {
      const contextUser = await resolveUser();
      if (!contextUser) {
        LogError(`EntityVectorDeleteListener: no user to clean up vectors for ${request.EntityName} ${request.RecordID}`);
        return 0;
      }
      await KnowledgeHubMetadataEngine.Instance.Config(false, contextUser);
      if (!EntityVectorDeleteListener.HasActiveEntityDocument(request.EntityID)) {
        return 0;
      }
      const syncer = new EntityVectorSyncer();
      await syncer.Config(false, contextUser);
      return await syncer.RemoveRecordVectors(request.EntityID, [request.RecordID], contextUser);
    } catch (e) {
      LogError(`EntityVectorDeleteListener: cleanup failed for ${request.EntityName} ${request.RecordID}: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  /**
   * Subscribes to local BaseEntity events once per process. Returns an unsubscribe function.
   * @param resolveUser the user the cleanup runs as (a server passes its system user: the record is
   *   already deleted by an authorized user, and removing its derived index rows is housekeeping)
   */
  public static Subscribe(resolveUser: DeleteCleanupUserResolver): () => void {
    const subscription = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
      if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) return;
      const request = EntityVectorDeleteListener.CleanupRequestFor(event.args as BaseEntityEvent);
      if (request) {
        void EntityVectorDeleteListener.Cleanup(request, resolveUser);
      }
    });
    return () => subscription.unsubscribe();
  }
}
