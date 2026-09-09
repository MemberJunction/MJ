/**
 * Every tool the board knows, in the toolbar's own display order. This is the runtime
 * companion to {@link WhiteboardTool}: the clamp needs to tell a real tool from a typo, and a
 * union alone cannot do that once it has been erased.
 *
 * It lives HERE rather than beside the toolbar because the roster is the only thing that has
 * to reason about tools as data. The toolbar imports the type back; it must not re-export it,
 * because `public-api.ts` `export *`s both modules and two modules exporting one name that way
 * is a TS2308 ambiguity.
 */
export const WHITEBOARD_TOOLS = [
  'select', 'pan', 'pen', 'shape', 'sticky', 'text', 'markdown', 'html', 'image', 'connector', 'eraser'
] as const;

/** A user-selectable board tool. */
export type WhiteboardTool = typeof WHITEBOARD_TOOLS[number];

/** Whether `name` is one of the board's tools — the guard the clamp uses to skip typos. */
export function IsKnownTool(name: string): name is WhiteboardTool {
  return (WHITEBOARD_TOOLS as readonly string[]).includes(name);
}

/**
 * A host-supplied subset of the board's tools. `null` means "all of them" (today's behaviour).
 *
 * The roster is ONE fact read in three places, so a tool a host hides is hidden everywhere a
 * user could reach it: the floating toolbar, the single-letter keyboard shortcuts, and the
 * right-click "add … here" actions. Hiding only the toolbar button (CSS) leaves the other two
 * doors open, which is how a consumer ended up with learners able to press `w` and place an
 * HTML widget on a board whose toolbar showed no such tool.
 */
export type WhiteboardToolRoster = readonly WhiteboardTool[] | null;

/**
 * May `tool` be offered under `roster`? A `null` roster allows everything.
 *
 * `== null` deliberately, not `=== null`: the package compiles with `strictNullChecks: false`,
 * so the type does not stop a consumer handing us `undefined`, and an undefined roster must
 * read as "no roster" rather than throw on `.includes`.
 */
export function IsToolAllowed(roster: WhiteboardToolRoster, tool: WhiteboardTool): boolean {
  return roster == null || roster.includes(tool);
}

/**
 * Filter a tool list by the roster, preserving the LIST's order (never the roster's) and
 * ignoring roster entries that name no tool, so a consumer cannot reorder the palette or
 * conjure a button by misspelling.
 */
export function VisibleToolbarEntries<T extends { Tool: WhiteboardTool }>(entries: readonly T[], roster: WhiteboardToolRoster): T[] {
  return entries.filter((e) => IsToolAllowed(roster, e.Tool));
}

/**
 * The tool the host should hold when `current` is no longer allowed: `select` when the roster
 * offers it, else the roster's first KNOWN entry, else `select` as the floor.
 *
 * Why `select` first rather than `roster[0]`: roster order is documented as meaningless for
 * rendering ({@link VisibleToolbarEntries} always uses list order), so it must not quietly
 * become load-bearing here. `select` is the neutral tool; falling back to roster order instead
 * would let a host land the user on the eraser by writing the roster in an innocuous order.
 *
 * An empty or all-typo roster ALSO lands on `select`, rather than leaving `current` alone. The
 * board never has "no tool", so something has to be held, and holding the tool the roster just
 * revoked is the one answer that keeps a creating tool live with no toolbar to see it and no
 * key to change it — an empty roster used to keep placing widgets. `select` is always a real
 * tool and can create nothing, so it is the safe floor. Narrowing the palette to nothing still
 * does NOT make the board read-only; that is `ReadOnly`.
 */
export function ClampToolToRoster(current: WhiteboardTool, roster: WhiteboardToolRoster): WhiteboardTool {
  if (IsToolAllowed(roster, current)) {
    return current;
  }
  const known = (roster ?? []).filter(IsKnownTool);
  if (known.length === 0) {
    return 'select';
  }
  return known.includes('select') ? 'select' : known[0];
}
