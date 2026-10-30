import { describe, it, expect, beforeEach } from 'vitest';
import {
  WhiteboardChange, WhiteboardItem, WhiteboardState, WhiteboardWidgetStateChangedEventArgs
} from '../lib/whiteboard-state';
import { WHITEBOARD_WIDGET_STATE_MAX_CHARS } from '../lib/whiteboard-widget-protocol';

/** U6 — the widget-state side map lives outside the board model (PLAN §7.4). */
describe('WhiteboardState widget state', () => {
  let state: WhiteboardState;
  let changes: WhiteboardChange[];
  let stateEvents: WhiteboardWidgetStateChangedEventArgs[];

  function addWidget(): WhiteboardItem {
    const item = state.AddItem({ Kind: 'html', X: 0, Y: 0, W: 200, H: 120, Html: '<p>w</p>', Title: 'Quiz' }, 'agent');
    if (!item) {
      throw new Error('AddItem was vetoed');
    }
    return item;
  }

  beforeEach(() => {
    state = new WhiteboardState();
    changes = [];
    stateEvents = [];
    state.Changed$.subscribe(c => changes.push(c));
    state.WidgetStateChanged$.subscribe(e => stateEvents.push(e));
  });

  it('should set, get and clear state without touching Changed$, the journal or undo', () => {
    const w = addWidget();
    const seq = state.CurrentSeq;
    changes = [];
    state.SetWidgetState(w.ID, '{"q":1}');
    expect(state.GetWidgetState(w.ID)).toBe('{"q":1}');
    expect(changes).toHaveLength(0);
    expect(state.CurrentSeq).toBe(seq);
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0]).toBeInstanceOf(WhiteboardWidgetStateChangedEventArgs);
    expect(stateEvents[0].ItemID).toBe(w.ID);

    state.SetWidgetState(w.ID, null);
    expect(state.GetWidgetState(w.ID)).toBeNull();
    expect(stateEvents).toHaveLength(2);
    expect(changes).toHaveLength(0);
  });

  it('should not fire for a no-op set or for clearing an absent entry', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"a":1}');
    state.SetWidgetState(w.ID, '{"a":1}');
    state.SetWidgetState('html-99', null);
    expect(stateEvents).toHaveLength(1);
  });

  it('should refuse oversize state instead of clipping it', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, 'x'.repeat(WHITEBOARD_WIDGET_STATE_MAX_CHARS + 1));
    expect(state.GetWidgetState(w.ID)).toBeNull();
    expect(stateEvents).toHaveLength(0);
  });

  it('should not be rewound by undo/redo', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"step":1}');
    state.UpdateItem(w.ID, { Title: 'Renamed' }, 'user');
    state.SetWidgetState(w.ID, '{"step":2}');
    expect(state.Undo()).toBe(true);
    expect(state.GetWidgetState(w.ID)).toBe('{"step":2}');
    expect(state.Redo()).toBe(true);
    expect(state.GetWidgetState(w.ID)).toBe('{"step":2}');
  });

  it('should be absent from ToJSON and ignored by LoadFromJSON', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"secret":"answer"}');
    const json = state.ToJSON();
    expect(json).not.toContain('secret');
    expect(json).not.toContain('widgetStates');

    const other = new WhiteboardState();
    expect(other.LoadFromJSON(json)).toBe(true);
    expect(other.GetWidgetState(w.ID)).toBeNull();
    expect(other.WidgetStatesToJSON()).toEqual({});
  });

  it('should keep state when the content is updated', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"q":3}');
    state.UpdateItem(w.ID, { Html: '<p>dark mode</p>' }, 'agent');
    expect(state.GetWidgetState(w.ID)).toBe('{"q":3}');
  });

  it('should export only items that still exist, on any page', () => {
    const a = addWidget();
    const b = addWidget();
    state.SetWidgetState(a.ID, '"a"');
    state.SetWidgetState(b.ID, '"b"');
    state.AddPage('Second');
    state.SwitchPage('Second');
    const c = addWidget();
    state.SetWidgetState(c.ID, '"c"');
    state.SwitchPage('Page 1');
    state.RemoveItem(b.ID, 'user');
    expect(state.WidgetStatesToJSON()).toEqual({ [a.ID]: '"a"', [c.ID]: '"c"' });
  });

  it('should give state back on undo of a remove', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"kept":true}');
    state.RemoveItem(w.ID, 'user');
    expect(state.WidgetStatesToJSON()).toEqual({});
    state.Undo();
    expect(state.GetItem(w.ID)).toBeDefined();
    expect(state.GetWidgetState(w.ID)).toBe('{"kept":true}');
    expect(state.WidgetStatesToJSON()).toEqual({ [w.ID]: '{"kept":true}' });
  });

  it('should clear a stale entry when an undone ID is re-minted', () => {
    const w = addWidget();
    state.SetWidgetState(w.ID, '{"old":true}');
    state.Undo(); // removes the add; idCounter is reset with the snapshot
    expect(state.GetItem(w.ID)).toBeUndefined();
    const again = addWidget();
    expect(again.ID).toBe(w.ID);
    expect(state.GetWidgetState(again.ID)).toBeNull();
  });

  it('should prune on Clear and on page removal', () => {
    const a = addWidget();
    state.SetWidgetState(a.ID, '"a"');
    state.AddPage('Second');
    state.SwitchPage('Second');
    const b = addWidget();
    state.SetWidgetState(b.ID, '"b"');
    state.SwitchPage('Page 1');

    state.Clear('user');
    expect(state.GetWidgetState(a.ID)).toBeNull();
    expect(state.GetWidgetState(b.ID)).toBe('"b"');

    state.RemovePage('Second');
    expect(state.GetWidgetState(b.ID)).toBeNull();
  });

  it('should replace (never merge) on LoadWidgetStates and drop invalid values', () => {
    const a = addWidget();
    const b = addWidget();
    state.SetWidgetState(a.ID, '"old-a"');
    stateEvents = [];
    const record: Record<string, string> = { [b.ID]: '"b"', 'html-9': 'x'.repeat(WHITEBOARD_WIDGET_STATE_MAX_CHARS + 1) };
    (record as Record<string, string | number>)['html-8'] = 42;
    state.LoadWidgetStates(record);
    expect(state.GetWidgetState(a.ID)).toBeNull();
    expect(state.GetWidgetState(b.ID)).toBe('"b"');
    expect(state.GetWidgetState('html-9')).toBeNull();
    expect(state.GetWidgetState('html-8')).toBeNull();
    expect(stateEvents.map(e => e.ItemID).sort()).toEqual([a.ID, b.ID].sort());
    expect(changes.filter(c => c.Op === 'replace')).toHaveLength(0);
  });

  it('FindItemPage finds an item on any page, and null for unknown IDs', () => {
    const a = addWidget();
    const second = state.AddPage('Second');
    state.SwitchPage('Second');
    const b = addWidget();
    state.SwitchPage('Page 1');
    expect(state.FindItemPage(a.ID)).toEqual({ ID: 'page-1', Name: 'Page 1' });
    expect(state.FindItemPage(b.ID)).toEqual({ ID: second?.ID, Name: 'Second' });
    expect(state.FindItemPage('html-404')).toBeNull();
    state.RemoveItem(a.ID, 'user');
    expect(state.FindItemPage(a.ID)).toBeNull();
  });
});
