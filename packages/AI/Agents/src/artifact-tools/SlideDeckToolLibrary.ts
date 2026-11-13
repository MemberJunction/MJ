import { createHash } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult } from '@memberjunction/ai-core-plus';
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
    SlideRegionSpec
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
                        slideId: { type: 'string', description: 'Target SlideID to delete.' }
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
                        }
                    },
                    required: ['slideIds']
                }
            },
            {
                name: 'upsert_slide_element',
                description:
                    'Updates or inserts a structured region/element on a specific slide (rich-text, table, callout, big-number, quote, or mj-block including Live EntityView/SavedQuery and inline OLE Whiteboard Artifact blocks) without modifying any other slide.',
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
                                'Optional MJ block descriptor (Kind: EntityView | SavedQuery | DashboardPart | InteractiveComponent | Artifact, EntityName, QueryName, ArtifactID, ArtifactType, Mode).'
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
                        kind: { type: 'string', description: 'Region kind.' },
                        markdownContent: { type: 'string', description: 'Replacement Markdown content.' }
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
                        regionId: { type: 'string', description: 'Target RegionID to remove or clear.' }
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
                        speakerNotes: { type: 'string', description: 'Updated speaker notes text.' }
                    },
                    required: ['slideId', 'speakerNotes']
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
                        textColor: { type: 'string', description: 'Primary text hex color.' }
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
                        themeId: { type: 'string', description: 'Optional theme preset ID.' }
                    },
                    required: ['markdown']
                }
            }
        ];
    }

    protected override async invokeSubclassTool(
        toolName: string,
        input: Record<string, unknown>,
        artifactContent: string | Buffer
    ): Promise<ArtifactToolResult> {
        const contentStr = typeof artifactContent === 'string' ? artifactContent : artifactContent.toString('utf-8');

        switch (toolName) {
            case 'read_deck':
            case 'get_deck_outline':
                return this.handleReadDeck(contentStr, input);
            case 'get_slide':
                return this.handleGetSlide(contentStr, input);
            case 'add_slide':
                return this.handleAddSlide(contentStr, input);
            case 'update_slide':
                return this.handleUpdateSlide(contentStr, input);
            case 'delete_slide':
                return this.handleDeleteSlide(contentStr, input);
            case 'reorder_slides':
                return this.handleReorderSlides(contentStr, input);
            case 'upsert_slide_element':
            case 'update_slide_region':
                return this.handleUpsertSlideElement(contentStr, input);
            case 'delete_slide_element':
                return this.handleDeleteSlideElement(contentStr, input);
            case 'update_speaker_notes':
                return this.handleUpdateSpeakerNotes(contentStr, input);
            case 'apply_theme':
                return this.handleApplyTheme(contentStr, input);
            case 'generate_deck_from_markdown':
                return this.handleGenerateDeckFromMarkdown(contentStr, input);
            default:
                return { success: false, data: null, errorMessage: `Unknown SlideDeckToolLibrary tool: "${toolName}"` };
        }
    }

    /**
     * Computes a deterministic SHA-256 revision hash for optimistic concurrency checking.
     */
    public ComputeRevisionHash(content: string): string {
        return createHash('sha256').update(content ?? '', 'utf8').digest('hex');
    }

    private handleReadDeck(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
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

    private handleGetSlide(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
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

    private handleAddSlide(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'New Slide';
        const subtitle = typeof input.subtitle === 'string' ? input.subtitle : undefined;
        const layout = (typeof input.layout === 'string' ? input.layout : 'TitleAndBody') as SlideLayoutKind;
        const speakerNotes = typeof input.speakerNotes === 'string' ? input.speakerNotes : '';
        const slideId = typeof input.slideId === 'string' && input.slideId.trim() ? input.slideId.trim() : undefined;
        const insertAtIndex = typeof input.insertAtIndex === 'number' ? input.insertAtIndex : undefined;

        let initialRegions: SlideRegionSpec[] | undefined;
        if (typeof input.markdownContent === 'string' && input.markdownContent.trim()) {
            const defaultRegions = SlideDeckEngine.Instance.BuildRegionsForLayout(layout);
            defaultRegions[0] = {
                ...defaultRegions[0],
                MarkdownContent: input.markdownContent
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

    private handleUpdateSlide(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const expectedHash = typeof input.expectedRevisionHash === 'string' ? input.expectedRevisionHash.trim() : '';
        if (expectedHash && expectedHash !== this.ComputeRevisionHash(contentStr)) {
            return {
                success: false,
                data: null,
                errorMessage:
                    'Stale revision hash: the presentation was modified concurrently. Re-read the deck before applying updates.'
            };
        }

        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'update_slide requires a non-empty slideId.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const { Deck: afterMeta, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(deck, slideId, {
            Title: typeof input.title === 'string' ? input.title : undefined,
            Subtitle: typeof input.subtitle === 'string' ? input.subtitle : undefined,
            Layout: typeof input.layout === 'string' ? (input.layout as SlideLayoutKind) : undefined,
            SpeakerNotes: typeof input.speakerNotes === 'string' ? input.speakerNotes : undefined,
            Transition:
                typeof input.transition === 'string'
                    ? (input.transition as 'none' | 'fade' | 'slide')
                    : undefined,
            Hidden: typeof input.hidden === 'boolean' ? input.hidden : undefined
        });

        if (!UpdatedSlide) {
            return {
                success: false,
                data: null,
                errorMessage: `Slide "${slideId}" was not found in the presentation.`
            };
        }

        let finalDeck: SlideDeckSpec = afterMeta;
        if (typeof input.markdownContent === 'string') {
            const targetRegionId = UpdatedSlide.Regions[0]?.RegionID || 'main';
            const regionRes = SlideDeckEngine.Instance.UpsertSlideRegion(finalDeck, slideId, {
                RegionID: targetRegionId,
                MarkdownContent: input.markdownContent
            });
            finalDeck = regionRes.Deck;
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

    private handleDeleteSlide(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'delete_slide requires slideId.' };
        }
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const { Deck: updatedDeck, Deleted } = SlideDeckEngine.Instance.DeleteSlide(deck, slideId);
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

    private handleReorderSlides(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const rawIds = Array.isArray(input.slideIds) ? input.slideIds : [];
        const slideIds = rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
        if (slideIds.length === 0) {
            return { success: false, data: null, errorMessage: 'reorder_slides requires a non-empty slideIds array.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const updatedDeck = SlideDeckEngine.Instance.ReorderSlides(deck, slideIds);
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

    private handleUpsertSlideElement(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
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

        if (input.mjBlock && typeof input.mjBlock === 'object') {
            const rawBlock = input.mjBlock as Record<string, unknown>;
            blockSpec = {
                BlockID:
                    typeof rawBlock.BlockID === 'string'
                        ? rawBlock.BlockID
                        : `slide-blk-${slideId}-${regionId}`,
                Kind: (typeof rawBlock.Kind === 'string' ? rawBlock.Kind : 'EntityView') as DocumentBlockKind,
                Mode: (typeof rawBlock.Mode === 'string' ? rawBlock.Mode : 'Live') as DocumentBlockMode,
                Title: typeof rawBlock.Title === 'string' ? rawBlock.Title : undefined,
                EntityName: typeof rawBlock.EntityName === 'string' ? rawBlock.EntityName : undefined,
                ViewID: typeof rawBlock.ViewID === 'string' ? rawBlock.ViewID : undefined,
                ViewName: typeof rawBlock.ViewName === 'string' ? rawBlock.ViewName : undefined,
                ExtraFilter: typeof rawBlock.ExtraFilter === 'string' ? rawBlock.ExtraFilter : undefined,
                QueryID: typeof rawBlock.QueryID === 'string' ? rawBlock.QueryID : undefined,
                QueryName: typeof rawBlock.QueryName === 'string' ? rawBlock.QueryName : undefined,
                ArtifactID: typeof rawBlock.ArtifactID === 'string' ? rawBlock.ArtifactID : undefined,
                ArtifactType: typeof rawBlock.ArtifactType === 'string' ? rawBlock.ArtifactType : undefined,
                EmbedMode: (typeof rawBlock.EmbedMode === 'string' ? rawBlock.EmbedMode : 'Inline') as ArtifactEmbedMode
            };
            kind = 'mj-block';
            markdownContent = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(blockSpec);
        }

        const { Deck: updatedDeck, UpdatedRegion } = SlideDeckEngine.Instance.UpsertSlideRegion(deck, slideId, {
            RegionID: regionId,
            Label: typeof input.label === 'string' ? input.label : undefined,
            Kind: kind,
            MarkdownContent: markdownContent,
            BlockSpec: blockSpec,
            BigNumberValue: typeof input.bigNumberValue === 'string' ? input.bigNumberValue : undefined,
            BigNumberLabel: typeof input.bigNumberLabel === 'string' ? input.bigNumberLabel : undefined,
            BigNumberDelta: typeof input.bigNumberDelta === 'string' ? input.bigNumberDelta : undefined,
            QuoteAttribution: typeof input.quoteAttribution === 'string' ? input.quoteAttribution : undefined,
            CalloutTone:
                typeof input.calloutTone === 'string'
                    ? (input.calloutTone as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION')
                    : undefined
        });

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

    private handleDeleteSlideElement(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
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

    private handleUpdateSpeakerNotes(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const slideId = typeof input.slideId === 'string' ? input.slideId.trim() : '';
        const speakerNotes = typeof input.speakerNotes === 'string' ? input.speakerNotes : '';
        if (!slideId) {
            return { success: false, data: null, errorMessage: 'update_speaker_notes requires slideId.' };
        }

        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
        const { Deck: updatedDeck, UpdatedSlide } = SlideDeckEngine.Instance.UpdateSlideMetadata(deck, slideId, {
            SpeakerNotes: speakerNotes
        });

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

    private handleApplyTheme(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(contentStr);
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

    private handleGenerateDeckFromMarkdown(contentStr: string, input: Record<string, unknown>): ArtifactToolResult {
        const markdown = typeof input.markdown === 'string' ? input.markdown : contentStr;
        const deckTitle = typeof input.deckTitle === 'string' ? input.deckTitle : undefined;
        const existingDeck = contentStr.trim().startsWith('{')
            ? SlideDeckEngine.Instance.ParseDeckSpec(contentStr)
            : undefined;

        let generated = SlideDeckEngine.Instance.ConvertMarkdownToSlideDeck(
            markdown,
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
