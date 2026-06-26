/**
 * Public type contracts for the MJ media player components.
 *
 * These types are framework-agnostic and carry no MemberJunction-core dependency —
 * they describe the data the generic {@link MJMediaPlayerComponent} renders and the
 * shape of its cancelable / informational events.
 */

/** Whether a track is rendered with an `<audio>` or `<video>` element. */
export type MediaKind = 'audio' | 'video';

/**
 * A single playable media source. A player may receive one or many.
 * For multiple video tracks the player renders a responsive grid; for a single
 * audio track it renders the transport bar (optionally with a waveform).
 */
export interface MediaTrack {
  /** Stable identifier — used for `track`-by in the template and event correlation. */
  Id: string;
  /** Audio vs. video — drives which element the player creates. */
  Kind: MediaKind;
  /** The media URL (http(s) or a blob: object URL). */
  Url: string;
  /** Optional MIME type hint (e.g. `audio/mpeg`, `video/mp4`). */
  MimeType?: string;
  /** Optional human label (e.g. a speaker / camera name) shown in multi-track layouts. */
  Label?: string;
  /** Optional poster image for video tracks shown before playback. */
  PosterUrl?: string;
  /**
   * Optional precomputed waveform peaks — an array of normalized `0..1` amplitude
   * values, one per rendered bar (left → right across the track's duration).
   *
   * This is the **forward path** for server-precomputed peaks + streaming media:
   * when a track supplies `Peaks`, the player renders them directly and performs
   * **no client-side decoding** (no fetch, no `AudioContext`). When `Peaks` is
   * absent (and the waveform is enabled for an audio track), the player extracts
   * real peaks client-side by decoding {@link Url}; on any decode failure it falls
   * back to a plain progress bar.
   *
   * Values are clamped to `[0, 1]` at render time; provide as many entries as you
   * like — the player renders one bar per value.
   */
  Peaks?: number[];
}

/**
 * A single transcript cue (a span of spoken text tied to a time range).
 * `EndMs` is optional — when absent, the active-cue window runs until the next cue's `StartMs`.
 */
export interface MediaTranscriptCue {
  /** Stable identifier for the cue. */
  Id: string;
  /** Cue start time, in milliseconds from the start of the media. */
  StartMs: number;
  /** Optional cue end time, in milliseconds. When omitted, the next cue's start is used. */
  EndMs?: number;
  /** Optional speaker label — color-coded in the transcript panel. */
  SpeakerLabel?: string;
  /** The spoken text for this cue. */
  Text: string;
}

/**
 * Base shape for all cancelable "Before*" events. Handlers may set `Cancel = true`
 * to abort the pending action (mirrors the ng-conversations `beforeAgentTurn` pattern).
 */
export interface MediaPlayerCancelableEvent {
  /** Set to `true` in a handler to prevent the pending action. */
  Cancel: boolean;
}

/** Cancelable seek event. `FromMs`/`ToMs` describe the pending reposition. */
export interface MediaSeekEvent extends MediaPlayerCancelableEvent {
  /** Current playback position, in milliseconds, before the seek. */
  FromMs: number;
  /** Target playback position, in milliseconds, after the seek. */
  ToMs: number;
}

/** Cancelable playback-rate change event. */
export interface MediaRateEvent extends MediaPlayerCancelableEvent {
  /** Current playback rate before the change. */
  FromRate: number;
  /** Target playback rate after the change. */
  ToRate: number;
}

/** Informational event carrying a transcript cue and its index. */
export interface MediaCueEvent {
  /** The cue involved in the event. */
  Cue: MediaTranscriptCue;
  /** The cue's index within the `Transcript` array. */
  Index: number;
}
