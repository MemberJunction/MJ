import { IMetadataProvider, LogErrorEx, LogStatusEx, Metadata, UserInfo } from '@memberjunction/core';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * A single in-flight memory write requested by the LLM via the
 * `memoryWrites` field on the loop response.
 */
export interface MemoryWriteRequest {
  /** The fact to remember, e.g. "User prefers bar charts over pie charts." Atomic and declarative. */
  note: string;
  /** Descriptive category only. Behavioral/Constraint types are rejected in-flight (prompt-injection defense). */
  type: 'Preference' | 'Context';
  /** Optional scope hint; the framework clamps scope to <= Agent+User regardless. 'agent' drops the user dimension. */
  scopeHint?: 'user' | 'agent';
}

/**
 * Outcome category for a single memory write. Every request gets exactly one disposition:
 * - written          — a new provisional note was persisted
 * - superseded-own   — the request near-duplicated a note written earlier in THIS run; that note's text was updated in place (last-write-wins within a run)
 * - deduped          — the request EXACTLY restated a pre-existing note (after trim/lowercase/whitespace-collapse normalization); its AccessCount/LastAccessedAt were bumped instead of inserting. Near-but-textually-different matches are NOT deduped — they write a new note so corrections are never silently dropped
 * - skipped-duplicate — the exact same note text was already written this run (idempotency hash hit)
 * - skipped-cap      — the per-run write cap was reached
 * - rejected-type    — the request failed validation (bad type, empty/oversized note)
 * - error            — persistence failed
 */
export type MemoryWriteDisposition =
  | 'written'
  | 'superseded-own'
  | 'deduped'
  | 'skipped-duplicate'
  | 'skipped-cap'
  | 'rejected-type'
  | 'error';

/** A vector-shortlisted near-duplicate candidate, carrying the matched note's text for exact-restatement comparison. */
interface NearDupCandidate {
  noteId: string;
  similarity: number;
  noteText: string;
}

/** Final scope a write landed with, after clamping. Never broader than Agent+User(+Company from context). */
export interface MemoryWriteScope {
  agentId: string;
  userId: string | null;
  companyId: string | null;
}

export interface MemoryWriteResult {
  disposition: MemoryWriteDisposition;
  /** ID of the note written, superseded, or deduped against (when applicable) */
  noteId?: string;
  /** Human/LLM-readable explanation, returned to the agent so it can self-correct */
  reason?: string;
  /** Scope the write was clamped to (set for written/superseded-own) */
  finalScope?: MemoryWriteScope;
  durationMs: number;
  request: MemoryWriteRequest;
}

/**
 * Run-scoped context for memory writes. Injected per call rather than read from
 * globals so the manager stays independently testable and multi-run safe.
 */
export interface MemoryWriteContext {
  agentId: string;
  contextUser: UserInfo;
  agentRunId?: string;
  conversationId?: string;
  conversationDetailId?: string;
  userId?: string;
  companyId?: string;
  /** Mirrors ExecuteAgentParams.verbose — gates per-write logging */
  verbose?: boolean;
  /**
   * Metadata provider to persist through. Callers running under a non-default
   * provider (multi-provider clients, request-bound server providers) MUST pass
   * theirs — BaseAgent passes its ProviderToUse. Falls back to the global
   * default only when absent.
   */
  provider?: IMetadataProvider;
}

export interface MemoryWriteManagerConfig {
  /** Max writes persisted per run (supersedes/dedups/skips don't count). Default 5. */
  maxWritesPerRun?: number;
  /** Cosine-similarity threshold for the write-time near-dup guard. Default 0.85 (tighter than MM's 0.60 clustering). */
  nearDupSimilarity?: number;
  /** TTL safety net for provisional notes, in days. Default 7. */
  defaultTTLDays?: number;
  /** Max note text length accepted. Default 2000 chars. */
  maxNoteLength?: number;
}

/**
 * Manages in-flight durable memory writes for a single agent run.
 *
 * Follows the ArtifactToolManager pattern:
 * - Instantiated once per run, `Clear()`ed at run start
 * - Holds per-run idempotency/cap state
 * - Executes write requests and returns structured results for next-turn injection
 *
 * The framework (not the agent) enforces every guard: type restriction, scope
 * clamping, near-duplicate handling, per-run caps, and provenance stamping.
 * Notes land with `Status='Provisional'` — immediately injectable, later
 * hardened or pruned by the MemoryManagerAgent.
 *
 * Writes MUST be executed sequentially (the BaseAgent caller iterates with
 * `for...of`, not `Promise.all`): each persisted note is embedded and synced
 * into the in-memory vector service by `MJAIAgentNoteEntityServer.Save()`, so
 * write N must be visible to write N+1's near-dup check. This is a deliberate
 * exception to the parallelize-by-default rule.
 */
export class MemoryWriteManager {
  /** Normalized-note-hash → noteId persisted this run (within-run idempotency + supersede-own lookup) */
  private writtenNotesByHash: Map<string, string> = new Map();
  /** IDs of notes persisted this run (distinguishes supersede-own from cross-run dedupe) */
  private writtenNoteIds: Set<string> = new Set();
  private writeCount = 0;

  private readonly maxWritesPerRun: number;
  private readonly nearDupSimilarity: number;
  private readonly defaultTTLDays: number;
  private readonly maxNoteLength: number;

  constructor(config?: MemoryWriteManagerConfig) {
    this.maxWritesPerRun = config?.maxWritesPerRun || 5;
    this.nearDupSimilarity = config?.nearDupSimilarity || 0.85;
    this.defaultTTLDays = config?.defaultTTLDays || 7;
    this.maxNoteLength = config?.maxNoteLength || 2000;
  }

  /** Reset all per-run state. Called at run start, mirroring ArtifactToolManager.Clear(). */
  Clear(): void {
    this.writtenNotesByHash.clear();
    this.writtenNoteIds.clear();
    this.writeCount = 0;
  }

  /** Number of notes persisted this run (written + superseded) */
  get WriteCount(): number {
    return this.writeCount;
  }

  /**
   * Execute a single memory write through the guard pipeline:
   * type guard → within-run idempotency → per-run cap → scope clamp →
   * near-dup guard (supersede-own / exact-restatement dedupe / fail-open) → persist provisional.
   */
  async ExecuteWrite(request: MemoryWriteRequest, context: MemoryWriteContext): Promise<MemoryWriteResult> {
    const startedAt = Date.now();
    const finish = (partial: Omit<MemoryWriteResult, 'durationMs' | 'request'>): MemoryWriteResult => ({
      ...partial,
      durationMs: Date.now() - startedAt,
      request,
    });

    const validationError = this.validateRequest(request);
    if (validationError) {
      return finish({ disposition: 'rejected-type', reason: validationError });
    }

    const hash = this.normalizeAndHash(request.note);
    if (this.writtenNotesByHash.has(hash)) {
      return finish({
        disposition: 'skipped-duplicate',
        noteId: this.writtenNotesByHash.get(hash),
        reason: 'This exact memory was already recorded this run. Do not re-submit it.',
      });
    }

    if (this.writeCount >= this.maxWritesPerRun) {
      return finish({
        disposition: 'skipped-cap',
        reason: `Per-run memory write cap (${this.maxWritesPerRun}) reached. Remaining facts will be captured by the scheduled Memory Manager.`,
      });
    }

    const scope = this.clampScope(request, context);
    const nearDup = await this.findNearDuplicate(request.note, scope, context);

    let outcome: Omit<MemoryWriteResult, 'durationMs' | 'request'>;
    if (nearDup && this.writtenNoteIds.has(nearDup.noteId)) {
      outcome = await this.supersedeOwnNote(nearDup.noteId, request, scope, context);
    } else if (nearDup) {
      outcome = await this.touchExistingNote(nearDup.noteId, context);
    } else {
      outcome = await this.persistNewNote(request, scope, context);
    }
    this.recordOutcome(outcome, hash);
    return finish(outcome);
  }

  /**
   * Per-run state bookkeeping, owned by the orchestrator (not the persistence
   * seams) so subclass/test overrides of the I/O methods can't desync the
   * idempotency hash map, the own-note ID set, or the write cap counter.
   */
  private recordOutcome(outcome: Omit<MemoryWriteResult, 'durationMs' | 'request'>, hash: string): void {
    if (outcome.disposition === 'written' && outcome.noteId) {
      this.writeCount++;
      this.writtenNotesByHash.set(hash, outcome.noteId);
      this.writtenNoteIds.add(outcome.noteId);
    } else if (outcome.disposition === 'superseded-own' && outcome.noteId) {
      this.writtenNotesByHash.set(hash, outcome.noteId);
    }
  }

  // ─── GUARDS ───

  /** Returns an error message when the request fails validation, null when valid. */
  private validateRequest(request: MemoryWriteRequest): string | null {
    if (request.type !== 'Preference' && request.type !== 'Context') {
      return `Memory type "${request.type}" is not allowed in-flight — only 'Preference' and 'Context'. Behavioral/constraint memories require Memory Manager or human promotion.`;
    }
    const note = (request.note || '').trim();
    if (note.length === 0) {
      return 'Memory note text is empty.';
    }
    if (note.length > this.maxNoteLength) {
      return `Memory note exceeds the ${this.maxNoteLength}-character limit (${note.length}). Record one atomic fact per write.`;
    }
    return null;
  }

  /** Case/whitespace-insensitive hash for within-run idempotency. */
  private normalizeAndHash(note: string): string {
    return note.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Clamp the write's scope to <= Agent + User (+ Company when present in context).
   * A scopeHint may NARROW (drop the user dimension) but never broaden — in-flight
   * writes never land global; scope-widening is exclusively the Memory Manager's
   * judgment during hardening/consolidation.
   */
  private clampScope(request: MemoryWriteRequest, context: MemoryWriteContext): MemoryWriteScope {
    return {
      agentId: context.agentId,
      userId: request.scopeHint === 'agent' ? null : context.userId || null,
      companyId: context.companyId || null,
    };
  }

  // ─── NEAR-DUP GUARD (overridable seam for tests) ───

  /**
   * One in-memory vector check against injectable notes in the same scope,
   * returning only ACTIONABLE hits:
   *   - a note written earlier in THIS run (supersede-own candidate — checked
   *     first because within-run last-write-wins is the stronger contract), or
   *   - a pre-existing note whose normalized text EXACTLY equals the request's
   *     (exact-restatement dedupe candidate).
   *
   * Near-but-textually-different matches are deliberately dropped so the write
   * proceeds as a new provisional note. A textual difference may be a
   * correction — live testing showed "I love pie charts" followed in a later
   * run by "never use pie charts, bar charts only" being absorbed into the
   * STALE note (reinforcing it) and the correction silently lost. ADD-only on
   * mismatch preserves corrections; true paraphrase duplicates are reconciled
   * by the Memory Manager's LLM hardening dedupe (bounded by the per-run cap
   * and TTL). The vector query itself survives because it (a) detects own-note
   * supersede targets and (b) shortlists exact-restatement candidates without
   * a table scan — exact equality filters AFTER the vector shortlist.
   *
   * Fail-open by design: when the vector service is unavailable or errors, we
   * proceed with the write rather than dropping the user's stated fact — a rare
   * duplicate is recoverable (TTL + Memory Manager hardening dedup), a silently
   * lost memory is not.
   */
  protected async findNearDuplicate(
    noteText: string,
    scope: MemoryWriteScope,
    context: MemoryWriteContext,
  ): Promise<{ noteId: string; similarity: number } | null> {
    try {
      const matches = await this.queryVectorService(noteText, scope);
      const ownHit = matches.find((m) => this.writtenNoteIds.has(m.noteId));
      if (ownHit) {
        return { noteId: ownHit.noteId, similarity: ownHit.similarity };
      }
      const requestHash = this.normalizeAndHash(noteText);
      const exactHit = matches.find((m) => this.normalizeAndHash(m.noteText) === requestHash);
      if (exactHit) {
        return { noteId: exactHit.noteId, similarity: exactHit.similarity };
      }
      return null;
    } catch (error) {
      LogErrorEx({
        message: 'MemoryWriteManager: near-dup check failed — proceeding fail-open with the write',
        error: error instanceof Error ? error : undefined,
      });
      return null;
    }
  }

  /** Raw vector-service lookup. Overridable seam for tests. */
  protected async queryVectorService(
    noteText: string,
    scope: MemoryWriteScope,
  ): Promise<NearDupCandidate[]> {
    const matches = await AIEngine.Instance.FindSimilarAgentNotes(
      noteText,
      scope.agentId,
      scope.userId || undefined,
      scope.companyId || undefined,
      3,
      this.nearDupSimilarity,
    );
    return matches.map((m) => ({ noteId: m.note.ID, similarity: m.similarity, noteText: m.note.Note || '' }));
  }

  // ─── PERSISTENCE (overridable seams for tests) ───

  /**
   * Supersede-own: the request near-duplicates a note written earlier in THIS
   * run — update that provisional note's text in place (last-write-wins within
   * a run: "I love blue charts!" then "actually, red charts!" yields one
   * red-charts note, no stale row). Cross-run conflicts are NOT superseded —
   * they defer to the Memory Manager.
   */
  protected async supersedeOwnNote(
    noteId: string,
    request: MemoryWriteRequest,
    scope: MemoryWriteScope,
    context: MemoryWriteContext,
  ): Promise<Omit<MemoryWriteResult, 'durationMs' | 'request'>> {
    const note = await this.loadNote(noteId, context);
    if (!note) {
      return { disposition: 'error', noteId, reason: `Could not load own note ${noteId} to supersede.` };
    }
    note.Note = request.note.trim();
    note.Type = request.type;
    const saved = await note.Save();
    if (!saved) {
      return {
        disposition: 'error',
        noteId,
        reason: `Failed to supersede own note: ${note.LatestResult?.CompleteMessage || 'unknown error'}`,
      };
    }
    this.logVerbose(context, `superseded own note ${noteId} with updated text`);
    return {
      disposition: 'superseded-own',
      noteId,
      finalScope: scope,
      reason: 'Updated the memory you recorded earlier this run (last write wins).',
    };
  }

  /**
   * The request exactly restates a pre-existing note (from a prior run or the
   * Memory Manager). Bump its access stats instead of inserting a duplicate.
   */
  protected async touchExistingNote(
    noteId: string,
    context: MemoryWriteContext,
  ): Promise<Omit<MemoryWriteResult, 'durationMs' | 'request'>> {
    const note = await this.loadNote(noteId, context);
    if (!note) {
      return { disposition: 'error', noteId, reason: `Could not load existing note ${noteId} to dedupe against.` };
    }
    note.AccessCount = (note.AccessCount || 0) + 1;
    note.LastAccessedAt = new Date();
    const saved = await note.Save();
    if (!saved) {
      return {
        disposition: 'error',
        noteId,
        reason: `Failed to update existing note: ${note.LatestResult?.CompleteMessage || 'unknown error'}`,
      };
    }
    this.logVerbose(context, `deduped against existing note ${noteId}`);
    return {
      disposition: 'deduped',
      noteId,
      reason: 'This memory already exists verbatim — its relevance was reinforced instead of duplicating it.',
    };
  }

  /** Persist a new provisional note with full provenance stamping. */
  protected async persistNewNote(
    request: MemoryWriteRequest,
    scope: MemoryWriteScope,
    context: MemoryWriteContext,
  ): Promise<Omit<MemoryWriteResult, 'durationMs' | 'request'>> {
    const aiNoteTypeId = AIEngine.Instance.AgenteNoteTypeIDByName('AI');
    if (!aiNoteTypeId) {
      return { disposition: 'error', reason: 'Could not resolve the "AI" agent note type.' };
    }

    const md = context.provider ?? new Metadata();
    const note = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', context.contextUser);
    note.AgentID = scope.agentId;
    note.UserID = scope.userId;
    note.CompanyID = scope.companyId;
    note.AgentNoteTypeID = aiNoteTypeId;
    note.Type = request.type;
    note.Note = request.note.trim();
    note.IsAutoGenerated = true;
    note.Status = 'Provisional';
    note.AuthorType = 'Agent';
    note.ProtectionTier = 'Standard';
    note.ConsolidationCount = 0;
    note.AccessCount = 1;
    note.SourceAIAgentRunID = context.agentRunId || null;
    note.SourceConversationID = context.conversationId || null;
    note.SourceConversationDetailID = context.conversationDetailId || null;
    note.ExpiresAt = new Date(Date.now() + this.defaultTTLDays * 24 * 60 * 60 * 1000);

    const saved = await note.Save();
    if (!saved) {
      return {
        disposition: 'error',
        reason: `Failed to save memory: ${note.LatestResult?.CompleteMessage || 'unknown error'}`,
      };
    }

    this.logVerbose(context, `wrote provisional note ${note.ID} (${request.type}, scope agent=${scope.agentId} user=${scope.userId || 'none'})`);
    return {
      disposition: 'written',
      noteId: note.ID,
      finalScope: scope,
      reason: 'Memory recorded. It is active immediately and will be reviewed by the Memory Manager.',
    };
  }

  /** Load an existing note entity by ID. Overridable seam for tests. */
  protected async loadNote(noteId: string, context: MemoryWriteContext): Promise<MJAIAgentNoteEntity | null> {
    const md = context.provider ?? new Metadata();
    const note = await md.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', context.contextUser);
    const loaded = await note.Load(noteId);
    return loaded ? note : null;
  }

  private logVerbose(context: MemoryWriteContext, message: string): void {
    LogStatusEx({
      message: `MemoryWriteManager: ${message}`,
      verboseOnly: true,
      isVerboseEnabled: () => context.verbose === true,
    });
  }
}
