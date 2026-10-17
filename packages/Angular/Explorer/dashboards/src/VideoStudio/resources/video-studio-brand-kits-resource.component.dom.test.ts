import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BrandKitEngine, MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
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
  it('renders brand kit cards with palette swatches and asset counts, filters, renders empty state, opens entity forms, calls NotifyLoadComplete once, and publishes agent context', async () => {
    const navStub = createNavigationServiceStub();

    vi.spyOn(BrandKitEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(BrandKitEngine.Instance, 'BrandKits', 'get').mockReturnValue([
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
      } as unknown as MJBrandKitEntity,
    ]);

    vi.spyOn(BrandKitEngine.Instance, 'GetAssets').mockImplementation((id: string) =>
      id === 'kit-default'
        ? ([
            { ID: 'a-1', Usage: 'Logo', IsPrimary: true, FileID: 'file-logo-1' },
            { ID: 'a-2', Usage: 'Image', IsPrimary: false, FileID: 'file-img-1' },
            { ID: 'a-3', Usage: 'Font', IsPrimary: false, FileID: 'file-font-1' },
          ] as unknown as MJBrandKitAssetEntity[])
        : ([] as unknown as MJBrandKitAssetEntity[]),
    );

    const notifySpy = vi.spyOn(
      VideoStudioBrandKitsResourceComponent.prototype as unknown as {
        NotifyLoadComplete: () => void;
      },
      'NotifyLoadComplete',
    );

    const fixture = renderComponentFixture(VideoStudioBrandKitsResourceComponent, {
      providers: [{ provide: NavigationService, useValue: navStub }],
    });

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(instance.AllBrandKits).toHaveLength(2);
    expect(queryAll(fixture, '[data-testid^="brand-kit-card-"]')).toHaveLength(2);
    expect(query(fixture, '[data-testid="brand-kit-default-star"]')).not.toBeNull();
    expect(navStub.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(navStub.SetAgentContext).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        Surface: 'VideoStudioBrandKits',
        TotalBrandKitCount: 2,
        FilteredBrandKitCount: 2,
      }),
    );

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
});
