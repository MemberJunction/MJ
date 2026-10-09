import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, ErrorHandler, OnDestroy, OnInit, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, EMPTY, Subject } from 'rxjs';
import type { DisplayCaptureOptions, VideoSourceState } from '@memberjunction/ai-realtime-client';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import {
  BaseRealtimeChannelClient,
  REALTIME_CAPTURES_OFF,
  REALTIME_CAPTURE_OFFERS_NONE,
  ReadChannelSurfacePlacement,
  type ChannelSurfacePlacement,
  type RealtimeAvatarNotice,
  type RealtimeCaption,
  type RealtimeCaptureOffers,
  type RealtimeCaptureState,
  type RealtimeCaptureStates,
  type RealtimeChannelFocusEvent,
  type RealtimeConnectionState,
} from '@memberjunction/realtime-runtime';
import { renderComponentFixture, query, queryAll, click, overlayQueryAll, clearOverlayContainers, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { UserInfoEngine } from '@memberjunction/core-entities';
import type { MediaPlacement, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { SharePanelRegistry } from '@memberjunction/ng-realtime-media';
import { RealtimeSessionOverlayComponent } from './realtime-session-overlay.component';
import { RealtimeSessionService } from '../../services/realtime-session.service';
import { RealtimeAvatarChannel } from './avatar/realtime-avatar-channel';
import type { RealtimeSessionReview } from '../../services/realtime-session-review.service';

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
  /** Channels the session marks as used, as the runtime does when the agent first uses one. */
  const activity$ = new Subject<BaseRealtimeChannelClient>();
  const captures$ = new BehaviorSubject<RealtimeCaptureStates>(REALTIME_CAPTURES_OFF);
  const offers$ = new BehaviorSubject<RealtimeCaptureOffers>(REALTIME_CAPTURE_OFFERS_NONE);
  /** The video sources the agent can or could see, as the runtime's arbiter lists them. */
  const sources$ = new BehaviorSubject<readonly VideoSourceState[]>([]);
  /** The call's captions, as the runtime grows them. */
  const captions$ = new BehaviorSubject<RealtimeCaption[]>([]);
  /** Why the call shows no avatar, as the runtime publishes it once per call. */
  const notice$ = new BehaviorSubject<RealtimeAvatarNotice | null>(null);
  /** The call's state, as the runtime maps the client's: a resume on a new connection passes through `'connecting'`. */
  const state$ = new BehaviorSubject<RealtimeConnectionState>('listening');
  /** The capture calls the overlay made, in order. */
  const calls: string[] = [];
  /** The element each screen share asked to show alone (`null` for a whole screen, window or tab). */
  const sharedPanels: Array<Element | null> = [];
  const service = {
    Captions$: captions$.asObservable(),
    DelegationProgress$: EMPTY,
    DelegationResult$: EMPTY,
    DelegationNarration$: EMPTY,
    ThoughtNarration$: EMPTY,
    ConnectionState$: state$.asObservable(),
    ModelName$: new BehaviorSubject<string | null>(null).asObservable(),
    Active$: new BehaviorSubject(false).asObservable(),
    ActiveChannels$: channels$.asObservable(),
    get ActiveChannels(): readonly BaseRealtimeChannelClient[] { return channels$.value; },
    ChannelFocus$: focus$.asObservable(),
    ChannelActivity$: activity$.asObservable(),
    VideoSources$: sources$.asObservable(),
    Captures$: captures$.asObservable(),
    CaptureOffers$: offers$.asObservable(),
    AvatarNotice$: notice$.asObservable(),
    StartCamera: async (): Promise<RealtimeCaptureState> => {
      calls.push('StartCamera');
      return { Status: 'starting' };
    },
    StopCamera: (): void => {
      calls.push('StopCamera');
    },
    ConfirmCamera: (): RealtimeCaptureState => {
      calls.push('ConfirmCamera');
      return { Status: 'on' };
    },
    SwitchCamera: async (deviceId: string): Promise<RealtimeCaptureState> => {
      calls.push(`SwitchCamera:${deviceId}`);
      return { Status: 'starting', Checking: true };
    },
    StartScreenShare: async (options?: DisplayCaptureOptions): Promise<RealtimeCaptureState> => {
      calls.push(options?.Panel ? `StartScreenShare:panel:${options.PanelLabel}` : `StartScreenShare:${options?.PreferredSurface ?? 'any'}`);
      sharedPanels.push(options?.Panel ?? null);
      return { Status: 'starting' };
    },
    StopScreenShare: (): void => {
      calls.push('StopScreenShare');
    },
    IsActive: false,
    CurrentAgentSessionId: null,
    HasChannelBeenUsed: (): boolean => false,
    SetFocusedChannel: (): void => undefined,
    GetAudioActivity: () => null,
    SetVideoSourceEnabled: (): boolean => true,
    SelectVideoSource: (sourceId: string | null): boolean => {
      calls.push(`SelectVideoSource:${sourceId}`);
      return true;
    },
    ToggleMute: (): boolean => false,
    SendText: (): void => undefined,
    SetMinimized: (): void => undefined,
    EndRealtimeSession: async (): Promise<void> => undefined,
    CancelDelegation: async (): Promise<boolean> => true,
  } satisfies Partial<RealtimeSessionService>;
  return { service, channels$, focus$, activity$, captures$, offers$, captions$, sources$, notice$, state$, calls, sharedPanels };
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
      if (this.classList.contains('hero__presenter--on')) {
        return new DOMRect(300, 80, 300, 400);
      }
      if (this.classList.contains('call-presenter--on')) {
        return new DOMRect(240, 64, 126, 168);
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

  /** A live call in console chrome with the whiteboard's tab open in the panel, placed as its registry row says. */
  const renderWithBoard = async (placement?: ChannelSurfacePlacement, board: TestWhiteboardChannel = new TestWhiteboardChannel()) => {
    const session = fakeSession();
    if (placement) {
      board.ApplySurfacePlacement(placement);
    }
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

    await pick(f, '.board-focus-pill mj-media-move-menu', 'Tab');
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
    await pick(f, '.board-focus-pill mj-media-move-menu', 'Reset layout');
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
      expect(surface(f).querySelector('.stage-pip-bar mj-media-move-menu')).not.toBeNull();
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
      await pick(f, '.stage-pip-bar mj-media-move-menu', 'Reset layout');
      expect(savedPipLayouts.at(-1)).toBe('{}');
      expect(savedLayouts.at(-1)).toBe('[]');
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(false);
    });
  });

  describe("the composer's Camera and Share", () => {
    const composerButton = (f: Awaited<ReturnType<typeof renderWithBoard>>['f'], title: string) =>
      query(f, `mj-realtime-composer mj-media-controls button[title="${title}"]`) as HTMLButtonElement | null;

    it('shows neither while the call offers neither', async () => {
      const { f } = await renderWithBoard();
      expect(query(f, 'mj-realtime-composer mj-media-controls')).not.toBeNull();
      expect(composerButton(f, 'Turn on camera')).toBeNull();
      expect(composerButton(f, 'Share screen')).toBeNull();
    });

    it('shows them once the call offers them, and starts and stops the camera through the session', async () => {
      const { f, offers$, captures$, calls } = await renderWithBoard();
      offers$.next({ Camera: true, Screen: true });
      await settle();
      expect(composerButton(f, 'Turn on camera')?.classList.contains('mj-btn--secondary')).toBe(true);
      composerButton(f, 'Turn on camera')?.click();
      captures$.next({ ...REALTIME_CAPTURES_OFF, Camera: { Status: 'starting' } });
      await settle();
      composerButton(f, 'Turn off camera')?.click();
      expect(calls).toEqual(['StartCamera', 'StopCamera']);
    });

    it('asks the session to share, with the kind picked in the menu first, and to stop', async () => {
      const { f, offers$, captures$, calls } = await renderWithBoard();
      offers$.next({ Camera: false, Screen: true });
      await settle();
      composerButton(f, 'Share screen')?.click();
      (query(f, 'mj-realtime-composer mj-media-controls button[title="Choose what to share"]') as HTMLButtonElement).click();
      await settle();
      (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Browser tab')?.click();
      captures$.next({ ...REALTIME_CAPTURES_OFF, Screen: { Status: 'on' } });
      await settle();
      composerButton(f, 'Stop sharing')?.click();
      expect(calls).toEqual(['StartScreenShare:any', 'StartScreenShare:tab', 'StopScreenShare']);
    });
  });

  describe('the Share menu\'s "This panel"', () => {
    /** A whiteboard whose surface the user may share on its own, as the real one's. */
    class ShareableWhiteboardChannel extends TestWhiteboardChannel {
      public override get SurfaceShareable(): boolean {
        return true;
      }
    }

    /** Desktop Chrome as the share-panel registry sees it. No IntersectionObserver, so every panel counts as on screen. */
    const stubPanelShareSupport = (): void => {
      const getDisplayMedia = async (): Promise<MediaStream> => {
        throw new Error('No picker in these tests.');
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } });
      vi.stubGlobal('CropTarget', { fromElement: async () => ({}) });
      vi.stubGlobal('IntersectionObserver', undefined);
    };

    /** A panel of the page outside the call, such as an app's dashboard. */
    const outsidePanel = (): HTMLElement => {
      const element = document.createElement('section');
      element.className = 'sample-panel';
      return document.body.appendChild(element);
    };

    afterEach(() => {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'mediaDevices');
      document.querySelectorAll('.sample-panel').forEach((element) => element.remove());
    });

    const menuLabels = (menu: string): string[] =>
      (overlayQueryAll(`${menu} mj-menu-item`) as HTMLElement[]).map((item) => item.textContent?.trim() ?? '');
    const menuItem = (menu: string, label: string): HTMLElement | undefined =>
      (overlayQueryAll(`${menu} mj-menu-item`) as HTMLElement[]).find((item) => item.textContent?.trim() === label);

    /** Opens the composer's Share menu, offering a share as the call does. */
    const openShareMenu = async (f: Awaited<ReturnType<typeof renderWithBoard>>['f'], offers$: Awaited<ReturnType<typeof renderWithBoard>>['offers$']) => {
      offers$.next({ Camera: false, Screen: true });
      await settle();
      (query(f, 'mj-realtime-composer mj-media-controls button[title="Choose what to share"]') as HTMLButtonElement).click();
      await settle();
    };

    /** Opens "This panel" in the open Share menu and picks a panel. */
    const pickPanel = async (label: string): Promise<void> => {
      menuItem('mj-menu', 'This panel')?.click();
      await settle();
      menuItem('mj-menu[aria-label="This panel"]', label)?.click();
      await settle();
    };

    it('lists the panels on screen in page order, leaving out one that holds the call, and shares the picked one by its name', async () => {
      stubPanelShareSupport();
      const dashboard = outsidePanel();
      const { f, offers$, calls, sharedPanels } = await renderWithBoard(undefined, new ShareableWhiteboardChannel());
      const registry = TestBed.inject(SharePanelRegistry);
      registry.Register(dashboard, 'Sample dashboard', 'fa-solid fa-chart-line');
      registry.Register(document.body, 'Main content');
      await openShareMenu(f, offers$);

      menuItem('mj-menu', 'This panel')?.click();
      await settle();
      expect(menuLabels('mj-menu[aria-label="This panel"]')).toEqual(['Sample dashboard', 'Whiteboard']);
      menuItem('mj-menu[aria-label="This panel"]', 'Whiteboard')?.click();
      expect(calls).toEqual(['StartScreenShare:panel:Whiteboard']);
      expect(sharedPanels).toEqual([query(f, '.stage-frame[aria-label="Whiteboard"]')]);
    });

    it('stops the share when the shared panel goes away, and not when another one does', async () => {
      stubPanelShareSupport();
      const dashboard = outsidePanel();
      const { f, offers$, captures$, channels$, calls } = await renderWithBoard(undefined, new ShareableWhiteboardChannel());
      const other = TestBed.inject(SharePanelRegistry).Register(dashboard, 'Sample dashboard');
      await openShareMenu(f, offers$);
      await pickPanel('Whiteboard');
      captures$.next({ ...REALTIME_CAPTURES_OFF, Screen: { Status: 'on', PanelLabel: 'Whiteboard' } });
      await settle();

      other.Unregister();
      expect(calls).toEqual(['StartScreenShare:panel:Whiteboard']);
      channels$.next([]);
      await settle();
      expect(calls).toEqual(['StartScreenShare:panel:Whiteboard', 'StopScreenShare']);
    });

    it('leaves alone a share that is already over when its panel goes away', async () => {
      stubPanelShareSupport();
      const { f, offers$, captures$, channels$, calls } = await renderWithBoard(undefined, new ShareableWhiteboardChannel());
      await openShareMenu(f, offers$);
      await pickPanel('Whiteboard');
      captures$.next({ ...REALTIME_CAPTURES_OFF, Screen: { Status: 'on', PanelLabel: 'Whiteboard' } });
      await settle();
      captures$.next(REALTIME_CAPTURES_OFF);
      await settle();

      channels$.next([]);
      await settle();
      expect(calls).toEqual(['StartScreenShare:panel:Whiteboard']);
    });

    it('shares nothing when the picked panel went away since the menu listed it', async () => {
      stubPanelShareSupport();
      const { f, calls } = await renderWithBoard(undefined, new ShareableWhiteboardChannel());
      const gone = TestBed.inject(SharePanelRegistry).Register(outsidePanel(), 'Sample dashboard');
      gone.Unregister();
      f.componentInstance.OnShareRequested({ Kind: 'panel', PanelKey: gone.Key });
      await settle();
      expect(calls).toEqual([]);
    });

    it("does not offer a channel's surface unless its channel opts in", async () => {
      stubPanelShareSupport();
      const { f, offers$ } = await renderWithBoard();
      await openShareMenu(f, offers$);
      expect(menuLabels('mj-menu')).toEqual(['Entire screen', 'Window', 'Browser tab']);
    });

    it('offers no This panel where the browser cannot share a single panel', async () => {
      const { f, offers$ } = await renderWithBoard(undefined, new ShareableWhiteboardChannel());
      await openShareMenu(f, offers$);
      expect(menuLabels('mj-menu')).toEqual(['Entire screen', 'Window', 'Browser tab']);
    });
  });

  describe('the "Agent can see" chip', () => {
    it("passes the user's pick of the source the agent sees, and the return to the call's choice, to the session", async () => {
      const { f, sources$, calls } = await renderWithBoard();
      const state = (id: string, label: string, active: boolean, picked = false): VideoSourceState => ({
        SourceID: id,
        Label: label,
        Kind: 'camera',
        Enabled: true,
        Active: active,
        FramesSent: 0,
        ...(picked ? { Picked: true } : {}),
      });
      sources$.next([state('capture:camera', 'Camera', true), state('capture:screen', 'Shared screen', false)]);
      await settle();
      (query(f, '.perception-chip__trigger') as HTMLButtonElement).click();
      await settle();
      (query(f, '.perception-chip__pick') as HTMLButtonElement).click();
      sources$.next([state('capture:camera', 'Camera', false), state('capture:screen', 'Shared screen', true, true)]);
      await settle();
      (query(f, '.perception-chip__auto') as HTMLButtonElement).click();
      expect(calls).toEqual(['SelectVideoSource:capture:screen', 'SelectVideoSource:null']);
    });
  });

  describe('the camera check', () => {
    const checking: RealtimeCaptureState = {
      Status: 'starting',
      Checking: true,
      Stream: { id: 'camera', getTracks: () => [] } as unknown as MediaStream,
      DeviceID: 'cam-1',
      Devices: [
        { DeviceID: 'cam-1', Kind: 'camera', Label: 'Front camera', GroupID: 'laptop' },
        { DeviceID: 'cam-2', Kind: 'camera', Label: 'Desk camera', GroupID: 'desk' },
      ],
    };

    it('shows the check over the call while the camera waits for it, and answers through the session', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
      const { f, captures$, calls } = await renderWithBoard();
      expect(query(f, 'mj-realtime-camera-check-card')).toBeNull();
      captures$.next({ ...REALTIME_CAPTURES_OFF, Camera: checking });
      await settle();
      expect(query(f, 'mj-realtime-camera-check-card .mj-dialog-title')?.textContent?.trim()).toBe('Check your camera');
      const select = query(f, 'mj-realtime-camera-check-card select') as HTMLSelectElement;
      select.value = 'cam-2';
      select.dispatchEvent(new Event('change'));
      (query(f, 'mj-realtime-camera-check-card .check__confirm') as HTMLButtonElement).click();
      (query(f, 'mj-realtime-camera-check-card .check__cancel') as HTMLButtonElement).click();
      expect(calls).toEqual(['SwitchCamera:cam-2', 'ConfirmCamera', 'StopCamera']);
      captures$.next({ ...REALTIME_CAPTURES_OFF, Camera: { Status: 'on', Stream: checking.Stream } });
      await settle();
      expect(query(f, 'mj-realtime-camera-check-card')).toBeNull();
    });
  });

  describe("the channel's placement (its registry row's UIConfig)", () => {
    /** Opens a "Move to…" menu and lists its items. */
    const menuItems = async (f: Awaited<ReturnType<typeof renderWithBoard>>['f'], menuSelector: string): Promise<Array<string | undefined>> => {
      (query(f, `${menuSelector} button`) as HTMLButtonElement).click();
      await settle();
      const items = (overlayQueryAll('mj-menu-item') as HTMLElement[]).map((item) => item.textContent?.trim());
      clearOverlayContainers();
      return items;
    };

    it('starts the board in a box when its channel places it there, and offers no tab when the channel allows none', async () => {
      const { f, board } = await renderWithBoard({ Default: 'pip', Allowed: ['stage', 'pip', 'hidden'] });
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(true);
      expect(query(f, '.s-pane__away span')?.textContent?.trim()).toBe('Whiteboard is in picture-in-picture.');
      expect(query(f, '.s-pane__away button')).toBeNull();
      expect(await menuItems(f, '.stage-pip-bar mj-media-move-menu')).toEqual(['Stage', 'Picture-in-picture', 'Hide', 'Reset layout']);
      expect(board.Placements).toEqual(['pip']);
      expect(savedLayouts).toEqual([]);
    });

    it('sends the board back to its box, not a tab, when the user leaves the stage', async () => {
      const { f, board } = await renderWithBoard({ Default: 'pip', Allowed: ['stage', 'pip', 'hidden'] });
      await pick(f, '.stage-pip-bar mj-media-move-menu', 'Stage');
      expect(f.componentInstance.ChannelFocusMode).toBe(true);
      expect(await menuItems(f, '.board-focus-pill mj-media-move-menu')).toEqual(['Stage', 'Picture-in-picture', 'Hide', 'Reset layout']);
      click(f, '.board-focus-pill__btn[title="Show thread"]');
      await settle();
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(true);
      expect(savedLayouts.at(-1)).toBe('[{"SurfaceKey":"Whiteboard","Placement":"pip"}]');
      expect(board.Placements).toEqual(['pip', 'stage', 'pip']);
    });

    it('sends the board back to its box when the channel lets go of the stage', async () => {
      const { f, board, focus$ } = await renderWithBoard({ Default: 'pip', Allowed: ['stage', 'pip', 'hidden'] });
      focus$.next({ Channel: board, Focused: true });
      await settle();
      expect(f.componentInstance.ChannelFocusMode).toBe(true);
      focus$.next({ Channel: board, Focused: false });
      await settle();
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
      expect(surface(f).classList.contains('stage-surface--pip')).toBe(true);
    });
  });

  describe('the Avatar channel', () => {
    /** Frame callbacks the avatar tile's video registered: jsdom has none of its own. */
    let frames: Array<() => void> = [];

    beforeEach(() => {
      frames = [];
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
        configurable: true,
        value: (callback: () => void) => frames.push(callback),
      });
      Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: () => undefined });
    });

    afterEach(() => {
      Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
      Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
    });

    /** A player source that records where it was attached. */
    const player = () => {
      const attached: HTMLVideoElement[] = [];
      const source: MediaVideoSource = { Kind: 'element', Attach: (element) => (attached.push(element), () => undefined) };
      return { source, attached };
    };

    /**
     * A call with the Avatar channel in it, placed as its registry row places it, and the agent's video the test sends.
     * Other channels (a whiteboard) can join it.
     */
    const renderWithAvatar = async (chrome: 'orb' | 'console' = 'console', others: BaseRealtimeChannelClient[] = []) => {
      const session = fakeSession();
      const video$ = new BehaviorSubject<MediaVideoSource | null>(null);
      const avatar = new RealtimeAvatarChannel();
      avatar.ApplySurfacePlacement(ReadChannelSurfacePlacement({ Placement: 'stage' }));
      avatar.Initialize({
        AgentName: 'Sage',
        Provider: null,
        SendContextNote: () => undefined,
        RequestSave: () => undefined,
        SetFocusMode: () => undefined,
        SaveAsArtifact: async () => null,
        AgentSessionID: 'session-1',
        ExecuteServerAction: async () => null,
        AgentVideo$: video$.asObservable(),
        ConnectionState$: session.service.ConnectionState$,
      });
      const f = renderComponentFixture(RealtimeSessionOverlayComponent, {
        providers: [
          { provide: RealtimeSessionService, useValue: session.service },
          { provide: ErrorHandler, useValue: { handleError: (error: unknown) => reported.push(error) } },
        ],
        inputs: { Chrome: chrome },
        autoDetect: true,
      });
      session.channels$.next([avatar, ...others]);
      await settle();
      /** The agent's video arrives, the runtime marks the Avatar as used, and the video's first frame shows. */
      const sendVideo = async () => {
        const video = player();
        video$.next(video.source);
        session.activity$.next(avatar);
        await settle();
        const pending = frames;
        frames = [];
        pending.forEach((callback) => callback());
        await settle();
        return video;
      };
      return { f, avatar, video$, sendVideo, ...session };
    };

    const avatarBox = (f: Awaited<ReturnType<typeof renderWithAvatar>>['f']): HTMLElement | null => query(f, '[data-surface="Avatar"]') as HTMLElement | null;
    const place = (element: HTMLElement | null) => [element?.style.left, element?.style.top, element?.style.width, element?.style.height];

    it('shows nothing of the avatar while the agent sends no video', async () => {
      const { f } = await renderWithAvatar();
      expect(avatarBox(f)).toBeNull();
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
      expect(query(f, '.call-presenter--on')).toBeNull();
    });

    it("puts the agent's video above the thread in the console, labelled as AI-generated, without the focus layout", async () => {
      const { f, sendVideo } = await renderWithAvatar('console');
      const { attached } = await sendVideo();
      expect(f.componentInstance.PresenterOnStage).toBe(true);
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
      expect(query(f, '.board-focus-pill')).toBeNull();
      expect(avatarBox(f)?.classList.contains('stage-surface--in-slot')).toBe(true);
      expect(place(avatarBox(f))).toEqual(['240px', '64px', '126px', '168px']);
      expect(query(f, 'mj-realtime-avatar-surface .tile__chip')?.textContent?.trim()).toBe('AI-generated video');
      expect(attached).toHaveLength(1);
    });

    it("puts the agent's video in the orb's place in the hero", async () => {
      const { f, sendVideo } = await renderWithAvatar('orb');
      expect(query(f, '.hero__orb')).not.toBeNull();
      await sendVideo();
      expect(query(f, '.hero__orb')).toBeNull();
      expect(query(f, '.hero__name')).toBeNull();
      expect(query(f, '.hero__sub')).toBeNull();
      expect(query(f, '.hero[role="status"] .hero__sr')?.textContent?.trim()).toBe('Listening');
      expect(queryAll(f, 'mj-realtime-avatar-surface .tile__chip').map((c) => c.textContent?.trim())).toEqual(['AI-generated video', 'Listening']);
      expect(place(avatarBox(f))).toEqual(['300px', '80px', '300px', '400px']);
      expect(f.componentInstance.ChannelFocusMode).toBe(false);
    });

    it('does not open the panel when the video arrives', async () => {
      const { f, sendVideo } = await renderWithAvatar('console');
      await sendVideo();
      expect(f.componentInstance.DetailsPeek).toBe(false);
    });

    it("moves the avatar from its own menu, and the hero's orb comes back", async () => {
      const { f, sendVideo } = await renderWithAvatar('orb');
      await sendVideo();
      await pick(f, '.stage-presenter-move', 'Picture-in-picture');
      expect(avatarBox(f)?.classList.contains('stage-surface--pip')).toBe(true);
      expect(f.componentInstance.PresenterOnStage).toBe(false);
      expect(query(f, '.hero__orb')).not.toBeNull();
      expect(savedLayouts.at(-1)).toBe('[{"SurfaceKey":"Avatar","Placement":"pip"}]');
    });

    describe('captions over the video', () => {
      const caption = (f: Awaited<ReturnType<typeof renderWithAvatar>>['f']) => query(f, '.hero__caption')?.textContent?.replace(/\s+/g, ' ').trim();

      it('keeps the hero with captions on, and runs the newest caption over the video, the user marked as you', async () => {
        const { f, sendVideo, captions$ } = await renderWithAvatar('orb');
        await sendVideo();
        f.componentInstance.SetCaptions(true);
        captions$.next([{ Role: 'Assistant', Text: 'Hello there.' }]);
        await settle();
        expect(query(f, 'mj-realtime-session-thread')).toBeNull();
        expect(query(f, '.hero__presenter--on .hero__caption')).not.toBeNull();
        expect(caption(f)).toBe('Hello there.');
        expect(query(f, '.hero__caption')?.getAttribute('aria-hidden')).toBe('true');
        captions$.next([{ Role: 'Assistant', Text: 'Hello there.' }, { Role: 'User', Text: 'Hi Sage' }]);
        await settle();
        expect(caption(f)).toBe('You: Hi Sage');
      });

      it('opens the conversation from "Show the conversation", and runs captions alone again once they are turned off and on', async () => {
        const { f, sendVideo, captions$ } = await renderWithAvatar('orb');
        await sendVideo();
        captions$.next([{ Role: 'Assistant', Text: 'Hello there.' }]);
        (query(f, '.hero__reveal') as HTMLButtonElement).click();
        await settle();
        expect(query(f, 'mj-realtime-session-thread')).not.toBeNull();
        expect(query(f, '.hero__caption')).toBeNull();
        f.componentInstance.SetCaptions(false);
        await settle();
        expect(query(f, '.hero')).not.toBeNull();
        expect(query(f, '.hero__caption')).toBeNull();
        f.componentInstance.SetCaptions(true);
        await settle();
        expect(query(f, 'mj-realtime-session-thread')).toBeNull();
        expect(caption(f)).toBe('Hello there.');
      });

      it('opens the conversation with captions on while no video presents, as before', async () => {
        const { f, captions$ } = await renderWithAvatar('orb');
        captions$.next([{ Role: 'Assistant', Text: 'Hello there.' }]);
        f.componentInstance.SetCaptions(true);
        await settle();
        expect(query(f, 'mj-realtime-session-thread')).not.toBeNull();
        expect(query(f, '.hero__caption')).toBeNull();
      });

      it('opens the conversation once the video leaves the hero', async () => {
        const { f, sendVideo, captions$ } = await renderWithAvatar('orb');
        await sendVideo();
        captions$.next([{ Role: 'Assistant', Text: 'Hello there.' }]);
        f.componentInstance.SetCaptions(true);
        await settle();
        await pick(f, '.stage-presenter-move', 'Picture-in-picture');
        expect(query(f, 'mj-realtime-session-thread')).not.toBeNull();
        expect(query(f, '.hero__caption')).toBeNull();
      });
    });

    it('gives the stage to a whiteboard moved there, and the avatar goes to picture-in-picture', async () => {
      const board = new TestWhiteboardChannel();
      const { f, sendVideo } = await renderWithAvatar('console', [board]);
      await sendVideo();
      f.componentInstance.OnMoveRequested({ Key: 'Whiteboard', Placement: 'stage' });
      await settle();
      expect(f.componentInstance.ChannelFocusMode).toBe(true);
      expect(surface(f).classList.contains('stage-surface--stage')).toBe(true);
      expect(surface(f).classList.contains('stage-surface--in-slot')).toBe(false);
      expect(avatarBox(f)?.classList.contains('stage-surface--pip')).toBe(true);
    });

    /**
     * A resume on a new connection (Google's `goAway`, a dropped socket, the relay's reconnect) takes the call through
     * `'connecting'` and back. The agent's video must keep its place and its element meanwhile, so its last frame stays
     * on screen: no jump, no empty box, no second attach.
     */
    describe('while the call reconnects', () => {
      const chips = (f: Awaited<ReturnType<typeof renderWithAvatar>>['f']) =>
        queryAll(f, 'mj-realtime-avatar-surface .tile__chip').map((c) => c.textContent?.trim());
      const tileVideo = (f: Awaited<ReturnType<typeof renderWithAvatar>>['f']) => query(f, 'mj-realtime-avatar-surface video');

      it("keeps the agent's video in its place in the hero, on the same element, its tile saying the call is connecting", async () => {
        const { f, sendVideo, state$ } = await renderWithAvatar('orb');
        const { attached } = await sendVideo();
        const element = tileVideo(f);

        state$.next('connecting');
        await settle();
        expect(query(f, '.call-connecting')).toBeNull();
        expect(query(f, '.call-body')?.classList.contains('call-body--hero')).toBe(true);
        expect(avatarBox(f)?.classList.contains('stage-surface--in-slot')).toBe(true);
        expect(avatarBox(f)?.classList.contains('stage-surface--hidden')).toBe(false);
        expect(place(avatarBox(f))).toEqual(['300px', '80px', '300px', '400px']);
        expect(chips(f)).toEqual(['AI-generated video', 'Connecting']);
        expect(query(f, '.hero[role="status"] .hero__sr')?.textContent?.trim()).toBe('Connecting…');

        state$.next('listening');
        await settle();
        expect(place(avatarBox(f))).toEqual(['300px', '80px', '300px', '400px']);
        expect(chips(f)).toEqual(['AI-generated video', 'Listening']);
        expect(tileVideo(f)).toBe(element);
        expect(attached).toEqual([element]);
      });

      it('keeps it above the thread in the console, where the connecting screen takes only the thread', async () => {
        const { f, sendVideo, state$ } = await renderWithAvatar('console');
        const { attached } = await sendVideo();

        state$.next('connecting');
        await settle();
        expect(query(f, '.call-connecting')).not.toBeNull();
        expect(place(avatarBox(f))).toEqual(['240px', '64px', '126px', '168px']);
        expect(chips(f)).toEqual(['AI-generated video', 'Connecting']);

        state$.next('listening');
        await settle();
        expect(place(avatarBox(f))).toEqual(['240px', '64px', '126px', '168px']);
        expect(attached).toHaveLength(1);
      });

      it("puts video that arrives while the call still connects in the hero's place, not over the whole call", async () => {
        const { f, sendVideo, state$ } = await renderWithAvatar('orb');
        state$.next('connecting');
        await settle();
        expect(query(f, '.call-connecting')).not.toBeNull();

        await sendVideo();
        expect(query(f, '.call-connecting')).toBeNull();
        expect(avatarBox(f)?.classList.contains('stage-surface--in-slot')).toBe(true);
        expect(place(avatarBox(f))).toEqual(['300px', '80px', '300px', '400px']);
      });

      it('shows the connecting screen in the hero while no video presents there: none yet, or moved to picture-in-picture', async () => {
        const { f, sendVideo, state$ } = await renderWithAvatar('orb');
        state$.next('connecting');
        await settle();
        expect(query(f, '.call-connecting')).not.toBeNull();
        expect(query(f, '.hero')).toBeNull();

        state$.next('listening');
        await settle();
        const { attached } = await sendVideo();
        await pick(f, '.stage-presenter-move', 'Picture-in-picture');
        state$.next('connecting');
        await settle();
        expect(query(f, '.call-connecting')).not.toBeNull();
        expect(query(f, '.hero')).toBeNull();
        expect(avatarBox(f)?.classList.contains('stage-surface--pip')).toBe(true);
        expect(avatarBox(f)?.classList.contains('stage-surface--hidden')).toBe(false);
        expect(attached).toHaveLength(1);
      });
    });
  });

  describe('the avatar notice', () => {
    const ENDPOINT: RealtimeAvatarNotice = { Reason: 'endpoint' };
    const NOTICE_MS = 10_000;

    /** A placeholder past session, for review mode. */
    const REVIEW: RealtimeSessionReview = {
      SessionID: 'past-1', AgentID: 'agent-1', AgentName: 'Sage', TargetAgentID: 'agent-1', ConversationID: null,
      Status: 'Closed', CloseReason: null, StartedAt: null, LastActiveAt: null, ClosedAt: null,
      RecordingFileID: null, RecordingStartedAt: null, RecordingMedia: null,
      Turns: [], DelegatedRuns: [], ChannelStates: [], Legs: [], Artifacts: [],
    };

    /** A live call in the given chrome; the test publishes the runtime's notice. */
    const renderCall = async (chrome: 'orb' | 'console' = 'console', inputs: Record<string, unknown> = {}) => {
      const session = fakeSession();
      const f = renderComponentFixture(RealtimeSessionOverlayComponent, {
        providers: [
          { provide: RealtimeSessionService, useValue: session.service },
          { provide: ErrorHandler, useValue: { handleError: (error: unknown) => reported.push(error) } },
        ],
        inputs: { Chrome: chrome, AgentName: 'Sage', ...inputs },
        autoDetect: true,
      });
      await settle();
      return { f, ...session };
    };

    const alertOf = (f: Awaited<ReturnType<typeof renderCall>>['f']): HTMLElement | null =>
      query(f, 'mj-alert.call-avatar-notice') as HTMLElement | null;
    const textOf = (f: Awaited<ReturnType<typeof renderCall>>['f']): string | undefined => alertOf(f)?.textContent?.trim();

    /** The handle of the notice's 10 s timer, from a spy on `setTimeout`. */
    const noticeTimer = (timers: { mock: { calls: unknown[][]; results: Array<{ value: unknown }> } }): unknown => {
      const index = timers.mock.calls.findIndex((call) => call[1] === NOTICE_MS);
      return index >= 0 ? timers.mock.results[index].value : undefined;
    };

    it('says why under the banner once the call has a notice, as a polite status with a dismiss button', async () => {
      const { f, notice$ } = await renderCall('console');
      expect(alertOf(f)).toBeNull();
      notice$.next(ENDPOINT);
      await settle();
      const alert = alertOf(f);
      expect(textOf(f)).toBe("Audio only: this voice model can't show an avatar");
      expect(alert?.getAttribute('role')).toBe('status');
      expect(alert?.classList.contains('mj-alert--info')).toBe(true);
      expect(alert?.classList.contains('mj-alert--sm')).toBe(true);
      expect(alert?.querySelector('.mj-alert__icon')?.classList.contains('fa-video-slash')).toBe(true);
      expect(alert?.querySelector('.mj-alert__dismiss')?.getAttribute('aria-label')).toBe('Dismiss');
      expect(alert?.previousElementSibling?.tagName).toBe('MJ-REALTIME-AGENT-BANNER');
    });

    it('says it in the orb chrome too', async () => {
      const { f, notice$ } = await renderCall('orb');
      notice$.next({ Reason: 'host' });
      await settle();
      expect(query(f, '.hero')).not.toBeNull();
      expect(textOf(f)).toBe("Audio only: this app can't show the avatar");
    });

    it("uses the host's own words for a reason it gives", async () => {
      const { f, notice$ } = await renderCall('console', { AvatarNoticeLabels: { host: "Audio only: the Example widget can't show the avatar" } });
      notice$.next({ Reason: 'host' });
      await settle();
      expect(textOf(f)).toBe("Audio only: the Example widget can't show the avatar");
    });

    it('goes when dismissed and does not come back in that call; the next call says its own', async () => {
      const { f, notice$ } = await renderCall();
      notice$.next(ENDPOINT);
      await settle();
      click(f, 'mj-alert.call-avatar-notice .mj-alert__dismiss');
      await settle();
      expect(alertOf(f)).toBeNull();
      notice$.next(ENDPOINT);
      await settle();
      expect(alertOf(f)).toBeNull();
      notice$.next(null);
      notice$.next({ Reason: 'browser' });
      await settle();
      expect(textOf(f)).toBe("Audio only: this browser can't play the avatar");
    });

    it('hides itself after 10 s and stays hidden', async () => {
      const { f, notice$ } = await renderCall();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        notice$.next(ENDPOINT);
        await vi.advanceTimersByTimeAsync(NOTICE_MS - 1);
        expect(f.componentInstance.AvatarNotice).toEqual(ENDPOINT);
        await vi.advanceTimersByTimeAsync(1);
        expect(f.componentInstance.AvatarNotice).toBeNull();
        await vi.runOnlyPendingTimersAsync(); // the render Angular scheduled on the faked clock
        expect(alertOf(f)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
      notice$.next(ENDPOINT);
      await settle();
      expect(alertOf(f)).toBeNull();
    });

    /** A call showing a notice, with spies on the timers, so a test can see the notice's timer stop. */
    const renderWithTimer = async () => {
      const timers = vi.spyOn(globalThis, 'setTimeout');
      const cleared = vi.spyOn(globalThis, 'clearTimeout');
      const call = await renderCall();
      call.notice$.next(ENDPOINT);
      await settle();
      const timer = noticeTimer(timers);
      expect(timer).toBeDefined();
      return { ...call, timer, cleared };
    };

    it('goes when the call ends, and its timer stops', async () => {
      const { f, notice$, timer, cleared } = await renderWithTimer();
      notice$.next(null);
      await settle();
      expect(alertOf(f)).toBeNull();
      expect(cleared).toHaveBeenCalledWith(timer);
    });

    it('stops its timer when dismissed', async () => {
      const { f, timer, cleared } = await renderWithTimer();
      click(f, 'mj-alert.call-avatar-notice .mj-alert__dismiss');
      expect(cleared).toHaveBeenCalledWith(timer);
    });

    it('stops its timer when the overlay goes', async () => {
      const { f, timer, cleared } = await renderWithTimer();
      f.destroy();
      expect(cleared).toHaveBeenCalledWith(timer);
    });

    it('says nothing in review, even with a notice', async () => {
      const { f, notice$ } = await renderCall('console', { ReviewData: REVIEW });
      notice$.next(ENDPOINT);
      await settle();
      expect(f.componentInstance.IsReviewing).toBe(true);
      expect(alertOf(f)).toBeNull();
    });

    it('has no axe violations while it shows', async () => {
      const { f, notice$ } = await renderCall();
      notice$.next(ENDPOINT);
      await settle();
      expect(alertOf(f)).not.toBeNull();
      await ExpectNoAxeViolations(f);
    });
  });
});
