import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RunView } from '@memberjunction/core';
import { BrandKitEngine } from '@memberjunction/core-entities';
import { ArtifactPermissionService } from '@memberjunction/ng-conversations';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VideoStudioProductionsResourceComponent } from './video-studio-productions-resource.component';

function createNavigationServiceStub(): {
  QueryParamChanged$: typeof EMPTY;
  ObserveTabQueryParams: ReturnType<typeof vi.fn>;
  GetTabQueryParams: ReturnType<typeof vi.fn>;
  SetAgentContext: ReturnType<typeof vi.fn>;
  SetAgentClientTools: ReturnType<typeof vi.fn>;
  UpdateTabQueryParams: ReturnType<typeof vi.fn>;
  IsTabShowingResource: ReturnType<typeof vi.fn>;
  OpenEntityRecord: ReturnType<typeof vi.fn>;
} {
  return {
    QueryParamChanged$: EMPTY,
    ObserveTabQueryParams: vi.fn().mockReturnValue(EMPTY),
    GetTabQueryParams: vi.fn().mockReturnValue({}),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    UpdateTabQueryParams: vi.fn(),
    IsTabShowingResource: vi.fn().mockReturnValue(true),
    OpenEntityRecord: vi.fn(),
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VideoStudioProductionsResourceComponent DOM', () => {
  it('renders production cards, filters by search/status, renders empty state, syncs URL query params, calls NotifyLoadComplete once, and publishes agent context', async () => {
    const navStub = createNavigationServiceStub();
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    vi.spyOn(BrandKitEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(BrandKitEngine.Instance, 'BrandKits', 'get').mockReturnValue([
      {
        ID: 'kit-1',
        Name: 'Acme Primary Kit',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
      } as never,
    ]);

    const runViewSpy = vi.fn().mockImplementation(async (params: { EntityName: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'prod-1',
              Name: 'Q3 Revenue Recap',
              Description: 'Quarterly executive summary',
              __mj_UpdatedAt: new Date('2026-04-10T12:00:00Z'),
            },
            {
              ID: 'prod-2',
              Name: 'Product Launch Teaser',
              Description: 'Social teaser clip',
              __mj_UpdatedAt: new Date('2026-04-12T12:00:00Z'),
            },
          ],
        };
      }
      return {
        Success: true,
        Results: [
          {
            ArtifactVersionID: 'ver-1',
            ArtifactID: 'prod-1',
            Name: 'status',
            Value: 'FinalReady',
          },
          {
            ArtifactVersionID: 'ver-1',
            ArtifactID: 'prod-1',
            Name: 'brandKitID',
            Value: 'kit-1',
          },
          {
            ArtifactVersionID: 'ver-1',
            ArtifactID: 'prod-1',
            Name: 'durationSeconds',
            Value: '75',
          },
          {
            ArtifactVersionID: 'ver-2',
            ArtifactID: 'prod-2',
            Name: 'status',
            Value: 'Draft',
          },
        ],
      };
    });

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
    } as never);

    const notifySpy = vi.spyOn(
      VideoStudioProductionsResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { ParentTabId: 'tab-productions' },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(instance.AllProductions).toHaveLength(2);
    expect(instance.FilteredProductions).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid^="production-card-"]')).toHaveLength(2);
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(navStub.SetAgentContext).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        Surface: 'VideoStudioProductions',
        TotalProductionCount: 2,
        FilteredProductionCount: 2,
      }),
    );

    // Select a card and verify query param round-trip + detail pane
    await instance.SelectProduction(instance.AllProductions[0]);
    fixture.detectChanges();

    expect(navStub.UpdateTabQueryParams).toHaveBeenCalledWith(
      'tab-productions',
      { production: 'prod-1' },
      expect.any(Object),
    );
    expect(query(fixture, '[data-testid="production-detail-pane"]')).not.toBeNull();

    // Filter by search narrows grid
    instance.OnSearchChange('Teaser');
    fixture.detectChanges();
    expect(instance.FilteredProductions).toHaveLength(1);
    expect(instance.FilteredProductions[0].ID).toBe('prod-2');

    // Empty state when no items match
    instance.OnSearchChange('no-matching-production-xyz');
    fixture.detectChanges();
    expect(instance.FilteredProductions).toHaveLength(0);
    expect(query(fixture, '[data-testid="productions-empty"]')).not.toBeNull();

    // Deep-link popstate updates selection
    instance.OnSearchChange('');
    (instance as unknown as {
      OnQueryParamsChanged: (p: Record<string, string>, s: 'popstate' | 'deeplink') => void;
    }).OnQueryParamsChanged({ production: 'prod-2' }, 'popstate');
    await flushAsync();
    fixture.detectChanges();
    expect(instance.SelectedProduction?.ID).toBe('prod-2');

    fixture.destroy();
    vi.restoreAllMocks();
  });
});
