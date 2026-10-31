import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import {
    DEFAULT_VIDEO_STUDIO_SETTINGS,
    ParseVideoStudioSettings,
    ResolveVideoStudioSettings,
} from '../settings.js';

describe('VideoStudioSettings (VS-AGT-2)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns Standard defaults when no params are supplied', () => {
        expect(ParseVideoStudioSettings()).toEqual({
            MaxRepairRounds: 2,
            RenderQuality: 'standard',
            Fps: 30,
            Formats: 'All',
            GenerationQuality: 'standard',
            MaxGeneratedVideoSeconds: 40,
            MaxRegenerations: 1,
        });
        expect(ParseVideoStudioSettings([])).toEqual(DEFAULT_VIDEO_STUDIO_SETTINGS);
    });

    it('parses the three AGT-1 preset parameter sets (Draft, Standard, High)', () => {
        const draftParams = [
            { Name: 'VideoStudio.MaxRepairRounds', Value: '0' },
            { Name: 'VideoStudio.RenderQuality', Value: 'draft' },
            { Name: 'VideoStudio.Fps', Value: '24' },
            { Name: 'VideoStudio.Formats', Value: 'First' },
            { Name: 'VideoStudio.GenerationQuality', Value: 'draft' },
            { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Value: '20' },
            { Name: 'VideoStudio.MaxRegenerations', Value: '1' },
        ];
        expect(ParseVideoStudioSettings(draftParams)).toEqual({
            MaxRepairRounds: 0,
            RenderQuality: 'draft',
            Fps: 24,
            Formats: 'First',
            GenerationQuality: 'draft',
            MaxGeneratedVideoSeconds: 20,
            MaxRegenerations: 1,
        });

        const standardParams = [
            { Name: 'VideoStudio.MaxRepairRounds', Value: '2' },
            { Name: 'VideoStudio.RenderQuality', Value: 'standard' },
            { Name: 'VideoStudio.Fps', Value: '30' },
            { Name: 'VideoStudio.Formats', Value: 'All' },
            { Name: 'VideoStudio.GenerationQuality', Value: 'standard' },
            { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Value: '40' },
            { Name: 'VideoStudio.MaxRegenerations', Value: '1' },
        ];
        expect(ParseVideoStudioSettings(standardParams)).toEqual({
            MaxRepairRounds: 2,
            RenderQuality: 'standard',
            Fps: 30,
            Formats: 'All',
            GenerationQuality: 'standard',
            MaxGeneratedVideoSeconds: 40,
            MaxRegenerations: 1,
        });

        const highParams = [
            { Name: 'VideoStudio.MaxRepairRounds', Value: '3' },
            { Name: 'VideoStudio.RenderQuality', Value: 'high' },
            { Name: 'VideoStudio.Fps', Value: '30' },
            { Name: 'VideoStudio.Formats', Value: 'All' },
            { Name: 'VideoStudio.GenerationQuality', Value: 'high' },
            { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Value: '60' },
            { Name: 'VideoStudio.MaxRegenerations', Value: '1' },
        ];
        expect(ParseVideoStudioSettings(highParams)).toEqual({
            MaxRepairRounds: 3,
            RenderQuality: 'high',
            Fps: 30,
            Formats: 'All',
            GenerationQuality: 'high',
            MaxGeneratedVideoSeconds: 60,
            MaxRegenerations: 1,
        });
    });

    it('keeps the default without throwing when given a bad number or invalid enum', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const parsed = ParseVideoStudioSettings([
            { Name: 'VideoStudio.MaxRepairRounds', Value: 'not-a-number' },
            { Name: 'VideoStudio.Fps', Value: '-10' },
            { Name: 'VideoStudio.RenderQuality', Value: 'ultra-8k' },
            { Name: 'VideoStudio.Formats', Value: 'Every' },
            { Name: 'VideoStudio.GenerationQuality', Value: 'bogus' },
            { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Value: '-5' },
            { Name: 'VideoStudio.MaxRegenerations', Value: 'NaN' },
        ]);

        expect(parsed).toEqual(DEFAULT_VIDEO_STUDIO_SETTINGS);
        expect(warnSpy).toHaveBeenCalled();
    });

    it('ResolveVideoStudioSettings returns defaults when configurationId is absent and reads AIEngine when present', () => {
        expect(ResolveVideoStudioSettings()).toEqual(DEFAULT_VIDEO_STUDIO_SETTINGS);
        expect(ResolveVideoStudioSettings(null)).toEqual(DEFAULT_VIDEO_STUDIO_SETTINGS);
        expect(ResolveVideoStudioSettings('   ')).toEqual(DEFAULT_VIDEO_STUDIO_SETTINGS);

        vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue({
            GetConfigurationParamsWithInheritance: (id: string) =>
                id === 'cfg-high'
                    ? [
                          { Name: 'VideoStudio.MaxRepairRounds', Value: '3' },
                          { Name: 'VideoStudio.RenderQuality', Value: 'high' },
                          { Name: 'VideoStudio.MaxGeneratedVideoSeconds', Value: '60' },
                      ]
                    : [],
        } as unknown as AIEngine);

        expect(ResolveVideoStudioSettings('cfg-high')).toEqual({
            ...DEFAULT_VIDEO_STUDIO_SETTINGS,
            MaxRepairRounds: 3,
            RenderQuality: 'high',
            MaxGeneratedVideoSeconds: 60,
        });
    });
});
