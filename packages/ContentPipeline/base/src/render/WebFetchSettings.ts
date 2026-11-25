/**
 * @fileoverview A source's web settings (`PageRenderer`, `PageRenderMode`, `PageRendererOptions`, `Website.*`), read the
 * same way by Extract and the website crawl, from the source's configuration layers (see `ConfigurationLayers.ts`).
 *
 * @module @memberjunction/content-pipeline-base
 */

import { IsPlainObject } from '@memberjunction/global';
import { ConfiguredValue, NonEmptyString, SourceConfigurationLayers, WebsiteValue } from '../ConfigurationLayers.js';
import { PositiveInteger } from '../PipelineTuning.js';
import { PageRenderMode, PageRenderOptions, ResolvePageRenderMode } from './BasePageRenderer.js';

/**
 * The `User-Agent` plain requests send when the source sets no `Website.UserAgent`: a browser-like product token (the
 * RSS autotagger's), since many sites refuse a runtime's own (`node`).
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; MemberJunction/1.0)';

/** How a source's web pages are fetched and rendered, resolved across its configuration layers. */
export interface WebFetchSettings {
    /** The registered page renderer (`PageRenderer`), or null for plain HTTP. */
    PageRenderer: string | null;
    /** When the renderer is used (`PageRenderMode`). */
    PageRenderMode: PageRenderMode;
    /** How the renderer loads a page (`PageRendererOptions`). */
    PageRendererOptions?: PageRenderOptions;
    /** `Website.RenderTimeoutMs`. */
    RenderTimeoutMs?: number;
    /** `Website.UserAgent`: the User-Agent plain requests send; {@link DEFAULT_USER_AGENT} when unset. */
    UserAgent: string;
    /** `Website.MaxResponseBytes`: the most bytes of one response read. */
    MaxResponseBytes?: number;
}

/** A source's web fetch settings, from its layers. */
export function ResolveWebFetchSettings(layers: SourceConfigurationLayers): WebFetchSettings {
    const options = ConfiguredValue(layers, 'PageRendererOptions');
    return {
        PageRenderer: NonEmptyString(ConfiguredValue(layers, 'PageRenderer')) ?? null,
        PageRenderMode: ResolvePageRenderMode(ConfiguredValue(layers, 'PageRenderMode')),
        PageRendererOptions: IsPlainObject(options) ? (options as PageRenderOptions) : undefined,
        RenderTimeoutMs: PositiveInteger(WebsiteValue(layers, 'RenderTimeoutMs')) ?? undefined,
        UserAgent: NonEmptyString(WebsiteValue(layers, 'UserAgent')) ?? DEFAULT_USER_AGENT,
        MaxResponseBytes: PositiveInteger(WebsiteValue(layers, 'MaxResponseBytes')) ?? undefined,
    };
}
