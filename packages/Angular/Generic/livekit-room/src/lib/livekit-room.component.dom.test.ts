import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
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
  const tileOf = (f: ReturnType<typeof render>, name: string): HTMLElement | undefined =>
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

    it("offers a filmstrip tile the spotlight, its own place disabled, then Reset layout, in the tile's corner", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const menu = tileOf(f, 'ada')?.querySelector('.tile__actions-slot mj-media-move-menu');
      expect(menu?.classList.contains('media-move--over-video')).toBe(true);
      expect(menu?.querySelector('button')?.getAttribute('aria-label')).toBe('Move ada');
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Filmstrip', 'Reset layout']);
      expect(disabled(items)).toEqual([false, true, false]);
    });

    it("offers the call's own spotlight pick the spotlight alone, which pins them there", () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      const items = openMenu(f, 'sage');
      expect(labels(items)).toEqual(['Spotlight', 'Reset layout']);
      items[0].click();
      f.detectChanges();
      expect(f.componentInstance.PinnedIdentity).toBe('sage');
    });

    it('moves a tile to the spotlight and back to the filmstrip', () => {
      const f = render(twoAndAgent(), { Layout: 'spotlight' });
      pick(f, 'ada', 'Spotlight');
      expect(names(f, '.lk-room__spotlight')).toEqual(['ada']);
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Filmstrip', 'Reset layout']);
      expect(disabled(items)).toEqual([true, false, false]);
      items.find((el) => el.textContent?.trim() === 'Filmstrip')?.click();
      f.detectChanges();
      expect(names(f, '.lk-room__spotlight')).toEqual(['sage']);
    });

    it('calls the strip Gallery in Gallery, where Spotlight switches to Active speaker', () => {
      const f = render(twoAndAgent(), { Layout: 'grid' });
      const layouts: string[] = [];
      f.componentInstance.LayoutChange.subscribe((layout: string) => layouts.push(layout));
      const items = openMenu(f, 'ada');
      expect(labels(items)).toEqual(['Spotlight', 'Gallery', 'Reset layout']);
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
      const corner = [...(tileOf(f, 'you')?.querySelectorAll('.tile__actions-slot > *') ?? [])];
      expect(corner.map((el) => (el.tagName.toLowerCase() === 'mj-media-move-menu' ? 'menu' : el.className.split(' ')[0]))).toEqual(['menu', 'self__hide']);
    });

    it("puts the menu on the user's share preview while they share", () => {
      const sharing = { MicrophoneEnabled: false, CameraEnabled: false, ScreenShareEnabled: true, ScreenShareSurface: 'window' as const };
      const f = render(room([person('ada')], { Local: person('you', { Local: true, Sharing: true }), LocalMedia: sharing }).controller, { Layout: 'spotlight' });
      expect(query(f, 'mj-share-preview .share__corner mj-media-move-menu')).not.toBeNull();
    });

    it('has no menu while pinning is off', () => {
      expect(query(render(twoAndAgent(), { Layout: 'spotlight', EnablePinning: false }), 'mj-media-move-menu')).toBeNull();
    });

    it('has no menu on the shared screen in split view, and one on the speaker', () => {
      const fc = room([person('ada', { Sharing: true }), person('sage', { Agent: true })]);
      const f = render(fc.controller, { Layout: 'split' });
      const [sharePane, speakerPane] = queryAll(f, '.lk-room__split-pane');
      expect(sharePane.querySelector('mj-media-move-menu')).toBeNull();
      expect(speakerPane.querySelector('mj-media-move-menu')).not.toBeNull();
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
