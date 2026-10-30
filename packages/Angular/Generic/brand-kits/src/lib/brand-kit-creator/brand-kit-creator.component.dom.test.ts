import { describe, it, expect, vi } from 'vitest';
import {
  renderComponentFixture,
  query,
  queryAll,
  typeInto,
  click,
} from '@memberjunction/ng-test-utils';
import { IMetadataProvider } from '@memberjunction/core';
import {
  MJBrandKitAssetEntity,
  MJBrandKitEntity,
  MJFileEntity,
} from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BrandKitCreatorComponent } from './brand-kit-creator.component';
import { SuggestColorsFromRgbaPixels } from '../logo-color-suggestions';

function makeStubBrandKitEntity(
  id = 'KIT-NEW-101',
  saveImpl?: () => Promise<boolean>,
  latestResult?: MJBrandKitEntity['LatestResult'],
): MJBrandKitEntity {
  return {
    ID: id,
    Name: '',
    CompanyID: null,
    IsDefault: false,
    Status: 'Active',
    StyleObject: null,
    GenerationPolicyObject: null,
    NeverInventObject: null,
    NewRecord: vi.fn(),
    Save: vi.fn(saveImpl ?? (async () => true)),
    LatestResult: latestResult ?? null,
  } as unknown as MJBrandKitEntity;
}

function makeStubLogoAssetEntity(id = 'ASSET-LOGO-1'): MJBrandKitAssetEntity {
  return {
    ID: id,
    BrandKitID: '',
    FileID: '',
    Name: '',
    AssetType: 'Logo',
    Usage: null,
    IsPrimary: false,
    Sequence: 1,
    IsGenerationReference: false,
    NewRecord: vi.fn(),
    Save: vi.fn(async () => true),
    LatestResult: null,
  } as unknown as MJBrandKitAssetEntity;
}

function makeFakeCreatorProvider(options: {
  kitEntity: MJBrandKitEntity;
  assetEntity?: MJBrandKitAssetEntity;
  companies?: Array<{ ID: string; Name: string }>;
}): IMetadataProvider {
  const companies = options.companies ?? [
    { ID: 'COMP-1', Name: 'Acme Association' },
    { ID: 'COMP-2', Name: 'Global Guild' },
  ];
  const assetEntity = options.assetEntity ?? makeStubLogoAssetEntity();
  const provider = Object.create(GraphQLDataProvider.prototype);
  Object.defineProperties(provider, {
    CurrentUser: { value: { ID: 'USER-1' }, configurable: true, writable: true },
    RunView: {
      value: vi.fn(async () => ({
        Success: true,
        Results: companies,
        RowCount: companies.length,
        TotalRowCount: companies.length,
        ExecutionTime: 1,
        ErrorMessage: '',
      })),
      configurable: true,
      writable: true,
    },
    RunViews: { value: vi.fn(async () => []), configurable: true, writable: true },
    GetEntityObject: {
      value: vi.fn(async (entityName: string) => {
        if (entityName === 'MJ: Brand Kit Assets') {
          return assetEntity;
        }
        return options.kitEntity;
      }),
      configurable: true,
      writable: true,
    },
    ExecuteGQL: {
      value: vi.fn(async (_q: string, vars: { fileId: string }) => ({
        CreateMediaAccessToken: {
          Success: true,
          Url: `https://cdn.example.test/logo/${vars.fileId}.png`,
          MimeType: 'image/png',
        },
      })),
      configurable: true,
      writable: true,
    },
  });
  return provider as IMetadataProvider;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('BrandKitCreatorComponent & SuggestColorsFromRgbaPixels', () => {
  it('saves a kit with the right typed Style and GenerationPolicy (AllowSyntheticPeople false), attaches logo asset, and emits Saved', async () => {
    const kitEntity = makeStubBrandKitEntity('KIT-SAVED-42');
    const logoAssetEntity = makeStubLogoAssetEntity('ASSET-LOGO-42');
    const provider = makeFakeCreatorProvider({
      kitEntity,
      assetEntity: logoAssetEntity,
    });

    const fixture = renderComponentFixture(BrandKitCreatorComponent, {
      inputs: { Provider: provider },
    });
    await flushAsync();
    fixture.detectChanges();

    // Default AllowSyntheticPeople must start false
    expect(fixture.componentInstance.AllowSyntheticPeople).toBe(false);

    typeInto(fixture, '[data-testid="bkc-name-input"]', 'Flagship Member Kit');
    typeInto(fixture, '[data-testid="bkc-heading-font-input"]', 'Space Grotesk');
    typeInto(fixture, '[data-testid="bkc-body-font-input"]', 'Plus Jakarta Sans');
    typeInto(fixture, '[data-testid="bkc-imagery-style-input"]', 'Editorial warmth');
    typeInto(fixture, '[data-testid="bkc-keep-input"]', 'Clean charts, crisp contrast');
    typeInto(fixture, '[data-testid="bkc-avoid-input"]', 'Neon glow, clutter');
    typeInto(fixture, '[data-testid="bkc-never-invent-input"]', 'Customer names');
    click(fixture, '[data-testid="bkc-never-invent-add-btn"]');
    fixture.detectChanges();

    // Simulate uploading a logo before saving
    await fixture.componentInstance.OnLogoFileUploaded({
      success: true,
      file: { ID: 'FILE-LOGO-77', Name: 'flagship-logo.png' } as unknown as MJFileEntity,
    });
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.LogoPreviewUrl).toContain('FILE-LOGO-77');
    expect(query(fixture, '[data-testid="bkc-preview-card-name"]')?.textContent?.trim()).toBe(
      'Flagship Member Kit',
    );
    expect(query(fixture, '[data-testid="bkc-preview-frame-heading"]')?.textContent?.trim()).toBe(
      'Flagship Member Kit',
    );

    const savedSpy = vi.fn();
    const moreSettingsSpy = vi.fn();
    fixture.componentInstance.Saved.subscribe(savedSpy);
    fixture.componentInstance.OpenMoreSettings.subscribe(moreSettingsSpy);

    click(fixture, '[data-testid="bkc-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    expect(kitEntity.Save).toHaveBeenCalledTimes(1);
    expect(kitEntity.Name).toBe('Flagship Member Kit');
    expect(kitEntity.CompanyID).toBeNull();
    expect(kitEntity.StyleObject).toEqual({
      Palette: [
        { Name: 'Primary', Value: '#1e3a8a' },
        { Name: 'Secondary', Value: '#0ea5e9' },
        { Name: 'Accent', Value: '#f59e0b' },
        { Name: 'Surface', Value: '#f8fafc' },
      ],
      Typography: [
        { Role: 'Headline', FontFamily: 'Space Grotesk', Weight: 700 },
        { Role: 'Body', FontFamily: 'Plus Jakarta Sans', Weight: 400 },
      ],
      ImageryStyle: 'Editorial warmth',
      Keep: ['Clean charts', 'crisp contrast'],
      Avoid: ['Neon glow', 'clutter'],
    });
    expect(kitEntity.GenerationPolicyObject).toEqual({
      AllowGeneratedImages: true,
      AllowGeneratedVideo: true,
      AllowSyntheticPeople: false,
    });
    expect(kitEntity.NeverInventObject).toEqual(['Customer names']);

    expect(logoAssetEntity.Save).toHaveBeenCalledTimes(1);
    expect(logoAssetEntity.BrandKitID).toBe('KIT-SAVED-42');
    expect(logoAssetEntity.FileID).toBe('FILE-LOGO-77');
    expect(logoAssetEntity.AssetType).toBe('Logo');
    expect(logoAssetEntity.IsPrimary).toBe(true);

    expect(savedSpy).toHaveBeenCalledWith('KIT-SAVED-42');

    // "More settings" button appears after save and emits OpenMoreSettings with the new ID
    const moreBtn = query(fixture, '[data-testid="bkc-more-settings-btn"]');
    expect(moreBtn).not.toBeNull();
    click(fixture, '[data-testid="bkc-more-settings-btn"]');
    expect(moreSettingsSpy).toHaveBeenCalledWith('KIT-SAVED-42');
  });

  it('shows the inline validation message when saving a second default in the same company scope fails', async () => {
    const duplicateDefaultMessage =
      'Only one default Brand Kit is permitted per CompanyID scope (All companies already has a default kit).';
    const failingKit = makeStubBrandKitEntity(
      'KIT-DUP-DEFAULT',
      async () => false,
      {
        Success: false,
        Message: 'Validation failed',
        CompleteMessage: duplicateDefaultMessage,
      } as unknown as MJBrandKitEntity['LatestResult'],
    );
    const provider = makeFakeCreatorProvider({ kitEntity: failingKit });

    const fixture = renderComponentFixture(BrandKitCreatorComponent, {
      inputs: { Provider: provider },
    });
    await flushAsync();
    fixture.detectChanges();

    typeInto(fixture, '[data-testid="bkc-name-input"]', 'Second Default Kit');
    const defaultCheckbox = query(
      fixture,
      '[data-testid="bkc-default-checkbox"]',
    ) as HTMLInputElement | null;
    defaultCheckbox?.click();
    fixture.detectChanges();

    const savedSpy = vi.fn();
    fixture.componentInstance.Saved.subscribe(savedSpy);

    click(fixture, '[data-testid="bkc-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    expect(failingKit.IsDefault).toBe(true);
    expect(savedSpy).not.toHaveBeenCalled();

    const errorBanner = query(fixture, '[data-testid="bkc-save-error"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner?.textContent).toContain(duplicateDefaultMessage);
  });

  it('SuggestColorsFromRgbaPixels returns <= 5 distinct hex colors for a fixture image and updates creator swatches', async () => {
    // Build a fixture RGBA buffer containing 7 distinct color regions + transparent pixels
    const regionColors: ReadonlyArray<[number, number, number, number, number]> = [
      [18, 52, 136, 255, 40], // Navy
      [14, 165, 233, 255, 35], // Sky blue
      [245, 158, 11, 255, 30], // Amber
      [16, 185, 129, 255, 25], // Emerald
      [225, 29, 72, 255, 20], // Rose
      [124, 58, 237, 255, 15], // Violet
      [248, 250, 252, 255, 10], // Light slate
      [0, 0, 0, 0, 50], // Transparent background (ignored)
    ];

    const pixels: number[] = [];
    for (const [r, g, b, a, count] of regionColors) {
      for (let i = 0; i < count; i++) {
        pixels.push(r, g, b, a);
      }
    }

    const suggested = SuggestColorsFromRgbaPixels(new Uint8ClampedArray(pixels));
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.length).toBeLessThanOrEqual(5);

    const uniqueValues = new Set(suggested.map((c) => c.Value));
    expect(uniqueValues.size).toBe(suggested.length);
    for (const swatch of suggested) {
      expect(swatch.Value).toMatch(/^#[0-9a-f]{6}$/);
      expect(swatch.Name.length).toBeGreaterThan(0);
    }

    const kitEntity = makeStubBrandKitEntity('KIT-COLORS');
    const provider = makeFakeCreatorProvider({ kitEntity });
    const fixture = renderComponentFixture(BrandKitCreatorComponent, {
      inputs: { Provider: provider },
    });
    await flushAsync();
    fixture.detectChanges();

    fixture.componentInstance.ApplySuggestedColorsFromPixels(pixels);
    fixture.detectChanges();

    const rows = queryAll(fixture, '[data-testid="bkc-swatch-row"]');
    expect(rows.length).toBe(suggested.length);
    expect(fixture.componentInstance.Palette.map((p) => p.Value)).toEqual(
      suggested.map((s) => s.Value),
    );
  });
});
