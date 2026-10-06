import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, ErrorHandler, OnDestroy, OnInit, type Type } from '@angular/core';
import { BehaviorSubject, EMPTY, Subject } from 'rxjs';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import {
  BaseRealtimeChannelClient,
  type RealtimeChannelFocusEvent,
  type RealtimeConnectionState,
} from '@memberjunction/realtime-runtime';
import { renderComponentFixture, query, click } from '@memberjunction/ng-test-utils';
import { RealtimeSessionOverlayComponent } from './realtime-session-overlay.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/** Every surface creation, destruction, bind and unbind, in order. */
const lifecycle: string[] = [];

/** Errors Angular reports while it runs change detection on its own (autoDetect), which would otherwise only be logged. */
const reported: unknown[] = [];

@Component({ selector: 'mj-test-board', standalone: true, template: '<div class="test-board">board</div>' })
class TestBoardComponent implements OnInit, OnDestroy {
  public ngOnInit(): void {
    lifecycle.push('created');
  }
  public ngOnDestroy(): void {
    lifecycle.push('destroyed');
  }
}

/** A whiteboard channel whose surface records its life. The whiteboard's tab registers as soon as the channel is live. */
class TestWhiteboardChannel extends BaseRealtimeChannelClient<TestBoardComponent> {
  public FocusExits = 0;
  public get ChannelName(): string { return 'Whiteboard'; }
  public get ToolNamePrefix(): string { return 'Whiteboard_'; }
  public get TabTitle(): string { return 'Whiteboard'; }
  public get TabIcon(): string { return 'fa-solid fa-chalkboard'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
  public override GetSurfaceComponent(): Type<TestBoardComponent> { return TestBoardComponent; }
  public override BindSurface(): void { lifecycle.push('bound'); }
  public override UnbindSurface(): void { lifecycle.push('unbound'); }
  public override RequestFocusExit(): void { this.FocusExits++; }
}

/** The session the overlay reads: its channel set and focus requests are driven by the test. */
function fakeSession() {
  const channels$ = new BehaviorSubject<BaseRealtimeChannelClient[]>([]);
  const focus$ = new Subject<RealtimeChannelFocusEvent>();
  const service = {
    Captions$: EMPTY,
    DelegationProgress$: EMPTY,
    DelegationResult$: EMPTY,
    DelegationNarration$: EMPTY,
    ThoughtNarration$: EMPTY,
    ConnectionState$: new BehaviorSubject<RealtimeConnectionState>('listening').asObservable(),
    ModelName$: new BehaviorSubject<string | null>(null).asObservable(),
    Active$: new BehaviorSubject(false).asObservable(),
    ActiveChannels$: channels$.asObservable(),
    get ActiveChannels(): readonly BaseRealtimeChannelClient[] { return channels$.value; },
    ChannelFocus$: focus$.asObservable(),
    ChannelActivity$: EMPTY,
    VideoSources$: new BehaviorSubject<readonly VideoSourceState[]>([]).asObservable(),
    IsActive: false,
    CurrentAgentSessionId: null,
    HasChannelBeenUsed: (): boolean => false,
    SetFocusedChannel: (): void => undefined,
    GetAudioActivity: () => null,
    SetVideoSourceEnabled: (): boolean => true,
    ToggleMute: (): boolean => false,
    SendText: (): void => undefined,
    SetMinimized: (): void => undefined,
    EndRealtimeSession: async (): Promise<void> => undefined,
    CancelDelegation: async (): Promise<boolean> => true,
  } satisfies Partial<RealtimeSessionService>;
  return { service, channels$, focus$ };
}

/**
 * DOM spec for the overlay's stage: a channel's surface is created once and kept while the panel collapses, while its
 * channel holds focus (it fills the stage) and when focus ends; it goes only when its channel leaves the session.
 * Real overlay, panel and stage; the session and the channel are fakes. jsdom lays nothing out, so the panel's slot
 * is given a box.
 */
describe('RealtimeSessionOverlayComponent: the stage (DOM)', () => {
  beforeEach(() => {
    lifecycle.length = 0;
    reported.length = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const slot = this.classList.contains('s-pane__slot');
      return new DOMRect(slot ? 600 : 0, slot ? 48 : 0, slot ? 380 : 0, slot ? 500 : 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    expect(reported).toEqual([]);
  });

  /** Lets the overlay's deferred work (tab registration, first-tab focus, slot report) land and render. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  /** A live call in console chrome with the whiteboard's tab open in the panel. */
  const renderWithBoard = async () => {
    const session = fakeSession();
    const board = new TestWhiteboardChannel();
    const f = renderComponentFixture(RealtimeSessionOverlayComponent, {
      providers: [
        { provide: RealtimeSessionService, useValue: session.service },
        { provide: ErrorHandler, useValue: { handleError: (error: unknown) => reported.push(error) } },
      ],
      inputs: { Chrome: 'console' },
      autoDetect: true,
    });
    session.channels$.next([board]);
    f.componentInstance.OnDetailsToggled();
    await settle();
    return { f, board, ...session };
  };

  const surface = (f: Awaited<ReturnType<typeof renderWithBoard>>['f']): HTMLElement =>
    query(f, '[data-surface="Whiteboard"]') as HTMLElement;
  const isShown = (f: Awaited<ReturnType<typeof renderWithBoard>>['f']): boolean =>
    !surface(f).classList.contains('stage-surface--hidden');

  it("creates the board's surface once, over the panel's slot", async () => {
    const { f } = await renderWithBoard();
    expect(lifecycle).toEqual(['bound', 'created']);
    expect(isShown(f)).toBe(true);
    expect([surface(f).style.left, surface(f).style.width]).toEqual(['600px', '380px']);
    expect(surface(f).querySelector('.test-board')).not.toBeNull();
  });

  it('keeps the surface while the panel is collapsed, and shows it again when it expands', async () => {
    const { f } = await renderWithBoard();
    click(f, '.surface__toggle');
    await settle();
    expect(isShown(f)).toBe(false);
    click(f, '.surface__toggle');
    await settle();
    expect(isShown(f)).toBe(true);
    expect(lifecycle).toEqual(['bound', 'created']);
  });

  it("fills the stage with the focused channel's surface, and returns it to its tab from the pill", async () => {
    const { f, board, focus$ } = await renderWithBoard();
    focus$.next({ Channel: board, Focused: true });
    await settle();
    expect(surface(f).classList.contains('stage-surface--stage')).toBe(true);
    expect(isShown(f)).toBe(true);
    expect(query(f, '.call-panel')).toBeNull();
    expect(query(f, '.call-overlay')?.classList.contains('board-focus')).toBe(true);

    click(f, '.board-focus-pill__btn[title="Show thread"]');
    await settle();
    expect(board.FocusExits).toBe(1);
    expect(query(f, '.call-overlay')?.classList.contains('board-focus')).toBe(false);
    expect(surface(f).classList.contains('stage-surface--stage')).toBe(false);
    expect(isShown(f)).toBe(true);
    expect(lifecycle).toEqual(['bound', 'created']);
  });

  it("creates a new instance's surface only once it is seen, when the channel comes back while the panel is away", async () => {
    const { f, channels$ } = await renderWithBoard();
    f.componentInstance.OnDetailsToggled();
    await settle();
    expect(query(f, '.call-panel')).toBeNull();
    lifecycle.length = 0;
    channels$.next([new TestWhiteboardChannel()]);
    await settle();
    expect(new Set(lifecycle)).toEqual(new Set(['unbound', 'destroyed']));
    f.componentInstance.OnDetailsToggled();
    await settle();
    expect(lifecycle.slice(2)).toEqual(['bound', 'created']);
    expect(isShown(f)).toBe(true);
  });

  it('drops the surface when its channel leaves the session, ending its focus', async () => {
    const { f, board, channels$, focus$ } = await renderWithBoard();
    focus$.next({ Channel: board, Focused: true });
    await settle();
    channels$.next([]);
    await settle();
    expect(query(f, '[data-surface="Whiteboard"]')).toBeNull();
    expect(new Set(lifecycle)).toEqual(new Set(['bound', 'created', 'unbound', 'destroyed']));
    expect(f.componentInstance.ChannelFocusMode).toBe(false);
    expect(query(f, '.call-overlay')?.classList.contains('board-focus')).toBe(false);
  });
});
