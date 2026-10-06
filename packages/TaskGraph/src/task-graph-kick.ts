/**
 * Wake running dispatchers the moment a graph is submitted.
 *
 * The poll timer is 5s — fine in production, a noticeable dead pause after Debug/Run. Submit
 * cannot import the dispatcher instance (submit and execute are separate halves), so each
 * started dispatcher registers a kick here and Submit pokes the set.
 */
const kicks = new Set<() => void>();

export function RegisterTaskGraphKick(kick: () => void): () => void {
    kicks.add(kick);
    return () => { kicks.delete(kick); };
}

export function KickTaskGraphDispatchers(): void {
    for (const kick of kicks) kick();
}
