import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { By } from '@angular/platform-browser';
import { BehaviorSubject } from 'rxjs';
import { CameraCheckComponent, LOCAL_MEDIA_CONTROLLER_FACTORY, MediaStageComponent } from '@memberjunction/ng-realtime-media';
import type {
  ILocalMediaController,
  LocalMediaKind,
  LocalMediaResult,
  LocalMediaState,
  LocalTrackState,
  MediaDevice,
  MediaPipRect,
  MediaPlacementMove,
} from '@memberjunction/ai-realtime-client/media';
import { renderComponentFixture, query, queryAll, text, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import type { LiveKitParticipantView, LiveKitRoomController, LiveKitRoomState } from '@memberjunction/livekit-room-core';
import { LiveKitRoomComponent, LIVEKIT_ROOM_CONTROLLER_FACTORY } from './livekit-room.component';

/**
 * Container-level DOM spec for <mj-livekit-room> — the worked example of the
 * **injectable-controller** pattern. The component used to `new LiveKitRoomController()`
 * inline (untestable); it now resolves LIVEKIT_ROOM_CONTROLLER_FACTORY, so a test injects a
 * **fake controller** and drives the whole container from it — no livekit-client, no media.
 *
 * Proves: the container renders from the controller's State (connection overlay vs. stage),
 * routes control-bar intent back to the controller, and re-renders when the controller emits
 * a `stateChanged` event. Heavy children (tiles/whiteboard/panels) stay un-rendered via input
 * gating; media/track behavior remains live-tested per §7.
 */
describe('LiveKitRoomComponent (DOM, fake controller)', () => {
  afterEach(() => {
    clearOverlayContainers();
  });

  const makeState = (over: Partial<LiveKitRoomState> = {}): LiveKitRoomState =>
    ({
      Status: 'idle',
      Remote: [],
      ActiveSpeakerIdentities: [],
      LocalMedia: { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: false },
      AudioPlaybackBlocked: false,
      NoiseFilterEnabled: false,
      BackgroundEffect: { Kind: 'none' },
      E2EEEnabled: false,
      ...over,
    }) as LiveKitRoomState;

  // A fake LiveKitRoomController: a controllable State + an event bus that captures handlers
  // (so the test can fire `stateChanged`), with vi.fn() no-ops for every method the component calls.
  const makeFakeController = (initial: LiveKitRoomState) => {
    let state = initial;
    const handlers = new Map<string, (arg: LiveKitRoomState) => void>();
    const toggleMicrophone = vi.fn();
    const setScreenShareEnabled = vi.fn(() => Promise.resolve());
    const changeScreenShare = vi.fn(() => Promise.resolve());
    const fake = {
      get State() {
        return state;
      },
      Events: {
        On: (event: string, handler: (arg: LiveKitRoomState) => void) => {
          handlers.set(event, handler);
          return () => handlers.delete(event);
        },
      },
      ToggleMicrophone: toggleMicrophone,
      ToggleCamera: vi.fn(),
      ToggleScreenShare: vi.fn(),
      SetScreenShareEnabled: setScreenShareEnabled,
      ChangeScreenShare: changeScreenShare,
      Connect: vi.fn(() => Promise.resolve()),
      Disconnect: vi.fn(() => Promise.resolve()),
      Dispose: vi.fn(),
      StartAudio: vi.fn(() => Promise.resolve()),
      SwitchDevice: vi.fn(() => Promise.resolve()),
      SetNoiseFilterEnabled: vi.fn(),
      SetBackgroundEffect: vi.fn(),
      SendData: vi.fn(() => Promise.resolve()),
      ListDevices: vi.fn(() => Promise.resolve([])),
      GetActiveDeviceId: vi.fn(() => null),
    };
    return {
      controller: fake as unknown as LiveKitRoomController,
      toggleMicrophone,
      setScreenShareEnabled,
      changeScreenShare,
      /** Mutate State and fire the controller's `stateChanged` event, as the real controller would. */
      emitState(next: LiveKitRoomState): void {
        state = next;
        handlers.get('stateChanged')?.(next);
      },
    };
  };

  /** A LiveKit track reduced to what the tile calls: attaching and detaching an element. */
  const fakeTrack = () => ({ attach: (element: HTMLVideoElement) => element, detach: (element: HTMLVideoElement) => element });

  /** A participant view; its camera and screen share are publications with fake tracks, as LiveKit reports them. */
  const view = (identity: string, over: { Local?: boolean; Camera?: boolean; Sharing?: boolean } = {}): LiveKitParticipantView => {
    const publications: Record<string, { track: ReturnType<typeof fakeTrack>; isMuted: boolean }> = {};
    if (over.Camera) {
      publications['camera'] = { track: fakeTrack(), isMuted: false };
    }
    if (over.Sharing) {
      publications['screen_share'] = { track: fakeTrack(), isMuted: false };
    }
    return {
      Identity: identity,
      DisplayName: identity,
      IsLocal: over.Local ?? false,
      Role: 'participant',
      IsSpeaking: false,
      AudioLevel: 0,
      HasAudio: true,
      HasVideo: over.Camera ?? false,
      IsScreenSharing: over.Sharing ?? false,
      ConnectionQuality: 'good',
      Raw: { audioLevel: 0, getTrackPublication: (source: string) => publications[source] },
    } as unknown as LiveKitParticipantView;
  };

  const render = (fakeController: LiveKitRoomController, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(LiveKitRoomComponent, {
      providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fakeController }],
      inputs: { AutoConnect: false, ...inputs },
    });

  /** A participant who may be the agent, may be speaking, and may share a screen. */
  const person = (identity: string, over: { Local?: boolean; Agent?: boolean; Speaking?: boolean; Sharing?: boolean } = {}): LiveKitParticipantView => ({
    ...view(identity, { Local: over.Local, Sharing: over.Sharing }),
    Role: over.Agent ? 'agent' : 'participant',
    IsSpeaking: over.Speaking ?? false,
  }) as LiveKitParticipantView;

  /** The names on the tiles inside the matching containers, in order (an agent's "AI" badge left off). */
  const names = (f: ReturnType<typeof render>, selector: string): string[] =>
    queryAll(f, `${selector} .tile__name`).map((name) => (name.textContent ?? '').trim().split(/\s+/)[0]);

  /** A connected room: the user, and the remote participants given. */
  const room = (remote: LiveKitParticipantView[], over: Partial<LiveKitRoomState> = {}) =>
    makeFakeController(makeState({ Status: 'connected', Local: person('you', { Local: true }), Remote: remote, ...over }));

  /** The named participant's tile, wherever it is. */
  const tileOf = (f: ReturnType<typeof render>, name: string): Element | undefined =>
    queryAll(f, 'mj-media-tile, mj-self-view').find((t) => t.querySelector('.tile__name')?.textContent?.trim().split(/\s+/)[0] === name);

  /** Clicks the pin on the named participant's tile. */
  const pin = (f: ReturnType<typeof render>, name: string) => {
    (tileOf(f, name)?.querySelector('.tile__pin') as HTMLButtonElement).click();
    f.detectChanges();
  };

  it('renders the connection overlay (not the connected stage) when the controller reports "connecting"', () => {
    const fc = makeFakeController(makeState({ Status: 'connecting' }));
    const f = render(fc.controller);
    expect(query(f, 'mj-connection-overlay')).not.toBeNull();
    expect(text(f, 'mj-connection-overlay')).toContain('Connecting');
    expect(query(f, 'mj-livekit-control-bar')).not.toBeNull(); // container chrome still renders
  });

  it('hides the overlay and shows the (empty) participant stage when connected', () => {
    const fc = makeFakeController(makeState({ Status: 'connected', RoomName: 'Standup' }));
    const f = render(fc.controller);
    expect(query(f, 'mj-connection-overlay')).toBeNull();
    expect(text(f, '.lk-room__grid')).toContain('Waiting for participants');
  });

  it('plays every remote voice, whatever the layout shows', () => {
    // Split view shows two tiles (the sharer and the speaker); all three remote participants are still heard.
    const remote = (identity: string, over: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView =>
      ({
        Identity: identity,
        DisplayName: identity,
        IsLocal: false,
        Role: 'participant',
        IsSpeaking: false,
        AudioLevel: 0,
        HasAudio: true,
        HasVideo: false,
        IsScreenSharing: false,
        ConnectionQuality: 'good',
        Raw: { audioLevel: 0, getTrackPublication: () => undefined },
        ...over,
      }) as unknown as LiveKitParticipantView;
    const fc = makeFakeController(makeState({ Status: 'connected', Remote: [view('sharer', { Sharing: true }), remote('talker'), remote('listener')] }));
    const f = render(fc.controller, { Layout: 'split', ShowAudioMeters: false });
    expect(queryAll(f, 'mj-media-tile')).toHaveLength(2);
    expect(queryAll(f, 'mj-livekit-participant-audio')).toHaveLength(3);
  });

  it("keeps the split layout's screen pane plain: no pin there, while the speaker pane has one", () => {
    const fc = makeFakeController(makeState({ Status: 'connected', Remote: [view('sharer', { Sharing: true }), view('talker')] }));
    const f = render(fc.controller, { Layout: 'split', ShowAudioMeters: false, EnablePinning: true });
    const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
    expect(sharePane.querySelector('mj-media-tile .tile__pin')).toBeNull();
    expect(speakerPane.querySelector('mj-media-tile .tile__pin')).not.toBeNull();
  });

  it('renders the room name from controller State in the header', () => {
    const fc = makeFakeController(makeState({ Status: 'connected', RoomName: 'Standup' }));
    const f = render(fc.controller);
    expect(text(f, '.lk-room__title')).toContain('Standup');
  });

  it('routes a control-bar mic toggle back to the injected controller', () => {
    const fc = makeFakeController(makeState({ Status: 'connected' }));
    const f = render(fc.controller);
    // mic is off in State.LocalMedia → the control-bar button is labelled "Unmute microphone"
    const mic = query(f, 'mj-livekit-control-bar button[title="Unmute microphone"]') as HTMLButtonElement;
    expect(mic).not.toBeNull();
    mic.click();
    expect(fc.toggleMicrophone).toHaveBeenCalled();
  });

  it('starts a share from the Share menu with the picked kind of surface offered first', () => {
    const fc = makeFakeController(makeState({ Status: 'connected' }));
    const f = render(fc.controller);
    (query(f, 'mj-livekit-control-bar button[title="Choose what to share"]') as HTMLButtonElement).click();
    f.detectChanges();
    const tab = (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Browser tab');
    tab?.click();
    f.detectChanges();
    expect(fc.setScreenShareEnabled).toHaveBeenCalledWith(true, 'tab');
  });

  describe("the user's own tile", () => {
    const sharing = { MicrophoneEnabled: true, CameraEnabled: true, ScreenShareEnabled: true, ScreenShareSurface: 'window' as const };

    it('is a mirrored self-view, while everyone else gets a plain tile', () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true }), Remote: [view('ada')] }));
      const f = render(fc.controller);
      expect(queryAll(f, '.lk-room__grid-tile > mj-self-view')).toHaveLength(1);
      expect(query(f, 'mj-self-view .tile__video')?.classList.contains('tile__video--mirrored')).toBe(true);
      expect(queryAll(f, '.lk-room__grid-tile > mj-media-tile')).toHaveLength(1);
    });

    it('hides from its Hide button, and comes back from the chip', () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true }), Remote: [view('ada')] }));
      const f = render(fc.controller);
      (query(f, 'mj-self-view button.self__hide') as HTMLButtonElement).click();
      f.detectChanges();
      expect(query(f, 'mj-self-view')).toBeNull();
      expect(text(f, '.lk-room__self-hidden')).toContain('Self-view hidden');

      (query(f, '.lk-room__self-hidden button') as HTMLButtonElement).click();
      f.detectChanges();
      expect(query(f, 'mj-self-view')).not.toBeNull();
      expect(query(f, '.lk-room__self-hidden')).toBeNull();
    });

    it('shows neither the self-view nor the chip when the host turns the self-view off', () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true }), Remote: [view('ada')] }));
      const f = render(fc.controller, { ShowSelfView: false });
      expect(query(f, 'mj-self-view')).toBeNull();
      expect(query(f, '.lk-room__self-hidden')).toBeNull();
    });

    it('drops the chip when the host turns the self-view off after the user hid it', () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true }), Remote: [view('ada')] }));
      const f = render(fc.controller);
      (query(f, 'mj-self-view button.self__hide') as HTMLButtonElement).click();
      f.detectChanges();
      f.componentRef.setInput('ShowSelfView', false);
      f.detectChanges();
      expect(query(f, '.lk-room__self-hidden')).toBeNull();
    });

    it('offers Hide only where hiding takes it off the stage', () => {
      // Alone in spotlight layout, the user is the spotlight whatever the self-view setting.
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true }) }));
      const f = render(fc.controller, { Layout: 'spotlight' });
      expect(query(f, '.lk-room__spotlight mj-self-view')).not.toBeNull();
      expect(query(f, 'mj-self-view button.self__hide')).toBeNull();
    });

    it('is the share preview while the user shares, labelled, with Stop sharing and Change', () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Camera: true, Sharing: true }), Remote: [view('ada')], LocalMedia: sharing }));
      const f = render(fc.controller);
      expect(query(f, 'mj-self-view')).toBeNull();
      expect(text(f, 'mj-share-preview .share__label')).toContain('Sharing a window');
      const [stop, change] = queryAll(f, 'mj-share-preview .share__actions button') as HTMLButtonElement[];
      stop.click();
      change.click();
      expect(fc.setScreenShareEnabled).toHaveBeenCalledWith(false);
      expect(fc.changeScreenShare).toHaveBeenCalledOnce();
    });

    it("fills the split layout's screen pane while the user shares", () => {
      const fc = makeFakeController(makeState({ Status: 'connected', Local: view('me', { Local: true, Sharing: true }), Remote: [view('ada')], LocalMedia: sharing }));
      const f = render(fc.controller, { Layout: 'split', ShowAudioMeters: false });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('mj-share-preview')).not.toBeNull();
      expect(speakerPane.querySelector('mj-media-tile')).not.toBeNull();
    });
  });

  describe('the layouts', () => {
    it('Active speaker: the remote who speaks has the spotlight, and the filmstrip has everyone else, the user first', () => {
      const fc = room([person('ada', { Speaking: true }), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'spotlight' });
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'sage']);
    });

    it("Active speaker: the platform's speaker list comes first, never the user", () => {
      const fc = room([person('ada'), person('sage', { Agent: true })], { ActiveSpeakerIdentities: ['you', 'ada'] });
      const f = render(fc.controller, { Layout: 'spotlight' });
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it('Active speaker: with nobody speaking the agent has the spotlight, a pin wins, and no pin without pinning', () => {
      const fc = room([person('ada'), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'spotlight' });
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
      const ada = queryAll(f, '.lk-room__filmstrip-tile').find((tile) => tile.querySelector('.tile__name')?.textContent?.trim() === 'ada');
      (ada?.querySelector('.tile__pin') as HTMLButtonElement).click();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'sage']);
      f.componentRef.setInput('EnablePinning', false);
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
    });

    it('Active speaker: the user alone has the spotlight', () => {
      const f = render(room([]).controller, { Layout: 'spotlight' });
      expect(names(f, '.lk-room__spotlight')).toEqual(['you']);
    });

    it('Active speaker: the filmstrip leaves out the self-view when the host turns it off', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'spotlight', ShowSelfView: false });
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['ada']);
    });

    it('Active speaker: follows the room as it changes, a new speaker taking the spotlight', () => {
      const fc = room([person('ada'), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'spotlight' });
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
      fc.emitState(makeState({ Status: 'connected', Local: person('you', { Local: true }), Remote: [person('ada', { Speaking: true }), person('sage', { Agent: true })] }));
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it('Gallery: everyone, the user first, and the others once the user hides their self-view', () => {
      const f = render(room([person('ada', { Speaking: true }), person('sage', { Agent: true })]).controller, { Layout: 'grid' });
      expect(names(f, '.lk-room__grid-tile')).toEqual(['you', 'ada', 'sage']);
      (query(f, 'mj-self-view button.self__hide') as HTMLButtonElement).click();
      f.detectChanges();
      expect(names(f, '.lk-room__grid-tile')).toEqual(['ada', 'sage']);
    });

    it('Split view: the shared screen beside the speaker, who is never the sharer', () => {
      const fc = room([person('ada', { Sharing: true, Speaking: true }), person('sage', { Agent: true })], { ActiveSpeakerIdentities: ['ada'] });
      const f = render(fc.controller, { Layout: 'split', ShowAudioMeters: false });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('.tile__name')?.textContent?.trim()).toBe('ada');
      expect(speakerPane.querySelector('.tile__name')?.textContent?.trim().split(/\s+/)[0]).toBe('sage');
    });

    it("Split view: a share whose screen track has not arrived yet shows no screen, and the sharer can be the speaker", () => {
      const announced = { ...person('ada', { Speaking: true }), IsScreenSharing: true } as LiveKitParticipantView;
      const f = render(room([announced, person('sage', { Agent: true })], { ActiveSpeakerIdentities: ['ada'] }).controller, { Layout: 'split', ShowAudioMeters: false });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('mj-empty-state')).not.toBeNull();
      expect(speakerPane.querySelector('.tile__name')?.textContent?.trim()).toBe('ada');
    });

    it('Split view: with nobody sharing, an empty screen pane beside the speaker', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true, Speaking: true })]).controller, { Layout: 'split', ShowAudioMeters: false });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('mj-empty-state')).not.toBeNull();
      expect(speakerPane.querySelector('.tile__name')?.textContent?.trim().split(/\s+/)[0]).toBe('sage');
    });
  });

  describe('the spotlight, as a move', () => {
    it('pinning in Gallery switches to Active speaker with that person in the spotlight, and the room says so', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'grid' });
      const layouts: string[] = [];
      f.componentInstance.LayoutChange.subscribe((layout: string) => layouts.push(layout));
      pin(f, 'ada');
      expect(layouts).toEqual(['spotlight']);
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      expect(f.componentInstance.PinnedIdentity).toBe('ada');
    });

    it('a second pin sends the first back to the filmstrip, and unpinning gives the spotlight back to the call', () => {
      const f = render(room([person('ada'), person('bo'), person('sage', { Agent: true })]).controller, { Layout: 'spotlight' });
      pin(f, 'ada');
      pin(f, 'bo');
      expect(names(f, '.lk-room__spotlight')).toEqual(['bo']);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'ada', 'sage']);
      pin(f, 'bo');
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
      expect(f.componentInstance.PinnedIdentity).toBeNull();
    });

    it('gives the spotlight back to the call while the pinned participant is away, and back to them when they return', () => {
      const fc = room([person('ada'), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'spotlight' });
      pin(f, 'ada');
      fc.emitState(makeState({ Status: 'connected', Local: person('you', { Local: true }), Remote: [person('sage', { Agent: true })] }));
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
      expect(f.componentInstance.PinnedIdentity).toBeNull();
      fc.emitState(makeState({ Status: 'connected', Local: person('you', { Local: true }), Remote: [person('ada'), person('sage', { Agent: true })] }));
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it("moves a tile when a host sets PinnedIdentity, and sends it back on null", () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'spotlight' });
      const cdr = f.componentRef.injector.get(ChangeDetectorRef);
      f.componentInstance.PinnedIdentity = 'ada';
      cdr.markForCheck();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      f.componentInstance.PinnedIdentity = null;
      cdr.markForCheck();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
    });

    it('keeps a pin a host cleared while pinning was off cleared when pinning comes back', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'spotlight' });
      pin(f, 'ada');
      f.componentRef.setInput('EnablePinning', false);
      f.componentInstance.PinnedIdentity = null;
      f.componentRef.setInput('EnablePinning', true);
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
    });

    it('ignores a move the room does not offer: the pin stays', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'spotlight' });
      pin(f, 'ada');
      f.componentInstance.MoveTile('ada', 'hidden');
      f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it('moves nothing to the spotlight while pinning is off, and no tile offers a pin', () => {
      const f = render(room([person('ada'), person('sage', { Agent: true })]).controller, { Layout: 'grid', EnablePinning: false });
      const layouts: string[] = [];
      f.componentInstance.LayoutChange.subscribe((layout: string) => layouts.push(layout));
      f.componentInstance.MoveTile('ada', 'stage');
      expect(layouts).toEqual([]);
      expect(f.componentInstance.PinnedIdentity).toBeNull();
      expect(query(f, '.tile__pin')).toBeNull();
    });
  });

  describe('"Move to…" on every tile', () => {
    /** Opens the "Move to…" menu in the named participant's tile and lists its items. */
    const openMenu = (f: ReturnType<typeof render>, name: string): HTMLElement[] => {
      (tileOf(f, name)?.querySelector('mj-media-move-menu button') as HTMLButtonElement).click();
      f.detectChanges();
      return overlayQueryAll('mj-menu-item') as HTMLElement[];
    };
    const labels = (items: HTMLElement[]) => items.map((item) => item.textContent?.trim());
    const disabled = (items: HTMLElement[]) => items.map((item) => item.getAttribute('aria-disabled') === 'true');
    /** Picks an item from the named participant's menu. */
    const pick = (f: ReturnType<typeof render>, name: string, item: string) => {
      openMenu(f, name).find((el) => el.textContent?.trim() === item)?.click();
      f.detectChanges();
    };
    const twoAndAgent = () => room([person('ada'), person('bo'), person('sage', { Agent: true })]).controller;

    it("offers a filmstrip tile the spotlight and a box, its own place disabled, then Reset layout, in the tile's corner", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const menu = tileOf(f, 'ada')?.querySelector('.tile__actions-slot mj-media-move-menu');
      expect(menu?.classList.contains('media-move--over-video')).toBe(true);
      expect(menu?.querySelector('button')?.getAttribute('aria-label')).toBe('Move ada');
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Picture-in-picture', 'Filmstrip', 'Reset layout']);
      expect(disabled(items)).toEqual([false, false, true, false]);
    });

    it("offers the call's own spotlight pick the spotlight and a box, not the filmstrip; Spotlight pins them", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const items = openMenu(f, 'sage');
      expect(labels(items)).toEqual(['Spotlight', 'Picture-in-picture', 'Reset layout']);
      items[0].click();
      f.detectChanges();
      expect(f.componentInstance.PinnedIdentity).toBe('sage');
    });

    it('moves a tile to the spotlight and back to the filmstrip', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pick(f, 'ada', 'Spotlight');
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Picture-in-picture', 'Filmstrip', 'Reset layout']);
      expect(disabled(items)).toEqual([true, false, false, false]);
      items.find((el) => el.textContent?.trim() === 'Filmstrip')?.click();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
    });

    it('calls the strip Gallery in Gallery, where Spotlight switches to Active speaker', () => {
      const f = render(twoAndAgent(), { Layout: 'grid' });
      const layouts: string[] = [];
      f.componentInstance.LayoutChange.subscribe((layout: string) => layouts.push(layout));
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Picture-in-picture', 'Gallery', 'Reset layout']);
      items[0].click();
      f.detectChanges();
      expect(layouts).toEqual(['spotlight']);
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it('Reset layout gives the spotlight back to the call', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pin(f, 'bo');
      pick(f, 'ada', 'Reset layout');
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
      expect(f.componentInstance.PinnedIdentity).toBeNull();
    });

    it("puts the user's own menu before their Hide button", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const corner = Array.from(tileOf(f, 'you')?.querySelectorAll('.tile__actions-slot > *') ?? []);
      expect(corner.map((el) => (el.tagName.toLowerCase() === 'mj-media-move-menu' ? 'menu' : el.className.split(' ')[0]))).toEqual(['menu', 'self__hide']);
    });

    it("puts the menu on the user's share preview while they share", () => {
      const sharing = { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: true, ScreenShareSurface: 'window' as const };
      const f = render(room([person('ada')], { Local: person('you', { Local: true, Sharing: true }), LocalMedia: sharing }).controller, { Layout: 'spotlight' });
      expect(query(f, 'mj-share-preview .share__corner mj-media-move-menu')).not.toBeNull();
    });

    it('without pinning, offers a tile the strip and a box', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight', EnablePinning: false });
      expect(labels(openMenu(f, 'ada'))).toEqual(['Picture-in-picture', 'Filmstrip', 'Reset layout']);
    });

    it("without pinning, offers the call's own pick a box alone", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight', EnablePinning: false });
      expect(labels(openMenu(f, 'sage'))).toEqual(['Picture-in-picture', 'Reset layout']);
    });

    it('has no menu on the shared screen in split view, and one on the speaker', () => {
      const fc = room([person('ada', { Sharing: true }), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'split' });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('mj-media-move-menu')).toBeNull();
      expect(speakerPane.querySelector('mj-media-move-menu')).not.toBeNull();
    });
  });

  describe('picture-in-picture', () => {
    const twoAndAgent = () => room([person('ada'), person('bo'), person('sage', { Agent: true })]).controller;
    /** Picks an item from the "Move to…" menu in the named participant's tile corner. */
    const pickInTile = (f: ReturnType<typeof render>, name: string, item: string) => {
      (tileOf(f, name)?.querySelector('mj-media-move-menu button') as HTMLButtonElement).click();
      f.detectChanges();
      (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((el) => el.textContent?.trim() === item)?.click();
      f.detectChanges();
    };
    /** The named participant's box. */
    const boxOf = (f: ReturnType<typeof render>, name: string): Element | undefined =>
      queryAll(f, '.lk-room__pips .stage-surface--pip').find((box) => box.querySelector('.stage-pip-title')?.textContent?.trim() === name);
    /** Opens the "Move to…" menu on the named participant's box bar and lists its items. */
    const openBarMenu = (f: ReturnType<typeof render>, name: string): HTMLElement[] => {
      (boxOf(f, name)?.querySelector('.stage-pip-bar mj-media-move-menu button') as HTMLButtonElement).click();
      f.detectChanges();
      return overlayQueryAll('mj-menu-item') as HTMLElement[];
    };
    const boxed = (f: ReturnType<typeof render>) => names(f, '.lk-room__pip-tile');

    it('moves a tile into a box, out of the filmstrip', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'ada', 'Picture-in-picture');
      expect(boxed(f)).toEqual(['ada']);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'bo']);
    });

    it("gives the box's tile no pin or corner menu, and puts the menu on the box's bar, the box disabled", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'ada', 'Picture-in-picture');
      expect(query(f, '.lk-room__pip-tile .tile__pin')).toBeNull();
      expect(query(f, '.lk-room__pip-tile mj-media-move-menu')).toBeNull();
      const items = openBarMenu(f, 'ada');
      expect(items.map((item) => item.textContent?.trim())).toEqual(['Spotlight', 'Picture-in-picture', 'Filmstrip', 'Reset layout']);
      expect(items.map((item) => item.getAttribute('aria-disabled') === 'true')).toEqual([false, true, false, false]);
    });

    it("without pinning, offers on the box's bar the strip and the box alone", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight', EnablePinning: false });
      pickInTile(f, 'ada', 'Picture-in-picture');
      expect(openBarMenu(f, 'ada').map((item) => item.textContent?.trim())).toEqual(['Picture-in-picture', 'Filmstrip', 'Reset layout']);
    });

    it("brings a boxed participant back to the filmstrip from the box's bar", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'ada', 'Picture-in-picture');
      openBarMenu(f, 'ada').find((item) => item.textContent?.trim() === 'Filmstrip')?.click();
      f.detectChanges();
      expect(boxed(f)).toEqual([]);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'ada', 'bo']);
    });

    it("pins a boxed participant from the box's bar", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'ada', 'Picture-in-picture');
      openBarMenu(f, 'ada').find((item) => item.textContent?.trim() === 'Spotlight')?.click();
      f.detectChanges();
      expect(boxed(f)).toEqual([]);
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
    });

    it("gives the spotlight to the next in line when the call's pick is boxed", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'sage', 'Picture-in-picture');
      expect(boxed(f)).toEqual(['sage']);
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'bo']);
    });

    it('leaves a boxed participant out of the grid in Gallery', () => {
      const f = render(twoAndAgent(), { Layout: 'grid' });
      pickInTile(f, 'bo', 'Picture-in-picture');
      expect(boxed(f)).toEqual(['bo']);
      expect(names(f, '.lk-room__grid-tile')).toEqual(['you', 'ada', 'sage']);
    });

    it("in split view, does not make a boxed participant the speaker, and still shows their shared screen", () => {
      const fc = room([person('ada', { Sharing: true }), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'split' });
      f.componentInstance.MoveTile('ada', 'pip');
      f.componentInstance.MoveTile('sage', 'pip');
      f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
      f.detectChanges();
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('.tile__name')?.textContent).toContain('ada');
      expect(speakerPane.querySelector('.tile__name')?.textContent).toContain('you');
    });

    it("takes the user's box away while a host turns their self-view off, and gives it back after", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'you', 'Picture-in-picture');
      expect(boxed(f)).toEqual(['you']);
      f.componentRef.setInput('ShowSelfView', false);
      f.detectChanges();
      expect(boxed(f)).toEqual([]);
      f.componentRef.setInput('ShowSelfView', true);
      f.detectChanges();
      expect(boxed(f)).toEqual(['you']);
    });

    it('empties every box on Reset layout', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pickInTile(f, 'ada', 'Picture-in-picture');
      pickInTile(f, 'bo', 'Picture-in-picture');
      expect(boxed(f)).toEqual(['bo', 'ada']);
      openBarMenu(f, 'ada').find((item) => item.textContent?.trim() === 'Reset layout')?.click();
      f.detectChanges();
      expect(boxed(f)).toEqual([]);
    });
  });

  describe('the layout, kept by the host', () => {
    const twoAndAgent = () => room([person('ada'), person('bo'), person('sage', { Agent: true })]).controller;
    const boxed = (f: ReturnType<typeof render>) => names(f, '.lk-room__pip-tile');
    const stageOf = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(MediaStageComponent)).componentInstance as MediaStageComponent;
    const RECT: MediaPipRect = { X: 0.1, Y: 0.2, W: 0.3, H: 0.25 };

    it("starts from the host's moves: a pinned tile in the spotlight, a boxed one in its box", () => {
      const moves: MediaPlacementMove[] = [
        { SurfaceKey: 'participant:ada', Placement: 'stage' },
        { SurfaceKey: 'participant:bo', Placement: 'pip' },
      ];
      const f = render(twoAndAgent(), { Layout: 'spotlight', TileMoves: moves });
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      expect(boxed(f)).toEqual(['bo']);
      expect(f.componentInstance.PinnedIdentity).toBe('ada');
    });

    it('leaves a tile among the others for a saved move to hide it, a place the room does not offer', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight', TileMoves: [{ SurfaceKey: 'participant:ada', Placement: 'hidden' }] });
      expect(names(f, '.lk-room__filmstrip-tile')).toEqual(['you', 'ada', 'bo']);
    });

    it("tells the host each move the user makes, and not the host's own changes", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const told: (readonly MediaPlacementMove[])[] = [];
      f.componentInstance.TileMovesChange.subscribe((moves: readonly MediaPlacementMove[]) => told.push(moves));
      f.componentInstance.MoveTile('ada', 'pip');
      f.componentInstance.MoveTile('bo', 'stage');
      expect(told).toEqual([
        [{ SurfaceKey: 'participant:ada', Placement: 'pip' }],
        [
          { SurfaceKey: 'participant:ada', Placement: 'pip' },
          { SurfaceKey: 'participant:bo', Placement: 'stage' },
        ],
      ]);
      f.componentRef.setInput('TileMoves', []);
      f.componentInstance.PinnedIdentity = 'sage';
      expect(told).toHaveLength(2);
    });

    it("gives the host's box positions to the stage, and keeps and tells a moved box", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight', PipRects: new Map([['bo', RECT]]) });
      expect(stageOf(f).PipRects.get('bo')).toEqual(RECT);
      const told: ReadonlyMap<string, MediaPipRect>[] = [];
      f.componentInstance.PipRectsChange.subscribe((rects: ReadonlyMap<string, MediaPipRect>) => told.push(rects));
      const moved: MediaPipRect = { X: 0.5, Y: 0.5, W: 0.3, H: 0.25 };
      stageOf(f).PipRectChange.emit({ Key: 'ada', Rect: moved });
      expect([...told[0]]).toEqual([
        ['bo', RECT],
        ['ada', moved],
      ]);
      expect(f.componentInstance.PipRects.get('ada')).toEqual(moved);
    });

    it("clears the moves and the boxes' positions on Reset layout, and tells the host both", () => {
      const f = render(twoAndAgent(), {
        Layout: 'spotlight',
        TileMoves: [{ SurfaceKey: 'participant:ada', Placement: 'pip' }],
        PipRects: new Map([['ada', RECT]]),
      });
      const moves: (readonly MediaPlacementMove[])[] = [];
      const rects: ReadonlyMap<string, MediaPipRect>[] = [];
      f.componentInstance.TileMovesChange.subscribe((m: readonly MediaPlacementMove[]) => moves.push(m));
      f.componentInstance.PipRectsChange.subscribe((r: ReadonlyMap<string, MediaPipRect>) => rects.push(r));
      f.componentInstance.OnResetLayout();
      expect(moves).toEqual([[]]);
      expect(rects.map((r) => r.size)).toEqual([0]);
    });
  });

  describe('the lobby', () => {
    /** Everything the lobby's devices and the room's connection did, in order. */
    let log: string[];
    /** A camera and microphone the test drives; its devices appear on the first listing. */
    class FakeMedia implements ILocalMediaController {
      private readonly state = new BehaviorSubject<LocalMediaState>({ Camera: { Status: 'off' }, Microphone: { Status: 'off' }, Devices: [] });
      private readonly stream = (id: string) => ({ id, getTracks: () => [], getAudioTracks: () => [] }) as unknown as MediaStream;
      public get State() {
        return this.state.value;
      }
      public get State$() {
        return this.state.asObservable();
      }
      public GetStream(): MediaStream | null {
        return null;
      }
      public async RefreshDevices(): Promise<MediaDevice[]> {
        const devices: MediaDevice[] = [
          { DeviceID: 'mic-1', Kind: 'microphone', Label: 'Microphone', GroupID: 'g1' },
          { DeviceID: 'cam-1', Kind: 'camera', Label: 'Camera 1', GroupID: 'g1' },
          { DeviceID: 'cam-2', Kind: 'camera', Label: 'Camera 2', GroupID: 'g2' },
        ];
        log.push('list');
        this.state.next({ ...this.state.value, Devices: devices });
        return devices;
      }
      public async Start(kind: LocalMediaKind, deviceId?: string): Promise<LocalMediaResult> {
        log.push(`start ${kind}${deviceId ? ' ' + deviceId : ''}`);
        this.set(kind, { Status: 'on', DeviceID: deviceId ?? (kind === 'camera' ? 'cam-1' : 'mic-1') });
        return { Status: 'started', Stream: this.stream(kind) };
      }
      public async SwitchDevice(kind: LocalMediaKind, deviceId: string): Promise<LocalMediaResult> {
        log.push(`switch ${kind} ${deviceId}`);
        this.set(kind, { Status: 'on', DeviceID: deviceId });
        return { Status: 'started', Stream: this.stream(kind) };
      }
      public Stop(kind: LocalMediaKind): void {
        log.push(`stop ${kind}`);
        this.set(kind, { Status: 'off' });
      }
      public Dispose(): void {
        log.push('release devices');
      }
      private set(kind: LocalMediaKind, track: LocalTrackState): void {
        this.state.next(kind === 'camera' ? { ...this.state.value, Camera: track } : { ...this.state.value, Microphone: track });
      }
    }

    let made: number;
    const renderLobby = (inputs: Record<string, unknown> = {}) => {
      log = [];
      made = 0;
      const fc = makeFakeController(makeState({ Status: 'idle' }));
      (fc.controller.Connect as ReturnType<typeof vi.fn>).mockImplementation(() => {
        log.push('connect');
        return Promise.resolve();
      });
      const f = renderComponentFixture(LiveKitRoomComponent, {
        providers: [
          { provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fc.controller },
          {
            provide: LOCAL_MEDIA_CONTROLLER_FACTORY,
            useValue: () => {
              made++;
              return new FakeMedia();
            },
          },
        ],
        inputs: { AutoConnect: false, ServerUrl: 'wss://example.test', Token: 'token', ...inputs },
      });
      return { f, fc };
    };
    const checkOf = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(CameraCheckComponent))?.componentInstance as CameraCheckComponent | undefined;
    /** Lets the lobby's devices start (promises outside Angular's view of pending work), then renders. */
    const settle = async (f: ReturnType<typeof render>) => {
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      f.detectChanges();
    };
    // jsdom does not play media: a stream source's <video> calls play(), and pause() when it lets go.
    beforeEach(() => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    });

    it('shows the camera check before joining, starting the microphone and the camera as the room starts with them', async () => {
      const { f } = renderLobby({ ShowPreJoin: true, StartWithCamera: true });
      await settle(f);
      expect(checkOf(f)).toBeDefined();
      expect(log).toEqual(['start microphone', 'start camera', 'list']);
      expect(checkOf(f)?.CameraSource).toEqual({ Kind: 'stream', Stream: expect.objectContaining({ id: 'camera' }) });
      expect(checkOf(f)?.Devices.map((d) => d.DeviceID)).toEqual(['mic-1', 'cam-1', 'cam-2']);
      expect(typeof checkOf(f)?.MicrophoneLevel).toBe('function');
    });

    it('leaves the microphone off when the room starts without it', async () => {
      const { f } = renderLobby({ ShowPreJoin: true, StartWithMicrophone: false });
      await settle(f);
      expect(log).toEqual(['list']);
      expect(checkOf(f)?.MicrophoneOn).toBe(false);
    });

    it('turns the camera on from the check', async () => {
      const { f } = renderLobby({ ShowPreJoin: true });
      await settle(f);
      expect(checkOf(f)?.CameraSource).toBeNull();
      checkOf(f)?.CameraToggled.emit(true);
      await settle(f);
      expect(log).toContain('start camera');
      expect(checkOf(f)?.CameraOn).toBe(true);
      expect(checkOf(f)?.CameraSource).not.toBeNull();
    });

    it('joins with the name from the check and the devices the lobby chose, after freeing them', async () => {
      const { f, fc } = renderLobby({ ShowPreJoin: true });
      await settle(f);
      checkOf(f)?.DeviceSelected.emit({ Kind: 'camera', DeviceID: 'cam-2' });
      checkOf(f)?.CameraToggled.emit(true);
      await settle(f);
      checkOf(f)?.Confirmed.emit({ DisplayName: ' Ada ', MicrophoneOn: true, CameraOn: true });
      await settle(f);
      expect(log.slice(-2)).toEqual(['release devices', 'connect']);
      expect(fc.controller.Connect).toHaveBeenCalledWith(
        'wss://example.test',
        'token',
        expect.objectContaining({ DisplayName: 'Ada', EnableMicrophone: true, EnableCamera: true, MicrophoneDeviceId: 'mic-1', CameraDeviceId: 'cam-2' })
      );
      expect(checkOf(f)).toBeUndefined();
    });

    it("frees the lobby's devices when the room goes away", async () => {
      const { f } = renderLobby({ ShowPreJoin: true });
      await settle(f);
      f.destroy();
      expect(log).toContain('release devices');
    });

    it("runs on the browser's own camera and microphone by default: one that cannot capture leaves the microphone off", async () => {
      const fc = makeFakeController(makeState({ Status: 'idle' }));
      const f = renderComponentFixture(LiveKitRoomComponent, {
        providers: [{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => fc.controller }],
        inputs: { AutoConnect: false, ShowPreJoin: true },
      });
      await settle(f);
      expect(checkOf(f)?.MicrophoneOn).toBe(false);
      expect(f.componentInstance.LobbyState?.Microphone).toMatchObject({ Status: 'failed', Failure: 'unsupported' });
    });

    it('has no lobby without ShowPreJoin, and never opens the devices', async () => {
      const { f } = renderLobby();
      await settle(f);
      expect(checkOf(f)).toBeUndefined();
      expect(made).toBe(0);
    });
  });

  it('re-renders when the controller emits a stateChanged event (connecting → connected)', () => {
    const fc = makeFakeController(makeState({ Status: 'connecting' }));
    const f = render(fc.controller);
    expect(query(f, 'mj-connection-overlay')).not.toBeNull();

    fc.emitState(makeState({ Status: 'connected', RoomName: 'Standup' }));
    f.detectChanges();

    expect(query(f, 'mj-connection-overlay')).toBeNull();
    expect(text(f, '.lk-room__title')).toContain('Standup');
  });
});
