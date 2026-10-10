/**
 * @fileoverview What a realtime model is told when the video it sees changes: the notes a browser call and a meeting
 * send it.
 *
 * A model that takes video sees frames, not where they come from, and one that silently starts seeing something else
 * describes the old thing. So when what it sees changes, it gets a short note in the conversation:
 *
 * - "[You can now see: Ada's screen]" when a source comes into view ({@link VideoSourceSeenNote});
 * - "[You can no longer see: Bob's camera]" when a source it saw stops ({@link VideoSourceEndedNote});
 * - "[You can no longer see: Whiteboard (the user turned it off)]" and "[You can now see: Whiteboard (turned back on)]"
 *   when the user turns a source off or back on ({@link VideoSourceTurnedOffNote}, {@link VideoSourceTurnedOnNote}).
 *
 * Two places send them: a browser call's video source arbiter (`@memberjunction/ai-realtime-client`) and a meeting's
 * bridge engine (`@memberjunction/ai-bridge-server`). The wording lives here, so the model reads the same note for the
 * same event in either. The notes speak to the model in the second person, so in a room with other agents one can't be
 * read as another agent's view.
 *
 * @module @memberjunction/ai
 * @author MemberJunction.com
 */

/**
 * The note that tells the model what it can now see: "[You can now see: Ada's screen]". Several sources are named in the
 * order given, joined with ", " ("[You can now see: Screen, Camera]").
 *
 * - A meeting's bridge engine sends it right before the first frame of a camera or screen new to the model's session.
 * - A call's video source arbiter sends it when the sources in view change while it chooses among more sources than the
 *   model takes, naming every source in view.
 *
 * @param sourceLabels The human-readable name of the source now in view, or of each source in view (at least one), put in
 *   as given.
 */
export function VideoSourceSeenNote(sourceLabels: string | readonly string[]): string {
    const named = typeof sourceLabels === 'string' ? sourceLabels : sourceLabels.join(', ');
    return `[You can now see: ${named}]`;
}

/**
 * The note that tells the model a camera or screen it was seeing has stopped: "[You can no longer see: Bob's camera]". A
 * meeting's bridge engine sends it when the person stopped letting agents see them, left, stopped sharing or turned the
 * camera off, or the view moved to another source.
 *
 * @param sourceLabel The source's human-readable name, put in as given.
 */
export function VideoSourceEndedNote(sourceLabel: string): string {
    return `[You can no longer see: ${sourceLabel}]`;
}

/**
 * The note that tells the model the user turned a source off:
 * "[You can no longer see: Whiteboard (the user turned it off)]". A call's video source arbiter sends it when the user
 * turns a source off.
 *
 * @param sourceLabel The source's human-readable name, put in as given.
 */
export function VideoSourceTurnedOffNote(sourceLabel: string): string {
    return `[You can no longer see: ${sourceLabel} (the user turned it off)]`;
}

/**
 * The note that tells the model the user turned a source back on: "[You can now see: Whiteboard (turned back on)]". A
 * call's video source arbiter sends it when the user turns a source on again.
 *
 * @param sourceLabel The source's human-readable name, put in as given.
 */
export function VideoSourceTurnedOnNote(sourceLabel: string): string {
    return `[You can now see: ${sourceLabel} (turned back on)]`;
}
