import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Observable } from 'rxjs';
import { renderComponentFixture, query, queryAll, text, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { AGENT_VIDEO_RESUME_HOLD_MS, RealtimeAvatarSurfaceComponent } from './realtime-avatar-surface.component';

/**
 * DOM spec for <mj-realtime-avatar-surface>: the Avatar channel's surface. It must show the agent's video in a media tile,
 * named and labelled as AI-generated, hold its last frame while the call resumes, follow a newer video, and let go of the
 * video when destroyed. Real template, real `mj-media-tile`; the video is a player that records where it was attached.
 */
function player(): MediaVideoSource & { Attached: HTMLVideoElement[]; Detaches: number } {
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

function render(video: MediaVideoSource | null = null, state: RealtimeConnectionState = 'listening') {
  const video$ = new BehaviorSubject<MediaVideoSource | null>(video);
  const state$ = new BehaviorSubject<RealtimeConnectionState>(state);
  const resuming$ = new BehaviorSubject<boolean>(false);
  const fixture = renderComponentFixture(RealtimeAvatarSurfaceComponent, {
    inputs: { AgentName: 'Sage Lee', Video$: video$.asObservable(), State$: state$.asObservable(), Resuming$: resuming$.asObservable() },
  });
  /** The call moves to a new connection, as the session reports it: resuming first, then connecting. */
  const resume = (): void => {
    resuming$.next(true);
    state$.next('connecting');
  };
  /** The new connection is in use: the session is live again, though the agent's video has not come back yet. */
  const resumed = (): void => {
    resuming$.next(false);
    state$.next('listening');
  };
  return { fixture, video$, state$, resuming$, resume, resumed };
}

/** Fakes the clock the frame watch and the resume hold run on. */
const fakeClock = (): void => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] });
};

/** The orb in the tile's placeholder, and the turn it shows. */
const orbState = (fixture: ReturnType<typeof render>['fixture']): string | null =>
  query(fixture, '.tile__placeholder mj-realtime-agent-orb .orb')?.getAttribute('data-state') ?? null;

/** Frame callbacks the tile's video registered: jsdom has none of its own. */
let frames: Array<() => void> = [];
const frame = (): void => {
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback());
};

describe('RealtimeAvatarSurfaceComponent (DOM)', () => {
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

  it('shows the orb, and not the initials, until the video arrives', () => {
    const { fixture } = render();
    expect(orbState(fixture)).toBe('listening');
    expect(query(fixture, '.tile__initials')).toBeNull();
    expect(queryAll(fixture, '.tile__chip').map((c) => c.textContent?.trim())).toEqual(['Listening']);
  });

  it("shows the agent's video, named, with the AI badge and the AI-generated label", () => {
    const video = player();
    const { fixture } = render(video);
    frame();
    fixture.detectChanges();
    expect(video.Attached).toEqual([query(fixture, 'video')]);
    expect(text(fixture, '.tile__name')).toContain('Sage Lee');
    expect(text(fixture, '.tile__role')).toBe('AI');
    expect(text(fixture, '.tile__chip')).toBe('AI-generated video');
  });

  it("shows the agent's whole video, the full portrait with bars, wherever the surface is placed", () => {
    const { fixture } = render(player());
    frame();
    fixture.detectChanges();
    expect(query(fixture, '.tile__video')?.classList.contains('tile__video--whole')).toBe(true);
  });

  it("shows the orb until the video's first frame, and again after a second without one", () => {
    fakeClock();
    const { fixture } = render(player());
    expect(orbState(fixture)).toBe('listening');
    frame();
    fixture.detectChanges();
    expect(orbState(fixture)).toBeNull();
    vi.advanceTimersByTime(1300);
    fixture.detectChanges();
    expect(orbState(fixture)).toBe('listening');
  });

  /**
   * A resume on a new connection (Google's `goAway`, a dropped socket) stops the agent's video for a few seconds: on
   * Vertex AI, new video came about 3 s after each move. The last frame holds from the resume's start until new frames
   * come, 5 s pass, or the call fails; the session is live again well before the video comes back.
   */
  describe('while the call resumes', () => {
    const chips = (fixture: ReturnType<typeof render>['fixture']) => queryAll(fixture, '.tile__chip').map((c) => c.textContent?.trim());

    it('keeps its one video, its last frame on show through a 3 s gap with no orb, and plays on at the next frame', () => {
      fakeClock();
      const video = player();
      const { fixture, resume, resumed } = render(video);
      frame();
      fixture.detectChanges();

      resume();
      vi.advanceTimersByTime(500);
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Connecting']);

      resumed();
      vi.advanceTimersByTime(2500);
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();
      expect(chips(fixture)).toEqual(['AI-generated video', 'Listening']);

      frame();
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();
      expect([video.Attached.length, video.Detaches]).toEqual([1, 0]);
    });

    it('shows the orb 5 s into a resume when no frame has come by then, and the video at the next frame', () => {
      fakeClock();
      const { fixture, resume, resumed } = render(player());
      frame();
      fixture.detectChanges();

      resume();
      vi.advanceTimersByTime(500);
      resumed();
      vi.advanceTimersByTime(4400);
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();

      vi.advanceTimersByTime(200);
      fixture.detectChanges();
      expect(orbState(fixture)).toBe('listening');
      expect(chips(fixture)).toEqual(['Listening']);

      vi.advanceTimersByTime(900);
      frame();
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();
    });

    it("shows the orb a second into a stall again once the resume's video has come back", () => {
      fakeClock();
      const { fixture, resume, resumed } = render(player());
      frame();
      fixture.detectChanges();

      resume();
      vi.advanceTimersByTime(500);
      resumed();
      vi.advanceTimersByTime(1500);
      frame();
      fixture.detectChanges();

      vi.advanceTimersByTime(1300);
      fixture.detectChanges();
      expect(orbState(fixture)).toBe('listening');
    });

    it('shows the orb at once when the resume fails', () => {
      fakeClock();
      const { fixture, state$, resume } = render(player());
      frame();
      fixture.detectChanges();

      resume();
      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(orbState(fixture)).toBeNull();

      state$.next('error');
      fixture.detectChanges();
      expect(orbState(fixture)).toBe('listening');
      expect(chips(fixture)).toEqual(['Connection error']);
    });

    it("holds nothing on a 'connecting' the session does not report as a resume", () => {
      fakeClock();
      const { fixture, state$ } = render(player());
      frame();
      fixture.detectChanges();

      state$.next('connecting');
      vi.advanceTimersByTime(1300);
      fixture.detectChanges();
      expect(orbState(fixture)).toBe('listening');
    });
  });

  it("follows the agent's turn on the orb: speaking, thinking, and listening for everything else", () => {
    const { fixture, state$ } = render(null, 'speaking');
    expect(orbState(fixture)).toBe('speaking');
    state$.next('thinking');
    fixture.detectChanges();
    expect(orbState(fixture)).toBe('thinking');
    state$.next('connecting');
    fixture.detectChanges();
    expect(orbState(fixture)).toBe('listening');
  });

  it("says what the agent is doing on the tile's chip, and frames the tile while it speaks", () => {
    const { fixture, state$ } = render(player(), 'speaking');
    frame();
    fixture.detectChanges();
    const chips = () => queryAll(fixture, '.tile__chip').map((c) => c.textContent?.trim());
    expect(chips()).toEqual(['AI-generated video', 'Speaking']);
    expect(query(fixture, '.avatar')?.classList.contains('avatar--speaking')).toBe(true);
    state$.next('thinking');
    fixture.detectChanges();
    expect(chips()).toEqual(['AI-generated video', 'Thinking']);
    expect(query(fixture, '.avatar')?.classList.contains('avatar--speaking')).toBe(false);
    state$.next('closed');
    fixture.detectChanges();
    expect(chips()).toEqual(['AI-generated video']);
  });

  it("lets go of the call's state and its resumes when it is destroyed, and stops a resume's hold", () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    const { fixture, state$, resuming$, resume } = render(player());
    resume();
    const index = timers.mock.calls.findIndex((call) => call[1] === AGENT_VIDEO_RESUME_HOLD_MS);
    expect(index).toBeGreaterThanOrEqual(0);
    fixture.destroy();
    expect([state$.observed, resuming$.observed]).toEqual([false, false]);
    expect(cleared).toHaveBeenCalledWith(timers.mock.results[index].value);
  });

  it('follows a newer video, and lets go of the one it showed', () => {
    const first = player();
    const second = player();
    const { fixture, video$ } = render(first);
    video$.next(second);
    fixture.detectChanges();
    expect(first.Detaches).toBe(1);
    expect(second.Attached).toHaveLength(1);
  });

  it('follows a new stream of video in place of the old one', () => {
    const { fixture, video$ } = render();
    const replacement = new BehaviorSubject<MediaVideoSource | null>(null);
    fixture.componentInstance.Video$ = replacement.asObservable();
    const ignored = player();
    video$.next(ignored);
    fixture.detectChanges();
    expect(ignored.Attached).toEqual([]);
    const shown = player();
    replacement.next(shown);
    fixture.detectChanges();
    expect(shown.Attached).toHaveLength(1);
  });

  it('keeps one subscription when given the same video stream again', () => {
    let subscriptions = 0;
    const video$ = new Observable<MediaVideoSource | null>((subscriber) => {
      subscriptions++;
      subscriber.next(null);
    });
    const fixture = renderComponentFixture(RealtimeAvatarSurfaceComponent, { inputs: { Video$: video$ } });
    fixture.componentInstance.Video$ = video$;
    expect(subscriptions).toBe(1);
  });

  it("renames the tile when the agent's name changes after the video arrived", () => {
    const { fixture } = render(player());
    frame();
    fixture.componentRef.setInput('AgentName', 'Ada');
    fixture.detectChanges();
    expect(text(fixture, '.tile__name')).toContain('Ada');
    expect(text(fixture, '.tile__chip')).toBe('AI-generated video');
  });

  it('lets go of the video when it is destroyed', () => {
    const video = player();
    const { fixture, video$ } = render(video);
    fixture.destroy();
    expect(video.Detaches).toBe(1);
    expect(video$.observed).toBe(false);
  });

  it('has no accessibility violations while it shows the video', async () => {
    const { fixture } = render(player());
    await ExpectNoAxeViolations(fixture);
  });
});
