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
      /** Mutate State and fire the controller's `stateChanged` event, as the real controller would. */
      emitState(next: LiveKitRoomState): void {
        state = next;
        handlers.get('stateChanged')?.(next);
      },
    };
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
