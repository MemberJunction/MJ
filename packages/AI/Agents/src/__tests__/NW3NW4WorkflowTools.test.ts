import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    ConversationEngine,
    MJConversationEntity,
    SlideDeckEngine,
    SpreadsheetEngine,
} from '@memberjunction/core-entities';
import {
    SetArtifactLiveContentReaderHook,
} from '../artifact-presence-locator';
import { SlideDeckToolLibrary } from '../artifact-tools/SlideDeckToolLibrary';
import { SpreadsheetToolLibrary } from '../artifact-tools/SpreadsheetToolLibrary';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';

function makeUser(id: string, name = 'Tester'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.com`;
    u.IsActive = true;
    return u;
}

describe('NW-3, NW-4 & Tool Library Hardening (Spreadsheet & Document)', () => {
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const editorId = '22222222-2222-4222-8222-222222222222';
    const sourceArtId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const otherArtId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('isolates originalXlsxBytes per request when running concurrent SpreadsheetToolLibrary invocations', async () => {
        const sheetLib = new SpreadsheetToolLibrary();
        const wb1 = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Book1', ['AlphaSheet']);
        SpreadsheetEngine.Instance.SetCell(wb1, wb1.Worksheets[0].SheetID, 'A1', { Value: 'AlphaVal' }, false);
        const bytes1 = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(wb1));

        const wb2 = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Book2', ['BetaSheet']);
        SpreadsheetEngine.Instance.SetCell(wb2, wb2.Worksheets[0].SheetID, 'A1', { Value: 'BetaVal' }, false);
        const bytes2 = Buffer.from(SpreadsheetEngine.Instance.ExportToXlsxBytes(wb2));

        const [res1, res2] = await Promise.all([
            sheetLib.InvokeTool(
                'write_cells',
                { sheet: 'AlphaSheet', cells: [{ address: 'B1', value: 'One' }] },
                SpreadsheetEngine.Instance.SerializeWorkbook(wb1),
                { originalXlsxBytes: bytes1 },
            ),
            sheetLib.InvokeTool(
                'write_cells',
                { sheet: 'BetaSheet', cells: [{ address: 'B1', value: 'Two' }] },
                SpreadsheetEngine.Instance.SerializeWorkbook(wb2),
                { originalXlsxBytes: bytes2 },
            ),
        ]);

        expect(res1.success).toBe(true);
        expect(res2.success).toBe(true);
        const b64_1 = (res1.data as { xlsxBase64?: string }).xlsxBase64;
        const b64_2 = (res2.data as { xlsxBase64?: string }).xlsxBase64;
        expect(b64_1).toBeTruthy();
        expect(b64_2).toBeTruthy();

        const round1 = SpreadsheetEngine.Instance.ImportFromXlsxBytes(Buffer.from(b64_1!, 'base64'));
        const round2 = SpreadsheetEngine.Instance.ImportFromXlsxBytes(Buffer.from(b64_2!, 'base64'));
        expect(round1.Worksheets.map((w) => w.Name)).toEqual(['AlphaSheet']);
        expect(round2.Worksheets.map((w) => w.Name)).toEqual(['BetaSheet']);
    });

    it('enforces ProtectedRanges on insert_rows, delete_rows, insert_columns, and delete_columns', async () => {
        const sheetLib = new SpreadsheetToolLibrary();
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('LockedOps', ['Plan']);
        const sheetId = wb.Worksheets[0].SheetID;
        SpreadsheetEngine.Instance.AddProtectedRange(
            wb,
            sheetId,
            {
                Range: 'B2:D5',
                Mode: 'OwnerOnly',
                LockedByUserID: ownerId,
                LockedByName: 'Owner',
                Reason: 'Board signoff',
            },
            ownerId,
            ownerId,
            false,
        );
        const raw = SpreadsheetEngine.Instance.SerializeWorkbook(wb);
        const nonOwnerCtx = { actorUserId: editorId, ownerUserId: ownerId, isEditor: true };

        const insRow = await sheetLib.InvokeTool('insert_rows', { sheet: 'Plan', atRowNumber: 3, count: 1 }, raw, nonOwnerCtx);
        expect(insRow.success).toBe(false);
        expect(insRow.errorMessage?.toLowerCase()).toContain('protected');

        const delRow = await sheetLib.InvokeTool('delete_rows', { sheet: 'Plan', atRowNumber: 3, count: 1 }, raw, nonOwnerCtx);
        expect(delRow.success).toBe(false);
        expect(delRow.errorMessage?.toLowerCase()).toContain('protected');

        const insCol = await sheetLib.InvokeTool('insert_columns', { sheet: 'Plan', atColumnNumber: 3, count: 1 }, raw, nonOwnerCtx);
        expect(insCol.success).toBe(false);
        expect(insCol.errorMessage?.toLowerCase()).toContain('protected');

        const delCol = await sheetLib.InvokeTool('delete_columns', { sheet: 'Plan', atColumnNumber: 3, count: 1 }, raw, nonOwnerCtx);
        expect(delCol.success).toBe(false);
        expect(delCol.errorMessage?.toLowerCase()).toContain('protected');
    });

    it('supports NW-4 merge_cells, unmerge_cells, upsert_conditional_format, upsert_validation_rule, and upsert_named_range', async () => {
        const sheetLib = new SpreadsheetToolLibrary();
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('NW4 Workbook', ['Model']);
        const sheetId = wb.Worksheets[0].SheetID;
        SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B2', { Value: 0.1 }, false);
        SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'C2', { Value: 100 }, false);
        let content = SpreadsheetEngine.Instance.SerializeWorkbook(wb);

        const mergeRes = await sheetLib.InvokeTool('merge_cells', { sheet: 'Model', range: 'A1:C1' }, content);
        expect(mergeRes.success).toBe(true);
        const mergeData = mergeRes.data as { updatedContent: string; mergeRanges?: string[] };
        expect(mergeData.mergeRanges).toEqual(['A1:C1']);
        content = mergeData.updatedContent;

        const unmergeRes = await sheetLib.InvokeTool('unmerge_cells', { sheet: 'Model', range: 'A1:C1' }, content);
        expect(unmergeRes.success).toBe(true);
        const unmergeData = unmergeRes.data as { updatedContent: string; mergeRanges?: string[] };
        expect(unmergeData.mergeRanges ?? []).toHaveLength(0);
        content = unmergeData.updatedContent;

        const cfRes = await sheetLib.InvokeTool(
            'upsert_conditional_format',
            {
                sheet: 'Model',
                range: 'C2:C10',
                operator: 'gt',
                value1: '50',
                highlightTone: 'success',
            },
            content,
        );
        expect(cfRes.success).toBe(true);
        content = (cfRes.data as { updatedContent: string }).updatedContent;
        expect(SpreadsheetEngine.Instance.ParseWorkbook(content).Worksheets[0].ConditionalFormats).toHaveLength(1);

        const valRes = await sheetLib.InvokeTool(
            'upsert_validation_rule',
            {
                sheet: 'Model',
                range: 'D2:D10',
                ruleType: 'list',
                allowedValues: ['Draft', 'Approved'],
            },
            content,
        );
        expect(valRes.success).toBe(true);
        content = (valRes.data as { updatedContent: string }).updatedContent;
        expect(SpreadsheetEngine.Instance.ParseWorkbook(content).Worksheets[0].ValidationRules).toHaveLength(1);

        const namedRes = await sheetLib.InvokeTool(
            'upsert_named_range',
            {
                name: 'TaxRate',
                sheet: 'Model',
                range: 'B2',
            },
            content,
        );
        expect(namedRes.success).toBe(true);
        content = (namedRes.data as { updatedContent: string }).updatedContent;
        const parsedFinal = SpreadsheetEngine.Instance.ParseWorkbook(content);
        expect(parsedFinal.NamedRanges?.some((n) => n.Name === 'TaxRate')).toBe(true);
    });

    it('supports NW-3 comments and suggestions in SpreadsheetToolLibrary and fails closed on self/unreadable embed', async () => {
        const sheetLib = new SpreadsheetToolLibrary();
        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet NW3', ['Sheet1']);
        const raw = SpreadsheetEngine.Instance.SerializeWorkbook(wb);
        const actor = makeUser(editorId, 'Analyst');
        const owner = makeUser(ownerId, 'Owner');
        const provider = {} as IMetadataProvider;

        const prop = await sheetLib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { sheet: 'Sheet1', range: 'B2' },
                originalSlice: '',
                proposedReplacement: '42',
                rationale: 'Update forecast',
            },
            raw,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(prop.success).toBe(true);
        const propData = prop.data as {
            suggestionId: string;
            configurationPatch: { suggestions: object[] };
        };

        const accept = await sheetLib.InvokeTool(
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
        expect(accept.success).toBe(true);
        const acceptedWb = SpreadsheetEngine.Instance.ParseWorkbook(
            (accept.data as { updatedContent: string }).updatedContent,
        );
        expect(acceptedWb.Worksheets[0].Cells['B2']?.RawValue).toBe(42);

        const selfEmbed = await sheetLib.InvokeTool(
            'embed_artifact',
            { sheet: 'Sheet1', targetArtifactId: sourceArtId, sourceType: 'sheet' },
            raw,
            { artifactId: sourceArtId, contextUser: actor, provider },
        );
        expect(selfEmbed.success).toBe(false);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: otherArtId,
            UserID: editorId,
            IsOwner: false,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: false,
            GrantedBy: 'none',
        });
        const deniedEmbed = await sheetLib.InvokeTool(
            'embed_artifact',
            { sheet: 'Sheet1', targetArtifactId: otherArtId, sourceType: 'sheet' },
            raw,
            { artifactId: sourceArtId, contextUser: actor, provider },
        );
        expect(deniedEmbed.success).toBe(false);
    });

    it('supports NW-3 comments/suggestions and fails closed on self/unreadable embed in DocumentToolLibrary', async () => {
        const docLib = new DocumentToolLibrary();
        const doc = '# Overview\n\nOriginal paragraph.\n';
        const owner = makeUser(ownerId, 'Owner');
        const actor = makeUser(editorId, 'Editor');
        const provider = {} as IMetadataProvider;

        const selfEmbed = await docLib.InvokeTool(
            'embed_artifact_block',
            { title: 'Self', targetArtifactId: sourceArtId, artifactKind: 'spreadsheet', mode: 'Live' },
            doc,
            { artifactId: sourceArtId, contextUser: actor, provider },
        );
        expect(selfEmbed.success).toBe(false);

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: otherArtId,
            UserID: editorId,
            IsOwner: false,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: false,
            GrantedBy: 'none',
        });
        const deniedEmbed = await docLib.InvokeTool(
            'embed_artifact_block',
            { title: 'Hidden', targetArtifactId: otherArtId, artifactKind: 'spreadsheet', mode: 'Live' },
            doc,
            { artifactId: sourceArtId, contextUser: actor, provider },
        );
        expect(deniedEmbed.success).toBe(false);

        const blocks = docLib.ParseLogicalBlocks(doc);
        const pBlock = blocks.find((b) => b.rawMarkdown.includes('Original paragraph.'))!;
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
        } as object as IMetadataProvider;
        vi.spyOn(ConversationEngine.Instance, 'CreateAnchoredConversation').mockResolvedValue({
            Conversation: { ID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', Name: 'Block Comment' } as MJConversationEntity,
            InitialDetail: { ID: 'detail-doc-1' } as never,
        });

        const cAdd = await docLib.InvokeTool(
            'add_comment',
            { anchor: { blockId: pBlock.blockId }, body: 'Clarify numbers' },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor, provider: mockProvider },
        );
        expect(cAdd.success).toBe(true);

        const sProp = await docLib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { blockId: pBlock.blockId },
                originalSlice: 'Original paragraph.',
                proposedReplacement: 'Verified paragraph.',
                rationale: 'Updated figures',
            },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(sProp.success).toBe(true);
        const sPropData = sProp.data as {
            suggestionId: string;
            configurationPatch: { suggestions: object[] };
        };
        const sReject = await docLib.InvokeTool(
            'review_suggestion',
            {
                suggestionId: sPropData.suggestionId,
                decision: 'reject',
                note: 'Not needed',
            },
            doc,
            {
                artifactId: sourceArtId,
                versionNumber: 1,
                contextUser: owner,
                configuration: JSON.stringify(sPropData.configurationPatch),
            },
        );
        expect(sReject.success).toBe(true);
        expect((sReject.data as { status: string }).status).toBe('Rejected');
    });

    it('DocumentToolLibrary enforces ValidateEmbeddedArtifactAccess on insert_block_after and replace_block for :::mj-block Artifact embeds (ACL denial & self-cycle)', async () => {
        const docLib = new DocumentToolLibrary();
        const doc = ['# Spec', '', 'Target paragraph.'].join('\n');
        const actor = makeUser(editorId, 'Editor User');
        const blocksRes = await docLib.InvokeTool('get_blocks', {}, doc);
        expect(blocksRes.success).toBe(true);
        const blocks = (blocksRes.data as { blocks: Array<{ blockId: string; rawMarkdown: string }> }).blocks;
        const pBlock = blocks.find((b) => b.rawMarkdown.includes('Target paragraph.'))!;

        const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: otherArtId,
            UserID: editorId,
            IsOwner: false,
            CanRead: false,
            CanEdit: false,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: false,
            GrantedBy: 'none',
        });

        const embedMarkdown = `:::mj-block\n${JSON.stringify({ BlockID: 'blk-other', Kind: 'Artifact', Title: 'Other', ArtifactID: otherArtId, ArtifactKind: 'spreadsheet', Mode: 'Live' })}\n:::`;

        // insert_block_after unauthorized embed rejected
        const insertDenied = await docLib.InvokeTool(
            'insert_block_after',
            { blockId: pBlock.blockId, markdown: embedMarkdown },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(insertDenied.success).toBe(false);
        expect(insertDenied.errorMessage).toMatch(/permission|denied|read access/i);
        expect(permSpy).toHaveBeenCalled();

        // replace_block unauthorized embed rejected
        const replaceDenied = await docLib.InvokeTool(
            'replace_block',
            { blockId: pBlock.blockId, markdown: embedMarkdown },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(replaceDenied.success).toBe(false);
        expect(replaceDenied.errorMessage).toMatch(/permission|denied|read access/i);

        // Self-cycle embed on both insert_block_after and replace_block rejected
        const selfEmbedMarkdown = `:::mj-block\n${JSON.stringify({ BlockID: 'blk-self', Kind: 'Artifact', Title: 'Self', ArtifactID: sourceArtId, ArtifactKind: 'document', Mode: 'Live' })}\n:::`;
        const selfInsert = await docLib.InvokeTool(
            'insert_block_after',
            { blockId: pBlock.blockId, markdown: selfEmbedMarkdown },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(selfInsert.success).toBe(false);
        expect(selfInsert.errorMessage).toMatch(/itself|self/i);

        const selfReplace = await docLib.InvokeTool(
            'replace_block',
            { blockId: pBlock.blockId, markdown: selfEmbedMarkdown },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
        );
        expect(selfReplace.success).toBe(false);
        expect(selfReplace.errorMessage).toMatch(/itself|self/i);
    });

    it('list_suggestions reads from live room Suggestions & DB Configuration, and SlideDeckToolLibrary uses : anchor delimiter', async () => {
        const docLib = new DocumentToolLibrary();
        const slideLib = new SlideDeckToolLibrary();
        const actor = makeUser(editorId, 'Editor User');

        try {
            // 1. Live room Suggestions snapshot takes precedence
            SetArtifactLiveContentReaderHook(async (artifactId) => {
                if (artifactId === sourceArtId) {
                    return {
                        Content: '# Doc',
                        ContentMode: 'Text',
                        Suggestions: [
                            {
                                SuggestionID: 'sug-live-1',
                                Domain: 'document',
                                Anchor: { domain: 'document', blockId: 'block-1' },
                                OriginalSlice: 'old',
                                ProposedReplacement: 'new',
                                Rationale: 'Live room edit',
                                Status: 'Pending',
                                AuthorUserID: editorId,
                                AuthorName: 'Editor User',
                                CreatedAt: '2026-01-01T00:00:00.000Z',
                            },
                        ],
                    };
                }
                return null;
            });

            const liveRes = await docLib.InvokeTool(
                'list_suggestions',
                { status: 'Pending' },
                '# Doc',
                { artifactId: sourceArtId, versionNumber: 1, contextUser: actor },
            );
            expect(liveRes.success).toBe(true);
            const liveData = liveRes.data as { count: number; totalCount: number; suggestions: Array<{ SuggestionID: string; Status: string }> };
            expect(liveData.count).toBe(1);
            expect(liveData.totalCount).toBe(1);
            expect(liveData.suggestions[0].SuggestionID).toBe('sug-live-1');

            // 2. Database Configuration JSON fallback when live room returns null
            SetArtifactLiveContentReaderHook(null);
            const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck', 'deck-sug');
            const slideRaw = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
            const configJson = JSON.stringify({
                suggestions: [
                    {
                        SuggestionID: 'sug-db-1',
                        Domain: 'slides',
                        Anchor: { domain: 'slides', slideId: 's1', regionId: 'r1' },
                        OriginalSlice: 'Draft',
                        ProposedReplacement: 'Final',
                        Rationale: 'Approved copy',
                        Status: 'Accepted',
                        AuthorUserID: ownerId,
                        AuthorName: 'Owner',
                        CreatedAt: '2026-01-02T00:00:00.000Z',
                    },
                ],
            });
            const mockDbProvider = {
                Entities: [{ Name: 'MJ: Artifacts', ID: 'ent-art-1' }],
                EntityByName: (n: string) => (n === 'MJ: Artifacts' ? { Name: 'MJ: Artifacts', ID: 'ent-art-1' } : null),
            } as object as IMetadataProvider;
            vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
                RunView: vi.fn(async (params: { EntityName?: string }) => {
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return { Success: true, Results: [{ Configuration: configJson }] };
                    }
                    return { Success: true, Results: [] };
                }),
            } as never);
            const slideListRes = await slideLib.InvokeTool(
                'list_suggestions',
                { status: 'Accepted' },
                slideRaw,
                { artifactId: sourceArtId, contextUser: actor, provider: mockDbProvider },
            );
            expect(slideListRes.success).toBe(true);
            const slideData = slideListRes.data as { count: number; totalCount: number; suggestions: Array<{ SuggestionID: string; Status: string }> };
            expect(slideData.count).toBe(1);
            expect(slideData.suggestions[0].SuggestionID).toBe('sug-db-1');

            // 3. SlideDeckToolLibrary add_comment uses ${slideRef}:${regionRef} colon delimiter
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
            const convSpy = vi.spyOn(ConversationEngine.Instance, 'CreateAnchoredConversation').mockResolvedValue({
                Conversation: { ID: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', Name: 'Slide Comment' } as MJConversationEntity,
                InitialDetail: { ID: 'detail-slide-1' } as never,
            });
            const mockProvider = {
                Entities: [{ Name: 'MJ: Artifacts', ID: 'ent-art-1' }],
                EntityByName: (n: string) => (n === 'MJ: Artifacts' ? { Name: 'MJ: Artifacts', ID: 'ent-art-1' } : null),
            } as object as IMetadataProvider;

            const addSlideComment = await slideLib.InvokeTool(
                'add_comment',
                { anchor: { slideId: 'slide-2', regionId: 'region-title' }, body: 'Tighten headline' },
                slideRaw,
                { artifactId: sourceArtId, versionNumber: 1, contextUser: actor, provider: mockProvider },
            );
            expect(addSlideComment.success).toBe(true);
            expect(convSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    anchorKey: 'slide-2:region-title',
                }),
                actor,
            );
        } finally {
            SetArtifactLiveContentReaderHook(null);
        }
    });

    it('rejects embedded Artifact smuggling via Document review_suggestion accept when caller lacks CanRead (P0-P3-5a)', async () => {
        const docLib = new DocumentToolLibrary();
        const actor = makeUser(editorId, 'Editor User');
        const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockImplementation(async (artifactId) => ({
            ArtifactID: artifactId,
            UserID: editorId,
            IsOwner: artifactId === sourceArtId,
            CanRead: artifactId === sourceArtId,
            CanEdit: artifactId === sourceArtId,
            CanDelete: false,
            CanShare: false,
            HasDirectPermissions: true,
            GrantedBy: artifactId === sourceArtId ? 'owner' : 'none',
        }));

        const doc = '# Overview\n\nInitial safe paragraph.';
        const blocks = docLib.ParseLogicalBlocks(doc);
        const pBlock = blocks.find((b) => b.kind === 'paragraph')!;
        const embedMarkdown = `:::mj-block\n${JSON.stringify({ BlockID: 'blk-smuggled', Kind: 'Artifact', Title: 'Private Sheet', ArtifactID: otherArtId, ArtifactKind: 'spreadsheet', Mode: 'Live' })}\n:::`;

        const propRes = await docLib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { domain: 'document', blockId: pBlock.blockId },
                originalSlice: 'Initial safe paragraph.',
                proposedReplacement: embedMarkdown,
                rationale: 'Embed private spreadsheet',
            },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, ownerUserId: editorId, actorUserId: editorId, contextUser: actor },
        );
        expect(propRes.success).toBe(true);
        const propData = propRes.data as {
            suggestionId: string;
            configurationPatch: { suggestions: Array<{ SuggestionID: string }> };
        };

        const acceptDenied = await docLib.InvokeTool(
            'review_suggestion',
            { suggestionId: propData.suggestionId, decision: 'accept' },
            doc,
            {
                artifactId: sourceArtId,
                versionNumber: 1,
                ownerUserId: editorId,
                actorUserId: editorId,
                contextUser: actor,
                configuration: JSON.stringify(propData.configurationPatch),
            },
        );
        expect(acceptDenied.success).toBe(false);
        expect(acceptDenied.errorMessage).toMatch(/permission|denied|read access/i);
        expect(permSpy).toHaveBeenCalled();

        // Self-cycle embed via review_suggestion accept must also be rejected
        const selfEmbed = `:::mj-block\n${JSON.stringify({ BlockID: 'blk-self', Kind: 'Artifact', Title: 'Self', ArtifactID: sourceArtId, ArtifactKind: 'document', Mode: 'Live' })}\n:::`;
        const propSelf = await docLib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { domain: 'document', blockId: pBlock.blockId },
                originalSlice: 'Initial safe paragraph.',
                proposedReplacement: selfEmbed,
                rationale: 'Self embed',
            },
            doc,
            { artifactId: sourceArtId, versionNumber: 1, ownerUserId: editorId, actorUserId: editorId, contextUser: actor },
        );
        expect(propSelf.success).toBe(true);
        const propSelfData = propSelf.data as {
            suggestionId: string;
            configurationPatch: { suggestions: Array<{ SuggestionID: string }> };
        };
        const acceptSelfDenied = await docLib.InvokeTool(
            'review_suggestion',
            { suggestionId: propSelfData.suggestionId, decision: 'accept' },
            doc,
            {
                artifactId: sourceArtId,
                versionNumber: 1,
                ownerUserId: editorId,
                actorUserId: editorId,
                contextUser: actor,
                configuration: JSON.stringify(propSelfData.configurationPatch),
            },
        );
        expect(acceptSelfDenied.success).toBe(false);
        expect(acceptSelfDenied.errorMessage).toMatch(/itself|self/i);
    });

    it('resolves canonical blockId on Document propose_suggestion from heading and originalSlice (P1-P3-1a)', async () => {
        const docLib = new DocumentToolLibrary();
        const actor = makeUser(editorId, 'Editor User');
        const isolatedDocArtId = '55555555-5555-4555-8555-555555555555';
        const doc = '# Intro\n\nGeneral context.\n\n## Risks\n\nPotential supply delay in Q4.';
        const blocks = docLib.ParseLogicalBlocks(doc);
        const risksPara = blocks.find((b) => b.kind === 'paragraph' && b.rawMarkdown.includes('Potential supply delay'))!;

        const propRes = await docLib.InvokeTool(
            'propose_suggestion',
            {
                anchor: { domain: 'document', heading: 'Risks', quote: 'supply delay' },
                originalSlice: 'Potential supply delay in Q4.',
                proposedReplacement: 'Mitigated supply timeline in Q4.',
                rationale: 'Updated risk assessment',
            },
            doc,
            { artifactId: isolatedDocArtId, versionNumber: 1, ownerUserId: editorId, actorUserId: editorId, contextUser: actor },
        );
        expect(propRes.success).toBe(true);
        const propData = propRes.data as {
            configurationPatch: { suggestions: Array<{ Anchor: { blockId?: string; heading?: string } }> };
        };
        expect(propData.configurationPatch.suggestions[0].Anchor.blockId).toBe(risksPara.blockId);
        expect(propData.configurationPatch.suggestions[0].Anchor.heading).toBe('Risks');
    });
});
