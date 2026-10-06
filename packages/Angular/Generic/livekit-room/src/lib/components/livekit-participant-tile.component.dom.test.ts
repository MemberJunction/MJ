import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { LiveKitParticipantTileComponent } from './livekit-participant-tile.component';

/** A track that only records what it was attached to; no media is involved. */
class FakeTrack {
  public readonly Attached: HTMLMediaElement[] = [];
  public attach(element: HTMLMediaElement): HTMLMediaElement {
    this.Attached.push(element);
    return element;
  }
  public detach(element: HTMLMediaElement): HTMLMediaElement {
    return element;
  }
}

/**
 * DOM spec for the deprecated <mj-livekit-participant-tile> wrapper: it maps the LiveKit view to `mj-media-tile`
 * (whose own spec, in ng-realtime-media, covers the tile) and plays the participant's voice, as the tile did.
 */
describe('LiveKitParticipantTileComponent (DOM, deprecated wrapper)', () => {
  const makeView = (publications: Record<string, { track: FakeTrack; isMuted: boolean }> = {}, over: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView =>
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
      Raw: { audioLevel: 0, getTrackPublication: (source: string) => publications[source] },
      ...over,
    }) as unknown as LiveKitParticipantView;

  const render = (view: LiveKitParticipantView, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(LiveKitParticipantTileComponent, { inputs: { Participant: view, ShowAudioMeter: false, ...inputs } });

  it('renders the generic tile with the mapped name, mute, role and quality', () => {
    const f = render(makeView({}, { Role: 'agent', ConnectionQuality: 'poor' }), { ShowNameBadge: true });
    expect(query(f, 'mj-media-tile .tile__initials')?.textContent?.trim()).toBe('AL');
    expect(query(f, '.tile__name')?.textContent).toContain('Ada Lovelace');
    expect(query(f, '.tile__muted')).not.toBeNull();
    expect(query(f, '.tile__role')?.textContent?.trim()).toBe('AI');
    expect(query(f, '.tile__quality')?.classList.contains('tile__quality--poor')).toBe(true);
    expect(f.componentInstance.Initials).toBe('AL');
  });

  it('attaches the camera track to the tile video', () => {
    const camera = new FakeTrack();
    const f = render(makeView({ camera: { track: camera, isMuted: false } }));
    expect(camera.Attached).toEqual([query(f, '.tile__video')]);
    expect(f.componentInstance.HasVideo).toBe(true);
  });

  it('shows the sharing chip and the shared screen while the participant shares', () => {
    const screen = new FakeTrack();
    const f = render(makeView({ screen_share: { track: screen, isMuted: false } }, { IsScreenSharing: true }));
    expect(query(f, '.tile__chip')).not.toBeNull();
    expect(screen.Attached).toHaveLength(1);
  });

  it('maps the pin inputs and re-emits TogglePin', () => {
    const f = render(makeView(), { ShowPinButton: true, IsPinned: true });
    const pin = query(f, '.tile__pin') as HTMLButtonElement;
    expect(pin.classList.contains('tile__pin--active')).toBe(true);
    const spy = vi.fn();
    f.componentInstance.TogglePin.subscribe(spy);
    pin.click();
    expect(spy).toHaveBeenCalled();
  });

  it("plays the participant's voice, as the tile did", () => {
    const microphone = new FakeTrack();
    const f = render(makeView({ microphone: { track: microphone, isMuted: false } }, { HasAudio: true }));
    expect(query(f, 'mj-livekit-participant-audio')).not.toBeNull();
    expect(microphone.Attached).toHaveLength(1);
  });
});
