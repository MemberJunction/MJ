import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import type { MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import { Component, Input } from '@angular/core';
import { MediaTileComponent, MediaTilePlaceholderDirective } from './media-tile.component';

/** A host that gives the tile its own placeholder. */
@Component({
  standalone: true,
  imports: [MediaTileComponent, MediaTilePlaceholderDirective],
  template: `<mj-media-tile [Participant]="Participant" [StallAfterMs]="StallAfterMs"><span class="own-placeholder" mjMediaTilePlaceholder>orb</span></mj-media-tile>`,
})
class PlaceholderHostComponent {
  @Input() public Participant: MediaParticipant | null = null;
  @Input() public StallAfterMs: number | null = null;
}

/** A host that puts its own action in the tile's corner. */
@Component({
  standalone: true,
  imports: [MediaTileComponent],
  template: `<mj-media-tile [Participant]="Participant" [Pinnable]="true"><button class="own-action" mjMediaTileActions>Move</button></mj-media-tile>`,
})
class ActionsHostComponent {
  @Input() public Participant: MediaParticipant | null = null;
}

/** An element source that records what it was attached to and how often it was detached. */
function elementSource(): MediaVideoSource & { Attached: HTMLVideoElement[]; Detaches: number } {
  const source = {
    Kind: 'element' as const,
    Attached: [] as HTMLVideoElement[],
    Detaches: 0,
    Attach: (element: HTMLVideoElement) => {
      source.Attached.push(element);
      return () => {
        source.Detaches++;
      };
    },
  };
  return source;
}

function participant(over: Partial<MediaParticipant> = {}): MediaParticipant {
  return { Identity: 'p1', DisplayName: 'Ada Lovelace', Role: 'participant', IsSpeaking: false, Video: {}, ...over };
}

/**
 * The labels and indicators are moved from ng-livekit-room's tile spec, each keeping its meaning. Video uses
 * element sources that only record calls, so no real media is involved.
 */
describe('MediaTileComponent (DOM)', () => {
  const render = (value: MediaParticipant, inputs: Record<string, unknown> = {}) =>
    renderComponentFixture(MediaTileComponent, { inputs: { Participant: value, ...inputs } });

  afterEach(() => vi.unstubAllGlobals());

  describe('without video', () => {
    it('shows the initials and hides the video element', () => {
      const f = render(participant());
      expect(query(f, '.tile__initials')?.textContent?.trim()).toBe('AL');
      expect(query(f, '.tile__video')?.classList.contains('tile__video--hidden')).toBe(true);
    });

    it("shows the host's own placeholder instead of the initials", () => {
      const f = renderComponentFixture(PlaceholderHostComponent, { inputs: { Participant: participant() } });
      expect(query(f, '.tile__placeholder .own-placeholder')?.textContent).toBe('orb');
      expect(query(f, '.tile__initials')).toBeNull();
    });

    it('shows the picture when an AvatarUrl is given', () => {
      const f = render(participant(), { AvatarUrl: 'https://x.test/a.png' });
      expect(query(f, '.tile__placeholder img')?.getAttribute('src')).toBe('https://x.test/a.png');
      expect(query(f, '.tile__initials')).toBeNull();
    });
  });

  describe('labels and indicators', () => {
    it('renders the name', () => {
      expect(query(render(participant()), '.tile__name')?.textContent).toContain('Ada Lovelace');
    });

    it('shows the muted icon only while muted', () => {
      expect(query(render(participant({ IsMuted: true })), '.tile__muted')).not.toBeNull();
      expect(query(render(participant({ IsMuted: false })), '.tile__muted')).toBeNull();
    });

    it('marks an agent with the AI badge and the agent styling', () => {
      const f = render(participant({ Role: 'agent' }));
      expect(query(f, '.tile__role')?.textContent?.trim()).toBe('AI');
      expect(query(f, '.tile')?.classList.contains('tile--agent')).toBe(true);
    });

    it('shows the sharing chip while the participant shares a screen', () => {
      expect(query(render(participant({ Video: { screen: elementSource() } })), '.tile__chip')).not.toBeNull();
      expect(query(render(participant()), '.tile__chip')).toBeNull();
    });

    it('says "Agent can see" when the host reports that an agent can see the participant', () => {
      const chips = (value: MediaParticipant) => queryAll(render(value), '.tile__chip').map((c) => c.textContent?.trim());
      expect(chips(participant({ AgentCanSee: true }))).toEqual(['Agent can see']);
      expect(chips(participant({ AgentCanSee: true, Video: { screen: elementSource() } }))).toEqual(['Sharing', 'Agent can see']);
      expect(chips(participant({ AgentCanSee: false }))).toEqual([]);
      expect(chips(participant())).toEqual([]);
    });

    it("shows the host's status as a chip after its own labels, with or without video", () => {
      const chips = (value: MediaParticipant, status: string | null) =>
        queryAll(render(value, { Status: status }), '.tile__chip').map((c) => c.textContent?.trim());
      expect(chips(participant({ Role: 'agent', Video: { avatar: elementSource() } }), 'Speaking')).toEqual(['AI-generated video', 'Speaking']);
      expect(chips(participant({ Role: 'agent' }), 'Listening')).toEqual(['Listening']);
      expect(chips(participant({ Role: 'agent' }), null)).toEqual([]);
    });

    it('says the video is AI-generated for as long as it shows an avatar', () => {
      const chips = (value: MediaParticipant) => queryAll(render(value), '.tile__chip').map((c) => c.textContent?.trim());
      expect(chips(participant({ Role: 'agent', Video: { avatar: elementSource() } }))).toEqual(['AI-generated video']);
      expect(chips(participant({ Role: 'agent' }))).toEqual([]);
      expect(chips(participant({ Video: { camera: elementSource(), avatar: elementSource() } }))).toEqual([]);
      expect(chips(participant({ Video: { avatar: elementSource(), screen: elementSource() } }))).toEqual(['Sharing']);
      expect(chips(participant({ Video: { avatar: elementSource(), screen: elementSource() }, PreferredVideo: 'avatar' }))).toEqual([
        'AI-generated video',
        'Sharing',
      ]);
    });

    it('reflects connection quality as a modifier class', () => {
      const f = render(participant({ ConnectionQuality: 'poor' }));
      expect(query(f, '.tile__quality')?.classList.contains('tile__quality--poor')).toBe(true);
    });

    it('shows the active-speaker ring only when speaking', () => {
      expect(query(render(participant({ IsSpeaking: true })), '.tile')?.classList.contains('tile--speaking')).toBe(true);
      expect(query(render(participant()), '.tile')?.classList.contains('tile--speaking')).toBe(false);
    });

    it('shows the pin button when pinnable, reflects the pin, and emits TogglePin', () => {
      const f = render(participant(), { Pinnable: true, IsPinned: true });
      const pin = query(f, '.tile__pin') as HTMLButtonElement;
      expect(pin.classList.contains('tile__pin--active')).toBe(true);
      expect(pin.getAttribute('aria-pressed')).toBe('true');
      const spy = vi.fn();
      f.componentInstance.TogglePin.subscribe(spy);
      pin.click();
      expect(spy).toHaveBeenCalled();
      expect(query(render(participant()), '.tile__pin')).toBeNull();
    });

    it("puts a host's actions in the top corner, before the pin", () => {
      const f = renderComponentFixture(ActionsHostComponent, { inputs: { Participant: participant() } });
      const corner = Array.from(query(f, '.tile__actions')?.querySelectorAll('.own-action, .tile__pin') ?? []);
      expect(corner.map((el) => el.className.split(' ')[0])).toEqual(['own-action', 'tile__pin']);
      expect(query(f, '.tile__actions-slot .own-action')).not.toBeNull();
    });

    it('meters a participant that offers a level and is not muted', () => {
      vi.stubGlobal('requestAnimationFrame', () => 1);
      vi.stubGlobal('cancelAnimationFrame', () => undefined);
      expect(query(render(participant({ GetAudioLevel: () => 0.5 })), 'mj-audio-meter')).not.toBeNull();
      expect(query(render(participant({ GetAudioLevel: () => 0.5, IsMuted: true })), 'mj-audio-meter')).toBeNull();
      expect(query(render(participant()), 'mj-audio-meter')).toBeNull();
    });
  });

  describe('video', () => {
    it('attaches the video to the element once and shows it', () => {
      const camera = elementSource();
      const f = render(participant({ Video: { camera } }));
      expect(camera.Attached).toEqual([query(f, '.tile__video')]);
      expect(f.componentInstance.HasVideo).toBe(true);
      f.detectChanges();
      expect(query(f, '.tile__video')?.classList.contains('tile__video--hidden')).toBe(false);
      expect(query(f, '.tile__placeholder')).toBeNull();
    });

    it('prefers the preferred video, then a shared screen over the camera', () => {
      const camera = elementSource();
      const screen = elementSource();
      render(participant({ Video: { camera, screen } }));
      expect(screen.Attached).toHaveLength(1);
      expect(camera.Attached).toHaveLength(0);

      const camera2 = elementSource();
      const screen2 = elementSource();
      render(participant({ Video: { camera: camera2, screen: screen2 }, PreferredVideo: 'camera' }));
      expect(camera2.Attached).toHaveLength(1);
      expect(screen2.Attached).toHaveLength(0);
    });

    it('mirrors the camera only when asked, and never a shared screen', () => {
      const mirrored = (f: ReturnType<typeof render>) => query(f, '.tile__video')?.classList.contains('tile__video--mirrored');
      const camera = elementSource();
      const f = render(participant({ Video: { camera } }), { Mirror: true });
      expect(mirrored(f)).toBe(true);
      f.componentRef.setInput('Participant', participant({ Video: { camera, screen: elementSource() } }));
      f.detectChanges();
      expect(mirrored(f)).toBe(false);
      f.componentRef.setInput('Participant', participant({ Video: { camera } }));
      f.componentRef.setInput('Mirror', false);
      f.detectChanges();
      expect(mirrored(f)).toBe(false);
    });

    it('keeps the attached video when a new participant object carries the same source', () => {
      const camera = elementSource();
      const f = render(participant({ Video: { camera } }));
      f.componentRef.setInput('Participant', participant({ Video: { camera }, IsSpeaking: true }));
      f.detectChanges();
      expect(camera.Attached).toHaveLength(1);
      expect(camera.Detaches).toBe(0);
    });

    it('swaps to a different source, and back to the placeholder when there is none', () => {
      const first = elementSource();
      const second = elementSource();
      const f = render(participant({ Video: { camera: first } }));
      f.componentRef.setInput('Participant', participant({ Video: { camera: second } }));
      f.detectChanges();
      expect(first.Detaches).toBe(1);
      expect(second.Attached).toHaveLength(1);

      f.componentRef.setInput('Participant', participant());
      f.detectChanges();
      expect(second.Detaches).toBe(1);
      expect(f.componentInstance.HasVideo).toBe(false);
    });

    it('detaches when destroyed', () => {
      const camera = elementSource();
      const f = render(participant({ Video: { camera } }));
      f.destroy();
      expect(camera.Detaches).toBe(1);
    });

    describe('AvatarVideoFit', () => {
      const whole = (f: ReturnType<typeof render>) => query(f, '.tile__video')?.classList.contains('tile__video--whole');

      it("shows an avatar whole by default, and when the host asks for 'contain'", () => {
        const f = render(participant({ Role: 'agent', Video: { avatar: elementSource() } }));
        expect(whole(f)).toBe(true);
        expect(f.componentInstance.ShowsWholeVideo).toBe(true);
        expect(whole(render(participant({ Role: 'agent', Video: { avatar: elementSource() } }), { AvatarVideoFit: 'contain' }))).toBe(true);
      });

      it("fits the whole video in the tile's styles, and fills it otherwise", () => {
        const fit = (f: ReturnType<typeof render>) => getComputedStyle(query(f, '.tile__video') as HTMLElement).objectFit;
        expect(fit(render(participant({ Role: 'agent', Video: { avatar: elementSource() } })))).toBe('contain');
        expect(fit(render(participant({ Role: 'agent', Video: { avatar: elementSource() } }), { AvatarVideoFit: 'cover' }))).toBe('cover');
        expect(fit(render(participant({ Video: { camera: elementSource() } })))).toBe('cover');
      });

      it("fills the tile with an avatar when the host asks for 'cover'", () => {
        const f = render(participant({ Role: 'agent', Video: { avatar: elementSource() } }), { AvatarVideoFit: 'cover' });
        expect(whole(f)).toBe(false);
        expect(f.componentInstance.ShowsWholeVideo).toBe(false);
      });

      it('fills the tile with any other video, whatever the fit', () => {
        expect(whole(render(participant({ Video: { camera: elementSource() } })))).toBe(false);
        expect(whole(render(participant({ Video: { screen: elementSource() } })))).toBe(false);
        expect(whole(render(participant({ Video: { camera: elementSource() } }), { AvatarVideoFit: 'contain' }))).toBe(false);
        // An avatar the tile does not show (a shared screen is preferred) changes nothing.
        expect(whole(render(participant({ Video: { avatar: elementSource(), screen: elementSource() } })))).toBe(false);
      });

      it('follows the participant as their video changes', () => {
        const f = render(participant({ Role: 'agent' }));
        expect(whole(f)).toBe(false);
        f.componentRef.setInput('Participant', participant({ Role: 'agent', Video: { avatar: elementSource() } }));
        f.detectChanges();
        expect(whole(f)).toBe(true);
        f.componentRef.setInput('Participant', participant({ Role: 'agent' }));
        f.detectChanges();
        expect(whole(f)).toBe(false);
      });
    });
  });
  describe('out of frames (StallAfterMs)', () => {
    /** Frame callbacks the tile's video registered: jsdom has none of its own. */
    let frames: Array<() => void> = [];
    const frame = (): void => {
      const pending = frames;
      frames = [];
      pending.forEach((callback) => callback());
    };

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
      vi.useRealTimers();
    });

    it('shows the picture until the first frame, then the video and its label', () => {
      const f = render(participant({ Role: 'agent', Video: { avatar: elementSource() } }), { StallAfterMs: 1000 });
      expect(query(f, '.tile__placeholder')).not.toBeNull();
      expect(query(f, '.tile__video')?.classList.contains('tile__video--stalled')).toBe(true);
      expect(query(f, '.tile__chip')).toBeNull();
      frame();
      f.detectChanges();
      expect(query(f, '.tile__placeholder')).toBeNull();
      expect(query(f, '.tile__video')?.classList.contains('tile__video--stalled')).toBe(false);
      expect(query(f, '.tile__chip')?.textContent?.trim()).toBe('AI-generated video');
    });

    it('cross-fades to the picture once no frame has come for the stall time, and back on the next frame', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
      const f = render(participant({ Video: { camera: elementSource() } }), { StallAfterMs: 1000 });
      frame();
      f.detectChanges();
      vi.advanceTimersByTime(900);
      f.detectChanges();
      expect(query(f, '.tile__placeholder')).toBeNull();
      vi.advanceTimersByTime(400);
      f.detectChanges();
      expect(query(f, '.tile__placeholder')?.classList.contains('tile__placeholder--over-video')).toBe(true);
      frame();
      f.detectChanges();
      expect(query(f, '.tile__placeholder')).toBeNull();
    });

    it('starts the wait again for a new video', () => {
      const f = render(participant({ Video: { camera: elementSource() } }), { StallAfterMs: 1000 });
      frame();
      f.detectChanges();
      f.componentRef.setInput('Participant', participant({ Video: { camera: elementSource() } }));
      f.detectChanges();
      expect(query(f, '.tile__placeholder')).not.toBeNull();
    });

    it("shows the host's own placeholder instead of the initials, until the first frame and while stalled", () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
      const f = renderComponentFixture(PlaceholderHostComponent, {
        inputs: { Participant: participant({ Video: { avatar: elementSource() } }), StallAfterMs: 1000 },
      });
      expect(query(f, '.tile__placeholder .own-placeholder')).not.toBeNull();
      expect(query(f, '.tile__initials')).toBeNull();
      frame();
      f.detectChanges();
      expect(query(f, '.own-placeholder')).toBeNull();
      vi.advanceTimersByTime(1300);
      f.detectChanges();
      expect(query(f, '.tile__placeholder .own-placeholder')).not.toBeNull();
    });

    it('always shows the video without a stall time, and watches nothing', () => {
      const f = render(participant({ Video: { camera: elementSource() } }));
      expect(query(f, '.tile__placeholder')).toBeNull();
      expect(frames).toEqual([]);
    });
  });
});
