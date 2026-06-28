import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { LiveKitParticipantTileComponent } from './livekit-participant-tile.component';

// Local query helpers (this branch's ng-test-utils exposes only renderComponentFixture).
const query = <T>(f: ComponentFixture<T>, sel: string): HTMLElement | null => f.nativeElement.querySelector(sel);

/**
 * DOM spec for <mj-livekit-participant-tile> — the worked example of the §7 media split.
 *
 * We DOM-test the media-free surface only: the avatar/initials fallback, name + role badge,
 * the muted icon, the screen-share chip, connection-quality, the active-speaker ring, and
 * pin → TogglePin. The fixture's participant has a `Raw` with no track publications, so
 * `syncMedia()` runs but `track.attach()` is never called — there is no live media here.
 *
 * Deliberately NOT covered (live-tested only, never faked — §7): actual `track.attach()` /
 * `detach()` of camera/mic/screen tracks, and the audio meter's requestAnimationFrame loop
 * (kept unmounted via ShowAudioMeter:false / HasAudio:false).
 */
describe('LiveKitParticipantTileComponent (DOM)', () => {
  // Test seam: Raw is the only livekit-client surface the tile touches; a stub whose
  // getTrackPublication returns nothing means hasVideo stays false and no track attaches.
  const makeView = (over: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView =>
    ({
      Identity: 'p1',
      DisplayName: 'Ada Lovelace',
      IsLocal: false,
      Role: 'participant',
      IsSpeaking: false,
      AudioLevel: 0,
      HasAudio: false,
      HasVideo: false,
      IsScreenSharing: false,
      ConnectionQuality: 'good',
      Raw: { getTrackPublication: () => undefined },
      ...over,
    }) as unknown as LiveKitParticipantView;

  const render = (view: LiveKitParticipantView, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(LiveKitParticipantTileComponent, {
      inputs: { Participant: view, ShowAudioMeter: false, ...inputs },
    });

  it('falls back to initials when the participant has no video', () => {
    const f = render(makeView());
    expect(query(f, '.lk-tile__avatar')).not.toBeNull();
    expect(query(f, '.lk-tile__initials')?.textContent?.trim()).toBe('AL');
    expect(query(f, '.lk-tile__video')?.classList.contains('lk-tile__video--hidden')).toBe(true);
  });

  it('shows the avatar image when an AvatarUrl is provided', () => {
    const f = render(makeView(), { AvatarUrl: 'https://x.test/a.png' });
    const img = query(f, '.lk-tile__avatar img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://x.test/a.png');
    expect(query(f, '.lk-tile__initials')).toBeNull();
  });

  it('renders the participant name when the name badge is shown', () => {
    const f = render(makeView(), { ShowNameBadge: true });
    expect(query(f, '.lk-tile__name')?.textContent).toContain('Ada Lovelace');
  });

  it('shows the muted icon when the participant has no audio', () => {
    const f = render(makeView({ HasAudio: false }), { ShowNameBadge: true });
    expect(query(f, '.lk-tile__muted-icon')).not.toBeNull();
  });

  it('hides the muted icon when the participant has audio', () => {
    const f = render(makeView({ HasAudio: true }), { ShowNameBadge: true, ShowAudioMeter: false });
    expect(query(f, '.lk-tile__muted-icon')).toBeNull();
  });

  it('marks an agent participant with the AI role badge and agent tile styling', () => {
    const f = render(makeView({ Role: 'agent' }), { ShowNameBadge: true });
    expect(query(f, '.lk-tile__role')?.textContent?.trim()).toBe('AI');
    expect(query(f, '.lk-tile')?.classList.contains('lk-tile--agent')).toBe(true);
  });

  it('shows the screen-sharing chip when the participant is sharing', () => {
    const f = render(makeView({ IsScreenSharing: true }));
    expect(query(f, '.lk-tile__chip--screen')).not.toBeNull();
  });

  it('reflects connection quality as a modifier class', () => {
    const f = render(makeView({ ConnectionQuality: 'poor' }), { ShowConnectionQuality: true });
    expect(query(f, '.lk-tile__quality')?.classList.contains('lk-tile__quality--poor')).toBe(true);
  });

  it('shows the active-speaker ring only when speaking', () => {
    const speaking = render(makeView({ IsSpeaking: true }), { ShowActiveSpeakerRing: true });
    expect(query(speaking, '.lk-tile')?.classList.contains('lk-tile--speaking')).toBe(true);
  });

  it('shows the pin button when enabled, reflects pinned state, and emits TogglePin on click', () => {
    const f = render(makeView(), { ShowPinButton: true, IsPinned: true });
    const pin = query(f, '.lk-tile__pin');
    expect(pin).not.toBeNull();
    expect(pin?.classList.contains('lk-tile__pin--active')).toBe(true);
    const spy = vi.fn();
    f.componentInstance.TogglePin.subscribe(spy);
    (pin as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('hides the pin button when not enabled', () => {
    const f = render(makeView(), { ShowPinButton: false });
    expect(query(f, '.lk-tile__pin')).toBeNull();
  });
});
