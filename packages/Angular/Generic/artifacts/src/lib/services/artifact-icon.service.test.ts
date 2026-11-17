import { describe, it, expect, vi, afterEach } from 'vitest';
import { ArtifactMetadataEngine, MJArtifactEntity } from '@memberjunction/core-entities';
import { ArtifactIconService } from './artifact-icon.service';

describe('ArtifactIconService', () => {
  const service = new ArtifactIconService();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prioritizes pluginIcon over database metadata and hardcoded fallback', () => {
    const artifact = Object.assign(Object.create(null) as MJArtifactEntity, {
      Name: 'Sales.json',
      Type: 'JSON',
    });
    expect(service.GetArtifactIcon(artifact, 'fa-solid fa-table')).toBe('fa-solid fa-table');
  });

  it('maps Pro-only metadata icons to Font Awesome 6 Free equivalents and prepends fa-solid when missing prefix', () => {
    expect(service.NormalizeMetadataIcon('fa-brackets-curly')).toBe('fa-solid fa-file-code');
    expect(service.NormalizeMetadataIcon('fa-chart-mixed')).toBe('fa-solid fa-chart-line');
    expect(service.NormalizeMetadataIcon('fa-file-excel')).toBe('fa-solid fa-file-excel');
    expect(service.NormalizeMetadataIcon('far fa-file-lines')).toBe('far fa-file-lines');
  });

  it('uses ArtifactMetadataEngine FindArtifactType when pluginIcon is omitted and falls back cleanly on name/type', () => {
    const findSpy = vi.spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType').mockReturnValue({
      Icon: 'fa-file-spreadsheet',
    } as ReturnType<ArtifactMetadataEngine['FindArtifactType']>);

    const typedArtifact = Object.assign(Object.create(null) as MJArtifactEntity, {
      Name: 'Budget',
      Type: 'Spreadsheet',
    });
    expect(service.GetArtifactIcon(typedArtifact)).toBe('fa-solid fa-file-excel');

    findSpy.mockReturnValue(undefined);
    const mdArtifact = Object.assign(Object.create(null) as MJArtifactEntity, {
      Name: 'README.md',
      Type: 'Other',
    });
    expect(service.GetArtifactIcon(mdArtifact)).toBe('fa-file-lines');
  });
});
