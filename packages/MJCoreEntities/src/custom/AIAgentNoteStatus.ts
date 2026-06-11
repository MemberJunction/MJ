/**
 * Shared definition of which AIAgentNote lifecycle statuses are "injectable" —
 * eligible for the in-memory vector service, semantic retrieval, and agent
 * context injection.
 *
 * 'Active' notes are vetted long-term memory; 'Provisional' notes were written
 * in-flight by an agent (via the memoryWrites loop-response field) and are
 * immediately injectable while awaiting Memory Manager hardening. Every read-path
 * filter (vector-service sync, embeddings refresh, fallback cache, SQL scoping
 * queries, TTL pruning) derives from this single source of truth so the set can
 * never drift between packages.
 */
export const INJECTABLE_NOTE_STATUSES = ['Active', 'Provisional'] as const;

export type InjectableNoteStatus = (typeof INJECTABLE_NOTE_STATUSES)[number];

/** True when the given note status is eligible for retrieval/injection. */
export function IsInjectableNoteStatus(status: string | null | undefined): boolean {
  return status === 'Active' || status === 'Provisional';
}

/**
 * The injectable statuses as a quoted SQL IN-list body, e.g. `'Active','Provisional'`.
 * Use as: `Status IN (${InjectableNoteStatusSQLList()})`.
 */
export function InjectableNoteStatusSQLList(): string {
  return INJECTABLE_NOTE_STATUSES.map((s) => `'${s}'`).join(',');
}
