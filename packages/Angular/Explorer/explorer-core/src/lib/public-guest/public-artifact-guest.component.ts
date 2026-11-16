import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Metadata, ResolveMJAPIURL } from '@memberjunction/core';
import { GuestFrozenProvenanceItem, MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AuthProviderCatalog, MJ_PUBLIC_API_BASE_URL } from '@memberjunction/ng-auth-services';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subscription } from 'rxjs';

export interface PreVerifiedFrozenSnapshotEntry {
  Verified: boolean;
  FrozenByUserName?: string;
  FrozenAt?: string;
}

/**
 * Converts server-verified `FrozenProvenance` records into the flat lookup map
 * expected by `[PreVerifiedFrozenSnapshots]` on `<mj-artifact-type-plugin-viewer>`.
 */
export function BuildPreVerifiedFrozenSnapshotsMap(
  items?: ReadonlyArray<GuestFrozenProvenanceItem> | null,
): Record<string, PreVerifiedFrozenSnapshotEntry> | null {
  if (!items || items.length === 0) {
    return null;
  }
  const map: Record<string, PreVerifiedFrozenSnapshotEntry> = {};
  for (const item of items) {
    const entry: PreVerifiedFrozenSnapshotEntry = {
      Verified: Boolean(item.SnapshotVerified),
      FrozenByUserName: item.FrozenByUserName || undefined,
      FrozenAt: item.FrozenAt || undefined,
    };
    const exactKeys = [
      item.TargetID,
      item.BlockID,
      item.LiveTableID,
      item.RegionID,
      item.SlideID && item.RegionID ? `${item.SlideID}:${item.RegionID}` : undefined,
    ];
    for (const rawKey of exactKeys) {
      const key = typeof rawKey === 'string' ? rawKey.trim() : '';
      if (key) {
        const existing = map[key];
        map[key] = existing
          ? {
              ...entry,
              Verified: existing.Verified && entry.Verified,
            }
          : entry;
      }
    }
    const slideKey = typeof item.SlideID === 'string' ? item.SlideID.trim() : '';
    if (slideKey) {
      const existingSlide = map[slideKey];
      map[slideKey] = existingSlide
        ? {
            ...entry,
            Verified: existingSlide.Verified && entry.Verified,
          }
        : entry;
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Contract returned by both `POST /guest-share/resolve` (pre-auth REST endpoint)
 * and the `@Public()` `ResolvePublicArtifactGuestShare(token)` GraphQL query.
 */
export interface PublicArtifactGuestShareResult {
  Success: boolean;
  Valid: boolean;
  ErrorCode?: string | null;
  ErrorMessage?: string | null;
  ArtifactID?: string | null;
  ArtifactName?: string | null;
  Title?: string | null;
  ArtifactTypeName?: string | null;
  DriverClass?: string | null;
  VersionID?: string | null;
  VersionNumber?: number | null;
  Content?: string | null;
  Configuration?: string | null;
  FrozenProvenance?: GuestFrozenProvenanceItem[] | null;
  ExpiresAt?: string | null;
  Label?: string | null;
  ShareMode: string;
  ReadOnly: boolean;
}

interface ResolvePublicGuestGraphQLResponse {
  ResolvePublicArtifactGuestShare?: PublicArtifactGuestShareResult | null;
}

const SENSITIVE_CONFIG_KEYS = new Set([
  '__mj_guestlinks',
  'guestsharelinks',
  'apikey',
  'secret',
  'tokenhash',
  'password',
  'credentials',
  'accesstoken',
  'refreshtoken',
]);

const RESOLVE_PUBLIC_GUEST_SHARE_GQL = `
  query ResolvePublicArtifactGuestShare($token: String!) {
    ResolvePublicArtifactGuestShare(token: $token) {
      Success
      Valid
      ErrorCode
      ErrorMessage
      ArtifactID
      ArtifactName
      Title
      ArtifactTypeName
      DriverClass
      VersionID
      VersionNumber
      Content
      Configuration
      FrozenProvenance {
        TargetType
        TargetID
        ArtifactID
        BlockID
        SlideID
        RegionID
        LiveTableID
        SnapshotVerified
        FrozenByUserName
        FrozenAt
      }
      ExpiresAt
      Label
      ShareMode
      ReadOnly
    }
  }
`;

/**
 * Strips any residual credential-like keys from artifact configuration JSON before
 * passing it to an unauthenticated read-only viewer.
 */
export function SanitizeGuestConfigurationJson(rawConfig: string | null | undefined): string {
  if (!rawConfig || !rawConfig.trim()) {
    return '';
  }
  try {
    const parsed = JSON.parse(rawConfig) as Record<string, string | number | boolean | null | object>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '';
    }
    const sanitized: Record<string, string | number | boolean | null | object> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!SENSITIVE_CONFIG_KEYS.has(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }
    return JSON.stringify(sanitized);
  } catch {
    return '';
  }
}

/**
 * Maps server error codes returned by the guest-share resolver into clear user-facing copy.
 */
export function DescribeGuestShareError(errorCode: string | null | undefined, fallbackMessage?: string | null): {
  title: string;
  message: string;
  icon: string;
} {
  switch ((errorCode ?? '').trim().toUpperCase()) {
    case 'EXPIRED':
      return {
        title: 'Guest Share Link Expired',
        message: fallbackMessage || 'This external guest share link has expired and can no longer be viewed.',
        icon: 'fa-solid fa-clock',
      };
    case 'REVOKED':
      return {
        title: 'Guest Share Link Revoked',
        message: fallbackMessage || 'The owner revoked access for this external guest share link.',
        icon: 'fa-solid fa-ban',
      };
    case 'FROZEN_REQUIRED':
      return {
        title: 'Frozen Snapshot Required',
        message: fallbackMessage || 'This artifact must have a frozen snapshot before it can be shared externally.',
        icon: 'fa-solid fa-snowflake',
      };
    case 'RATE_LIMITED':
      return {
        title: 'Too Many Requests',
        message: fallbackMessage || 'Please wait a moment and retry opening this shared artifact.',
        icon: 'fa-solid fa-gauge-high',
      };
    case 'NOT_FOUND':
    case 'INVALID_TOKEN':
      return {
        title: 'Invalid or Unknown Share Link',
        message: fallbackMessage || 'This share link could not be verified. Check the URL or ask the owner for a new link.',
        icon: 'fa-solid fa-link-slash',
      };
    default:
      return {
        title: 'Unable to Load Shared Artifact',
        message: fallbackMessage || 'An unexpected error occurred while verifying this share link.',
        icon: 'fa-solid fa-triangle-exclamation',
      };
  }
}

/**
 * Anonymous, zero-OAuth route component mounted at `/guest/artifact/:token`.
 *
 * Calls the pre-auth REST endpoint `GET /guest-share/resolve?token=...`
 * (falling back to `@Public()` GraphQL `ResolvePublicArtifactGuestShare` when a
 * GraphQL provider is configured and REST fails) so external guests can view frozen
 * read-only artifacts (`Markdown Document`, `Presentation`, `Excel Spreadsheet`, etc.)
 * without signing in.
 */
@Component({
  standalone: false,
  selector: 'mj-public-artifact-guest',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="guest-page">
      <header class="guest-header">
        <div class="guest-brand">
          <span class="guest-badge">
            <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
            Guest View
          </span>
          @if (Payload) {
            <h1 class="guest-title">{{ DisplayTitle }}</h1>
            <span class="guest-meta-chip">
              <i class="fa-solid fa-snowflake" aria-hidden="true"></i>
              {{ Payload.ShareMode || 'Frozen' }}
              @if (Payload.VersionNumber != null) {
                <span>v{{ Payload.VersionNumber }}</span>
              }
            </span>
            @if (Payload.ArtifactTypeName) {
              <span class="guest-meta-chip">{{ Payload.ArtifactTypeName }}</span>
            }
            @if (Payload.Label) {
              <span class="guest-meta-chip">{{ Payload.Label }}</span>
            }
          } @else {
            <h1 class="guest-title">Shared Artifact</h1>
          }
        </div>
        <div class="guest-actions">
          @if (FormattedExpiresAt) {
            <span class="guest-expiry" title="Guest link expiration">
              <i class="fa-solid fa-calendar-clock" aria-hidden="true"></i>
              Expires {{ FormattedExpiresAt }}
            </span>
          }
          <a class="guest-signin-link" href="/">
            <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
            Sign In
          </a>
        </div>
      </header>

      <main class="guest-main">
        @if (IsLoading) {
          <div class="guest-state-card" role="status" aria-live="polite">
            <i class="fa-solid fa-spinner fa-spin guest-state-icon" aria-hidden="true"></i>
            <h2 class="guest-state-title">Loading shared artifact...</h2>
            <p class="guest-state-message">Verifying external guest link and preparing frozen snapshot.</p>
          </div>
        } @else if (ErrorMessage) {
          <div class="guest-error-banner" role="alert">
            <i [class]="ErrorIcon + ' guest-error-icon'" aria-hidden="true"></i>
            <div class="guest-error-body">
              <h2 class="guest-error-title">{{ ErrorTitle }}</h2>
              <p class="guest-error-message">{{ ErrorMessage }}</p>
              <div class="guest-error-actions">
                <button type="button" class="guest-retry-btn" (click)="Retry()">
                  <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
                  Retry
                </button>
              </div>
            </div>
          </div>
        } @else if (GuestArtifactVersion && Payload) {
          <div class="guest-viewer-shell">
            @if (!ViewerFallbackOnly) {
              <mj-artifact-type-plugin-viewer
                [artifactVersion]="GuestArtifactVersion"
                [ArtifactTypeName]="Payload.ArtifactTypeName || 'Markdown Document'"
                [DriverClass]="Payload.DriverClass || undefined"
                [PreVerifiedFrozenSnapshots]="PreVerifiedFrozenSnapshots"
                [GuestSnapshotMode]="true"
                [readonly]="true"
                height="100%"
                (PluginLoaded)="OnPluginLoaded()"
              ></mj-artifact-type-plugin-viewer>
            } @else {
              <pre class="guest-fallback-content">{{ SanitizedFallbackContent }}</pre>
            }
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      width: 100%;
      background: var(--mj-bg-page);
      color: var(--mj-text-primary);
    }

    .guest-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: var(--mj-bg-page);
    }

    .guest-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 20px;
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
      flex-wrap: wrap;
    }

    .guest-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex-wrap: wrap;
    }

    .guest-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--mj-brand-primary);
      color: var(--mj-text-inverse);
      font-size: 12px;
      font-weight: 600;
    }

    .guest-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .guest-meta-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      border-radius: 6px;
      background: var(--mj-bg-surface-sunken);
      border: 1px solid var(--mj-border-default);
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 500;
    }

    .guest-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .guest-expiry {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--mj-text-secondary);
      font-size: 12px;
    }

    .guest-signin-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-card);
      color: var(--mj-text-primary);
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
    }

    .guest-signin-link:hover {
      border-color: var(--mj-brand-primary);
      color: var(--mj-brand-primary);
    }

    .guest-main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      overflow: auto;
    }

    .guest-state-card {
      margin: auto;
      max-width: 440px;
      padding: 32px;
      border-radius: 12px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      text-align: center;
    }

    .guest-state-icon {
      font-size: 28px;
      color: var(--mj-brand-primary);
      margin-bottom: 12px;
    }

    .guest-state-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .guest-state-message {
      margin: 0;
      font-size: 14px;
      color: var(--mj-text-secondary);
    }

    .guest-error-banner {
      margin: 40px auto;
      max-width: 560px;
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 20px;
      border-radius: 10px;
      background: var(--mj-status-error-bg);
      border: 1px solid var(--mj-status-error);
      color: var(--mj-status-error-text);
    }

    .guest-error-icon {
      font-size: 22px;
      color: var(--mj-status-error);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .guest-error-body {
      flex: 1;
      min-width: 0;
    }

    .guest-error-title {
      margin: 0 0 6px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .guest-error-message {
      margin: 0 0 14px 0;
      font-size: 14px;
      color: var(--mj-text-secondary);
    }

    .guest-error-actions {
      display: flex;
      gap: 10px;
    }

    .guest-retry-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 6px;
      border: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface);
      color: var(--mj-text-primary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }

    .guest-retry-btn:hover {
      border-color: var(--mj-brand-primary);
    }

    .guest-viewer-shell {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 10px;
      overflow: hidden;
    }

    .guest-fallback-content {
      margin: 0;
      padding: 20px;
      flex: 1;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      line-height: 1.5;
      color: var(--mj-text-primary);
      background: var(--mj-bg-surface-card);
    }
  `],
})
export class PublicArtifactGuestComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly publicApiBaseUrl = inject(MJ_PUBLIC_API_BASE_URL, { optional: true });

  private _token = '';
  @Input()
  public set Token(value: string) {
    const normalized = (value ?? '').trim();
    if (normalized !== this._token) {
      this._token = normalized;
      if (this.initialized) {
        void this.LoadGuestShare(this._token);
      }
    }
  }
  public get Token(): string {
    return this._token;
  }

  /** Optional explicit MJAPI base URL override (primarily for host integration or unit tests). */
  @Input() public ApiBaseUrl = '';

  /** Optional viewer fallback mode when host bundle has no plugin registered. */
  @Input() public ViewerFallbackOnly = false;

  public IsLoading = true;
  public ErrorTitle = '';
  public ErrorMessage = '';
  public ErrorCode = '';
  public ErrorIcon = 'fa-solid fa-triangle-exclamation';
  public Payload: PublicArtifactGuestShareResult | null = null;
  public GuestArtifactVersion: MJArtifactVersionEntity | null = null;
  public PreVerifiedFrozenSnapshots: Record<string, PreVerifiedFrozenSnapshotEntry> | null = null;

  private initialized = false;
  private activeLoadSeq = 0;
  private readonly subscriptions: Subscription[] = [];

  public get DisplayTitle(): string {
    return (
      this.Payload?.Title?.trim() ||
      this.Payload?.ArtifactName?.trim() ||
      'Shared Artifact'
    );
  }

  public get FormattedExpiresAt(): string {
    if (!this.Payload?.ExpiresAt) {
      return '';
    }
    const parsed = new Date(this.Payload.ExpiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return this.Payload.ExpiresAt;
    }
    return parsed.toLocaleString();
  }

  public get SanitizedFallbackContent(): string {
    return this.Payload?.Content ?? '';
  }

  public ngOnInit(): void {
    this.initialized = true;
    const paramSub = this.route.paramMap.subscribe((params) => {
      const routeToken = (params.get('token') ?? '').trim();
      const queryToken = (
        this.route.snapshot?.queryParamMap?.get('token') ??
        this.route.snapshot?.queryParamMap?.get('guestToken') ??
        ''
      ).trim();
      const effectiveToken = routeToken || queryToken || this._token;
      if (effectiveToken !== this._token || !this.Payload) {
        this._token = effectiveToken;
        void this.LoadGuestShare(effectiveToken);
      }
    });
    const querySub = this.route.queryParamMap.subscribe((qparams) => {
      const routeToken = (this.route.snapshot?.paramMap?.get('token') ?? '').trim();
      const queryToken = (qparams.get('token') ?? qparams.get('guestToken') ?? '').trim();
      const effectiveToken = routeToken || queryToken;
      if (effectiveToken && effectiveToken !== this._token) {
        this._token = effectiveToken;
        void this.LoadGuestShare(effectiveToken);
      }
    });
    this.subscriptions.push(paramSub, querySub);

    if (this._token && !this.Payload) {
      void this.LoadGuestShare(this._token);
    }
  }

  public ngOnDestroy(): void {
    this.activeLoadSeq++;
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions.length = 0;
  }

  public Retry(): void {
    void this.LoadGuestShare(this._token);
  }

  public OnPluginLoaded(): void {
    this.cdr.markForCheck();
  }

  public async LoadGuestShare(rawToken: string): Promise<void> {
    const seq = ++this.activeLoadSeq;
    const token = (rawToken ?? '').trim();
    this.IsLoading = true;
    this.ErrorTitle = '';
    this.ErrorMessage = '';
    this.ErrorCode = '';
    this.Payload = null;
    this.GuestArtifactVersion = null;
    this.PreVerifiedFrozenSnapshots = null;
    this.cdr.markForCheck();

    if (!token) {
      this.applyError('INVALID_TOKEN', 'No guest share token was provided in the URL.');
      return;
    }

    const result = await this.resolveGuestShareToken(token);
    if (seq !== this.activeLoadSeq) {
      return;
    }

    if (!result.Success || !result.Valid) {
      this.applyError(result.ErrorCode, result.ErrorMessage);
      return;
    }

    const sanitizedConfig = SanitizeGuestConfigurationJson(result.Configuration);
    const sanitizedPayload: PublicArtifactGuestShareResult = {
      ...result,
      Configuration: sanitizedConfig,
      ReadOnly: true,
    };

    this.Payload = sanitizedPayload;
    this.PreVerifiedFrozenSnapshots = BuildPreVerifiedFrozenSnapshotsMap(sanitizedPayload.FrozenProvenance);
    this.GuestArtifactVersion = this.buildReadOnlyArtifactVersion(sanitizedPayload);
    this.IsLoading = false;
    this.cdr.markForCheck();
  }

  private applyError(errorCode: string | null | undefined, rawMessage: string | null | undefined): void {
    const described = DescribeGuestShareError(errorCode, rawMessage);
    this.ErrorCode = errorCode ?? 'INTERNAL_ERROR';
    this.ErrorTitle = described.title;
    this.ErrorMessage = described.message;
    this.ErrorIcon = described.icon;
    this.IsLoading = false;
    this.cdr.markForCheck();
  }

  private async resolveGuestShareToken(token: string): Promise<PublicArtifactGuestShareResult> {
    const restBaseUrl = this.resolveApiBaseUrl();
    const resolveUrl = `${restBaseUrl}/guest-share/resolve`;

    try {
      const response = await fetch(resolveUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (contentType.includes('application/json') || response.ok || response.status === 400 || response.status === 403 || response.status === 404 || response.status === 410 || response.status === 429) {
        const parsed = (await response.json()) as Partial<PublicArtifactGuestShareResult>;
        if (parsed && typeof parsed === 'object' && 'Success' in parsed) {
          return {
            Success: Boolean(parsed.Success),
            Valid: Boolean(parsed.Valid),
            ErrorCode: parsed.ErrorCode ?? (response.status === 429 ? 'RATE_LIMITED' : null),
            ErrorMessage: parsed.ErrorMessage ?? null,
            ArtifactID: parsed.ArtifactID ?? null,
            ArtifactName: parsed.ArtifactName ?? null,
            Title: parsed.Title ?? null,
            ArtifactTypeName: parsed.ArtifactTypeName ?? null,
            DriverClass: parsed.DriverClass ?? null,
            VersionID: parsed.VersionID ?? null,
            VersionNumber: parsed.VersionNumber ?? null,
            Content: parsed.Content ?? '',
            Configuration: parsed.Configuration ?? '',
            FrozenProvenance: Array.isArray(parsed.FrozenProvenance) ? parsed.FrozenProvenance : null,
            ExpiresAt: parsed.ExpiresAt ?? null,
            Label: parsed.Label ?? null,
            ShareMode: parsed.ShareMode ?? 'Frozen',
            ReadOnly: true,
          };
        }
      }
    } catch {
      // Fall through to @Public() GraphQL fallback when REST fetch cannot connect.
    }

    const gqlResult = await this.tryResolveViaPublicGraphQL(token);
    if (gqlResult) {
      return gqlResult;
    }

    return {
      Success: false,
      Valid: false,
      ErrorCode: 'INTERNAL_ERROR',
      ErrorMessage: 'Unable to reach the guest share verification service.',
      ShareMode: 'Frozen',
      ReadOnly: true,
    };
  }

  private async tryResolveViaPublicGraphQL(token: string): Promise<PublicArtifactGuestShareResult | null> {
    const provider = this.ProviderToUse instanceof GraphQLDataProvider
      ? this.ProviderToUse
      : (GraphQLDataProvider.Instance ?? null);

    if (!provider || typeof provider.ExecuteGQL !== 'function') {
      return null;
    }

    try {
      const data = await provider.ExecuteGQL(RESOLVE_PUBLIC_GUEST_SHARE_GQL, { token });
      const resolved = (data as ResolvePublicGuestGraphQLResponse | null | undefined)?.ResolvePublicArtifactGuestShare;
      if (!resolved) {
        return null;
      }
      return {
        ...resolved,
        ReadOnly: true,
        ShareMode: resolved.ShareMode || 'Frozen',
      };
    } catch {
      return null;
    }
  }

  private resolveApiBaseUrl(): string {
    const explicit = this.ApiBaseUrl.trim().replace(/\/+$/, '');
    if (explicit) {
      return explicit;
    }

    try {
      const provider = this.ProviderToUse instanceof GraphQLDataProvider
        ? this.ProviderToUse
        : GraphQLDataProvider.Instance;
      const configData = provider?.ConfigData;
      const resolvedMjapi = ResolveMJAPIURL(configData?.MJAPIURL);
      if (resolvedMjapi) {
        return resolvedMjapi;
      }
      if (configData?.URL) {
        return new URL(configData.URL).origin;
      }
    } catch {
      // Ignore unconfigured provider errors in standalone anonymous contexts.
    }

    const injectedBase = this.publicApiBaseUrl?.trim().replace(/\/+$/, '');
    if (injectedBase) {
      return injectedBase;
    }

    const preloadedBase = AuthProviderCatalog.GetPreloadedApiBaseUrl()?.trim().replace(/\/+$/, '');
    if (preloadedBase) {
      return preloadedBase;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    return '';
  }

  private buildReadOnlyArtifactVersion(payload: PublicArtifactGuestShareResult): MJArtifactVersionEntity {
    // Use Object.create so anonymous /guest/artifact/:token loads cleanly before EntityInfo metadata is initialized.
    const entity = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    const versionNumber = payload.VersionNumber ?? 1;
    const displayName = payload.Title ?? payload.ArtifactName ?? 'Shared Artifact';
    const content = payload.Content ?? '';
    const configuration = payload.Configuration ?? '';

    Object.defineProperties(entity, {
      ID: { value: payload.VersionID ?? 'guest-snapshot-version', configurable: true, enumerable: true },
      ArtifactID: { value: '', configurable: true, enumerable: true },
      VersionNumber: { value: versionNumber, configurable: true, enumerable: true },
      ContentMode: { value: 'Text', configurable: true, enumerable: true },
      Content: { value: content, configurable: true, enumerable: true },
      Configuration: { value: configuration, configurable: true, enumerable: true },
      Name: { value: displayName, configurable: true, enumerable: true },
      Artifact: { value: payload.ArtifactName ?? displayName, configurable: true, enumerable: true },
      Comments: { value: payload.Label ?? '', configurable: true, enumerable: true },
    });

    return entity;
  }
}
