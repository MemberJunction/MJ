import { describe, it, expect, vi } from 'vitest';
import { By } from '@angular/platform-browser';
import { IMetadataProvider } from '@memberjunction/core';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { MJMediaPlayerComponent, MJStorageMediaPlayerComponent } from '@memberjunction/ng-media-player';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { ArtifactsModule } from '../../../artifacts.module';
import { BaseArtifactViewerPluginComponent } from '../../base-artifact-viewer.component';
import { VideoProductionReviewTabComponent } from './video-production-review-tab.component';
import { VideoProductionStoryboardTabComponent } from './video-production-storyboard-tab.component';
import { VideoProductionViewerComponent } from './video-production-viewer.component';

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

function makeVersion(content: string, name = 'Q3 Executive Film'): MJArtifactVersionEntity {
  return {
    ID: 'ver-1',
    ArtifactID: 'art-1',
    VersionNumber: 1,
    Name: name,
    Content: content,
  } as unknown as MJArtifactVersionEntity;
}

function makeSpec(overrides: Partial<VideoGenerationSpec> = {}): VideoGenerationSpec {
  const base: VideoGenerationSpec = {
    SpecVersion: '1.0',
    Status: 'Delivered',
    Archetype: {
      ArchetypeID: '11111111-1111-4111-8111-111111111111',
      Name: 'KPI Briefing',
    },
    Film: {
      OneSentence: 'Q3 revenue grew 18% year-over-year.',
      Audience: 'Board of Directors',
      Purpose: 'Quarterly Financial Briefing',
      DurationSeconds: 15,
      Formats: ['16:9', '9:16'],
      Language: 'en-US',
    },
    Assets: {
      Approved: [],
      Required: [],
      Generate: [],
      NeverInvent: ['company logo'],
    },
    Style: {
      Palette: [
        {
          Name: 'background.primary',
          Value: '#0F172A',
          Usage: 'Primary canvas background',
        },
      ],
      Typography: [
        {
          Role: 'Headline',
          FontFamily: 'Inter',
          Weight: 700,
          SizeByFormat: { '16:9': '64px', '9:16': '48px' },
          LineHeight: '1.1',
        },
      ],
      Composition: 'Single dominant metric focal point per beat.',
      Pacing: {
        AvgSecondsBetweenChanges: 3.5,
        HoldRules: 'Hold key number for 1.5s',
      },
      MotionRules: [
        {
          ObjectClass: 'Headline',
          Easing: 'ease-out',
          DurationMs: 400,
          Notes: 'Fade in',
        },
      ],
      Texture: 'Subtle film grain',
      Keep: ['Clean grid'],
      Avoid: ['Clutter'],
      References: [],
    },
    Beats: [
      {
        Key: 'beat-1',
        Label: 'Headline Metric',
        StartSeconds: 0,
        EndSeconds: 5,
        EntryState: 'Dark slate canvas',
        ExitState: 'Counter settled',
        Purpose: 'Hook viewer with Q3 growth',
        OnScreenText: ['$4.2M', '+18% YoY'],
        DataRefs: ['rev_q3'],
        AssetRefs: [],
        NarrationKey: 'narr-1',
        LayoutNotes: { '16:9': 'Left aligned', '9:16': 'Top stacked' },
      },
      {
        Key: 'beat-2',
        Label: 'Regional Breakdown',
        StartSeconds: 5,
        EndSeconds: 15,
        EntryState: 'Counter shrinks',
        ExitState: 'Two-bar comparison locked',
        Purpose: 'Show EMEA and NA contribution',
        OnScreenText: ['North America 62%', 'EMEA 38%'],
        DataRefs: [],
        AssetRefs: [],
        LayoutNotes: { '16:9': 'Two-column', '9:16': 'Stacked' },
      },
    ],
    DataBindings: [
      {
        Key: 'rev_q3',
        Label: 'Q3 Revenue',
        Source: { Kind: 'Query', QueryID: 'Q-100' },
        Shape: 'Scalar',
        Format: { Kind: 'Currency', Currency: 'USD' },
      },
    ],
    DataSnapshot: {
      AsOf: '2026-10-01T12:00:00.000Z',
      Sources: ['Query:Q-100'],
      Inline: { rev_q3: '$4.2M' },
    },
    Audio: {
      Narration: {
        VoiceID: 'voice-1',
        Provider: 'ElevenLabs',
        Script: [
          {
            Key: 'narr-1',
            BeatKey: 'beat-1',
            Text: 'Revenue reached four point two million dollars in Q3.',
            StartSeconds: 0,
            DurationSeconds: 4.5,
          },
        ],
      },
      Captions: 'Sidecar',
      Cues: [],
    },
    Render: {
      Renderer: 'HyperFrames',
      RendererVersion: '0.9.0',
      Fps: 30,
      Seed: 42,
      Quality: 'standard',
    },
    Interaction: {
      Mode: 'Autonomous',
      MaxRepairRounds: 2,
    },
    Deliverables: {
      Formats: ['16:9', '9:16'],
      Poster: true,
      ContactSheets: true,
      Source: true,
      Captions: true,
    },
    Review: {
      Gates: [
        {
          Gate: 'G1',
          Status: 'Passed',
          EvidenceRefs: ['Query:Q-100'],
          Notes: 'Valid schema v1.0',
          Timestamp: '2026-10-01T12:01:00.000Z',
        },
        {
          Gate: 'G6',
          Status: 'Passed',
          EvidenceRefs: ['FILE-VID-16-9'],
          Notes: 'Snapshot matches live query',
          Timestamp: '2026-10-01T12:02:00.000Z',
        },
      ],
      Rounds: [
        {
          Round: 1,
          Timestamp: '2026-10-01T12:05:00.000Z',
          Summary: 'Strong hierarchy, minor contrast issue on beat 2.',
          Defects: [
            {
              Severity: 'Minor',
              Format: '9:16',
              Timestamp: 7.5,
              Beat: 'beat-2',
              Criterion: 'Legibility',
              Evidence: 'Subhead contrast is 4.1:1',
              Fix: 'Darken subhead ink token',
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
            Criterion: 'DataAccuracy',
            Score: 25,
            MaxScore: 25,
            Passed: true,
            Notes: 'Exact match with Q-100',
          },
        ],
      },
      HumanReviewNotes: 'Approved by CFO for October board deck.',
    },
    Output: {
      Videos: {
        '16:9': {
          Format: '16:9',
          FileID: 'FILE-VID-16-9',
          MimeType: 'video/mp4',
          Width: 1920,
          Height: 1080,
          DurationSeconds: 15,
          FileSizeBytes: 4194304,
        },
        '9:16': {
          Format: '9:16',
          FileID: 'FILE-VID-9-16',
          MimeType: 'video/mp4',
          Width: 1080,
          Height: 1920,
          DurationSeconds: 15,
          FileSizeBytes: 3981312,
        },
      },
      PosterFileID: 'FILE-POSTER-1',
      ContactSheetFileIDs: {
        '16:9': ['FILE-CS-16-9'],
        '9:16': ['FILE-CS-9-16'],
      },
      Source: {
        '16:9': {
          Format: '16:9',
          EntryFile: 'index.html',
          Files: {
            'index.html': '<!doctype html><html><body><h1>16:9</h1></body></html>',
            'styles.css': 'body { margin: 0; }',
          },
          AssetKeys: [],
        },
        '9:16': {
          Format: '9:16',
          EntryFile: 'index.html',
          Files: {
            'index.html': '<!doctype html><html><body><h1>9:16</h1></body></html>',
          },
          AssetKeys: [],
        },
      },
      RenderMetadata: {
        Renderer: 'HyperFrames',
        RendererVersion: '0.9.0',
        Seed: 42,
        Fps: 30,
        DurationByFormat: { '16:9': 15, '9:16': 15 },
        RenderedAt: '2026-10-01T12:04:00.000Z',
      },
    },
    ...overrides,
  };
  return base;
}

describe('VideoProductionViewerComponent & Tab Components (DOM)', () => {
  it('resolves VideoProductionViewerPlugin via MJGlobal ClassFactory', () => {
    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseArtifactViewerPluginComponent,
      'VideoProductionViewerPlugin',
    );
    expect(reg?.SubClass).toBe(VideoProductionViewerComponent);
  });

  it('renders the Display tab with 16:9 + 9:16 formats, switches formats on button click, and binds FileID and PosterFileID on MJStorageMediaPlayerComponent', async () => {
    const provider = stubProvider({
      'FILE-VID-16-9': { Success: true, Url: 'http://localhost:4000/media/16-9', MimeType: 'video/mp4' },
      'FILE-VID-9-16': { Success: true, Url: 'http://localhost:4000/media/9-16', MimeType: 'video/mp4' },
      'FILE-POSTER-1': { Success: true, Url: 'http://localhost:4000/media/poster', MimeType: 'image/png' },
    });
    const spec = makeSpec();
    const fixture = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        Provider: provider,
        artifactVersion: makeVersion(JSON.stringify(spec)),
      },
    });
    await flush();
    fixture.detectChanges();

    expect(text(fixture, '.vp-header__title')).toBe('Q3 Executive Film');
    expect(text(fixture, '.vp-header__one-sentence')).toBe('Q3 revenue grew 18% year-over-year.');
    expect(text(fixture, '.vp-badge--status')).toBe('Delivered');
    expect(text(fixture, '.vp-badge--duration')).toBe('15s');

    const formatBtns = queryAll(fixture, '.vp-format-switcher button');
    expect(formatBtns).toHaveLength(2);
    expect(formatBtns[0].getAttribute('aria-pressed')).toBe('true');
    expect(formatBtns[1].getAttribute('aria-pressed')).toBe('false');

    let storagePlayerDe = fixture.debugElement.query(By.directive(MJStorageMediaPlayerComponent));
    expect(storagePlayerDe).not.toBeNull();
    let storagePlayer = storagePlayerDe.componentInstance as MJStorageMediaPlayerComponent;
    expect(storagePlayer.FileID).toBe('FILE-VID-16-9');
    expect(storagePlayer.PosterFileID).toBe('FILE-POSTER-1');

    // Click 9:16 button
    (formatBtns[1] as HTMLElement).click();
    fixture.detectChanges();
    await flush();

    expect(formatBtns[0].getAttribute('aria-pressed')).toBe('false');
    expect(formatBtns[1].getAttribute('aria-pressed')).toBe('true');

    storagePlayerDe = fixture.debugElement.query(By.directive(MJStorageMediaPlayerComponent));
    storagePlayer = storagePlayerDe.componentInstance as MJStorageMediaPlayerComponent;
    expect(storagePlayer.FileID).toBe('FILE-VID-9-16');
    expect(storagePlayer.PosterFileID).toBe('FILE-POSTER-1');
  });

  it('renders the inline-base64 warning banner and MJMediaPlayerComponent when InlineBase64 is set without FileID', async () => {
    const spec = makeSpec({
      Output: {
        Videos: {
          '16:9': {
            Format: '16:9',
            InlineBase64: 'AAAAIGZ0eXBpc29t',
            MimeType: 'video/mp4',
            Width: 1920,
            Height: 1080,
            DurationSeconds: 15,
            FileSizeBytes: 1024,
          },
        },
        RenderMetadata: {
          Renderer: 'HyperFrames',
          RendererVersion: '0.9.0',
          Seed: 42,
          Fps: 30,
          DurationByFormat: { '16:9': 15 },
          RenderedAt: '2026-10-01T12:04:00.000Z',
        },
      },
    });
    const fixture = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(spec)),
      },
    });
    await flush();
    fixture.detectChanges();

    const alertEl = query(fixture, 'mj-alert');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Stored inline: no file storage account was set up.');

    const storagePlayerDe = fixture.debugElement.query(By.directive(MJStorageMediaPlayerComponent));
    expect(storagePlayerDe).toBeNull();

    const mediaPlayerDe = fixture.debugElement.query(By.directive(MJMediaPlayerComponent));
    expect(mediaPlayerDe).not.toBeNull();
    const mediaPlayer = mediaPlayerDe.componentInstance as MJMediaPlayerComponent;
    expect(mediaPlayer.Tracks).toHaveLength(1);
    expect(mediaPlayer.Tracks[0].Url).toBe('data:video/mp4;base64,AAAAIGZ0eXBpc29t');
  });

  it('renders the "Contains data" + "Data as of 2026-10-01" badge when DataBindings and DataSnapshot.AsOf are present', () => {
    const withData = makeSpec();
    const fixtureWithData = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(withData)),
      },
    });

    const badge = query(fixtureWithData, '.vp-badge--data');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Contains data');
    expect(badge?.textContent).toContain('Data as of 2026-10-01');
  });

  it('logs LogError and shows the "Contains data" badge without a date when DataSnapshot.AsOf is invalid', () => {
    const badAsOfSpec = makeSpec({
      DataSnapshot: {
        AsOf: 'not-a-valid-date',
        Sources: ['Query:88888888-8888-4888-8888-888888888888'],
      },
    });
    const fixture = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(badAsOfSpec)),
      },
    });

    const badge = query(fixture, '.vp-badge--data');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Contains data');
    expect(badge?.textContent).not.toContain('not-a-valid-date');
    expect(query(fixture, '.vp-badge__as-of')).toBeNull();
  });

  it('omits the data badge when DataBindings is empty', () => {
    const withoutData = makeSpec({ DataBindings: [] });
    const fixtureWithoutData = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(withoutData)),
      },
    });
    expect(query(fixtureWithoutData, '.vp-badge--data')).toBeNull();
  });

  it('GetAdditionalTabs() returns Brief, Storyboard, Style, Data, Review, and Source 16:9 / Source 9:16 tabs', () => {
    const spec = makeSpec();
    const fixture = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion(JSON.stringify(spec)),
      },
    });

    const tabs = fixture.componentInstance.GetAdditionalTabs();
    expect(tabs.map(t => t.label)).toEqual([
      'Brief',
      'Storyboard',
      'Style',
      'Data',
      'Review',
      'Source 16:9',
      'Source 9:16',
    ]);

    const source169 = tabs.find(t => t.label === 'Source 16:9')!;
    expect(source169.contentType).toBe('code');
    expect(source169.language).toBe('html');
    const sourceText = typeof source169.content === 'function' ? source169.content() : source169.content;
    expect(sourceText).toContain('<!-- index.html -->');
    expect(sourceText).toContain('<!-- styles.css -->');
  });

  it('renders VideoProductionStoryboardTabComponent with beats and contact-sheet FileIDs and populates <img src> via MintMediaAccessUrl', async () => {
    const provider = stubProvider({
      'FILE-CS-16-9': { Success: true, Url: 'http://localhost:4000/media/cs-16-9', MimeType: 'image/png' },
      'FILE-CS-9-16': { Success: true, Url: 'http://localhost:4000/media/cs-9-16', MimeType: 'image/png' },
    });
    const spec = makeSpec();
    const fixture = renderComponentFixture(VideoProductionStoryboardTabComponent, {
      imports: [ArtifactsModule],
      inputs: {
        Provider: provider,
        Spec: spec,
      },
    });
    await flush();
    fixture.detectChanges();

    const beatRows = queryAll(fixture, '.vp-storyboard-beat-row');
    expect(beatRows).toHaveLength(2);
    expect(beatRows[0].textContent).toContain('Headline Metric');
    expect(beatRows[0].textContent).toContain('Revenue reached four point two million dollars in Q3.');
    expect(beatRows[1].textContent).toContain('Regional Breakdown');

    const executeGql = (provider as unknown as { ExecuteGQL: ReturnType<typeof vi.fn> }).ExecuteGQL;
    expect(executeGql).toHaveBeenCalledTimes(2);

    const images = queryAll(fixture, '.vp-contact-sheet-img');
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('http://localhost:4000/media/cs-16-9');
    expect(images[1].getAttribute('src')).toBe('http://localhost:4000/media/cs-9-16');
  });

  it('shows "Contact sheet unavailable." when a contact sheet fails to mint while rendering the remaining contact sheet image', async () => {
    const provider = stubProvider({
      'FILE-CS-16-9': { Success: false, ErrorMessage: 'Permission denied' },
      'FILE-CS-9-16': { Success: true, Url: 'http://localhost:4000/media/cs-9-16', MimeType: 'image/png' },
    });
    const spec = makeSpec();
    const fixture = renderComponentFixture(VideoProductionStoryboardTabComponent, {
      imports: [ArtifactsModule],
      inputs: {
        Provider: provider,
        Spec: spec,
      },
    });
    await flush();
    fixture.detectChanges();

    const placeholders = queryAll(fixture, '.vp-contact-sheet-placeholder');
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].textContent?.trim()).toBe('Contact sheet unavailable.');

    const images = queryAll(fixture, '.vp-contact-sheet-img');
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('http://localhost:4000/media/cs-9-16');
  });

  it('renders VideoProductionReviewTabComponent with gates, a critic round with defects, rubric scores, and HumanReviewNotes', () => {
    const spec = makeSpec();
    const fixture = renderComponentFixture(VideoProductionReviewTabComponent, {
      imports: [ArtifactsModule],
      inputs: {
        Spec: spec,
      },
    });

    const gateRows = queryAll(fixture, '.vp-gate-row');
    expect(gateRows).toHaveLength(2);
    expect(gateRows[0].textContent).toContain('G1');
    expect(gateRows[0].textContent).toContain('Passed');

    const defectRows = queryAll(fixture, '.vp-defect-row');
    expect(defectRows).toHaveLength(1);
    expect(defectRows[0].textContent).toContain('Legibility');
    expect(defectRows[0].textContent).toContain('Subhead contrast is 4.1:1');

    const criterionRows = queryAll(fixture, '.vp-criterion-row');
    expect(criterionRows).toHaveLength(1);
    expect(criterionRows[0].textContent).toContain('DataAccuracy');
    expect(criterionRows[0].textContent).toContain('25 / 25');

    expect(text(fixture, '.vp-human-notes')).toBe('Approved by CFO for October board deck.');
  });

  it('handles invalid JSON content with <mj-empty-state>', () => {
    const fixture = renderComponentFixture(VideoProductionViewerComponent, {
      imports: [ArtifactsModule],
      inputs: {
        artifactVersion: makeVersion('{not valid json'),
      },
    });

    const emptyState = query(fixture, 'mj-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain('Invalid Video Production Content');
    expect(fixture.componentInstance.GetAdditionalTabs()).toEqual([]);
  });
});
