import { describe, it, expect } from 'vitest';
import { SlideDeckEngine, SpreadsheetEngine } from '@memberjunction/core-entities';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { SlideDeckToolLibrary } from '../artifact-tools/SlideDeckToolLibrary';
import { SpreadsheetToolLibrary } from '../artifact-tools/SpreadsheetToolLibrary';

describe('Artifact Tool Libraries — Protected Ranges & Locked Regions (§6.2)', () => {
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const editorId = '22222222-2222-2222-2222-222222222222';

    it('blocks SpreadsheetToolLibrary write_cells and clear_range on ProtectedRanges for non-owners', async () => {
        const engine = SpreadsheetEngine.Instance;
        const wb = engine.CreateEmptyWorkbook('Budget', ['Sheet 1']);
        engine.SetCell(wb, 'Sheet 1', 'B2', { Value: 500 }, false);
        engine.AddProtectedRange(wb, 'Sheet 1', {
            RangeID: 'lock-b2',
            Range: 'B2:C4',
            LockedByUserID: ownerId,
            AllowEditors: false,
        });
        const content = engine.SerializeWorkbook(wb);

        const lib = new SpreadsheetToolLibrary();
        const writeBlocked = await lib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet 1',
                cells: [{ address: 'B2', value: 999 }],
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
                _isEditor: true,
            },
            content,
            { actorUserId: editorId, ownerUserId: ownerId, isEditor: true }
        );
        expect(writeBlocked.success).toBe(false);
        expect(writeBlocked.errorMessage).toContain('protected range');

        const clearBlocked = await lib.InvokeTool(
            'clear_range',
            {
                sheet: 'Sheet 1',
                range: 'B2:C3',
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(clearBlocked.success).toBe(false);
        expect(clearBlocked.errorMessage).toContain('protected range');

        const clearValuesBlocked = await lib.InvokeTool(
            'clear_range',
            { sheet: 'Sheet 1', range: 'B2:C3', mode: 'values' },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(clearValuesBlocked.success).toBe(false);
        expect(clearValuesBlocked.errorMessage).toContain('protected range');

        const formatBlocked = await lib.InvokeTool(
            'format_range',
            { sheet: 'Sheet 1', range: 'B2:C3', bold: true },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(formatBlocked.success).toBe(false);
        expect(formatBlocked.errorMessage).toContain('protected range');

        const deleteRowBlocked = await lib.InvokeTool(
            'delete_rows',
            { sheet: 'Sheet 1', atRowNumber: 2, count: 1 },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(deleteRowBlocked.success).toBe(false);
        expect(deleteRowBlocked.errorMessage).toContain('protected range');

        const deleteColBlocked = await lib.InvokeTool(
            'delete_columns',
            { sheet: 'Sheet 1', atColumnNumber: 2, count: 1 },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(deleteColBlocked.success).toBe(false);
        expect(deleteColBlocked.errorMessage).toContain('protected range');

        const ownerAllowed = await lib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet 1',
                cells: [{ address: 'B2', value: 750 }],
            },
            content,
            { actorUserId: ownerId, ownerUserId: ownerId }
        );
        expect(ownerAllowed.success).toBe(true);
    });

    it('blocks SlideDeckToolLibrary updates, reorders, themes, regeneration, and deletions on locked slides or regions', async () => {
        const deckEngine = SlideDeckEngine.Instance;
        const deck = deckEngine.CreateDefaultDeck('Board Deck', 'deck-1');
        const withSecond = deckEngine.AddSlide(deck, { Title: 'Second Slide', Layout: 'TitleAndBody' }).Deck;
        const targetSlideId = withSecond.Slides[0].SlideID;
        const locked = deckEngine.SetSlideLock(withSecond, targetSlideId, true, ownerId, false, ownerId).Deck;
        const content = deckEngine.SerializeDeckSpec(locked);

        const lib = new SlideDeckToolLibrary();
        const blockedUpdate = await lib.InvokeTool(
            'update_slide',
            {
                slideId: targetSlideId,
                title: 'Tampered',
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedUpdate.success).toBe(false);
        expect(blockedUpdate.errorMessage).toContain('locked');

        const blockedDelete = await lib.InvokeTool(
            'delete_slide',
            {
                slideId: targetSlideId,
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedDelete.success).toBe(false);
        expect(blockedDelete.errorMessage).toContain('locked');

        const blockedReorder = await lib.InvokeTool(
            'reorder_slides',
            { slideIds: [withSecond.Slides[1].SlideID, targetSlideId] },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedReorder.success).toBe(false);
        expect(blockedReorder.errorMessage).toContain('locked');

        const blockedTheme = await lib.InvokeTool(
            'apply_theme',
            { themeId: 'executive-slate' },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedTheme.success).toBe(false);
        expect(blockedTheme.errorMessage).toContain('locked');

        const blockedRegen = await lib.InvokeTool(
            'generate_deck_from_markdown',
            { markdown: '# Overwritten\n\nBody' },
            content,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedRegen.success).toBe(false);
        expect(blockedRegen.errorMessage).toContain('locked');

        // 1-region slide lock fallback on delete_slide_element
        const regionLockedDeck = deckEngine.CreateDefaultDeck('Region Lock Deck', 'deck-2');
        const singleRegionSlide = regionLockedDeck.Slides.find((s) => s.Regions.length === 1) ?? regionLockedDeck.Slides[0];
        singleRegionSlide.Regions = [
            {
                ...singleRegionSlide.Regions[0],
                Locked: true,
                LockedByUserID: ownerId,
                AllowEditors: false,
            },
        ];
        const regionLockedContent = deckEngine.SerializeDeckSpec(regionLockedDeck);
        const blockedDeleteRegionFallback = await lib.InvokeTool(
            'delete_slide_element',
            { slideId: singleRegionSlide.SlideID, regionId: 'non-existent-id' },
            regionLockedContent,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedDeleteRegionFallback.success).toBe(false);
        expect(blockedDeleteRegionFallback.errorMessage).toContain('locked');

        const ownerUpdate = await lib.InvokeTool(
            'update_slide',
            {
                slideId: targetSlideId,
                title: 'Owner Approved',
            },
            content,
            { actorUserId: ownerId, ownerUserId: ownerId }
        );
        expect(ownerUpdate.success).toBe(true);
    });

    it('blocks DocumentToolLibrary edits inside <!-- mj-lock: owner-only --> sections for non-owners', async () => {
        const doc = [
            '# Intro',
            'Open notes.',
            '',
            `<!-- mj-lock: owner-only user=${ownerId} -->`,
            '## Compliance Signoff',
            'Approved language only.',
        ].join('\n');

        const lib = new DocumentToolLibrary();
        const blocksRes = await lib.InvokeTool('get_blocks', {}, doc);
        expect(blocksRes.success).toBe(true);
        const blocks = (blocksRes.data as { blocks: Array<{ blockId: string; rawMarkdown: string }> }).blocks;
        const lockedHeading = blocks.find((b) => b.rawMarkdown.includes('Compliance Signoff'));
        const lockedParagraph = blocks.find((b) => b.rawMarkdown.includes('Approved language only.'));
        expect(lockedHeading).toBeTruthy();
        expect(lockedParagraph).toBeTruthy();

        const blockedEdit = await lib.InvokeTool(
            'replace_block',
            {
                blockId: lockedParagraph!.blockId,
                markdown: 'Unauthorized rewrite.',
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
                _isEditor: true,
            },
            doc,
            { actorUserId: editorId, ownerUserId: ownerId, isEditor: true }
        );
        expect(blockedEdit.success).toBe(false);
        expect(blockedEdit.errorMessage).toContain('owner-only');

        const blockedLiveInsert = await lib.InvokeTool(
            'insert_live_block',
            {
                kind: 'EntityView',
                entityName: 'MJ: Users',
                afterBlockId: lockedHeading!.blockId,
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            doc,
            { actorUserId: editorId, ownerUserId: ownerId }
        );
        expect(blockedLiveInsert.success).toBe(false);
        expect(blockedLiveInsert.errorMessage).toContain('owner-only');

        const ownerEdit = await lib.InvokeTool(
            'replace_block',
            {
                blockId: lockedParagraph!.blockId,
                markdown: 'Owner approved update.',
            },
            doc,
            { actorUserId: ownerId, ownerUserId: ownerId }
        );
        expect(ownerEdit.success).toBe(true);
    });
});
