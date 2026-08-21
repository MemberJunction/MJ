/**
 * The live CHANNEL ROSTER — what the agent is allowed to know about its own surfaces (#3497).
 *
 * At connect the model is told its TOOL VOCABULARY and nothing else. It is never told which channels
 * actually opened, which failed to resolve a plugin, or what each currently holds. So it infers
 * capability from the tools it was given — "I have `browser_*` tools, so there must be a browser" —
 * and then answers questions about its surfaces by GUESSING, confidently. With one surface the guess
 * is usually right; with three, "let me check the board" versus "let me check the browser" is a coin
 * flip, and anything trying to coordinate across surfaces routes through a model that does not know
 * what the surfaces are.
 *
 * The state existed all along: every plugin has `SerializeState()` and it is already persisted for
 * resume. Nothing composed it into something a model could read. That is all this module does — it
 * is deliberately framework-free (no Angular, no service) so the wording, the ordering and the empty
 * cases are unit-testable in isolation, exactly like the surface-tab helpers next door.
 */

/** One live surface, as the model should hear about it. */
export interface RealtimeChannelRosterEntry {
  /** The channel's registry name — the same string its tools are prefixed from. */
  ChannelName: string;
  /** What the user sees on its tab, which is what they will call it out loud. */
  TabTitle: string;
  /**
   * Whether the channel has a visible surface at all. A server-only channel is wired for tools and
   * perception but has no pane, and telling the agent it is "open" would invite it to describe
   * something nobody can see.
   */
  HasSurface: boolean;
  /** Whether this surface currently owns the screen (channel focus mode). */
  Focused: boolean;
  /** The channel's own one-line summary, or `null` when it has nothing to say. */
  State: string | null;
}

/** Prefix marking the roster note, matching the `[browser]`-style convention already in use. */
const ROSTER_PREFIX = '[surfaces]';

/**
 * Renders the roster as one line for the model.
 *
 * Deliberately terse. This is pushed on every membership or focus change, so it is paid for
 * repeatedly across a session — a paragraph per surface would cost more context than the confusion
 * it removes. One line, most-useful facts first: how many, what they are called, what each holds.
 *
 * A channel with no surface is marked rather than omitted: the agent has that channel's TOOLS, so it
 * needs to know the channel exists AND that there is nothing on screen for it. Omitting it would
 * recreate the original guessing problem one level down.
 */
export function DescribeChannelRoster(entries: readonly RealtimeChannelRosterEntry[]): string {
  if (entries.length === 0) {
    // Said explicitly rather than skipped. "No surfaces are open" is exactly the fact an agent with
    // browser tools and no browser gets wrong, and silence reads as "nobody told me" — which is how
    // it started guessing in the first place.
    return `${ROSTER_PREFIX} none open. You have no visible surface right now.`;
  }
  const described = entries.map(describeOne).join('; ');
  const count = entries.length === 1 ? '1 surface open' : `${entries.length} surfaces open`;
  return `${ROSTER_PREFIX} ${count}: ${described}`;
}

/** One entry: `Whiteboard (12 shapes) — focused`, `Notes — no visible surface`. */
function describeOne(entry: RealtimeChannelRosterEntry): string {
  const label = (entry.TabTitle ?? '').trim().length > 0 ? entry.TabTitle.trim() : entry.ChannelName;
  const parts: string[] = [label];
  const state = (entry.State ?? '').trim();
  if (state.length > 0) {
    parts.push(`(${state})`);
  }
  if (!entry.HasSurface) {
    parts.push('— no visible surface');
  } else if (entry.Focused) {
    parts.push('— focused');
  }
  return parts.join(' ');
}
