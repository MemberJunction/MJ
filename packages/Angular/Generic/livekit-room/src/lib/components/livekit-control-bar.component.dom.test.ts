import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';

// This branch's @memberjunction/ng-test-utils exposes only renderComponentFixture (the
// dom-helpers are phase-2, not merged here). Thin local query helpers over the fixture's
// nativeElement keep these specs self-contained and match the pilot specs' native-query style.
const query = <T>(f: ComponentFixture<T>, sel: string): HTMLElement | null => f.nativeElement.querySelector(sel);
const queryAll = <T>(f: ComponentFixture<T>, sel: string): HTMLElement[] => Array.from(f.nativeElement.querySelectorAll(sel));
import { LiveKitControlBarComponent } from './livekit-control-bar.component';

/**
 * DOM spec for <mj-livekit-control-bar> — a standalone, pure @Input/@Output leaf (no
 * livekit-client, no media). Covers the per-control feature gates, the LocalMedia →
 * button-state classes/icons, the unread/participant badges, and the intent outputs.
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

  it('shows the default control set (mic, cam, screen, device, chat, participants, leave)', () => {
    const f = render();
    // 7 controls on by default; layout/whiteboard/recording are off
    expect(queryAll(f, '.lk-bar__btn').length).toBe(7);
  });

  it('hides a control when its feature gate is false', () => {
    const f = render({ EnableMicrophoneControl: false });
    expect(query(f, 'button[title="Mute microphone"]')).toBeNull();
    expect(queryAll(f, '.lk-bar__btn').length).toBe(6);
  });

  it('renders the mic button in the muted state when the microphone is off', () => {
    const f = render({ LocalMedia: { MicrophoneEnabled: false, CameraEnabled: true, ScreenShareEnabled: false } });
    const mic = query(f, 'button[title="Unmute microphone"]');
    expect(mic).not.toBeNull();
    expect(mic?.classList.contains('lk-bar__btn--off')).toBe(true);
    expect(query(f, 'button[title="Unmute microphone"] .fa-microphone-slash')).not.toBeNull();
  });

  it('renders the mic button in the live state when the microphone is on', () => {
    const f = render();
    const mic = query(f, 'button[title="Mute microphone"]');
    expect(mic?.classList.contains('lk-bar__btn--off')).toBe(false);
    expect(query(f, 'button[title="Mute microphone"] .fa-microphone')).not.toBeNull();
  });

  it('emits ToggleMicrophone when the mic button is clicked', () => {
    const f = render();
    const spy = vi.fn();
    f.componentInstance.ToggleMicrophone.subscribe(spy);
    (query(f, 'button[title="Mute microphone"]') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('shows the unread chat badge only when there are unread messages', () => {
    expect(query(render({ UnreadChatCount: 0 }), '.lk-bar__badge')).toBeNull();
    expect(query(render({ UnreadChatCount: 3 }), '.lk-bar__badge')?.textContent?.trim()).toBe('3');
  });

  it('shows the recording control only when enabled, with the recording state class active', () => {
    expect(query(render(), 'button[title="Start recording"]')).toBeNull(); // off by default
    const f = render({ EnableRecordingControl: true, IsRecording: true });
    const btn = query(f, 'button[title="Stop recording"]');
    expect(btn).not.toBeNull();
    expect(btn?.classList.contains('lk-bar__btn--recording')).toBe(true);
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
    expect(query(f, 'button[title="Chat"]')?.classList.contains('lk-bar__btn--active')).toBe(true);
    expect(query(f, 'button[title="Participants"]')?.classList.contains('lk-bar__btn--active')).toBe(true);
  });
});
