import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJMediaPlayerComponent } from './media-player.component';
import { MediaTrack, MediaTranscriptCue } from '../media-player.types';

const audioTrack: MediaTrack = { Id: 't1', Kind: 'audio', Url: 'blob:fake-audio' };

const cues: MediaTranscriptCue[] = [
  { Id: 'a', StartMs: 0, EndMs: 1000, Text: 'first' },
  { Id: 'b', StartMs: 2000, EndMs: 3000, SpeakerLabel: 'Alex', Text: 'second' },
  { Id: 'c', StartMs: 5000, Text: 'third' },
];

/**
 * Installs a fake media element so SeekToMs/Play have a stable target without a real
 * <audio>/<video> decoding pipeline (jsdom has no media engine). Returns the fake so
 * the test can assert on currentTime.
 */
function installFakeMedia(instance: MJMediaPlayerComponent): { currentTime: number; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> } {
  const fake = {
    currentTime: 0,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    duration: 10, // seconds
    playbackRate: 1,
    volume: 1,
    muted: false,
  };
  // The component resolves its media element via the private `resolveMediaElement()`,
  // which prefers the cached `_activeMediaEl`. Seed it directly.
  (instance as unknown as { _activeMediaEl: unknown })._activeMediaEl = fake;
  (instance as unknown as { _durationMs: number })._durationMs = 10000;
  return fake;
}

describe('MJMediaPlayerComponent — SeekToCue play/reposition decision', () => {
  it('repositions the timeline WITHOUT playing when paused', () => {
    const fixture = renderComponentFixture(MJMediaPlayerComponent, {
      inputs: { Tracks: [audioTrack], Transcript: cues },
    });
    const instance = fixture.componentInstance;
    const fake = installFakeMedia(instance);

    // not playing (default)
    expect(instance.IsPlaying).toBe(false);

    instance.SeekToCue(1); // cue b at 2000ms

    expect(fake.currentTime).toBeCloseTo(2.0, 5); // seconds
    expect(instance.CurrentTimeMs).toBe(2000);
    expect(fake.play).not.toHaveBeenCalled(); // stayed paused
  });

  it('keeps playing (calls play) when already playing', () => {
    const fixture = renderComponentFixture(MJMediaPlayerComponent, {
      inputs: { Tracks: [audioTrack], Transcript: cues },
    });
    const instance = fixture.componentInstance;
    const fake = installFakeMedia(instance);

    // simulate "currently playing"
    (instance as unknown as { _isPlaying: boolean })._isPlaying = true;
    expect(instance.IsPlaying).toBe(true);

    instance.SeekToCue(2); // cue c at 5000ms

    expect(fake.currentTime).toBeCloseTo(5.0, 5);
    expect(instance.CurrentTimeMs).toBe(5000);
    expect(fake.play).toHaveBeenCalled(); // continued playing
  });

  it('is a no-op for an out-of-range cue index', () => {
    const fixture = renderComponentFixture(MJMediaPlayerComponent, {
      inputs: { Tracks: [audioTrack], Transcript: cues },
    });
    const instance = fixture.componentInstance;
    const fake = installFakeMedia(instance);

    instance.SeekToCue(99);
    instance.SeekToCue(-1);

    expect(fake.currentTime).toBe(0);
    expect(fake.play).not.toHaveBeenCalled();
  });

  it('honors a canceled BeforeSeek (SeekToCue does not move the timeline)', () => {
    const fixture = renderComponentFixture(MJMediaPlayerComponent, {
      inputs: { Tracks: [audioTrack], Transcript: cues },
      setup: (c) => c.BeforeSeek.subscribe((e) => (e.Cancel = true)),
    });
    const instance = fixture.componentInstance;
    const fake = installFakeMedia(instance);

    instance.SeekToCue(1);

    expect(fake.currentTime).toBe(0); // seek was canceled
    expect(instance.CurrentTimeMs).toBe(0);
  });

  it('updates ActiveCueIndex as time advances (EndMs-absent → next-cue-start)', () => {
    const fixture = renderComponentFixture(MJMediaPlayerComponent, {
      inputs: { Tracks: [audioTrack], Transcript: cues },
    });
    const instance = fixture.componentInstance;
    const fake = installFakeMedia(instance);

    // Drive a time update through the public media handler
    fake.currentTime = 5.5; // within cue c (StartMs 5000, no EndMs → +Infinity)
    instance.OnMediaTimeUpdate(fake as unknown as HTMLMediaElement);
    expect(instance.ActiveCueIndex).toBe(2);

    fake.currentTime = 0.5; // within cue a
    instance.OnMediaTimeUpdate(fake as unknown as HTMLMediaElement);
    expect(instance.ActiveCueIndex).toBe(0);
  });
});
