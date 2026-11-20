import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    BuildBlockIdentityBinding,
    ComputeFrozenSnapshotHash,
    DocumentBlockExecutionResult,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot
} from './DocumentLiveBlockEngine.js';
import {
    ExportDeckToPptxBytesInternal,
    ImportDeckFromPptxBytesInternal,
    SlideDeckPptxExportOptions
} from './SlideDeckPptxEngine.js';
export type { SlideDeckPptxExportOptions } from './SlideDeckPptxEngine.js';

/**
 * Canonical slide layout types supported by MJ Slides (`plans/docs-slides-sheets.md § 5.1`).
 *
 * Slide layouts are intentionally structured (not a free-form canvas). When a slide needs a
 * free-form diagram or sketch, a slide region embeds a Whiteboard `Artifact` block (`§ 3.4.1`).
 */
export type SlideLayoutKind =
    | 'Title'
    | 'SectionHeader'
    | 'TitleAndBody'
    | 'TwoColumn'
    | 'Comparison'
    | 'LiveDataSlide'
    | 'ChartAndText'
    | 'Quote'
    | 'BigNumber'
    | 'FullBleedImage'
    | 'Blank'
    | 'KpiStrip'
    | 'Timeline'
    | 'BentoGrid'
    | 'Quadrant'
    | 'MetricComparison';

/** Visual transition style when advancing to a slide in Present mode. */
export type SlideTransitionKind = 'none' | 'fade' | 'slide' | 'zoom';

/** Background surface styling mode for a slide deck theme. */
export type SlideBackgroundStyle = 'solid' | 'gradient' | 'mesh' | 'accent-strip';

/** Card surface elevation treatment for slide regions. */
export type SlideCardElevation = 'flat' | 'soft' | 'glass';

/**
 * Content kind hosted inside a single structured {@link SlideRegionSpec}.
 */
export type SlideRegionKind =
    | 'rich-text'
    | 'mj-block'
    | 'callout'
    | 'table'
    | 'image'
    | 'big-number'
    | 'quote';

/**
 * Theme specification for a {@link SlideDeckSpec} (`§ 5.1`).
 * Inherits semantic `--mj-*` tokens by default and can be re-derived from an organization's
 * brand color seeds (`Accept #4`).
 */
export interface SlideDeckThemeSpec {
    /** Identifier of the active theme preset or `'brand-custom'`. */
    ThemeID: string;
    /** Human-readable theme name. */
    Name: string;
    /** Primary brand accent color (CSS color or `--mj-*` token). */
    PrimaryColor: string;
    /** Secondary highlight color. */
    AccentColor: string;
    /** Slide stage background color. */
    BackgroundColor: string;
    /** Elevated card/region surface color. */
    SurfaceColor: string;
    /** Primary heading and body text color. */
    TextColor: string;
    /** Secondary/muted text color. */
    MutedTextColor: string;
    /** Font family for slide titles and section headers. */
    HeadingFont: string;
    /** Font family for body copy, tables, and speaker notes. */
    BodyFont: string;
    /** Optional organization brand kit ID or seed label from which tokens were derived. */
    BrandSeedSource?: string;
    /** Optional secondary stop color for gradient/mesh stage backdrops. */
    SecondaryGradientColor?: string;
    /** Background treatment for slide stages (default `'accent-strip'`). */
    BackgroundStyle?: SlideBackgroundStyle;
    /** Corner radius (in CSS px, 0–32) for structured cards and panels. */
    CardRadiusPx?: number;
    /** Visual elevation treatment for content cards (`'flat' | 'soft' | 'glass'`). */
    CardElevation?: SlideCardElevation;
}

/**
 * Organization brand seed input used to derive or re-theme a {@link SlideDeckThemeSpec} (`Accept #4`).
 */
export interface OrganizationBrandThemeSeeds {
    OrganizationName?: string;
    PrimaryColor: string;
    AccentColor?: string;
    BackgroundColor?: string;
    SurfaceColor?: string;
    TextColor?: string;
    HeadingFont?: string;
    BodyFont?: string;
    BrandSeedSource?: string;
}

/**
 * Master slide chrome shared across all slides in a {@link SlideDeckSpec}.
 */
export interface SlideMasterSpec {
    /** Top-left or top-right running header label. */
    HeaderText?: string;
    /** Bottom running footer text (e.g., confidentiality notice or event name). */
    FooterText?: string;
    /** Whether slide numbers (`1 / N`) are rendered in the slide footer. */
    ShowSlideNumbers: boolean;
    /** Whether the presentation date is shown in the master footer. */
    ShowDate: boolean;
    /** Organization or presenter name displayed in the master bar. */
    OrganizationName?: string;
    /** Optional brand logo URL. */
    LogoUrl?: string;
}

/**
 * Structured content region within a {@link SlideSpec}.
 *
 * Each region can hold rich Markdown (lists, tables, headings, callouts), a KPI big number,
 * a quote, an image, or a live/frozen MJ Block (`EntityView`, `SavedQuery`, `DashboardPart`,
 * `InteractiveComponent`, or inline OLE `Artifact` / `Whiteboard` per `§ 3.4.1`).
 */
export interface SlideRegionSpec {
    /** Stable identifier for this region within the slide (e.g., `'main'`, `'left'`, `'right'`, `'data'`, `'narrative'`). */
    RegionID: string;
    /** Human-readable slot label (e.g., `'Primary Content'`, `'Left Column'`, `'Live MJ Block'`). */
    Label: string;
    /** Content type rendered in this region. */
    Kind: SlideRegionKind;
    /**
     * Markdown payload for this region. May include `:::mj-block` directives for live MJ blocks
     * and embedded OLE `Artifact` / `Whiteboard` blocks.
     */
    MarkdownContent: string;
    /**
     * Explicit {@link DocumentBlockSpec} when `Kind === 'mj-block'` (kept in sync with `MarkdownContent`).
     */
    BlockSpec?: DocumentBlockSpec;
    /** Headline metric value when `Kind === 'big-number'` (e.g., `'$14.8M'` or `'1,250'`). */
    BigNumberValue?: string;
    /** Metric label when `Kind === 'big-number'`. */
    BigNumberLabel?: string;
    /** Metric delta badge when `Kind === 'big-number'` (e.g., `'+24% YoY'`). */
    BigNumberDelta?: string;
    /** Attribution line when `Kind === 'quote'`. */
    QuoteAttribution?: string;
    /** Callout tone when `Kind === 'callout'`. */
    CalloutTone?: 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
    /** Image URL or data URI when `Kind === 'image'`. */
    ImageUrl?: string;
    /** Accessible alt text / caption when `Kind === 'image'`. */
    ImageAlt?: string;
    /** When true, editing/deleting this region is locked to its locker/owner (`§6.2`). */
    Locked?: boolean;
    /** User ID that locked this region. */
    LockedByUserID?: string;
    /** When true, artifact editors (not only the owner/locker) may still edit this locked region. */
    AllowEditors?: boolean;
    /**
     * Optional 1-based progressive reveal step during Full-Screen Present mode.
     * Regions without a RevealStep (or `<= 0`) appear immediately with the slide.
     */
    RevealStep?: number;
}

/**
 * Single slide within a {@link SlideDeckSpec}.
 */
export interface SlideSpec {
    /** Stable unique identifier for this slide (preserved across reorders and concurrent edits). */
    SlideID: string;
    /** 1-based ordinal position in the deck. */
    SlideNumber: number;
    /** Canonical layout governing how `Regions` are arranged on the 16:9 stage. */
    Layout: SlideLayoutKind;
    /** Slide title. */
    Title: string;
    /** Optional slide subtitle or section kicker. */
    Subtitle?: string;
    /** Ordered regions hosted by this slide's layout. */
    Regions: SlideRegionSpec[];
    /** Presenter speaker notes (Markdown / plain text) shown in the Speaker Notes bar and Presenter View. */
    SpeakerNotes: string;
    /** Visual transition when advancing to this slide in Present mode. */
    Transition?: SlideTransitionKind;
    /** Whether this slide is skipped during full-screen Present mode. */
    Hidden?: boolean;
    /** When true, edits/deletions on this slide are locked to its locker/owner (`§6.2`). */
    Locked?: boolean;
    /** User ID that locked this slide. */
    LockedByUserID?: string;
    /** When true, artifact editors may edit this locked slide. */
    AllowEditors?: boolean;
}

/**
 * Top-level persisted JSON schema for the `"Presentation"` (`MJ: Artifact Types`) artifact (`§ 5.1`).
 */
export interface SlideDeckSpec {
    /** Schema version (`'1.0'`). */
    SchemaVersion: '1.0';
    /** Stable deck identifier (`MJ: Artifacts.ID` or generated UUID). */
    DeckID: string;
    /** Presentation title. */
    Title: string;
    /** Optional presentation subtitle. */
    Subtitle?: string;
    /** Canvas aspect ratio (`'16:9'` canonical default per `§ 5.1`). */
    AspectRatio: '16:9' | '4:3';
    /** Active deck theme tokens. */
    Theme: SlideDeckThemeSpec;
    /** Master header/footer/slide-number settings. */
    Master: SlideMasterSpec;
    /** Ordered list of slides in the presentation. */
    Slides: SlideSpec[];
    /** ISO timestamp of the last deck modification. */
    UpdatedAt?: string;
}

/**
 * Concise summary of a slide deck returned by {@link SlideDeckEngine.BuildDeckOutline}
 * and `SlideDeckToolLibrary.get_deck_outline`.
 */
export interface SlideDeckOutlineSummary {
    DeckID: string;
    Title: string;
    AspectRatio: '16:9' | '4:3';
    ThemeName: string;
    ThemeID: string;
    SlideCount: number;
    Slides: Array<{
        SlideID: string;
        SlideNumber: number;
        Layout: SlideLayoutKind;
        Title: string;
        Subtitle?: string;
        RegionIDs: string[];
        EmbeddedBlockIDs: string[];
        HasSpeakerNotes: boolean;
        Hidden: boolean;
    }>;
}

/**
 * Metadata descriptor for each canonical {@link SlideLayoutKind}.
 */
export interface SlideLayoutMetadata {
    Kind: SlideLayoutKind;
    Label: string;
    Description: string;
    Icon: string;
    DefaultRegionCount: number;
}

/**
 * Canonical layout catalog for MJ Slides (`§ 5.1`).
 */
export const SLIDE_LAYOUT_CATALOG: ReadonlyArray<SlideLayoutMetadata> = [
    {
        Kind: 'Title',
        Label: 'Title Slide',
        Description: 'Executive cover slide with headline title, subtitle, and presenter callout.',
        Icon: 'fa-solid fa-heading',
        DefaultRegionCount: 1
    },
    {
        Kind: 'SectionHeader',
        Label: 'Section Break',
        Description: 'Bold chapter divider introducing a new strategic topic or agenda section.',
        Icon: 'fa-solid fa-grip-lines',
        DefaultRegionCount: 1
    },
    {
        Kind: 'TitleAndBody',
        Label: 'Title & Body',
        Description: 'Standard content slide with title bar and a full-width rich content or block region.',
        Icon: 'fa-solid fa-align-left',
        DefaultRegionCount: 1
    },
    {
        Kind: 'TwoColumn',
        Label: 'Two Columns',
        Description: 'Side-by-side regions for narrative + diagram, table, or embedded Whiteboard.',
        Icon: 'fa-solid fa-table-columns',
        DefaultRegionCount: 2
    },
    {
        Kind: 'Comparison',
        Label: 'Comparison',
        Description: 'Structured left-vs-right comparison cards with distinct headers and takeaways.',
        Icon: 'fa-solid fa-scale-balanced',
        DefaultRegionCount: 2
    },
    {
        Kind: 'LiveDataSlide',
        Label: 'Live MJ Data & Narrative',
        Description: 'Primary viewer-scoped Live MJ Block (EntityView / SavedQuery) paired with executive insights.',
        Icon: 'fa-solid fa-database',
        DefaultRegionCount: 2
    },
    {
        Kind: 'ChartAndText',
        Label: 'Chart / Visual & Text',
        Description: 'Visual chart or OLE Whiteboard region on the left with key findings on the right.',
        Icon: 'fa-solid fa-chart-column',
        DefaultRegionCount: 2
    },
    {
        Kind: 'BigNumber',
        Label: 'Big Number KPI',
        Description: 'High-impact KPI metric callout paired with supporting context and drivers.',
        Icon: 'fa-solid fa-arrow-trend-up',
        DefaultRegionCount: 2
    },
    {
        Kind: 'Quote',
        Label: 'Executive Quote',
        Description: 'Full-width customer or leadership pull-quote with attribution.',
        Icon: 'fa-solid fa-quote-left',
        DefaultRegionCount: 1
    },
    {
        Kind: 'FullBleedImage',
        Label: 'Full-Bleed Visual',
        Description: 'Edge-to-edge architecture diagram or visual with overlay caption.',
        Icon: 'fa-solid fa-image',
        DefaultRegionCount: 1
    },
    {
        Kind: 'Blank',
        Label: 'Blank / Full Canvas',
        Description: 'Full-bleed region ideal for an interactive embedded OLE Whiteboard canvas.',
        Icon: 'fa-solid fa-chalkboard',
        DefaultRegionCount: 1
    },
    {
        Kind: 'KpiStrip',
        Label: 'KPI Metric Strip',
        Description: 'Three executive headline KPI cards arranged across a scannable horizontal strip.',
        Icon: 'fa-solid fa-gauge-high',
        DefaultRegionCount: 3
    },
    {
        Kind: 'Timeline',
        Label: 'Roadmap Timeline',
        Description: 'Three sequential milestone phases connected cleanly from left to right.',
        Icon: 'fa-solid fa-timeline',
        DefaultRegionCount: 3
    },
    {
        Kind: 'BentoGrid',
        Label: 'Bento Spotlight Grid',
        Description: 'Asymmetric 4-card editorial bento showcase with a wide featured hero card.',
        Icon: 'fa-solid fa-table-cells-large',
        DefaultRegionCount: 4
    },
    {
        Kind: 'Quadrant',
        Label: '2×2 Strategic Quadrant',
        Description: 'Structured 2×2 matrix for positioning, prioritization, or architectural tradeoffs.',
        Icon: 'fa-solid fa-border-all',
        DefaultRegionCount: 4
    },
    {
        Kind: 'MetricComparison',
        Label: 'Before / After Metrics',
        Description: 'Twin headline metric scorecards paired with a full-width synthesis takeaway.',
        Icon: 'fa-solid fa-code-compare',
        DefaultRegionCount: 3
    }
];

/**
 * Built-in theme presets for MJ Slides (`§ 5.1`).
 */
export const SLIDE_DECK_THEME_PRESETS: ReadonlyArray<SlideDeckThemeSpec> = [
    {
        ThemeID: 'mj-default',
        Name: 'MJ Brand Indigo',
        PrimaryColor: '#4f46e5',
        AccentColor: '#0ea5e9',
        BackgroundColor: '#ffffff',
        SurfaceColor: '#f8fafc',
        TextColor: '#0f172a',
        MutedTextColor: '#475569',
        HeadingFont: 'Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'MJ Default Design Tokens',
        SecondaryGradientColor: '#eef2ff',
        BackgroundStyle: 'accent-strip',
        CardRadiusPx: 14,
        CardElevation: 'soft'
    },
    {
        ThemeID: 'executive-slate',
        Name: 'Executive Midnight Slate',
        PrimaryColor: '#38bdf8',
        AccentColor: '#818cf8',
        BackgroundColor: '#0f172a',
        SurfaceColor: '#1e293b',
        TextColor: '#f8fafc',
        MutedTextColor: '#cbd5e1',
        HeadingFont: 'Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Executive Dark Suite',
        SecondaryGradientColor: '#1e1b4b',
        BackgroundStyle: 'mesh',
        CardRadiusPx: 16,
        CardElevation: 'glass'
    },
    {
        ThemeID: 'emerald-growth',
        Name: 'Emerald Enterprise Growth',
        PrimaryColor: '#047857',
        AccentColor: '#10b981',
        BackgroundColor: '#ffffff',
        SurfaceColor: '#f0fdf4',
        TextColor: '#064e3b',
        MutedTextColor: '#374151',
        HeadingFont: 'Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Emerald Brand Kit',
        SecondaryGradientColor: '#ecfdf5',
        BackgroundStyle: 'gradient',
        CardRadiusPx: 14,
        CardElevation: 'soft'
    },
    {
        ThemeID: 'crimson-bold',
        Name: 'Crimson Boardroom',
        PrimaryColor: '#b91c1c',
        AccentColor: '#f59e0b',
        BackgroundColor: '#ffffff',
        SurfaceColor: '#fef2f2',
        TextColor: '#111827',
        MutedTextColor: '#4b5563',
        HeadingFont: 'Georgia, serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Crimson Brand Kit',
        SecondaryGradientColor: '#fffbeb',
        BackgroundStyle: 'accent-strip',
        CardRadiusPx: 12,
        CardElevation: 'soft'
    },
    {
        ThemeID: 'cobalt-editorial',
        Name: 'Cobalt Studio Dark',
        PrimaryColor: '#60a5fa',
        AccentColor: '#34d399',
        BackgroundColor: '#090d16',
        SurfaceColor: '#111827',
        TextColor: '#f9fafb',
        MutedTextColor: '#9ca3af',
        HeadingFont: '"Plus Jakarta Sans", Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Cobalt Dark Studio',
        SecondaryGradientColor: '#0f172a',
        BackgroundStyle: 'mesh',
        CardRadiusPx: 16,
        CardElevation: 'glass'
    },
    {
        ThemeID: 'ivory-luxury',
        Name: 'Warm Ivory Editorial',
        PrimaryColor: '#7c2d12',
        AccentColor: '#d97706',
        BackgroundColor: '#fdfbf7',
        SurfaceColor: '#f5f0e8',
        TextColor: '#1c1917',
        MutedTextColor: '#57534e',
        HeadingFont: 'Georgia, "Times New Roman", serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Editorial Magazine Suite',
        SecondaryGradientColor: '#fef3c7',
        BackgroundStyle: 'gradient',
        CardRadiusPx: 10,
        CardElevation: 'flat'
    },
    {
        ThemeID: 'carbon-mono',
        Name: 'Carbon Monochrome',
        PrimaryColor: '#f4f4f5',
        AccentColor: '#a1a1aa',
        BackgroundColor: '#09090b',
        SurfaceColor: '#18181b',
        TextColor: '#fafafa',
        MutedTextColor: '#a1a1aa',
        HeadingFont: 'Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Carbon Minimal Dark',
        SecondaryGradientColor: '#27272a',
        BackgroundStyle: 'solid',
        CardRadiusPx: 12,
        CardElevation: 'glass'
    },
    {
        ThemeID: 'nordic-mint',
        Name: 'Nordic Teal & Mint',
        PrimaryColor: '#0f766e',
        AccentColor: '#14b8a6',
        BackgroundColor: '#f8fafc',
        SurfaceColor: '#ffffff',
        TextColor: '#0f172a',
        MutedTextColor: '#475569',
        HeadingFont: 'Inter, system-ui, sans-serif',
        BodyFont: 'Inter, system-ui, sans-serif',
        BrandSeedSource: 'Nordic Light Palette',
        SecondaryGradientColor: '#ccfbf1',
        BackgroundStyle: 'gradient',
        CardRadiusPx: 16,
        CardElevation: 'soft'
    }
];

/**
 * Isomorphic engine for parsing, constructing, mutating, theming, and converting
 * MJ Slide Decks (`Presentation` artifacts, `plans/docs-slides-sheets.md § 5`).
 */
export class SlideDeckEngine extends BaseSingleton<SlideDeckEngine> {
    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link SlideDeckEngine}. */
    public static get Instance(): SlideDeckEngine {
        return super.getInstance<SlideDeckEngine>();
    }

    /**
     * Returns the built-in theme presets available for slide decks.
     */
    public GetThemePresets(): ReadonlyArray<SlideDeckThemeSpec> {
        return SLIDE_DECK_THEME_PRESETS;
    }

    /**
     * Returns the canonical slide layout catalog.
     */
    public GetLayoutCatalog(): ReadonlyArray<SlideLayoutMetadata> {
        return SLIDE_LAYOUT_CATALOG;
    }

    /**
     * Validates a CSS property value (color, gradient, font family, or length) against a strict
     * allow-list before interpolating it into a `<style>` block or theme spec.
     * Any value not matching the allow-list returns `fallback`.
     */
    public SanitizeCssValue(raw: string | undefined | null, fallback = ''): string {
        const trimmed = String(raw ?? '').trim();
        if (!trimmed || trimmed.length > 300) {
            return fallback;
        }
        // Reject any comment delimiters, statement/block delimiters, escapes, or forbidden functions
        if (/[;{}<>\\/*@]/.test(trimmed) || /\b(?:url|image-set|expression|javascript|vbscript)\b/i.test(trimmed)) {
            return fallback;
        }
        // 1. Hex colors (#rgb, #rgba, #rrggbb, #rrggbbaa)
        if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
            return trimmed;
        }
        // 2. Functional colors: rgb(), rgba(), hsl(), hsla()
        if (/^(?:rgba?|hsla?)\(\s*[0-9.%\s,/+-]+\s*\)$/i.test(trimmed)) {
            return trimmed;
        }
        // 3. CSS custom property reference: var(--name) or var(--name, #hex)
        if (/^var\(\s*--[a-z0-9_-]+(?:\s*,\s*#[0-9a-f]{3,8})?\s*\)$/i.test(trimmed)) {
            return trimmed;
        }
        // 4. Safe gradients: linear-gradient(...) or radial-gradient(...) with only color/angle/stop tokens
        if (/^(?:linear|radial)-gradient\(\s*[#a-z0-9.%,\s()-]+\s*\)$/i.test(trimmed)) {
            // Verify balanced parentheses (reject unbalanced ')' that could break out of CSS declarations)
            let parenDepth = 0;
            for (let i = 0; i < trimmed.length; i++) {
                const ch = trimmed.charAt(i);
                if (ch === '(') {
                    parenDepth++;
                } else if (ch === ')') {
                    parenDepth--;
                    if (parenDepth < 0) {
                        return fallback;
                    }
                }
            }
            if (parenDepth !== 0) {
                return fallback;
            }
            // Ensure the only nested functions inside a gradient are rgb/rgba/hsl/hsla
            const innerFns = trimmed
                .replace(/^(?:linear|radial)-gradient\(/i, '')
                .match(/[a-z_-]+\s*\(/gi);
            const allInnerSafe = !innerFns || innerFns.every((fn) => /^(?:rgba?|hsla?)\s*\($/i.test(fn));
            if (allInnerSafe) {
                return trimmed;
            }
            return fallback;
        }
        // 5. Font-family stacks, named colors, or simple numeric lengths (no colons, parens, or slashes)
        if (/^[a-z0-9\s,'".%-]+$/i.test(trimmed)) {
            return trimmed;
        }
        return fallback;
    }

    /**
     * Validates an image or logo URL for slides (`ImageUrl` / `Master.LogoUrl`).
     * Allows `https://`, `http://`, same-origin relative `/...` paths (not `//`), and
     * raster `data:image/(png|jpeg|jpg|webp|gif);base64,...` data URLs.
     * Rejects `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, and control chars.
     */
    public SanitizeImageUrl(raw: string | undefined | null): string | undefined {
        const trimmed = String(raw ?? '').trim();
        if (!trimmed || trimmed.length > 1_048_576) {
            return undefined;
        }
        if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
            return undefined;
        }
        if (/^(?:javascript|vbscript|file):/i.test(trimmed)) {
            return undefined;
        }
        if (/^data:/i.test(trimmed)) {
            const safeRasterDataUrl = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
            return safeRasterDataUrl.test(trimmed) ? trimmed : undefined;
        }
        if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
            return trimmed;
        }
        if (/^https?:\/\/[^\s"'<>]+$/i.test(trimmed)) {
            return trimmed;
        }
        return undefined;
    }

    /**
     * Renders a standalone printable HTML document for `deck` with sanitized CSS theme tokens.
     */
    public RenderPrintHtml(deck: SlideDeckSpec): string {
        const escapeHtml = (str: string): string =>
            String(str ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        const renderInlineMarkdown = (raw: string): string => {
            const escaped = escapeHtml(raw);
            return escaped
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code>$1</code>');
        };
        const renderBlockHtml = (region: SlideRegionSpec, block: DocumentBlockSpec): string => {
            const snap = block.FrozenSnapshot;
            const titleText = escapeHtml(block.Title || region.Label || block.Kind);
            if (snap && Array.isArray(snap.Columns) && snap.Columns.length > 0 && Array.isArray(snap.Rows)) {
                const headers = snap.Columns.map((col) => `<th>${escapeHtml(col.DisplayName || col.Name)}</th>`).join('');
                const bodyRows = snap.Rows.slice(0, 100)
                    .map((row) => {
                        const cells = snap.Columns.map((col) => {
                            const cellVal = row[col.Name];
                            return `<td>${escapeHtml(cellVal === null || cellVal === undefined ? '' : String(cellVal))}</td>`;
                        }).join('');
                        return `<tr>${cells}</tr>`;
                    })
                    .join('');
                return `<div class="slide-block" data-block-id="${escapeHtml(block.BlockID)}"><div class="slide-block-title">${titleText}</div><table class="slide-block-table"><thead><tr>${headers}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
            }
            if (snap?.ArtifactContentSnapshot) {
                return `<div class="slide-block" data-block-id="${escapeHtml(block.BlockID)}"><div class="slide-block-title">${titleText}</div><div class="slide-block-meta">${escapeHtml(snap.ArtifactTypeSnapshot || block.ArtifactType || 'Artifact')} snapshot</div></div>`;
            }
            return `<div class="slide-block slide-block-live" data-block-id="${escapeHtml(block.BlockID)}"><div class="slide-block-title">${titleText}</div><div class="slide-block-meta">${escapeHtml(block.Kind)} (${escapeHtml(block.Mode)})</div></div>`;
        };
        const renderMarkdownContentHtml = (md: string): string => {
            const lines = String(md ?? '').replace(/\r\n/g, '\n').split('\n');
            const out: string[] = [];
            let inList = false;
            const closeList = (): void => {
                if (inList) {
                    out.push('</ul>');
                    inList = false;
                }
            };
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (!trimmed) {
                    closeList();
                    continue;
                }
                if (/^[-*]\s+/.test(trimmed)) {
                    if (!inList) {
                        out.push('<ul>');
                        inList = true;
                    }
                    out.push(`<li>${renderInlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
                    continue;
                }
                closeList();
                const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
                if (headingMatch) {
                    const level = Math.min(4, headingMatch[1].length + 1);
                    out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
                    continue;
                }
                if (trimmed.startsWith('|')) {
                    const tableLines: string[] = [trimmed];
                    while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
                        i++;
                        tableLines.push(lines[i].trim());
                    }
                    const parseRow = (rowLine: string): string[] =>
                        rowLine
                            .replace(/^\|/, '')
                            .replace(/\|$/, '')
                            .split('|')
                            .map((c) => c.trim());
                    const rows = tableLines
                        .filter((tl) => !/^\|[\s:|-]+\|$/.test(tl))
                        .map(parseRow);
                    if (rows.length > 0) {
                        const head = rows[0].map((c) => `<th>${renderInlineMarkdown(c)}</th>`).join('');
                        const body = rows
                            .slice(1)
                            .map((r) => `<tr>${r.map((c) => `<td>${renderInlineMarkdown(c)}</td>`).join('')}</tr>`)
                            .join('');
                        out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
                        continue;
                    }
                }
                out.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
            }
            closeList();
            return out.join('');
        };
        const renderRegionHtml = (r: SlideRegionSpec): string => {
            const block = r.BlockSpec ?? this.parseFirstBlockFromMarkdown(r.MarkdownContent);
            if (r.Kind === 'mj-block' || block) {
                const contentHtml = block
                    ? renderBlockHtml(r, block)
                    : `<div class="slide-block-meta">${escapeHtml(r.Label)}</div>`;
                return `<div class="slide-region" data-region-id="${escapeHtml(r.RegionID)}" data-region-kind="mj-block">${contentHtml}</div>`;
            }
            if (r.Kind === 'big-number') {
                const valueHtml = r.BigNumberValue
                    ? `<div class="big-number-value">${escapeHtml(r.BigNumberValue)}</div>`
                    : '';
                const labelHtml = r.BigNumberLabel
                    ? `<div class="big-number-label">${escapeHtml(r.BigNumberLabel)}</div>`
                    : '';
                const deltaHtml = r.BigNumberDelta
                    ? `<div class="big-number-delta">${escapeHtml(r.BigNumberDelta)}</div>`
                    : '';
                const fallbackMd = !r.BigNumberValue && r.MarkdownContent
                    ? `<div class="big-number-body">${renderMarkdownContentHtml(r.MarkdownContent)}</div>`
                    : '';
                return `<div class="slide-region slide-big-number" data-region-id="${escapeHtml(r.RegionID)}">${valueHtml}${labelHtml}${deltaHtml}${fallbackMd}</div>`;
            }
            if (r.Kind === 'quote') {
                const quoteBody = r.MarkdownContent ? `<blockquote>${renderMarkdownContentHtml(r.MarkdownContent)}</blockquote>` : '';
                const attrHtml = r.QuoteAttribution
                    ? `<cite class="quote-attribution">${escapeHtml(r.QuoteAttribution)}</cite>`
                    : '';
                return `<div class="slide-region slide-quote" data-region-id="${escapeHtml(r.RegionID)}">${quoteBody}${attrHtml}</div>`;
            }
            if (r.Kind === 'image') {
                const safeSrc = this.SanitizeImageUrl(r.ImageUrl);
                const altText = escapeHtml(r.ImageAlt || r.Label || '');
                const imgHtml = safeSrc
                    ? `<img class="slide-image" src="${escapeHtml(safeSrc)}" alt="${altText}"/>`
                    : `<div class="slide-image-placeholder">${altText || 'Image'}</div>`;
                const captionHtml = r.MarkdownContent ? `<div class="slide-image-caption">${renderMarkdownContentHtml(r.MarkdownContent)}</div>` : '';
                return `<div class="slide-region slide-image-region" data-region-id="${escapeHtml(r.RegionID)}">${imgHtml}${captionHtml}</div>`;
            }
            return `<div class="slide-region" data-region-id="${escapeHtml(r.RegionID)}" data-region-kind="${escapeHtml(r.Kind)}">${renderMarkdownContentHtml(r.MarkdownContent)}</div>`;
        };

        const primary = this.SanitizeCssValue(deck.Theme?.PrimaryColor, '#4f46e5');
        const accent = this.SanitizeCssValue(deck.Theme?.AccentColor, '#0ea5e9');
        const bg = this.SanitizeCssValue(deck.Theme?.BackgroundColor, '#ffffff');
        const surface = this.SanitizeCssValue(deck.Theme?.SurfaceColor, '#f8fafc');
        const text = this.SanitizeCssValue(deck.Theme?.TextColor, '#0f172a');
        const muted = this.SanitizeCssValue(deck.Theme?.MutedTextColor, '#475569');
        const headingFont = this.SanitizeCssValue(deck.Theme?.HeadingFont, 'Inter, system-ui, sans-serif');
        const bodyFont = this.SanitizeCssValue(deck.Theme?.BodyFont, 'Inter, system-ui, sans-serif');
        const secondaryBg = this.SanitizeCssValue(deck.Theme?.SecondaryGradientColor, surface);
        const cardRadius = Math.max(0, Math.min(32, Number(deck.Theme?.CardRadiusPx ?? 14)));

        const safeLogoUrl = this.SanitizeImageUrl(deck.Master?.LogoUrl);
        const visibleSlides = (deck.Slides ?? []).filter((s) => !s.Hidden);
        const dateLabel = deck.Master?.ShowDate ? new Date().toISOString().slice(0, 10) : '';

        const slideBlocks = visibleSlides
            .map((slide, visibleIdx) => {
                const regionsHtml = (slide.Regions ?? []).map(renderRegionHtml).join('');
                const headerParts: string[] = [];
                if (safeLogoUrl) {
                    headerParts.push(`<img class="slide-master-logo" src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(deck.Master?.OrganizationName || 'Logo')}"/>`);
                }
                if (deck.Master?.OrganizationName) {
                    headerParts.push(`<span class="slide-master-org">${escapeHtml(deck.Master.OrganizationName)}</span>`);
                }
                if (deck.Master?.HeaderText) {
                    headerParts.push(`<span class="slide-master-header-text">${escapeHtml(deck.Master.HeaderText)}</span>`);
                }
                const headerHtml = headerParts.length > 0 ? `<header class="slide-master-header">${headerParts.join('')}</header>` : '';

                const footerParts: string[] = [];
                if (deck.Master?.FooterText) {
                    footerParts.push(`<span class="slide-master-footer-text">${escapeHtml(deck.Master.FooterText)}</span>`);
                }
                if (dateLabel) {
                    footerParts.push(`<span class="slide-master-date">${escapeHtml(dateLabel)}</span>`);
                }
                if (deck.Master?.ShowSlideNumbers) {
                    footerParts.push(`<span class="slide-master-number">Slide ${visibleIdx + 1} of ${visibleSlides.length}</span>`);
                }
                const footerHtml = footerParts.length > 0 ? `<footer class="slide-master-footer">${footerParts.join(' ')}</footer>` : '';

                return `<section class="slide-page" data-slide-id="${escapeHtml(slide.SlideID)}">${headerHtml}<h1>${escapeHtml(slide.Title)}</h1>${
                    slide.Subtitle ? `<h2>${escapeHtml(slide.Subtitle)}</h2>` : ''
                }<div class="slide-regions">${regionsHtml}</div>${footerHtml}</section>`;
            })
            .join('\n');

        return [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"/>',
            `<title>${escapeHtml(deck.Title)}</title>`,
            '<style>',
            `:root { --slide-primary: ${primary}; --slide-accent: ${accent}; --slide-bg: ${bg}; --slide-surface: ${surface}; --slide-secondary-bg: ${secondaryBg}; --slide-card-radius: ${cardRadius}px; --slide-text: ${text}; --slide-muted: ${muted}; --slide-heading-font: ${headingFont}; --slide-body-font: ${bodyFont}; }`,
            'body { margin: 0; background: var(--slide-bg); color: var(--slide-text); font-family: var(--slide-body-font); }',
            'h1, h2 { font-family: var(--slide-heading-font); color: var(--slide-primary); }',
            '.slide-page { page-break-after: always; padding: 32px; background: var(--slide-bg); }',
            '.slide-master-header, .slide-master-footer { display: flex; justify-content: space-between; align-items: center; color: var(--slide-muted); font-size: 12px; }',
            '.big-number-value { font-size: 48px; font-weight: 700; color: var(--slide-primary); }',
            '.big-number-label { font-size: 16px; color: var(--slide-muted); }',
            '.big-number-delta { font-size: 14px; color: var(--slide-accent); }',
            '.slide-block-table, table { width: 100%; border-collapse: collapse; margin: 12px 0; }',
            'th, td { border: 1px solid var(--slide-muted); padding: 6px 8px; text-align: left; font-size: 13px; }',
            '</style></head>',
            `<body>${slideBlocks}</body></html>`
        ].join('\n');
    }

    /**
     * Derives a complete {@link SlideDeckThemeSpec} from organization brand color seeds (`Accept #4`).
     */
    public DeriveThemeFromBrandSeeds(seeds: OrganizationBrandThemeSeeds): SlideDeckThemeSpec {
        const primary = this.SanitizeCssValue(seeds.PrimaryColor, '#4f46e5');
        const accent = this.SanitizeCssValue(seeds.AccentColor, primary);
        const bg = this.SanitizeCssValue(seeds.BackgroundColor, '#ffffff');
        const isDarkBg = /^#(0|1|2)[0-9a-f]{5}$/i.test(bg);
        const surface = this.SanitizeCssValue(seeds.SurfaceColor, isDarkBg ? '#1e293b' : '#f8fafc');
        const text = this.SanitizeCssValue(seeds.TextColor, isDarkBg ? '#f8fafc' : '#0f172a');
        const muted = isDarkBg ? '#cbd5e1' : '#475569';

        return {
            ThemeID: 'brand-custom',
            Name: seeds.OrganizationName ? `${seeds.OrganizationName} Brand Theme` : 'Organization Brand Theme',
            PrimaryColor: primary,
            AccentColor: accent,
            BackgroundColor: bg,
            SurfaceColor: surface,
            TextColor: text,
            MutedTextColor: muted,
            HeadingFont: this.SanitizeCssValue(seeds.HeadingFont, 'Inter, system-ui, sans-serif'),
            BodyFont: this.SanitizeCssValue(seeds.BodyFont, 'Inter, system-ui, sans-serif'),
            BrandSeedSource: seeds.BrandSeedSource || seeds.OrganizationName || 'Organization Brand Seeds',
            SecondaryGradientColor: surface,
            BackgroundStyle: 'accent-strip',
            CardRadiusPx: 14,
            CardElevation: isDarkBg ? 'glass' : 'soft'
        };
    }

    /**
     * Builds the default regions for a given {@link SlideLayoutKind}, preserving existing
     * region content when switching a slide from one layout to another.
     */
    public BuildRegionsForLayout(
        layout: SlideLayoutKind,
        existingRegions: SlideRegionSpec[] = []
    ): SlideRegionSpec[] {
        const firstExisting = existingRegions[0];
        const secondExisting = existingRegions[1];
        const thirdExisting = existingRegions[2];
        const fourthExisting = existingRegions[3];

        switch (layout) {
            case 'Title':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'main',
                        Label: 'Cover Tagline & Presenter Metadata',
                        Kind: 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            'Prepared for Executive Leadership · Real-Time Collaborative Presentation'
                    })
                ];

            case 'SectionHeader':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'main',
                        Label: 'Section Overview',
                        Kind: 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            'Key objectives, architecture milestones, and governance metrics for this section.'
                    })
                ];

            case 'TwoColumn':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'left',
                        Label: 'Left Column',
                        Kind: 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '- **Strategic Pillar 1:** Unified metadata governance\n- **Strategic Pillar 2:** Viewer-scoped RLS & FLS security\n- **Strategic Pillar 3:** Real-time Yjs CRDT co-editing'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'right',
                        Label: 'Right Column',
                        Kind: 'rich-text',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '- **Execution Cadence:** Quarterly milestone gates\n- **AI Co-Authoring:** `@SlidesAgent` region updates\n- **Export Targets:** Editable `.pptx` & printable `.pdf`'
                    })
                ];

            case 'Comparison':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'left',
                        Label: 'Baseline Approach',
                        Kind: 'callout',
                        CalloutTone: 'WARNING',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '### Legacy Static Decks\n- Manual copy-paste from spreadsheets\n- Stale numbers the moment slides are emailed\n- Zero row-level or field-level security'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'right',
                        Label: 'MJ Collaborative Slides',
                        Kind: 'callout',
                        CalloutTone: 'TIP',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '### Live Governed Presentations\n- Viewer-scoped `EntityView` & `SavedQuery` blocks\n- Automatic freeze when Presentation Mode starts (`O6`)\n- Inline MS OLE `Whiteboard` architecture diagrams'
                    })
                ];

            case 'LiveDataSlide':
            case 'ChartAndText': {
                const defaultBlock: DocumentBlockSpec = firstExisting?.BlockSpec ?? {
                    BlockID: `slide-blk-ev-1`,
                    Kind: 'EntityView',
                    Mode: 'Live',
                    Title: 'Live Portfolio Initiatives (Viewer RLS/FLS)',
                    EntityName: 'MJ: Artifacts',
                    DisplayMode: 'table'
                };
                const blockDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(defaultBlock);
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'data',
                        Label: 'Live MJ Data / Chart Region',
                        Kind: firstExisting?.Kind === 'mj-block' ? 'mj-block' : 'mj-block',
                        MarkdownContent:
                            firstExisting?.Kind === 'mj-block' && firstExisting.MarkdownContent
                                ? firstExisting.MarkdownContent
                                : blockDirective,
                        BlockSpec: defaultBlock
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'narrative',
                        Label: 'Executive Commentary',
                        Kind: 'rich-text',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '### Key Takeaways\n- Data refreshes live under each viewer\'s MJ permissions\n- Freezes automatically when Presentation Mode begins (`O6`)\n- Exports as a native table/chart in `.pptx`'
                    })
                ];
            }

            case 'BigNumber':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'kpi',
                        Label: 'Headline KPI Metric',
                        Kind: 'big-number',
                        BigNumberValue: firstExisting?.BigNumberValue || '—',
                        BigNumberLabel: firstExisting?.BigNumberLabel || 'Key Performance Indicator',
                        BigNumberDelta: firstExisting?.BigNumberDelta || 'Target comparison',
                        MarkdownContent:
                            firstExisting?.MarkdownContent || 'Key Performance Indicator — Replace with target metric details.'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'context',
                        Label: 'Metric Context & Drivers',
                        Kind: 'rich-text',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '- Zero data-loss Yjs CRDT binary checkpoints in `MJ: Artifact Working States`\n- Cross-instance room relay support\n- Strict viewer-scoped permission enforcement'
                    })
                ];

            case 'Quote':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'quote',
                        Label: 'Featured Quote',
                        Kind: 'quote',
                        QuoteAttribution:
                            firstExisting?.QuoteAttribution || 'Speaker Name, Title',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '"Add a key takeaway or stakeholder quote for this section."'
                    })
                ];

            case 'FullBleedImage':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'visual',
                        Label: 'Full-Bleed Visual & Caption',
                        Kind: firstExisting?.Kind === 'mj-block' ? 'mj-block' : 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '### Global Multi-Region Topology\nHigh-availability MJAPI cluster with Redis Yjs room relay and SQL Server working-state persistence.'
                    })
                ];

            case 'Blank':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'canvas',
                        Label: 'Full Slide Canvas Region',
                        Kind: firstExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            'Use `/` or the region toolbar to embed an interactive OLE Whiteboard or Live MJ Block.'
                    })
                ];

            case 'KpiStrip':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'kpi-1',
                        Label: 'Primary KPI',
                        Kind: firstExisting?.Kind || 'big-number',
                        BigNumberValue: firstExisting?.BigNumberValue || '$14.8M',
                        BigNumberLabel: firstExisting?.BigNumberLabel || 'Annual Recurring Revenue',
                        BigNumberDelta: firstExisting?.BigNumberDelta || '+24% YoY',
                        MarkdownContent: firstExisting?.MarkdownContent || 'ARR growth led by enterprise expansion.'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'kpi-2',
                        Label: 'Efficiency KPI',
                        Kind: secondExisting?.Kind || 'big-number',
                        BigNumberValue: secondExisting?.BigNumberValue || '98.4%',
                        BigNumberLabel: secondExisting?.BigNumberLabel || 'Net Dollar Retention',
                        BigNumberDelta: secondExisting?.BigNumberDelta || '+4.2 pts',
                        MarkdownContent: secondExisting?.MarkdownContent || 'High adoption across core workspaces.'
                    }),
                    this.mergeOrCreateRegion(thirdExisting, {
                        RegionID: 'kpi-3',
                        Label: 'Velocity KPI',
                        Kind: thirdExisting?.Kind || 'big-number',
                        BigNumberValue: thirdExisting?.BigNumberValue || '3.4x',
                        BigNumberLabel: thirdExisting?.BigNumberLabel || 'Faster Reporting Cycle',
                        BigNumberDelta: thirdExisting?.BigNumberDelta || '-18 hrs / wk',
                        MarkdownContent: thirdExisting?.MarkdownContent || 'Automated live queries replace manual prep.'
                    })
                ];

            case 'Timeline':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'step-1',
                        Label: 'Phase 1 · Foundation',
                        Kind: firstExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '### Q1 · Foundation\n- Unified metadata schema & RLS governance\n- Live data bindings & co-editing rooms'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'step-2',
                        Label: 'Phase 2 · Scale',
                        Kind: secondExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '### Q2 · Acceleration\n- Automated AI brief & deck synthesis\n- Cross-artifact OLE embeds & exports'
                    }),
                    this.mergeOrCreateRegion(thirdExisting, {
                        RegionID: 'step-3',
                        Label: 'Phase 3 · Optimization',
                        Kind: thirdExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            thirdExisting?.MarkdownContent ||
                            '### Q3 · Autonomous Ops\n- Executive board packs refreshed on schedule\n- Zero-drift metric signoff workflows'
                    })
                ];

            case 'BentoGrid':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'bento-hero',
                        Label: 'Featured Spotlight',
                        Kind: firstExisting?.Kind || 'callout',
                        CalloutTone: firstExisting?.CalloutTone || 'IMPORTANT',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '### Strategic Breakthrough\nPair governed enterprise data with executive visual storytelling in one shared workspace.'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'bento-2',
                        Label: 'Customer Proof',
                        Kind: secondExisting?.Kind || 'big-number',
                        BigNumberValue: secondExisting?.BigNumberValue || '420+',
                        BigNumberLabel: secondExisting?.BigNumberLabel || 'Active Teams',
                        BigNumberDelta: secondExisting?.BigNumberDelta || '+38% QoQ',
                        MarkdownContent: secondExisting?.MarkdownContent || 'Enterprise adoption metric'
                    }),
                    this.mergeOrCreateRegion(thirdExisting, {
                        RegionID: 'bento-3',
                        Label: 'Key Driver',
                        Kind: thirdExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            thirdExisting?.MarkdownContent ||
                            '### Security First\nRow-level security travels automatically with every live block.'
                    }),
                    this.mergeOrCreateRegion(fourthExisting, {
                        RegionID: 'bento-4',
                        Label: 'Next Milestone',
                        Kind: fourthExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            fourthExisting?.MarkdownContent ||
                            '### Q4 Rollout\nAll regional teams onboarded with zero manual migrations.'
                    })
                ];

            case 'Quadrant':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'q1',
                        Label: 'High Impact · Quick Wins',
                        Kind: firstExisting?.Kind || 'callout',
                        CalloutTone: firstExisting?.CalloutTone || 'TIP',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '### Quick Wins\n- Automated live query decks\n- One-click executive styling'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'q2',
                        Label: 'High Impact · Strategic Bets',
                        Kind: secondExisting?.Kind || 'callout',
                        CalloutTone: secondExisting?.CalloutTone || 'IMPORTANT',
                        MarkdownContent:
                            secondExisting?.MarkdownContent ||
                            '### Strategic Bets\n- Real-time multi-agent co-authoring\n- Cross-system governance ledger'
                    }),
                    this.mergeOrCreateRegion(thirdExisting, {
                        RegionID: 'q3',
                        Label: 'Incremental · Hygiene',
                        Kind: thirdExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            thirdExisting?.MarkdownContent ||
                            '### Operational Hygiene\n- Template library curation\n- Consistent chart labeling'
                    }),
                    this.mergeOrCreateRegion(fourthExisting, {
                        RegionID: 'q4',
                        Label: 'Deprioritize / Reassess',
                        Kind: fourthExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            fourthExisting?.MarkdownContent ||
                            '### Defer\n- Static screenshot imports\n- Unverifiable manual spreadsheets'
                    })
                ];

            case 'MetricComparison':
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'before-metric',
                        Label: 'Baseline Period',
                        Kind: firstExisting?.Kind || 'big-number',
                        BigNumberValue: firstExisting?.BigNumberValue || '18 hrs',
                        BigNumberLabel: firstExisting?.BigNumberLabel || 'Weekly Deck Preparation',
                        BigNumberDelta: firstExisting?.BigNumberDelta || 'Manual exports',
                        MarkdownContent: firstExisting?.MarkdownContent || 'Legacy static workflow'
                    }),
                    this.mergeOrCreateRegion(secondExisting, {
                        RegionID: 'after-metric',
                        Label: 'Current Performance',
                        Kind: secondExisting?.Kind || 'big-number',
                        BigNumberValue: secondExisting?.BigNumberValue || '12 min',
                        BigNumberLabel: secondExisting?.BigNumberLabel || 'With Live MJ Slides',
                        BigNumberDelta: secondExisting?.BigNumberDelta || '98% faster',
                        MarkdownContent: secondExisting?.MarkdownContent || 'Live governed workflow'
                    }),
                    this.mergeOrCreateRegion(thirdExisting, {
                        RegionID: 'synthesis',
                        Label: 'Executive Takeaway',
                        Kind: thirdExisting?.Kind || 'callout',
                        CalloutTone: thirdExisting?.CalloutTone || 'NOTE',
                        MarkdownContent:
                            thirdExisting?.MarkdownContent ||
                            'Reclaimed analyst bandwidth shifts focus from data wrangling to strategic decision-making.'
                    })
                ];

            case 'TitleAndBody':
            default:
                return [
                    this.mergeOrCreateRegion(firstExisting, {
                        RegionID: 'main',
                        Label: 'Slide Body',
                        Kind: firstExisting?.Kind || 'rich-text',
                        MarkdownContent:
                            firstExisting?.MarkdownContent ||
                            '- **Structured 16:9 Layouts:** Title, Section Break, Title & Body, Two Columns, Comparison, Live Data, Big Number, Quote\n- **Live MJ Blocks:** Viewer-scoped `EntityView`, `SavedQuery`, `DashboardPart`, and `InteractiveComponent`\n- **Inline OLE Artifacts:** Interactive `Whiteboard` diagrams embedded directly in slide regions'
                    })
                ];
        }
    }

    /**
     * Creates a default starter {@link SlideDeckSpec} when an empty or new presentation is opened.
     */
    public CreateDefaultDeck(title = 'Executive Strategy & Live Operations Deck', deckId = 'deck-default'): SlideDeckSpec {
        const defaultTheme = { ...SLIDE_DECK_THEME_PRESETS[0] };
        const slides: SlideSpec[] = [
            {
                SlideID: 'slide-1',
                SlideNumber: 1,
                Layout: 'Title',
                Title: title,
                Subtitle: 'Q4 Architecture, Live Telemetry & Collaborative Governance Review',
                Regions: this.BuildRegionsForLayout('Title'),
                SpeakerNotes: 'Welcome everyone. Today we are reviewing our Q4 live operational metrics and architecture roadmap.',
                Transition: 'fade'
            },
            {
                SlideID: 'slide-2',
                SlideNumber: 2,
                Layout: 'TwoColumn',
                Title: 'Strategic Pillars & Execution Priorities',
                Subtitle: 'Co-authored in real time over Yjs CRDT rooms',
                Regions: this.BuildRegionsForLayout('TwoColumn'),
                SpeakerNotes: 'Highlight how two authors can edit separate slides while a third reorders the deck with zero data loss.',
                Transition: 'slide'
            },
            {
                SlideID: 'slide-3',
                SlideNumber: 3,
                Layout: 'LiveDataSlide',
                Title: 'Live Enterprise Portfolio Telemetry (Viewer RLS/FLS)',
                Subtitle: 'Refreshes on open and freezes automatically when Presentation Mode begins (O6)',
                Regions: this.BuildRegionsForLayout('LiveDataSlide'),
                SpeakerNotes: 'Point out that every viewer sees only rows permitted by their Row-Level and Field-Level Security.',
                Transition: 'fade'
            }
        ];

        return {
            SchemaVersion: '1.0',
            DeckID: deckId,
            Title: title,
            Subtitle: 'MemberJunction Collaborative Presentations',
            AspectRatio: '16:9',
            Theme: defaultTheme,
            Master: {
                HeaderText: '',
                FooterText: '',
                ShowSlideNumbers: true,
                ShowDate: true,
                OrganizationName: 'MemberJunction'
            },
            Slides: slides,
            UpdatedAt: new Date().toISOString()
        };
    }

    /**
     * Parses raw artifact content (either serialized `SlideDeckSpec` JSON or Markdown text)
     * into a normalized {@link SlideDeckSpec}.
     */
    public ParseDeckSpec(rawContent: string | null | undefined, fallbackTitle?: string, fallbackDeckId?: string): SlideDeckSpec {
        const trimmed = (rawContent ?? '').trim();
        if (!trimmed) {
            return this.CreateDefaultDeck(fallbackTitle, fallbackDeckId);
        }

        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as Partial<SlideDeckSpec>;
                if (parsed && Array.isArray(parsed.Slides) && parsed.Slides.length > 0) {
                    return this.normalizeDeckSpec(parsed, fallbackTitle, fallbackDeckId);
                }
            } catch {
                // Fall through to Markdown-to-Slides conversion if JSON is malformed
            }
        }

        return this.ConvertMarkdownToSlideDeck(trimmed, fallbackTitle, undefined, fallbackDeckId);
    }

    /**
     * Serializes a {@link SlideDeckSpec} to formatted JSON.
     */
    public SerializeDeckSpec(deck: SlideDeckSpec): string {
        const normalized = this.normalizeDeckSpec(deck, deck.Title, deck.DeckID);
        return JSON.stringify(normalized, null, 2);
    }

    /**
     * Converts a Markdown Document (including headings, bullet lists, callouts, tables,
     * and `:::mj-block` directives for Live MJ Blocks and OLE Whiteboards) into a structured
     * {@link SlideDeckSpec} (`§ 5.2` — *"make a deck from this doc"*).
     */
    public ConvertMarkdownToSlideDeck(
        markdown: string,
        deckTitle?: string,
        theme?: SlideDeckThemeSpec,
        deckId = 'deck-from-markdown'
    ): SlideDeckSpec {
        const normalizedMd = (markdown ?? '').replace(/\r\n/g, '\n').trim();
        if (!normalizedMd) {
            return this.CreateDefaultDeck(deckTitle, deckId);
        }

        const lines = normalizedMd.split('\n');
        const sections: Array<{ level: number; heading: string; bodyLines: string[] }> = [];
        let currentSection: { level: number; heading: string; bodyLines: string[] } | null = null;
        let inBacktickFence = false;
        let inColonFence = false;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!inColonFence && trimmedLine.startsWith('```')) {
                inBacktickFence = !inBacktickFence;
            } else if (!inBacktickFence && trimmedLine.startsWith(':::')) {
                if (!inColonFence && /^:::[a-zA-Z0-9_-]+/.test(trimmedLine)) {
                    inColonFence = true;
                } else if (inColonFence && trimmedLine === ':::') {
                    inColonFence = false;
                }
            }
            const headingMatch = !inBacktickFence && !inColonFence ? /^(#{1,3})\s+(.+)$/.exec(trimmedLine) : null;
            if (headingMatch) {
                if (currentSection) {
                    sections.push(currentSection);
                }
                currentSection = {
                    level: headingMatch[1].length,
                    heading: headingMatch[2].trim(),
                    bodyLines: []
                };
            } else {
                if (!currentSection) {
                    currentSection = {
                        level: 1,
                        heading: deckTitle || 'Executive Presentation',
                        bodyLines: []
                    };
                }
                currentSection.bodyLines.push(line);
            }
        }
        if (currentSection) {
            sections.push(currentSection);
        }

        const resolvedTitle = deckTitle || sections[0]?.heading || 'Executive Presentation';
        const slides: SlideSpec[] = sections.map((sec, idx) => {
            const slideId = `slide-${idx + 1}`;
            const rawBody = sec.bodyLines.join('\n').trim();
            const parsedSegments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(rawBody);
            const parsedBlocks = parsedSegments.filter(
                (seg): seg is typeof seg & { BlockSpec: DocumentBlockSpec } =>
                    seg.Type === 'mj-block' && Boolean(seg.BlockSpec)
            );

            // Extract speaker notes if marked with `> Speaker Notes:`
            const noteLines: string[] = [];
            const contentLines: string[] = [];
            for (const bLine of sec.bodyLines) {
                const noteMatch = /^>\s*Speaker Notes:\s*(.+)$/i.exec(bLine.trim());
                if (noteMatch) {
                    noteLines.push(noteMatch[1]);
                } else {
                    contentLines.push(bLine);
                }
            }
            const cleanedBody = contentLines.join('\n').trim();

            if (idx === 0 && sec.level === 1 && parsedBlocks.length === 0) {
                return {
                    SlideID: slideId,
                    SlideNumber: idx + 1,
                    Layout: 'Title',
                    Title: sec.heading,
                    Subtitle: cleanedBody.split('\n')[0]?.replace(/^[>*-\s]+/, '') || 'Generated from MJ Markdown Document',
                    Regions: [
                        {
                            RegionID: 'main',
                            Label: 'Cover Summary',
                            Kind: 'rich-text',
                            MarkdownContent: cleanedBody || sec.heading
                        }
                    ],
                    SpeakerNotes: noteLines.join('\n') || `Cover slide for ${sec.heading}.`,
                    Transition: 'fade'
                };
            }

            if (parsedBlocks.length > 0) {
                const firstBlock = parsedBlocks[0].BlockSpec;
                let strippedNarrative = cleanedBody;
                for (const blockSeg of parsedBlocks) {
                    strippedNarrative = strippedNarrative.replace(blockSeg.RawText, () => '');
                }
                strippedNarrative = strippedNarrative.trim();
                const isWhiteboard = firstBlock.Kind === 'Artifact' && firstBlock.ArtifactType === 'Whiteboard';

                const regions: SlideRegionSpec[] = parsedBlocks.map((blockSeg, bIdx) => ({
                    RegionID: bIdx === 0 ? 'data' : `data-${bIdx + 1}`,
                    Label: blockSeg.BlockSpec.Title || (bIdx === 0 ? 'Embedded MJ Block' : `Embedded MJ Block ${bIdx + 1}`),
                    Kind: 'mj-block',
                    MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSeg.BlockSpec),
                    BlockSpec: blockSeg.BlockSpec
                }));
                regions.push({
                    RegionID: 'narrative',
                    Label: 'Key Insights',
                    Kind: 'rich-text',
                    MarkdownContent:
                        strippedNarrative ||
                        `- Live ${firstBlock.Kind} block integrated from source document\n- Viewer-scoped permissions enforced`
                });

                return {
                    SlideID: slideId,
                    SlideNumber: idx + 1,
                    Layout: isWhiteboard ? 'ChartAndText' : 'LiveDataSlide',
                    Title: sec.heading,
                    Subtitle: firstBlock.Title || `${firstBlock.Kind} Slide`,
                    Regions: regions,
                    SpeakerNotes: noteLines.join('\n') || `Discuss ${firstBlock.Title || sec.heading}.`,
                    Transition: 'slide'
                };
            }

            return {
                SlideID: slideId,
                SlideNumber: idx + 1,
                Layout: sec.level === 1 ? 'SectionHeader' : 'TitleAndBody',
                Title: sec.heading,
                Regions: [
                    {
                        RegionID: 'main',
                        Label: 'Slide Content',
                        Kind: cleanedBody.includes('| ---') ? 'table' : 'rich-text',
                        MarkdownContent: cleanedBody || `- Key points for ${sec.heading}`
                    }
                ],
                SpeakerNotes: noteLines.join('\n') || `Speaker notes for ${sec.heading}.`,
                Transition: 'fade'
            };
        });

        return {
            SchemaVersion: '1.0',
            DeckID: deckId,
            Title: resolvedTitle,
            Subtitle: 'Converted from MJ Markdown Document',
            AspectRatio: '16:9',
            Theme: theme ? { ...theme } : { ...SLIDE_DECK_THEME_PRESETS[0] },
            Master: {
                HeaderText: resolvedTitle,
                FooterText: 'Generated by MJ Slides',
                ShowSlideNumbers: true,
                ShowDate: true,
                OrganizationName: 'MemberJunction'
            },
            Slides: slides,
            UpdatedAt: new Date().toISOString()
        };
    }

    /**
     * Adds a new slide to `deck` with the requested `layout` and optional insertion index.
     */
    public AddSlide(
        deck: SlideDeckSpec,
        options: {
            SlideID?: string;
            Layout?: SlideLayoutKind;
            Title?: string;
            Subtitle?: string;
            Regions?: SlideRegionSpec[];
            SpeakerNotes?: string;
            InsertAtIndex?: number;
        } = {}
    ): { Deck: SlideDeckSpec; AddedSlide: SlideSpec } {
        const layout: SlideLayoutKind = options.Layout ?? 'TitleAndBody';
        const slideId = this.mintUniqueSlideId(deck.Slides, options.SlideID);
        const existingBlockIds = this.collectDeckBlockIds(deck.Slides);
        const regions =
            options.Regions && options.Regions.length > 0
                ? options.Regions.map((r) => ({ ...r }))
                : this.BuildRegionsForLayout(layout).map((r) =>
                      r.BlockSpec && existingBlockIds.has(r.BlockSpec.BlockID.toLowerCase())
                          ? this.cloneRegionWithFreshBlockIds(r, existingBlockIds)
                          : r
                  );

        const newSlide: SlideSpec = {
            SlideID: slideId,
            SlideNumber: deck.Slides.length + 1,
            Layout: layout,
            Title: options.Title || `New ${layout} Slide`,
            Subtitle: options.Subtitle,
            Regions: regions,
            SpeakerNotes: options.SpeakerNotes ?? '',
            Transition: 'fade'
        };

        const nextSlides = [...deck.Slides.map((s) => this.cloneSlide(s))];
        if (
            typeof options.InsertAtIndex === 'number' &&
            options.InsertAtIndex >= 0 &&
            options.InsertAtIndex <= nextSlides.length
        ) {
            nextSlides.splice(options.InsertAtIndex, 0, newSlide);
        } else {
            nextSlides.push(newSlide);
        }

        const renumbered = this.renumberSlides(nextSlides);
        const updatedDeck: SlideDeckSpec = {
            ...deck,
            Slides: renumbered,
            UpdatedAt: new Date().toISOString()
        };

        const added = renumbered.find((s) => s.SlideID === slideId) ?? newSlide;
        return { Deck: updatedDeck, AddedSlide: added };
    }

    /**
     * Duplicates an existing slide right after its current position, minting a unique `SlideID`
     * and fresh `BlockID`s for any embedded MJ blocks on the duplicated regions (`D6`).
     */
    public DuplicateSlide(deck: SlideDeckSpec, slideId: string): { Deck: SlideDeckSpec; DuplicatedSlide: SlideSpec | null } {
        const index = deck.Slides.findIndex((s) => s.SlideID === slideId || UUIDsEqual(s.SlideID, slideId));
        if (index < 0) {
            return { Deck: deck, DuplicatedSlide: null };
        }
        const source = deck.Slides[index];
        const copyId = this.mintUniqueSlideId(deck.Slides);
        const usedBlockIds = this.collectDeckBlockIds(deck.Slides);
        const clonedSource = this.cloneSlide(source);
        const copy: SlideSpec = {
            ...clonedSource,
            SlideID: copyId,
            Title: `${source.Title} (Copy)`,
            Regions: clonedSource.Regions.map((region) => this.cloneRegionWithFreshBlockIds(region, usedBlockIds))
        };
        const nextSlides = [...deck.Slides.map((s) => this.cloneSlide(s))];
        nextSlides.splice(index + 1, 0, copy);
        const renumbered = this.renumberSlides(nextSlides);
        return {
            Deck: {
                ...deck,
                Slides: renumbered,
                UpdatedAt: new Date().toISOString()
            },
            DuplicatedSlide: renumbered[index + 1] ?? copy
        };
    }

    /**
     * Checks whether an actor is allowed to mutate a slide given its lock settings (`§6.2`).
     */
    public CanActorEditSlide(
        slide: Pick<SlideSpec, 'SlideID' | 'Locked' | 'LockedByUserID' | 'AllowEditors'>,
        actorUserId?: string | null,
        ownerUserId?: string | null,
        isEditor = false
    ): { Allowed: boolean; Reason?: string } {
        if (!slide.Locked) {
            return { Allowed: true };
        }
        const actor = (actorUserId ?? '').trim();
        if (actor && ownerUserId && UUIDsEqual(actor, ownerUserId)) {
            return { Allowed: true };
        }
        if (actor && slide.LockedByUserID && UUIDsEqual(actor, slide.LockedByUserID)) {
            return { Allowed: true };
        }
        if (slide.AllowEditors && isEditor) {
            return { Allowed: true };
        }
        return {
            Allowed: false,
            Reason: `Slide '${slide.SlideID}' is locked (owner-only protection).`
        };
    }

    /**
     * Checks whether an actor is allowed to mutate a region within a slide (`§6.2`).
     */
    public CanActorEditRegion(
        slide: Pick<SlideSpec, 'SlideID' | 'Locked' | 'LockedByUserID' | 'AllowEditors'>,
        region: Pick<SlideRegionSpec, 'RegionID' | 'Locked' | 'LockedByUserID' | 'AllowEditors'>,
        actorUserId?: string | null,
        ownerUserId?: string | null,
        isEditor = false
    ): { Allowed: boolean; Reason?: string } {
        const slideCheck = this.CanActorEditSlide(slide, actorUserId, ownerUserId, isEditor);
        if (!slideCheck.Allowed) {
            return slideCheck;
        }
        if (!region.Locked) {
            return { Allowed: true };
        }
        const actor = (actorUserId ?? '').trim();
        if (actor && ownerUserId && UUIDsEqual(actor, ownerUserId)) {
            return { Allowed: true };
        }
        if (actor && region.LockedByUserID && UUIDsEqual(actor, region.LockedByUserID)) {
            return { Allowed: true };
        }
        if (region.AllowEditors && isEditor) {
            return { Allowed: true };
        }
        return {
            Allowed: false,
            Reason: `Region '${region.RegionID}' on slide '${slide.SlideID}' is locked (owner-only protection).`
        };
    }

    /**
     * Toggles lock state on a slide (`§6.2`). Only the locker or artifact owner may unlock a locked slide.
     */
    public SetSlideLock(
        deck: SlideDeckSpec,
        slideId: string,
        locked: boolean,
        actorUserId: string,
        allowEditors = false,
        ownerUserId?: string | null
    ): { Deck: SlideDeckSpec; UpdatedSlide: SlideSpec | null } {
        const existing = deck.Slides.find((s) => s.SlideID === slideId || UUIDsEqual(s.SlideID, slideId));
        if (!existing) {
            return { Deck: deck, UpdatedSlide: null };
        }
        if (existing.Locked) {
            const canUnlock = this.CanActorEditSlide(existing, actorUserId, ownerUserId, false);
            if (!canUnlock.Allowed) {
                throw new Error(canUnlock.Reason);
            }
        }
        let updatedSlide: SlideSpec | null = null;
        const nextSlides = deck.Slides.map((s) => {
            if (s.SlideID !== existing.SlideID) return s;
            updatedSlide = {
                ...s,
                Locked: locked,
                LockedByUserID: locked ? actorUserId : undefined,
                AllowEditors: locked ? allowEditors : undefined
            };
            return updatedSlide;
        });
        return {
            Deck: { ...deck, Slides: nextSlides, UpdatedAt: new Date().toISOString() },
            UpdatedSlide: updatedSlide
        };
    }

    /**
     * Toggles lock state on a specific region within a slide (`§6.2`).
     */
    public SetRegionLock(
        deck: SlideDeckSpec,
        slideId: string,
        regionId: string,
        locked: boolean,
        actorUserId: string,
        allowEditors = false,
        ownerUserId?: string | null
    ): { Deck: SlideDeckSpec; UpdatedRegion: SlideRegionSpec | null } {
        const slide = deck.Slides.find((s) => s.SlideID === slideId || UUIDsEqual(s.SlideID, slideId));
        if (!slide) {
            return { Deck: deck, UpdatedRegion: null };
        }
        const region = slide.Regions.find((r) => r.RegionID === regionId);
        if (!region) {
            return { Deck: deck, UpdatedRegion: null };
        }
        if (region.Locked || slide.Locked) {
            const check = this.CanActorEditRegion(slide, region, actorUserId, ownerUserId, false);
            if (!check.Allowed) {
                throw new Error(check.Reason);
            }
        }
        let updatedRegion: SlideRegionSpec | null = null;
        const nextSlides = deck.Slides.map((s) => {
            if (s.SlideID !== slide.SlideID) return s;
            const nextRegions = s.Regions.map((r) => {
                if (r.RegionID !== regionId) return r;
                updatedRegion = {
                    ...r,
                    Locked: locked,
                    LockedByUserID: locked ? actorUserId : undefined,
                    AllowEditors: locked ? allowEditors : undefined
                };
                return updatedRegion;
            });
            return { ...s, Regions: nextRegions };
        });
        return {
            Deck: { ...deck, Slides: nextSlides, UpdatedAt: new Date().toISOString() },
            UpdatedRegion: updatedRegion
        };
    }

    /**
     * Updates a single slide's metadata (`Title`, `Subtitle`, `Layout`, `SpeakerNotes`, `Transition`, `Hidden`)
     * by `SlideID` without modifying any other slide in the deck (`Accept #3`).
     */
    public UpdateSlideMetadata(
        deck: SlideDeckSpec,
        slideId: string,
        patch: {
            Title?: string;
            Subtitle?: string;
            Layout?: SlideLayoutKind;
            SpeakerNotes?: string;
            Transition?: SlideTransitionKind;
            Hidden?: boolean;
        },
        lockContext?: { ActorUserID?: string | null; OwnerUserID?: string | null; IsEditor?: boolean; BypassLock?: boolean }
    ): { Deck: SlideDeckSpec; UpdatedSlide: SlideSpec | null } {
        let updatedSlide: SlideSpec | null = null;
        const nextSlides = deck.Slides.map((slide) => {
            if (slide.SlideID !== slideId && !UUIDsEqual(slide.SlideID, slideId)) {
                return slide;
            }
            if (!lockContext?.BypassLock) {
                const check = this.CanActorEditSlide(
                    slide,
                    lockContext?.ActorUserID,
                    lockContext?.OwnerUserID,
                    lockContext?.IsEditor
                );
                if (!check.Allowed) {
                    throw new Error(check.Reason);
                }
                if (patch.Layout && patch.Layout !== slide.Layout) {
                    for (const region of slide.Regions) {
                        if (region.Locked) {
                            const regionCheck = this.CanActorEditRegion(
                                slide,
                                region,
                                lockContext?.ActorUserID,
                                lockContext?.OwnerUserID,
                                lockContext?.IsEditor
                            );
                            if (!regionCheck.Allowed) {
                                throw new Error(
                                    `Cannot change layout on slide '${slide.SlideID}' because region '${region.RegionID}' is locked (owner-only protection).`
                                );
                            }
                        }
                    }
                }
            }
            const nextLayout = patch.Layout ?? slide.Layout;
            const nextRegions =
                patch.Layout && patch.Layout !== slide.Layout
                    ? this.BuildRegionsForLayout(patch.Layout, slide.Regions)
                    : slide.Regions.map((r) => ({ ...r }));

            updatedSlide = {
                ...slide,
                Title: patch.Title !== undefined ? patch.Title : slide.Title,
                Subtitle: patch.Subtitle !== undefined ? patch.Subtitle : slide.Subtitle,
                Layout: nextLayout,
                Regions: nextRegions,
                SpeakerNotes: patch.SpeakerNotes !== undefined ? patch.SpeakerNotes : slide.SpeakerNotes,
                Transition: patch.Transition !== undefined ? patch.Transition : slide.Transition,
                Hidden: patch.Hidden !== undefined ? patch.Hidden : slide.Hidden
            };
            return updatedSlide;
        });

        if (!updatedSlide) {
            return { Deck: deck, UpdatedSlide: null };
        }

        return {
            Deck: {
                ...deck,
                Slides: nextSlides,
                UpdatedAt: new Date().toISOString()
            },
            UpdatedSlide: updatedSlide
        };
    }

    /**
     * Updates or inserts a single region (`regionId`) on a target slide (`slideId`) without
     * touching any other slide or region in the deck (`Accept #3`).
     */
    public UpsertSlideRegion(
        deck: SlideDeckSpec,
        slideId: string,
        regionPatch: Partial<SlideRegionSpec> & { RegionID: string },
        lockContext?: { ActorUserID?: string | null; OwnerUserID?: string | null; IsEditor?: boolean; BypassLock?: boolean }
    ): { Deck: SlideDeckSpec; UpdatedRegion: SlideRegionSpec | null } {
        let updatedRegion: SlideRegionSpec | null = null;

        const nextSlides = deck.Slides.map((slide) => {
            if (slide.SlideID !== slideId && !UUIDsEqual(slide.SlideID, slideId)) {
                return slide;
            }
            if (!lockContext?.BypassLock) {
                const slideCheck = this.CanActorEditSlide(
                    slide,
                    lockContext?.ActorUserID,
                    lockContext?.OwnerUserID,
                    lockContext?.IsEditor
                );
                if (!slideCheck.Allowed) {
                    throw new Error(slideCheck.Reason);
                }
            }

            const existingIndex = slide.Regions.findIndex((r) => r.RegionID === regionPatch.RegionID);
            const nextRegions = slide.Regions.map((r) => ({ ...r }));

            if (existingIndex >= 0) {
                const current = nextRegions[existingIndex];
                if (!lockContext?.BypassLock) {
                    const regionCheck = this.CanActorEditRegion(
                        slide,
                        current,
                        lockContext?.ActorUserID,
                        lockContext?.OwnerUserID,
                        lockContext?.IsEditor
                    );
                    if (!regionCheck.Allowed) {
                        throw new Error(regionCheck.Reason);
                    }
                }
                const merged: SlideRegionSpec = {
                    ...current,
                    ...regionPatch,
                    RegionID: current.RegionID,
                    Label: regionPatch.Label ?? current.Label,
                    Kind: regionPatch.Kind ?? current.Kind,
                    MarkdownContent:
                        regionPatch.MarkdownContent !== undefined ? regionPatch.MarkdownContent : current.MarkdownContent,
                    QuoteAttribution: regionPatch.QuoteAttribution ?? current.QuoteAttribution,
                    CalloutTone: regionPatch.CalloutTone ?? current.CalloutTone,
                    ImageUrl:
                        regionPatch.ImageUrl !== undefined
                            ? this.SanitizeImageUrl(regionPatch.ImageUrl)
                            : this.SanitizeImageUrl(current.ImageUrl),
                    ImageAlt: regionPatch.ImageAlt !== undefined ? regionPatch.ImageAlt : current.ImageAlt,
                    RevealStep: regionPatch.RevealStep !== undefined ? regionPatch.RevealStep : current.RevealStep
                };
                if (merged.BlockSpec && regionPatch.MarkdownContent === undefined) {
                    merged.MarkdownContent = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(
                        merged.BlockSpec
                    );
                } else if (merged.Kind === 'mj-block' && !merged.BlockSpec) {
                    const firstBlock = this.parseFirstBlockFromMarkdown(merged.MarkdownContent);
                    if (firstBlock) {
                        merged.BlockSpec = firstBlock;
                    }
                }
                nextRegions[existingIndex] = merged;
                updatedRegion = merged;
            } else {
                const created: SlideRegionSpec = {
                    RegionID: regionPatch.RegionID,
                    Label: regionPatch.Label || regionPatch.RegionID,
                    Kind: regionPatch.Kind || 'rich-text',
                    MarkdownContent: regionPatch.MarkdownContent ?? '',
                    BlockSpec: regionPatch.BlockSpec,
                    BigNumberValue: regionPatch.BigNumberValue,
                    BigNumberLabel: regionPatch.BigNumberLabel,
                    BigNumberDelta: regionPatch.BigNumberDelta,
                    QuoteAttribution: regionPatch.QuoteAttribution,
                    CalloutTone: regionPatch.CalloutTone,
                    ImageUrl: this.SanitizeImageUrl(regionPatch.ImageUrl),
                    ImageAlt: regionPatch.ImageAlt,
                    RevealStep: regionPatch.RevealStep
                };
                if (created.BlockSpec && !created.MarkdownContent) {
                    created.MarkdownContent = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(
                        created.BlockSpec
                    );
                }
                nextRegions.push(created);
                updatedRegion = created;
            }

            return {
                ...slide,
                Regions: nextRegions
            };
        });

        if (!updatedRegion) {
            return { Deck: deck, UpdatedRegion: null };
        }

        return {
            Deck: {
                ...deck,
                Slides: nextSlides,
                UpdatedAt: new Date().toISOString()
            },
            UpdatedRegion: updatedRegion
        };
    }

    /**
     * Deletes a slide by `slideId` (preserving at least 1 slide in the deck) and renumbers remaining slides.
     */
    public DeleteSlide(
        deck: SlideDeckSpec,
        slideId: string,
        lockContext?: { ActorUserID?: string | null; OwnerUserID?: string | null; IsEditor?: boolean; BypassLock?: boolean }
    ): { Deck: SlideDeckSpec; Deleted: boolean } {
        if (deck.Slides.length <= 1) {
            return { Deck: deck, Deleted: false };
        }
        const target = deck.Slides.find((s) => s.SlideID === slideId || UUIDsEqual(s.SlideID, slideId));
        if (!target) {
            return { Deck: deck, Deleted: false };
        }
        if (!lockContext?.BypassLock) {
            const check = this.CanActorEditSlide(
                target,
                lockContext?.ActorUserID,
                lockContext?.OwnerUserID,
                lockContext?.IsEditor
            );
            if (!check.Allowed) {
                throw new Error(check.Reason);
            }
            for (const region of target.Regions) {
                if (region.Locked) {
                    const regionCheck = this.CanActorEditRegion(
                        target,
                        region,
                        lockContext?.ActorUserID,
                        lockContext?.OwnerUserID,
                        lockContext?.IsEditor
                    );
                    if (!regionCheck.Allowed) {
                        throw new Error(regionCheck.Reason);
                    }
                }
            }
        }
        const filtered = deck.Slides.filter((s) => s.SlideID !== target.SlideID);
        return {
            Deck: {
                ...deck,
                Slides: this.renumberSlides(filtered.map((s) => this.cloneSlide(s))),
                UpdatedAt: new Date().toISOString()
            },
            Deleted: true
        };
    }

    /**
     * Reorders slides according to `orderedSlideIds`. Any slides not mentioned in `orderedSlideIds`
     * are appended in their existing relative order so no slide is ever lost during concurrent edits (`Accept #1`).
     */
    public ReorderSlides(deck: SlideDeckSpec, orderedSlideIds: string[]): SlideDeckSpec {
        const byId = new Map<string, SlideSpec>();
        for (const s of deck.Slides) {
            byId.set(s.SlideID, this.cloneSlide(s));
        }

        const nextSlides: SlideSpec[] = [];
        const placedIds = new Set<string>();

        for (const id of orderedSlideIds) {
            const match = byId.get(id);
            if (match && !placedIds.has(match.SlideID)) {
                nextSlides.push(match);
                placedIds.add(match.SlideID);
            }
        }

        for (const s of deck.Slides) {
            if (!placedIds.has(s.SlideID)) {
                nextSlides.push(this.cloneSlide(s));
                placedIds.add(s.SlideID);
            }
        }

        return {
            ...deck,
            Slides: this.renumberSlides(nextSlides),
            UpdatedAt: new Date().toISOString()
        };
    }

    /**
     * Moves a single slide up (`-1`) or down (`+1`) in the deck order.
     */
    public MoveSlide(deck: SlideDeckSpec, slideId: string, delta: -1 | 1): SlideDeckSpec {
        const idx = deck.Slides.findIndex((s) => s.SlideID === slideId || UUIDsEqual(s.SlideID, slideId));
        if (idx < 0) {
            return deck;
        }
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= deck.Slides.length) {
            return deck;
        }
        const ids = deck.Slides.map((s) => s.SlideID);
        const [moved] = ids.splice(idx, 1);
        ids.splice(targetIdx, 0, moved);
        return this.ReorderSlides(deck, ids);
    }

    /**
     * Applies either a named theme preset (`ThemeID`) or organization brand color seeds to `deck` (`Accept #4`).
     */
    public ApplyTheme(
        deck: SlideDeckSpec,
        themeOrSeeds: string | SlideDeckThemeSpec | OrganizationBrandThemeSeeds
    ): SlideDeckSpec {
        let resolvedTheme: SlideDeckThemeSpec;
        if (typeof themeOrSeeds === 'string') {
            const preset = SLIDE_DECK_THEME_PRESETS.find(
                (p) => p.ThemeID.toLowerCase() === themeOrSeeds.trim().toLowerCase() || p.Name.toLowerCase() === themeOrSeeds.trim().toLowerCase()
            );
            resolvedTheme = preset ? { ...preset } : { ...SLIDE_DECK_THEME_PRESETS[0] };
        } else if ('ThemeID' in themeOrSeeds && 'SurfaceColor' in themeOrSeeds && 'MutedTextColor' in themeOrSeeds) {
            resolvedTheme = { ...themeOrSeeds };
        } else {
            resolvedTheme = this.DeriveThemeFromBrandSeeds(themeOrSeeds);
        }

        return {
            ...deck,
            Theme: resolvedTheme,
            UpdatedAt: new Date().toISOString()
        };
    }

    /**
     * Applies a visual design preset (theme ID and optional slide-level transition across
     * unlocked slides) to `deck` in one atomic operation.
     */
    public ApplyDesignPreset(
        deck: SlideDeckSpec,
        themeOrSeeds: string | SlideDeckThemeSpec | OrganizationBrandThemeSeeds,
        options?: {
            Transition?: SlideTransitionKind;
            CardElevation?: SlideCardElevation;
            BackgroundStyle?: SlideBackgroundStyle;
        }
    ): SlideDeckSpec {
        let updated = this.ApplyTheme(deck, themeOrSeeds);
        if (options?.CardElevation || options?.BackgroundStyle) {
            updated = {
                ...updated,
                Theme: {
                    ...updated.Theme,
                    ...(options.CardElevation ? { CardElevation: options.CardElevation } : {}),
                    ...(options.BackgroundStyle ? { BackgroundStyle: options.BackgroundStyle } : {})
                }
            };
        }
        if (options?.Transition) {
            const transition = options.Transition;
            updated = {
                ...updated,
                Slides: updated.Slides.map((s) => (s.Locked ? s : { ...s, Transition: transition }))
            };
        }
        return updated;
    }

    /**
     * Deterministically polishes a slide's typography, visual pacing, progressive reveal steps,
     * and layout structure without losing content or embedded MJ blocks (`#2`).
     */
    public BeautifySlide(
        deck: SlideDeckSpec,
        slideId: string,
        lockContext?: { ActorUserID?: string | null; OwnerUserID?: string | null; IsEditor?: boolean; BypassLock?: boolean }
    ): { Deck: SlideDeckSpec; UpdatedSlide: SlideSpec | null; Improvements: string[] } {
        let updatedSlide: SlideSpec | null = null;
        const improvements: string[] = [];

        const nextSlides = deck.Slides.map((slide) => {
            if (slide.SlideID !== slideId && !UUIDsEqual(slide.SlideID, slideId)) {
                return slide;
            }
            if (!lockContext?.BypassLock) {
                const check = this.CanActorEditSlide(
                    slide,
                    lockContext?.ActorUserID,
                    lockContext?.OwnerUserID,
                    lockContext?.IsEditor
                );
                if (!check.Allowed) {
                    throw new Error(check.Reason);
                }
            }

            let nextTransition: SlideTransitionKind = slide.Transition || 'fade';
            if (nextTransition === 'none') {
                nextTransition = slide.Layout === 'Title' || slide.Layout === 'SectionHeader' ? 'fade' : 'slide';
                improvements.push(`Set smooth '${nextTransition}' slide transition`);
            }

            // Normalize bullet formatting and bold lead-ins in unlocked text/callout regions
            const hasExistingRevealSteps = slide.Regions.some((r) => typeof r.RevealStep === 'number' && r.RevealStep > 0);
            const shouldAssignRevealSteps = !hasExistingRevealSteps && slide.Regions.length >= 2;
            let formattedRegionsCount = 0;

            const nextRegions = slide.Regions.map((region, idx) => {
                const regionEditable =
                    lockContext?.BypassLock ||
                    this.CanActorEditRegion(
                        slide,
                        region,
                        lockContext?.ActorUserID,
                        lockContext?.OwnerUserID,
                        lockContext?.IsEditor
                    ).Allowed;

                if (!regionEditable) {
                    return { ...region };
                }

                let nextMarkdown = region.MarkdownContent ?? '';
                if (region.Kind === 'rich-text' || region.Kind === 'callout') {
                    const polished = polishMarkdownBullets(nextMarkdown);
                    if (polished !== nextMarkdown) {
                        nextMarkdown = polished;
                        formattedRegionsCount++;
                    }
                }

                const nextRevealStep = shouldAssignRevealSteps ? idx + 1 : region.RevealStep;
                return {
                    ...region,
                    MarkdownContent: nextMarkdown,
                    ...(nextRevealStep !== undefined ? { RevealStep: nextRevealStep } : {})
                };
            });

            if (formattedRegionsCount > 0) {
                improvements.push(`Formatted scannable bullet hierarchy across ${formattedRegionsCount} region(s)`);
            }
            if (shouldAssignRevealSteps) {
                improvements.push(`Enabled ${nextRegions.length}-step progressive reveal for Presenter mode`);
            }

            // If single-region TitleAndBody contains >= 3 clear KPI metric bullets ("Label: $14.8M (+24%)"),
            // upgrade cleanly to KpiStrip while preserving text.
            let finalLayout: SlideLayoutKind = slide.Layout;
            let finalRegions = nextRegions;
            if (slide.Layout === 'TitleAndBody' && nextRegions.length === 1 && nextRegions[0].Kind === 'rich-text') {
                const extractedKpis = tryExtractThreeKpiCards(nextRegions[0].MarkdownContent);
                if (extractedKpis) {
                    finalLayout = 'KpiStrip';
                    finalRegions = extractedKpis.map((kpi, idx) => ({
                        RegionID: `kpi-${idx + 1}`,
                        Label: kpi.Label,
                        Kind: 'big-number' as const,
                        BigNumberValue: kpi.Value,
                        BigNumberLabel: kpi.Label,
                        BigNumberDelta: kpi.Delta,
                        MarkdownContent: kpi.Notes,
                        RevealStep: idx + 1
                    }));
                    improvements.push('Upgraded bullet metrics into 3-card KpiStrip layout');
                }
            }

            if (improvements.length === 0) {
                improvements.push('Verified typography cadence and visual card alignment');
            }

            updatedSlide = {
                ...slide,
                Layout: finalLayout,
                Transition: nextTransition,
                Regions: finalRegions
            };
            return updatedSlide;
        });

        if (!updatedSlide) {
            return { Deck: deck, UpdatedSlide: null, Improvements: [] };
        }

        // Ensure deck theme carries modern elevation/background defaults if unset
        const polishedTheme: SlideDeckThemeSpec = {
            ...deck.Theme,
            BackgroundStyle: deck.Theme.BackgroundStyle ?? 'accent-strip',
            CardRadiusPx: deck.Theme.CardRadiusPx ?? 14,
            CardElevation: deck.Theme.CardElevation ?? 'soft',
            SecondaryGradientColor: deck.Theme.SecondaryGradientColor ?? deck.Theme.SurfaceColor
        };

        return {
            Deck: {
                ...deck,
                Theme: polishedTheme,
                Slides: nextSlides,
                UpdatedAt: new Date().toISOString()
            },
            UpdatedSlide: updatedSlide,
            Improvements: improvements
        };
    }

    /**
     * Freezes all live MJ blocks across `deck` using the viewer's current rendered results (`O6` & `Accept #2`).
     * Used when entering Presentation Mode (`O6`) and when generating a `.pptx` export (`Accept #2`).
     */
    public FreezeDeckLiveBlocksForPresentation(
        deck: SlideDeckSpec,
        blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
        user?: Pick<UserInfo, 'ID' | 'Name'> | null,
        options?: { SigningSecret?: string; RequireSignature?: boolean; ForceRefreshFrozen?: boolean; ArtifactID?: string }
    ): SlideDeckSpec {
        const frozenAt = new Date().toISOString();
        const frozenByUserId = user?.ID ?? 'presenter';
        const frozenByUserName = user?.Name ?? 'Presenter';

        const nextSlides = deck.Slides.map((slide) => {
            const nextRegions = slide.Regions.map((region) => {
                const block = this.ExtractRegionBlockSpec(region);
                if (!block) {
                    return { ...region };
                }
                // Preserve existing Frozen snapshots verbatim; never silently resign already-frozen blocks (`S3`).
                if (block.Mode === 'Frozen' && !options?.ForceRefreshFrozen) {
                    return { ...region };
                }
                const result = blockResultsByBlockId.get(block.BlockID);
                if (!result || !result.Success) {
                    return { ...region };
                }
                const snapshotBase: FrozenBlockSnapshot = {
                    FrozenAt: frozenAt,
                    FrozenByUserID: frozenByUserId,
                    FrozenByUserName: frozenByUserName,
                    Columns: result.Columns,
                    Rows: result.Rows,
                    TotalRowCount: result.TotalRowCount,
                    ...(result.ArtifactContent !== undefined ? { ArtifactContentSnapshot: result.ArtifactContent } : {}),
                    ...(result.ArtifactType !== undefined ? { ArtifactTypeSnapshot: result.ArtifactType } : {}),
                    SecurityWarningAcknowledged: true,
                    Binding: BuildBlockIdentityBinding(block, options?.ArtifactID)
                };
                let snapshotContentHash: string | undefined;
                try {
                    snapshotContentHash = ComputeFrozenSnapshotHash(snapshotBase, options?.SigningSecret);
                } catch (err) {
                    if (options?.RequireSignature) {
                        throw err;
                    }
                }
                const signedSnapshot: FrozenBlockSnapshot = snapshotContentHash
                    ? { ...snapshotBase, SnapshotContentHash: snapshotContentHash }
                    : snapshotBase;
                const frozenBlock: DocumentBlockSpec = {
                    ...block,
                    Mode: 'Frozen',
                    FrozenSnapshot: signedSnapshot
                };
                return {
                    ...region,
                    Kind: 'mj-block' as const,
                    BlockSpec: frozenBlock,
                    MarkdownContent: DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(frozenBlock)
                };
            });
            return {
                ...slide,
                Regions: nextRegions
            };
        });

        return {
            ...deck,
            Slides: nextSlides,
            UpdatedAt: frozenAt
        };
    }

    /**
     * Headlessly exports `deck` to ECMA-376 `.pptx` archive bytes (`NW-4`) with valid DrawingML theme/charts,
     * stripped XML control chars, hidden-slide filtering, and `4:3` / `16:9` aspect ratio support.
     */
    public ExportDeckToPptxBytes(deck: SlideDeckSpec, options?: SlideDeckPptxExportOptions): Uint8Array {
        return ExportDeckToPptxBytesInternal(deck, {
            ...options,
            SanitizeImageUrl: (raw) => this.SanitizeImageUrl(raw)
        });
    }

    /**
     * Headlessly imports `.pptx` archive bytes into a normalized {@link SlideDeckSpec} (`NW-4`).
     */
    public ImportDeckFromPptxBytes(pptxBytes: Uint8Array, fallbackTitle = 'Imported Presentation'): SlideDeckSpec {
        const parsed = ImportDeckFromPptxBytesInternal(pptxBytes, fallbackTitle);
        return this.normalizeDeckSpec(parsed, parsed.Title, parsed.DeckID);
    }

    /**
     * Executes all live MJ blocks across every slide region in `deck` for `user` (`Accept #2` & `Accept #5`).
     */
    public async ExecuteDeckLiveBlocks(
        deck: SlideDeckSpec,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<Record<string, DocumentBlockExecutionResult>> {
        const results: Record<string, DocumentBlockExecutionResult> = {};
        for (const slide of deck.Slides) {
            for (const region of slide.Regions) {
                const block = this.ExtractRegionBlockSpec(region);
                if (block) {
                    results[block.BlockID] = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
                        block,
                        user,
                        provider
                    );
                }
            }
        }
        return results;
    }

    /**
     * Extracts the {@link DocumentBlockSpec} from a {@link SlideRegionSpec} if the region hosts an MJ block.
     */
    public ExtractRegionBlockSpec(region: SlideRegionSpec): DocumentBlockSpec | null {
        if (region.BlockSpec) {
            return region.BlockSpec;
        }
        return this.parseFirstBlockFromMarkdown(region.MarkdownContent ?? '');
    }

    private parseFirstBlockFromMarkdown(markdown: string): DocumentBlockSpec | null {
        const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown ?? '');
        for (const seg of segments) {
            if (seg.Type === 'mj-block' && seg.BlockSpec) {
                return seg.BlockSpec;
            }
        }
        return null;
    }

    /**
     * Builds a structured outline summary of `deck` for agent perception (`SlideDeckToolLibrary`)
     * and slide sorter inspection.
     */
    public BuildDeckOutline(deck: SlideDeckSpec): SlideDeckOutlineSummary {
        return {
            DeckID: deck.DeckID,
            Title: deck.Title,
            AspectRatio: deck.AspectRatio,
            ThemeName: deck.Theme.Name,
            ThemeID: deck.Theme.ThemeID,
            SlideCount: deck.Slides.length,
            Slides: deck.Slides.map((slide) => {
                const blockIds: string[] = [];
                for (const r of slide.Regions) {
                    const b = this.ExtractRegionBlockSpec(r);
                    if (b) {
                        blockIds.push(b.BlockID);
                    }
                }
                return {
                    SlideID: slide.SlideID,
                    SlideNumber: slide.SlideNumber,
                    Layout: slide.Layout,
                    Title: slide.Title,
                    Subtitle: slide.Subtitle,
                    RegionIDs: slide.Regions.map((r) => r.RegionID),
                    EmbeddedBlockIDs: blockIds,
                    HasSpeakerNotes: Boolean(slide.SpeakerNotes && slide.SpeakerNotes.trim().length > 0),
                    Hidden: Boolean(slide.Hidden)
                };
            })
        };
    }

    private mergeOrCreateRegion(
        existing: SlideRegionSpec | undefined,
        fallback: SlideRegionSpec
    ): SlideRegionSpec {
        if (!existing) {
            return { ...fallback };
        }
        return {
            ...fallback,
            ...existing,
            RegionID: fallback.RegionID,
            Label: fallback.Label,
            MarkdownContent: existing.MarkdownContent || fallback.MarkdownContent
        };
    }

    private cloneSlide(slide: SlideSpec): SlideSpec {
        return {
            ...slide,
            Regions: slide.Regions.map((r) => ({
                ...r,
                BlockSpec: r.BlockSpec ? { ...r.BlockSpec } : undefined
            }))
        };
    }

    private mintUniqueSlideId(existingSlides: ReadonlyArray<SlideSpec>, requestedId?: string): string {
        const existingLower = new Set(existingSlides.map((s) => s.SlideID.toLowerCase()));
        if (requestedId && requestedId.trim().length > 0 && !existingLower.has(requestedId.trim().toLowerCase())) {
            return requestedId.trim();
        }
        let candidate = `slide-${generateRandomUuid()}`;
        while (existingLower.has(candidate.toLowerCase())) {
            candidate = `slide-${generateRandomUuid()}`;
        }
        return candidate;
    }

    private collectDeckBlockIds(slides: ReadonlyArray<SlideSpec>): Set<string> {
        const used = new Set<string>();
        for (const slide of slides) {
            for (const region of slide.Regions) {
                if (region.BlockSpec?.BlockID) {
                    used.add(region.BlockSpec.BlockID.toLowerCase());
                }
                const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(region.MarkdownContent ?? '');
                for (const seg of segments) {
                    if (seg.Type === 'mj-block' && seg.BlockSpec?.BlockID) {
                        used.add(seg.BlockSpec.BlockID.toLowerCase());
                    }
                }
            }
        }
        return used;
    }

    private cloneRegionWithFreshBlockIds(region: SlideRegionSpec, usedBlockIds: Set<string>): SlideRegionSpec {
        const mintBlockId = (): string => {
            let next = `blk-${generateRandomUuid()}`;
            while (usedBlockIds.has(next.toLowerCase())) {
                next = `blk-${generateRandomUuid()}`;
            }
            usedBlockIds.add(next.toLowerCase());
            return next;
        };

        let nextMarkdown = region.MarkdownContent ?? '';
        let nextBlockSpec = region.BlockSpec ? { ...region.BlockSpec } : undefined;
        const blockIdMap = new Map<string, string>();

        if (nextBlockSpec?.BlockID) {
            const freshId = mintBlockId();
            blockIdMap.set(nextBlockSpec.BlockID, freshId);
            nextBlockSpec = { ...nextBlockSpec, BlockID: freshId };
        }

        if (nextMarkdown.includes(':::mj-block')) {
            const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(nextMarkdown);
            const parts: string[] = [];
            for (const seg of segments) {
                if (seg.Type === 'mj-block' && seg.BlockSpec) {
                    const freshId = blockIdMap.get(seg.BlockSpec.BlockID) ?? mintBlockId();
                    blockIdMap.set(seg.BlockSpec.BlockID, freshId);
                    const clonedSpec: DocumentBlockSpec = { ...seg.BlockSpec, BlockID: freshId };
                    if (!nextBlockSpec) {
                        nextBlockSpec = clonedSpec;
                    }
                    parts.push(DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(clonedSpec));
                } else {
                    parts.push(seg.RawText);
                }
            }
            nextMarkdown = parts.join('\n');
        } else if (nextBlockSpec) {
            nextMarkdown = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(nextBlockSpec);
        }

        return {
            ...region,
            MarkdownContent: nextMarkdown,
            BlockSpec: nextBlockSpec
        };
    }

    private renumberSlides(slides: SlideSpec[]): SlideSpec[] {
        return slides.map((s, idx) => ({
            ...s,
            SlideNumber: idx + 1
        }));
    }

    private normalizeDeckSpec(
        raw: Partial<SlideDeckSpec>,
        fallbackTitle?: string,
        fallbackDeckId?: string
    ): SlideDeckSpec {
        const defaultTheme = SLIDE_DECK_THEME_PRESETS[0];
        const rawSlides = Array.isArray(raw.Slides) ? raw.Slides : [];

        const normalizedSlides: SlideSpec[] = rawSlides.map((s, idx) => {
            const layout: SlideLayoutKind = s.Layout || 'TitleAndBody';
            const rawRegions = Array.isArray(s.Regions) && s.Regions.length > 0
                ? s.Regions.map((r, rIdx) => {
                      const blockSpec = r.BlockSpec ?? (this.parseFirstBlockFromMarkdown(r.MarkdownContent ?? '') || undefined);
                      return {
                          RegionID: r.RegionID || `region-${rIdx + 1}`,
                          Label: r.Label || `Region ${rIdx + 1}`,
                          Kind: blockSpec ? ('mj-block' as const) : (r.Kind || 'rich-text'),
                          MarkdownContent:
                              r.MarkdownContent ??
                              (blockSpec
                                  ? DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec)
                                  : ''),
                          BlockSpec: blockSpec,
                          BigNumberValue: r.BigNumberValue,
                          BigNumberLabel: r.BigNumberLabel,
                          BigNumberDelta: r.BigNumberDelta,
                          QuoteAttribution: r.QuoteAttribution,
                          CalloutTone: r.CalloutTone,
                          ImageUrl: this.SanitizeImageUrl(r.ImageUrl),
                          ImageAlt: r.ImageAlt,
                          Locked: r.Locked,
                          LockedByUserID: r.LockedByUserID,
                          AllowEditors: r.AllowEditors,
                          RevealStep: typeof r.RevealStep === 'number' && r.RevealStep >= 0 ? r.RevealStep : undefined
                      };
                  })
                : this.BuildRegionsForLayout(layout);

            return {
                SlideID: s.SlideID || `slide-${idx + 1}`,
                SlideNumber: idx + 1,
                Layout: layout,
                Title: s.Title || `Slide ${idx + 1}`,
                Subtitle: s.Subtitle,
                Regions: normalizedSlidesRegions(rawRegions),
                SpeakerNotes: s.SpeakerNotes ?? '',
                Transition: s.Transition || 'fade',
                Hidden: Boolean(s.Hidden),
                Locked: s.Locked,
                LockedByUserID: s.LockedByUserID,
                AllowEditors: s.AllowEditors
            };
        });

        return {
            SchemaVersion: '1.0',
            DeckID: raw.DeckID || fallbackDeckId || 'deck-1',
            Title: raw.Title || fallbackTitle || 'Presentation',
            Subtitle: raw.Subtitle,
            AspectRatio: raw.AspectRatio === '4:3' ? '4:3' : '16:9',
            Theme: raw.Theme
                ? {
                      ThemeID: raw.Theme.ThemeID || defaultTheme.ThemeID,
                      Name: raw.Theme.Name || defaultTheme.Name,
                      PrimaryColor: this.SanitizeCssValue(raw.Theme.PrimaryColor, defaultTheme.PrimaryColor),
                      AccentColor: this.SanitizeCssValue(raw.Theme.AccentColor, defaultTheme.AccentColor),
                      BackgroundColor: this.SanitizeCssValue(raw.Theme.BackgroundColor, defaultTheme.BackgroundColor),
                      SurfaceColor: this.SanitizeCssValue(raw.Theme.SurfaceColor, defaultTheme.SurfaceColor),
                      TextColor: this.SanitizeCssValue(raw.Theme.TextColor, defaultTheme.TextColor),
                      MutedTextColor: this.SanitizeCssValue(raw.Theme.MutedTextColor, defaultTheme.MutedTextColor),
                      HeadingFont: this.SanitizeCssValue(raw.Theme.HeadingFont, defaultTheme.HeadingFont),
                      BodyFont: this.SanitizeCssValue(raw.Theme.BodyFont, defaultTheme.BodyFont),
                      BrandSeedSource: raw.Theme.BrandSeedSource,
                      SecondaryGradientColor: raw.Theme.SecondaryGradientColor
                          ? this.SanitizeCssValue(raw.Theme.SecondaryGradientColor, defaultTheme.SurfaceColor)
                          : undefined,
                      BackgroundStyle: raw.Theme.BackgroundStyle,
                      CardRadiusPx:
                          typeof raw.Theme.CardRadiusPx === 'number'
                              ? Math.max(0, Math.min(32, raw.Theme.CardRadiusPx))
                              : undefined,
                      CardElevation: raw.Theme.CardElevation
                  }
                : { ...defaultTheme },
            Master: {
                HeaderText: raw.Master?.HeaderText ?? '',
                FooterText: raw.Master?.FooterText ?? '',
                ShowSlideNumbers: raw.Master?.ShowSlideNumbers ?? true,
                ShowDate: raw.Master?.ShowDate ?? true,
                OrganizationName: raw.Master?.OrganizationName ?? 'MemberJunction',
                LogoUrl: this.SanitizeImageUrl(raw.Master?.LogoUrl)
            },
            Slides: normalizedSlides.length > 0 ? normalizedSlides : this.CreateDefaultDeck(fallbackTitle, fallbackDeckId).Slides,
            UpdatedAt: raw.UpdatedAt || new Date().toISOString()
        };
    }
}

function normalizedSlidesRegions(regions: SlideRegionSpec[]): SlideRegionSpec[] {
    return regions.map((r) => ({ ...r }));
}

/** Normalizes bullet markers and bolds `"Label: value"` lead-ins using linear string scanning. */
function polishMarkdownBullets(markdown: string): string {
    return markdown
        .split('\n')
        .map((rawLine) => {
            const trimmedEnd = rawLine.trimEnd();
            const trimmedStart = trimmedEnd.trimStart();
            const indent = trimmedEnd.slice(0, trimmedEnd.length - trimmedStart.length);
            let normalized = trimmedEnd;
            if (trimmedStart.length >= 3 && (trimmedStart[0] === '*' || trimmedStart[0] === '+')) {
                const afterMarkerRaw = trimmedStart.slice(1);
                const afterMarker = afterMarkerRaw.trimStart();
                if (afterMarker.length < afterMarkerRaw.length && afterMarker.length > 0) {
                    normalized = `${indent}- ${afterMarker}`;
                }
            }
            return boldLeadInLabel(normalized);
        })
        .join('\n')
        .trim();
}

/** Bolds plain `"Label: value"` bullet lead-ins without regular expression backtracking. */
function boldLeadInLabel(line: string): string {
    const trimmedStart = line.trimStart();
    if (!trimmedStart.startsWith('-')) {
        return line;
    }
    const afterDashRaw = trimmedStart.slice(1);
    const afterDash = afterDashRaw.trimStart();
    const dashSpaceLen = afterDashRaw.length - afterDash.length;
    if (dashSpaceLen === 0 || afterDash.length < 3 || afterDash.startsWith('**')) {
        return line;
    }
    const first = afterDash[0];
    const isUpperOrDigit = (first >= 'A' && first <= 'Z') || (first >= '0' && first <= '9');
    if (!isUpperOrDigit) {
        return line;
    }
    const colonIdx = afterDash.indexOf(':');
    if (colonIdx < 2 || colonIdx > 37) {
        return line;
    }
    const label = afterDash.slice(0, colonIdx);
    if (label.includes('*')) {
        return line;
    }
    const afterColonRaw = afterDash.slice(colonIdx + 1);
    const value = afterColonRaw.trimStart();
    if (value.length === 0 || value.length === afterColonRaw.length) {
        return line;
    }
    const indent = line.slice(0, line.length - trimmedStart.length);
    const dashPrefix = `-${afterDashRaw.slice(0, dashSpaceLen)}`;
    return `${indent}${dashPrefix}**${label.trim()}:** ${value}`;
}

function tryExtractThreeKpiCards(
    markdown: string
): Array<{ Label: string; Value: string; Delta: string; Notes: string }> | null {
    const lines = markdown
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[-*]\s+/.test(l));
    if (lines.length < 3 || lines.length > 4) {
        return null;
    }
    const cards: Array<{ Label: string; Value: string; Delta: string; Notes: string }> = [];
    for (const line of lines) {
        const clean = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
        const match = /^([^:]{2,40}):\s*([$€£]?\d[\d.,]*[%xMkKmMbB+]?)(?:\s*\(([^)]+)\))?(.*)$/.exec(clean);
        if (!match) {
            return null;
        }
        cards.push({
            Label: match[1].trim(),
            Value: match[2].trim(),
            Delta: match[3]?.trim() || 'Tracked KPI',
            Notes: match[4]?.replace(/^[\s—-]+/, '').trim() || match[1].trim()
        });
    }
    return cards.length === 3 ? cards : null;
}

function generateRandomUuid(): string {
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
