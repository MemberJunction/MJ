import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderComponentFixture, query, queryAll, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { LiveKitControlBarComponent } from './livekit-control-bar.component';

afterEach(() => {
  clearOverlayContainers();
});

/**
 * DOM spec for <mj-livekit-control-bar> — a standalone, pure @Input/@Output leaf (no
 * livekit-client, no media). Covers the per-control feature gates, the LocalMedia →
 * button-state variants/icons (the microphone, camera and Share buttons come from
 * mj-media-controls), the unread/participant badges, the Share menu, and the intent outputs.
 * The bar only emits intent; the host drives the controller — so there's nothing to
 * mock here.
 */
describe('LiveKitControlBarComponent (DOM)', () => {
  const render = (inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(LiveKitControlBarComponent, {
      inputs: {
        LocalMedia: { MicrophoneEnabled: true, CameraEnabled: true, ScreenShareEnabled: false },
        ...inputs,
      },
    });

  it('shows the default control set (mic, cam, screen, device, chat, participants, leave), all round', () => {
    const f = render();
    // 7 controls on by default; layout/whiteboard/recording and the Share menu are off
    const buttons = queryAll(f, 'button');
    expect(buttons.length).toBe(7);
    expect(buttons.every((b) => b.classList.contains('mj-btn--circle'))).toBe(true);
  });

  it('hides a control when its feature gate is false', () => {
    const f = render({ EnableMicrophoneControl: false });
    expect(query(f, 'button[title="Mute microphone"]')).toBeNull();
    expect(queryAll(f, 'button').length).toBe(6);
  });

  it('leaves out the media controls entirely when all three are gated off', () => {
    const f = render({ EnableMicrophoneControl: false, EnableCameraControl: false, EnableScreenShareControl: false });
    expect(query(f, 'mj-media-controls')).toBeNull();
    expect(queryAll(f, 'button').length).toBe(4);
  });

  it('renders the mic button in the muted state when the microphone is off', () => {
    const f = render({ LocalMedia: { MicrophoneEnabled: false, CameraEnabled: true, ScreenShareEnabled: false } });
    const mic = query(f, 'button[title="Unmute microphone"]');
    expect(mic).not.toBeNull();
    expect(mic?.classList.contains('mj-btn--danger')).toBe(true);
    expect(query(f, 'button[title="Unmute microphone"] .fa-microphone-slash')).not.toBeNull();
  });

  it('renders the mic button in the live state when the microphone is on', () => {
    const f = render();
    const mic = query(f, 'button[title="Mute microphone"]');
    expect(mic?.classList.contains('mj-btn--danger')).toBe(false);
    expect(query(f, 'button[title="Mute microphone"] .fa-microphone')).not.toBeNull();
  });

  it('emits ToggleMicrophone when the mic button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.ToggleMicrophone.subscribe(spy);
    (query(f, 'button[title="Mute microphone"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it("passes the agent-vision switch to the media controls, and reports the user's choice", () => {
    const f = render({ ShowAgentVision: true, AgentVisionOn: true });
    const asked: boolean[] = [];
    f.componentInstance.ToggleAgentVision.subscribe((on: boolean) => asked.push(on));
    (query(f, 'button[title="Stop letting the agent see your camera and screen"]') as HTMLButtonElement).click();
    expect(asked).toEqual([false]);
  });

  it('keeps the agent-vision switch when the microphone, camera and share controls are gated off', () => {
    const f = render({ EnableMicrophoneControl: false, EnableCameraControl: false, EnableScreenShareControl: false, ShowAgentVision: true });
    expect(query(f, 'button[title="Let the agent see your camera and screen"]')).not.toBeNull();
  });

  it('shows the unread chat badge only when there are unread messages', () => {
    expect(query(render({ UnreadChatCount: 0 }), '.lk-bar__badge')).toBeNull();
    expect(query(render({ UnreadChatCount: 3 }), '.lk-bar__badge')?.textContent?.trim()).toBe('3');
  });

  it('names the chat and participants buttons with the counts their badges show', () => {
    const f = render({ UnreadChatCount: 3, ParticipantCount: 5 });
    expect(query(f, 'button[title="Chat"]')?.getAttribute('aria-label')).toBe('Chat, 3 unread');
    expect(query(f, 'button[title="Participants"]')?.getAttribute('aria-label')).toBe('Participants, 5');
  });

  it('shows the recording control only when enabled, red and pulsing while recording', () => {
    expect(query(render(), 'button[title="Start recording"]')).toBeNull(); // off by default
    const f = render({ EnableRecordingControl: true, IsRecording: true });
    const btn = query(f, 'button[title="Stop recording"]');
    expect(btn).not.toBeNull();
    expect(btn?.classList.contains('mj-btn--danger')).toBe(true);
    expect(btn?.classList.contains('lk-bar__recording')).toBe(true);
  });

  it('emits Leave when the leave button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.Leave.subscribe(spy);
    (query(f, 'button[title="Leave"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('highlights the chat and participants buttons when their panels are open', () => {
    const f = render({ ChatOpen: true, ParticipantsOpen: true });
    expect(query(f, 'button[title="Chat"]')?.classList.contains('mj-btn--primary')).toBe(true);
    expect(query(f, 'button[title="Participants"]')?.classList.contains('mj-btn--primary')).toBe(true);
  });

  it('toggles screen sharing from the Share button, to start with no preference or to stop', () => {
    const f = render();
    const toggle = vi.fn();
    f.componentInstance.ToggleScreenShare.subscribe(toggle);
    (query(f, 'button[title="Share screen"]') as HTMLButtonElement).click();
    f.componentRef.setInput('LocalMedia', { MicrophoneEnabled: true, CameraEnabled: true, ScreenShareEnabled: true });
    f.detectChanges();
    (query(f, 'button[title="Stop sharing"]') as HTMLButtonElement).click();
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('has no Share menu unless the host turns it on', () => {
    expect(query(render(), 'button[title="Choose what to share"]')).toBeNull();
  });

  it('with the Share menu on, emits the picked kind of surface instead of a plain toggle', () => {
    const f = render({ EnableShareMenu: true });
    const requested = vi.fn();
    const toggle = vi.fn();
    f.componentInstance.ScreenShareRequested.subscribe(requested);
    f.componentInstance.ToggleScreenShare.subscribe(toggle);
    (query(f, 'button[title="Choose what to share"]') as HTMLButtonElement).click();
    f.detectChanges();
    const windowItem = (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Window');
    windowItem?.click();
    f.detectChanges();
    expect(requested).toHaveBeenCalledWith('window');
    expect(toggle).not.toHaveBeenCalled();
  });

  it("offers the host's panels under This panel, and emits the picked panel's key", () => {
    const f = render({ EnableShareMenu: true, SharePanels: [{ Key: 'share-panel-1', Label: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' }] });
    const panels = vi.fn();
    const requested = vi.fn();
    const toggle = vi.fn();
    f.componentInstance.PanelShareRequested.subscribe(panels);
    f.componentInstance.ScreenShareRequested.subscribe(requested);
    f.componentInstance.ToggleScreenShare.subscribe(toggle);
    (query(f, 'button[title="Choose what to share"]') as HTMLButtonElement).click();
    f.detectChanges();
    (overlayQueryAll('mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'This panel')?.click();
    f.detectChanges();
    (overlayQueryAll('mj-menu[aria-label="This panel"] mj-menu-item') as HTMLElement[]).find((item) => item.textContent?.trim() === 'Whiteboard')?.click();
    f.detectChanges();
    expect(panels).toHaveBeenCalledWith('share-panel-1');
    expect(requested).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
  });

  it('offers no This panel without panels', () => {
    const f = render({ EnableShareMenu: true });
    (query(f, 'button[title="Choose what to share"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect((overlayQueryAll('mj-menu-item') as HTMLElement[]).map((item) => item.textContent?.trim())).toEqual(['Entire screen', 'Window', 'Browser tab']);
  });
});
