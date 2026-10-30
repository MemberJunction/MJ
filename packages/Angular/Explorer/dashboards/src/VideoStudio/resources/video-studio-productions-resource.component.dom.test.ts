import { By } from '@angular/platform-browser';
import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import { BrandKitEngine, MJBrandKitEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { ArtifactPermissionService } from '@memberjunction/ng-conversations';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSCopilotPanelComponent } from '../components/vs-copilot-panel.component';
import { VSStudioSlideInStateService } from '../services/vs-studio-slide-in-state.service';
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

function createGraphQLProviderStub(currentUserId: string | null = 'user-1'): IMetadataProvider {
  const provider = Object.create(GraphQLDataProvider.prototype);
  Object.defineProperty(provider, 'CurrentUser', {
    value: currentUserId ? { ID: currentUserId } : null,
    configurable: true,
    writable: true,
  });
  return provider as unknown as IMetadataProvider;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VideoStudioProductionsResourceComponent DOM', () => {
  it('joins version attributes via ArtifactVersionID -> ArtifactID (even when attributes are in reverse artifact order or an artifact has no attributes), maps VideoProductionStatus badges, populates status filter options from data, and uses BrandKitEngine.GetProviderInstance', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    const fakeBrandKitEngine = {
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [
        {
          ID: 'kit-1',
          Name: 'Acme Primary Kit',
          CompanyID: 'comp-1',
          Company: 'Acme Corp',
        } as unknown as MJBrandKitEntity,
        {
          ID: 'kit-2',
          Name: 'Beta Launch Kit',
          CompanyID: 'comp-2',
          Company: 'Beta Inc',
        } as unknown as MJBrandKitEntity,
      ],
    } as unknown as BrandKitEngine;
    const getProviderInstanceSpy = vi
      .spyOn(BrandKitEngine, 'GetProviderInstance')
      .mockReturnValue(fakeBrandKitEngine);

    const runViewSpy = vi.fn().mockImplementation(async (params: { EntityName: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'prod-1',
              Name: 'Q3 Revenue Recap',
              Description: 'Quarterly executive summary',
              __mj_UpdatedAt: new Date('2026-04-14T12:00:00Z'),
            },
            {
              ID: 'prod-2',
              Name: 'Product Launch Teaser',
              Description: 'Social teaser clip',
              __mj_UpdatedAt: new Date('2026-04-12T12:00:00Z'),
            },
            {
              ID: 'prod-3',
              Name: 'Unattributed Concept',
              Description: 'Artifact with no version attributes yet',
              __mj_UpdatedAt: new Date('2026-04-10T12:00:00Z'),
            },
          ],
        };
      }
      return { Success: true, Results: [] };
    });

    // Note: attribute rows intentionally omit ArtifactID and are returned in reverse artifact order
    // (ver-2 for prod-2 first, then ver-1 for prod-1; prod-3 has no version/attributes at all).
    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [
          { ID: 'ver-2', ArtifactID: 'prod-2', VersionNumber: 4 },
          { ID: 'ver-1', ArtifactID: 'prod-1', VersionNumber: 2 },
        ],
      },
      {
        Success: true,
        Results: [
          { ArtifactVersionID: 'ver-2', Name: 'status', Value: 'Blocked' },
          { ArtifactVersionID: 'ver-2', Name: 'brandKitID', Value: 'kit-2' },
          { ArtifactVersionID: 'ver-1', Name: 'status', Value: 'Delivered' },
          { ArtifactVersionID: 'ver-1', Name: 'brandKitID', Value: 'kit-1' },
          { ArtifactVersionID: 'ver-1', Name: 'durationSeconds', Value: '75' },
        ],
      },
      {
        Success: true,
        Results: [
          { ID: 'comp-1', Name: 'Acme Corp' },
          { ID: 'comp-2', Name: 'Beta Inc' },
        ],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const notifySpy = vi.spyOn(
      VideoStudioProductionsResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { ParentTabId: 'tab-productions', Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(getProviderInstanceSpy).toHaveBeenCalledWith(customProvider, BrandKitEngine);
    expect(instance.AllProductions).toHaveLength(3);

    // Verify each card received its own attributes via ArtifactVersionID -> ArtifactID join
    const prod1 = instance.AllProductions.find((p) => p.ID === 'prod-1')!;
    const prod2 = instance.AllProductions.find((p) => p.ID === 'prod-2')!;
    const prod3 = instance.AllProductions.find((p) => p.ID === 'prod-3')!;

    expect(prod1.Status).toBe('Delivered');
    expect(prod1.BrandKitID).toBe('kit-1');
    expect(prod1.BrandKitName).toBe('Acme Primary Kit');
    expect(prod1.VersionNumber).toBe(2);

    expect(prod2.Status).toBe('Blocked');
    expect(prod2.BrandKitID).toBe('kit-2');
    expect(prod2.BrandKitName).toBe('Beta Launch Kit');
    expect(prod2.VersionNumber).toBe(4);

    // Artifact without version/attributes gets 'Unknown' status and does not steal another artifact's attributes
    expect(prod3.Status).toBe('Unknown');
    expect(prod3.BrandKitID).toBeNull();
    expect(prod3.VersionNumber).toBe(0);

    // Verify DOM badge classes for Delivered, Blocked, and Unknown
    const card1Badge = query(fixture, '[data-testid="production-card-prod-1"] .mj-badge');
    const card2Badge = query(fixture, '[data-testid="production-card-prod-2"] .mj-badge');
    const card3Badge = query(fixture, '[data-testid="production-card-prod-3"] .mj-badge');
    expect(card1Badge?.classList.contains('mj-badge-success')).toBe(true);
    expect(card2Badge?.classList.contains('mj-badge-error')).toBe(true);
    expect(card3Badge?.classList.contains('mj-badge-neutral')).toBe(true);

    // Status filter dropdown options list only statuses actually present in AllProductions
    const statusField = instance.FilterFields.find((f) => f.key === 'status');
    expect(statusField?.options?.map((o) => o.value)).toEqual(['Blocked', 'Delivered', 'Unknown']);

    // Filtering by BrandKitID returns the right card
    instance.OnFilterValuesChange({
      archetype: null,
      status: null,
      brandKitId: 'kit-2',
      companyId: null,
    });
    fixture.detectChanges();
    expect(instance.FilteredProductions.map((p) => p.ID)).toEqual(['prod-2']);
    instance.ClearAllFilters();
    fixture.detectChanges();

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

  it('resolves a production CompanyName from its own companyID via MJ: Companies rather than its brand kit company', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    const fakeBrandKitEngine = {
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [
        {
          ID: 'kit-1',
          Name: 'Shared Corporate Kit',
          CompanyID: 'comp-1',
          Company: 'Acme Corp',
        } as unknown as MJBrandKitEntity,
      ],
    } as unknown as BrandKitEngine;
    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue(fakeBrandKitEngine);

    const runViewSpy = vi.fn().mockResolvedValue({
      Success: true,
      Results: [
        {
          ID: 'prod-cross-company',
          Name: 'Beta Subsidiary Overview',
          Description: 'Subsidiary launch clip',
          __mj_UpdatedAt: new Date('2026-04-14T12:00:00Z'),
        },
      ],
    });

    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [{ ID: 'ver-cross', ArtifactID: 'prod-cross-company', VersionNumber: 1 }],
      },
      {
        Success: true,
        Results: [
          { ArtifactVersionID: 'ver-cross', Name: 'status', Value: 'Delivered' },
          { ArtifactVersionID: 'ver-cross', Name: 'brandKitID', Value: 'kit-1' },
          { ArtifactVersionID: 'ver-cross', Name: 'companyID', Value: 'comp-2' },
        ],
      },
      {
        Success: true,
        Results: [
          { ID: 'comp-1', Name: 'Acme Corp' },
          { ID: 'comp-2', Name: 'Beta Inc' },
        ],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.AllProductions).toHaveLength(1);
    const prod = instance.AllProductions[0];
    expect(prod.CompanyID).toBe('comp-2');
    expect(prod.CompanyName).toBe('Beta Inc');

    const companyField = instance.FilterFields.find((f) => f.key === 'companyId');
    const comp2Option = companyField?.options?.find((o) => o.value === 'comp-2');
    expect(comp2Option?.text).toBe('Beta Inc');

    instance.OnSearchChange('Acme');
    fixture.detectChanges();
    expect(instance.FilteredProductions).toEqual([]);

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('surfaces LoadError in productions-error when the attributes RunViews query returns Success: false', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn(),
    };

    const fakeBrandKitEngine = {
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [],
    } as unknown as BrandKitEngine;
    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue(fakeBrandKitEngine);

    const runViewSpy = vi.fn().mockResolvedValue({
      Success: true,
      Results: [
        {
          ID: 'prod-1',
          Name: 'Q3 Revenue Recap',
          Description: 'Summary',
          __mj_UpdatedAt: new Date('2026-04-14T12:00:00Z'),
        },
      ],
    });

    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [{ ID: 'ver-1', ArtifactID: 'prod-1', VersionNumber: 1 }],
      },
      {
        Success: false,
        ErrorMessage: 'Attribute query timed out',
        Results: [],
      },
      {
        Success: true,
        Results: [],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.AllProductions).toEqual([]);
    expect(instance.LoadError).toContain("Couldn't load production details: Attribute query timed out");
    const errorEl = query(fixture, '[data-testid="productions-error"]');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain("Couldn't load production details: Attribute query timed out");

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('fails closed when CurrentUser.ID is missing without running an unfiltered artifacts query', async () => {
    const navStub = createNavigationServiceStub();
    const providerWithoutUser = createGraphQLProviderStub(null);
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn(),
      GetUserPermissions: vi.fn(),
    };

    const runViewSpy = vi.fn();
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: vi.fn(),
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: providerWithoutUser },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.AllProductions).toEqual([]);
    expect(instance.LoadError).toContain('no current user context');
    expect(runViewSpy).not.toHaveBeenCalled();
    expect(query(fixture, '[data-testid="productions-error"]')).not.toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('enables Iterate when a conversation is linked via MJ: Conversation Detail Artifacts -> MJ: Conversation Details and binds ConversationId, PendingArtifactId, and PendingArtifactVersionNumber on vs-copilot-panel', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [],
    } as unknown as BrandKitEngine);

    const runViewSpy = vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'prod-iter-1',
              Name: 'Launch Video v3',
              Description: 'Created in Studio',
              __mj_UpdatedAt: new Date('2026-04-15T12:00:00Z'),
            },
          ],
        };
      }
      if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
        return {
          Success: true,
          Results: [{ ConversationDetailID: 'cd-999' }],
        };
      }
      if (params.EntityName === 'MJ: Conversation Details') {
        return {
          Success: true,
          Results: [{ ConversationID: 'conv-777' }],
        };
      }
      return { Success: true, Results: [] };
    });

    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [{ ID: 'ver-iter-1', ArtifactID: 'prod-iter-1', VersionNumber: 3 }],
      },
      {
        Success: true,
        Results: [{ ArtifactVersionID: 'ver-iter-1', Name: 'status', Value: 'Reviewed' }],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
        { provide: VSStudioSlideInStateService, useFactory: () => new VSStudioSlideInStateService() },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    expect(query(fixture, '.vs-resource-shell > vs-studio-slide-in')).not.toBeNull();

    const card = query(fixture, '[data-testid^="production-card-"]');
    expect(card).not.toBeNull();
    card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();
    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.SelectedProductionConversationId).toBe('conv-777');
    expect(instance.IsIterateFocusMode).toBe(false);
    expect(query(fixture, '[data-testid="productions-grid"]')).not.toBeNull();

    const iterateBtn = query(fixture, '[data-testid="production-iterate-button"]');
    expect(iterateBtn).not.toBeNull();
    expect(iterateBtn!.hasAttribute('disabled')).toBe(false);

    iterateBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(instance.IsCopilotSlideInOpen).toBe(true);
    expect(instance.IsIterateFocusMode).toBe(true);
    expect(query(fixture, '[data-testid="productions-grid"]')).toBeNull();
    expect(instance.SlideInConversationId).toBe('conv-777');
    expect(instance.SlideInPendingArtifactId).toBe('prod-iter-1');
    expect(instance.SlideInPendingArtifactVersionNumber).toBe(3);
    expect(query(fixture, '[data-testid="production-iterate-copilot"]')).toBeNull();
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).not.toBeNull();

    // Clicking "All productions" in the viewer toolbar restores the grid while keeping the viewer and slide-in open
    const allProdsBtn = query(fixture, '[data-testid="production-all-productions-button"]');
    expect(allProdsBtn).not.toBeNull();
    allProdsBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(instance.IsIterateFocusMode).toBe(false);
    expect(query(fixture, '[data-testid="productions-grid"]')).not.toBeNull();

    const copilotDebug = fixture.debugElement.query(By.directive(VSCopilotPanelComponent));
    expect(copilotDebug).not.toBeNull();
    const copilotInstance = copilotDebug.componentInstance as VSCopilotPanelComponent;
    expect(copilotInstance.ConversationId).toBe('conv-777');
    expect(copilotInstance.PendingArtifactId).toBe('prod-iter-1');
    expect(copilotInstance.PendingArtifactVersionNumber).toBe(3);

    // Clicking "New production" clears SlideInConversationId to null in the same slide-in and never changes its label
    const newProdBtn = query(fixture, '[data-testid="productions-open-copilot-button"]');
    expect(newProdBtn?.textContent?.trim()).toBe('New production');
    newProdBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(newProdBtn?.textContent?.trim()).toBe('New production');
    expect(instance.IsCopilotSlideInOpen).toBe(true);
    expect(instance.SlideInConversationId).toBeNull();
    expect(instance.SlideInPendingArtifactId).toBeNull();
    expect(copilotInstance.ConversationId).toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('ignores stale SelectProduction async completions when the user clicks a second production card before the first resolves', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [],
    } as unknown as BrandKitEngine);

    let resolveFirstDetailArtifact!: (value: {
      Success: boolean;
      Results: Array<{ ConversationDetailID?: string }>;
    }) => void;

    const runViewSpy = vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'prod-a',
              Name: 'Production A',
              Description: 'First card',
              __mj_UpdatedAt: new Date('2026-04-15T12:00:00Z'),
            },
            {
              ID: 'prod-b',
              Name: 'Production B',
              Description: 'Second card',
              __mj_UpdatedAt: new Date('2026-04-14T12:00:00Z'),
            },
          ],
        };
      }
      if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
        if (params.ExtraFilter?.includes('prod-a')) {
          return new Promise((resolve) => {
            resolveFirstDetailArtifact = resolve;
          });
        }
        return {
          Success: true,
          Results: [{ ConversationDetailID: 'cd-b' }],
        };
      }
      if (params.EntityName === 'MJ: Conversation Details') {
        if (params.ExtraFilter?.includes('cd-a')) {
          return {
            Success: true,
            Results: [{ ConversationID: 'conv-a-stale' }],
          };
        }
        return {
          Success: true,
          Results: [{ ConversationID: 'conv-b-active' }],
        };
      }
      return { Success: true, Results: [] };
    });

    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [
          { ID: 'ver-a', ArtifactID: 'prod-a', VersionNumber: 1 },
          { ID: 'ver-b', ArtifactID: 'prod-b', VersionNumber: 2 },
        ],
      },
      {
        Success: true,
        Results: [],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    const prodA = instance.AllProductions.find((p) => p.ID === 'prod-a')!;
    const prodB = instance.AllProductions.find((p) => p.ID === 'prod-b')!;

    // Trigger selection of A (slow) then let GetUserPermissions resolve so A is parked inside resolveProductionConversationId
    const selectAPromise = instance.SelectProduction(prodA);
    await Promise.resolve();
    const selectBPromise = instance.SelectProduction(prodB);

    await selectBPromise;
    expect(instance.SelectedProduction?.ID).toBe('prod-b');
    expect(instance.SelectedProductionConversationId).toBe('conv-b-active');

    // Now let A's delayed RunView resolve after B has already settled
    resolveFirstDetailArtifact({
      Success: true,
      Results: [{ ConversationDetailID: 'cd-a' }],
    });
    await selectAPromise;
    await flushAsync();
    fixture.detectChanges();

    expect(instance.SelectedProduction?.ID).toBe('prod-b');
    expect(instance.SelectedProductionConversationId).toBe('conv-b-active');

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('disables Iterate with tooltip when production was made outside a conversation', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [],
    } as unknown as BrandKitEngine);

    const runViewSpy = vi.fn().mockImplementation(async (params: { EntityName: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [
            {
              ID: 'prod-standalone',
              Name: 'Imported Production',
              Description: 'No conversation link',
              __mj_UpdatedAt: new Date('2026-04-15T12:00:00Z'),
            },
          ],
        };
      }
      return { Success: true, Results: [] };
    });

    const runViewsSpy = vi.fn().mockResolvedValue([
      {
        Success: true,
        Results: [{ ID: 'ver-standalone', ArtifactID: 'prod-standalone', VersionNumber: 1 }],
      },
      {
        Success: true,
        Results: [],
      },
    ]);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: runViewSpy,
      RunViews: runViewsSpy,
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
        { provide: VSStudioSlideInStateService, useFactory: () => new VSStudioSlideInStateService() },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const card = query(fixture, '[data-testid^="production-card-"]');
    expect(card).not.toBeNull();
    card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsync();
    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.SelectedProductionConversationId).toBeNull();

    const iterateBtn = query(fixture, '[data-testid="production-iterate-button"]');
    expect(iterateBtn).not.toBeNull();
    expect(iterateBtn!.hasAttribute('disabled')).toBe(true);
    expect(iterateBtn!.getAttribute('title')).toBe('Made outside a conversation. Start a new production in Video Studio.');

    iterateBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(instance.IsCopilotSlideInOpen).toBe(false);
    expect(query(fixture, '[data-testid="production-iterate-copilot"]')).toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('opens the single right slide-in with New production (keeping its label unchanged) and registers the 4 Studio brief client tools that update brief state', async () => {
    const navStub = createNavigationServiceStub();
    const customProvider = createGraphQLProviderStub('user-1');
    const permStub = {
      Provider: null,
      GetReadableArtifactsFilter: vi.fn().mockResolvedValue("UserID = 'user-1'"),
      GetUserPermissions: vi.fn().mockResolvedValue({
        canRead: true,
        canEdit: true,
        canShare: true,
      }),
    };

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: [],
    } as unknown as BrandKitEngine);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
      RunViews: vi.fn().mockResolvedValue([]),
    } as unknown as RunView);

    const fixture = renderComponentFixture(VideoStudioProductionsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: ArtifactPermissionService, useValue: permStub },
        { provide: VSStudioSlideInStateService, useFactory: () => new VSStudioSlideInStateService() },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(instance.IsCopilotSlideInOpen).toBe(false);
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).toBeNull();
    expect(query(fixture, '[data-testid="productions-copilot-strip"]')).not.toBeNull();

    const openBtn = query(fixture, '[data-testid="productions-open-copilot-button"]');
    expect(openBtn).not.toBeNull();
    expect(openBtn!.textContent?.trim()).toBe('New production');
    openBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(instance.IsCopilotSlideInOpen).toBe(true);
    expect(openBtn!.textContent?.trim()).toBe('New production');
    const slideIn = query(fixture, '[data-testid="productions-copilot-slidein"]');
    expect(slideIn).not.toBeNull();
    expect(query(fixture, '[data-testid="copilot-audio-options"]')).toBeNull();

    // Verify the 4 Studio brief client tools are registered on Productions
    expect(navStub.SetAgentClientTools).toHaveBeenCalled();
    const registeredTools = navStub.SetAgentClientTools.mock.calls.at(-1)?.[1] as Array<{
      Name: string;
      Handler: (params: Record<string, unknown>) => Promise<{ Success: boolean; Message?: string; Data?: unknown }>;
    }>;
    const toolNames = registeredTools.map((t) => t.Name);
    expect(toolNames).toContain('SelectStudioArchetype');
    expect(toolNames).toContain('SelectStudioBrandKit');
    expect(toolNames).toContain('SetStudioFormats');
    expect(toolNames).toContain('SetStudioTopic');

    const setTopicTool = registeredTools.find((t) => t.Name === 'SetStudioTopic')!;
    const topicResult = await setTopicTool.Handler({ topic: 'Q4 board highlights' });
    expect(topicResult.Success).toBe(true);

    const setFormatsTool = registeredTools.find((t) => t.Name === 'SetStudioFormats')!;
    const formatsResult = await setFormatsTool.Handler({ formats: ['16:9', '4:5'] });
    expect(formatsResult.Success).toBe(true);
    expect((instance.CopilotAppContext['VideoStudio'] as Record<string, unknown>)['Formats']).toEqual([
      '16:9',
      '4:5',
    ]);

    fixture.destroy();
    vi.restoreAllMocks();
  });
});


