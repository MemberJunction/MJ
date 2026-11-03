import { TestBed } from '@angular/core/testing';
import { RunView } from '@memberjunction/core';
import { type VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactsModule } from '../../../artifacts.module';
import { VideoProductionReviewTabComponent } from './video-production-review-tab.component';

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

function makeReviewSpec(
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
        AssetRefs: ['bg-hero'],
      },
    ],
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
    Review: {
      Gates: [
        {
          Gate: 'AudioLoudnessGate',
          Status: 'Passed',
          Notes: '-14.2 LUFS within broadcast target',
          Timestamp: '2026-10-30T12:00:00Z',
        },
        {
          Gate: 'SafeZoneCheck',
          Status: 'Failed',
          Notes: 'Lower-third subtitle clips 9:16 safe margin',
          Timestamp: '2026-10-30T12:01:00Z',
        },
      ],
      Rounds: [
        {
          Round: 1,
          Timestamp: '2026-10-30T12:02:00Z',
          Summary: 'Clean pacing and high legibility across both formats.',
          Defects: [
            {
              Severity: 'Major',
              Format: '9:16',
              Timestamp: 4,
              Beat: 'hook',
              Criterion: 'Caption contrast',
              Evidence: 'Subtitle sits 4px below safe-zone guide.',
              Fix: 'Raise caption bottom offset by 8px.',
              Status: 'Fixed',
            },
          ],
        },
      ],
      Scores: {
        OverallScore: 92,
        MaxScore: 100,
        Passed: true,
        Criteria: [
          {
            Criterion: 'Brand alignment',
            Score: 95,
            MaxScore: 100,
            Passed: true,
            Notes: 'Palette matches brand kit.',
          },
          {
            Criterion: 'Caption contrast',
            Score: 88,
            MaxScore: 100,
            Passed: false,
            Notes: 'Minor safe-zone overlap on 9:16.',
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('VideoProductionReviewTabComponent (DOM)', () => {
  it('renders deterministic quality gates with Passed/Failed badges and notes', () => {
    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    const fixture = TestBed.createComponent(VideoProductionReviewTabComponent);
    fixture.componentRef.setInput(
      'Spec',
      makeReviewSpec({
        Assets: { Approved: [], Required: [], Generate: [], NeverInvent: [] },
      }),
    );
    fixture.detectChanges();

    const gateRows = fixture.nativeElement.querySelectorAll('.vp-gate-row');
    expect(gateRows.length).toBe(2);

    const passedRow = gateRows[0] as HTMLElement;
    const passedBadge = passedRow.querySelector('.vp-status-badge') as HTMLElement | null;
    expect(passedBadge?.getAttribute('data-status')).toBe('Passed');
    expect(passedRow.textContent).toContain('AudioLoudnessGate');
    expect(passedRow.textContent).toContain('-14.2 LUFS within broadcast target');

    const failedRow = gateRows[1] as HTMLElement;
    const failedBadge = failedRow.querySelector('.vp-status-badge') as HTMLElement | null;
    expect(failedBadge?.getAttribute('data-status')).toBe('Failed');
    expect(failedRow.textContent).toContain('SafeZoneCheck');
  });

  it('renders critic rounds, timestamped defect rows with format glyphs, and rubric criterion scores', () => {
    TestBed.configureTestingModule({ imports: [ArtifactsModule] });
    const fixture = TestBed.createComponent(VideoProductionReviewTabComponent);
    fixture.componentRef.setInput(
      'Spec',
      makeReviewSpec({
        Assets: { Approved: [], Required: [], Generate: [], NeverInvent: [] },
      }),
    );
    fixture.detectChanges();

    const roundCard = fixture.nativeElement.querySelector('.vp-round-card') as HTMLElement | null;
    expect(roundCard).toBeTruthy();
    expect(roundCard?.querySelector('.vp-round-title')?.textContent).toContain('Round 1');
    expect(roundCard?.querySelector('.vp-round-summary')?.textContent).toContain(
      'Clean pacing and high legibility across both formats.',
    );

    const defectRow = roundCard?.querySelector('.vp-defect-row') as HTMLElement | null;
    expect(defectRow).toBeTruthy();
    expect(
      defectRow?.querySelector('.vp-severity-badge')?.getAttribute('data-severity'),
    ).toBe('Major');
    expect(defectRow?.querySelector('mj-video-format-glyph')).toBeTruthy();
    expect(defectRow?.textContent).toContain('0:04');
    expect(defectRow?.textContent).toContain('Raise caption bottom offset by 8px.');

    const overall = fixture.nativeElement.querySelector('.vp-overall-score') as HTMLElement | null;
    expect(overall?.textContent).toContain('92 / 100');

    const criteriaRows = fixture.nativeElement.querySelectorAll('.vp-criterion-row');
    expect(criteriaRows.length).toBe(2);
    expect(criteriaRows[0]?.textContent).toContain('Brand alignment');
    expect(criteriaRows[0]?.textContent).toContain('95 / 100');
  });

  it('resolves AIModelName via RunView for generated assets provenance rows and renders empty notes when Review is empty', async () => {
    const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
      Success: true,
      Results: [
        { ID: '55555555-5555-4555-8555-555555555555', Name: 'Veo 3.1 Fast' },
      ],
      RowCount: 1,
      TotalRowCount: 1,
      ExecutionTime: 1,
      ErrorMessage: '',
      UserViewRunID: '',
    });

    try {
      TestBed.configureTestingModule({ imports: [ArtifactsModule] });
      const fixture = TestBed.createComponent(VideoProductionReviewTabComponent);
      fixture.componentRef.setInput(
        'Spec',
        makeReviewSpec({ Review: { Gates: [], Rounds: [] } }),
      );
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      const emptyNotes = fixture.nativeElement.querySelectorAll('.vp-empty-text');
      expect(emptyNotes.length).toBe(3);

      const assetRow = fixture.nativeElement.querySelector(
        '.vp-generated-asset-row',
      ) as HTMLElement | null;
      expect(assetRow).toBeTruthy();
      expect(assetRow?.textContent).toContain('bg-hero');
      expect(assetRow?.textContent).toContain('Veo 3.1 Fast');
      expect(assetRow?.textContent).toContain('$0.45');
      expect(assetRow?.textContent).toContain('kept');
      expect(assetRow?.querySelector('.vp-prompt-text')?.textContent).toContain(
        'Dark slate backdrop with subtle geometric light trails',
      );
    } finally {
      runViewSpy.mockRestore();
    }
  });
});
