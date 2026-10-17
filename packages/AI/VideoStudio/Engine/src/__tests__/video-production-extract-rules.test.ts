import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ArtifactExtractor, ArtifactExtractRule } from '@memberjunction/core-entities';
import { VIDEO_STUDIO_SPEC_VERSION, VideoGenerationSpec } from '@memberjunction/video-studio-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTRACT_RULES_DIR = path.resolve(
    __dirname,
    '../../../../../../metadata/artifact-types/extract-rules',
);

function loadResolvedExtractRules(): ArtifactExtractRule[] {
    const rawRulesPath = path.join(EXTRACT_RULES_DIR, 'video-production.json');
    const rawRules = JSON.parse(fs.readFileSync(rawRulesPath, 'utf8')) as ArtifactExtractRule[];
    return rawRules.map((rule) => {
        if (rule.extractor.startsWith('@file:')) {
            const relPath = rule.extractor.slice('@file:'.length);
            const body = fs.readFileSync(path.join(EXTRACT_RULES_DIR, relPath), 'utf8');
            return { ...rule, extractor: body };
        }
        return rule;
    });
}

function buildKpiBriefingFixture(): VideoGenerationSpec {
    return {
        SpecVersion: VIDEO_STUDIO_SPEC_VERSION,
        Status: 'Delivered',
        Archetype: {
            ArchetypeID: '85780765-A09A-4B50-9F6B-43BF46FFD19F',
            Name: 'KPI Briefing',
        },
        Film: {
            OneSentence: 'Net revenue grew 18% month-over-month driven by enterprise renewals.',
            Audience: 'Executive leadership team',
            Purpose: 'Review monthly recurring revenue performance and renewal drivers.',
            DurationSeconds: 60,
            Formats: ['16:9', '9:16'],
        },
        Assets: {
            Approved: [
                {
                    Key: 'mj-logo',
                    Kind: 'Logo',
                    Source: 'BrandKit',
                    Provenance: 'BrandKit',
                    Usage: 'Closing slate logo mark',
                    MustUse: true,
                },
                {
                    Key: 'bg-illustration',
                    Kind: 'Image',
                    Source: 'FLUX 3 Image',
                    Provenance: 'Generated',
                    Usage: 'Atmospheric abstract backdrop for title card',
                    MustUse: false,
                    Generation: {
                        ModelID: '0B6B5F2C-5B90-49E1-8E11-5B9B5428BA3A',
                        PromptRunID: '4B7E9D6A-1A23-4C56-8E90-123456789ABC',
                        Prompt: 'Flat geometric abstract pattern in navy and cyan, no text, no logos',
                        ReferenceKeys: [],
                        Cost: 0.607,
                        C2PA: true,
                    },
                },
            ],
            Required: [],
            NeverInvent: ['product screens', 'the MemberJunction logo', 'metrics or statistics'],
        },
        Style: {
            Palette: [
                { Name: 'Primary', Value: '#0076B6', Usage: 'Primary series color' },
                { Name: 'Navy', Value: '#092340', Usage: 'Canvas background' },
            ],
            Typography: [
                {
                    Role: 'Headline',
                    FontFamily: 'Inter',
                    Weight: 700,
                    SizeByFormat: { '16:9': '64px', '9:16': '52px' },
                },
            ],
            Composition: 'Headline top-left, primary chart centered below.',
            Pacing: {
                AvgSecondsBetweenChanges: 3.5,
                HoldRules: 'Hold bound figures for 2.0 seconds after counter settles.',
            },
            MotionRules: [
                {
                    ObjectClass: 'DataMetric',
                    Easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    DurationMs: 600,
                    Notes: 'Smooth tabular counter roll.',
                },
            ],
            Keep: ['High-contrast dark navy canvas'],
            Avoid: ['centered text on a gradient'],
            References: [],
        },
        Beats: [
            {
                Key: 'hook',
                Label: 'Headline Metric & Delta',
                StartSeconds: 0,
                EndSeconds: 3,
                EntryState: 'Dark navy canvas',
                ExitState: 'Headline KPI visible',
                Purpose: 'Surface MRR growth immediately',
                OnScreenText: ['MRR {kpi.mrr.delta}'],
                DataRefs: ['kpi.mrr.delta'],
                AssetRefs: ['bg-illustration'],
                LayoutNotes: { '16:9': 'Centered KPI tile', '9:16': 'Upper-center KPI stack' },
            },
            {
                Key: 'close',
                Label: 'Takeaway & Provenance',
                StartSeconds: 3,
                EndSeconds: 60,
                EntryState: 'Headline KPI visible',
                ExitState: 'Closing summary and provenance footer',
                Purpose: 'Close with provenance timestamp',
                OnScreenText: ['Data as of {AsOf}'],
                DataRefs: ['kpi.mrr.delta'],
                AssetRefs: ['mj-logo'],
                LayoutNotes: { '16:9': 'Footer provenance', '9:16': 'Safe-zone provenance' },
            },
        ],
        DataBindings: [
            {
                Key: 'kpi.mrr.delta',
                Source: { Kind: 'Inline' },
                Shape: 'Delta',
                Format: { Kind: 'Percent', Decimals: 0 },
                Label: 'MRR MoM Growth',
            },
        ],
        DataSnapshot: {
            Inline: { 'kpi.mrr.delta': '+18%' },
            AsOf: '2026-10-16T18:00:00Z',
            Sources: ['vwMonthlyRecurringRevenue'],
        },
        Audio: {
            Cues: [],
            Captions: 'Burned',
        },
        Render: {
            Renderer: 'HyperFrames',
            RendererVersion: '0.1.0',
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
            Gates: [],
            Rounds: [],
        },
    };
}

describe('Video Production artifact extract rules (VS-FND-4)', () => {
    const extractRules = loadResolvedExtractRules();

    it('extracts all attributes, as-of provenance, and generated-asset count from a full VideoGenerationSpec', async () => {
        const spec = buildKpiBriefingFixture();
        const result = await ArtifactExtractor.ExtractAttributes({
            content: JSON.stringify(spec),
            extractRules,
        });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        const byName = new Map(result.attributes.map((a) => [a.name, a]));
        expect(byName.get('name')?.value).toBe('Net revenue grew 18% month-over-month driven by enterprise renewals.');
        expect(byName.get('name')?.standardProperty).toBe('name');
        expect(byName.get('description')?.value).toBe('Review monthly recurring revenue performance and renewal drivers.');
        expect(byName.get('description')?.standardProperty).toBe('description');
        expect(byName.get('archetype')?.value).toBe('KPI Briefing');
        expect(byName.get('durationSeconds')?.value).toBe(60);
        expect(byName.get('formats')?.value).toEqual(['16:9', '9:16']);
        expect(byName.get('asOf')?.value).toBe('2026-10-16T18:00:00Z');

        const markdown = byName.get('displayMarkdown')?.value as string;
        expect(byName.get('displayMarkdown')?.standardProperty).toBe('displayMarkdown');
        expect(markdown).toContain('# Net revenue grew 18% month-over-month driven by enterprise renewals.');
        expect(markdown).toContain('KPI Briefing');
        expect(markdown).toContain('60s');
        expect(markdown).toContain('16:9, 9:16');
        expect(markdown).toContain('Delivered');
        expect(markdown).toContain('Data as of 2026-10-16T18:00:00Z');
        expect(markdown).toContain('Contains AI-generated assets: 1');
    });

    it('omits the data as-of and generated-assets lines when neither a snapshot nor generated assets exist', async () => {
        const spec = buildKpiBriefingFixture();
        delete spec.DataSnapshot;
        spec.Assets.Approved = spec.Assets.Approved.filter((a) => a.Provenance !== 'Generated');

        const result = await ArtifactExtractor.ExtractAttributes({
            content: JSON.stringify(spec),
            extractRules,
        });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        const byName = new Map(result.attributes.map((a) => [a.name, a]));
        expect(byName.get('asOf')?.value).toBeNull();
        const markdown = byName.get('displayMarkdown')?.value as string;
        expect(markdown).not.toContain('Data as of');
        expect(markdown).not.toContain('Contains AI-generated assets');
    });

    it('truncates a 150-character OneSentence to 100 characters and falls back to Archetype.Name when OneSentence is empty', async () => {
        const longSentence = 'A'.repeat(150);
        const longSpec = buildKpiBriefingFixture();
        longSpec.Film.OneSentence = longSentence;

        const longResult = await ArtifactExtractor.ExtractAttributes({
            content: JSON.stringify(longSpec),
            extractRules,
        });
        expect(longResult.success).toBe(true);
        const longName = longResult.attributes.find((a) => a.name === 'name')?.value as string;
        expect(longName).toHaveLength(100);
        expect(longName).toBe(longSentence.slice(0, 100));

        const emptySpec = buildKpiBriefingFixture();
        emptySpec.Film.OneSentence = '';

        const emptyResult = await ArtifactExtractor.ExtractAttributes({
            content: JSON.stringify(emptySpec),
            extractRules,
        });
        expect(emptyResult.success).toBe(true);
        const fallbackName = emptyResult.attributes.find((a) => a.name === 'name')?.value;
        expect(fallbackName).toBe('KPI Briefing');
    });

    it('returns safe fallbacks with zero errors when content is invalid JSON', async () => {
        const result = await ArtifactExtractor.ExtractAttributes({
            content: 'not json',
            extractRules,
        });

        expect(result.success).toBe(true);
        expect(result.errors).toEqual([]);

        const byName = new Map(result.attributes.map((a) => [a.name, a]));
        expect(byName.get('name')?.value).toBe('Video Production');
        expect(byName.get('description')?.value).toBeNull();
        expect(byName.get('archetype')?.value).toBeNull();
        expect(byName.get('durationSeconds')?.value).toBeNull();
        expect(byName.get('formats')?.value).toEqual([]);
        expect(byName.get('asOf')?.value).toBeNull();
        expect(byName.get('displayMarkdown')?.value).toBeNull();
    });
});
