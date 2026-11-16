import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RenderComponentFixture, Query } from '@memberjunction/ng-test-utils';
import { MJ_PUBLIC_API_BASE_URL } from '@memberjunction/ng-auth-services';
import {
  BuildPreVerifiedFrozenSnapshotsMap,
  DescribeGuestShareError,
  type PreVerifiedFrozenSnapshotEntry,
  PublicArtifactGuestComponent,
  PublicArtifactGuestShareResult,
  SanitizeGuestConfigurationJson,
} from './public-artifact-guest.component';

@Component({
  standalone: false,
  selector: 'mj-artifact-type-plugin-viewer',
  template: `
    <div
      class="stub-plugin-viewer"
      [attr.data-type]="ArtifactTypeName"
      [attr.data-driver-class]="DriverClass ?? ''"
      [attr.data-readonly]="readonly ? 'true' : 'false'"
      [attr.data-version-id]="artifactVersion?.ID ?? ''"
      [attr.data-artifact-id]="artifactVersion?.ArtifactID ?? ''"
      [attr.data-has-provider]="Provider ? 'true' : 'false'"
      [attr.data-guest-mode]="GuestSnapshotMode ? 'true' : 'false'"
    ></div>
  `,
})
class StubArtifactTypePluginViewerComponent {
  @Input() public artifactVersion: MJArtifactVersionEntity | null = null;
  @Input() public ArtifactTypeName = '';
  @Input() public DriverClass?: string;
  @Input() public PreVerifiedFrozenSnapshots: Record<string, PreVerifiedFrozenSnapshotEntry> | null = null;
  @Input() public GuestSnapshotMode = false;
  @Input() public readonly = false;
  @Input() public Provider: IMetadataProvider | null = null;
  @Input() public height = '100%';
  @Output() public PluginLoaded = new EventEmitter<void>();
}

const VALID_TOKEN = 'guest_tok_abc123';

function makeValidSharePayload(overrides: Partial<PublicArtifactGuestShareResult> = {}): PublicArtifactGuestShareResult {
  return {
    Success: true,
    Valid: true,
    ArtifactID: 'art-100',
    ArtifactName: 'Q4 Strategy',
    Title: 'Q4 Executive Strategy',
    ArtifactTypeName: 'Markdown Document',
    DriverClass: 'MarkdownArtifactViewerPlugin',
    VersionID: 'ver-100',
    VersionNumber: 3,
    Content: '# Q4 Strategy\n\nAll revenue targets aligned.',
    Configuration: JSON.stringify({
      theme: 'light',
      apiKey: 'secret-should-be-stripped',
      tokenHash: 'hash-should-be-stripped',
    }),
    ExpiresAt: '2027-01-15T00:00:00.000Z',
    Label: 'Board Preview',
    ShareMode: 'Frozen',
    ReadOnly: true,
    ...overrides,
  };
}

async function settle(fixture: ComponentFixture<PublicArtifactGuestComponent>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
}

async function renderGuestPage(options: {
  paramMap?: Record<string, string>;
  queryParamMap?: Record<string, string>;
  provider?: IMetadataProvider;
  apiBaseUrl?: string;
  viewerFallbackOnly?: boolean;
}): Promise<ComponentFixture<PublicArtifactGuestComponent>> {
  const paramSnapshot = {
    get: (k: string) => options.paramMap?.[k] ?? null,
  };
  const querySnapshot = {
    get: (k: string) => options.queryParamMap?.[k] ?? null,
  };
  const paramMapSubject = new BehaviorSubject(paramSnapshot);
  const queryParamMapSubject = new BehaviorSubject(querySnapshot);

  const fixture = RenderComponentFixture(PublicArtifactGuestComponent, {
    declarations: [PublicArtifactGuestComponent, StubArtifactTypePluginViewerComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: paramMapSubject.asObservable(),
          queryParamMap: queryParamMapSubject.asObservable(),
          snapshot: {
            paramMap: paramSnapshot,
            queryParamMap: querySnapshot,
          },
        },
      },
    ],
    inputs: {
      ApiBaseUrl: options.apiBaseUrl ?? 'https://api.example.org',
      ViewerFallbackOnly: options.viewerFallbackOnly ?? false,
      ...(options.provider ? { Provider: options.provider } : {}),
    },
  });

  await settle(fixture);
  return fixture;
}

describe('PublicArtifactGuestComponent (NW-1 anonymous guest share route)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('strips residual secret keys via SanitizeGuestConfigurationJson', () => {
    const cleaned = SanitizeGuestConfigurationJson(
      JSON.stringify({
        slideTheme: 'executive',
        apiKey: 'sk-123',
        __mj_guestLinks: [{ id: '1' }],
        accessToken: 'tok-xyz',
        credentials: { user: 'x' },
      }),
    );

    expect(JSON.parse(cleaned)).toEqual({ slideTheme: 'executive' });
    expect(SanitizeGuestConfigurationJson('not-json')).toBe('');
    expect(SanitizeGuestConfigurationJson('[1,2,3]')).toBe('');
  });

  it('maps EXPIRED, REVOKED, FROZEN_REQUIRED, and RATE_LIMITED error codes cleanly', () => {
    expect(DescribeGuestShareError('EXPIRED').title).toContain('Expired');
    expect(DescribeGuestShareError('REVOKED').title).toContain('Revoked');
    expect(DescribeGuestShareError('FROZEN_REQUIRED').title).toContain('Frozen');
    expect(DescribeGuestShareError('RATE_LIMITED').title).toContain('Too Many');
    expect(DescribeGuestShareError('INVALID_TOKEN').title).toContain('Invalid');
  });

  it.each(['Markdown Document', 'Presentation', 'Excel Spreadsheet'] as const)(
    'resolves :token via pre-auth REST without OAuth and renders read-only viewer for %s',
    async (artifactType) => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () =>
          makeValidSharePayload({
            ArtifactTypeName: artifactType,
            Content: artifactType === 'Presentation' ? '{"slides":[]}' : 'content',
          }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const fixture = await renderGuestPage({
        paramMap: { token: VALID_TOKEN },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.org/guest-share/resolve',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: VALID_TOKEN }),
        }),
      );
      expect(fixture.componentInstance.ErrorMessage).toBe('');
      expect(fixture.componentInstance.GuestArtifactVersion?.ID).toBe('ver-100');
      expect(fixture.componentInstance.GuestArtifactVersion?.ArtifactID).toBe('');
      const sanitizedConfig = JSON.parse(fixture.componentInstance.GuestArtifactVersion?.Configuration || '{}');
      expect(sanitizedConfig).toEqual({ theme: 'light' });

      const viewer = Query(fixture, '.stub-plugin-viewer');
      expect(viewer?.getAttribute('data-has-provider')).toBe('false');
      expect(viewer?.getAttribute('data-artifact-id')).toBe('');
      expect(viewer?.getAttribute('data-driver-class')).toBe('MarkdownArtifactViewerPlugin');
      expect(viewer).not.toBeNull();
      expect(viewer?.getAttribute('data-type')).toBe(artifactType);
      expect(viewer?.getAttribute('data-readonly')).toBe('true');
      expect(viewer?.getAttribute('data-guest-mode')).toBe('true');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Q4 Executive Strategy');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Frozen');
    },
  );

  it('renders clear expired error banner when guest share has EXPIRED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 410,
        headers: { get: () => 'application/json' },
        json: async () => ({
          Success: false,
          Valid: false,
          ErrorCode: 'EXPIRED',
          ErrorMessage: 'This share link expired yesterday.',
          ShareMode: 'Frozen',
          ReadOnly: true,
        }),
      })),
    );

    const expiredFixture = await renderGuestPage({
      queryParamMap: { guestToken: 'expired-tok' },
    });

    const banner = Query(expiredFixture, '.guest-error-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Guest Share Link Expired');
    expect(banner?.textContent).toContain('This share link expired yesterday.');
    expect(Query(expiredFixture, '.stub-plugin-viewer')).toBeNull();
  });

  it('renders clear revoked error banner when guest share has REVOKED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        json: async () => ({
          Success: false,
          Valid: false,
          ErrorCode: 'REVOKED',
          ErrorMessage: 'Owner revoked this link.',
          ShareMode: 'Frozen',
          ReadOnly: true,
        }),
      })),
    );

    const revokedFixture = await renderGuestPage({
      paramMap: { token: 'revoked-tok' },
    });
    const revokedBanner = Query(revokedFixture, '.guest-error-banner');
    expect(revokedBanner?.textContent).toContain('Guest Share Link Revoked');
    expect(revokedBanner?.textContent).toContain('Owner revoked this link.');
  });

  it('falls back to @Public() GraphQL ResolvePublicArtifactGuestShare when REST fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network offline');
      }),
    );

    const gqlProvider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider & {
      ExecuteGQL: ReturnType<typeof vi.fn>;
    };
    gqlProvider.ExecuteGQL = vi.fn(async () => ({
      ResolvePublicArtifactGuestShare: makeValidSharePayload({
        Title: 'GraphQL Fallback Deck',
        ArtifactTypeName: 'Presentation',
      }),
    }));

    const fixture = await renderGuestPage({
      paramMap: { token: 'gql-tok-1' },
      provider: gqlProvider,
    });

    expect(gqlProvider.ExecuteGQL).toHaveBeenCalledWith(
      expect.stringContaining('ResolvePublicArtifactGuestShare'),
      { token: 'gql-tok-1' },
    );
    expect(fixture.componentInstance.ErrorMessage).toBe('');
    expect(Query(fixture, '.stub-plugin-viewer')?.getAttribute('data-type')).toBe('Presentation');
  });

  it('renders sanitized fallback text when ViewerFallbackOnly is enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () =>
          makeValidSharePayload({
            Content: '# Frozen Markdown Snapshot',
          }),
      })),
    );

    const fixture = await renderGuestPage({
      paramMap: { token: VALID_TOKEN },
      viewerFallbackOnly: true,
    });

    const fallback = Query(fixture, '.guest-fallback-content');
    expect(fallback?.textContent).toContain('# Frozen Markdown Snapshot');
  });

  it('resolves MJ_PUBLIC_API_BASE_URL for anonymous cross-origin routes when ApiBaseUrl is unset', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => makeValidSharePayload({ Title: 'Cross-Origin Guest Doc' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const paramSnapshot = { get: (k: string) => (k === 'token' ? VALID_TOKEN : null) };
    const querySnapshot = { get: () => null };
    const fixture = RenderComponentFixture(PublicArtifactGuestComponent, {
      declarations: [PublicArtifactGuestComponent, StubArtifactTypePluginViewerComponent],
      providers: [
        { provide: MJ_PUBLIC_API_BASE_URL, useValue: 'http://localhost:4115/' },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(paramSnapshot).asObservable(),
            queryParamMap: new BehaviorSubject(querySnapshot).asObservable(),
            snapshot: { paramMap: paramSnapshot, queryParamMap: querySnapshot },
          },
        },
      ],
    });
    await settle(fixture);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4115/guest-share/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: VALID_TOKEN }),
      }),
    );
    expect(fixture.componentInstance.ErrorMessage).toBe('');
    expect(fixture.componentInstance.DisplayTitle).toBe('Cross-Origin Guest Doc');
  });

  it('passes DriverClass and PreVerifiedFrozenSnapshots for arbitrary artifact types while failing closed on unverified snapshots', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () =>
          makeValidSharePayload({
            ArtifactTypeName: 'Code',
            DriverClass: 'CodeArtifactViewerPlugin',
            Title: 'SQL Migration Preview',
            FrozenProvenance: [
              {
                TargetType: 'DocumentBlock',
                TargetID: 'blk-verified',
                BlockID: 'blk-verified',
                SnapshotVerified: true,
                FrozenByUserName: 'Alice Reviewer',
                FrozenAt: '2026-11-15T12:00:00Z',
              },
              {
                TargetType: 'LiveTable',
                TargetID: 'tbl-tampered',
                LiveTableID: 'tbl-tampered',
                SnapshotVerified: false,
                FrozenByUserName: 'Mallory',
                FrozenAt: '2026-11-15T12:05:00Z',
              },
            ],
          }),
      })),
    );

    const fixture = await renderGuestPage({
      paramMap: { token: VALID_TOKEN },
    });

    const viewer = Query(fixture, '.stub-plugin-viewer');
    expect(viewer?.getAttribute('data-type')).toBe('Code');
    expect(viewer?.getAttribute('data-driver-class')).toBe('CodeArtifactViewerPlugin');
    expect(viewer?.getAttribute('data-has-provider')).toBe('false');

    const map = fixture.componentInstance.PreVerifiedFrozenSnapshots;
    expect(map?.['blk-verified']).toEqual({
      Verified: true,
      FrozenByUserName: 'Alice Reviewer',
      FrozenAt: '2026-11-15T12:00:00Z',
    });
    expect(map?.['tbl-tampered']?.Verified).toBe(false);
    expect(BuildPreVerifiedFrozenSnapshotsMap([])).toBeNull();
  });
});
