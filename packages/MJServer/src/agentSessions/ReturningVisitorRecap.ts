/**
 * @fileoverview Returning-visitor recap (RV2). When a returning-visitor-enabled conversation ends,
 * summarize its transcript into an Active agent memory note so the visitor's NEXT session opens with
 * prior context. The recap is written through the EXISTING agent-notes system (MJ: AI Agent Notes) and
 * is scoped via the existing polymorphic note scope (PrimaryScopeEntityID + PrimaryScopeRecordID):
 *
 *   - resolved visitor  → scope = (Conversation.LinkedEntityID, Conversation.LinkedRecordID)
 *   - anonymous visitor → scope = (the "MJ: Conversations" entity, this conversation's ID)
 *
 * The anonymous scope lets the return-side injector (RV3) resolve the recap by following the
 * VisitorKey chain (the next conversation's LastConversationID points back here). Either way the
 * Memory Manager's existing hardening / consolidation / decay maintains the note from here on, and the
 * existing memory injection (which already filters by the PrimaryScope pair) pulls it in — no parallel
 * store and no new injection path (per AN-BC's "reuse the memory system" guidance).
 *
 * The recap TEXT is produced by the metadata-defined "Returning-Visitor Recap" AI prompt via
 * AIPromptRunner (MJ's prompt infra) — not a hand-rolled summarizer. The prompt emits NO_RECAP when a
 * conversation has nothing worth remembering, in which case no note is written.
 *
 * Everything here is BEST-EFFORT: a recap failure must never affect session teardown or the visitor.
 *
 * @module @memberjunction/server/agentSessions
 */

import { RunView, UserInfo, LogError, LogStatus, type IMetadataProvider } from '@memberjunction/core';
import type { MJConversationEntity, MJConversationDetailEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';

const CONVERSATIONS_ENTITY = 'MJ: Conversations';
const CONVERSATION_DETAILS_ENTITY = 'MJ: Conversation Details';
const AGENT_NOTES_ENTITY = 'MJ: AI Agent Notes';
const RECAP_PROMPT_NAME = 'Returning-Visitor Recap';

/** The recap prompt returns this sentinel when a conversation has nothing worth remembering. */
const NO_RECAP_SENTINEL = 'NO_RECAP';

/** Cap the transcript we summarize (most recent turns) to bound prompt size + cost. */
const MAX_TRANSCRIPT_TURNS = 60;

/**
 * Writes a returning-visitor recap note for a finished conversation. Idempotent (skips when a recap for
 * this conversation already exists) and no-ops for conversations that aren't returning-visitor-enabled.
 * Never throws.
 *
 * @param conversationId the conversation that just ended
 * @param agentId the agent the recap is attributed to (the session/pinned agent), or null
 * @param contextUser server context user
 * @param provider the provider servicing this request/session
 * @param retentionDays optional per-widget retention; when > 0 the recap note is stamped with an
 *   `ExpiresAt` that many days out (the Memory Manager's decay phase reaps expired notes). Omit/0
 *   for no expiry (system default retention applies).
 */
export async function writeReturningVisitorRecap(
  conversationId: string | null | undefined,
  agentId: string | null | undefined,
  contextUser: UserInfo,
  provider: IMetadataProvider,
  retentionDays?: number | null,
): Promise<void> {
  try {
    if (!conversationId) {
      return;
    }
    LogStatus(`[ReturningVisitorRecap] START for prior conversation ${conversationId}`);
    const conversation = await getEntity<MJConversationEntity>(provider, CONVERSATIONS_ENTITY, contextUser);
    if (!conversation || !(await conversation.Load(conversationId))) {
      LogError(`[ReturningVisitorRecap] could not load conversation ${conversationId} — bailing`);
      return;
    }

    const scope = resolveRecapScope(conversation, provider);
    if (!scope) {
      // Not a returning-visitor conversation (no VisitorKey, no resolved identity) — nothing to remember.
      LogStatus(`[ReturningVisitorRecap] no scope (no VisitorKey/resolved identity) for ${conversationId} — bailing`);
      return;
    }

    if (await recapAlreadyExists(conversationId, contextUser)) {
      LogStatus(`[ReturningVisitorRecap] recap already exists for ${conversationId} — skipping`);
      return;
    }

    const transcript = await loadTranscript(conversationId, contextUser);
    if (!transcript) {
      LogStatus(`[ReturningVisitorRecap] empty transcript for ${conversationId} — bailing`);
      return;
    }
    LogStatus(`[ReturningVisitorRecap] transcript loaded (${transcript.length} chars) for ${conversationId}; running recap prompt`);

    const recap = await summarizeTranscript(transcript, contextUser);
    if (!recap || recap.trim().toUpperCase().startsWith(NO_RECAP_SENTINEL)) {
      LogStatus(`[ReturningVisitorRecap] prompt returned ${recap ? 'NO_RECAP' : 'no/empty result'} for ${conversationId} — no note written`);
      return;
    }

    await persistRecapNote({ recap, scope, conversationId, agentId, contextUser, provider, retentionDays });
  } catch (e) {
    LogError(`[ReturningVisitorRecap] best-effort recap failed for conversation ${conversationId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The polymorphic scope a recap note is filed under. */
interface RecapScope {
  entityId: string;
  recordId: string;
}

/**
 * Resolves the note scope for this conversation, or undefined when it isn't a returning-visitor
 * conversation. Resolved identity wins (R1 polymorphic pair); otherwise an anonymous visitor's recap
 * is filed against the conversation itself so the VisitorKey chain resolves it on the next visit.
 */
function resolveRecapScope(conversation: MJConversationEntity, provider: IMetadataProvider): RecapScope | undefined {
  if (conversation.LinkedEntityID && conversation.LinkedRecordID) {
    return { entityId: conversation.LinkedEntityID, recordId: conversation.LinkedRecordID };
  }
  if (conversation.VisitorKey) {
    const conversationsEntityId = provider.Entities.find((e) => e.Name === CONVERSATIONS_ENTITY)?.ID;
    if (conversationsEntityId) {
      return { entityId: conversationsEntityId, recordId: conversation.ID };
    }
  }
  return undefined;
}

/** True when an auto-generated recap note already exists for this conversation (idempotency). */
async function recapAlreadyExists(conversationId: string, contextUser: UserInfo): Promise<boolean> {
  const rv = new RunView();
  const result = await rv.RunView<{ ID: string }>(
    {
      EntityName: AGENT_NOTES_ENTITY,
      ExtraFilter: `SourceConversationID = '${conversationId}' AND IsAutoGenerated = 1 AND Type = 'Context'`,
      Fields: ['ID'],
      MaxRows: 1,
      ResultType: 'simple',
    },
    contextUser,
  );
  return result.Success && (result.Results?.length ?? 0) > 0;
}

/** Builds a compact transcript string from the conversation's most-recent detail turns. */
async function loadTranscript(conversationId: string, contextUser: UserInfo): Promise<string | undefined> {
  const rv = new RunView();
  const result = await rv.RunView<MJConversationDetailEntity>(
    {
      EntityName: CONVERSATION_DETAILS_ENTITY,
      ExtraFilter: `ConversationID = '${conversationId}'`,
      OrderBy: '__mj_CreatedAt DESC',
      MaxRows: MAX_TRANSCRIPT_TURNS,
      ResultType: 'entity_object',
    },
    contextUser,
  );
  if (!result.Success || result.Results.length === 0) {
    return undefined;
  }
  // RunView returned newest-first; reverse to chronological for a readable transcript.
  const lines = result.Results.slice()
    .reverse()
    .map((d) => `${d.Role ?? 'User'}: ${(d.Message ?? '').trim()}`)
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Runs the metadata-defined recap prompt over the transcript and returns its plain-text recap. */
async function summarizeTranscript(transcript: string, contextUser: UserInfo): Promise<string | undefined> {
  await AIEngine.Instance.Config(false, contextUser);
  const promptEntity = AIEngine.Instance.Prompts.find((p) => p.Name?.trim().toLowerCase() === RECAP_PROMPT_NAME.toLowerCase());
  if (!promptEntity) {
    LogError(`[ReturningVisitorRecap] recap prompt '${RECAP_PROMPT_NAME}' not found — push metadata/prompts. Skipping recap.`);
    return undefined;
  }
  LogStatus(`[ReturningVisitorRecap] using prompt '${promptEntity.Name}' (strategy=${promptEntity.SelectionStrategy}, status=${promptEntity.Status})`);
  const params = new AIPromptParams();
  params.prompt = promptEntity;
  params.contextUser = contextUser;
  params.data = { transcript };
  const result = await new AIPromptRunner().ExecutePrompt(params);
  if (!result.success) {
    LogError(`[ReturningVisitorRecap] recap prompt failed: ${result.errorMessage ?? 'unknown'}`);
    return undefined;
  }
  const text = typeof result.rawResult === 'string' ? result.rawResult : String(result.rawResult ?? '');
  LogStatus(`[ReturningVisitorRecap] prompt succeeded; recap preview: "${text.trim().slice(0, 120)}"`);
  return text.trim() || undefined;
}

/** Persists the recap as an Active, auto-generated, Context-typed agent note under the resolved scope. */
async function persistRecapNote(args: {
  recap: string;
  scope: RecapScope;
  conversationId: string;
  agentId: string | null | undefined;
  contextUser: UserInfo;
  provider: IMetadataProvider;
  retentionDays?: number | null;
}): Promise<void> {
  const note = await getEntity<MJAIAgentNoteEntity>(args.provider, AGENT_NOTES_ENTITY, args.contextUser);
  if (!note) {
    return;
  }
  note.NewRecord();
  if (args.agentId) {
    note.AgentID = args.agentId;
  }
  note.Note = args.recap;
  note.Type = 'Context';
  note.Status = 'Active';
  note.AuthorType = 'MemoryManager';
  note.IsAutoGenerated = true;
  note.PrimaryScopeEntityID = args.scope.entityId;
  note.PrimaryScopeRecordID = args.scope.recordId;
  note.SourceConversationID = args.conversationId;
  // Per-widget retention: stamp an expiry the Memory Manager's decay phase honors. Omitted/≤0 ⇒ no
  // expiry (system-default retention). One day = 86_400_000 ms.
  if (args.retentionDays && args.retentionDays > 0) {
    note.ExpiresAt = new Date(Date.now() + args.retentionDays * 86_400_000);
  }
  const saved = await note.Save();
  if (!saved) {
    LogError(`[ReturningVisitorRecap] failed to save recap note: ${note.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return;
  }
  LogStatus(`[ReturningVisitorRecap] wrote recap note ${note.ID} scoped to ${args.scope.entityId}/${args.scope.recordId} for conversation ${args.conversationId}`);
}

/** GetEntityObject via the request/session provider (multi-provider-safe — never the global Metadata). */
async function getEntity<T extends import('@memberjunction/core').BaseEntity>(
  provider: IMetadataProvider,
  entityName: string,
  contextUser: UserInfo,
): Promise<T | null> {
  try {
    return await provider.GetEntityObject<T>(entityName, contextUser);
  } catch (e) {
    LogError(`[ReturningVisitorRecap] GetEntityObject('${entityName}') failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
