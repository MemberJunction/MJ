import { describe, it, expect } from 'vitest';
import { NormalizeWhiteboardTag, WhiteboardState, WhiteboardTagClass, WHITEBOARD_TAG_MAX_CHARS } from '../lib/whiteboard-state';
import { ApplyWhiteboardAgentTool, WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES } from '../lib/whiteboard-tools';

/**
 * Per-item `Tag` (LXP P14.1): a free-form role tag that lands on the item's wrapper as a
 * `wb-tag-<slug>` class, so a host restyling the board from outside can tell two ROLES of one
 * kind apart (a shape as a section head vs an empty "fill this in" slot). One optional field,
 * zero behavior: persisted with the item, settable by the agent's Add* tools and by an
 * UpdateItem patch, carried in the compact scene view as `tag`.
 */
describe('WhiteboardTagClass — the DOM hook', () => {
  it('lower-cases and dash-joins the tag into a wb-tag-* class', () => {
    expect(WhiteboardTagClass('slot')).toBe('wb-tag-slot');
    expect(WhiteboardTagClass('Step Done')).toBe('wb-tag-step-done');
    expect(WhiteboardTagClass('  heading/2 ')).toBe('wb-tag-heading-2');
  });

  it('yields no class for an empty, blank or symbol-only tag', () => {
    expect(WhiteboardTagClass(undefined)).toBe('');
    expect(WhiteboardTagClass('')).toBe('');
    expect(WhiteboardTagClass('   ')).toBe('');
    expect(WhiteboardTagClass('***')).toBe('');
  });

  it('caps the slug so a paragraph pasted as a tag cannot balloon the class attribute', () => {
    const long = 'a'.repeat(WHITEBOARD_TAG_MAX_CHARS + 40);
    expect(WhiteboardTagClass(long)).toBe(`wb-tag-${'a'.repeat(WHITEBOARD_TAG_MAX_CHARS)}`);
  });

  it('a cap that lands on a dash drops the dash (no trailing separator in the class)', () => {
    const tag = `${'a'.repeat(WHITEBOARD_TAG_MAX_CHARS - 1)} tail`;
    expect(WhiteboardTagClass(tag)).toBe(`wb-tag-${'a'.repeat(WHITEBOARD_TAG_MAX_CHARS - 1)}`);
  });

  it('trims long runs of separators at both ends without backtracking regexes (CodeQL js/polynomial-redos)', () => {
    const run = '-'.repeat(50_000);
    expect(WhiteboardTagClass(`${run}slot${run}`)).toBe('wb-tag-slot');
    expect(WhiteboardTagClass(run)).toBe('');
  });
});

describe('WhiteboardState — Tag on items', () => {
  it('AddItem keeps the tag and ToJSON/FromJSON round-trips it', () => {
    const state = new WhiteboardState();
    const added = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 50, Label: 'Fill me', Tag: 'slot' }, 'agent');
    expect(added?.Tag).toBe('slot');
    const restored = WhiteboardState.FromJSON(state.ToJSON());
    expect(restored.GetItem(added!.ID)?.Tag).toBe('slot');
  });

  it('an untagged item stays untagged (no phantom field)', () => {
    const state = new WhiteboardState();
    const added = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'hi' }, 'user');
    expect(added?.Tag).toBeUndefined();
  });

  it('UpdateItem re-tags through the patch', () => {
    const state = new WhiteboardState();
    const added = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'hi' }, 'user')!;
    expect(state.UpdateItem(added.ID, { Tag: 'heading' }, 'user')).toBe(true);
    expect(state.GetItem(added.ID)?.Tag).toBe('heading');
  });

  it('clearing a tag drops the key instead of persisting an empty string', () => {
    const state = new WhiteboardState();
    const added = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'hi', Tag: 'slot' }, 'user')!;
    expect(state.UpdateItem(added.ID, { Tag: '' }, 'user')).toBe(true);
    expect('Tag' in state.GetItem(added.ID)!).toBe(false);
    expect(state.ToJSON()).not.toContain('"Tag"');
  });

  it('a blank or padded tag is normalized on the way in', () => {
    const state = new WhiteboardState();
    const blank = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a', Tag: '   ' }, 'user')!;
    const padded = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'b', Tag: '  heading ' }, 'user')!;
    expect('Tag' in blank).toBe(false);
    expect(padded.Tag).toBe('heading');
    expect(NormalizeWhiteboardTag(undefined)).toBeUndefined();
    expect(NormalizeWhiteboardTag(' x ')).toBe('x');
  });

  it('the class helper is memoized per tag (the board calls it per item per change-detection pass)', () => {
    const first = WhiteboardTagClass('memo-check');
    const second = WhiteboardTagClass('memo-check');
    expect(second).toBe(first);
    expect(first).toBe('wb-tag-memo-check');
  });

  it('the compact scene view carries the tag, and omits it when unset', () => {
    const state = new WhiteboardState();
    const tagged = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'a', Tag: 'slot' }, 'agent')!;
    const plain = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'b' }, 'agent')!;
    const items = state.BuildSceneSummary().items;
    expect(items.find((i) => i.id === tagged.ID)?.tag).toBe('slot');
    expect(items.find((i) => i.id === plain.ID)?.tag).toBeUndefined();
  });
});

describe('agent tools — the optional tag argument', () => {
  const addTools = [
    WHITEBOARD_TOOL_NAMES.AddNote, WHITEBOARD_TOOL_NAMES.AddShape, WHITEBOARD_TOOL_NAMES.AddText,
    WHITEBOARD_TOOL_NAMES.AddMarkdown, WHITEBOARD_TOOL_NAMES.AddHtml,
  ];

  it('every Add* tool schema offers an optional tag', () => {
    for (const name of addTools) {
      const def = WHITEBOARD_TOOL_DEFINITIONS.find((d) => d.Name === name);
      const props = def?.ParametersSchema['properties'] as Record<string, unknown> | undefined;
      expect(props?.['tag'], name).toBeDefined();
      expect((def?.ParametersSchema['required'] as string[]) ?? []).not.toContain('tag');
    }
  });

  it('AddNote with a tag lands it on the item', () => {
    const state = new WhiteboardState();
    const result = JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'Fill this in', tag: 'slot' })));
    expect(result.success).toBe(true);
    expect(state.GetItem(result.itemId)?.Tag).toBe('slot');
  });

  it('AddShape with a tag lands it on the item', () => {
    const state = new WhiteboardState();
    const result = JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddShape, JSON.stringify({ label: 'Step 1', tag: 'step-done' })));
    expect(state.GetItem(result.itemId)?.Tag).toBe('step-done');
  });

  it('a blank tag is treated as no tag', () => {
    const state = new WhiteboardState();
    const result = JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.AddNote, JSON.stringify({ text: 'x', tag: '   ' })));
    expect(state.GetItem(result.itemId)?.Tag).toBeUndefined();
  });

  describe('Whiteboard_SetTag — re-tag an existing item of any kind', () => {
    it('is registered with itemId required and tag optional', () => {
      const def = WHITEBOARD_TOOL_DEFINITIONS.find((d) => d.Name === WHITEBOARD_TOOL_NAMES.SetTag);
      expect(def).toBeDefined();
      expect(def?.ParametersSchema['required']).toEqual(['itemId']);
      expect((def?.ParametersSchema['properties'] as Record<string, unknown>)['tag']).toBeDefined();
    });

    it('tags a shape (StyleItem could not: it is sticky/text only)', () => {
      const state = new WhiteboardState();
      const shape = state.AddItem({ Kind: 'shape', Shape: 'rect', X: 0, Y: 0, W: 100, H: 40, Label: 'Step 1' }, 'agent')!;
      const result = JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SetTag, JSON.stringify({ itemId: shape.ID, tag: 'step-done' })));
      expect(result.success).toBe(true);
      expect(state.GetItem(shape.ID)?.Tag).toBe('step-done');
    });

    it('an empty or omitted tag clears it', () => {
      const state = new WhiteboardState();
      const note = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'x', Tag: 'slot' }, 'agent')!;
      ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SetTag, JSON.stringify({ itemId: note.ID }));
      expect('Tag' in state.GetItem(note.ID)!).toBe(false);
    });

    it('fails cleanly on a missing itemId or an unknown item', () => {
      const state = new WhiteboardState();
      expect(JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SetTag, JSON.stringify({ tag: 'x' }))).success).toBe(false);
      expect(JSON.parse(ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SetTag, JSON.stringify({ itemId: 'nope-1', tag: 'x' }))).success).toBe(false);
    });

    it('is one undo step', () => {
      const state = new WhiteboardState();
      const note = state.AddItem({ Kind: 'sticky', X: 0, Y: 0, Text: 'x' }, 'user')!;
      ApplyWhiteboardAgentTool(state, WHITEBOARD_TOOL_NAMES.SetTag, JSON.stringify({ itemId: note.ID, tag: 'slot' }));
      expect(state.GetItem(note.ID)?.Tag).toBe('slot');
      state.Undo();
      expect(state.GetItem(note.ID)?.Tag).toBeUndefined();
    });
  });
});
