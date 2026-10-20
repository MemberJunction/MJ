import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJMediaPlayerComponent } from '../media-player/media-player.component';
import { MediaTrack, MediaTranscriptCue } from '../media-player.types';
import { MintMediaAccessUrl } from './media-access';

/**
 * `mj-storage-media-player` — an MJStorage-bound wrapper around {@link MJMediaPlayerComponent}.
 *
 * Resolves one or more MJ Storage file IDs into playable {@link MediaTrack}s by minting a
 * short-lived authenticated streaming URL per file via the `CreateMediaAccessToken` GraphQL
 * mutation, and handing those URLs to the generic player. The `<audio>`/`<video>` element
 * streams each URL natively over HTTP Range (progressive playback + seek-before-download for
 * large video) instead of base64'ing the whole file over GraphQL. Surfaces graceful loading /
 * no-access / empty states.
 *
 * Waveform peaks: when the recording has a `peaks.json` sidecar in storage, `CreateMediaAccessToken`
 * returns precomputed peaks and this wrapper sets them on the {@link MediaTrack.Peaks}, so the player
 * renders the real waveform instantly with NO client-side fetch/decode. When no sidecar exists, audio
 * waveforms still decode client-side via the streaming URL (the waveform's one-time `fetch(Url)`
 * issues a no-Range GET, which returns the full file — fine for audio). Video shows the progress bar.
 */
@Component({
  selector: 'mj-storage-media-player',
  standalone: true,
  imports: [CommonModule, MJMediaPlayerComponent],
  templateUrl: './storage-media-player.component.html',
  styleUrls: ['./storage-media-player.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJStorageMediaPlayerComponent extends BaseAngularComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  // ---------------------------------------------------------------------------
  // Inputs — file resolution
  // ---------------------------------------------------------------------------

  /** Convenience single-file id. Combined with {@link FileIDs}; duplicates are de-duped. */
  @Input()
  set FileID(value: string | null) {
    if (value !== this._fileID) {
      this._fileID = value;
      if (this._initialized) {
        void this.resolveTracks();
      }
    }
  }
  get FileID(): string | null {
    return this._fileID;
  }
  private _fileID: string | null = null;

  /** Multi-track file ids (e.g. separate meeting streams). */
  @Input()
  set FileIDs(value: string[]) {
    const next = value ?? [];
    if (!this.sameIds(next, this._fileIDs)) {
      this._fileIDs = next;
      if (this._initialized) {
        void this.resolveTracks();
      }
    }
  }
  get FileIDs(): string[] {
    return this._fileIDs;
  }
  private _fileIDs: string[] = [];

  /** Optional poster image file id in MJ Storage, assigned to `PosterUrl` on the first video track. */
  @Input()
  set PosterFileID(value: string | null) {
    if (value !== this._posterFileID) {
      this._posterFileID = value;
      this._cachedPosterFileID = null;
      this._cachedPosterUrl = null;
      this._cachedPosterExpiresAtMs = null;
      if (this._initialized) {
        void this.resolveTracks();
      }
    }
  }
  get PosterFileID(): string | null {
    return this._posterFileID;
  }
  private _posterFileID: string | null = null;
  private _cachedPosterFileID: string | null = null;
  private _cachedPosterUrl: string | null = null;
  private _cachedPosterExpiresAtMs: number | null = null;

  /** Transcript cues forwarded to the generic player. */
  @Input() Transcript: MediaTranscriptCue[] | null = null;

  // ---------------------------------------------------------------------------
  // Inputs — pass-through feature flags (forwarded to the generic player)
  // ---------------------------------------------------------------------------

  @Input() ShowTranscript = true;
  /** Whether the transcript show/hide toggle button renders. Forwarded to the generic player. */
  @Input() ShowTranscriptToggle = true;
  @Input() ShowSpeedControl = true;
  @Input() ShowSkipControls = true;
  @Input() ShowVolume = true;
  /**
   * Forwarded to the generic player. On by default — the streaming URL is same-origin (served by
   * MJAPI) and a no-Range GET returns the full file, so client-side peak extraction decodes cleanly.
   */
  @Input() ShowWaveform = true;
  @Input() ShowFullscreen = true;
  @Input() SkipSeconds = 30;
  @Input() PlaybackRates: number[] = [0.5, 1, 1.25, 1.5, 2];
  @Input() Autoplay = false;
  @Input() StartAtMs: number | null = null;
  /** Where the transcript sits. Defaults to `'bottom'` (matches the generic player). */
  @Input() TranscriptPosition: 'side' | 'bottom' = 'bottom';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private _initialized = false;
  private _resolvedTracks: MediaTrack[] = [];
  private _isLoading = false;
  private _accessError: string | null = null;
  private _resolveToken = 0;

  get ResolvedTracks(): MediaTrack[] {
    return this._resolvedTracks;
  }
  get IsLoading(): boolean {
    return this._isLoading;
  }
  get AccessError(): string | null {
    return this._accessError;
  }
  get HasFileIds(): boolean {
    return this.collectFileIds().length > 0;
  }

  async ngOnInit(): Promise<void> {
    this._initialized = true;
    await this.resolveTracks();
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /** Resolves all configured file ids into playable streaming tracks. Re-entrant-safe via a token. */
  private async resolveTracks(): Promise<void> {
    const ids = this.collectFileIds();
    const token = ++this._resolveToken;

    // start fresh
    this._resolvedTracks = [];
    this._accessError = null;

    if (ids.length === 0) {
      this._isLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this._isLoading = true;
    this.cdr.markForCheck();

    const tracks: MediaTrack[] = [];
    let firstError: string | null = null;

    const posterFileId = this._posterFileID;
    const needPoster = Boolean(
      posterFileId &&
        (this._cachedPosterFileID !== posterFileId ||
          !this._cachedPosterUrl ||
          this.isCachedPosterExpired()),
    );
    const [trackResults, posterResult] = await Promise.all([
      Promise.all(ids.map(id => MintMediaAccessUrl(this.ProviderToUse, id))),
      needPoster && posterFileId ? MintMediaAccessUrl(this.ProviderToUse, posterFileId) : Promise.resolve(null),
    ]);

    if (token !== this._resolveToken) {
      return; // a newer resolution superseded this one
    }

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const result = trackResults[i];
      if (result && result.Success && result.Url) {
        tracks.push(this.buildTrack(id, result.Url, result.MimeType ?? null, result.Peaks ?? null));
      } else if (!firstError) {
        firstError = result?.ErrorMessage || 'This recording is not available.';
      }
    }

    if (posterFileId && needPoster) {
      if (posterResult && posterResult.Success && posterResult.Url) {
        this._cachedPosterFileID = posterFileId;
        this._cachedPosterUrl = posterResult.Url;
        const parsedExpiry = posterResult.ExpiresAt ? Date.parse(posterResult.ExpiresAt) : NaN;
        this._cachedPosterExpiresAtMs = Number.isFinite(parsedExpiry) ? parsedExpiry : null;
      } else {
        this._cachedPosterFileID = null;
        this._cachedPosterUrl = null;
        this._cachedPosterExpiresAtMs = null;
      }
    }

    const firstVideoTrack = tracks.find(t => t.Kind === 'video');
    if (posterFileId && firstVideoTrack && this._cachedPosterFileID === posterFileId && this._cachedPosterUrl) {
      firstVideoTrack.PosterUrl = this._cachedPosterUrl;
    }

    this._resolvedTracks = tracks;
    // Only surface the no-access state when NOTHING resolved.
    this._accessError = tracks.length === 0 ? firstError : null;
    this._isLoading = false;
    this.cdr.markForCheck();
  }

  private isCachedPosterExpired(): boolean {
    if (this._cachedPosterExpiresAtMs == null) {
      return false;
    }
    return Date.now() >= this._cachedPosterExpiresAtMs;
  }

  /**
   * Builds a MediaTrack from the streaming URL. Kind is MIME-derived (defaults to audio). When the
   * server supplied precomputed waveform `peaks` (from a peaks.json sidecar), they're attached so the
   * player renders the real waveform instantly with NO extra fetch/decode; otherwise the player
   * extracts peaks client-side from the streaming URL.
   */
  private buildTrack(fileId: string, url: string, mimeType: string | null, peaks: number[] | null): MediaTrack {
    const mime = mimeType || undefined;
    const track: MediaTrack = {
      Id: fileId,
      Kind: mime && mime.startsWith('video') ? 'video' : 'audio',
      Url: url,
      MimeType: mime,
    };
    if (Array.isArray(peaks) && peaks.length > 0) {
      track.Peaks = peaks;
    }
    return track;
  }

  private collectFileIds(): string[] {
    const ids: string[] = [];
    if (this._fileID) {
      ids.push(this._fileID);
    }
    for (const id of this._fileIDs) {
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  }

  private sameIds(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => v === b[i]);
  }
}
