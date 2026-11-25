/**
 * @fileoverview One resolver for a source's web settings, so Extract and the website crawl read them alike: run, then
 * source, then the source's settings, then the source type; the first layer that sets a key wins.
 */
import { describe, expect, it } from 'vitest';
import {
    ConfiguredValue,
    DiscoverConfigurationLayers,
    MergedWebsiteConfiguration,
    WebsiteValue,
    TuningFor,
} from '../ConfigurationLayers.js';
import { ResolveWebFetchSettings, DEFAULT_USER_AGENT } from '../render/WebFetchSettings.js';

describe('the configuration layers', () => {
    const layers = {
        Run: { PageRenderMode: 'WhenEmpty', Website: { UserAgent: 'Run-UA' } },
        Source: { PageRenderer: 'Headless', Website: { MaxResponseBytes: 1000 } },
        Settings: { Website: { RenderTimeoutMs: 5000, UserAgent: 'Settings-UA' } },
        Type: { PageRenderer: 'TypeRenderer', PageRendererOptions: { WaitUntil: 'load' }, Website: { MaxDepth: 3, MaxResponseBytes: 9 } },
    };

    it('takes each key from the first layer that sets it', () => {
        expect(ConfiguredValue(layers, 'PageRenderer')).toBe('Headless');
        expect(ConfiguredValue(layers, 'PageRenderMode')).toBe('WhenEmpty');
        expect(WebsiteValue(layers, 'UserAgent')).toBe('Run-UA');
        expect(WebsiteValue(layers, 'MaxDepth')).toBe(3);
        expect(ConfiguredValue(layers, 'Nothing')).toBeUndefined();
    });

    it('resolves the web fetch settings from all four layers', () => {
        expect(ResolveWebFetchSettings(layers)).toEqual({
            PageRenderer: 'Headless',
            PageRenderMode: 'WhenEmpty',
            PageRendererOptions: { WaitUntil: 'load' },
            RenderTimeoutMs: 5000,
            UserAgent: 'Run-UA',
            MaxResponseBytes: 1000,
        });
    });

    it('merges Website keys across the layers, each from the first that sets it', () => {
        expect(MergedWebsiteConfiguration(layers)).toEqual({ UserAgent: 'Run-UA', MaxResponseBytes: 1000, RenderTimeoutMs: 5000, MaxDepth: 3 });
    });

    it("reads a Discover request's layers, the source's settings included", () => {
        const request = {
            Configuration: { SourceSpecificConfiguration: { Website: { MaxDepth: 1 } } },
            RunConfiguration: { PageRenderMode: 'Always' },
            TypeConfiguration: { PageRenderer: 'Headless' },
        };
        const resolved = DiscoverConfigurationLayers(request);
        expect(WebsiteValue(resolved, 'MaxDepth')).toBe(1);
        expect(ResolveWebFetchSettings(resolved).PageRenderer).toBe('Headless');
        expect(ResolveWebFetchSettings(resolved).PageRenderMode).toBe('Always');
    });

    it('ignores a value of the wrong shape (it does not fall through to a lower layer: the layer that set the key decides)', () => {
        const odd = { Source: { PageRendererOptions: ['not', 'an', 'object'], Website: { MaxResponseBytes: -1 } }, Type: { Website: { MaxResponseBytes: 50 } } };
        expect(TuningFor({ Settings: { Tuning: { MaxArchiveDepth: 2 } }, Source: { Tuning: { MaxArchiveDepth: 5 } } }).MaxArchiveDepth).toBe(5);
        const settings = ResolveWebFetchSettings(odd);
        expect(settings.PageRendererOptions).toBeUndefined();
        expect(settings.MaxResponseBytes).toBeUndefined();
        expect(settings.PageRenderer).toBeNull();
    });

    it('treats a blank string as unset, so a lower layer still decides', () => {
        const layers = { Run: { AccessDriverKey: '' }, Source: { PageRenderer: '  ', Website: { UserAgent: '' } }, Type: { AccessDriverKey: 'Credential', PageRenderer: 'Headless', Website: { UserAgent: 'Type-UA' } } };
        expect(ConfiguredValue(layers, 'AccessDriverKey')).toBe('Credential');
        expect(ResolveWebFetchSettings(layers).PageRenderer).toBe('Headless');
        expect(ResolveWebFetchSettings(layers).UserAgent).toBe('Type-UA');
    });

    it('lets a null or blank Tuning value fall through to a lower layer, and reads only own keys', () => {
        const tuning = TuningFor({ Run: { Tuning: { EmptyPageTextChars: null, MaxArchiveDepth: '' } }, Type: { Tuning: { EmptyPageTextChars: 50, MaxArchiveDepth: 4 } } });
        expect(tuning.EmptyPageTextChars).toBe(50);
        expect(tuning.MaxArchiveDepth).toBe(4);
        const inherited = Object.create({ PageRenderer: 'Inherited' }) as Record<string, unknown>;
        expect(ConfiguredValue({ Source: inherited, Type: { PageRenderer: 'Headless' } }, 'PageRenderer')).toBe('Headless');
    });

    it('sends a MemberJunction User-Agent unless a layer sets one', () => {
        expect(ResolveWebFetchSettings({}).UserAgent).toBe(DEFAULT_USER_AGENT);
        expect(ResolveWebFetchSettings({ Type: { Website: { UserAgent: 'Acme-Bot/2' } } }).UserAgent).toBe('Acme-Bot/2');
    });
});
