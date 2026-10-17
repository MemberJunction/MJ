import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { BaseArtifactViewerPluginComponent } from '../lib/components/base-artifact-viewer.component';
import {
  BuildBriefMarkdown,
  BuildDataMarkdown,
  BuildStyleMarkdown,
  EscapeMarkdown,
  FormatAsOfCardText,
} from '../lib/components/plugins/video-production/video-production-markdown';
import { VideoProductionViewerComponent } from '../lib/components/plugins/video-production/video-production-viewer.component';
import { VideoProductionArtifactPreviewComponent } from '../lib/components/previews/video-production-artifact-preview.component';

function createSampleSpec(): VideoGenerationSpec {
  return {
    SpecVersion: '1.0',
    Status: 'Delivered',
    Archetype: {
      ArchetypeID: '11111111-1111-4111-8111-111111111111',
      Name: 'KPI Briefing | Executive',
    },
    BrandKitID: '22222222-2222-4222-8222-222222222222',
    CompanyID: '33333333-3333-4333-8333-333333333333',
    Film: {
      OneSentence: 'Q3 ARR grew 28% YoY to $14.2M | driven by *Enterprise* & [AI] <adoption>.',
      Audience: 'Executive leadership_team and board members preparing for the Q3 review.',
      Purpose: 'Deliver a 15-second pre-meeting KPI briefing with verified ARR numbers.',
      DurationSeconds: 15,
      Formats: ['16:9', '9:16'],
      Language: 'en-US',
    },
    Assets: {
      Approved: [
        {
          Key: 'brand-logo-primary',
          Kind: 'Logo',
          FileID: '44444444-4444-4444-8444-444444444444',
          Source: 'Brand Kit Primary Logo (SVG)',
          Provenance: 'BrandKit',
          Usage: 'Corner watermark and closing end card',
          MustUse: true,
          StagedPath: 'assets/brand-logo-primary.svg',
        },
      ],
      Required: [],
      Generate: [],
      NeverInvent: ['company logo', 'ARR metrics'],
    },
    Style: {
      Palette: [
        {
          Name: 'background.primary',
          Value: '#0F172A',
          Usage: 'Primary canvas background | across all beats',
        },
        {
          Name: 'text.primary',
          Value: '#F8FAFC',
          Usage: 'Headlines and primary metric callouts',
        },
      ],
      Typography: [
        {
          Role: 'Headline',
          FontFamily: 'Inter | Sans',
          Weight: 700,
          SizeByFormat: {
            '16:9': '64px',
            '9:16': '52px',
          },
          LineHeight: '1.1',
          LetterSpacing: '-0.02em',
        },
      ],
      Composition: 'Single dominant metric focal point per beat with generous 12% perimeter safe margin.',
      Pacing: {
        AvgSecondsBetweenChanges: 2.5,
        HoldRules: 'Hold final metric values static for at least 1.5s | minimum',
        MinBeatDurationSeconds: 3,
        MaxBeatDurationSeconds: 7,
      },
      MotionRules: [
        {
          ObjectClass: 'Headline',
          Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          DurationMs: 420,
          Notes: 'Translate Y 24px -> 0px *no bounce*',
        },
      ],
      Texture: 'Subtle 2% monochromatic film grain over dark slate canvas',
      Keep: ['High-contrast tabular numerals | editorial restraint'],
      Avoid: ['Neon gradients & <marquee> effects'],
      References: [
        {
          SourceKey: 'brand-logo-primary',
          PaletteLearned: 'Deep slate background paired with emerald accent preserves executive tone.',
          TypographyLearned: 'Tight tracking on bold geometric sans headlines.',
          CompositionLearned: 'Asymmetric left-aligned anchor in 16:9.',
          PacingLearned: 'Crisp cut on spoken verb with 1.5s metric hold.',
          MotionLearned: 'Fast-out cubic-bezier entrances without bounce.',
          DoNotCopy: ['Competitor tagline | proprietary logo'],
        },
      ],
    },
    Beats: [
      {
        Key: 'beat-1-hook',
        Label: 'Hook',
        StartSeconds: 0,
        EndSeconds: 4.5,
        EntryState: 'Dark slate canvas',
        ExitState: 'Headline locked',
        Purpose: 'Anchor the viewer on Q3 ARR momentum.',
        OnScreenText: ['Q3 ARR Momentum', '+28% YoY'],
        DataRefs: ['kpi.arr.q3'],
        AssetRefs: ['brand-logo-primary'],
        NarrationKey: 'narr-1',
        LayoutNotes: {
          '16:9': 'Left-aligned headline at 10% inset.',
          '9:16': 'Stacked headline centered in upper safe zone.',
        },
      },
    ],
    DataBindings: [
      {
        Key: 'kpi.arr.q3',
        Label: 'Q3 Ending ARR | Total',
        Source: {
          Kind: 'Query',
          QueryID: '88888888-8888-4888-8888-888888888888',
        },
        Shape: 'Scalar',
        Format: {
          Kind: 'Currency',
          Currency: 'USD',
          Decimals: 1,
        },
      },
      {
        Key: 'growth.series',
        Label: 'Monthly Growth *Series*',
        Source: {
          Kind: 'View',
          EntityName: 'MJ: Invoices',
        },
        Shape: 'Series',
      },
    ],
    DataSnapshot: {
      Inline: {
        'kpi.arr.q3': '$14.2M | +28%',
      },
      AsOf: '2026-10-01T14:30:00.000Z',
      Sources: ['Query:88888888-8888-4888-8888-888888888888'],
    },
    Audio: {
      Narration: {
        VoiceID: 'voice-exec-warm',
        Provider: 'ElevenLabs',
        Script: [
          {
            Key: 'narr-1',
            BeatKey: 'beat-1-hook',
            Text: 'Third quarter recurring revenue accelerated twenty-eight percent year over year.',
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
      Seed: 104729,
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
          EvidenceRefs: ['Query:88888888-8888-4888-8888-888888888888'],
          Timestamp: '2026-10-01T14:30:05.000Z',
        },
      ],
      Rounds: [],
    },
  };
}

describe('VideoProductionViewer markdown helpers & static registration contract', () => {
  it('BuildBriefMarkdown produces expected headings and escapes markdown special characters', () => {
    const spec = createSampleSpec();
    const md = BuildBriefMarkdown(spec);

    expect(md).toContain('## Film Brief');
    expect(md).toContain('## Archetype');
    expect(md).toContain('Deliver a 15-second pre-meeting KPI briefing with verified ARR numbers.');
    expect(md).toContain('16:9, 9:16');
    expect(md).toContain(
      'Q3 ARR grew 28% YoY to $14.2M \\| driven by \\*Enterprise\\* & \\[AI\\] &lt;adoption&gt;.',
    );
    expect(md).toContain('Executive leadership\\_team');
    expect(md).toContain('KPI Briefing \\| Executive');
  });

  it('BuildStyleMarkdown produces expected headings for palette, typography, composition, motion, texture, keep/avoid, and references with escaping', () => {
    const spec = createSampleSpec();
    const md = BuildStyleMarkdown(spec);

    expect(md).toContain('## Palette');
    expect(md).toContain('background.primary');
    expect(md).toContain('\\#0F172A');
    expect(md).toContain('Primary canvas background \\| across all beats');
    expect(md).toContain('## Typography');
    expect(md).toContain('Inter \\| Sans');
    expect(md).toContain('16:9: 64px, 9:16: 52px');
    expect(md).toContain('## Composition & Pacing');
    expect(md).toContain('Hold final metric values static for at least 1.5s \\| minimum');
    expect(md).toContain('## Motion Rules');
    expect(md).toContain('Translate Y 24px -&gt; 0px \\*no bounce\\*');
    expect(md).toContain('## Texture');
    expect(md).toContain('## Keep & Avoid');
    expect(md).toContain('High-contrast tabular numerals \\| editorial restraint');
    expect(md).toContain('Neon gradients & &lt;marquee&gt; effects');
    expect(md).toContain('## Reference Analyses');
    expect(md).toContain('Competitor tagline \\| proprietary logo');
  });

  it('BuildDataMarkdown produces expected headings for bindings, snapshot, and scalar inline values with escaping', () => {
    const spec = createSampleSpec();
    const md = BuildDataMarkdown(spec);

    expect(md).toContain('## Data Bindings');
    expect(md).toContain('Q3 Ending ARR \\| Total');
    expect(md).toContain('88888888-8888-4888-8888-888888888888');
    expect(md).toContain('$14.2M \\| +28%');
    expect(md).toContain('Monthly Growth \\*Series\\*');
    expect(md).toContain('## Data Snapshot');
    expect(md).toContain('2026-10-01T14:30:00.000Z');
    expect(md).toContain('### Snapshot Sources');
    expect(md).toContain('Query:88888888-8888-4888-8888-888888888888');
  });

  it('EscapeMarkdown escapes pipes, backticks, brackets, asterisks, underscores, hashes, and newlines', () => {
    expect(EscapeMarkdown('a | b `c` *d* _e_ [f] <g> #h\ni')).toBe(
      'a \\| b \\`c\\` \\*d\\* \\_e\\_ \\[f\\] &lt;g&gt; \\#h i',
    );
  });

  it('FormatAsOfCardText formats UTC date and throws on invalid input', () => {
    expect(FormatAsOfCardText('2026-10-01T23:59:59.000Z')).toBe('Data as of 2026-10-01');
    expect(() => FormatAsOfCardText('not-a-date')).toThrow();
  });

  it('CanHandlePreview returns true for "Video Production" (case-insensitive) and false for other types', () => {
    expect(VideoProductionViewerComponent.CanHandlePreview('Video Production')).toBe(true);
    expect(VideoProductionViewerComponent.CanHandlePreview('  video production  ')).toBe(true);
    expect(VideoProductionViewerComponent.CanHandlePreview('video')).toBe(false);
    expect(VideoProductionViewerComponent.CanHandlePreview('Video')).toBe(false);
    expect(VideoProductionViewerComponent.CanHandlePreview('')).toBe(false);
    expect(VideoProductionViewerComponent.PreviewComponentType).toBe(
      VideoProductionArtifactPreviewComponent,
    );
  });

  it('resolves VideoProductionViewerPlugin registration on BaseArtifactViewerPluginComponent from .video-production-artifact-type.json DriverClass', () => {
    const metadataPath = join(
      __dirname,
      '../../../../../../metadata/artifact-types/.video-production-artifact-type.json',
    );
    const records = JSON.parse(readFileSync(metadataPath, 'utf8')) as Array<{
      fields: { Name: string; DriverClass: string };
    }>;
    expect(records).toHaveLength(1);
    const { fields } = records[0];
    expect(fields.Name).toBe('Video Production');
    expect(fields.DriverClass).toBe('VideoProductionViewerPlugin');

    const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
      BaseArtifactViewerPluginComponent,
      fields.DriverClass,
    );
    expect(reg).toBeDefined();
    expect(reg?.SubClass).toBe(VideoProductionViewerComponent);
  });
});
