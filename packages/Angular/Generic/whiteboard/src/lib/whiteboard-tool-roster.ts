import type { WhiteboardTool } from './whiteboard-toolbar.component';

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

/** May `tool` be offered under `roster`? A `null` roster allows everything. */
export function IsToolAllowed(roster: WhiteboardToolRoster, tool: WhiteboardTool): boolean {
  return roster === null || roster.includes(tool);
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
 * The tool the host should hold after a roster change: the current one if it is still
 * allowed, else the first roster entry, else (empty roster) the current one unchanged so the
 * board never has "no tool".
 */
export function ClampToolToRoster(current: WhiteboardTool, roster: WhiteboardToolRoster): WhiteboardTool {
  if (IsToolAllowed(roster, current)) {
    return current;
  }
  return roster !== null && roster.length > 0 ? roster[0] : current;
}
