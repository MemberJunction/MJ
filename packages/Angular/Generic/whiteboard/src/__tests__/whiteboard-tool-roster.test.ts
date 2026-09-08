import { describe, it, expect } from 'vitest';
import { ClampToolToRoster, IsKnownTool, IsToolAllowed, VisibleToolbarEntries, WHITEBOARD_TOOLS, WhiteboardToolRoster } from '../lib/whiteboard-tool-roster';
import type { WhiteboardTool } from '../lib/whiteboard-tool-roster';

/**
 * TOOL ROSTER — the one predicate the toolbar, the keyboard map and the canvas context menu
 * all read, so a tool a host hides is unreachable by every path (not merely unlisted).
 */
const ALL: WhiteboardTool[] = ['select', 'pan', 'pen', 'shape', 'sticky', 'text', 'markdown', 'html', 'image', 'connector', 'eraser'];
const entries = ALL.map((Tool) => ({ Tool }));

describe('IsToolAllowed', () => {
  it('a null roster allows every tool (the default is today\'s behaviour)', () => {
    for (const t of ALL) expect(IsToolAllowed(null, t)).toBe(true);
  });
  it('a roster allows exactly its members', () => {
    expect(IsToolAllowed(['select', 'pen'], 'pen')).toBe(true);
    expect(IsToolAllowed(['select', 'pen'], 'html')).toBe(false);
  });
  it('an undefined roster reads as no roster, not a crash (strictNullChecks is off here)', () => {
    // No cast: the package compiles with strictNullChecks:false, so this assignment is exactly
    // what a consumer can hand us, and the type system will not stop them.
    const missing: WhiteboardToolRoster = undefined;
    for (const t of WHITEBOARD_TOOLS) {
      expect(IsToolAllowed(missing, t)).toBe(true);
    }
  });

  it('an empty roster allows nothing', () => {
    for (const t of ALL) expect(IsToolAllowed([], t)).toBe(false);
  });
});

describe('VisibleToolbarEntries', () => {
  it('null roster → every entry, unchanged', () => {
    expect(VisibleToolbarEntries(entries, null)).toEqual(entries);
  });
  it('narrows to the roster, keeping the LIST\'s order rather than the roster\'s', () => {
    const out = VisibleToolbarEntries(entries, ['eraser', 'select', 'pen']);
    expect(out.map((e) => e.Tool)).toEqual(['select', 'pen', 'eraser']);
  });
  it('ignores roster names that are not tools (a typo cannot conjure a button)', () => {
    const out = VisibleToolbarEntries(entries, ['pen', 'lasso' as WhiteboardTool]);
    expect(out.map((e) => e.Tool)).toEqual(['pen']);
  });
});

describe('ClampToolToRoster', () => {
  it('keeps the current tool when the roster still allows it', () => {
    expect(ClampToolToRoster('pen', ['select', 'pen'])).toBe('pen');
    expect(ClampToolToRoster('html', null)).toBe('html');
  });
  it('moves to the roster\'s first KNOWN entry when the current tool leaves it and select is absent', () => {
    expect(ClampToolToRoster('html', ['pan', 'pen'])).toBe('pan');
  });
  it('a roster without select is legal: clamps to its first entry, never to select', () => {
    expect(ClampToolToRoster('select', ['pen', 'eraser'])).toBe('pen');
  });
  it('prefers select over roster order when the roster offers it', () => {
    // Roster ORDER is meaningless for rendering, so it must not become load-bearing here:
    // landing on the eraser because a host happened to list it first would be a trap.
    expect(ClampToolToRoster('html', ['eraser', 'pen', 'select'])).toBe('select');
  });

  it('falls back to the first known entry when select is not on the roster', () => {
    expect(ClampToolToRoster('html', ['eraser', 'pen'])).toBe('eraser');
  });

  it('skips roster names that are not tools when choosing the fallback', () => {
    expect(ClampToolToRoster('select', ['lasso', 'pen'])).toBe('pen');
  });

  it('an all-typo roster leaves the current tool alone', () => {
    expect(ClampToolToRoster('pen', ['lasso', 'wand'])).toBe('pen');
  });

  it('an empty roster leaves the current tool alone (the board never has no tool)', () => {
    expect(ClampToolToRoster('pen', [])).toBe('pen');
  });
});

describe('IsKnownTool / WHITEBOARD_TOOLS', () => {
  it('recognises every tool in the catalog and nothing else', () => {
    for (const t of WHITEBOARD_TOOLS) {
      expect(IsKnownTool(t)).toBe(true);
    }
    expect(IsKnownTool('lasso')).toBe(false);
    expect(IsKnownTool('')).toBe(false);
  });

  it('the catalog holds all eleven tools', () => {
    expect(WHITEBOARD_TOOLS.length).toBe(11);
  });
});
