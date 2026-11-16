import { createHash } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseArtifactToolLibrary,
    ArtifactJsonValue,
    ArtifactToolArgs,
    ArtifactToolDefinition,
    ArtifactToolResult,
    ResolveEmbeddedArtifactId,
    ResolveEmbeddedVersionId,
    type ArtifactToolExecutionContext
} from '@memberjunction/ai-core-plus';
import {
    ArtifactEmbedMode,
    DocumentBlockKind,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    SlideDeckEngine,
    SlideDeckSpec,
    SlideLayoutKind,
    SlideRegionKind,
    SlideRegionSpec,
    SlideSpec
} from '@memberjunction/core-entities';

/**
 * Server-side and agent tool library for `Presentation` (`Slide Deck`) artifacts (`MJ Slides`, § 3.6 & § 5).
 *
 * Registered under `'SlideDeckToolLibrary'` via `@RegisterClass(BaseArtifactToolLibrary, 'SlideDeckToolLibrary')`
 * to match `metadata/artifact-types/.artifact-types.json`.
 *
 * Supports:
 * - Deck & slide inspection (`read_deck`, `get_deck_outline`, `get_slide`),
 * - Targeted slide & region mutations (`add_slide`, `update_slide`, `delete_slide`, `reorder_slides`,
 *   `upsert_slide_element`, `update_slide_region`, `delete_slide_element`, `update_speaker_notes`),
 * - Brand theme & seed application (`apply_theme`, `Accept #4`), and
 * - Document-to-Deck synthesis (`generate_deck_from_markdown`, *"make a deck from this doc"*, `§ 5.2`).
 */
@RegisterClass(BaseArtifactToolLibrary, 'SlideDeckToolLibrary')
export class SlideDeckToolLibrary extends BaseArtifactToolLibrary {
    protected override getSubclassToolList(): ArtifactToolDefinition[] {
        return [
            {
                name: 'read_deck',
                description:
                    'Returns the full structured slide deck outline, active theme, master slide configuration, and per-slide metadata (slideId, slideNumber, layout, title, regionIds, embeddedBlockIds).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        includeFullSlides: {
                            type: 'boolean',
                            description: 'When true, includes the full regions and speakerNotes for every slide.'
                        }
                    }
                }
            },
            {
                name: 'get_deck_outline',
                description:
                    'Alias for read_deck: returns the slide deck outline summary, theme metadata, and slide list.',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'get_slide',
                description:
                    'Returns the full SlideSpec (layout, title, subtitle, regions, embedded MJ blocks, and speakerNotes) for a specific slide by slideId or 1-based slideNumber.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Stable SlideID of the slide to inspect.' },
                        slideNumber: { type: 'number', description: '1-based slide number if slideId is not provided.' }
                    }
                }
            },
            {
                name: 'add_slide',
                description:
                    'Adds a new slide to the presentation with a canonical layout (Title, SectionHeader, TitleAndBody, TwoColumn, Comparison, LiveDataSlide, ChartAndText, BigNumber, Quote, FullBleedImage, Blank).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Optional explicit SlideID.' },
                        layout: {
                            type: 'string',
                            description:
                                'Canonical slide layout (Title, SectionHeader, TitleAndBody, TwoColumn, Comparison, LiveDataSlide, ChartAndText, BigNumber, Quote, FullBleedImage, Blank).'
                        },
                        title: { type: 'string', description: 'Slide title.' },
                        subtitle: { type: 'string', description: 'Optional slide subtitle.' },
                        markdownContent: {
                            type: 'string',
                            description: 'Optional initial Markdown body for the primary region.'
                        },
                        speakerNotes: { type: 'string', description: 'Optional speaker notes for the slide.' },
                        insertAtIndex: {
                            type: 'number',
                            description: 'Optional 0-based index where the slide should be inserted.'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['title']
                }
            },
            {
                name: 'update_slide',
                description:
                    'Updates a single slide (title, subtitle, layout, speakerNotes, transition, hidden, or primary body) by slideId without touching any other slide in the deck (Accept #3).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID to update.' },
                        title: { type: 'string', description: 'New slide title.' },
                        subtitle: { type: 'string', description: 'New slide subtitle.' },
                        layout: { type: 'string', description: 'New canonical layout.' },
                        markdownContent: {
                            type: 'string',
                            description: 'Optional updated Markdown content for the primary region of this slide.'
                        },
                        speakerNotes: { type: 'string', description: 'Updated speaker notes.' },
                        transition: { type: 'string', description: 'Slide transition (none, fade, slide).' },
                        hidden: { type: 'boolean', description: 'Whether the slide is hidden during presentation.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId']
                }
            },
            {
                name: 'delete_slide',
                description: 'Deletes a slide by slideId (preserving at least 1 slide in the presentation).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID to delete.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId']
                }
            },
            {
                name: 'duplicate_slide',
                description: 'Duplicates an existing slide by slideId (generating unique slide and block IDs) and inserts it right after the source slide.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Source SlideID to duplicate.' },
                        title: { type: 'string', description: 'Optional override title for the duplicated slide.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId']
                }
            },
            {
                name: 'reorder_slides',
                description:
                    'Reorders the presentation slides according to an ordered array of slideIds without losing any unmentioned slides (Accept #1).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideIds: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Ordered list of SlideIDs.'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideIds']
                }
            },
            {
                name: 'upsert_slide_element',
                description:
                    'Updates or inserts a structured region/element on a specific slide (rich-text, table, callout, image, big-number, quote, or mj-block including Live EntityView/SavedQuery and inline OLE Whiteboard Artifact blocks) without modifying any other slide.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID.' },
                        regionId: {
                            type: 'string',
                            description: 'Target RegionID within the slide (e.g., "main", "left", "right", "data", "narrative").'
                        },
                        label: { type: 'string', description: 'Optional region label.' },
                        kind: {
                            type: 'string',
                            description: 'Region kind (rich-text, mj-block, callout, table, image, big-number, quote).'
                        },
                        markdownContent: { type: 'string', description: 'Markdown content for this region.' },
                        imageUrl: { type: 'string', description: 'Image URL or data URI when kind is image.' },
                        imageAlt: { type: 'string', description: 'Accessible alt text / caption when kind is image.' },
                        bigNumberValue: { type: 'string', description: 'Headline metric value when kind is big-number.' },
                        bigNumberLabel: { type: 'string', description: 'Metric label when kind is big-number.' },
                        bigNumberDelta: { type: 'string', description: 'Metric delta when kind is big-number.' },
                        quoteAttribution: { type: 'string', description: 'Attribution when kind is quote.' },
                        calloutTone: {
                            type: 'string',
                            description: 'Callout tone (NOTE, TIP, IMPORTANT, WARNING, CAUTION).'
                        },
                        mjBlock: {
                            type: 'object',
                            description:
                                'Optional MJ block descriptor (Kind, Mode, Title, EntityName, ViewID, ViewName, ExtraFilter, Fields, DisplayMode, ChartType, MaxRows, QueryID, QueryName, Parameters, DashboardID, ComponentID, ArtifactID, ArtifactType, VersionID, EmbedMode, SheetID, SheetName, SheetRange/Range, SheetChartID/ChartID).'
                        },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId', 'regionId']
                }
            },
            {
                name: 'update_slide_region',
                description: 'Alias for upsert_slide_element: updates a single region on a target slide by slideId and regionId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID.' },
                        regionId: { type: 'string', description: 'Target RegionID.' },
                        label: { type: 'string', description: 'Optional region label.' },
                        kind: { type: 'string', description: 'Region kind (rich-text, mj-block, callout, table, image, big-number, quote).' },
                        markdownContent: { type: 'string', description: 'Replacement Markdown content.' },
                        imageUrl: { type: 'string', description: 'Image URL or data URI when kind is image.' },
                        imageAlt: { type: 'string', description: 'Accessible alt text / caption when kind is image.' },
                        bigNumberValue: { type: 'string', description: 'Headline metric value when kind is big-number.' },
                        bigNumberLabel: { type: 'string', description: 'Metric label when kind is big-number.' },
                        bigNumberDelta: { type: 'string', description: 'Metric delta when kind is big-number.' },
                        quoteAttribution: { type: 'string', description: 'Attribution when kind is quote.' },
                        calloutTone: { type: 'string', description: 'Callout tone (NOTE, TIP, IMPORTANT, WARNING, CAUTION).' },
                        mjBlock: { type: 'object', description: 'Optional MJ block descriptor.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId', 'regionId']
                }
            },
            {
                name: 'delete_slide_element',
                description: 'Removes a secondary region/element from a slide or clears its content if it is the sole region.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID.' },
                        regionId: { type: 'string', description: 'Target RegionID to remove or clear.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId', 'regionId']
                }
            },
            {
                name: 'update_speaker_notes',
                description: 'Updates the presenter speaker notes on a target slide by slideId.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        slideId: { type: 'string', description: 'Target SlideID.' },
                        speakerNotes: { type: 'string', description: 'Updated speaker notes text.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['slideId', 'speakerNotes']
                }
            },
            {
                name: 'update_deck_metadata',
                description: 'Updates top-level presentation metadata (title, subtitle, aspectRatio) and master slide chrome settings.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: { type: 'string', description: 'Presentation title.' },
                        subtitle: { type: 'string', description: 'Presentation subtitle.' },
                        aspectRatio: {
                            type: 'string',
                            enum: ['16:9', '4:3'],
                            description: 'Presentation canvas aspect ratio.'
                        },
                        headerText: { type: 'string', description: 'Master header text.' },
                        footerText: { type: 'string', description: 'Master footer text.' },
                        showSlideNumbers: { type: 'boolean', description: 'Whether slide numbers appear in the footer.' },
                        showDate: { type: 'boolean', description: 'Whether the date appears in the footer.' },
                        organizationName: { type: 'string', description: 'Organization or presenter name in master chrome.' },
                        logoUrl: { type: 'string', description: 'Optional brand logo URL.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    }
                }
            },
            {
                name: 'apply_theme',
                description:
                    'Applies a preset theme (mj-default, executive-slate, emerald-growth, crimson-bold) or derives a new theme from organization brand color seeds (Accept #4).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        themeId: {
                            type: 'string',
                            description: 'Preset ThemeID (mj-default, executive-slate, emerald-growth, crimson-bold).'
                        },
                        organizationName: { type: 'string', description: 'Optional organization name for brand seeds.' },
                        primaryColor: { type: 'string', description: 'Organization brand primary hex color.' },
                        accentColor: { type: 'string', description: 'Organization brand accent hex color.' },
                        backgroundColor: { type: 'string', description: 'Slide stage background hex color.' },
                        surfaceColor: { type: 'string', description: 'Card/region surface hex color.' },
                        textColor: { type: 'string', description: 'Primary text hex color.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    }
                }
            },
            {
                name: 'generate_deck_from_markdown',
                description:
                    'Converts a Markdown document (headings, lists, tables, callouts, and embedded :::mj-block directives including Live MJ Blocks and OLE Whiteboards) into a structured SlideDeckSpec ("make a deck from this doc", § 5.2).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        markdown: { type: 'string', description: 'Source Markdown document text.' },
                        deckTitle: { type: 'string', description: 'Optional title for the generated presentation.' },
                        themeId: { type: 'string', description: 'Optional theme preset ID.' },
                        expectedRevisionHash: {
                            type: 'string',
                            description: 'Optional SHA-256 revision hash for optimistic concurrency protection.'
                        }
                    },
                    required: ['markdown']
                }
            }
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        input: ArtifactToolArgs,
        artifactContent: string | Buffer,
        context?: ArtifactToolExecutionContext
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        switch (toolName) {
            case 'read_deck':
            case 'get_deck_outline':
                return this.handleReadDeck(contentStr, input);
            case 'get_slide':
                return this.handleGetSlide(contentStr, input);
            case 'add_slide':
                return this.handleAddSlide(contentStr, input, context);
            case 'update_slide':
                return this.handleUpdateSlide(contentStr, input, context);
            case 'delete_slide':
                return this.handleDeleteSlide(contentStr, input, context);
            case 'duplicate_slide':
                return this.handleDuplicateSlide(contentStr, input, context);
            case 'reorder_slides':
                return this.handleReorderSlides(contentStr, input, context);
            case 'upsert_slide_element':
            case 'update_slide_region':
                return this.handleUpsertSlideElement(contentStr, input, context);
            case 'delete_slide_element':
                return this.handleDeleteSlideElement(contentStr, input, context);
            case 'update_speaker_notes':
                return this.handleUpdateSpeakerNotes(contentStr, input, context);
            case 'update_deck_metadata':
                return this.handleUpdateDeckMetadata(contentStr, input, context);
            case 'apply_theme':
                return this.handleApplyTheme(contentStr, input, context);
            case 'generate_deck_from_markdown':
                return this.handleGenerateDeckFromMarkdown(contentStr, input, context);
            default:
                return { success: false, data: null, errorMessage: `Unknown SlideDeckToolLibrary tool: "${toolName}"` };
        }
    }

    private normalizeArtifactBlocksInMarkdown(
        markdown: string,
        context?: ArtifactToolExecutionContext
    ): { ok: true; markdown: string; errorMessage?: never } | { ok: false; markdown?: never; errorMessage: string } {
        const parsedSegs = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
        let updated = markdown;
        for (const seg of parsedSegs) {
            if (seg.Type !== 'mj-block' || !seg.BlockSpec || seg.BlockSpec.Kind !== 'Artifact') {
                continue;
            }
            const rawArtifactId = String(seg.BlockSpec.ArtifactID ?? '').trim();
            if (!rawArtifactId) {
                return { ok: false, errorMessage: 'Embedded Artifact block requires a valid ArtifactID.' };
            }
            const resolved = ResolveEmbeddedArtifactId(rawArtifactId, context);
            if (!resolved.ok) {
                return { ok: false, errorMessage: resolved.errorMessage };
            }
            const rawVersionId = typeof seg.BlockSpec.VersionID === 'string' ? seg.BlockSpec.VersionID.trim() : '';
            let resolvedVersionId = seg.BlockSpec.VersionID;
            if (rawVersionId) {
                const verResult = ResolveEmbeddedVersionId(rawVersionId, context);
                if (!verResult.ok) {
                    return { ok: false, errorMessage: verResult.errorMessage };
                }
                resolvedVersionId = verResult.versionId;
            }
            if (resolved.artifactId !== seg.BlockSpec.ArtifactID || resolvedVersionId !== seg.BlockSpec.VersionID) {
                const normalizedDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
                    ...seg.BlockSpec,
                    ArtifactID: resolved.artifactId,
                    VersionID: resolvedVersionId
                });
                updated = updated.replace(seg.RawText, () => normalizedDirective);
            }
        }
        return { ok: true, markdown: updated };
    }

    private checkRevision(contentStr: string, expectedRevisionHash?: ArtifactJsonValue): string | null {
        if (typeof expectedRevisionHash !== 'string' || !expectedRevisionHash.trim()) {
            return null;
        }
        const current = this.ComputeRevisionHash(contentStr);
        if (current !== expectedRevisionHash.trim()) {
            return 'Stale revision hash: the presentation was modified concurrently. Re-read the deck before applying updates.';
        }
        return null;
    }

    private assertDeckUnlockedForGlobalEdit(
        deck: SlideDeckSpec,
        lockContext: { ActorUserID?: string | null; OwnerUserID?: string | null; IsEditor?: boolean }
    ): string | null {
        for (const slide of deck.Slides) {
            const slidePerm = SlideDeckEngine.Instance.CanActorEditSlide(
                slide,
                lockContext.ActorUserID,
                lockContext.OwnerUserID,
                lockContext.IsEditor
            );
            if (!slidePerm.Allowed) {
                return slidePerm.Reason ?? `Slide '${slide.SlideID}' is locked (owner-only protection).`;
            }
            for (const region of slide.Regions) {
                const regionPerm = SlideDeckEngine.Instance.CanActorEditRegion(
                    slide,
                    region,
                    lockContext.ActorUserID,
                    lockContext.OwnerUserID,
                    lockContext.IsEditor
                );
                if (!regionPerm.Allowed) {
                    return regionPerm.Reason ?? `Region '${region.RegionID}' on slide '${slide.SlideID}' is locked (owner-only protection).`;
                }
            }
        }
        return null;
    }

    /**
     * Computes a deterministic SHA-256 revision hash for optimistic concurrency checking.
     */
    public ComputeRevisionHash(content: string): string {
        return createHash('sha256').update(content ?? '', 'utf8').digest('hex');
    }

    private handleReadDeck(contentStr: string, input: ArtifactToolArgs): ArtifactToolResult {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const outline = SlideDeckEngine.Instance.BuildDeckOutline(deck);
        const includeFull = Boolean(input.includeFullSlides);

        return {
            success: true,
            data: {
                revisionHash: this.ComputeRevisionHash(contentStr),
                outline,
                theme: deck.Theme,
                master: deck.Master,
                slides: includeFull ? deck.Slides : undefined
            }
        };
    }

    private handleGetSlide(contentStr: string, input: ArtifactToolArgs): ArtifactToolResult {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        const slideNumber = typeof input.slideNumber === 'number' ? input.slideNumber : undefined;

        const found = deck.Slides.find(
            (s) => (slideId && s.SlideID === slideId) || (slideNumber !== undefined && s.SlideNumber === slideNumber)
        );
        if (!found) {
            return {
                success: false,
                data: null,
                errorMessage: `Slide not found for slideId="${slideId}" / slideNumber=${slideNumber ?? 'none'}.`
            };
        }

        return {
            success: true,
            data: {
                revisionHash: this.ComputeRevisionHash(contentStr),
                slide: found
            }
        };
    }

    private handleAddSlide(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'New Slide';
        const subtitle = typeof input.subtitle === 'string' ? input.subtitle : undefined;
        const layout = (typeof input.layout === 'string' ? input.layout : 'TitleAndBody') as SlideLayoutKind;
        const speakerNotes = typeof input.speakerNotes === 'string' ? input.speakerNotes : '';
        const slideId = typeof input.slideId === 'string' && input.slideId.trim() ? input.slideId.trim() : undefined;
        const insertAtIndex = typeof input.insertAtIndex === 'number' ? input.insertAtIndex : undefined;

        let initialRegions: SlideRegionSpec[] | undefined;
        if (typeof input.markdownContent === 'string' && input.markdownContent.trim()) {
            const normalized = this.normalizeArtifactBlocksInMarkdown(input.markdownContent, context);
            if (!normalized.ok) {
                return { success: false, data: null, errorMessage: normalized.errorMessage };
            }
            const defaultRegions = SlideDeckEngine.Instance.BuildRegionsForLayout(layout);
            defaultRegions[0] = {
                ...defaultRegions[0],
                MarkdownContent: normalized.markdown
            };
            initialRegions = defaultRegions;
        }

        const { Deck: updatedDeck, AddedSlide } = SlideDeckEngine.Instance.AddSlide(deck, {
            SlideID: slideId,
            Layout: layout,
            Title: title,
            Subtitle: subtitle,
            Regions: initialRegions,
            SpeakerNotes: speakerNotes,
            InsertAtIndex: insertAtIndex
        });

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                addedSlide: AddedSlide,
                slideCount: updatedDeck.Slides.length,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleUpdateSlide(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'update_slide requires a non-empty slideId.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        let afterMeta: SlideDeckSpec;
        let UpdatedSlide: SlideSpec | null;
        try {
            const metaRes = SlideDeckEngine.Instance.UpdateSlideMetadata(
                deck,
                slideId,
                {
                    Title: typeof input.title === 'string' ? input.title : undefined,
                    Subtitle: typeof input.subtitle === 'string' ? input.subtitle : undefined,
                    Layout: typeof input.layout === 'string' ? (input.layout as SlideLayoutKind) : undefined,
                    SpeakerNotes: typeof input.speakerNotes === 'string' ? input.speakerNotes : undefined,
                    Transition:
                        typeof input.transition === 'string'
                            ? (input.transition as 'none' | 'fade' | 'slide')
                            : undefined,
                    Hidden: typeof input.hidden === 'boolean' ? input.hidden : undefined
                },
                lockContext
            );
            afterMeta = metaRes.Deck;
            UpdatedSlide = metaRes.UpdatedSlide;
        } catch (err) {
            return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
        }

        if (!UpdatedSlide) {
            return {
                success: false,
                data: null,
                errorMessage: `Slide "${slideId}" was not found in the presentation.`
            };
        }

        let finalDeck: SlideDeckSpec = afterMeta;
        if (typeof input.markdownContent === 'string') {
            const normalized = this.normalizeArtifactBlocksInMarkdown(input.markdownContent, context);
            if (!normalized.ok) {
                return { success: false, data: null, errorMessage: normalized.errorMessage };
            }
            const targetRegionId = UpdatedSlide.Regions[0]?.RegionID || 'main';
            try {
                const regionRes = SlideDeckEngine.Instance.UpsertSlideRegion(
                    finalDeck,
                    slideId,
                    {
                        RegionID: targetRegionId,
                        MarkdownContent: normalized.markdown
                    },
                    lockContext
                );
                finalDeck = regionRes.Deck;
            } catch (err) {
                return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
            }
        }

        const updatedSlideFinal = finalDeck.Slides.find((s) => s.SlideID === slideId) ?? UpdatedSlide;
        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(finalDeck);
        return {
            success: true,
            data: {
                updatedSlide: updatedSlideFinal,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleDeleteSlide(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'delete_slide requires slideId.' };
        }
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        let updatedDeck: SlideDeckSpec;
        let Deleted: boolean;
        try {
            const delRes = SlideDeckEngine.Instance.DeleteSlide(deck, slideId, lockContext);
            updatedDeck = delRes.Deck;
            Deleted = delRes.Deleted;
        } catch (err) {
            return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
        }
        if (!Deleted) {
            return {
                success: false,
                data: null,
                errorMessage: `Could not delete slide "${slideId}" (slide not found or deck has only 1 slide).`
            };
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                deletedSlideId: slideId,
                slideCount: updatedDeck.Slides.length,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleDuplicateSlide(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'duplicate_slide requires slideId.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const sourceSlide = deck.Slides.find((s) => s.SlideID === slideId);
        if (!sourceSlide) {
            return { success: false, data: null, errorMessage: `Slide "${slideId}" was not found.` };
        }

        const lockContext = this.extractLockContext(context);
        const slidePerm = SlideDeckEngine.Instance.CanActorEditSlide(
            sourceSlide,
            lockContext.ActorUserID,
            lockContext.OwnerUserID,
            lockContext.IsEditor
        );
        if (!slidePerm.Allowed) {
            return { success: false, data: null, errorMessage: slidePerm.Reason };
        }

        const dupRes = SlideDeckEngine.Instance.DuplicateSlide(deck, slideId);
        if (!dupRes.DuplicatedSlide) {
            return { success: false, data: null, errorMessage: `Could not duplicate slide "${slideId}".` };
        }

        if (typeof input.title === 'string' && input.title.trim()) {
            dupRes.DuplicatedSlide.Title = input.title.trim();
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(dupRes.Deck);
        return {
            success: true,
            data: {
                sourceSlideId: slideId,
                duplicatedSlide: dupRes.DuplicatedSlide,
                slideCount: dupRes.Deck.Slides.length,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleReorderSlides(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const rawIds = Array.isArray(input.slideIds) ? input.slideIds : [];
        const slideIds = rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
        if (slideIds.length === 0) {
            return { success: false, data: null, errorMessage: 'reorder_slides requires a non-empty slideIds array.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        const originalIndexBySlideId = new Map<string, number>();
        deck.Slides.forEach((s, idx) => originalIndexBySlideId.set(s.SlideID, idx));

        const updatedDeck = SlideDeckEngine.Instance.ReorderSlides(deck, slideIds);
        for (let newIdx = 0; newIdx < updatedDeck.Slides.length; newIdx++) {
            const slide = updatedDeck.Slides[newIdx];
            const prevIdx = originalIndexBySlideId.get(slide.SlideID);
            if (prevIdx !== newIdx) {
                const slidePerm = SlideDeckEngine.Instance.CanActorEditSlide(
                    slide,
                    lockContext.ActorUserID,
                    lockContext.OwnerUserID,
                    lockContext.IsEditor
                );
                if (!slidePerm.Allowed) {
                    return { success: false, data: null, errorMessage: slidePerm.Reason };
                }
            }
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                orderedSlideIds: updatedDeck.Slides.map((s) => s.SlideID),
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleUpsertSlideElement(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        const regionId = typeof input.regionId === 'string' ? input.regionId.trim() : '';
        if (!slideId || !regionId) {
            return {
                success: false,
                data: null,
                errorMessage: 'upsert_slide_element requires both slideId and regionId.'
            };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        let blockSpec: DocumentBlockSpec | undefined;
        let markdownContent = typeof input.markdownContent === 'string' ? input.markdownContent : undefined;
        let kind = (typeof input.kind === 'string' ? input.kind : undefined) as SlideRegionKind | undefined;

        if (input.mjBlock && typeof input.mjBlock === 'object' && !Array.isArray(input.mjBlock)) {
            const rawBlock = input.mjBlock as ArtifactToolArgs;
            const blockKind = (typeof rawBlock.Kind === 'string' ? rawBlock.Kind : 'EntityView') as DocumentBlockKind;
            let resolvedArtifactId = typeof rawBlock.ArtifactID === 'string' ? rawBlock.ArtifactID : undefined;
            if (blockKind === 'Artifact' || resolvedArtifactId) {
                const resolved = ResolveEmbeddedArtifactId(resolvedArtifactId ?? '', context);
                if (!resolved.ok) {
                    return { success: false, data: null, errorMessage: resolved.errorMessage };
                }
                resolvedArtifactId = resolved.artifactId;
            }
            let resolvedVersionId: string | null | undefined;
            if (typeof rawBlock.VersionID === 'string' && rawBlock.VersionID.trim()) {
                const verResult = ResolveEmbeddedVersionId(rawBlock.VersionID, context);
                if (!verResult.ok) {
                    return { success: false, data: null, errorMessage: verResult.errorMessage };
                }
                resolvedVersionId = verResult.versionId;
            } else if (rawBlock.VersionID === null) {
                resolvedVersionId = null;
            }
            const rawFields = Array.isArray(rawBlock.Fields)
                ? rawBlock.Fields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
                : undefined;
            const rawParameters =
                rawBlock.Parameters && typeof rawBlock.Parameters === 'object' && !Array.isArray(rawBlock.Parameters)
                    ? (rawBlock.Parameters as ArtifactToolArgs)
                    : undefined;
            const rawComponentSpec =
                rawBlock.ComponentSpec && typeof rawBlock.ComponentSpec === 'object' && !Array.isArray(rawBlock.ComponentSpec)
                    ? (rawBlock.ComponentSpec as ArtifactToolArgs)
                    : undefined;
            const sheetId =
                typeof rawBlock.SheetID === 'string' && rawBlock.SheetID.trim()
                    ? rawBlock.SheetID.trim()
                    : typeof rawBlock.SheetName === 'string' && rawBlock.SheetName.trim()
                      ? rawBlock.SheetName.trim()
                      : undefined;
            const sheetRange =
                typeof rawBlock.SheetRange === 'string' && rawBlock.SheetRange.trim()
                    ? rawBlock.SheetRange.trim()
                    : typeof rawBlock.Range === 'string' && rawBlock.Range.trim()
                      ? rawBlock.Range.trim()
                      : undefined;
            const sheetChartId =
                typeof rawBlock.SheetChartID === 'string' && rawBlock.SheetChartID.trim()
                    ? rawBlock.SheetChartID.trim()
                    : typeof rawBlock.ChartID === 'string' && rawBlock.ChartID.trim()
                      ? rawBlock.ChartID.trim()
                      : undefined;

            blockSpec = {
                BlockID:
                    typeof rawBlock.BlockID === 'string' && rawBlock.BlockID.trim()
                        ? rawBlock.BlockID.trim()
                        : `slide-blk-${slideId}-${regionId}`,
                Kind: blockKind,
                Mode: (typeof rawBlock.Mode === 'string' ? rawBlock.Mode : 'Live') as DocumentBlockMode,
                Title: typeof rawBlock.Title === 'string' ? rawBlock.Title : undefined,
                EntityName: typeof rawBlock.EntityName === 'string' ? rawBlock.EntityName : undefined,
                ViewID: typeof rawBlock.ViewID === 'string' ? rawBlock.ViewID : undefined,
                ViewName: typeof rawBlock.ViewName === 'string' ? rawBlock.ViewName : undefined,
                ExtraFilter: typeof rawBlock.ExtraFilter === 'string' ? rawBlock.ExtraFilter : undefined,
                OrderBy: typeof rawBlock.OrderBy === 'string' ? rawBlock.OrderBy : undefined,
                Fields: rawFields && rawFields.length > 0 ? rawFields : undefined,
                DisplayMode:
                    typeof rawBlock.DisplayMode === 'string'
                        ? (rawBlock.DisplayMode as DocumentBlockSpec['DisplayMode'])
                        : undefined,
                ChartType:
                    typeof rawBlock.ChartType === 'string'
                        ? (rawBlock.ChartType as DocumentBlockSpec['ChartType'])
                        : undefined,
                QueryID: typeof rawBlock.QueryID === 'string' ? rawBlock.QueryID : undefined,
                QueryName: typeof rawBlock.QueryName === 'string' ? rawBlock.QueryName : undefined,
                CategoryPath: typeof rawBlock.CategoryPath === 'string' ? rawBlock.CategoryPath : undefined,
                Parameters: rawParameters,
                DashboardID: typeof rawBlock.DashboardID === 'string' ? rawBlock.DashboardID : undefined,
                DashboardPartID: typeof rawBlock.DashboardPartID === 'string' ? rawBlock.DashboardPartID : undefined,
                DashboardName: typeof rawBlock.DashboardName === 'string' ? rawBlock.DashboardName : undefined,
                ComponentID: typeof rawBlock.ComponentID === 'string' ? rawBlock.ComponentID : undefined,
                ComponentName: typeof rawBlock.ComponentName === 'string' ? rawBlock.ComponentName : undefined,
                ComponentSpec: rawComponentSpec,
                ArtifactID: resolvedArtifactId,
                ArtifactType: typeof rawBlock.ArtifactType === 'string' ? rawBlock.ArtifactType : undefined,
                VersionID: resolvedVersionId,
                EmbedMode: (typeof rawBlock.EmbedMode === 'string' ? rawBlock.EmbedMode : 'Inline') as ArtifactEmbedMode,
                HeightPx:
                    typeof rawBlock.HeightPx === 'number' && Number.isFinite(rawBlock.HeightPx)
                        ? rawBlock.HeightPx
                        : undefined,
                SheetID: sheetId,
                SheetRange: sheetRange,
                SheetChartID: sheetChartId,
                MaxRows:
                    typeof rawBlock.MaxRows === 'number' && Number.isFinite(rawBlock.MaxRows) && rawBlock.MaxRows > 0
                        ? Math.floor(rawBlock.MaxRows)
                        : undefined,
                PageSize:
                    typeof rawBlock.PageSize === 'number' && Number.isFinite(rawBlock.PageSize) && rawBlock.PageSize > 0
                        ? Math.floor(rawBlock.PageSize)
                        : undefined,
                Collapsed: typeof rawBlock.Collapsed === 'boolean' ? rawBlock.Collapsed : undefined
            };
            kind = 'mj-block';
            markdownContent = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec);
        } else if (typeof markdownContent === 'string' && markdownContent.includes(':::mj-block')) {
            const normalized = this.normalizeArtifactBlocksInMarkdown(markdownContent, context);
            if (!normalized.ok) {
                return { success: false, data: null, errorMessage: normalized.errorMessage };
            }
            markdownContent = normalized.markdown;
        }

        const lockContext = this.extractLockContext(context);
        let updatedDeck: SlideDeckSpec;
        let UpdatedRegion: SlideRegionSpec | null;
        try {
            const upsertRes = SlideDeckEngine.Instance.UpsertSlideRegion(
                deck,
                slideId,
                {
                    RegionID: regionId,
                    Label: typeof input.label === 'string' ? input.label : undefined,
                    Kind: kind,
                    MarkdownContent: markdownContent,
                    BlockSpec: blockSpec,
                    ImageUrl: typeof input.imageUrl === 'string' ? input.imageUrl : undefined,
                    ImageAlt: typeof input.imageAlt === 'string' ? input.imageAlt : undefined,
                    BigNumberValue: typeof input.bigNumberValue === 'string' ? input.bigNumberValue : undefined,
                    BigNumberLabel: typeof input.bigNumberLabel === 'string' ? input.bigNumberLabel : undefined,
                    BigNumberDelta: typeof input.bigNumberDelta === 'string' ? input.bigNumberDelta : undefined,
                    QuoteAttribution: typeof input.quoteAttribution === 'string' ? input.quoteAttribution : undefined,
                    CalloutTone:
                        typeof input.calloutTone === 'string'
                            ? (input.calloutTone as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION')
                            : undefined
                },
                lockContext
            );
            updatedDeck = upsertRes.Deck;
            UpdatedRegion = upsertRes.UpdatedRegion;
        } catch (err) {
            return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
        }

        if (!UpdatedRegion) {
            return {
                success: false,
                data: null,
                errorMessage: `Slide "${slideId}" was not found.`
            };
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                slideId,
                updatedRegion: UpdatedRegion,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleDeleteSlideElement(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        const regionId = typeof input.regionId === 'string' ? input.regionId.trim() : '';
        if (!slideId || !regionId) {
            return {
                success: false,
                data: null,
                errorMessage: 'delete_slide_element requires both slideId and regionId.'
            };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const slide = deck.Slides.find((s) => s.SlideID === slideId);
        if (!slide) {
            return { success: false, data: null, errorMessage: `Slide "${slideId}" was not found.` };
        }
        const lockContext = this.extractLockContext(context);
        const targetRegion = slide.Regions.find((r) => r.RegionID === regionId);
        if (!targetRegion && slide.Regions.length !== 1) {
            return {
                success: false,
                data: null,
                errorMessage: `Region "${regionId}" was not found on slide "${slideId}".`
            };
        }
        const effectiveRegion = targetRegion ?? slide.Regions[0];

        const slidePerm = SlideDeckEngine.Instance.CanActorEditSlide(
            slide,
            lockContext.ActorUserID,
            lockContext.OwnerUserID,
            lockContext.IsEditor
        );
        if (!slidePerm.Allowed) {
            return { success: false, data: null, errorMessage: slidePerm.Reason };
        }
        if (effectiveRegion) {
            const regionPerm = SlideDeckEngine.Instance.CanActorEditRegion(
                slide,
                effectiveRegion,
                lockContext.ActorUserID,
                lockContext.OwnerUserID,
                lockContext.IsEditor
            );
            if (!regionPerm.Allowed) {
                return { success: false, data: null, errorMessage: regionPerm.Reason };
            }
        }

        if (slide.Regions.length > 1) {
            slide.Regions = slide.Regions.filter((r) => r.RegionID !== regionId);
        } else if (slide.Regions[0]) {
            slide.Regions[0] = {
                ...slide.Regions[0],
                Kind: 'rich-text',
                MarkdownContent: '',
                BlockSpec: undefined
            };
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        return {
            success: true,
            data: {
                slideId,
                deletedRegionId: regionId,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleUpdateSpeakerNotes(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        const speakerNotes = typeof input.speakerNotes === 'string' ? input.speakerNotes : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'update_speaker_notes requires slideId.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        let updatedDeck: SlideDeckSpec;
        let UpdatedSlide: SlideSpec | null;
        try {
            const metaRes = SlideDeckEngine.Instance.UpdateSlideMetadata(
                deck,
                slideId,
                { SpeakerNotes: speakerNotes },
                lockContext
            );
            updatedDeck = metaRes.Deck;
            UpdatedSlide = metaRes.UpdatedSlide;
        } catch (err) {
            return { success: false, data: null, errorMessage: err instanceof Error ? err.message : String(err) };
        }

        if (!UpdatedSlide) {
            return { success: false, data: null, errorMessage: `Slide "${slideId}" was not found.` };
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                slideId,
                speakerNotes: UpdatedSlide.SpeakerNotes,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleUpdateDeckMetadata(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        const lockErr = this.assertDeckUnlockedForGlobalEdit(deck, lockContext);
        if (lockErr) {
            return { success: false, data: null, errorMessage: lockErr };
        }

        if (typeof input.title === 'string' && input.title.trim()) {
            deck.Title = input.title.trim();
        }
        if (typeof input.subtitle === 'string') {
            deck.Subtitle = input.subtitle;
        }
        if (input.aspectRatio === '16:9' || input.aspectRatio === '4:3') {
            deck.AspectRatio = input.aspectRatio;
        }
        if (typeof input.headerText === 'string') {
            deck.Master.HeaderText = input.headerText;
        }
        if (typeof input.footerText === 'string') {
            deck.Master.FooterText = input.footerText;
        }
        if (typeof input.showSlideNumbers === 'boolean') {
            deck.Master.ShowSlideNumbers = input.showSlideNumbers;
        }
        if (typeof input.showDate === 'boolean') {
            deck.Master.ShowDate = input.showDate;
        }
        if (typeof input.organizationName === 'string') {
            deck.Master.OrganizationName = input.organizationName;
        }
        if (typeof input.logoUrl === 'string') {
            deck.Master.LogoUrl = input.logoUrl;
        }
        deck.UpdatedAt = new Date().toISOString();

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        return {
            success: true,
            data: {
                title: deck.Title,
                subtitle: deck.Subtitle,
                aspectRatio: deck.AspectRatio,
                master: deck.Master,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private extractLockContext(context?: ArtifactToolExecutionContext): {
        ActorUserID?: string | null;
        OwnerUserID?: string | null;
        IsEditor?: boolean;
    } {
        return {
            ActorUserID: context?.actorUserId ?? context?.contextUser?.ID ?? null,
            OwnerUserID: context?.ownerUserId ?? null,
            IsEditor: Boolean(context?.isEditor)
        };
    }

    private handleApplyTheme(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const lockContext = this.extractLockContext(context);
        const lockErr = this.assertDeckUnlockedForGlobalEdit(deck, lockContext);
        if (lockErr) {
            return { success: false, data: null, errorMessage: lockErr };
        }

        let updatedDeck: SlideDeckSpec;
        if (typeof input.primaryColor === 'string' && input.primaryColor.trim()) {
            updatedDeck = SlideDeckEngine.Instance.ApplyTheme(deck, {
                OrganizationName: typeof input.organizationName === 'string' ? input.organizationName : undefined,
                PrimaryColor: input.primaryColor.trim(),
                AccentColor: typeof input.accentColor === 'string' ? input.accentColor : undefined,
                BackgroundColor: typeof input.backgroundColor === 'string' ? input.backgroundColor : undefined,
                SurfaceColor: typeof input.surfaceColor === 'string' ? input.surfaceColor : undefined,
                TextColor: typeof input.textColor === 'string' ? input.textColor : undefined
            });
        } else {
            const themeId = typeof input.themeId === 'string' ? input.themeId : 'mj-default';
            updatedDeck = SlideDeckEngine.Instance.ApplyTheme(deck, themeId);
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(updatedDeck);
        return {
            success: true,
            data: {
                theme: updatedDeck.Theme,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }

    private handleGenerateDeckFromMarkdown(
        contentStr: string,
        input: ArtifactToolArgs,
        context?: ArtifactToolExecutionContext
    ): ArtifactToolResult {
        const revError = this.checkRevision(contentStr, input.expectedRevisionHash);
        if (revError) {
            return { success: false, data: null, errorMessage: revError };
        }

        const lockContext = this.extractLockContext(context);
        const existingDeck = contentStr.trim().startsWith('{')
            ? SlideDeckEngine.Instance.ParseDeckSpec(contentStr)
            : undefined;
        if (existingDeck) {
            const lockErr = this.assertDeckUnlockedForGlobalEdit(existingDeck, lockContext);
            if (lockErr) {
                return { success: false, data: null, errorMessage: lockErr };
            }
        } else {
            const mdLocks = DocumentLiveBlockEngine.Instance.ParseDocumentLocks(contentStr);
            for (const lock of mdLocks) {
                if (
                    !DocumentLiveBlockEngine.Instance.CanActorEditLockedRange(
                        lock,
                        lockContext.ActorUserID,
                        lockContext.OwnerUserID,
                        lockContext.IsEditor
                    )
                ) {
                    return {
                        success: false,
                        data: null,
                        errorMessage: `Cannot regenerate deck over locked region '${lock.Label}' (${lock.Scope}).`
                    };
                }
            }
        }

        const rawMarkdown = typeof input.markdown === 'string' ? input.markdown : contentStr;
        const normalized = this.normalizeArtifactBlocksInMarkdown(rawMarkdown, context);
        if (!normalized.ok) {
            return { success: false, data: null, errorMessage: normalized.errorMessage };
        }
        const deckTitle = typeof input.deckTitle === 'string' ? input.deckTitle : undefined;

        let generated = SlideDeckEngine.Instance.ConvertMarkdownToSlideDeck(
            normalized.markdown,
            deckTitle || existingDeck?.Title,
            existingDeck?.Theme,
            existingDeck?.DeckID
        );

        if (typeof input.themeId === 'string' && input.themeId.trim()) {
            generated = SlideDeckEngine.Instance.ApplyTheme(generated, input.themeId.trim());
        }

        const updatedContent = SlideDeckEngine.Instance.SerializeDeckSpec(generated);
        return {
            success: true,
            data: {
                outline: SlideDeckEngine.Instance.BuildDeckOutline(generated),
                slideCount: generated.Slides.length,
                revisionHash: this.ComputeRevisionHash(updatedContent),
                updatedContent
            }
        };
    }
}

/** Tree-shaking prevention loader for {@link SlideDeckToolLibrary}. */
export function LoadSlideDeckToolLibrary(): void {
    // Ensures @RegisterClass decorator executes when imported.
}
