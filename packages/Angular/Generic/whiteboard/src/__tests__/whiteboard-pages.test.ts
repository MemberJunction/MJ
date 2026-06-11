/**
 * Tests for the PAGES feature (OneNote-style):
 *  - page CRUD (AddPage / SwitchPage / RenamePage / RemovePage) incl. the last-page
 *    guard and activate-neighbor-on-remove behavior;
 *  - per-page item scoping (all item operations target the ACTIVE page);
 *  - legacy flat-JSON migration (old shape → one page "Page 1") and the new paged
 *    shape's round-trip, plus malformed-input tolerance;
 *  - the cancelable Page* before/after event pairs (veto semantics);
 *  - the page-aware perception payloads (pages list + active page in summaries);
 *  - the three page agent tools through ApplyWhiteboardAgentTool (switch-by-name
 *    case-insensitivity, unknown-page failures, canceled-operation failures).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange,
  WhiteboardPageAddedEventArgs,
  WhiteboardPageAddingEventArgs,
  WhiteboardPageRemovedEventArgs,
  WhiteboardPageRenamedEventArgs,
  WhiteboardPageSwitchedEventArgs,
  WhiteboardState,
  WhiteboardStickyItem
} from '../lib/whiteboard-state';
import { ApplyWhiteboardAgentTool, WHITEBOARD_TOOL_NAMES, WhiteboardToolResult } from '../lib/whiteboard-tools';

function parseResult(json: string): WhiteboardToolResult {
  return JSON.parse(json) as WhiteboardToolResult;
}

describe('WhiteboardState pages', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  describe('fresh board', () => {
    it('starts with one active page named "Page 1"', () => {
      expect(state.Pages).toHaveLength(1);
      expect(state.Pages[0].Name).toBe('Page 1');
      expect(state.Pages[0].Active).toBe(true);
      expect(state.ActivePageID).toBe(state.Pages[0].ID);
      expect(state.ActivePageName).toBe('Page 1');
    });
  });

  describe('AddPage', () => {
    it('auto-names "Page N", switches to the new page, and returns its info', () => {
      const page = state.AddPage();
      expect(page).not.toBeNull();
      expect(page!.Name).toBe('Page 2');
      expect(page!.Active).toBe(true);
      expect(state.ActivePageID).toBe(page!.ID);
      expect(state.Pages.map((p) => p.Name)).toEqual(['Page 1', 'Page 2']);
    });

    it('accepts an explicit (trimmed) name', () => {
      const page = state.AddPage('  Practice problems  ');
      expect(page!.Name).toBe('Practice problems');
    });

    it('never repeats auto-names after a removal (monotonic counter)', () => {
      const second = state.AddPage(); // Page 2
      state.RemovePage(second!.ID);
      const third = state.AddPage();
      expect(third!.Name).toBe('Page 3');
    });

    it('is one undoable step (undo restores the previous page set and active page)', () => {
      const first = state.ActivePageID;
      state.AddPage('Extra');
      expect(state.Pages).toHaveLength(2);
      expect(state.Undo()).toBe(true);
      expect(state.Pages).toHaveLength(1);
      expect(state.ActivePageID).toBe(first);
    });
  });

  describe('item scoping (active page)', () => {
    it('keeps each page\'s items isolated and scopes counts/lookups to the active page', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'on page 1' }, 'user')!;
      state.AddPage();
      expect(state.Items).toHaveLength(0);
      expect(state.ElementCount).toBe(0);
      expect(state.GetItem(sticky.ID)).toBeUndefined(); // other-page items are not visible
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'on page 2' }, 'agent');
      expect(state.Items).toHaveLength(1);
      expect(state.TotalItemCount).toBe(2);

      state.SwitchPage('Page 1');
      expect(state.Items).toHaveLength(1);
      expect(state.GetItem(sticky.ID)).toBeDefined();
      expect((state.GetItem(sticky.ID) as WhiteboardStickyItem).Text).toBe('on page 1');
    });

    it('clears the selection when switching pages', () => {
      const sticky = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'sel' }, 'user')!;
      state.Select(sticky.ID);
      state.AddPage();
      expect(state.SelectedID).toBeNull();
    });

    it('Clear() empties only the active page', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'keep me' }, 'user');
      state.AddPage();
      state.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'clear me' }, 'user');
      expect(state.Clear()).toBe(true);
      expect(state.Items).toHaveLength(0);
      expect(state.TotalItemCount).toBe(1); // page 1 untouched
    });
  });

  describe('SwitchPage', () => {
    beforeEach(() => {
      state.AddPage('Sketches'); // active
      state.SwitchPage('Page 1');
    });

    it('switches by ID and by case-insensitive name (with whitespace tolerance)', () => {
      expect(state.SwitchPage('  sKeTcHeS ')).toBe(true);
      expect(state.ActivePageName).toBe('Sketches');
      const page1 = state.Pages.find((p) => p.Name === 'Page 1')!;
      expect(state.SwitchPage(page1.ID)).toBe(true);
      expect(state.ActivePageName).toBe('Page 1');
    });

    it('returns false for unknown pages and empty keys', () => {
      expect(state.SwitchPage('Nope')).toBe(false);
      expect(state.SwitchPage('')).toBe(false);
      expect(state.ActivePageName).toBe('Page 1');
    });

    it('is a successful no-op when the page is already active (no change emission)', () => {
      const changes: WhiteboardChange[] = [];
      state.Changed$.subscribe((c) => changes.push(c));
      expect(state.SwitchPage('Page 1')).toBe(true);
      expect(changes).toHaveLength(0);
    });

    it('journals a replace so deltas reset (the visible scene swapped wholesale)', () => {
      const token = state.CurrentSeq;
      state.SwitchPage('Sketches');
      const delta = state.BuildSceneDelta(token);
      expect(delta.reset).toBe(true);
    });
  });

  describe('RenamePage', () => {
    it('renames by id or name, trims, and rejects empty names / unknown pages', () => {
      expect(state.RenamePage('Page 1', '  Warm-up  ')).toBe(true);
      expect(state.ActivePageName).toBe('Warm-up');
      expect(state.RenamePage('warm-UP', 'Final')).toBe(true);
      expect(state.ActivePageName).toBe('Final');
      expect(state.RenamePage('Final', '   ')).toBe(false);
      expect(state.RenamePage('Ghost', 'X')).toBe(false);
    });

    it('is undoable', () => {
      state.RenamePage('Page 1', 'Renamed');
      expect(state.Undo()).toBe(true);
      expect(state.ActivePageName).toBe('Page 1');
    });
  });

  describe('RemovePage', () => {
    it('refuses to remove the last remaining page', () => {
      expect(state.RemovePage('Page 1')).toBe(false);
      expect(state.Pages).toHaveLength(1);
    });

    it('activates the NEXT neighbor when the active page is removed', () => {
      state.AddPage('B');
      state.AddPage('C');
      state.SwitchPage('B');
      expect(state.RemovePage('B')).toBe(true);
      expect(state.ActivePageName).toBe('C'); // the page that slid into B's slot
      expect(state.Pages.map((p) => p.Name)).toEqual(['Page 1', 'C']);
    });

    it('activates the PREVIOUS page when the removed active page was last', () => {
      state.AddPage('B'); // active
      expect(state.RemovePage('B')).toBe(true);
      expect(state.ActivePageName).toBe('Page 1');
    });

    it('keeps the active page when a non-active page is removed', () => {
      state.AddPage('B'); // active
      expect(state.RemovePage('Page 1')).toBe(true);
      expect(state.ActivePageName).toBe('B');
      expect(state.Pages).toHaveLength(1);
    });

    it('removes the page\'s items and is undoable as one step', () => {
      state.AddPage('B');
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'doomed' }, 'user');
      expect(state.TotalItemCount).toBe(1);
      state.RemovePage('B');
      expect(state.TotalItemCount).toBe(0);
      expect(state.Undo()).toBe(true);
      expect(state.Pages.map((p) => p.Name)).toEqual(['Page 1', 'B']);
      expect(state.TotalItemCount).toBe(1);
    });
  });

  describe('cancelable before/after page events', () => {
    it('PageAdding veto aborts the add (null result, nothing changes)', () => {
      state.PageAdding$.subscribe((e) => { e.Cancel = true; });
      const added: WhiteboardPageAddedEventArgs[] = [];
      state.PageAdded$.subscribe((e) => added.push(e));
      expect(state.AddPage('Denied')).toBeNull();
      expect(state.Pages).toHaveLength(1);
      expect(added).toHaveLength(0);
      expect(state.CanUndo).toBe(false);
    });

    it('PageAdding handlers may rewrite the name before the page is created', () => {
      state.PageAdding$.subscribe((e: WhiteboardPageAddingEventArgs) => { e.Name = 'Moderated'; });
      const page = state.AddPage('Raw');
      expect(page!.Name).toBe('Moderated');
    });

    it('PageSwitching veto keeps the current page (false result)', () => {
      state.AddPage('B');
      state.SwitchPage('Page 1');
      state.PageSwitching$.subscribe((e) => { e.Cancel = true; });
      const switched: WhiteboardPageSwitchedEventArgs[] = [];
      state.PageSwitched$.subscribe((e) => switched.push(e));
      expect(state.SwitchPage('B')).toBe(false);
      expect(state.ActivePageName).toBe('Page 1');
      expect(switched).toHaveLength(0);
    });

    it('PageRenaming veto keeps the old name; PageRenamed carries old + new', () => {
      const renamed: WhiteboardPageRenamedEventArgs[] = [];
      state.PageRenamed$.subscribe((e) => renamed.push(e));
      state.RenamePage('Page 1', 'First');
      expect(renamed[0].OldName).toBe('Page 1');
      expect(renamed[0].Page.Name).toBe('First');

      state.PageRenaming$.subscribe((e) => { e.Cancel = true; });
      expect(state.RenamePage('First', 'Second')).toBe(false);
      expect(state.ActivePageName).toBe('First');
    });

    it('PageRemoving veto keeps the page; PageRemoved reports the activated neighbor', () => {
      state.AddPage('B'); // active
      const removed: WhiteboardPageRemovedEventArgs[] = [];
      state.PageRemoved$.subscribe((e) => removed.push(e));
      expect(state.RemovePage('B')).toBe(true);
      expect(removed[0].Page.Name).toBe('B');
      expect(removed[0].ActivatedPage?.Name).toBe('Page 1');

      state.AddPage('C');
      state.PageRemoving$.subscribe((e) => { e.Cancel = true; });
      expect(state.RemovePage('C')).toBe(false);
      expect(state.Pages.map((p) => p.Name)).toContain('C');
    });
  });

  describe('perception (pages in deltas / summaries)', () => {
    it('scene deltas and summaries carry the page list with the active page marked', () => {
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a' }, 'user');
      state.AddPage('Lab');
      const summary = state.BuildSceneSummary();
      expect(summary.pages).toHaveLength(2);
      expect(summary.pages.find((p) => p.active)?.name).toBe('Lab');
      expect(summary.pages.find((p) => !p.active)?.items).toBe(1);
      expect(summary.summary).toContain('Active page "Lab"');
      expect(summary.summary).toContain('Other pages: "Page 1" (1)');

      const delta = state.BuildSceneDelta(0);
      expect(delta.pages.map((p) => p.name)).toEqual(['Page 1', 'Lab']);
      expect(delta.summary).toContain('Active page "Lab"');
    });

    it('a single-page board still names its page in the summary', () => {
      const summary = state.BuildSceneSummary();
      expect(summary.summary).toContain('Active page "Page 1" (the only page)');
    });
  });

  describe('persistence — paged shape round-trip', () => {
    it('round-trips pages, names, the active page, items and counters', () => {
      state.AddItem({ Kind: 'sticky', X: 1, Y: 2, Text: 'p1 item' }, 'user');
      state.AddPage('Drafts');
      state.AddItem({ Kind: 'text', X: 3, Y: 4, Text: 'p2 item' }, 'agent');
      state.RenamePage('Page 1', 'Intro');

      const restored = WhiteboardState.FromJSON(state.ToJSON());
      expect(restored.Pages.map((p) => p.Name)).toEqual(['Intro', 'Drafts']);
      expect(restored.ActivePageName).toBe('Drafts');
      expect(restored.Items).toEqual(state.Items);
      expect(restored.TotalItemCount).toBe(2);

      // id continuity holds across pages: a fresh page never reuses an id
      const page = restored.AddPage();
      expect(restored.Pages.map((p) => p.ID).filter((id) => id === page!.ID)).toHaveLength(1);
      expect(state.Pages.some((p) => p.ID === page!.ID)).toBe(false);
    });

    it('LoadFromJSON rehydrates the paged shape in place', () => {
      state.AddPage('Two');
      state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'x' }, 'user');
      const json = state.ToJSON();

      const target = new WhiteboardState();
      expect(target.LoadFromJSON(json)).toBe(true);
      expect(target.Pages.map((p) => p.Name)).toEqual(['Page 1', 'Two']);
      expect(target.ActivePageName).toBe('Two');
      expect(target.TotalItemCount).toBe(1);
    });
  });

  describe('persistence — legacy flat-shape migration', () => {
    /** Hand-built v1 payload exactly as the pre-pages engine serialized it. */
    const legacyJson = JSON.stringify({
      version: 1,
      seq: 7,
      idCounter: 2,
      zCounter: 2,
      items: [
        { ID: 'sticky-1', Kind: 'sticky', X: 10, Y: 20, Text: 'old note', Author: 'user', Z: 1 },
        { ID: 'text-2', Kind: 'text', X: 30, Y: 40, Text: 'old label', Author: 'agent', Z: 2 }
      ]
    });

    it('FromJSON migrates the old flat shape to a single page "Page 1"', () => {
      const restored = WhiteboardState.FromJSON(legacyJson);
      expect(restored.Pages).toHaveLength(1);
      expect(restored.Pages[0].Name).toBe('Page 1');
      expect(restored.ActivePageName).toBe('Page 1');
      expect(restored.Items).toHaveLength(2);
      expect((restored.GetItem('sticky-1') as WhiteboardStickyItem).Text).toBe('old note');
      expect(restored.CurrentSeq).toBe(7);
      // counters carried over — new items never collide with migrated ids
      const fresh = restored.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'new' }, 'user')!;
      expect(fresh.ID).toBe('text-3');
    });

    it('LoadFromJSON migrates the old flat shape in place (and re-serializes paged)', () => {
      expect(state.LoadFromJSON(legacyJson)).toBe(true);
      expect(state.Pages).toHaveLength(1);
      expect(state.Items).toHaveLength(2);
      const reserialized = JSON.parse(state.ToJSON()) as { version: number; pages: unknown[] };
      expect(reserialized.version).toBe(2);
      expect(reserialized.pages).toHaveLength(1);
    });

    it('stays tolerant of malformed input — LoadFromJSON false, FromJSON throws', () => {
      expect(state.LoadFromJSON('not json')).toBe(false);
      expect(state.LoadFromJSON('{"nope":true}')).toBe(false);
      expect(state.LoadFromJSON('[1,2,3]')).toBe(false);
      expect(state.Pages).toHaveLength(1); // untouched
      expect(() => WhiteboardState.FromJSON('{"nope":true}')).toThrow();
    });

    it('repairs damaged paged payloads instead of throwing (defensive normalization)', () => {
      const damaged = JSON.stringify({
        version: 2,
        pages: [null, { name: 'Only real page', items: [] }, { id: 'page-9' }],
        activePageId: 'ghost-page'
      });
      expect(state.LoadFromJSON(damaged)).toBe(true);
      expect(state.Pages.length).toBeGreaterThan(0);
      expect(state.ActivePageID).toBe(state.Pages[0].ID); // unknown active falls back
    });
  });

  describe('FindPage', () => {
    it('resolves by exact id first, then case-insensitive trimmed name', () => {
      state.AddPage('Notes');
      const byId = state.FindPage(state.Pages[1].ID);
      expect(byId?.Name).toBe('Notes');
      expect(state.FindPage(' notes ')?.Name).toBe('Notes');
      expect(state.FindPage('missing')).toBeUndefined();
    });
  });
});

describe('page agent tools (ApplyWhiteboardAgentTool)', () => {
  let state: WhiteboardState;

  beforeEach(() => {
    state = new WhiteboardState();
  });

  describe('Whiteboard_AddPage', () => {
    it('creates + switches to a new page (auto-named when name is omitted)', () => {
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddPage, '{}'));
      expect(result.success).toBe(true);
      expect(result.pageId).toBe(state.ActivePageID);
      expect(state.ActivePageName).toBe('Page 2');
      expect(result.summary).toContain('Page 2');
    });

    it('honors an explicit name and rejects non-string names', () => {
      const named = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddPage,
        JSON.stringify({ name: 'Quiz time' })));
      expect(named.success).toBe(true);
      expect(state.ActivePageName).toBe('Quiz time');

      const bad = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddPage, '{"name":42}'));
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('name');
    });

    it('item tools target the page the agent just created', () => {
      ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddPage, JSON.stringify({ name: 'Fresh' }));
      const note = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, '{"text":"landed here"}'));
      expect(note.success).toBe(true);
      expect(state.Items).toHaveLength(1);
      state.SwitchPage('Page 1');
      expect(state.Items).toHaveLength(0);
    });

    it('returns a canceled failure when PageAdding is vetoed', () => {
      state.PageAdding$.subscribe((e) => { e.Cancel = true; });
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddPage, '{}'));
      expect(result.success).toBe(false);
      expect(result.error).toContain('canceled');
      expect(state.Pages).toHaveLength(1);
    });
  });

  describe('Whiteboard_SwitchPage', () => {
    beforeEach(() => {
      state.AddPage('Deep Dive');
      state.SwitchPage('Page 1');
    });

    it('switches by case-insensitive name', () => {
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SwitchPage,
        JSON.stringify({ name: 'deep dive' })));
      expect(result.success).toBe(true);
      expect(state.ActivePageName).toBe('Deep Dive');
      expect(result.summary).toContain('Deep Dive');
    });

    it('switches by page id too', () => {
      const target = state.Pages.find((p) => p.Name === 'Deep Dive')!;
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SwitchPage,
        JSON.stringify({ name: target.ID })));
      expect(result.success).toBe(true);
      expect(state.ActivePageID).toBe(target.ID);
    });

    it('fails with the page list on unknown pages, and on a missing name', () => {
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SwitchPage,
        JSON.stringify({ name: 'Atlantis' })));
      expect(unknown.success).toBe(false);
      expect(unknown.error).toContain('Atlantis');
      expect(unknown.error).toContain('"Deep Dive"'); // self-correction hint: the page list
      expect(state.ActivePageName).toBe('Page 1');

      const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SwitchPage, '{}'));
      expect(missing.success).toBe(false);
    });

    it('returns a canceled failure when PageSwitching is vetoed', () => {
      state.PageSwitching$.subscribe((e) => { e.Cancel = true; });
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SwitchPage,
        JSON.stringify({ name: 'Deep Dive' })));
      expect(result.success).toBe(false);
      expect(result.error).toContain('canceled');
    });
  });

  describe('Whiteboard_RenamePage', () => {
    it('renames by current name (case-insensitive) or id', () => {
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RenamePage,
        JSON.stringify({ name: 'pAgE 1', newName: 'Kickoff' })));
      expect(result.success).toBe(true);
      expect(state.ActivePageName).toBe('Kickoff');
      expect(result.summary).toContain('Kickoff');
    });

    it('fails on unknown pages and missing args', () => {
      const unknown = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RenamePage,
        JSON.stringify({ name: 'Ghost', newName: 'X' })));
      expect(unknown.success).toBe(false);
      expect(unknown.error).toContain('Ghost');

      const missing = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RenamePage,
        JSON.stringify({ name: 'Page 1' })));
      expect(missing.success).toBe(false);
      expect(missing.error).toContain('newName');
    });

    it('returns a canceled failure when PageRenaming is vetoed', () => {
      state.PageRenaming$.subscribe((e) => { e.Cancel = true; });
      const result = parseResult(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.RenamePage,
        JSON.stringify({ name: 'Page 1', newName: 'Nope' })));
      expect(result.success).toBe(false);
      expect(result.error).toContain('canceled');
      expect(state.ActivePageName).toBe('Page 1');
    });
  });
});
