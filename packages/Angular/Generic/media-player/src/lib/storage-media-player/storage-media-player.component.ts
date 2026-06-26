import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJMediaPlayerComponent } from '../media-player/media-player.component';
import { MediaTrack, MediaTranscriptCue } from '../media-player.types';

/** Shape of the `CreateMediaAccessToken` server mutation result (one file). */
interface CreateMediaAccessTokenResult {
  Success: boolean;
  Token?: string | null;
  Url?: string | null;
  ExpiresAt?: string | null;
  MimeType?: string | null;
  ErrorMessage?: string | null;
}

/**
 * The exact GraphQL mutation this wrapper consumes. Mints a short-lived signed token (after a
 * server-side per-user permission check) and returns the authenticated `/media/<fileId>?token=`
 * streaming URL — which `<audio>`/`<video>` stream natively with HTTP Range (seek-before-download).
 */
const CREATE_MEDIA_ACCESS_TOKEN_MUTATION = `mutation CreateMediaAccessToken($fileId: String!) {
  CreateMediaAccessToken(fileId: $fileId) {
    Success
    Url
    ExpiresAt
    MimeType
    ErrorMessage
  }
}`;

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
 * NOTE: server-side waveform peaks is a future optimization. For now audio waveforms decode
 * client-side via the streaming URL (the waveform's one-time `fetch(Url)` issues a no-Range GET,
 * which returns the full file — fine for audio). Video shows the progress bar, not a waveform.
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

  /** Transcript cues forwarded to the generic player. */
  @Input() Transcript: MediaTranscriptCue[] | null = null;

  // ---------------------------------------------------------------------------
  // Inputs — pass-through feature flags (forwarded to the generic player)
  // ---------------------------------------------------------------------------

  @Input() ShowTranscript = true;
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
  @Input() TranscriptPosition: 'side' | 'bottom' = 'side';

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

    for (const id of ids) {
      const result = await this.mintAccessToken(id);
      if (token !== this._resolveToken) {
        return; // a newer resolution superseded this one
      }
      if (result && result.Success && result.Url) {
        tracks.push(this.buildTrack(id, result.Url, result.MimeType ?? null));
      } else if (!firstError) {
        firstError = result?.ErrorMessage || 'This recording is not available.';
      }
    }

    if (token !== this._resolveToken) {
      return;
    }

    this._resolvedTracks = tracks;
    // Only surface the no-access state when NOTHING resolved.
    this._accessError = tracks.length === 0 ? firstError : null;
    this._isLoading = false;
    this.cdr.markForCheck();
  }

  /** Mints an authenticated streaming-URL token for one file id via the active provider. */
  private async mintAccessToken(fileId: string): Promise<CreateMediaAccessTokenResult | null> {
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const data = await provider.ExecuteGQL(CREATE_MEDIA_ACCESS_TOKEN_MUTATION, { fileId });
      const payload = data?.CreateMediaAccessToken as CreateMediaAccessTokenResult | undefined;
      return payload ?? null;
    } catch (err) {
      LogError(`CreateMediaAccessToken failed for file '${fileId}': ${err instanceof Error ? err.message : String(err)}`);
      return { Success: false, ErrorMessage: 'Unable to load this recording.' };
    }
  }

  /** Builds a MediaTrack from the streaming URL. Kind is MIME-derived (defaults to audio). */
  private buildTrack(fileId: string, url: string, mimeType: string | null): MediaTrack {
    const mime = mimeType || undefined;
    return {
      Id: fileId,
      Kind: mime && mime.startsWith('video') ? 'video' : 'audio',
      Url: url,
      MimeType: mime,
    };
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
