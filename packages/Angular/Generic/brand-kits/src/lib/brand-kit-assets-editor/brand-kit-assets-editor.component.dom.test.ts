import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, click } from '@memberjunction/ng-test-utils';
import { IMetadataProvider } from '@memberjunction/core';
import { MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';
import { BrandKitAssetsEditorComponent } from './brand-kit-assets-editor.component';

function makeStubBrandKit(id = 'KIT-1'): MJBrandKitEntity {
  return {
    ID: id,
    Name: 'Acme Brand Kit',
  } as unknown as MJBrandKitEntity;
}

function makeStubAsset(overrides: Partial<MJBrandKitAssetEntity> & { ID: string; Name: string; AssetType: MJBrandKitAssetEntity['AssetType'] }): MJBrandKitAssetEntity {
  return {
    BrandKitID: 'KIT-1',
    FileID: `FILE-${overrides.ID}`,
    Usage: 'Hero usage',
    IsPrimary: false,
    Sequence: 1,
    LicenseNotes: null,
    IsGenerationReference: false,
    NewRecord: vi.fn(),
    Save: vi.fn(async () => true),
    LatestResult: null,
    ...overrides,
  } as unknown as MJBrandKitAssetEntity;
}

function makeFakeProvider(
  assets: MJBrandKitAssetEntity[],
  createdEntityFactory?: () => MJBrandKitAssetEntity
): IMetadataProvider {
  const runViewFn = vi.fn(async () => ({
    Success: true,
    Results: assets,
    RowCount: assets.length,
    TotalRowCount: assets.length,
    ExecutionTime: 1,
    ErrorMessage: '',
  }));
  const executeGqlFn = vi.fn(async (_q: string, vars: { fileId: string }) => ({
    CreateMediaAccessToken: {
      Success: true,
      Url: `https://cdn.example.test/media/${vars.fileId}?token=signed`,
      MimeType: 'image/png',
    },
  }));
  return {
    CurrentUser: { ID: 'USER-1' },
    RunView: runViewFn,
    RunViews: vi.fn(async () => []),
    GetEntityObject: vi.fn(async () =>
      createdEntityFactory
        ? createdEntityFactory()
        : makeStubAsset({ ID: 'A-UPLOADED', Name: 'Uploaded Asset', AssetType: 'Image' })
    ),
    ExecuteGQL: executeGqlFn,
  } as unknown as IMetadataProvider;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('BrandKitAssetsEditorComponent (DOM)', () => {
  it('renders asset groups sorted by type and mints image thumbnail URLs', async () => {
    const assets = [
      makeStubAsset({ ID: 'A-LOGO', Name: 'Primary Logo', AssetType: 'Logo', Sequence: 1 }),
      makeStubAsset({ ID: 'A-FONT', Name: 'Inter Variable', AssetType: 'Font', Sequence: 2 }),
    ];
    const provider = makeFakeProvider(assets);
    const fixture = renderComponentFixture(BrandKitAssetsEditorComponent, {
      inputs: {
        Provider: provider,
        BrandKit: makeStubBrandKit(),
      },
    });

    await flushAsync();
    fixture.detectChanges();

    const groups = queryAll(fixture, '[data-testid="bka-asset-group"]');
    expect(groups.length).toBe(2);
    expect(groups[0].getAttribute('data-asset-type')).toBe('Logo');
    expect(groups[1].getAttribute('data-asset-type')).toBe('Font');

    const thumb = query(fixture, '[data-testid="bka-asset-thumbnail"]');
    expect(thumb).not.toBeNull();
    expect(thumb?.getAttribute('src')).toContain('FILE-A-LOGO');
  });

  it('shows IsGenerationReference toggle for visual types (Image, Screenshot, Logo, LogoMark, Video) and hides it for Font, Music, SoundEffect, Other', async () => {
    const assets = [
      makeStubAsset({ ID: 'A-IMG', Name: 'Hero Plate', AssetType: 'Image', Sequence: 1 }),
      makeStubAsset({ ID: 'A-SCR', Name: 'Dashboard Shot', AssetType: 'Screenshot', Sequence: 2 }),
      makeStubAsset({ ID: 'A-LGO', Name: 'Full Logo', AssetType: 'Logo', Sequence: 3 }),
      makeStubAsset({ ID: 'A-MRK', Name: 'Mark Icon', AssetType: 'LogoMark', Sequence: 4 }),
      makeStubAsset({ ID: 'A-VID', Name: 'Intro Loop', AssetType: 'Video', Sequence: 5 }),
      makeStubAsset({ ID: 'A-FNT', Name: 'Brand Sans', AssetType: 'Font', Sequence: 6 }),
      makeStubAsset({ ID: 'A-MUS', Name: 'Theme Bed', AssetType: 'Music', Sequence: 7 }),
      makeStubAsset({ ID: 'A-SFX', Name: 'Whoosh', AssetType: 'SoundEffect', Sequence: 8 }),
      makeStubAsset({ ID: 'A-OTH', Name: 'PDF Guide', AssetType: 'Other', Sequence: 9 }),
    ];
    const provider = makeFakeProvider(assets);
    const fixture = renderComponentFixture(BrandKitAssetsEditorComponent, {
      inputs: {
        Provider: provider,
        BrandKit: makeStubBrandKit(),
      },
    });

    await flushAsync();
    fixture.detectChanges();

    const visualIds = ['A-IMG', 'A-SCR', 'A-LGO', 'A-MRK', 'A-VID'];
    for (const id of visualIds) {
      const card = query(fixture, `[data-asset-id="${id}"]`);
      expect(card).not.toBeNull();
      expect(card?.querySelector('[data-testid="bka-asset-is-gen-ref"]')).not.toBeNull();
    }

    const nonVisualIds = ['A-FNT', 'A-MUS', 'A-SFX', 'A-OTH'];
    for (const id of nonVisualIds) {
      const card = query(fixture, `[data-asset-id="${id}"]`);
      expect(card).not.toBeNull();
      expect(card?.querySelector('[data-testid="bka-asset-is-gen-ref"]')).toBeNull();
    }
  });

  it('adds a new asset row when OnFileUploaded receives a saved file', async () => {
    const existing = [
      makeStubAsset({ ID: 'A-LOGO', Name: 'Primary Logo', AssetType: 'Logo', Sequence: 1 }),
    ];
    const createdEntity = makeStubAsset({
      ID: 'A-NEW-UPLOAD',
      Name: 'Uploaded Banner',
      AssetType: 'Image',
      Sequence: 2,
    });
    const provider = makeFakeProvider(existing, () => createdEntity);
    const fixture = renderComponentFixture(BrandKitAssetsEditorComponent, {
      inputs: {
        Provider: provider,
        BrandKit: makeStubBrandKit(),
      },
    });

    await flushAsync();
    fixture.detectChanges();

    expect(queryAll(fixture, '[data-testid="bka-asset-card"]').length).toBe(1);

    fixture.componentInstance.NewAssetType = 'Image';
    fixture.componentInstance.NewAssetName = 'Uploaded Banner';
    await fixture.componentInstance.OnFileUploaded({
      success: true,
      file: { ID: 'FILE-UPLOADED-99', Name: 'banner.png' },
    });
    await flushAsync();
    fixture.detectChanges();

    expect(createdEntity.Save).toHaveBeenCalledTimes(1);
    expect(createdEntity.FileID).toBe('FILE-UPLOADED-99');
    expect(queryAll(fixture, '[data-testid="bka-asset-card"]').length).toBe(2);
    expect(query(fixture, '[data-asset-id="A-NEW-UPLOAD"]')).not.toBeNull();
  });

  it('surfaces asset.LatestResult error when Save() returns false and emits AssetsChanged when Save() succeeds', async () => {
    const failingAsset = makeStubAsset({
      ID: 'A-FAIL',
      Name: 'Broken Asset',
      AssetType: 'Logo',
      Save: vi.fn(async () => false),
      LatestResult: {
        Success: false,
        Message: 'Short error',
        CompleteMessage: 'Validation failed: Usage exceeds length limit.',
      } as unknown as MJBrandKitAssetEntity['LatestResult'],
    });
    const provider = makeFakeProvider([failingAsset]);
    const fixture = renderComponentFixture(BrandKitAssetsEditorComponent, {
      inputs: {
        Provider: provider,
        BrandKit: makeStubBrandKit(),
      },
    });

    await flushAsync();
    fixture.detectChanges();

    const changedSpy = vi.fn();
    fixture.componentInstance.AssetsChanged.subscribe(changedSpy);

    click(fixture, '[data-testid="bka-asset-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    const errBanner = query(fixture, '[data-testid="bka-save-error"]');
    expect(errBanner).not.toBeNull();
    expect(errBanner?.textContent).toContain('Validation failed: Usage exceeds length limit.');
    expect(changedSpy).not.toHaveBeenCalled();

    // Now let Save() succeed and verify AssetsChanged emits
    (failingAsset.Save as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    click(fixture, '[data-testid="bka-asset-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="bka-save-error"]')).toBeNull();
    expect(changedSpy).toHaveBeenCalledTimes(1);
  });
});
