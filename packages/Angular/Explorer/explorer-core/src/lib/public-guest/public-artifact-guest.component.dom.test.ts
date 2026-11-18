import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { RenderComponentFixture, Query } from '@memberjunction/ng-test-utils';
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

function makeMockGraphQLProvider(
  resolveResult: PublicArtifactGuestShareResult | null | Error,
): GraphQLDataProvider & { ExecuteGQL: ReturnType<typeof vi.fn> } {
  const provider = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider & {
    ExecuteGQL: ReturnType<typeof vi.fn>;
  };
  provider.ExecuteGQL = vi.fn(async () => {
    if (resolveResult instanceof Error) {
      throw resolveResult;
    }
    return {
      ResolveGuestArtifactSnapshot: resolveResult,
    };
  });
  return provider;
}

async function settle(fixture: ComponentFixture<PublicArtifactGuestComponent>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
}

async function renderGuestPage(options: {
  queryParamMap?: Record<string, string>;
  provider?: IMetadataProvider;
  viewerFallbackOnly?: boolean;
}): Promise<ComponentFixture<PublicArtifactGuestComponent>> {
  const querySnapshot = {
    get: (k: string) => options.queryParamMap?.[k] ?? null,
  };
  const queryParamMapSubject = new BehaviorSubject(querySnapshot);

  const fixture = RenderComponentFixture(PublicArtifactGuestComponent, {
    declarations: [PublicArtifactGuestComponent, StubArtifactTypePluginViewerComponent],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: queryParamMapSubject.asObservable(),
          snapshot: {
            queryParamMap: querySnapshot,
          },
        },
      },
    ],
    inputs: {
      ViewerFallbackOnly: options.viewerFallbackOnly ?? false,
      ...(options.provider ? { Provider: options.provider } : {}),
    },
  });

  await settle(fixture);
  return fixture;
}

describe('PublicArtifactGuestComponent (Magic Link resource-share guest route)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
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

  it('maps EXPIRED, REVOKED, CONSUMED, ACCESS_DENIED, FROZEN_REQUIRED, and RATE_LIMITED error codes cleanly', () => {
    expect(DescribeGuestShareError('EXPIRED').title).toContain('Expired');
    expect(DescribeGuestShareError('REVOKED').title).toContain('Revoked');
    expect(DescribeGuestShareError('CONSUMED').title).toContain('Limit Reached');
    expect(DescribeGuestShareError('ACCESS_DENIED').title).toContain('Guest Session Required');
    expect(DescribeGuestShareError('FROZEN_REQUIRED').title).toContain('Frozen');
    expect(DescribeGuestShareError('RATE_LIMITED').title).toContain('Too Many');
    expect(DescribeGuestShareError('INVALID_TOKEN').title).toContain('Invalid');
  });

  it.each(['Markdown Document', 'Presentation', 'Excel Spreadsheet'] as const)(
    'resolves frozen snapshot via Magic-Link-authenticated ResolveGuestArtifactSnapshot query for %s',
    async (artifactType) => {
      const gqlProvider = makeMockGraphQLProvider(
        makeValidSharePayload({
          ArtifactTypeName: artifactType,
          Content: artifactType === 'Presentation' ? '{"slides":[]}' : 'content',
        }),
      );

      const fixture = await renderGuestPage({
        provider: gqlProvider,
      });

      expect(gqlProvider.ExecuteGQL).toHaveBeenCalledWith(
        expect.stringContaining('ResolveGuestArtifactSnapshot'),
        {},
      );
      expect(fixture.componentInstance.ErrorMessage).toBe('');
      expect(fixture.componentInstance.GuestArtifactVersion?.ID).toBe('ver-100');
      expect(fixture.componentInstance.GuestArtifactVersion?.ArtifactID).toBe('');
      const sanitizedConfig = JSON.parse(fixture.componentInstance.GuestArtifactVersion?.Configuration || '{}');
      expect(sanitizedConfig).toEqual({ theme: 'light' });

      const viewer = Query(fixture, '.stub-plugin-viewer');
      expect(viewer).not.toBeNull();
      expect(viewer?.getAttribute('data-has-provider')).toBe('false');
      expect(viewer?.getAttribute('data-artifact-id')).toBe('');
      expect(viewer?.getAttribute('data-driver-class')).toBe('MarkdownArtifactViewerPlugin');
      expect(viewer?.getAttribute('data-type')).toBe(artifactType);
      expect(viewer?.getAttribute('data-readonly')).toBe('true');
      expect(viewer?.getAttribute('data-guest-mode')).toBe('true');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Q4 Executive Strategy');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Frozen');
    },
  );

  it('renders EXPIRED banner immediately from ?mlError=expired without calling GraphQL', async () => {
    const gqlProvider = makeMockGraphQLProvider(makeValidSharePayload());

    const expiredFixture = await renderGuestPage({
      queryParamMap: { mlError: 'expired' },
      provider: gqlProvider,
    });

    expect(gqlProvider.ExecuteGQL).not.toHaveBeenCalled();
    const banner = Query(expiredFixture, '.guest-error-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Guest Share Link Expired');
    expect(Query(expiredFixture, '.stub-plugin-viewer')).toBeNull();
  });

  it('renders REVOKED banner immediately from ?mlError=revoked', async () => {
    const viaQueryFixture = await renderGuestPage({
      queryParamMap: { mlError: 'revoked' },
    });
    const viaQueryBanner = Query(viaQueryFixture, '.guest-error-banner');
    expect(viaQueryBanner?.textContent).toContain('Guest Share Link Revoked');
  });

  it('renders REVOKED banner when GraphQL ResolveGuestArtifactSnapshot returns REVOKED', async () => {
    const gqlProvider = makeMockGraphQLProvider({
      Success: false,
      Valid: false,
      ErrorCode: 'REVOKED',
      ErrorMessage: 'Owner revoked this link.',
      ShareMode: 'Frozen',
      ReadOnly: true,
    });
    const viaGqlFixture = await renderGuestPage({ provider: gqlProvider });
    const viaGqlBanner = Query(viaGqlFixture, '.guest-error-banner');
    expect(viaGqlBanner?.textContent).toContain('Guest Share Link Revoked');
    expect(viaGqlBanner?.textContent).toContain('Owner revoked this link.');
  });

  it('shows Guest Session Required banner when GraphQL returns null snapshot', async () => {
    const nullResultProvider = makeMockGraphQLProvider(null);
    const nullFixture = await renderGuestPage({ provider: nullResultProvider });
    expect(Query(nullFixture, '.guest-error-banner')?.textContent).toContain('Guest Session Required');
    expect(Query(nullFixture, '.guest-error-banner')?.textContent).toContain('Magic Link guest session');
  });

  it('shows Guest Session Required banner when GraphQL rejects with unauthorized error', async () => {
    const unauthProvider = makeMockGraphQLProvider(new Error('401 Unauthorized: invalid token'));
    const unauthFixture = await renderGuestPage({ provider: unauthProvider });
    expect(unauthFixture.componentInstance.ErrorCode).toBe('ACCESS_DENIED');
    expect(Query(unauthFixture, '.guest-error-banner')?.textContent).toContain('Guest Session Required');
  });

  it('renders sanitized fallback text when ViewerFallbackOnly is enabled', async () => {
    const gqlProvider = makeMockGraphQLProvider(
      makeValidSharePayload({
        Content: '# Frozen Markdown Snapshot',
      }),
    );

    const fixture = await renderGuestPage({
      provider: gqlProvider,
      viewerFallbackOnly: true,
    });

    const fallback = Query(fixture, '.guest-fallback-content');
    expect(fallback?.textContent).toContain('# Frozen Markdown Snapshot');
  });

  it('passes DriverClass and PreVerifiedFrozenSnapshots for safe artifact types while failing closed on unverified snapshots', async () => {
    const gqlProvider = makeMockGraphQLProvider(
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
    );

    const fixture = await renderGuestPage({
      provider: gqlProvider,
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

  it('waits on cold load until GraphQLDataProvider.Instance populates ConfigData URL & Token before resolving', async () => {
    const singletonMock = Object.create(GraphQLDataProvider.prototype) as GraphQLDataProvider & {
      ConfigData: GraphQLProviderConfigData;
      ExecuteGQL: ReturnType<typeof vi.fn>;
    };
    const initialConfig = new GraphQLProviderConfigData('', '', '', async () => '');
    Object.defineProperty(singletonMock, 'ConfigData', {
      value: initialConfig,
      writable: true,
      configurable: true,
    });
    singletonMock.ExecuteGQL = vi.fn(async () => ({
      ResolveGuestArtifactSnapshot: makeValidSharePayload({ Title: 'Delayed Cold Load Snapshot' }),
    }));
    vi.spyOn(GraphQLDataProvider, 'Instance', 'get').mockReturnValue(singletonMock);

    const fixture = await renderGuestPage({});
    // Before auth initialization finishes ConfigData.Token, ExecuteGQL must not fire prematurely
    expect(singletonMock.ExecuteGQL).not.toHaveBeenCalled();
    expect(fixture.componentInstance.IsLoading).toBe(true);

    // Simulate WorkspaceInitializer setting ConfigData URL & Bearer token asynchronously
    singletonMock.ConfigData = new GraphQLProviderConfigData(
      'ml-jwt-cold',
      'https://api.example.org/graphql',
      '',
      async () => '',
    );
    await new Promise((resolve) => setTimeout(resolve, 90));
    await settle(fixture);

    expect(singletonMock.ExecuteGQL).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.IsLoading).toBe(false);
    expect(fixture.componentInstance.ErrorMessage).toBe('');
    expect(fixture.componentInstance.DisplayTitle).toBe('Delayed Cold Load Snapshot');
  });

  it('clears mj_magic_link_token from sessionStorage when Sign In link is clicked', async () => {
    window.sessionStorage.setItem('mj_magic_link_token', 'stale-guest-jwt');
    const gqlProvider = makeMockGraphQLProvider(makeValidSharePayload());
    const fixture = await renderGuestPage({ provider: gqlProvider });

    const signInLink = Query(fixture, '.guest-signin-link') as HTMLAnchorElement | null;
    expect(signInLink).not.toBeNull();
    signInLink?.addEventListener('click', (e) => e.preventDefault());
    signInLink?.click();

    expect(window.sessionStorage.getItem('mj_magic_link_token')).toBeNull();
  });
});
