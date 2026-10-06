import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoFrameWatch } from '../lib/video-frame-watch';

/** A `<video>` element the test drives: it composites frames and fires `timeupdate` when told to. */
class FakeVideo {
  public currentTime = 0;
  public readonly Cancelled: number[] = [];
  private readonly frameCallbacks = new Map<number, () => void>();
  private readonly listeners = new Set<() => void>();
  private nextHandle = 0;
  public requestVideoFrameCallback?: (callback: () => void) => number = (callback) => {
    const handle = ++this.nextHandle;
    this.frameCallbacks.set(handle, callback);
    return handle;
  };
  public cancelVideoFrameCallback?: (handle: number) => void = (handle) => {
    this.Cancelled.push(handle);
    this.frameCallbacks.delete(handle);
  };
  public addEventListener(_type: 'timeupdate', listener: () => void): void {
    this.listeners.add(listener);
  }
  public removeEventListener(_type: 'timeupdate', listener: () => void): void {
    this.listeners.delete(listener);
  }
  /** The browser composites a frame. */
  public Frame(): void {
    const callbacks = [...this.frameCallbacks.values()];
    this.frameCallbacks.clear();
    callbacks.forEach((callback) => callback());
  }
  /** The playback position is reported. */
  public TimeUpdate(): void {
    [...this.listeners].forEach((listener) => listener());
  }
  public get Listening(): boolean {
    return this.listeners.size > 0;
  }
  public get Pending(): number {
    return this.frameCallbacks.size;
  }
}

describe('VideoFrameWatch', () => {
  let now: number;
  let changes: boolean[];
  let watch: VideoFrameWatch;
  const element = (video: FakeVideo) => video as unknown as HTMLVideoElement;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    changes = [];
    watch = new VideoFrameWatch(1000, (stalled) => changes.push(stalled), () => now);
  });

  afterEach(() => {
    watch.Stop();
    vi.useRealTimers();
  });

  it('is stalled until the first frame, then flowing', () => {
    const video = new FakeVideo();
    watch.Watch(element(video));
    expect(watch.Stalled).toBe(true);
    expect(changes).toEqual([]);
    video.Frame();
    expect(watch.Stalled).toBe(false);
    expect(changes).toEqual([false]);
    video.Frame();
    expect(changes).toEqual([false]);
  });

  it('stalls once no frame has come for the stall time, and recovers on the next frame', () => {
    const video = new FakeVideo();
    watch.Watch(element(video));
    video.Frame();
    now = 900;
    vi.advanceTimersByTime(250);
    expect(watch.Stalled).toBe(false);
    now = 1100;
    vi.advanceTimersByTime(250);
    expect(watch.Stalled).toBe(true);
    video.Frame();
    expect(changes).toEqual([false, true, false]);
  });

  it('counts a moving playback position as a frame when the browser has no frame callbacks', () => {
    const video = new FakeVideo();
    video.requestVideoFrameCallback = undefined;
    video.cancelVideoFrameCallback = undefined;
    watch.Watch(element(video));
    video.TimeUpdate();
    expect(watch.Stalled).toBe(true);
    video.currentTime = 0.25;
    video.TimeUpdate();
    expect(watch.Stalled).toBe(false);
    video.TimeUpdate();
    now = 1500;
    vi.advanceTimersByTime(250);
    expect(changes).toEqual([false, true]);
  });

  it('stops: no frame callback, no listener and no timer is left', () => {
    const video = new FakeVideo();
    watch.Watch(element(video));
    watch.Stop();
    expect(video.Cancelled).toEqual([1]);
    expect(video.Pending).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const fallback = new FakeVideo();
    fallback.requestVideoFrameCallback = undefined;
    watch.Watch(element(fallback));
    watch.Stop();
    expect(fallback.Listening).toBe(false);
    expect(changes).toEqual([]);
  });

  it('watching another element starts it stalled again', () => {
    const first = new FakeVideo();
    watch.Watch(element(first));
    first.Frame();
    const second = new FakeVideo();
    watch.Watch(element(second));
    expect(watch.Stalled).toBe(true);
    expect(first.Pending).toBe(0);
    expect(changes).toEqual([false, true]);
  });
});
