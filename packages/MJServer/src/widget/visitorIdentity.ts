/**
 * @fileoverview Returning-visitor identity resolution + merge (RV4) and "forget me" (RV5).
 *
 * A widget visitor starts anonymous: their memory (recap notes) is filed under the polymorphic pair
 * `(MJ: Conversations entity, conversation.ID)` and chained across visits by the durable `VisitorKey`
 * cookie (RV1/RV2). When the visitor later proves who they are — magic-link "verify it's you", or a
 * host-asserted identity — RV4 promotes that anonymous trail to a real, deployment-configurable record:
 *
 *   1. resolve the verified email → a polymorphic `(entityId, recordId)` pair (NOT assumed to be a
 *      User — {@link resolveIdentityByEmail} honors the per-deployment `widget.identityResolution`
 *      target so a CRM `Persons` row works as well as the core `Users` row),
 *   2. stamp `ResolvedEntityID/ResolvedRecordID` on every conversation that shares the visitor's key
 *      in this application (back-fill), and
 *   3. re-key the visitor's anonymous recap notes onto the resolved pair (merge), so the existing
 *      memory injector (which already filters by the PrimaryScope pair) now pulls the prior context
 *      via the resolved identity rather than the cookie chain.
 *
 * "Forget me" (RV5) is the inverse: archive the visitor's auto-generated memory and clear the
 * `VisitorKey` linkage so neither the cookie nor a resolved pair resolves their trail anymore.
 *
 * Everything here is BEST-EFFORT and multi-provider-safe (it takes the request/session
 * `IMetadataProvider`, never the global `Metadata`). A failure never blocks the auth flow.
 *
 * @module @memberjunction/server/widget
 */

import { RunView, UserInfo, LogError, LogStatus, type IMetadataProvider } from '@memberjunction/core';
import type { MJConversationEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';

const CONVERSATIONS_ENTITY = 'MJ: Conversations';
const AGENT_NOTES_ENTITY = 'MJ: AI Agent Notes';

/** A resolved polymorphic identity: the entity the visitor maps to, and that record's id. */
export interface ResolvedVisitorIdentity {
  entityId: string;
  recordId: string;
}

/** The deployment-configurable resolution target (defaults to the core `Users` entity keyed by `Email`). */
export interface IdentityResolutionTarget {
  entityName?: string;
  emailField?: string;
}

/**
 * Resolves a verified email to a polymorphic `(entityId, recordId)` pair via the deployment-configured
 * target (default: the `Users` entity keyed by `Email`). Returns undefined when no record matches — the
 * visitor simply stays anonymous. Never throws; email is escaped for the filter literal.
 */
export async function resolveIdentityByEmail(
  email: string,
  contextUser: UserInfo,
  provider: IMetadataProvider,
  target?: IdentityResolutionTarget,
): Promise<ResolvedVisitorIdentity | undefined> {
  try {
    const trimmed = (email ?? '').trim();
    if (!trimmed) {
      return undefined;
    }
    const entityName = target?.entityName?.trim() || 'Users';
    const emailField = target?.emailField?.trim() || 'Email';
    const entityId = provider.EntityByName(entityName)?.ID;
    if (!entityId) {
      LogError(`[VisitorIdentity] identity-resolution entity '${entityName}' not found in metadata.`);
      return undefined;
    }
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>(
      {
        EntityName: entityName,
        ExtraFilter: `${emailField} = '${trimmed.replace(/'/g, "''")}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      LogError(`[VisitorIdentity] identity lookup failed for '${entityName}.${emailField}': ${result.ErrorMessage}`);
      return undefined;
    }
    const recordId = result.Results?.[0]?.ID;
    return recordId ? { entityId, recordId } : undefined;
  } catch (e) {
    LogError(`[VisitorIdentity] resolveIdentityByEmail failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/** Loads every conversation sharing a VisitorKey within one application (entity objects, for mutation). */
async function loadVisitorConversations(
  visitorKey: string,
  applicationId: string,
  contextUser: UserInfo,
): Promise<MJConversationEntity[]> {
  const rv = new RunView();
  // visitorKey is validated base64url by the caller; applicationId is a server-trusted UUID.
  const result = await rv.RunView<MJConversationEntity>(
    {
      EntityName: CONVERSATIONS_ENTITY,
      ExtraFilter: `VisitorKey = '${visitorKey}' AND ApplicationID = '${applicationId.replace(/'/g, "''")}'`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success) {
    LogError(`[VisitorIdentity] failed to load visitor conversations: ${result.ErrorMessage}`);
    return [];
  }
  return result.Results ?? [];
}

/**
 * Promotes a visitor's anonymous trail to a resolved identity (RV4): stamps the resolved pair on every
 * conversation sharing the visitor's key in this application, then re-keys the visitor's anonymous
 * recap notes (those filed under `(MJ: Conversations, conversationId)`) onto the resolved pair. Idempotent
 * and best-effort — already-resolved conversations are skipped; per-record save failures are logged, not thrown.
 *
 * @returns the number of conversations stamped (0 when nothing matched the key).
 */
export async function mergeVisitorIdentity(args: {
  visitorKey: string;
  applicationId: string;
  identity: ResolvedVisitorIdentity;
  contextUser: UserInfo;
  provider: IMetadataProvider;
}): Promise<number> {
  try {
    const conversations = await loadVisitorConversations(args.visitorKey, args.applicationId, args.contextUser);
    if (conversations.length === 0) {
      return 0;
    }
    const conversationsEntityId = args.provider.EntityByName(CONVERSATIONS_ENTITY)?.ID;

    let stamped = 0;
    for (const convo of conversations) {
      if (convo.ResolvedEntityID === args.identity.entityId && convo.ResolvedRecordID === args.identity.recordId) {
        continue; // already resolved to this identity
      }
      convo.ResolvedEntityID = args.identity.entityId;
      convo.ResolvedRecordID = args.identity.recordId;
      if (await convo.Save()) {
        stamped++;
      } else {
        LogError(`[VisitorIdentity] failed to stamp resolved identity on conversation ${convo.ID}: ${convo.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
    }

    if (conversationsEntityId) {
      await rekeyAnonymousNotes(conversations.map((c) => c.ID), conversationsEntityId, args.identity, args.contextUser, args.provider);
    }

    LogStatus(`[VisitorIdentity] merged visitor ${args.visitorKey} → ${args.identity.entityId}/${args.identity.recordId} across ${stamped} conversation(s)`);
    return stamped;
  } catch (e) {
    LogError(`[VisitorIdentity] mergeVisitorIdentity failed: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }
}

/** Re-keys notes scoped to `(Conversations entity, conversationId)` onto the resolved pair. */
async function rekeyAnonymousNotes(
  conversationIds: string[],
  conversationsEntityId: string,
  identity: ResolvedVisitorIdentity,
  contextUser: UserInfo,
  provider: IMetadataProvider,
): Promise<void> {
  if (conversationIds.length === 0) {
    return;
  }
  const inList = conversationIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  const rv = new RunView();
  const result = await rv.RunView<MJAIAgentNoteEntity>(
    {
      EntityName: AGENT_NOTES_ENTITY,
      ExtraFilter: `PrimaryScopeEntityID = '${conversationsEntityId}' AND PrimaryScopeRecordID IN (${inList})`,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success) {
    LogError(`[VisitorIdentity] failed to load anonymous notes for re-key: ${result.ErrorMessage}`);
    return;
  }
  for (const note of result.Results ?? []) {
    note.PrimaryScopeEntityID = identity.entityId;
    note.PrimaryScopeRecordID = identity.recordId;
    if (!(await note.Save())) {
      LogError(`[VisitorIdentity] failed to re-key note ${note.ID}: ${note.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
  }
}

/**
 * "Forget me" (RV5): archives the visitor's auto-generated memory and severs the cookie linkage.
 * Archives every auto-generated note whose `SourceConversationID` is one of the visitor's conversations
 * (so it reaps recaps whether they're still anonymous-scoped or already merged onto a resolved record —
 * without touching unrelated memory on a shared resolved record), then clears `VisitorKey` on those
 * conversations so neither the cookie nor a resolved pair re-resolves the trail. Best-effort.
 *
 * @returns a summary of what was archived/cleared.
 */
export async function forgetVisitor(args: {
  visitorKey: string;
  applicationId: string;
  contextUser: UserInfo;
  provider: IMetadataProvider;
}): Promise<{ notesArchived: number; conversationsCleared: number }> {
  let notesArchived = 0;
  let conversationsCleared = 0;
  try {
    const conversations = await loadVisitorConversations(args.visitorKey, args.applicationId, args.contextUser);
    if (conversations.length === 0) {
      return { notesArchived, conversationsCleared };
    }
    const inList = conversations.map((c) => `'${c.ID.replace(/'/g, "''")}'`).join(', ');

    // Archive the visitor's auto-generated recaps, keyed by source conversation (scope-agnostic).
    const rv = new RunView();
    const notes = await rv.RunView<MJAIAgentNoteEntity>(
      {
        EntityName: AGENT_NOTES_ENTITY,
        ExtraFilter: `IsAutoGenerated = 1 AND SourceConversationID IN (${inList}) AND Status != 'Archived'`,
        ResultType: 'entity_object',
      },
      args.contextUser,
    );
    if (notes.Success) {
      for (const note of notes.Results ?? []) {
        note.Status = 'Archived';
        if (await note.Save()) {
          notesArchived++;
        } else {
          LogError(`[VisitorIdentity] failed to archive note ${note.ID}: ${note.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
      }
    } else {
      LogError(`[VisitorIdentity] failed to load notes for forget: ${notes.ErrorMessage}`);
    }

    // Sever the cookie linkage: clear VisitorKey so the key no longer resolves these conversations.
    for (const convo of conversations) {
      convo.VisitorKey = null;
      if (await convo.Save()) {
        conversationsCleared++;
      } else {
        LogError(`[VisitorIdentity] failed to clear VisitorKey on conversation ${convo.ID}: ${convo.LatestResult?.CompleteMessage ?? 'unknown'}`);
      }
    }

    LogStatus(`[VisitorIdentity] forgot visitor ${args.visitorKey}: archived ${notesArchived} note(s), cleared ${conversationsCleared} conversation link(s)`);
  } catch (e) {
    LogError(`[VisitorIdentity] forgetVisitor failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { notesArchived, conversationsCleared };
}
