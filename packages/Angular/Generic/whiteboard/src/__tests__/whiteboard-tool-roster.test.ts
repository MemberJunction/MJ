import { describe, it, expect } from 'vitest';
import { ClampToolToRoster, IsToolAllowed, VisibleToolbarEntries } from '../lib/whiteboard-tool-roster';
import type { WhiteboardTool } from '../lib/whiteboard-toolbar.component';

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
  it('moves to the roster\'s first entry when the current tool leaves it', () => {
    expect(ClampToolToRoster('html', ['pan', 'pen'])).toBe('pan');
  });
  it('a roster without select is legal: clamps to its first entry, never to select', () => {
    expect(ClampToolToRoster('select', ['pen', 'eraser'])).toBe('pen');
  });
  it('an empty roster leaves the current tool alone (the board never has no tool)', () => {
    expect(ClampToolToRoster('pen', [])).toBe('pen');
  });
});
