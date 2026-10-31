import { describe, it, expect } from 'vitest';
import {
  BuildWidgetCommandMessage, EvaluateWidgetChannelMessage, IsWhiteboardWidgetErrorCode,
  WHITEBOARD_WIDGET_ACTIONS_MARKER, WHITEBOARD_WIDGET_COMMAND_MARKER, WHITEBOARD_WIDGET_DEADLINES_MS,
  WHITEBOARD_WIDGET_MAX_ACTIONS, WHITEBOARD_WIDGET_READY_MARKER, WHITEBOARD_WIDGET_REPLY_MARKER,
  WHITEBOARD_WIDGET_REPLY_MAX_CHARS, WHITEBOARD_WIDGET_STATE_MARKER, WHITEBOARD_WIDGET_STATE_MAX_CHARS
} from '../lib/whiteboard-widget-protocol';

/**
 * The TWO-WAY widget protocol's pure half: command construction and the tolerant
 * host-side validator for ready / actions / state / reply messages.
 */

const SOURCE = { ItemID: 'html-2' };

describe('EvaluateWidgetChannelMessage — routing', () => {
  it('ignores traffic without a protocol marker', () => {
    for (const data of [null, undefined, 'x', 42, [], {}, { __mjWhiteboardSubmit: true }]) {
      expect(EvaluateWidgetChannelMessage(data, SOURCE)).toEqual({ Kind: 'dropped', Reason: 'not-widget-channel' });
    }
  });

  it('drops a marked message from an untracked sender', () => {
    const data = { [WHITEBOARD_WIDGET_READY_MARKER]: true, doc: 'd1', actions: [] };
    expect(EvaluateWidgetChannelMessage(data, null)).toEqual({ Kind: 'dropped', Reason: 'unknown-source' });
  });
});

describe('ready', () => {
  it('accepts a ready with its document token, actions and state flag', () => {
    const data = { [WHITEBOARD_WIDGET_READY_MARKER]: true, doc: 'd1', hasState: true, actions: [{ name: 'next', description: ' Go on ' }] };
    expect(EvaluateWidgetChannelMessage(data, SOURCE)).toEqual({
      Kind: 'accepted',
      Message: { Kind: 'ready', ItemID: 'html-2', DocumentToken: 'd1', HasState: true, Actions: [{ Name: 'next', Description: 'Go on' }] }
    });
  });

  it('requires a document token', () => {
    const data = { [WHITEBOARD_WIDGET_READY_MARKER]: true, actions: [] };
    expect(EvaluateWidgetChannelMessage(data, SOURCE)).toEqual({ Kind: 'dropped', Reason: 'bad-shape' });
  });

  it('treats a missing action list as empty and a non-array as malformed', () => {
    const ok = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_READY_MARKER]: true, doc: 'd' }, SOURCE);
    expect(ok.Kind === 'accepted' && ok.Message.Kind === 'ready' && ok.Message.Actions).toEqual([]);
    const bad = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_READY_MARKER]: true, doc: 'd', actions: 'next' }, SOURCE);
    expect(bad).toEqual({ Kind: 'dropped', Reason: 'bad-shape' });
  });
});

describe('actions', () => {
  it('drops invalid names, de-duplicates, and caps the list', () => {
    const many = Array.from({ length: WHITEBOARD_WIDGET_MAX_ACTIONS + 5 }, (_, i) => ({ name: `a${i}` }));
    const actions = [{ name: '1bad' }, { name: 'has space' }, { name: 'ok' }, { name: 'ok' }, { nope: 1 }, ...many];
    const out = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_ACTIONS_MARKER]: true, actions }, SOURCE);
    expect(out.Kind).toBe('accepted');
    if (out.Kind === 'accepted' && out.Message.Kind === 'actions') {
      expect(out.Message.Actions[0]).toEqual({ Name: 'ok' });
      expect(out.Message.Actions).toHaveLength(WHITEBOARD_WIDGET_MAX_ACTIONS);
      expect(out.Message.Actions.filter((a) => a.Name === 'ok')).toHaveLength(1);
    }
  });
});

describe('state', () => {
  it('accepts JSON text within the cap', () => {
    const out = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_STATE_MARKER]: true, state: '{"q":1}' }, SOURCE);
    expect(out).toEqual({ Kind: 'accepted', Message: { Kind: 'state', ItemID: 'html-2', StateJson: '{"q":1}' } });
  });

  it('refuses oversize state rather than clipping it', () => {
    const state = JSON.stringify({ s: 'x'.repeat(WHITEBOARD_WIDGET_STATE_MAX_CHARS) });
    expect(EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_STATE_MARKER]: true, state }, SOURCE))
      .toEqual({ Kind: 'dropped', Reason: 'oversize' });
  });

  it('carries the optional document token', () => {
    const out = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_STATE_MARKER]: true, state: '{"q":1}', doc: 'd-1' }, SOURCE);
    expect(out).toEqual({ Kind: 'accepted', Message: { Kind: 'state', ItemID: 'html-2', StateJson: '{"q":1}', DocumentToken: 'd-1' } });
  });

  it('refuses a malformed document token', () => {
    for (const doc of ['', 'x'.repeat(65), 7, null]) {
      expect(EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_STATE_MARKER]: true, state: '{"q":1}', doc }, SOURCE))
        .toEqual({ Kind: 'dropped', Reason: 'bad-shape' });
    }
  });

  it('refuses non-string or non-JSON state', () => {
    for (const state of [{ q: 1 }, 'not json {']) {
      expect(EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_STATE_MARKER]: true, state }, SOURCE))
        .toEqual({ Kind: 'dropped', Reason: 'bad-shape' });
    }
  });
});

describe('reply', () => {
  it('accepts a success reply with a result', () => {
    const data = { [WHITEBOARD_WIDGET_REPLY_MARKER]: true, id: 'c1', ok: true, result: { outline: 'x' } };
    expect(EvaluateWidgetChannelMessage(data, SOURCE)).toEqual({
      Kind: 'accepted', Message: { Kind: 'reply', ItemID: 'html-2', Reply: { ID: 'c1', Ok: true, Result: { outline: 'x' } } }
    });
  });

  it('keeps known failure codes and drops unknown ones', () => {
    const known = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_REPLY_MARKER]: true, id: 'c', ok: false, error: 'gone', code: 'stale_ref' }, SOURCE);
    expect(known.Kind === 'accepted' && known.Message.Kind === 'reply' && known.Message.Reply)
      .toEqual({ ID: 'c', Ok: false, Error: 'gone', Code: 'stale_ref' });
    const unknown = EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_REPLY_MARKER]: true, id: 'c', ok: false, code: 'rm -rf' }, SOURCE);
    expect(unknown.Kind === 'accepted' && unknown.Message.Kind === 'reply' && unknown.Message.Reply).toEqual({ ID: 'c', Ok: false });
  });

  it('requires an id and an ok flag, and caps the result', () => {
    expect(EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_REPLY_MARKER]: true, ok: true }, SOURCE).Kind).toBe('dropped');
    expect(EvaluateWidgetChannelMessage({ [WHITEBOARD_WIDGET_REPLY_MARKER]: true, id: 'c', ok: 'yes' }, SOURCE).Kind).toBe('dropped');
    const huge = { [WHITEBOARD_WIDGET_REPLY_MARKER]: true, id: 'c', ok: true, result: 'x'.repeat(WHITEBOARD_WIDGET_REPLY_MAX_CHARS) };
    expect(EvaluateWidgetChannelMessage(huge, SOURCE)).toEqual({ Kind: 'dropped', Reason: 'oversize' });
  });
});

describe('commands and constants', () => {
  it('builds the documented command shape', () => {
    expect(BuildWidgetCommandMessage('c1', 'inspect', null))
      .toEqual({ [WHITEBOARD_WIDGET_COMMAND_MARKER]: true, id: 'c1', op: 'inspect', args: null });
  });

  it('keeps every deadline under the 15 s provider tool-result barrier', () => {
    for (const ms of Object.values(WHITEBOARD_WIDGET_DEADLINES_MS)) {
      expect(ms).toBeLessThan(15000);
    }
  });

  it('recognizes only documented error codes', () => {
    expect(IsWhiteboardWidgetErrorCode('widget_timeout')).toBe(true);
    expect(IsWhiteboardWidgetErrorCode('nope')).toBe(false);
  });
});
