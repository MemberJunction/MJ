import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardHostComponent } from './whiteboard-host.component';
import { WhiteboardState, WhiteboardWidgetStateChangedEventArgs } from './whiteboard-state';
import { WhiteboardToolResult, WHITEBOARD_TOOL_NAMES, WhiteboardWidgetAccess } from './whiteboard-tools';
import { WhiteboardWidgetCommandMessage } from './whiteboard-widget-protocol';

/**
 * DOM spec for the host's widget-tool surface (PLAN §7.3, D7): `ApplyAgentToolAsync` for
 * widget and board tools, the `AgentWidgetAccess` levels, the presence label, and the widget
 * toast (never merged with the board-edit toast, never an Undo). The frame's helper is played
 * by dispatching window messages whose `source` is the frame's contentWindow.
 */
describe('RealtimeWhiteboardHostComponent — widget tools (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<RealtimeWhiteboardHostComponent>>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const render = (access?: WhiteboardWidgetAccess | string): { state: WhiteboardState; fix: Fix } => {
    const state = new WhiteboardState();
    state.AddItem({ Kind: 'html', X: 40, Y: 40, W: 300, H: 200, Html: '<p>quiz</p>', Title: 'Planet quiz' }, 'agent');
    const inputs: Record<string, unknown> = { State: state, AgentName: 'Ava' };
    if (access !== undefined) {
      inputs['AgentWidgetAccess'] = access;
    }
    const fix = renderComponentFixture(RealtimeWhiteboardHostComponent, { inputs });
    fix.detectChanges();
    return { state, fix };
  };

  const parse = (json: string): WhiteboardToolResult => JSON.parse(json) as WhiteboardToolResult;

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }
  };

  /** Mount + ready the widget's frame and capture what the host posts to it. */
  const readyWidget = (fix: Fix): { win: Window; posts: WhiteboardWidgetCommandMessage[] } => {
    const frame = fix.nativeElement.querySelector('iframe.html-card__frame[data-item-id="html-1"]') as HTMLIFrameElement;
    const win = frame.contentWindow!;
    const posts: WhiteboardWidgetCommandMessage[] = [];
    vi.spyOn(win, 'postMessage').mockImplementation((m: WhiteboardWidgetCommandMessage) => {
      posts.push(m);
    });
    window.dispatchEvent(new MessageEvent('message', {
      data: { __mjWhiteboardReady: true, doc: 'd1', actions: [], hasState: false }, source: win
    }));
    return { win, posts };
  };

  const reply = (win: Window, id: string, result: object): void => {
    window.dispatchEvent(new MessageEvent('message', { data: { __mjWhiteboardReply: true, id, ok: true, result }, source: win }));
  };

  /** Run one widget tool end to end, answering the posted command with `result`. */
  const runWidgetTool = async (fix: Fix, tool: string, args: object, result: object): Promise<WhiteboardToolResult> => {
    const { win, posts } = readyWidget(fix);
    const pending = fix.componentInstance.ApplyAgentToolAsync(tool, JSON.stringify(args));
    await flush();
    const command = posts.find((m) => m.op !== 'restoreState');
    if (!command) {
      throw new Error('no command was posted');
    }
    reply(win, command.id, result);
    const out = parse(await pending);
    fix.detectChanges();
    return out;
  };

  it('the sync entry point refuses widget tools with async_required', () => {
    const { fix } = render();
    const r = parse(fix.componentInstance.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.InspectWidget, '{"itemId":"html-1"}'));
    expect(r).toMatchObject({ success: false, errorCode: 'async_required' });
  });

  it('the async entry point runs board tools on the existing path', async () => {
    const { state, fix } = render();
    const r = parse(await fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.AddNote, '{"text":"hi"}'));
    expect(r.success).toBe(true);
    expect(state.GetItem(r.itemId!)?.Kind).toBe('sticky');
    expect(fix.componentInstance.ToastText).toContain('added a note');
  });

  it('inspects a widget: result JSON, "looking at" presence, no toast, view unmoved', async () => {
    const { fix } = render();
    const pan = [fix.componentInstance.Board!.PanX, fix.componentInstance.Board!.PanY];
    const r = await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' }, { outline: 'f1 radio "Venus"', actions: [] });
    expect(r).toMatchObject({ success: true, itemId: 'html-1', outline: 'f1 radio "Venus"' });
    expect(fix.componentInstance.AgentPresence?.Label).toBe('Ava is looking at Planet quiz');
    expect(fix.componentInstance.WidgetToastText).toBeNull();
    expect(fix.componentInstance.ToastText).toBeNull();
    expect([fix.componentInstance.Board!.PanX, fix.componentInstance.Board!.PanY]).toEqual(pan);
  });

  it('a multi-step toast names the last step, and a bare ref reads as "a control" (E2E polish)', async () => {
    const { fix } = render();
    await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.OperateWidget,
      { itemId: 'html-1', steps: [{ target: 'f2', op: 'check' }, { target: 'Submit Answers', op: 'click' }] },
      { steps: [{ ok: true }, { ok: true }], outline: 'done' });
    expect(fix.componentInstance.WidgetToastText).toBe('Ava clicked "Submit Answers" (2 steps) in Planet quiz');
    await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.OperateWidget,
      { itemId: 'html-1', steps: [{ target: 'f2', op: 'check' }] },
      { steps: [{ ok: true }], outline: 'done' });
    expect(fix.componentInstance.WidgetToastText).toBe('Ava checked a control in Planet quiz');
  });

  it('operates a widget: "using" presence and a widget toast with no Undo', async () => {
    const { fix } = render();
    const r = await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.OperateWidget,
      { itemId: 'html-1', steps: [{ target: 'Submit', op: 'click' }] },
      { steps: [{ ok: true }], outline: 'done', submitted: { answer: 'Venus' } });
    expect(r).toMatchObject({ success: true, submitted: { answer: 'Venus' } });
    expect(fix.componentInstance.AgentPresence?.Label).toBe('Ava is using Planet quiz');
    expect(fix.componentInstance.WidgetToastText).toBe('Ava clicked "Submit" in Planet quiz');
    const toast = fix.nativeElement.querySelector('.board-toast--widget') as HTMLElement;
    expect(toast.textContent).toContain('clicked "Submit"');
    expect(toast.querySelector('.undo')).toBeNull();
  });

  it('a widget toast never merges with the board-edit toast', async () => {
    const { fix } = render();
    fix.componentInstance.ApplyAgentTool(WHITEBOARD_TOOL_NAMES.AddNote, '{"text":"hi"}');
    await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.CallWidget, { itemId: 'html-1', action: 'next' }, { result: 2 });
    expect(fix.componentInstance.ToastText).toBe('Ava added a note · just now');
    expect(fix.componentInstance.WidgetToastText).toBe('Ava ran "next" in Planet quiz');
    const toasts = Array.from(fix.nativeElement.querySelectorAll('.board-toast')) as HTMLElement[];
    expect(toasts).toHaveLength(2);
    expect(toasts[1].classList.contains('board-toast--stacked')).toBe(true);
  });

  it('passes the operate steps to the frame as camelCase wire args', async () => {
    const { fix } = render();
    const { posts, win } = readyWidget(fix);
    const pending = fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.OperateWidget,
      JSON.stringify({ itemId: 'html-1', steps: [{ target: 'f1', op: 'set', value: 'Venus' }] }));
    await flush();
    const operate = posts.find((m) => m.op === 'operate')!;
    expect(operate.args).toMatchObject({ steps: [{ target: 'f1', op: 'set', value: 'Venus' }] });
    reply(win, operate.id, { steps: [{ ok: true }], outline: '' });
    await pending;
  });

  describe('AgentWidgetAccess', () => {
    it('defaults to full and normalizes unknown values to full', () => {
      expect(render().fix.componentInstance.AgentWidgetAccess).toBe('full');
      expect(render('nonsense').fix.componentInstance.AgentWidgetAccess).toBe('full');
    });

    it('off refuses every widget tool with access_denied', async () => {
      const { fix } = render('off');
      for (const tool of [WHITEBOARD_TOOL_NAMES.InspectWidget, WHITEBOARD_TOOL_NAMES.OperateWidget, WHITEBOARD_TOOL_NAMES.CallWidget]) {
        const r = parse(await fix.componentInstance.ApplyAgentToolAsync(tool, '{"itemId":"html-1","action":"next","steps":[{"target":"a1","op":"click"}]}'));
        expect(r, tool).toMatchObject({ success: false, errorCode: 'access_denied' });
      }
      expect(fix.componentInstance.AgentPresence).toBeNull();
    });

    it('inspect-only refuses operate and call but allows inspect', async () => {
      const { fix } = render('inspect-only');
      const op = parse(await fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.OperateWidget,
        '{"itemId":"html-1","steps":[{"target":"a1","op":"click"}]}'));
      expect(op).toMatchObject({ success: false, errorCode: 'access_denied' });
      expect(op.error).toContain('Whiteboard_InspectWidget');
      const call = parse(await fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.CallWidget, '{"itemId":"html-1","action":"next"}'));
      expect(call.errorCode).toBe('access_denied');
      const inspect = await runWidgetTool(fix, WHITEBOARD_TOOL_NAMES.InspectWidget, { itemId: 'html-1' }, { outline: 'x' });
      expect(inspect.success).toBe(true);
    });
  });

  it('reports invalid_args and widget_not_found', async () => {
    const { fix } = render();
    const bad = parse(await fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.OperateWidget, '{"itemId":"html-1","steps":[]}'));
    expect(bad).toMatchObject({ success: false, errorCode: 'invalid_args', itemId: 'html-1' });
    const missing = parse(await fix.componentInstance.ApplyAgentToolAsync(WHITEBOARD_TOOL_NAMES.InspectWidget, '{"itemId":"html-9"}'));
    expect(missing).toMatchObject({ success: false, errorCode: 'widget_not_found' });
  });

  it('re-emits WidgetStateChanged from the state engine', () => {
    const { state, fix } = render();
    const seen: WhiteboardWidgetStateChangedEventArgs[] = [];
    fix.componentInstance.WidgetStateChanged.subscribe((e) => seen.push(e));
    state.SetWidgetState('html-1', '{"q":1}');
    expect(seen.map((e) => e.ItemID)).toEqual(['html-1']);
  });
});
