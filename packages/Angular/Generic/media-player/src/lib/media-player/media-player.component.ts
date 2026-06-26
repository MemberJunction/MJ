import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MediaCueEvent,
  MediaPlayerCancelableEvent,
  MediaRateEvent,
  MediaSeekEvent,
  MediaTrack,
  MediaTranscriptCue,
} from '../media-player.types';
import { computeActiveCueIndex } from './cue-utils';
import { DEFAULT_WAVEFORM_BARS, downsamplePeaks } from './waveform-utils';

/**
 * `mj-media-player` — a generic, framework-agnostic media player.
 *
 * Renders one or many audio/video tracks with a custom transport bar (play/pause,
 * click-and-drag scrubber, skip ±N, playback-rate menu, volume + mute, fullscreen),
 * a **real** audio waveform (decoded client-side, or supplied precomputed via
 * `MediaTrack.Peaks`) that doubles as the scrubber, and an optional time-synced
 * transcript panel whose cues are clickable and auto-highlight as playback advances.
 *
 * This component has ZERO MemberJunction-core dependencies — it is pure Angular and
 * is safe to reuse in any application. The MJStorage binding lives in the separate
 * `mj-storage-media-player` wrapper.
 */
@Component({
  selector: 'mj-media-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJMediaPlayerComponent implements OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private host = inject(ElementRef<HTMLElement>);

  constructor() {
    this._prefersReducedMotion = this.detectReducedMotion();
  }

  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------

  /** The track(s) to play. One audio track → transport bar; many videos → grid. */
  @Input()
  set Tracks(value: MediaTrack[]) {
    this._tracks = value ?? [];
    this._activeMediaEl = null;
    this.resetPlaybackState();
    this.ensureWaveforms();
    this.cdr.markForCheck();
  }
  get Tracks(): MediaTrack[] {
    return this._tracks;
  }
  private _tracks: MediaTrack[] = [];

  /** Optional transcript cues. When set (and `ShowTranscript`), a transcript panel renders. */
  @Input()
  set Transcript(value: MediaTranscriptCue[] | null) {
    this._transcript = value;
    this._activeCueIndex = -1;
    this.cdr.markForCheck();
  }
  get Transcript(): MediaTranscriptCue[] | null {
    return this._transcript;
  }
  private _transcript: MediaTranscriptCue[] | null = null;

  /** Begin playback automatically once media is ready. */
  @Input() Autoplay = false;
  /** Start playback at this position (ms) once metadata loads. */
  @Input() StartAtMs: number | null = null;
  /** Whether the transcript panel is shown (when a transcript is provided). */
  @Input() ShowTranscript = true;
  /** Whether the playback-rate menu is shown. */
  @Input() ShowSpeedControl = true;
  /** Whether the ±skip buttons are shown. */
  @Input() ShowSkipControls = true;
  /** Whether the volume slider + mute are shown. */
  @Input() ShowVolume = true;
  /**
   * Whether the real audio waveform (which doubles as the scrubber) is shown for
   * audio-only tracks. On by default. When a track supplies {@link MediaTrack.Peaks}
   * those are rendered directly; otherwise the player decodes the track URL client-side
   * to extract real peaks, falling back to a plain progress bar if decoding fails.
   */
  @Input() ShowWaveform = true;
  /** Number of bars the waveform renders / downsamples to. */
  @Input() WaveformBarCount = DEFAULT_WAVEFORM_BARS;
  /** Whether the fullscreen button is shown for video. */
  @Input() ShowFullscreen = true;
  /** Number of seconds the skip buttons jump. */
  @Input() SkipSeconds = 30;
  /** The playback rates offered in the rate menu. */
  @Input() PlaybackRates: number[] = [0.5, 1, 1.25, 1.5, 2];
  /** The initial playback rate. */
  @Input() InitialRate = 1;
  /** The initial volume (0..1). */
  @Input() InitialVolume = 1;
  /** Where the transcript panel sits relative to the media. */
  @Input() TranscriptPosition: 'side' | 'bottom' = 'side';

  // ---------------------------------------------------------------------------
  // Outputs — Before* are cancelable (set event.Cancel = true to abort)
  // ---------------------------------------------------------------------------

  @Output() BeforePlay = new EventEmitter<MediaPlayerCancelableEvent>();
  @Output() AfterPlay = new EventEmitter<void>();
  @Output() BeforePause = new EventEmitter<MediaPlayerCancelableEvent>();
  @Output() AfterPause = new EventEmitter<void>();
  @Output() BeforeSeek = new EventEmitter<MediaSeekEvent>();
  @Output() AfterSeek = new EventEmitter<number>();
  @Output() BeforeRateChange = new EventEmitter<MediaRateEvent>();
  @Output() AfterRateChange = new EventEmitter<number>();
  @Output() CueActivated = new EventEmitter<MediaCueEvent>();
  @Output() CueClicked = new EventEmitter<MediaCueEvent>();
  @Output() TimeUpdate = new EventEmitter<number>();
  @Output() DurationChange = new EventEmitter<number>();
  @Output() Ended = new EventEmitter<void>();

  // ---------------------------------------------------------------------------
  // View references
  // ---------------------------------------------------------------------------

  /** The primary media element (the single audio/video, or the first video in a grid). */
  @ViewChild('primaryMedia') primaryMedia?: ElementRef<HTMLMediaElement>;

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private _currentTimeMs = 0;
  private _durationMs = 0;
  private _isPlaying = false;
  private _playbackRate = 1;
  private _volume = 1;
  private _muted = false;
  private _activeCueIndex = -1;
  private _isFullscreen = false;
  private _isScrubbing = false;
  private _hasError = false;
  private _rateMenuOpen = false;
  private _activeMediaEl: HTMLMediaElement | null = null;
  private _rateInitialized = false;

  /** Per-track computed/supplied waveform peaks (0..1), keyed by track Id. */
  private _peaksByTrackId = new Map<string, number[]>();
  /** Track Ids whose client-side decode failed (→ fall back to a plain progress bar). */
  private _waveformFailedTrackIds = new Set<string>();
  /** Track Ids currently being decoded (avoid duplicate in-flight decodes). */
  private _waveformPendingTrackIds = new Set<string>();
  /** Lazily-created AudioContext used only for client-side peak extraction. */
  private _audioCtx: AudioContext | null = null;
  /** Whether the user prefers reduced motion (suppresses the bar draw-in animation). */
  private _prefersReducedMotion = false;

  // ---------------------------------------------------------------------------
  // Public getters (imperative read API + template bindings)
  // ---------------------------------------------------------------------------

  get CurrentTimeMs(): number {
    return this._currentTimeMs;
  }
  get DurationMs(): number {
    return this._durationMs;
  }
  get IsPlaying(): boolean {
    return this._isPlaying;
  }
  get PlaybackRate(): number {
    return this._playbackRate;
  }
  get ActiveCueIndex(): number {
    return this._activeCueIndex;
  }

  // Template-only convenience getters
  get Muted(): boolean {
    return this._muted;
  }
  get Volume(): number {
    return this._volume;
  }
  get IsFullscreen(): boolean {
    return this._isFullscreen;
  }
  get RateMenuOpen(): boolean {
    return this._rateMenuOpen;
  }
  get HasError(): boolean {
    return this._hasError;
  }
  get HasTracks(): boolean {
    return this._tracks.length > 0;
  }
  get ShowTranscriptPanel(): boolean {
    return this.ShowTranscript && !!this._transcript && this._transcript.length > 0;
  }
  get ScrubFraction(): number {
    return this._durationMs > 0 ? this._currentTimeMs / this._durationMs : 0;
  }
  get ScrubPercent(): number {
    return Math.min(100, Math.max(0, this.ScrubFraction * 100));
  }
  get PrefersReducedMotion(): boolean {
    return this._prefersReducedMotion;
  }

  /** The active audio track that drives the waveform (the first audio track, if any). */
  private get WaveformTrack(): MediaTrack | null {
    return this.IsAudioOnly ? this.AudioTracks[0] ?? null : null;
  }

  /**
   * True when the waveform should render as bars — i.e. it's enabled, the active track
   * is audio, and we have peaks (supplied or successfully decoded) for it. When false
   * (decode pending/failed, no track), the template shows a plain progress bar instead.
   */
  get ShowWaveformBars(): boolean {
    const track = this.WaveformTrack;
    if (!this.ShowWaveform || !track) {
      return false;
    }
    return this.peaksForTrack(track) !== null;
  }

  /**
   * The normalized `0..1` peaks for the active audio track, or `null` when none are
   * available yet (still decoding) or decoding failed. Reading this lazily kicks off
   * client-side extraction when needed — re-renders/seeks never re-decode (cached by Id).
   */
  get WaveformPeaks(): number[] | null {
    const track = this.WaveformTrack;
    if (!this.ShowWaveform || !track) {
      return null;
    }
    return this.peaksForTrack(track);
  }

  /** The played/unplayed split point for the waveform, as a `0..1` fraction. */
  get WaveformPlayedFraction(): number {
    return this.ScrubFraction;
  }

  /** The single audio track when this is an audio-only player (drives waveform). */
  get AudioTracks(): MediaTrack[] {
    return this._tracks.filter((t) => t.Kind === 'audio');
  }
  get VideoTracks(): MediaTrack[] {
    return this._tracks.filter((t) => t.Kind === 'video');
  }
  /** True when the layout is a single audio track with no video. */
  get IsAudioOnly(): boolean {
    return this.VideoTracks.length === 0 && this.AudioTracks.length > 0;
  }
  get IsMultiVideo(): boolean {
    return this.VideoTracks.length > 1;
  }

  // ---------------------------------------------------------------------------
  // Imperative control API
  // ---------------------------------------------------------------------------

  /** Begin playback. Honors {@link BeforePlay}. */
  Play(): void {
    const el = this.resolveMediaElement();
    if (!el) {
      return;
    }
    const evt: MediaPlayerCancelableEvent = { Cancel: false };
    this.BeforePlay.emit(evt);
    if (evt.Cancel) {
      return;
    }
    void el.play().catch(() => {
      /* autoplay/user-gesture rejections are non-fatal */
    });
  }

  /** Pause playback. Honors {@link BeforePause}. */
  Pause(): void {
    const el = this.resolveMediaElement();
    if (!el) {
      return;
    }
    const evt: MediaPlayerCancelableEvent = { Cancel: false };
    this.BeforePause.emit(evt);
    if (evt.Cancel) {
      return;
    }
    el.pause();
  }

  /** Toggle play/pause. */
  TogglePlay(): void {
    if (this._isPlaying) {
      this.Pause();
    } else {
      this.Play();
    }
  }

  /** Seek to an absolute position in milliseconds. Honors {@link BeforeSeek}. */
  SeekToMs(ms: number): void {
    const el = this.resolveMediaElement();
    if (!el) {
      return;
    }
    const target = this.clampMs(ms);
    const evt: MediaSeekEvent = { Cancel: false, FromMs: this._currentTimeMs, ToMs: target };
    this.BeforeSeek.emit(evt);
    if (evt.Cancel) {
      return;
    }
    el.currentTime = target / 1000;
    this._currentTimeMs = target;
    this.AfterSeek.emit(target);
    this.refreshActiveCue();
    this.cdr.markForCheck();
  }

  /** Skip forward by {@link SkipSeconds}. */
  SkipForward(): void {
    this.SeekToMs(this._currentTimeMs + this.SkipSeconds * 1000);
  }

  /** Skip backward by {@link SkipSeconds}. */
  SkipBackward(): void {
    this.SeekToMs(this._currentTimeMs - this.SkipSeconds * 1000);
  }

  /** Set the playback rate. Honors {@link BeforeRateChange}. */
  SetPlaybackRate(rate: number): void {
    const evt: MediaRateEvent = { Cancel: false, FromRate: this._playbackRate, ToRate: rate };
    this.BeforeRateChange.emit(evt);
    if (evt.Cancel) {
      return;
    }
    this._playbackRate = rate;
    this.applyToAllMedia((el) => (el.playbackRate = rate));
    this._rateMenuOpen = false;
    this.AfterRateChange.emit(rate);
    this.cdr.markForCheck();
  }

  /**
   * Seek to the cue at `index`. If currently playing, playback continues from the
   * cue's start; if paused, the timeline is repositioned without starting playback.
   */
  SeekToCue(index: number): void {
    const cues = this._transcript;
    if (!cues || index < 0 || index >= cues.length) {
      return;
    }
    const wasPlaying = this._isPlaying;
    this.SeekToMs(cues[index].StartMs);
    if (wasPlaying) {
      // keep playing — currentTime change above does not pause; ensure we're playing
      this.Play();
    }
    // when paused, we leave it paused (timeline repositioned only)
  }

  /** Set the volume (0..1). Unmutes if volume > 0. */
  SetVolume(v: number): void {
    this._volume = Math.min(1, Math.max(0, v));
    this._muted = this._volume === 0;
    this.applyToAllMedia((el) => {
      el.volume = this._volume;
      el.muted = this._muted;
    });
    this.cdr.markForCheck();
  }

  /** Toggle mute. */
  ToggleMute(): void {
    this._muted = !this._muted;
    this.applyToAllMedia((el) => (el.muted = this._muted));
    this.cdr.markForCheck();
  }

  /** Request fullscreen for the player surface (video). */
  EnterFullscreen(): void {
    const target = this.host.nativeElement.querySelector('.mj-media-stage') as HTMLElement | null;
    if (target?.requestFullscreen) {
      void target.requestFullscreen().catch(() => undefined);
    }
  }

  /** Exit fullscreen. */
  ExitFullscreen(): void {
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  /** Toggle fullscreen. */
  ToggleFullscreen(): void {
    if (this._isFullscreen) {
      this.ExitFullscreen();
    } else {
      this.EnterFullscreen();
    }
  }

  // ---------------------------------------------------------------------------
  // Media element event handlers (bound in template)
  // ---------------------------------------------------------------------------

  /** Wire-up when a media element fires its first event — caches the primary element & applies initial state. */
  OnMediaLoadedMetadata(el: HTMLMediaElement): void {
    this._hasError = false;
    if (!this._activeMediaEl) {
      this._activeMediaEl = el;
    }
    this.initializeMediaElement(el);
    const dur = el.duration;
    if (isFinite(dur)) {
      this._durationMs = Math.round(dur * 1000);
      this.DurationChange.emit(this._durationMs);
    }
    if (this.StartAtMs != null && el === this._activeMediaEl) {
      el.currentTime = this.clampMs(this.StartAtMs) / 1000;
    }
    if (this.Autoplay && el === this._activeMediaEl) {
      this.Play();
    }
    this.cdr.markForCheck();
  }

  OnMediaTimeUpdate(el: HTMLMediaElement): void {
    if (el !== this.resolveMediaElement()) {
      return;
    }
    this._currentTimeMs = Math.round(el.currentTime * 1000);
    this.TimeUpdate.emit(this._currentTimeMs);
    this.refreshActiveCue();
    this.cdr.markForCheck();
  }

  OnMediaDurationChange(el: HTMLMediaElement): void {
    if (el !== this.resolveMediaElement()) {
      return;
    }
    if (isFinite(el.duration)) {
      this._durationMs = Math.round(el.duration * 1000);
      this.DurationChange.emit(this._durationMs);
      this.cdr.markForCheck();
    }
  }

  OnMediaPlay(el: HTMLMediaElement): void {
    if (el !== this.resolveMediaElement()) {
      return;
    }
    this._isPlaying = true;
    this.AfterPlay.emit();
    this.cdr.markForCheck();
  }

  OnMediaPause(el: HTMLMediaElement): void {
    if (el !== this.resolveMediaElement()) {
      return;
    }
    this._isPlaying = false;
    this.AfterPause.emit();
    this.cdr.markForCheck();
  }

  OnMediaEnded(el: HTMLMediaElement): void {
    if (el !== this.resolveMediaElement()) {
      return;
    }
    this._isPlaying = false;
    this.Ended.emit();
    this.cdr.markForCheck();
  }

  OnMediaError(): void {
    this._hasError = true;
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Scrubber (click + drag) — pointer-based
  // ---------------------------------------------------------------------------

  OnScrubPointerDown(event: PointerEvent, trackEl: HTMLElement): void {
    event.preventDefault();
    this._isScrubbing = true;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.applyScrubFromPointer(event, trackEl);
  }

  OnScrubPointerMove(event: PointerEvent, trackEl: HTMLElement): void {
    if (!this._isScrubbing) {
      return;
    }
    this.applyScrubFromPointer(event, trackEl);
  }

  OnScrubPointerUp(event: PointerEvent): void {
    if (!this._isScrubbing) {
      return;
    }
    this._isScrubbing = false;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
  }

  // The waveform IS a scrubber: reuse the exact same pointer/keyboard seek logic.
  OnWaveformPointerDown(event: PointerEvent, trackEl: HTMLElement): void {
    this.OnScrubPointerDown(event, trackEl);
  }
  OnWaveformPointerMove(event: PointerEvent, trackEl: HTMLElement): void {
    this.OnScrubPointerMove(event, trackEl);
  }
  OnWaveformPointerUp(event: PointerEvent): void {
    this.OnScrubPointerUp(event);
  }

  /** Keyboard support for the scrubber (role="slider"). */
  OnScrubKeyDown(event: KeyboardEvent): void {
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        this.SeekToMs(this._currentTimeMs - 5000);
        break;
      case 'ArrowRight':
        this.SeekToMs(this._currentTimeMs + 5000);
        break;
      case 'Home':
        this.SeekToMs(0);
        break;
      case 'End':
        this.SeekToMs(this._durationMs);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
    }
  }

  // ---------------------------------------------------------------------------
  // Transcript cue interaction
  // ---------------------------------------------------------------------------

  OnCueClicked(index: number): void {
    const cues = this._transcript;
    if (!cues || index < 0 || index >= cues.length) {
      return;
    }
    this.CueClicked.emit({ Cue: cues[index], Index: index });
    this.SeekToCue(index);
  }

  OnCueKeyDown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.OnCueClicked(index);
    }
  }

  // ---------------------------------------------------------------------------
  // Rate menu
  // ---------------------------------------------------------------------------

  ToggleRateMenu(): void {
    this._rateMenuOpen = !this._rateMenuOpen;
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Volume slider input
  // ---------------------------------------------------------------------------

  OnVolumeInput(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.SetVolume(value);
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (host-level, when the player has focus)
  // ---------------------------------------------------------------------------

  @HostListener('keydown', ['$event'])
  OnHostKeyDown(event: KeyboardEvent): void {
    // ignore typing in form controls (e.g. the volume range / scrubber handle has its own handler)
    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.getAttribute('role') === 'slider') {
      return;
    }
    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.TogglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.SeekToMs(this._currentTimeMs - 5000);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.SeekToMs(this._currentTimeMs + 5000);
        break;
      case 'j':
      case 'J':
        event.preventDefault();
        this.SeekToMs(this._currentTimeMs - 10000);
        break;
      case 'l':
      case 'L':
        event.preventDefault();
        this.SeekToMs(this._currentTimeMs + 10000);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.SetVolume(this._volume + 0.05);
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.SetVolume(this._volume - 0.05);
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.ToggleMute();
        break;
      case 'f':
      case 'F':
        if (this.ShowFullscreen && this.VideoTracks.length > 0) {
          event.preventDefault();
          this.ToggleFullscreen();
        }
        break;
      default:
        break;
    }
  }

  @HostListener('document:fullscreenchange')
  OnFullscreenChange(): void {
    this._isFullscreen = !!document.fullscreenElement;
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers (template)
  // ---------------------------------------------------------------------------

  /** Formats a millisecond value as `mm:ss` (or `h:mm:ss` for long media). */
  FormatTime(ms: number): string {
    if (!isFinite(ms) || ms < 0) {
      ms = 0;
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  /** Stable color for a speaker label (deterministic hue from the label string). */
  SpeakerColor(label: string | undefined): string {
    if (!label) {
      return 'var(--mj-text-secondary)';
    }
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = (hash * 31 + label.charCodeAt(i)) & 0xffffffff;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
  }

  TrackById(_index: number, track: MediaTrack): string {
    return track.Id;
  }

  CueTrackById(_index: number, cue: MediaTranscriptCue): string {
    return cue.Id;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * The element that owns the master timeline. In a single audio track or a single
   * video, that's the primary element. For one-video-plus-audio, the video carries
   * playback (audio track is muted/secondary). For multi-video, the first video leads.
   */
  private resolveMediaElement(): HTMLMediaElement | null {
    if (this._activeMediaEl) {
      return this._activeMediaEl;
    }
    return this.primaryMedia?.nativeElement ?? null;
  }

  private initializeMediaElement(el: HTMLMediaElement): void {
    if (!this._rateInitialized) {
      this._playbackRate = this.InitialRate;
      this._volume = this.InitialVolume;
      this._rateInitialized = true;
    }
    el.playbackRate = this._playbackRate;
    el.volume = this._volume;
    el.muted = this._muted;
  }

  private applyToAllMedia(fn: (el: HTMLMediaElement) => void): void {
    const els = this.host.nativeElement.querySelectorAll('audio, video');
    els.forEach((el: Element) => fn(el as HTMLMediaElement));
  }

  private applyScrubFromPointer(event: PointerEvent, trackEl: HTMLElement): void {
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.SeekToMs(fraction * this._durationMs);
  }

  private refreshActiveCue(): void {
    const newIndex = computeActiveCueIndex(this._currentTimeMs, this._transcript);
    if (newIndex !== this._activeCueIndex) {
      this._activeCueIndex = newIndex;
      if (newIndex >= 0 && this._transcript) {
        this.CueActivated.emit({ Cue: this._transcript[newIndex], Index: newIndex });
      }
    }
  }

  private clampMs(ms: number): number {
    if (ms < 0) {
      return 0;
    }
    if (this._durationMs > 0 && ms > this._durationMs) {
      return this._durationMs;
    }
    return ms;
  }

  private resetPlaybackState(): void {
    this._currentTimeMs = 0;
    this._durationMs = 0;
    this._isPlaying = false;
    this._activeCueIndex = -1;
    this._hasError = false;
    this._rateInitialized = false;
  }

  // ---------------------------------------------------------------------------
  // Waveform peak extraction (client-side, best-effort, cached per track Id)
  // ---------------------------------------------------------------------------

  /**
   * Resolves peaks for a track: supplied {@link MediaTrack.Peaks} win (rendered as-is,
   * no decode); otherwise returns any cached/decoded peaks, kicking off a best-effort
   * client-side decode on first miss. Returns `null` while decoding or after a failure.
   */
  private peaksForTrack(track: MediaTrack): number[] | null {
    if (track.Peaks && track.Peaks.length > 0) {
      return track.Peaks;
    }
    const cached = this._peaksByTrackId.get(track.Id);
    if (cached) {
      return cached;
    }
    if (this._waveformFailedTrackIds.has(track.Id)) {
      return null;
    }
    void this.extractPeaks(track);
    return null;
  }

  /** Kicks off client-side extraction for every audio track that still needs it. */
  private ensureWaveforms(): void {
    if (!this.ShowWaveform) {
      return;
    }
    const track = this.IsAudioOnly ? this.AudioTracks[0] : null;
    if (track) {
      // Reading via peaksForTrack triggers a decode when needed (and is cache-safe).
      this.peaksForTrack(track);
    }
  }

  /**
   * Best-effort: fetch → arrayBuffer → decodeAudioData → downsample channel 0 → cache.
   * Never throws into the view; on any failure marks the track as failed so the template
   * falls back to a plain progress bar (not the old synthetic bars).
   */
  private async extractPeaks(track: MediaTrack): Promise<void> {
    if (this._waveformPendingTrackIds.has(track.Id)) {
      return;
    }
    this._waveformPendingTrackIds.add(track.Id);
    try {
      const ctx = this.resolveAudioContext();
      if (!ctx) {
        this.markWaveformFailed(track.Id);
        return;
      }
      const response = await fetch(track.Url);
      if (!response.ok) {
        this.markWaveformFailed(track.Id);
        return;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const channel = audioBuffer.getChannelData(0);
      const peaks = downsamplePeaks(channel, this.WaveformBarCount, 'max-abs');
      this._peaksByTrackId.set(track.Id, peaks);
      this.cdr.markForCheck();
    } catch {
      // CORS, unsupported codec, decode error → graceful fallback (no throw).
      this.markWaveformFailed(track.Id);
    } finally {
      this._waveformPendingTrackIds.delete(track.Id);
    }
  }

  private markWaveformFailed(trackId: string): void {
    this._waveformFailedTrackIds.add(trackId);
    this.cdr.markForCheck();
  }

  /** Lazily creates a single AudioContext used only for offline peak extraction. */
  private resolveAudioContext(): AudioContext | null {
    if (this._audioCtx) {
      return this._audioCtx;
    }
    const Ctor =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) {
      return null;
    }
    try {
      this._audioCtx = new Ctor();
      return this._audioCtx;
    } catch {
      return null;
    }
  }

  private detectReducedMotion(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  ngOnDestroy(): void {
    // object URLs are owned by the wrapper that created them; close our decode context.
    if (this._audioCtx) {
      void this._audioCtx.close().catch(() => undefined);
      this._audioCtx = null;
    }
  }
}
