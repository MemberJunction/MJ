import { describe, it, expect, vi, afterEach } from 'vitest';
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
    const fc = makeFakeController(makeState({ Status: 'connected', Remote: [remote('sharer', { IsScreenSharing: true }), remote('talker'), remote('listener')] }));
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
