import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    ConversationEngine,
    MJConversationEntity,
    SlideDeckEngine,
} from '@memberjunction/core-entities';
import { SlideDeckToolLibrary } from '../artifact-tools/SlideDeckToolLibrary';

function makeUser(id: string, name = 'Tester'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.com`;
    u.IsActive = true;
    return u;
}

describe('SlideDeckToolLibrary', () => {
    const lib = new SlideDeckToolLibrary();
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const editorId = '22222222-2222-4222-8222-222222222222';
    const sourceArtId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const targetArtId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('supports outline, duplicate_region, align_distribute_regions, upsert_speaker_notes, and batch_mutate_slides', async () => {
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Q4 Board Review', 'deck-test');
        const targetSlide = deck.Slides[1] ?? deck.Slides[0];
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        const outlineRes = await lib.InvokeTool('get_deck_outline', {}, raw);
        expect(outlineRes.success).toBe(true);
        const outlineData = outlineRes.data as { outline: { Slides: Array<{ SlideID: string }> } };
        expect(outlineData.outline.Slides.length).toBeGreaterThanOrEqual(1);

        const firstRegionId = targetSlide.Regions[0]?.RegionID;
        expect(firstRegionId).toBeTruthy();

        const dupRegion = await lib.InvokeTool(
            'duplicate_region',
            { slideId: targetSlide.SlideID, regionId: firstRegionId, newRegionId: 'reg-copy' },
            raw,
        );
        expect(dupRegion.success).toBe(true);
        const afterDup = (dupRegion.data as { updatedContent: string }).updatedContent;

        const alignRes = await lib.InvokeTool(
            'align_distribute_regions',
            { slideId: targetSlide.SlideID, orderedRegionIds: ['reg-copy', firstRegionId] },
            afterDup,
        );
        expect(alignRes.success).toBe(true);
        const afterAlign = (alignRes.data as { updatedContent: string }).updatedContent;
        const parsedAligned = SlideDeckEngine.Instance.ParseDeckSpec(afterAlign);
        const alignedSlide = parsedAligned.Slides.find((s) => s.SlideID === targetSlide.SlideID);
        expect(alignedSlide?.Regions[0]?.RegionID).toBe('reg-copy');

        const notesRes = await lib.InvokeTool(
            'upsert_speaker_notes',
            { slideId: targetSlide.SlideID, speakerNotes: 'Pause for Q&A', append: false },
            afterAlign,
        );
        expect(notesRes.success).toBe(true);
        const afterNotes = (notesRes.data as { updatedContent: string }).updatedContent;

        const batchRes = await lib.InvokeTool(
            'batch_mutate_slides',
            {
                operations: [
                    { slideId: targetSlide.SlideID, title: 'Updated Agenda', speakerNotes: 'Final note' },
                ],
            },
            afterNotes,
        );
        expect(batchRes.success).toBe(true);
        const parsedBatch = SlideDeckEngine.Instance.ParseDeckSpec(
            (batchRes.data as { updatedContent: string }).updatedContent,
        );
        const mutatedSlide = parsedBatch.Slides.find((s) => s.SlideID === targetSlide.SlideID);
        expect(mutatedSlide?.Title).toBe('Updated Agenda');
        expect(mutatedSlide?.SpeakerNotes).toBe('Final note');
    });

    it('clears the sole region in place via delete_slide_element and rejects batch_mutate_slides if any slide is locked', async () => {
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Lock Deck', 'deck-lock');
        const singleSlide = deck.Slides.find((s) => s.Regions.length === 1) ?? deck.Slides[0];
        const soleRegionId = singleSlide.Regions[0].RegionID;
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        const clearRes = await lib.InvokeTool(
            'delete_slide_element',
            { slideId: singleSlide.SlideID, regionId: soleRegionId },
            raw,
        );
        expect(clearRes.success).toBe(true);
        const clearedDeck = SlideDeckEngine.Instance.ParseDeckSpec(
            (clearRes.data as { updatedContent: string }).updatedContent,
        );
        const clearedSlide = clearedDeck.Slides.find((s) => s.SlideID === singleSlide.SlideID);
        expect(clearedSlide?.Regions).toHaveLength(1);
        expect(clearedSlide?.Regions[0]?.MarkdownContent).toBe('');

        singleSlide.Locked = true;
        singleSlide.LockedByUserID = ownerId;
        singleSlide.AllowEditors = false;
        const lockedRaw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        const blockedBatch = await lib.InvokeTool(
            'batch_mutate_slides',
            {
                operations: [{ slideId: singleSlide.SlideID, title: 'Unauthorized Change' }],
            },
            lockedRaw,
            { actorUserId: editorId, ownerUserId: ownerId },
        );
        expect(blockedBatch.success).toBe(false);
        expect(blockedBatch.errorMessage).toContain('locked');
    });

    it('fails closed on self-embed or unreadable embedded artifact in upsert_slide_element', async () => {
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Embed Deck', 'deck-embed');
        const slideId = deck.Slides[0].SlideID;
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        const actor = makeUser(editorId, 'Editor');
        const provider = {} as IMetadataProvider;

        const selfEmbed = await lib.InvokeTool(
            'upsert_slide_element',
            {
                slideId,
                regionId: 'reg-embed',
                kind: 'mj-block',
                mjBlock: {
                    BlockID: 'emb-self',
                    Title: 'Self Embed',
                    Kind: 'Artifact',
                    Mode: 'Live',
                    ArtifactID: sourceArtId,
                },
            },
            raw,
            {
                artifactId: sourceArtId,
                contextUser: actor,
                provider,
            },
        );
        expect(selfEmbed.success).toBe(false);
        expect(selfEmbed.errorMessage?.toLowerCase()).toContain('itself');

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: targetArtId,
            UserID: editorId,
            IsOwner: false,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: false,
            GrantedBy: 'none',
        });

        const deniedEmbed = await lib.InvokeTool(
            'upsert_slide_element',
            {
                slideId,
                regionId: 'reg-embed',
                kind: 'mj-block',
                mjBlock: {
                    BlockID: 'emb-other',
                    Title: 'Secret Sheet',
                    Kind: 'Artifact',
                    Mode: 'Live',
                    ArtifactID: targetArtId,
                },
            },
            raw,
            {
                artifactId: sourceArtId,
                contextUser: actor,
                provider,
            },
        );
        expect(deniedEmbed.success).toBe(false);
        expect(deniedEmbed.errorMessage?.toLowerCase()).toContain('read permission');
    });

    it('supports NW-3 comments and suggestions workflow across list/add/reply/resolve/propose/review', async () => {
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Comments Deck', 'deck-nw3');
        const slideId = deck.Slides[0].SlideID;
        const originalTitle = deck.Slides[0].Title;
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        const owner = makeUser(ownerId, 'Owner');
        const editor = makeUser(editorId, 'Editor');

        const threadId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: sourceArtId,
            UserID: editorId,
            IsOwner: false,
            CanRead: true,
            CanEdit: true,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: true,
            GrantedBy: 'direct',
        });
        const mockProvider = {
            Entities: [{ Name: 'MJ: Artifacts', ID: 'ent-art-1' }],
            EntityByName: (n: string) => (n === 'MJ: Artifacts' ? { Name: 'MJ: Artifacts', ID: 'ent-art-1' } : null),
            RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', ExecutionTime: 1 }),
            GetEntityObject: async (entityName?: string) => {
                if (entityName === 'MJ: Conversations') {
                    const convObj = {
                        ID: threadId,
                        Status: threadResolved ? 'Resolved' : 'Open',
                        Load: async () => true,
                        Save: async () => {
                            threadResolved = convObj.Status === 'Resolved';
                            return true;
                        },
                    };
                    return convObj;
                }
                return {
                    ID: 'detail-reply-1',
                    ConversationID: '',
                    UserID: '',
                    Role: 'AI',
                    Message: '',
                    NewRecord: () => undefined,
                    Save: async () => true,
                };
            },
        } as object as IMetadataProvider;

        let threadResolved = false;
        vi.spyOn(ConversationEngine.Instance, 'CreateAnchoredConversation').mockResolvedValue({
            Conversation: { ID: threadId, Name: 'Slide 1', AnchorKey: `slide:${slideId}` } as MJConversationEntity,
            InitialDetail: { ID: 'detail-1' } as never,
        });
        vi.spyOn(ConversationEngine.Instance, 'LoadAnchoredConversations').mockImplementation(async () => {
            const conv = {
                ID: threadId,
                Name: 'Slide 1',
                AnchorType: 'Slide',
                AnchorKey: `slide:${slideId}`,
                Status: threadResolved ? 'Resolved' : 'Open',
                Load: async () => true,
                Save: async () => {
                    threadResolved = conv.Status === 'Resolved';
                    return true;
                },
            } as object as MJConversationEntity;
            return [conv];
        });

        const addComment = await lib.InvokeTool(
            'add_comment',
            {
                anchor: { slideId },
                body: 'Make this title punchier',
            },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: editor, provider: mockProvider },
        );
        expect(addComment.success).toBe(true);
        expect((addComment.data as { threadId: string }).threadId).toBe(threadId);

        const replyRes = await lib.InvokeTool(
            'reply_comment',
            { threadId, body: 'Will revise now' },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: owner, provider: mockProvider },
        );
        expect(replyRes.success).toBe(true);

        const resolveRes = await lib.InvokeTool(
            'resolve_comment',
            { threadId, resolved: true },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: owner, provider: mockProvider },
        );
        expect(resolveRes.success).toBe(true);

        const listRes = await lib.InvokeTool(
            'list_comments',
            { status: 'All' },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: owner, provider: mockProvider },
        );
        expect(listRes.success).toBe(true);
        expect((listRes.data as { threads: Array<{ ThreadID?: string; ID?: string }> }).threads.length).toBeGreaterThanOrEqual(1);

        const propRes = await lib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { slideId },
                originalSlice: originalTitle,
                proposedReplacement: '2026 Growth Roadmap',
                rationale: 'Highlight target year',
            },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: editor },
        );
        expect(propRes.success).toBe(true);
        const propData = propRes.data as {
            suggestionId: string;
            configurationPatch: { suggestions: Array<{ SuggestionID: string }> };
        };

        const acceptRes = await lib.InvokeTool(
            'review_suggestion',
            {
                suggestionId: propData.suggestionId,
                decision: 'accept',
            },
            raw,
            {
                artifactId: sourceArtId,
                versionNumber: 1,
                contextUser: owner,
                ownerUserId: ownerId,
                actorUserId: ownerId,
                configuration: JSON.stringify(propData.configurationPatch),
            },
        );
        expect(acceptRes.success).toBe(true);
        const acceptData = acceptRes.data as { updatedContent: string; status: string };
        expect(acceptData.status).toBe('Accepted');
        const updatedDeck = SlideDeckEngine.Instance.ParseDeckSpec(acceptData.updatedContent);
        expect(updatedDeck.Slides[0].Title).toBe('2026 Growth Roadmap');
    });

    it('resolves canonical slideId and regionId on propose_suggestion from slideNumber and elementId (P1-P3-1a)', async () => {
        const lib = new SlideDeckToolLibrary();
        const owner = makeUser(ownerId, 'Owner');
        const isolatedDeckArtId = '66666666-6666-4666-8666-666666666666';
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Anchor Resolution Deck', 'deck-anchor');
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
        const slide = deck.Slides[0];
        const firstRegion = slide.Regions[0];

        const propRes = await lib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { domain: 'slides', slideNumber: 1, elementId: firstRegion.RegionID },
                originalSlice: firstRegion.MarkdownContent,
                proposedReplacement: 'Updated regional takeaway',
                rationale: 'Resolve canonical slideId',
            },
            raw,
            { artifactId: isolatedDeckArtId, versionNumber: 1, contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId },
        );
        expect(propRes.success).toBe(true);
        const propData = propRes.data as {
            configurationPatch: { suggestions: Array<{ Anchor: { slideId?: string; slideNumber?: number; regionId?: string; elementId?: string } }> };
        };
        const savedAnchor = propData.configurationPatch.suggestions[0].Anchor;
        expect(savedAnchor.slideId).toBe(slide.SlideID);
        expect(savedAnchor.slideNumber).toBe(slide.SlideNumber);
        expect(savedAnchor.regionId).toBe(firstRegion.RegionID);
        expect(savedAnchor.elementId).toBe(firstRegion.RegionID);
    });

    it('supports apply_design_preset, beautify_slide, and revealStep in upsert_slide_element', async () => {
        const lib = new SlideDeckToolLibrary();
        const owner = makeUser(ownerId, 'Owner');
        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Studio Polish Deck', 'deck-studio-polish');
        const raw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);

        const presetRes = await lib.InvokeTool(
            'apply_design_preset',
            {
                themeId: 'ivory-luxury',
                transition: 'zoom',
                cardElevation: 'glass',
            },
            raw,
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(presetRes.success).toBe(true);
        const afterPresetStr = (presetRes.data as { updatedContent: string }).updatedContent;
        const afterPreset = SlideDeckEngine.Instance.ParseDeckSpec(afterPresetStr);
        expect(afterPreset.Theme.ThemeID).toBe('ivory-luxury');
        expect(afterPreset.Theme.CardElevation).toBe('glass');
        expect(afterPreset.Slides[0].Transition).toBe('zoom');

        // Add a KPI bullet slide and beautify it via beautify_slide tool
        const slide2Id = afterPreset.Slides[1].SlideID;
        const beautifyRes = await lib.InvokeTool(
            'beautify_slide',
            { slideId: slide2Id },
            afterPresetStr,
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(beautifyRes.success).toBe(true);
        const beautifiedDeck = SlideDeckEngine.Instance.ParseDeckSpec(
            (beautifyRes.data as { updatedContent: string }).updatedContent
        );
        const s2 = beautifiedDeck.Slides.find((s) => s.SlideID === slide2Id);
        expect(s2?.Regions.every((r) => typeof r.RevealStep === 'number' && r.RevealStep >= 1)).toBe(true);

        // Explicit revealStep update via upsert_slide_element
        const stepRes = await lib.InvokeTool(
            'upsert_slide_element',
            {
                slideId: slide2Id,
                regionId: s2!.Regions[0].RegionID,
                revealStep: 4,
            },
            SlideDeckEngine.Instance.SerializeDeckSpec(beautifiedDeck),
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(stepRes.success).toBe(true);
        const afterStep = SlideDeckEngine.Instance.ParseDeckSpec(
            (stepRes.data as { updatedContent: string }).updatedContent
        );
        expect(afterStep.Slides.find((s) => s.SlideID === slide2Id)?.Regions[0].RevealStep).toBe(4);
    });

    it('exposes list_design_options and rejects invalid layout, transition, and themeId values upfront', async () => {
        const lib = new SlideDeckToolLibrary();
        const ownerId = 'user-owner-design';
        const owner = new UserInfo();
        owner.ID = ownerId;

        const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Validation Deck', 'deck-val');
        const contentStr = SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck);

        const optionsRes = await lib.InvokeTool('list_design_options', {}, contentStr);
        expect(optionsRes.success).toBe(true);
        const optionsData = optionsRes.data as {
            layouts: Array<{ Kind: string }>;
            themes: Array<{ ThemeID: string }>;
            transitions: string[];
        };
        expect(optionsData.layouts.map((l) => l.Kind)).toEqual(
            expect.arrayContaining(['KpiStrip', 'Timeline', 'BentoGrid', 'Quadrant', 'MetricComparison'])
        );
        expect(optionsData.themes.length).toBeGreaterThanOrEqual(8);
        expect(optionsData.transitions).toEqual(['none', 'fade', 'slide', 'zoom']);

        const badLayout = await lib.InvokeTool(
            'add_slide',
            { title: 'Invalid', layout: 'FakeLayout' },
            contentStr,
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(badLayout.success).toBe(false);
        expect(badLayout.errorMessage).toContain('Invalid slide layout');

        const badTheme = await lib.InvokeTool(
            'apply_design_preset',
            { themeId: 'non-existent-theme' },
            contentStr,
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(badTheme.success).toBe(false);
        expect(badTheme.errorMessage).toContain('Unknown themeId');

        const badTransition = await lib.InvokeTool(
            'update_slide',
            { slideId: baseDeck.Slides[0].SlideID, transition: 'checkerboard' },
            contentStr,
            { contextUser: owner, ownerUserId: ownerId, actorUserId: ownerId }
        );
        expect(badTransition.success).toBe(false);
        expect(badTransition.errorMessage).toContain('Invalid slide transition');
    });
});
