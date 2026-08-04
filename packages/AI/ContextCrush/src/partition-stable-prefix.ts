/**
 * Cache-aligned prompt prefix partitioning — independent TypeScript re-implementation of
 * the "CacheAligner" principle from Headroom (https://github.com/chopratejas/headroom,
 * Apache-2.0). Written from the published description; not a copy of Headroom source.
 * See plans/agent-token-optimization.md §0 for attribution.
 *
 * Providers cache a conversation's KV state for the longest *unchanged leading run* of
 * messages. Mutating (removing/compacting) a message at index i invalidates the cache
 * from i onward. This primitive identifies the contiguous front block a caller wants to
 * keep byte-stable, so mutation can be confined to the volatile tail and cache hits are
 * preserved across turns.
 */

/** The result of splitting a message list into a byte-stable prefix and a mutable tail. */
export interface StablePrefixPartition<TMessage> {
  /** The maximal contiguous leading run for which `isStable` held. */
  Stable: TMessage[];
  /** Everything from the first non-stable message onward (the mutable region). */
  Volatile: TMessage[];
  /** Index where the volatile region begins; equals `Stable.length`. */
  Boundary: number;
}

/**
 * Partition `messages` into a byte-stable prefix and a volatile tail.
 *
 * The prefix is the **maximal contiguous leading run** for which `isStable` returns true.
 * The moment `isStable` returns false, that message and everything after it are volatile —
 * even a later message that would itself be "stable", because once the leading run is
 * broken the provider's cached prefix is already lost from that point.
 *
 * Pure and side-effect-free: the input array is not mutated; the returned arrays are
 * shallow slices of it.
 *
 * @param messages   The ordered conversation messages (front = oldest).
 * @param isStable   Predicate identifying a prefix-eligible (cache-stable) message.
 */
export function PartitionStablePrefix<TMessage>(
  messages: readonly TMessage[],
  isStable: (message: TMessage, index: number) => boolean,
): StablePrefixPartition<TMessage> {
  let boundary = 0;
  while (boundary < messages.length && isStable(messages[boundary], boundary)) {
    boundary++;
  }
  return {
    Stable: messages.slice(0, boundary),
    Volatile: messages.slice(boundary),
    Boundary: boundary,
  };
}
