import { describe, it, expect } from 'vitest';
import { ParseBoardStateJson } from './whiteboard-snapshot.component';
import { WhiteboardStickyItem } from './whiteboard-state';

/**
 * ParseBoardStateJson is the entry point for SHARED board payloads (artifact viewer,
 * session review). Hostile closed-set item fields must be coerced on load (issue #5569).
 * Lives in the DOM project because the module also declares an Angular component.
 */
describe('ParseBoardStateJson', () => {
  it('coerces hostile Author / FontWeight / FontFamily on persisted items', () => {
    const json = JSON.stringify({
      version: 2,
      activePageId: 'page-1',
      pages: [{
        id: 'page-1',
        name: 'P',
        items: [{
          ID: 'sticky-1', Kind: 'sticky', X: 0, Y: 0, Text: 'a', Z: 1,
          Author: 'x"><img src=x onerror=alert(1)>', FontWeight: '700;"><img>', FontFamily: '__proto__'
        }]
      }]
    });
    const state = ParseBoardStateJson(json);
    const item = state!.GetItem('sticky-1') as WhiteboardStickyItem;
    expect(item.Author).toBe('user');
    expect(item.FontWeight).toBeUndefined();
    expect(item.FontFamily).toBeUndefined();
  });

  it('still returns null for malformed input', () => {
    expect(ParseBoardStateJson('not json')).toBeNull();
    expect(ParseBoardStateJson('')).toBeNull();
  });
});
