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
                _actorUserId: editorId,
                _ownerUserId: ownerId,
                _isEditor: true,
            },
            content
        );
        expect(writeBlocked.success).toBe(false);
        expect(writeBlocked.errorMessage).toContain('protected range');

        const clearBlocked = await lib.InvokeTool(
            'clear_range',
            {
                sheet: 'Sheet 1',
                range: 'B2:C3',
                _actorUserId: editorId,
                _ownerUserId: ownerId,
            },
            content
        );
        expect(clearBlocked.success).toBe(false);
        expect(clearBlocked.errorMessage).toContain('protected range');

        const ownerAllowed = await lib.InvokeTool(
            'write_cells',
            {
                sheet: 'Sheet 1',
                cells: [{ address: 'B2', value: 750 }],
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            content
        );
        expect(ownerAllowed.success).toBe(true);
    });

    it('blocks SlideDeckToolLibrary updates and deletions on locked slides or regions', async () => {
        const deckEngine = SlideDeckEngine.Instance;
        const deck = deckEngine.CreateDefaultDeck('Board Deck', 'deck-1');
        const targetSlideId = deck.Slides[0].SlideID;
        const locked = deckEngine.SetSlideLock(deck, targetSlideId, true, ownerId, false, ownerId).Deck;
        const content = deckEngine.SerializeDeckSpec(locked);

        const lib = new SlideDeckToolLibrary();
        const blockedUpdate = await lib.InvokeTool(
            'update_slide',
            {
                slideId: targetSlideId,
                title: 'Tampered',
                _actorUserId: editorId,
                _ownerUserId: ownerId,
            },
            content
        );
        expect(blockedUpdate.success).toBe(false);
        expect(blockedUpdate.errorMessage).toContain('locked');

        const blockedDelete = await lib.InvokeTool(
            'delete_slide',
            {
                slideId: targetSlideId,
                _actorUserId: editorId,
                _ownerUserId: ownerId,
            },
            content
        );
        expect(blockedDelete.success).toBe(false);
        expect(blockedDelete.errorMessage).toContain('locked');

        const ownerUpdate = await lib.InvokeTool(
            'update_slide',
            {
                slideId: targetSlideId,
                title: 'Owner Approved',
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            content
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
        const lockedParagraph = blocks.find((b) => b.rawMarkdown.includes('Approved language only.'));
        expect(lockedParagraph).toBeTruthy();

        const blockedEdit = await lib.InvokeTool(
            'replace_block',
            {
                blockId: lockedParagraph!.blockId,
                markdown: 'Unauthorized rewrite.',
                _actorUserId: editorId,
                _ownerUserId: ownerId,
                _isEditor: true,
            },
            doc
        );
        expect(blockedEdit.success).toBe(false);
        expect(blockedEdit.errorMessage).toContain('owner-only');

        const ownerEdit = await lib.InvokeTool(
            'replace_block',
            {
                blockId: lockedParagraph!.blockId,
                markdown: 'Owner approved update.',
                _actorUserId: ownerId,
                _ownerUserId: ownerId,
            },
            doc
        );
        expect(ownerEdit.success).toBe(true);
    });
});
