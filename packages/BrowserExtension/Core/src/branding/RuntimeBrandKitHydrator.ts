/**
 * @fileoverview `RuntimeBrandKitHydrator` — Runtime Brand Kit & Theme Engine Hydration
 * for the MemberJunction Browser Extension.
 *
 * Bridges `@memberjunction/theme-engine` (`Derive`, `EmitOverlayCss`, `SanitizeThemeSeeds`)
 * with the Browser Extension Side Panel and Content Script Coach-Mark overlay so:
 * 1. Build-time baked `mj-extension-brand.json` seeds render instantly at 0ms startup.
 * 2. When a user signs into their MemberJunction server (`MJAPI`), any tenant `MJ: Brand Kits`
 *    record or `IAgentSettings.BrowserExtension.BrandKitID` override dynamically updates the
 *    extension's `--mj-*` CSS custom properties without rebuilding the extension binary.
 *
 * @module @memberjunction/browser-extension-core
 */

import {
    Derive,
    EmitOverlayCss,
    MJ_DEFAULT_SEEDS,
    SanitizeThemeSeeds,
    type DerivedTheme,
    type ThemeSeeds,
} from '@memberjunction/theme-engine';
import type { ExtensionBrandProfile } from '../types/extension-types.js';

/**
 * Hydrated brand theme bundle ready to inject into the Side Panel `<style>` tag
 * and Content Script Coach-Mark Shadow DOM.
 */
export interface HydratedExtensionBrandTheme {
    /** Brand slug (e.g. `'mj-copilot'`, `'betty'`, `'sidecar'`). */
    BrandSlug: string;
    /** Display name of the extension brand. */
    BrandName: string;
    /** Assistant persona display name (e.g. `'MJ Co-Pilot'`, `'Betty'`, `'Sidecar'`). */
    AssistantDisplayName: string;
    /** Tagline or subtitle displayed in the Side Panel header. */
    Tagline: string;
    /** Derived `@memberjunction/theme-engine` theme (ramps, light/dark semantic maps, contrast report). */
    Derived: DerivedTheme;
    /** Scoped CSS overlay (`[data-theme-overlay="<BrandSlug>"] { ... }`) + `:root` semantic variables. */
    StylesheetCss: string;
}

const SANS_FALLBACK_STACK = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
const MONO_FALLBACK_STACK = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

/**
 * Ensures brand-kit font families (e.g. `"MJ Sans"` or `"Instrument Sans"`) always end
 * with a cross-platform generic fallback stack so browsers never fall back to Times/serif
 * when a custom webfont is not installed locally.
 */
export function EnsureFontFallbackStack(fontFamily: string | undefined, kind: 'sans' | 'mono'): string {
    const trimmed = (fontFamily ?? '').trim();
    if (!trimmed) {
        return kind === 'mono' ? MONO_FALLBACK_STACK : SANS_FALLBACK_STACK;
    }
    const lower = trimmed.toLowerCase();
    if (kind === 'mono') {
        return lower.includes('monospace') ? trimmed : `${trimmed}, ${MONO_FALLBACK_STACK}`;
    }
    if (lower.includes('sans-serif') || lower.includes('system-ui') || lower.includes('serif')) {
        return trimmed;
    }
    return `${trimmed}, ${SANS_FALLBACK_STACK}`;
}

/**
 * Hydrates `@memberjunction/theme-engine` token contracts from an {@link ExtensionBrandProfile}
 * or a runtime `MJ: Brand Kits` seed payload.
 */
export class RuntimeBrandKitHydrator {
    /**
     * Derives the full `--mj-*` CSS stylesheet and token maps from an {@link ExtensionBrandProfile}.
     */
    public HydrateFromBrandProfile(profile: ExtensionBrandProfile): HydratedExtensionBrandTheme {
        const rawSeeds = SanitizeThemeSeeds(profile.ThemeSeeds) ?? MJ_DEFAULT_SEEDS;
        const sanitized: ThemeSeeds = {
            ...rawSeeds,
            fontFamily: EnsureFontFallbackStack(rawSeeds.fontFamily, 'sans'),
            fontFamilyMono: EnsureFontFallbackStack(rawSeeds.fontFamilyMono, 'mono'),
        };
        const derived = Derive(sanitized);
        const css = this.BuildExtensionStylesheet(profile.BrandSlug, derived);

        return {
            BrandSlug: profile.BrandSlug,
            BrandName: profile.BrandName,
            AssistantDisplayName: profile.AssistantDisplayName,
            Tagline: profile.Tagline,
            Derived: derived,
            StylesheetCss: css,
        };
    }

    /**
     * Hydrates a runtime `MJ: Brand Kits` override on top of a base {@link ExtensionBrandProfile}.
     */
    public HydrateRuntimeBrandKitOverride(
        baseProfile: ExtensionBrandProfile,
        runtimeBrandKit: {
            Name?: string;
            SeedsJson?: string | Record<string, unknown>;
        }
    ): HydratedExtensionBrandTheme {
        let parsedSeeds: unknown = runtimeBrandKit.SeedsJson;
        if (typeof parsedSeeds === 'string') {
            try {
                parsedSeeds = JSON.parse(parsedSeeds);
            } catch {
                parsedSeeds = null;
            }
        }

        const rawRuntimeSeeds: ThemeSeeds =
            SanitizeThemeSeeds(parsedSeeds) ??
            SanitizeThemeSeeds(baseProfile.ThemeSeeds) ??
            MJ_DEFAULT_SEEDS;
        const sanitizedRuntimeSeeds: ThemeSeeds = {
            ...rawRuntimeSeeds,
            fontFamily: EnsureFontFallbackStack(rawRuntimeSeeds.fontFamily, 'sans'),
            fontFamilyMono: EnsureFontFallbackStack(rawRuntimeSeeds.fontFamilyMono, 'mono'),
        };

        const derived = Derive(sanitizedRuntimeSeeds);
        const css = this.BuildExtensionStylesheet(baseProfile.BrandSlug, derived);

        return {
            BrandSlug: baseProfile.BrandSlug,
            BrandName: runtimeBrandKit.Name?.trim() || baseProfile.BrandName,
            AssistantDisplayName: baseProfile.AssistantDisplayName,
            Tagline: baseProfile.Tagline,
            Derived: derived,
            StylesheetCss: css,
        };
    }

    /**
     * Emits a complete extension stylesheet that includes both:
     * 1. The `@memberjunction/theme-engine` `EmitOverlayCss(brandSlug, derived)` primitive block
     * 2. `:root, :host` light & `[data-theme="dark"]` semantic `--mj-*` token definitions so
     *    standalone extension Side Panels and Shadow-DOM Coach-Marks work out-of-the-box.
     */
    public BuildExtensionStylesheet(brandSlug: string, derived: DerivedTheme): string {
        const overlayBlock = EmitOverlayCss(brandSlug, derived);
        const mergedLightVars: Record<string, string> = {
            ...derived.overlayVars,
            ...derived.tokens.light,
        };
        if (mergedLightVars['--mj-font-family'] && !mergedLightVars['--mj-font-family-base']) {
            mergedLightVars['--mj-font-family-base'] = mergedLightVars['--mj-font-family'];
        }
        const rootVars = Object.entries(mergedLightVars)
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n');

        const darkVars = Object.entries(derived.tokens.dark)
            .map(([k, v]) => `  ${k}: ${v};`)
            .join('\n');

        return [
            `/* Generated by @memberjunction/theme-engine for brand "${brandSlug}" */`,
            overlayBlock.trim(),
            `:root, :host {\n${rootVars}\n}`,
            `[data-theme="dark"], :host([data-theme="dark"]) {\n${darkVars}\n}`,
        ].join('\n\n') + '\n';
    }

    /**
     * Injects or updates a `<style id="mj-extension-brand-theme">` element in a target `Document` or `ShadowRoot`.
     */
    public ApplyThemeToDocument(
        docOrShadow: Document | ShadowRoot,
        theme: HydratedExtensionBrandTheme
    ): HTMLStyleElement {
        const styleId = 'mj-extension-brand-theme';
        const existing = docOrShadow.getElementById
            ? (docOrShadow.getElementById(styleId) as HTMLStyleElement | null)
            : (docOrShadow.querySelector(`#${styleId}`) as HTMLStyleElement | null);

        if (existing) {
            existing.textContent = theme.StylesheetCss;
            return existing;
        }

        const ownerDoc = 'createElement' in docOrShadow ? docOrShadow : docOrShadow.ownerDocument;
        const styleEl = ownerDoc.createElement('style');
        styleEl.id = styleId;
        styleEl.setAttribute('data-mj-brand-slug', theme.BrandSlug);
        styleEl.textContent = theme.StylesheetCss;

        if ('head' in docOrShadow && docOrShadow.head) {
            docOrShadow.head.appendChild(styleEl);
        } else {
            docOrShadow.appendChild(styleEl);
        }

        if ('documentElement' in docOrShadow && docOrShadow.documentElement) {
            docOrShadow.documentElement.setAttribute('data-theme-overlay', theme.BrandSlug);
        }

        return styleEl;
    }
}
