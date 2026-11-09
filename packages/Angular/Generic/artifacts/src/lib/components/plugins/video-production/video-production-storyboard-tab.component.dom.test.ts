import { TestBed } from '@angular/core/testing';
import { type IMetadataProvider } from '@memberjunction/core';
import { type VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactsModule } from '../../../artifacts.module';
import { VideoProductionStoryboardTabComponent } from './video-production-storyboard-tab.component';

function stubProvider(
  byFileId: Record<string, { Success: boolean; Url?: string; MimeType?: string; ErrorMessage?: string }>,
): IMetadataProvider {
  const ExecuteGQL = vi.fn(async (_query: string, vars: { fileId: string }) => ({
    CreateMediaAccessToken: byFileId[vars.fileId] ?? { Success: false, ErrorMessage: 'not found' },
  }));
  return { ExecuteGQL } as unknown as IMetadataProvider;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

function makeStoryboardSpec(
  overrides: Partial<VideoGenerationSpec> = {},
): VideoGenerationSpec {
  return {
    Title: 'Executive KPI Briefing',
    Beats: [
      {
        Key: 'hook',
        Label: 'Hook',
        StartSeconds: 0,
        EndSeconds: 10,
        Purpose: 'Capture attention with headline growth metric',
        OnScreenText: ['14% YoY Growth', 'Q3 Highlights'],
        NarrationKey: 'nar-hook',
        AssetRefs: ['bg-hero'],
      },
      {
        Key: 'cta',
        Label: 'Call to Action',
        StartSeconds: 10,
        EndSeconds: 30,
        Purpose: 'Direct viewers to the board pack',
        OnScreenText: [],
        NarrationKey: 'nar-cta',
        AssetRefs: [],
      },
    ],
    Audio: {
      Narration: {
        Enabled: true,
        Script: [
          { Key: 'nar-hook', BeatKey: 'hook', Text: 'Revenue grew 14% year over year.' },
          { Key: 'nar-cta', BeatKey: 'cta', Text: 'Open the Q3 board pack for details.' },
        ],
      },
    },
    Assets: {
      Approved: [
        {
          Key: 'bg-hero',
          Kind: 'Video',
          FileID: 'file-bg-hero',
          Source: 'Generated',
          Provenance: 'Generated',
          Usage: 'Hero background',
          MustUse: false,
          Generation: {
            ModelID: '55555555-5555-4555-8555-555555555555',
            PromptRunID: 'pr-hero-1',
            Prompt: 'Dark slate backdrop with subtle geometric light trails',
            ReferenceKeys: [],
            DurationSeconds: 10,
            Cost: 0.45,
            C2PA: true,
          },
        },
      ],
      Required: [],
      Generate: [],
      NeverInvent: [],
    },
    Output: {
      ContactSheetFileIDs: {
        '16:9': '44444444-4444-4444-8444-444444444444',
      },
    },
    ...overrides,
  };
}

describe('VideoProductionStoryboardTabComponent (DOM)', () => {
  it('renders the beat strip, beat breakdown rows, AI-generated chip, and highlights active beat on OnBeatPicked', () => {
    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    const fixture = TestBed.createComponent(VideoProductionStoryboardTabComponent);
    fixture.componentRef.setInput(
      'Spec',
      makeStoryboardSpec({ Output: { ContactSheetFileIDs: {} } }),
    );
    fixture.detectChanges();

    const strip = fixture.nativeElement.querySelector('mj-video-beat-strip');
    expect(strip).toBeTruthy();

    const rows = fixture.nativeElement.querySelectorAll('.vp-storyboard-beat-row');
    expect(rows.length).toBe(2);

    const firstRow = rows[0] as HTMLElement;
    expect(firstRow.getAttribute('data-beat-key')).toBe('hook');
    expect(firstRow.querySelector('.vp-beat-cell--time')?.textContent?.trim()).toBe(
      '0:00\u20130:10',
    );
    expect(firstRow.querySelector('.vp-beat-cell--label')?.textContent).toContain('Hook');
    expect(firstRow.querySelector('.vp-generated-chip')?.textContent?.trim()).toBe(
      'AI-generated',
    );
    expect(firstRow.querySelector('.vp-beat-cell--purpose')?.textContent).toContain(
      'Capture attention with headline growth metric',
    );
    expect(firstRow.querySelector('.vp-beat-cell--text')?.textContent).toContain(
      '14% YoY Growth \u00B7 Q3 Highlights',
    );
    expect(firstRow.querySelector('.vp-beat-cell--narration')?.textContent).toContain(
      'Revenue grew 14% year over year.',
    );

    fixture.componentInstance.OnBeatPicked('cta');
    fixture.detectChanges();

    expect(fixture.componentInstance.ActiveBeatKey).toBe('cta');
    const secondRow = rows[1] as HTMLElement;
    expect(secondRow.classList.contains('vp-storyboard-beat-row--active')).toBe(true);
    expect(firstRow.classList.contains('vp-storyboard-beat-row--active')).toBe(false);
  });

  it('renders the empty state when Spec.Beats is empty and omits the contact sheets section when none exist', () => {
    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    const fixture = TestBed.createComponent(VideoProductionStoryboardTabComponent);
    fixture.componentRef.setInput(
      'Spec',
      makeStoryboardSpec({ Beats: [], Output: { ContactSheetFileIDs: {} } }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mj-empty-state')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.vp-storyboard-beat-row').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.vp-contact-sheet-card').length).toBe(0);
  });

  it('mints contact sheet URLs via Provider.ExecuteGQL and renders contact sheet images with format glyphs', async () => {
    const provider = stubProvider({
      '44444444-4444-4444-8444-444444444444': {
        Success: true,
        Url: 'https://cdn.example.test/contact-16x9.png',
        MimeType: 'image/png',
      },
    });

    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    const fixture = TestBed.createComponent(VideoProductionStoryboardTabComponent);
    fixture.componentRef.setInput('Provider', provider);
    fixture.componentRef.setInput('Spec', makeStoryboardSpec());
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '.vp-contact-sheet-card',
    ) as HTMLElement | null;
    expect(card).toBeTruthy();
    expect(card?.querySelector('mj-video-format-glyph')).toBeTruthy();

    const img = card?.querySelector('.vp-contact-sheet-img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://cdn.example.test/contact-16x9.png');
  });
});
