import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { BrandKitEngine, MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';
import {
  GraphQLDataProvider,
  GraphQLFileStorageClient,
} from '@memberjunction/graphql-dataprovider';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import { VSStudioSlideInStateService } from '../services/vs-studio-slide-in-state.service';
import { VideoStudioBrandKitsResourceComponent } from './video-studio-brand-kits-resource.component';

function createNavigationServiceStub(): {
  QueryParamChanged$: typeof EMPTY;
  SetAgentContext: ReturnType<typeof vi.fn>;
  SetAgentClientTools: ReturnType<typeof vi.fn>;
  OpenEntityRecord: ReturnType<typeof vi.fn>;
  OpenNewEntityRecord: ReturnType<typeof vi.fn>;
} {
  return {
    QueryParamChanged$: EMPTY,
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
    OpenEntityRecord: vi.fn(),
    OpenNewEntityRecord: vi.fn(),
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VideoStudioBrandKitsResourceComponent DOM', () => {
  it('renders brand kit cards with AssetType logo thumbnails, palette swatches, and asset counts, filters, deletes kits after child assets, calls NotifyLoadComplete once, publishes SuppressChatOverlay agent context, and mounts the shared slide-in with brief client tools', async () => {
    const navStub = createNavigationServiceStub();
    const confirmStub = {
      ConfirmDelete: vi.fn().mockResolvedValue(true),
    };
    const customProvider = Object.create(GraphQLDataProvider.prototype) as IMetadataProvider;

    const callOrder: string[] = [];
    const defaultKitDelete = vi.fn().mockImplementation(async () => {
      callOrder.push('kit-default');
      return true;
    });

    const kits: MJBrandKitEntity[] = [
      {
        ID: 'kit-default',
        Name: 'MJ Default Brand Kit',
        Description: 'Default workspace styling',
        CompanyID: null,
        Company: null,
        IsDefault: true,
        Status: 'Active',
        StyleObject: {
          Palette: [
            { Name: 'Primary', Value: 'rgb(37, 99, 235)' },
            { Name: 'Accent', Value: 'rgb(16, 185, 129)' },
          ],
          Typography: [],
        },
        Delete: defaultKitDelete,
        LatestResult: null,
      } as unknown as MJBrandKitEntity,
      {
        ID: 'kit-acme',
        Name: 'Acme Brand Kit',
        Description: 'Acme Corp brand styling',
        CompanyID: 'comp-1',
        Company: 'Acme Corp',
        IsDefault: false,
        Status: 'Inactive',
        StyleObject: {
          Palette: [{ Name: 'Brand', Value: 'rgb(220, 38, 38)' }],
          Typography: [],
        },
        Delete: vi.fn().mockResolvedValue(true),
        LatestResult: null,
      } as unknown as MJBrandKitEntity,
    ];

    const engineStub = {
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: kits,
      GetAssets: vi.fn().mockImplementation((id: string) =>
        id === 'kit-default'
          ? ([
              {
                ID: 'a-1',
                AssetType: 'Logo',
                Usage: 'Primary header dark background',
                IsPrimary: true,
                Sequence: 10,
                FileID: 'file-logo-1',
                Delete: vi.fn().mockImplementation(async () => {
                  callOrder.push('a-1');
                  return true;
                }),
                LatestResult: null,
              },
              {
                ID: 'a-2',
                AssetType: 'Image',
                Usage: 'Hero background',
                IsPrimary: false,
                Sequence: 20,
                FileID: 'file-img-1',
                Delete: vi.fn().mockImplementation(async () => {
                  callOrder.push('a-2');
                  return true;
                }),
                LatestResult: null,
              },
            ] as unknown as MJBrandKitAssetEntity[])
          : ([
              {
                ID: 'a-3',
                AssetType: 'LogoMark',
                Usage: 'Compact icon',
                IsPrimary: false,
                Sequence: 5,
                FileID: 'file-logomark-acme',
              },
              {
                ID: 'a-4',
                AssetType: 'Logo',
                Usage: 'Secondary mark',
                IsPrimary: false,
                Sequence: 15,
                FileID: 'file-logo-acme-secondary',
              },
            ] as unknown as MJBrandKitAssetEntity[]),
      ),
    } as unknown as BrandKitEngine;

    const getProviderInstanceSpy = vi
      .spyOn(BrandKitEngine, 'GetProviderInstance')
      .mockReturnValue(engineStub);

    Object.defineProperties(customProvider, {
      CurrentUser: { value: { ID: 'user-1' }, configurable: true, writable: true },
      RunView: {
        value: vi.fn(async () => ({
          Success: true,
          Results: engineStub.GetAssets('kit-default'),
          RowCount: 2,
          TotalRowCount: 2,
          ExecutionTime: 1,
          ErrorMessage: '',
        })),
        configurable: true,
        writable: true,
      },
    });

    vi.spyOn(
      GraphQLFileStorageClient.prototype,
      'CreateMediaAccessToken',
    ).mockImplementation(async (fileId: string) => ({
      Success: true,
      Url: `https://cdn.example/${fileId}.png`,
      ExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      ErrorMessage: undefined,
    }));

    const notifySpy = vi.spyOn(
      VideoStudioBrandKitsResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioBrandKitsResourceComponent, {
      imports: [MJButtonDirective],
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: MJConfirmService, useValue: confirmStub },
        { provide: VSStudioSlideInStateService, useFactory: () => new VSStudioSlideInStateService() },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(getProviderInstanceSpy).toHaveBeenCalledWith(customProvider, BrandKitEngine);
    expect(instance.AllBrandKits).toHaveLength(2);
    expect(instance.AllBrandKits[0].PrimaryLogoFileID).toBe('file-logo-1');
    expect(instance.AllBrandKits[0].PrimaryLogoUrl).toBe('https://cdn.example/file-logo-1.png');
    // Tie-break by lowest Sequence when IsPrimary is false on all logo assets
    expect(instance.AllBrandKits[1].PrimaryLogoFileID).toBe('file-logomark-acme');

    const logoImgs = queryAll(fixture, 'img.vs-brand-kit-logo-img') as HTMLImageElement[];
    expect(logoImgs.length).toBeGreaterThanOrEqual(1);
    expect(logoImgs[0].getAttribute('src')).toBe('https://cdn.example/file-logo-1.png');

    expect(queryAll(fixture, '[data-testid^="brand-kit-card-"]')).toHaveLength(2);
    const defaultStar = query(fixture, '[data-testid="brand-kit-default-star"]') as HTMLElement | null;
    expect(defaultStar).not.toBeNull();
    expect(defaultStar!.classList.contains('mj-badge')).toBe(true);
    expect(defaultStar!.classList.contains('mj-badge-neutral')).toBe(true);
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const registeredTools = navStub.SetAgentClientTools.mock.calls.at(-1)?.[1] as Array<{ Name: string }>;
    const toolNames = registeredTools.map((t) => t.Name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        'SearchBrandKits',
        'FilterBrandKits',
        'ClearBrandKitFilters',
        'OpenBrandKit',
        'RefreshBrandKits',
        'SelectStudioArchetype',
        'SelectStudioBrandKit',
        'SetStudioFormats',
        'SetStudioTopic',
      ]),
    );
    expect(navStub.SetAgentContext).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        Surface: 'VideoStudioBrandKits',
        SuppressChatOverlay: true,
        TotalBrandKitCount: 2,
        FilteredBrandKitCount: 2,
      }),
    );

    // Shared slide-in sits beside mj-page-layout inside .vs-resource-shell; edge strip opens it
    expect(query(fixture, '.vs-resource-shell > vs-studio-slide-in')).not.toBeNull();
    expect(instance.IsCopilotSlideInOpen).toBe(false);
    const stripBtn = query(fixture, '[data-testid="productions-copilot-strip"]') as HTMLElement | null;
    expect(stripBtn).not.toBeNull();
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).toBeNull();

    stripBtn!.click();
    fixture.detectChanges();
    expect(instance.IsCopilotSlideInOpen).toBe(true);
    expect(query(fixture, '[data-testid="productions-copilot-slidein"]')).not.toBeNull();
    expect(queryAll(fixture, 'vs-copilot-panel')).toHaveLength(1);

    // Pressing Enter on the Delete button does NOT bubble to the card and call OpenEntityRecord
    const deleteBtn = query(fixture, '[data-testid="brand-kit-delete-kit-default"]') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn!.getAttribute('aria-label')).toBe('Delete MJ Default Brand Kit');
    expect(deleteBtn!.classList.contains('mj-btn--icon')).toBe(true);
    deleteBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(navStub.OpenEntityRecord).not.toHaveBeenCalled();

    // Click Delete button on default kit card — deletes child assets first, then kit
    deleteBtn!.click();
    await flushAsync();
    fixture.detectChanges();
    expect(confirmStub.ConfirmDelete).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['a-1', 'a-2', 'kit-default']);

    // Click New Brand Kit button
    const newBtn = query(fixture, '[data-testid="new-brand-kit-button"]') as HTMLElement | null;
    expect(newBtn).not.toBeNull();
    newBtn!.click();
    expect(navStub.OpenNewEntityRecord).toHaveBeenCalledWith('MJ: Brand Kits');

    // Click a brand kit card
    const firstCard = query(fixture, '[data-testid="brand-kit-card-kit-default"]') as HTMLElement | null;
    firstCard!.click();
    expect(navStub.OpenEntityRecord).toHaveBeenCalledWith(
      'MJ: Brand Kits',
      expect.anything(),
    );

    // Filter by status narrows grid
    instance.OnFilterValuesChange({ status: 'Inactive', companyId: null });
    fixture.detectChanges();
    expect(instance.FilteredBrandKits).toHaveLength(1);
    expect(instance.FilteredBrandKits[0].ID).toBe('kit-acme');

    // Empty state when no brand kits match
    instance.OnSearchChange('nonexistent-kit-xyz');
    fixture.detectChanges();
    expect(instance.FilteredBrandKits).toHaveLength(0);
    expect(query(fixture, '[data-testid="brand-kits-empty"]')).not.toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('shows a delete error banner and keeps cards rendered when DeleteBrandKitWithAssets fails', async () => {
    const navStub = createNavigationServiceStub();
    const confirmStub = {
      ConfirmDelete: vi.fn().mockResolvedValue(true),
    };
    const customProvider = Object.create(GraphQLDataProvider.prototype) as IMetadataProvider;

    const kits: MJBrandKitEntity[] = [
      {
        ID: 'kit-default',
        Name: 'MJ Default Brand Kit',
        Description: 'Default workspace styling',
        CompanyID: null,
        Company: null,
        IsDefault: true,
        Status: 'Active',
        StyleObject: { Palette: [], Typography: [] },
        Delete: vi.fn().mockResolvedValue(true),
        LatestResult: null,
      } as unknown as MJBrandKitEntity,
    ];

    const engineStub = {
      Config: vi.fn().mockResolvedValue(undefined),
      BrandKits: kits,
      GetAssets: vi.fn().mockReturnValue([]),
    } as unknown as BrandKitEngine;

    vi.spyOn(BrandKitEngine, 'GetProviderInstance').mockReturnValue(engineStub);

    Object.defineProperties(customProvider, {
      CurrentUser: { value: { ID: 'user-1' }, configurable: true, writable: true },
      RunView: {
        value: vi.fn(async () => ({
          Success: true,
          Results: [
            {
              ID: 'a-locked',
              AssetType: 'Logo',
              Delete: vi.fn().mockResolvedValue(false),
              LatestResult: { CompleteMessage: 'Asset in use by production' },
            },
          ],
          RowCount: 1,
          TotalRowCount: 1,
          ExecutionTime: 1,
          ErrorMessage: '',
        })),
        configurable: true,
        writable: true,
      },
    });

    const fixture = renderComponentFixture(VideoStudioBrandKitsResourceComponent, {
      inputs: { Provider: customProvider },
      providers: [
        { provide: NavigationService, useValue: navStub },
        { provide: MJConfirmService, useValue: confirmStub },
      ],
    });

    await flushAsync();
    fixture.detectChanges();

    const deleteBtn = query(fixture, '[data-testid="brand-kit-delete-kit-default"]') as HTMLElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.LoadError).toBeNull();
    expect(fixture.componentInstance.DeleteError).toContain('Asset in use by production');
    const errorBanner = query(fixture, '[data-testid="brand-kits-delete-error"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner?.textContent).toContain('Asset in use by production');
    expect(queryAll(fixture, '[data-testid^="brand-kit-card-"]')).toHaveLength(1);
    expect(query(fixture, '[data-testid="brand-kits-error"]')).toBeNull();

    fixture.destroy();
    vi.restoreAllMocks();
  });
});
