import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    VIDEO_FORMATS,
    VIDEO_INTERACTION_MODES,
    VideoBeatTemplate,
    VideoPacing,
} from '@memberjunction/video-studio-core';
import {
    MJBrandKitEntity_IBrandStyle,
    MJBrandKitEntity_IBrandGenerationPolicy,
    MJBrandKitEntity_BrandNeverInventItem,
} from '@memberjunction/core-entities';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const METADATA_ROOT = path.resolve(__dirname, '../../../../../../metadata');
const ARCHETYPES_DIR = path.join(METADATA_ROOT, 'video-archetypes');
const BRAND_KITS_DIR = path.join(METADATA_ROOT, 'brand-kits');

interface ArchetypeSeedRecord {
    fields: {
        Name: string;
        Description: string;
        Category: string;
        MinDurationSeconds: number;
        DefaultDurationSeconds: number;
        MaxDurationSeconds: number;
        DefaultFormats: string;
        BeatTemplate: VideoBeatTemplate[];
        Pacing: VideoPacing;
        Guidance: string;
        DefaultInteractionMode: string;
        CompanyID?: string | null;
        Status: string;
    };
    primaryKey: { ID: string };
    sync?: unknown;
}

interface BrandKitSeedRecord {
    fields: {
        Name: string;
        Description: string;
        CompanyID?: string | null;
        IsDefault: boolean;
        Style: MJBrandKitEntity_IBrandStyle;
        Voice?: unknown;
        GenerationPolicy: MJBrandKitEntity_IBrandGenerationPolicy;
        NeverInvent: MJBrandKitEntity_BrandNeverInventItem[];
        Status: string;
    };
    primaryKey: { ID: string };
    relatedEntities?: Record<string, unknown[]>;
    sync?: unknown;
}

const EXPECTED_ARCHETYPES: ReadonlyArray<{
    Name: string;
    Category: string;
    Min: number;
    Default: number;
    Max: number;
    DefaultFormats: string;
    DefaultInteractionMode: string;
    RequiresDataBinding: boolean;
}> = [
    { Name: 'Topic Explainer', Category: 'Explainer', Min: 60, Default: 90, Max: 120, DefaultFormats: '16:9', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: false },
    { Name: 'Product Launch', Category: 'Product', Min: 15, Default: 25, Max: 30, DefaultFormats: '16:9,9:16', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: false },
    { Name: 'KPI Briefing', Category: 'DataStory', Min: 45, Default: 60, Max: 90, DefaultFormats: '16:9', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: true },
    { Name: 'Data Story', Category: 'DataStory', Min: 60, Default: 90, Max: 180, DefaultFormats: '16:9', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: true },
    { Name: 'Social Short', Category: 'Social', Min: 10, Default: 20, Max: 30, DefaultFormats: '9:16', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: false },
    { Name: 'How-To Tutorial', Category: 'Tutorial', Min: 60, Default: 90, Max: 180, DefaultFormats: '16:9', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: false },
    { Name: 'Announcement', Category: 'Announcement', Min: 15, Default: 30, Max: 45, DefaultFormats: '16:9,9:16', DefaultInteractionMode: 'Autonomous', RequiresDataBinding: false },
    { Name: 'Executive Briefing', Category: 'Briefing', Min: 90, Default: 120, Max: 180, DefaultFormats: '16:9', DefaultInteractionMode: 'ApproveStoryboard', RequiresDataBinding: true },
];

const ALLOWED_ARCHETYPE_CATEGORIES = new Set<string>([
    'Explainer',
    'Product',
    'DataStory',
    'Social',
    'Tutorial',
    'Announcement',
    'Briefing',
]);

describe('Video Studio seed metadata (VS-FND-4)', () => {
    const archetypesRaw = fs.readFileSync(path.join(ARCHETYPES_DIR, '.video-archetypes.json'), 'utf8');
    const archetypes = JSON.parse(archetypesRaw) as ArchetypeSeedRecord[];

    const brandKitsRaw = fs.readFileSync(path.join(BRAND_KITS_DIR, '.brand-kits.json'), 'utf8');
    const brandKits = JSON.parse(brandKitsRaw) as BrandKitSeedRecord[];

    it('seeds exactly the eight canonical video archetypes with valid categories, durations, formats, and interaction modes', () => {
        expect(archetypes.map((a) => a.fields.Name)).toEqual(EXPECTED_ARCHETYPES.map((e) => e.Name));

        for (let i = 0; i < EXPECTED_ARCHETYPES.length; i++) {
            const expected = EXPECTED_ARCHETYPES[i];
            const record = archetypes[i];
            const { fields } = record;

            expect(record.sync).toBeUndefined();
            expect(fields.CompanyID).toBeUndefined();
            expect(fields.Status).toBe('Active');
            expect(ALLOWED_ARCHETYPE_CATEGORIES.has(fields.Category)).toBe(true);
            expect(fields.Category).toBe(expected.Category);

            expect(fields.MinDurationSeconds).toBe(expected.Min);
            expect(fields.DefaultDurationSeconds).toBe(expected.Default);
            expect(fields.MaxDurationSeconds).toBe(expected.Max);
            expect(fields.MinDurationSeconds).toBeLessThanOrEqual(fields.DefaultDurationSeconds);
            expect(fields.DefaultDurationSeconds).toBeLessThanOrEqual(fields.MaxDurationSeconds);

            expect(fields.DefaultFormats).toBe(expected.DefaultFormats);
            const formatList = fields.DefaultFormats.split(',').map((f) => f.trim());
            expect(formatList.length).toBeGreaterThan(0);
            for (const fmt of formatList) {
                expect((VIDEO_FORMATS as readonly string[]).includes(fmt)).toBe(true);
            }

            expect(fields.DefaultInteractionMode).toBe(expected.DefaultInteractionMode);
            expect((VIDEO_INTERACTION_MODES as readonly string[]).includes(fields.DefaultInteractionMode)).toBe(true);
        }
    });

    it('enforces BeatTemplate, Guidance file, and Pacing invariants on every archetype', () => {
        for (let i = 0; i < EXPECTED_ARCHETYPES.length; i++) {
            const expected = EXPECTED_ARCHETYPES[i];
            const { fields } = archetypes[i];
            const beats = fields.BeatTemplate;

            expect(Array.isArray(beats)).toBe(true);
            expect(beats.length).toBeGreaterThanOrEqual(2);

            // First beat hook <= 3s, last beat close
            expect(beats[0].Key).toBe('hook');
            expect(beats[0].MaxDurationSeconds).toBeLessThanOrEqual(3);
            const lastBeat = beats[beats.length - 1];
            expect(lastBeat.Key).toBe('close');

            // Unique beat keys and valid per-beat durations
            const beatKeys = new Set<string>();
            let sumMin = 0;
            let sumMax = 0;
            for (const beat of beats) {
                expect(beatKeys.has(beat.Key)).toBe(false);
                beatKeys.add(beat.Key);
                expect(beat.MinDurationSeconds).toBeLessThanOrEqual(beat.DefaultDurationSeconds);
                expect(beat.DefaultDurationSeconds).toBeLessThanOrEqual(beat.MaxDurationSeconds);
                sumMin += beat.MinDurationSeconds;
                sumMax += beat.MaxDurationSeconds;
            }

            expect(sumMin).toBeLessThanOrEqual(fields.MinDurationSeconds);
            expect(sumMax).toBeGreaterThanOrEqual(fields.MaxDurationSeconds);

            if (expected.RequiresDataBinding) {
                expect(beats.some((b) => b.RequiresDataBinding === true)).toBe(true);
                expect(lastBeat.Guidance).toContain('Data as of {AsOf}');
            }

            // Guidance @file: exists and is non-empty (15-40 lines)
            expect(fields.Guidance.startsWith('@file:')).toBe(true);
            const guidanceRelPath = fields.Guidance.slice('@file:'.length);
            const guidanceFullPath = path.join(ARCHETYPES_DIR, guidanceRelPath);
            expect(fs.existsSync(guidanceFullPath)).toBe(true);
            const guidanceText = fs.readFileSync(guidanceFullPath, 'utf8').trim();
            expect(guidanceText.length).toBeGreaterThan(0);
            const lineCount = guidanceText.split('\n').length;
            expect(lineCount).toBeGreaterThanOrEqual(15);
            expect(lineCount).toBeLessThanOrEqual(40);

            // Pacing invariants
            expect(fields.Pacing.AvgSecondsBetweenChanges).toBeGreaterThan(0);
            expect(typeof fields.Pacing.HoldRules).toBe('string');
            expect(fields.Pacing.HoldRules.trim().length).toBeGreaterThan(0);
        }
    });

    it('seeds the sample MemberJunction brand kit as non-default, org-wide, without synthetic people or asset rows', () => {
        expect(brandKits).toHaveLength(1);
        const kit = brandKits[0];
        const { fields } = kit;

        expect(kit.sync).toBeUndefined();
        expect(fields.Name).toBe('MemberJunction');
        expect(fields.IsDefault).toBe(false);
        expect(fields.CompanyID).toBeUndefined();
        expect(fields.Voice).toBeUndefined();
        expect(fields.GenerationPolicy.AllowSyntheticPeople).toBe(false);
        expect(kit.relatedEntities).toBeUndefined();

        expect(fields.Style.Palette.length).toBeGreaterThan(0);
        for (const color of fields.Style.Palette) {
            expect(color.Value).toMatch(/^#[0-9A-F]{6}$/i);
            expect(typeof color.Usage).toBe('string');
            expect((color.Usage ?? '').trim().length).toBeGreaterThan(0);
        }

        // Must match BUNDLED_DEFAULT_FONTS in @memberjunction/video-studio-render-worker
        // (Engine cannot import RenderWorker directly).
        const bundledDefaultFonts = ['MJ Sans', 'MJ Mono'];
        for (const typeSpec of fields.Style.Typography) {
            expect(typeSpec.FontAssetID).toBeUndefined();
            if (!typeSpec.FontAssetID) {
                expect(bundledDefaultFonts).toContain(typeSpec.FontFamily);
            }
        }
    });
});
