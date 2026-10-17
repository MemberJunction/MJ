import { describe, it, expect, vi } from 'vitest';
import { By } from '@angular/platform-browser';
import { IMetadataProvider } from '@memberjunction/core';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJStorageMediaPlayerComponent } from '@memberjunction/ng-media-player';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { ArtifactsModule } from '../../artifacts.module';
import { VideoProductionArtifactPreviewComponent } from './video-production-artifact-preview.component';

function stubProvider(): IMetadataProvider {
  const ExecuteGQL = vi.fn(async (_query: string, vars: { fileId: string }) => ({
    CreateMediaAccessToken: {
      Success: true,
      Url: `http://localhost:4000/media/${vars.fileId}`,
      MimeType: 'video/mp4',
    },
  }));
  return { ExecuteGQL } as unknown as IMetadataProvider;
}

function makeVersion(content: string): MJArtifactVersionEntity {
  return {
    ID: 'ver-preview-1',
    ArtifactID: 'art-preview-1',
    VersionNumber: 1,
    Name: 'Preview Test',
    Content: content,
  } as unknown as MJArtifactVersionEntity;
}

describe('VideoProductionArtifactPreviewComponent (DOM)', () => {
  it('renders <mj-storage-media-player> with FileID and PosterFileID when Output.Videos has a FileID, and stops click propagation', () => {
    const specWithOutput = {
      SpecVersion: '1.0',
      Film: {
        OneSentence: 'Test video',
        Audience: 'All',
        Purpose: 'Demo',
        DurationSeconds: 10,
        Formats: ['16:9'],
        Language: 'en-US',
      },
      Status: 'Delivered',
      Output: {
        Videos: {
          '16:9': {
            Format: '16:9',
            FileID: 'FILE-PREVIEW-16-9',
            MimeType: 'video/mp4',
            Width: 1920,
            Height: 1080,
            DurationSeconds: 10,
            FileSizeBytes: 1024,
          },
        },
        PosterFileID: 'FILE-PREVIEW-POSTER',
      },
    };

    const fixture = renderComponentFixture(VideoProductionArtifactPreviewComponent, {
      imports: [ArtifactsModule],
      inputs: {
        Provider: stubProvider(),
        artifactVersion: makeVersion(JSON.stringify(specWithOutput)),
      },
    });

    const storagePlayerDe = fixture.debugElement.query(By.directive(MJStorageMediaPlayerComponent));
    expect(storagePlayerDe).not.toBeNull();
    const player = storagePlayerDe.componentInstance as MJStorageMediaPlayerComponent;
    expect(player.FileID).toBe('FILE-PREVIEW-16-9');
    expect(player.PosterFileID).toBe('FILE-PREVIEW-POSTER');

    // Verify clicking the player container stops event propagation so the parent card does not open full view
    const playerWrapper = query(fixture, '.vp-preview__player')!;
    expect(playerWrapper).not.toBeNull();
    let parentClicked = false;
    fixture.nativeElement.addEventListener('click', () => {
      parentClicked = true;
    });
    (playerWrapper as HTMLElement).click();
    expect(parentClicked).toBe(false);
  });

  it('renders the status text when Output is absent', () => {
    const specWithoutOutput = {
      SpecVersion: '1.0',
      Film: {
        OneSentence: 'Storyboard draft',
        Audience: 'All',
        Purpose: 'Demo',
        DurationSeconds: 10,
        Formats: ['16:9'],
        Language: 'en-US',
      },
      Status: 'Storyboarded',
    };

    const fixture = renderComponentFixture(VideoProductionArtifactPreviewComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(specWithoutOutput)),
      },
    });

    const storagePlayerDe = fixture.debugElement.query(By.directive(MJStorageMediaPlayerComponent));
    expect(storagePlayerDe).toBeNull();
    expect(query(fixture, '.vp-preview__status')).not.toBeNull();
    expect(text(fixture, '.vp-preview__status-text')).toBe('Storyboarded');
  });
});
