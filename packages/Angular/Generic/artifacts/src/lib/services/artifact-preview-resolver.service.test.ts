import { describe, it, expect, vi, afterEach } from 'vitest';
import { Type } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import { ArtifactPreviewResolverService } from './artifact-preview-resolver.service';
import type { IArtifactPreviewComponent } from '../interfaces/artifact-viewer-plugin.interface';

describe('ArtifactPreviewResolverService', () => {
  const resolver = new ArtifactPreviewResolverService();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when neither artifactTypeName nor contentType is provided', () => {
    expect(resolver.ResolvePreviewComponent(null, undefined)).toBeNull();
  });

  it('picks the highest priority matching registration (breaking ties toward later registration)', () => {
    class PreviewLow {}
    class PreviewHigh {}
    class PreviewTieLater {}

    class ViewerLow {
      static readonly PreviewComponentType = PreviewLow as Type<IArtifactPreviewComponent>;
      static CanHandlePreview(typeName: string): boolean {
        return typeName === 'Spreadsheet';
      }
    }
    class ViewerHigh {
      static readonly PreviewComponentType = PreviewHigh as Type<IArtifactPreviewComponent>;
      static CanHandlePreview(typeName: string): boolean {
        return typeName === 'Spreadsheet';
      }
    }
    class ViewerTieLater {
      static readonly PreviewComponentType = PreviewTieLater as Type<IArtifactPreviewComponent>;
      static CanHandlePreview(typeName: string): boolean {
        return typeName === 'Spreadsheet';
      }
    }

    vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([
      { Priority: 1, SubClass: ViewerLow },
      { Priority: 5, SubClass: ViewerHigh },
      { Priority: 5, SubClass: ViewerTieLater },
    ] as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetAllRegistrations>);

    expect(resolver.ResolvePreviewComponent('Spreadsheet', 'application/json')).toBe(PreviewTieLater);
  });

  it('ignores non-matching or preview-less plugin registrations', () => {
    class ViewerNoPreview {
      static CanHandlePreview(): boolean {
        return true;
      }
    }
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetAllRegistrations').mockReturnValue([
      { Priority: 10, SubClass: ViewerNoPreview },
    ] as ReturnType<typeof MJGlobal.Instance.ClassFactory.GetAllRegistrations>);

    expect(resolver.ResolvePreviewComponent('Video', 'video/mp4')).toBeNull();
  });
});
