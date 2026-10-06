import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BehaviorSubject, Observable } from 'rxjs';
import { renderComponentFixture, query, text, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeConnectionState } from '@memberjunction/realtime-runtime';
import { RealtimeAvatarSurfaceComponent } from './realtime-avatar-surface.component';

/**
 * DOM spec for <mj-realtime-avatar-surface>: the Avatar channel's surface. It must show the agent's video in a media tile,
 * named and labelled as AI-generated, follow a newer video, and let go of the video when destroyed. Real template, real
 * `mj-media-tile`; the video is a player that records where it was attached.
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
  const fixture = renderComponentFixture(RealtimeAvatarSurfaceComponent, {
    inputs: { AgentName: 'Sage Lee', Video$: video$.asObservable(), State$: state$.asObservable() },
  });
  return { fixture, video$, state$ };
}

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
    expect(query(fixture, '.tile__chip')).toBeNull();
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

  it("shows the orb until the video's first frame, and again after a second without one", () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const { fixture } = render(player());
    expect(orbState(fixture)).toBe('listening');
    frame();
    fixture.detectChanges();
    expect(orbState(fixture)).toBeNull();
    vi.advanceTimersByTime(1300);
    fixture.detectChanges();
    expect(orbState(fixture)).toBe('listening');
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

  it("lets go of the call's state when it is destroyed", () => {
    const { fixture, state$ } = render();
    fixture.destroy();
    expect(state$.observed).toBe(false);
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
