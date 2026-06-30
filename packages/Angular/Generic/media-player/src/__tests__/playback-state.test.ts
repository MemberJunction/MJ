import { describe, it, expect } from 'vitest';
import { MediaStateContext, MediaStateEvent, nextPlaybackState } from '../lib/media-player/playback-state';
import { MediaPlaybackState } from '../lib/media-player.types';

/** Convenience context builder (HAVE_ENOUGH_DATA readyState by default). */
function ctx(overrides: Partial<MediaStateContext> = {}): MediaStateContext {
  return { IsPlaying: false, ReadyState: 4, Ended: false, ...overrides };
}

function run(event: MediaStateEvent, current: MediaPlaybackState, c: MediaStateContext = ctx()): MediaPlaybackState {
  return nextPlaybackState(event, current, c);
}

describe('nextPlaybackState', () => {
  describe('initial load', () => {
    it('loadstart → loading (from idle)', () => {
      expect(run('loadstart', 'idle')).toBe('loading');
    });

    it('loadedmetadata stays loading until canplay', () => {
      expect(run('loadedmetadata', 'loading')).toBe('loading');
      expect(run('loadedmetadata', 'idle')).toBe('loading');
    });

    it('loadedmetadata does not regress an already-advanced state', () => {
      expect(run('loadedmetadata', 'playing')).toBe('playing');
      expect(run('loadedmetadata', 'ready')).toBe('ready');
    });
  });

  describe('canplay / canplaythrough clear loading & buffering', () => {
    it('canplay → ready when not playing', () => {
      expect(run('canplay', 'loading', ctx({ IsPlaying: false }))).toBe('ready');
      expect(run('canplay', 'buffering', ctx({ IsPlaying: false }))).toBe('ready');
    });

    it('canplay → playing when currently playing', () => {
      expect(run('canplay', 'buffering', ctx({ IsPlaying: true }))).toBe('playing');
    });

    it('canplaythrough behaves like canplay', () => {
      expect(run('canplaythrough', 'loading', ctx({ IsPlaying: true }))).toBe('playing');
    });
  });

  describe('buffering triggers', () => {
    it('waiting → buffering (ran out of data mid-playback)', () => {
      expect(run('waiting', 'playing', ctx({ IsPlaying: true }))).toBe('buffering');
    });

    it('seeking → buffering (skip / scrub into un-buffered territory)', () => {
      expect(run('seeking', 'playing', ctx({ IsPlaying: true }))).toBe('buffering');
      expect(run('seeking', 'paused', ctx({ IsPlaying: false }))).toBe('buffering');
    });
  });

  describe('seeked clears buffering only when data is available', () => {
    it('seeked with enough data → ready/playing', () => {
      expect(run('seeked', 'buffering', ctx({ ReadyState: 4, IsPlaying: false }))).toBe('ready');
      expect(run('seeked', 'buffering', ctx({ ReadyState: 4, IsPlaying: true }))).toBe('playing');
    });

    it('seeked without enough data stays buffering (waits for canplay)', () => {
      expect(run('seeked', 'buffering', ctx({ ReadyState: 1, IsPlaying: true }))).toBe('buffering');
    });
  });

  describe('playing clears loading + buffering', () => {
    it('playing → playing from buffering', () => {
      expect(run('playing', 'buffering')).toBe('playing');
    });

    it('playing → playing from loading', () => {
      expect(run('playing', 'loading')).toBe('playing');
    });
  });

  describe('pause / ended', () => {
    it('pause → paused', () => {
      expect(run('pause', 'playing')).toBe('paused');
    });

    it('pause does not override an ended element', () => {
      expect(run('pause', 'playing', ctx({ Ended: true }))).toBe('ended');
    });

    it('ended → ended', () => {
      expect(run('ended', 'playing')).toBe('ended');
    });
  });

  describe('conservative stalled / suspend', () => {
    it('suspend is benign when not playing (no buffering flash)', () => {
      expect(run('suspend', 'ready', ctx({ IsPlaying: false }))).toBe('ready');
      expect(run('suspend', 'loading', ctx({ IsPlaying: false }))).toBe('loading');
    });

    it('stalled → buffering only when actively playing', () => {
      expect(run('stalled', 'playing', ctx({ IsPlaying: true }))).toBe('buffering');
      expect(run('stalled', 'paused', ctx({ IsPlaying: false }))).toBe('paused');
    });

    it('stalled/suspend never buffer an ended element', () => {
      expect(run('stalled', 'ended', ctx({ IsPlaying: true, Ended: true }))).toBe('ended');
    });
  });

  describe('error wins', () => {
    it('error → error from any state', () => {
      expect(run('error', 'playing')).toBe('error');
      expect(run('error', 'loading')).toBe('error');
    });

    it('error is sticky — stray events do not escape it', () => {
      expect(run('suspend', 'error')).toBe('error');
      expect(run('waiting', 'error')).toBe('error');
      expect(run('pause', 'error')).toBe('error');
    });

    it('a new source (emptied / loadstart) recovers from error', () => {
      expect(run('emptied', 'error')).toBe('loading');
      expect(run('loadstart', 'error')).toBe('loading');
    });
  });

  describe('track switch', () => {
    it('emptied → loading (reset lifecycle)', () => {
      expect(run('emptied', 'playing')).toBe('loading');
    });
  });
});
