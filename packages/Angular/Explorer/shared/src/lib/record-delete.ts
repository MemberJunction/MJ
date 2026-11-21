/**
 * Record deletion — what the workspace does once a record it may be showing is gone.
 *
 * A deleted record must not stay on screen as a blank form. The shell closes every
 * record tab that shows it, takes the user back to where the active one was opened
 * from (its origin, see {@link RecordSourceContext}), and removes the record from
 * any other tab's origin chain so no crumb leads back to it. These helpers are the
 * pure decisions behind that; the tab container owns the side effects.
 */
import { BaseEntity, BaseEntityEvent, ResolveEntityEventKey } from '@memberjunction/core';
import { MJEvent, MJEventType } from '@memberjunction/global';
import type { WorkspaceTab } from '@memberjunction/ng-base-application';
import { IsRecordsTabConfiguration, RecordSourceContext } from './record-open-style';

/** A record a delete event refers to, in the form record tabs store it. */
export interface DeletedRecordRef {
  /** The entity's Name, as stamped on record tabs (`configuration.Entity`) */
  EntityName: string;
  /** The record's primary key as a URL segment, as stamped on record tabs */
  RecordId: string;
  /** True when another session deleted it (a `remote-invalidate` with action `delete`) */
  Remote: boolean;
}

/** The `remote-invalidate` payload fields this module reads. */
interface RemoteInvalidatePayload {
  action?: string;
}

/**
 * The record a global event says was deleted, or null when the event is not a delete.
 *
 * Handles a local `delete` (raised by `BaseEntity.Delete()` after it succeeds, while the
 * entity still holds its key) and a remote one (a `remote-invalidate` whose action is
 * `delete`). A remote event whose key the server withheld names no record, so it is null.
 *
 * Read the key synchronously in the listener: right after raising `delete`, the entity
 * calls `NewRecord()` and its key is gone.
 */
export function GetDeletedRecordFromEvent(event: MJEvent): DeletedRecordRef | null {
  if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) {
    return null;
  }
  const entityEvent = event.args as BaseEntityEvent | undefined;
  if (!entityEvent) {
    return null;
  }
  let remote: boolean;
  if (entityEvent.type === 'delete') {
    remote = false;
  } else if (entityEvent.type === 'remote-invalidate') {
    const payload = entityEvent.payload as RemoteInvalidatePayload | undefined;
    if (payload?.action !== 'delete') {
      return null;
    }
    remote = true;
  } else {
    return null;
  }
  const entityName = entityEvent.baseEntity?.EntityInfo?.Name ?? entityEvent.entityName;
  const key = ResolveEntityEventKey(entityEvent);
  if (!entityName || !key?.HasValue) {
    return null;
  }
  return { EntityName: entityName, RecordId: key.ToURLSegment(), Remote: remote };
}

/** A single-field key in full URL-segment form ('Field|value'); group 1 is the value. */
const SINGLE_FIELD_URL_SEGMENT = /^[^|]+\|([^|]+)$/;

/**
 * A record id in the form used to compare it: trimmed, lower-case, and a single-field
 * key reduced to its bare value. `CompositeKey.ToURLSegment()` writes a single-field key
 * as just the value, but some tabs and URLs carry the full `Field|value` segment.
 */
export function NormalizeRecordIdForMatch(recordId: string): string {
  const trimmed = recordId.trim();
  const bare = SINGLE_FIELD_URL_SEGMENT.exec(trimmed)?.[1] ?? trimmed;
  return bare.toLowerCase();
}

/**
 * True when an entity/record-id pair names the given record.
 *
 * Case-insensitive on both parts: entity names are, and a UUID key can come back from the
 * database in a different case than the one in the tab's URL segment.
 */
export function RecordIdentityMatches(
  entityName: string | null | undefined,
  recordId: string | null | undefined,
  record: Pick<DeletedRecordRef, 'EntityName' | 'RecordId'>
): boolean {
  if (!entityName || !recordId) {
    return false;
  }
  return entityName.trim().toLowerCase() === record.EntityName.trim().toLowerCase()
    && NormalizeRecordIdForMatch(recordId) === NormalizeRecordIdForMatch(record.RecordId);
}

/** True when a workspace tab is a record tab showing the given record. */
export function RecordTabShowsRecord(tab: WorkspaceTab, record: Pick<DeletedRecordRef, 'EntityName' | 'RecordId'>): boolean {
  if (!IsRecordsTabConfiguration(tab.configuration)) {
    return false;
  }
  const entityName = tab.configuration?.['Entity'];
  const recordId = tab.resourceRecordId || tab.configuration?.['recordId'];
  return RecordIdentityMatches(
    typeof entityName === 'string' ? entityName : null,
    typeof recordId === 'string' ? recordId : null,
    record
  );
}

/**
 * The origin with the deleted record taken out of its chain.
 *
 * Wherever a link in the chain is the deleted record, it is replaced by that record's own
 * origin (`sourceParentOrigin`), so "back" skips the record that no longer exists and lands
 * where the user came from before it. Returns `undefined` when nothing is left, and the
 * SAME object when the chain never mentions the record, so callers can tell "unchanged".
 */
export function RemoveDeletedRecordFromOrigin(
  origin: RecordSourceContext | undefined,
  record: Pick<DeletedRecordRef, 'EntityName' | 'RecordId'>
): RecordSourceContext | undefined {
  if (!origin) {
    return undefined;
  }
  if (RecordIdentityMatches(origin.sourceRecordEntity, origin.sourceRecordId, record)) {
    return RemoveDeletedRecordFromOrigin(origin.sourceParentOrigin, record);
  }
  const parent = RemoveDeletedRecordFromOrigin(origin.sourceParentOrigin, record);
  if (parent === origin.sourceParentOrigin) {
    return origin;
  }
  return { ...origin, sourceParentOrigin: parent };
}

/**
 * True when the origin has a place `NavigationService.ReturnToRecordSource` can go back to:
 * a parent record, or a source app. A label-only origin (an overlay such as a conversation)
 * has nowhere to return to.
 */
export function OriginHasReturnTarget(origin: RecordSourceContext | null | undefined): origin is RecordSourceContext {
  if (!origin) {
    return false;
  }
  return !!(origin.sourceRecordEntity && origin.sourceRecordId) || !!origin.sourceAppId;
}

/**
 * The tab configuration keys that hold a record tab's origin. Used to rewrite an origin in
 * place: `WorkspaceStateManager.UpdateTabConfiguration` merges, so every key is cleared and
 * the new origin laid over it, or keys from the old origin would survive.
 */
export function OriginToTabConfiguration(origin: RecordSourceContext | undefined): Record<string, unknown> {
  return {
    sourceAppId: origin?.sourceAppId,
    sourceAppName: origin?.sourceAppName,
    sourceNavLabel: origin?.sourceNavLabel,
    sourceNavItemName: origin?.sourceNavItemName,
    sourceTabId: origin?.sourceTabId,
    sourceLabel: origin?.sourceLabel,
    sourceQueryParams: origin?.sourceQueryParams,
    sourceRecordEntity: origin?.sourceRecordEntity,
    sourceRecordId: origin?.sourceRecordId,
    sourceParentOrigin: origin?.sourceParentOrigin
  };
}
