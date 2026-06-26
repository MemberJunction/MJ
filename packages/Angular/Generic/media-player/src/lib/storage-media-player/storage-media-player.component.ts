import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJMediaPlayerComponent } from '../media-player/media-player.component';
import { MediaTrack, MediaTranscriptCue } from '../media-player.types';

/** Shape of the `GetFileContents` server query result (one file). */
interface GetFileContentsResult {
  Success: boolean;
  Base64?: string | null;
  MimeType?: string | null;
  ErrorMessage?: string | null;
}

/** The exact GraphQL query this wrapper consumes (server-side query added in parallel). */
const GET_FILE_CONTENTS_QUERY = `query GetFileContents($fileId: String!) {
  GetFileContents(fileId: $fileId) {
    Success
    Base64
    MimeType
    ErrorMessage
  }
}`;

/**
 * `mj-storage-media-player` — an MJStorage-bound wrapper around {@link MJMediaPlayerComponent}.
 *
 * Resolves one or more MJ Storage file IDs into playable {@link MediaTrack}s by fetching
 * their base64 contents via the `GetFileContents` GraphQL query, decoding to object URLs,
 * and handing them to the generic player. Surfaces graceful loading / no-access / empty
 * states and revokes object URLs to avoid memory leaks.
 */
@Component({
  selector: 'mj-storage-media-player',
  standalone: true,
  imports: [CommonModule, MJMediaPlayerComponent],
  templateUrl: './storage-media-player.component.html',
  styleUrls: ['./storage-media-player.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MJStorageMediaPlayerComponent extends BaseAngularComponent implements OnInit, OnDestroy {
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
  @Input() ShowWaveform = false;
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
  private _objectUrls: string[] = [];
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

  ngOnDestroy(): void {
    this.revokeObjectUrls();
  }

  // ---------------------------------------------------------------------------
  // Resolution
  // ---------------------------------------------------------------------------

  /** Resolves all configured file ids into playable tracks. Re-entrant-safe via a token. */
  private async resolveTracks(): Promise<void> {
    const ids = this.collectFileIds();
    const token = ++this._resolveToken;

    // start fresh
    this.revokeObjectUrls();
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
      const result = await this.fetchFileContents(id);
      if (token !== this._resolveToken) {
        return; // a newer resolution superseded this one
      }
      if (result && result.Success && result.Base64) {
        const track = this.buildTrack(id, result);
        if (track) {
          tracks.push(track);
        }
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

  /** Executes the GetFileContents query for one file id via the active provider. */
  private async fetchFileContents(fileId: string): Promise<GetFileContentsResult | null> {
    try {
      const provider = this.ProviderToUse as unknown as GraphQLDataProvider;
      const data = await provider.ExecuteGQL(GET_FILE_CONTENTS_QUERY, { fileId });
      const payload = data?.GetFileContents as GetFileContentsResult | undefined;
      return payload ?? null;
    } catch (err) {
      LogError(`GetFileContents failed for file '${fileId}': ${err instanceof Error ? err.message : String(err)}`);
      return { Success: false, ErrorMessage: 'Unable to load this recording.' };
    }
  }

  /** Decodes base64 → Blob → object URL and builds a MediaTrack. */
  private buildTrack(fileId: string, result: GetFileContentsResult): MediaTrack | null {
    const mime = result.MimeType || 'application/octet-stream';
    const url = this.base64ToObjectUrl(result.Base64 ?? '', mime);
    if (!url) {
      return null;
    }
    this._objectUrls.push(url);
    return {
      Id: fileId,
      Kind: mime.startsWith('video') ? 'video' : 'audio',
      Url: url,
      MimeType: mime,
    };
  }

  private base64ToObjectUrl(base64: string, mimeType: string): string | null {
    try {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (err) {
      LogError(`Failed to decode base64 media: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private revokeObjectUrls(): void {
    for (const url of this._objectUrls) {
      URL.revokeObjectURL(url);
    }
    this._objectUrls = [];
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
