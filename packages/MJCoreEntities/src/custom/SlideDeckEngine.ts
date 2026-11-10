import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ComputeFrozenSnapshotHash,
    DocumentBlockExecutionResult,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot
} from './DocumentLiveBlockEngine.js';

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
    | 'Blank';

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
    Transition?: 'none' | 'fade' | 'slide';
    /** Whether this slide is skipped during full-screen Present mode. */
    Hidden?: boolean;
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
        BrandSeedSource: 'MJ Default Design Tokens'
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
        BrandSeedSource: 'Executive Dark Suite'
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
        BrandSeedSource: 'Emerald Brand Kit'
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
        BrandSeedSource: 'Crimson Brand Kit'
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
     * Sanitizes a CSS property value (color, font family, etc.) before interpolating it into a `<style>` block
     * or theme spec, stripping `;`, `{`, `}`, `<`, `>`, `\`, `url(`, `@import`, and `expression(`.
     */
    public SanitizeCssValue(raw: string | undefined | null, fallback = ''): string {
        const cleaned = String(raw ?? '')
            .replace(/[;{}<>\\]/g, '')
            .replace(/url\s*\(/gi, '')
            .replace(/@import/gi, '')
            .replace(/expression\s*\(/gi, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim();
        return cleaned || fallback;
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
        const primary = this.SanitizeCssValue(deck.Theme?.PrimaryColor, '#4f46e5');
        const accent = this.SanitizeCssValue(deck.Theme?.AccentColor, '#0ea5e9');
        const bg = this.SanitizeCssValue(deck.Theme?.BackgroundColor, '#ffffff');
        const surface = this.SanitizeCssValue(deck.Theme?.SurfaceColor, '#f8fafc');
        const text = this.SanitizeCssValue(deck.Theme?.TextColor, '#0f172a');
        const muted = this.SanitizeCssValue(deck.Theme?.MutedTextColor, '#475569');
        const headingFont = this.SanitizeCssValue(deck.Theme?.HeadingFont, 'Inter, system-ui, sans-serif');
        const bodyFont = this.SanitizeCssValue(deck.Theme?.BodyFont, 'Inter, system-ui, sans-serif');

        const slideBlocks = (deck.Slides ?? [])
            .filter((s) => !s.Hidden)
            .map((slide) => {
                const regionsHtml = (slide.Regions ?? [])
                    .map(
                        (r) =>
                            `<div class="slide-region" data-region-id="${escapeHtml(r.RegionID)}">${escapeHtml(r.MarkdownContent)}</div>`
                    )
                    .join('');
                return `<section class="slide-page" data-slide-id="${escapeHtml(slide.SlideID)}"><h1>${escapeHtml(slide.Title)}</h1>${
                    slide.Subtitle ? `<h2>${escapeHtml(slide.Subtitle)}</h2>` : ''
                }<div class="slide-regions">${regionsHtml}</div>${
                    deck.Master?.FooterText ? `<footer>${escapeHtml(deck.Master.FooterText)}</footer>` : ''
                }</section>`;
            })
            .join('\n');

        return [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"/>',
            `<title>${escapeHtml(deck.Title)}</title>`,
            '<style>',
            `:root { --slide-primary: ${primary}; --slide-accent: ${accent}; --slide-bg: ${bg}; --slide-surface: ${surface}; --slide-text: ${text}; --slide-muted: ${muted}; --slide-heading-font: ${headingFont}; --slide-body-font: ${bodyFont}; }`,
            'body { margin: 0; background: var(--slide-bg); color: var(--slide-text); font-family: var(--slide-body-font); }',
            'h1, h2 { font-family: var(--slide-heading-font); color: var(--slide-primary); }',
            '.slide-page { page-break-after: always; padding: 32px; background: var(--slide-bg); }',
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
            BrandSeedSource: seeds.BrandSeedSource || seeds.OrganizationName || 'Organization Brand Seeds'
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
        let inFence = false;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('```') || trimmedLine.startsWith(':::')) {
                inFence = !inFence;
            }
            const headingMatch = !inFence ? /^(#{1,3})\s+(.+)$/.exec(trimmedLine) : null;
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
                const blockDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(firstBlock);
                const strippedNarrative = cleanedBody.replace(parsedBlocks[0].RawText, () => '').trim();
                const isWhiteboard = firstBlock.Kind === 'Artifact' && firstBlock.ArtifactType === 'Whiteboard';

                return {
                    SlideID: slideId,
                    SlideNumber: idx + 1,
                    Layout: isWhiteboard ? 'ChartAndText' : 'LiveDataSlide',
                    Title: sec.heading,
                    Subtitle: firstBlock.Title || `${firstBlock.Kind} Slide`,
                    Regions: [
                        {
                            RegionID: 'data',
                            Label: firstBlock.Title || 'Embedded MJ Block',
                            Kind: 'mj-block',
                            MarkdownContent: blockDirective,
                            BlockSpec: firstBlock
                        },
                        {
                            RegionID: 'narrative',
                            Label: 'Key Insights',
                            Kind: 'rich-text',
                            MarkdownContent:
                                strippedNarrative ||
                                `- Live ${firstBlock.Kind} block integrated from source document\n- Viewer-scoped permissions enforced`
                        }
                    ],
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
            Transition?: 'none' | 'fade' | 'slide';
            Hidden?: boolean;
        }
    ): { Deck: SlideDeckSpec; UpdatedSlide: SlideSpec | null } {
        let updatedSlide: SlideSpec | null = null;
        const nextSlides = deck.Slides.map((slide) => {
            if (slide.SlideID !== slideId && !UUIDsEqual(slide.SlideID, slideId)) {
                return slide;
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
        regionPatch: Partial<SlideRegionSpec> & { RegionID: string }
    ): { Deck: SlideDeckSpec; UpdatedRegion: SlideRegionSpec | null } {
        let updatedRegion: SlideRegionSpec | null = null;

        const nextSlides = deck.Slides.map((slide) => {
            if (slide.SlideID !== slideId && !UUIDsEqual(slide.SlideID, slideId)) {
                return slide;
            }

            const existingIndex = slide.Regions.findIndex((r) => r.RegionID === regionPatch.RegionID);
            const nextRegions = slide.Regions.map((r) => ({ ...r }));

            if (existingIndex >= 0) {
                const current = nextRegions[existingIndex];
                const merged: SlideRegionSpec = {
                    ...current,
                    ...regionPatch,
                    RegionID: current.RegionID,
                    Label: regionPatch.Label ?? current.Label,
                    Kind: regionPatch.Kind ?? current.Kind,
                    MarkdownContent:
                        regionPatch.MarkdownContent !== undefined ? regionPatch.MarkdownContent : current.MarkdownContent
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
                    ImageUrl: regionPatch.ImageUrl,
                    ImageAlt: regionPatch.ImageAlt
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
    public DeleteSlide(deck: SlideDeckSpec, slideId: string): { Deck: SlideDeckSpec; Deleted: boolean } {
        if (deck.Slides.length <= 1) {
            return { Deck: deck, Deleted: false };
        }
        const filtered = deck.Slides.filter((s) => s.SlideID !== slideId && !UUIDsEqual(s.SlideID, slideId));
        if (filtered.length === deck.Slides.length) {
            return { Deck: deck, Deleted: false };
        }
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
     * Freezes all live MJ blocks across `deck` using the viewer's current rendered results (`O6` & `Accept #2`).
     * Used when entering Presentation Mode (`O6`) and when generating a `.pptx` export (`Accept #2`).
     */
    public FreezeDeckLiveBlocksForPresentation(
        deck: SlideDeckSpec,
        blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
        user?: Pick<UserInfo, 'ID' | 'Name'> | null
    ): SlideDeckSpec {
        const frozenAt = new Date().toISOString();
        const frozenByUserId = user?.ID ?? 'presenter';
        const frozenByUserName = user?.Name ?? 'Presenter';

        const nextSlides = deck.Slides.map((slide) => {
            const nextRegions = slide.Regions.map((region) => {
                const block = this.ExtractRegionBlockSpec(region);
                if (!block || block.Kind === 'Artifact') {
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
                    SecurityWarningAcknowledged: true
                };
                const frozenBlock: DocumentBlockSpec = {
                    ...block,
                    Mode: 'Frozen',
                    FrozenSnapshot: {
                        ...snapshotBase,
                        SnapshotContentHash: ComputeFrozenSnapshotHash(snapshotBase)
                    }
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
                          ImageUrl: r.ImageUrl,
                          ImageAlt: r.ImageAlt
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
                Hidden: Boolean(s.Hidden)
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
                      BrandSeedSource: raw.Theme.BrandSeedSource
                  }
                : { ...defaultTheme },
            Master: {
                HeaderText: raw.Master?.HeaderText ?? '',
                FooterText: raw.Master?.FooterText ?? '',
                ShowSlideNumbers: raw.Master?.ShowSlideNumbers ?? true,
                ShowDate: raw.Master?.ShowDate ?? true,
                OrganizationName: raw.Master?.OrganizationName ?? 'MemberJunction',
                LogoUrl: raw.Master?.LogoUrl
            },
            Slides: normalizedSlides.length > 0 ? normalizedSlides : this.CreateDefaultDeck(fallbackTitle, fallbackDeckId).Slides,
            UpdatedAt: raw.UpdatedAt || new Date().toISOString()
        };
    }
}

function normalizedSlidesRegions(regions: SlideRegionSpec[]): SlideRegionSpec[] {
    return regions.map((r) => ({ ...r }));
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
