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
import { renderComponentFixture, query, click, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { MediaPlacement } from '@memberjunction/ai-realtime-client/media';
import { RealtimeSessionOverlayComponent } from './realtime-session-overlay.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/** Every surface creation, destruction, bind and unbind, in order. */
const lifecycle: string[] = [];

/** Errors Angular reports while it runs change detection on its own (autoDetect), which would otherwise only be logged. */
const reported: unknown[] = [];

/** The user's saved layout and picture-in-picture boxes as the overlay reads them, and every value it saves. */
let savedLayout: string | undefined;
const savedLayouts: string[] = [];
let savedPips: string | undefined;
const savedPipLayouts: string[] = [];

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
  /** Every visibility the host reported for the surface, in order. */
  public readonly Visibility: boolean[] = [];
  /** Every placement the host reported for the surface, in order. */
  public readonly Placements: MediaPlacement[] = [];
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
  public override OnSurfaceVisibilityChange(visible: boolean): void { this.Visibility.push(visible); }
  public override OnSurfacePlacementChange(placement: MediaPlacement): void { this.Placements.push(placement); }
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
 * Real overlay, panel and stage; the session and the channel are fakes. jsdom lays nothing out, so the stage and the
 * panel's slot are given boxes.
 */
describe('RealtimeSessionOverlayComponent: the stage (DOM)', () => {
  beforeEach(() => {
    lifecycle.length = 0;
    reported.length = 0;
    savedLayout = undefined;
    savedLayouts.length = 0;
    savedPips = undefined;
    savedPipLayouts.length = 0;
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockImplementation((key: string) =>
      key === 'mj.realtime.placement.v1' ? savedLayout : key === 'mj.realtime.pip.v1' ? savedPips : undefined
    );
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation((key: string, value: string) => {
      if (key === 'mj.realtime.placement.v1') {
        savedLayouts.push(value);
      } else if (key === 'mj.realtime.pip.v1') {
        savedPipLayouts.push(value);
      }
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('s-pane__slot')) {
        return new DOMRect(600, 48, 380, 500);
      }
      return this.tagName === 'MJ-MEDIA-STAGE' ? new DOMRect(0, 0, 1000, 600) : new DOMRect(0, 0, 0, 0);
    });
  });

  afterEach(() => {
    clearOverlayContainers();
    vi.restoreAllMocks();
    expect(reported).toEqual([]);
  });

  /** Opens a "Move to…" menu from its button and picks an item by its label. */
  const pick = async (f: Awaited<ReturnType<typeof renderWithBoard>>['f'], menuSelector: string, label: string): Promise<void> => {
    (query(f, `${menuSelector} button`) as HTMLButtonElement).click();
    await settle();
    const item = (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((i) => i.textContent?.trim() === label);
    item?.click();
    await settle();
  };

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

  it('tells the channel when its surface goes out of sight and comes back', async () => {
    const { f, board } = await renderWithBoard();
    expect(board.Visibility).toEqual([true]);
    click(f, '.surface__toggle');
    await settle();
    click(f, '.surface__toggle');
    await settle();
    expect(board.Visibility).toEqual([true, false, true]);
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

  it('moves the board to the stage from the menu beside its tab and back from the pill, saving each layout', async () => {
    const { f, board } = await renderWithBoard();
    await pick(f, '.s-tab-move', 'Stage');
    expect(surface(f).classList.contains('stage-surface--stage')).toBe(true);
    expect(query(f, '.call-overlay')?.classList.contains('board-focus')).toBe(true);
    expect(savedLayouts.at(-1)).toBe('[{"SurfaceKey":"Whiteboard","Placement":"stage"}]');

    await pick(f, '.board-focus-pill mj-realtime-surface-move-menu', 'Tab');
    expect(surface(f).classList.contains('stage-surface--stage')).toBe(false);
    expect(query(f, '.call-overlay')?.classList.contains('board-focus')).toBe(false);
    expect(isShown(f)).toBe(true);
    expect(savedLayouts.at(-1)).toBe('[{"SurfaceKey":"Whiteboard","Placement":"tab"}]');
    expect(board.Placements).toEqual(['tab', 'stage', 'tab']);
    expect(lifecycle).toEqual(['bound', 'created']);
  });

  it("follows the channel's own requests: its surface goes to the stage and back to its tab", async () => {
    const { f, board, focus$ } = await renderWithBoard();
    focus$.next({ Channel: board, Focused: true });
    await settle();
    expect(f.componentInstance.ChannelFocusMode).toBe(true);
    focus$.next({ Channel: board, Focused: false });
    await settle();
    expect(f.componentInstance.ChannelFocusMode).toBe(false);
    expect(isShown(f)).toBe(true);
    expect(savedLayouts.at(-1)).toBe('[{"SurfaceKey":"Whiteboard","Placement":"tab"}]');
  });

  it('hides the board, and its tab brings it back', async () => {
    const { f, board } = await renderWithBoard();
    await pick(f, '.s-tab-move', 'Hide');
    expect(isShown(f)).toBe(false);
    expect(query(f, '.s-pane__away span')?.textContent?.trim()).toBe('Whiteboard is hidden.');
    click(f, '.s-pane__away button');
    await settle();
    expect(isShown(f)).toBe(true);
    expect(board.Visibility).toEqual([true, false, true]);
    expect(lifecycle).toEqual(['bound', 'created']);
  });

  it("starts from the user's saved layout", async () => {
    savedLayout = '[{"SurfaceKey":"Whiteboard","Placement":"stage"}]';
    const { f, board } = await renderWithBoard();
    expect(surface(f).classList.contains('stage-surface--stage')).toBe(true);
    expect(f.componentInstance.ChannelFocusMode).toBe(true);
    expect(board.Placements).toEqual(['stage']);
  });

  it('resets the layout from the pill: the board goes back to its tab and the saved layout is cleared', async () => {
    savedLayout = '[{"SurfaceKey":"Whiteboard","Placement":"stage"}]';
    const { f } = await renderWithBoard();
    await pick(f, '.board-focus-pill mj-realtime-surface-move-menu', 'Reset layout');
    expect(f.componentInstance.ChannelFocusMode).toBe(false);
    expect(savedLayouts.at(-1)).toBe('[]');
  });

  describe('picture-in-picture', () => {
    const place = (element: HTMLElement) => [element.style.left, element.style.top, element.style.width, element.style.height];

    it("puts the board in a box from its tab's menu; the box's bar carries the same menu and its tab says where it went", async () => {
      const { f, board } = await renderWithBoard();
      await pick(f, '.s-tab-move', 'Picture-in-picture');
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(true);
      expect(place(surface(f))).toEqual(['664px', '384px', '320px', '200px']);
      expect(surface(f).querySelector('.stage-pip-title')?.textContent?.trim()).toBe('Whiteboard');
      expect(surface(f).querySelector('.stage-pip-bar mj-realtime-surface-move-menu')).not.toBeNull();
      expect(query(f, '.s-pane__away span')?.textContent?.trim()).toBe('Whiteboard is in picture-in-picture.');
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
      expect(board.Placements).toEqual(['tab', 'pip']);
      expect(lifecycle).toEqual(['bound', 'created']);
    });

    it('saves where the user drags a box', async () => {
      savedLayout = '[{"SurfaceKey":"Whiteboard","Placement":"pip"}]';
      const { f } = await renderWithBoard();
      const bar = surface(f).querySelector('.stage-pip-bar') as HTMLElement;
      bar.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 700, clientY: 400 }));
      bar.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 100 }));
      bar.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 300, clientY: 100 }));
      await settle();
      expect(savedPipLayouts.at(-1)).toBe('{"Whiteboard":{"X":0.264,"Y":0.14,"W":0.32,"H":0.3333333333333333}}');
      expect(place(surface(f))).toEqual(['264px', '84px', '320px', '200px']);
    });

    it('starts each box where the user last put it', async () => {
      savedLayout = '[{"SurfaceKey":"Whiteboard","Placement":"pip"}]';
      savedPips = '{"Whiteboard":{"X":0.264,"Y":0.14,"W":0.32,"H":0.3333333333333333}}';
      const { f } = await renderWithBoard();
      expect(place(surface(f))).toEqual(['264px', '84px', '320px', '200px']);
    });

    it('Reset layout puts every box back in its corner', async () => {
      savedLayout = '[{"SurfaceKey":"Whiteboard","Placement":"pip"}]';
      savedPips = '{"Whiteboard":{"X":0.1,"Y":0.1,"W":0.3,"H":0.3}}';
      const { f } = await renderWithBoard();
      await pick(f, '.stage-pip-bar mj-realtime-surface-move-menu', 'Reset layout');
      expect(savedPipLayouts.at(-1)).toBe('{}');
      expect(savedLayouts.at(-1)).toBe('[]');
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(false);
    });
  });
});
