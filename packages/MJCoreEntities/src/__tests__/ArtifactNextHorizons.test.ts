import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { IMetadataProvider, IRunViewProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
    ArtifactPreviewSnapshot,
    GetConnectedDriveLinkFromConfig,
    GetGuestShareLinksFromConfig,
    MarkGuestShareLinkRevokedInConfig,
    MergeConnectedDriveLinkIntoConfig,
    ParseArtifactVersionConfiguration,
    UpsertGuestShareLinkInConfig,
} from '../custom/ArtifactPreviewSnapshot';
import { ArtifactPermissionEngine } from '../custom/ArtifactPermissionDelegate';
import { DocumentLiveBlockEngine } from '../custom/DocumentLiveBlockEngine';
import { SlideDeckEngine } from '../custom/SlideDeckEngine';
import { SpreadsheetEngine } from '../custom/SpreadsheetEngine';

function makeUser(id: string, name = 'Test User'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@example.com`;
    return u;
}

describe('Next Horizons Core Engines (H2 §4.2, H3 §5.2b, H4 §6.1–6.3)', () => {
    const sheetEngine = SpreadsheetEngine.Instance;
    const slideEngine = SlideDeckEngine.Instance;
    const docEngine = DocumentLiveBlockEngine.Instance;
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const editorId = '22222222-2222-2222-2222-222222222222';
    const ownerUser = makeUser(ownerId, 'Owner');
    const otherUser = makeUser(editorId, 'Editor');

    beforeEach(() => {
        sheetEngine.ClearViewerFunctionCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('ArtifactVersionConfiguration helpers (§6.1 & §6.3)', () => {
        it('merges connectedDriveLink and guestShareLinks non-destructively without clobbering previewSnapshot', () => {
            const snap: ArtifactPreviewSnapshot = {
                Kind: 'doc',
                Heading: 'Board Summary',
                Excerpt: 'Q4 Growth Summary',
            };
            const initialConfig = JSON.stringify({
                previewSnapshot: snap,
                thumbnailDataUrl: 'data:image/png;base64,AAAA',
            });

            const withDrive = MergeConnectedDriveLinkIntoConfig(initialConfig, {
                ExternalFileID: 'drive-file-99',
                ProviderType: 'GoogleDrive',
                FileName: 'Board-Summary.docx',
                ETag: 'etag-v1',
                SyncedVersionNumber: 3,
                LastSyncedAt: '2026-11-14T10:00:00.000Z',
                LastSyncDirection: 'push',
                LastSyncedByUserID: ownerId,
            });

            const parsedDrive = GetConnectedDriveLinkFromConfig(withDrive);
            expect(parsedDrive?.ExternalFileID).toBe('drive-file-99');
            expect(parsedDrive?.ETag).toBe('etag-v1');
            const parsedSnap = ParseArtifactVersionConfiguration(withDrive)?.previewSnapshot;
            expect(parsedSnap?.Kind).toBe('doc');
            expect(parsedSnap?.Kind === 'doc' ? parsedSnap.Heading : '').toBe('Board Summary');
            expect(ParseArtifactVersionConfiguration(withDrive)?.thumbnailDataUrl).toBe('data:image/png;base64,AAAA');

            const withGuest = UpsertGuestShareLinkInConfig(withDrive, {
                LinkID: 'link-abc',
                ArtifactID: 'art-1',
                VersionID: 'ver-3',
                VersionNumber: 3,
                ShareMode: 'Frozen',
                CreatedAt: '2026-11-14T10:05:00.000Z',
                CreatedByUserID: ownerId,
                Label: 'External Auditor',
                ExpiresAt: '2026-11-21T10:05:00.000Z',
            });
            expect(GetGuestShareLinksFromConfig(withGuest)).toHaveLength(1);

            const revoked = MarkGuestShareLinkRevokedInConfig(withGuest, 'link-abc', ownerId, '2026-11-14T10:10:00.000Z');
            expect(revoked.Found).toBe(true);
            const links = GetGuestShareLinksFromConfig(revoked.UpdatedConfigJson);
            expect(links[0]?.Revoked).toBe(true);
            expect(links[0]?.RevokedByUserID).toBe(ownerId);
        });
    });

    describe('SpreadsheetEngine =MJ.IMPORTRANGE (§4.2)', () => {
        it('parses IMPORTRANGE formulas and sheet-qualified A1 specifiers', () => {
            const parsed = sheetEngine.ParseMjCustomFunctionFormula('=MJ.IMPORTRANGE("art-123", "Revenue Q1!B2:D5", 2)');
            expect(parsed).toEqual({
                Kind: 'IMPORTRANGE',
                PrimaryTarget: 'art-123',
                SecondaryTarget: 'Revenue Q1!B2:D5',
                Arguments: [2],
                NamedParameters: {},
            });
            expect(sheetEngine.ParseSheetAndRangeSpecifier("'Q1 Sheet'!A1:C10")).toEqual({
                SheetName: 'Q1 Sheet',
                RangeA1: 'A1:C10',
            });
        });

        it('evaluates IMPORTRANGE with CanRead enforcement, 2D slice spill without synthetic headers, and strips on serialize', async () => {
            const sourceWb = sheetEngine.CreateEmptyWorkbook('Source Financials', ['Revenue']);
            sheetEngine.SetCell(sourceWb, 'Revenue', 'A1', { Value: 'Region' }, false);
            sheetEngine.SetCell(sourceWb, 'Revenue', 'B1', { Value: 'Amount' }, false);
            sheetEngine.SetCell(sourceWb, 'Revenue', 'A2', { Value: 'North' }, false);
            sheetEngine.SetCell(sourceWb, 'Revenue', 'B2', { Value: 420 }, false);
            const sourceJson = sheetEngine.SerializeWorkbook(sourceWb);

            const sourceArtId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
            const targetWb = sheetEngine.CreateEmptyWorkbook('Board Rollup', ['Summary']);
            sheetEngine.SetCell(
                targetWb,
                'Summary',
                'C3',
                { Formula: `=MJ.IMPORTRANGE("${sourceArtId}", "Revenue!A1:B2")` },
                false
            );
            sheetEngine.SetCell(targetWb, 'Summary', 'E3', { Formula: '=D4*2' }, false);

            const fakeProvider: IMetadataProvider & IRunViewProvider = {
                RunView: async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
                    if (params.EntityName === 'MJ: Artifacts') {
                        return {
                            Success: true,
                            Results: [{ ID: sourceArtId, Name: 'Source Financials' } as unknown as T],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ErrorMessage: '',
                            ExecutionTime: 1,
                        };
                    }
                    if (params.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [{ ID: 'ver-src-1', VersionNumber: 1, Content: sourceJson, Configuration: null } as unknown as T],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ErrorMessage: '',
                            ExecutionTime: 1,
                        };
                    }
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '', ExecutionTime: 1 };
                },
                RunViews: async () => [],
            } as unknown as IMetadataProvider & IRunViewProvider;

            const permSpy = vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions');
            permSpy.mockResolvedValueOnce({
                ArtifactID: sourceArtId,
                CanRead: false,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: 'Denied',
                Reason: 'No access',
            });

            const deniedRes = await sheetEngine.EvaluateMjCustomFunctions(targetWb, ownerUser, fakeProvider, {
                BypassCache: true,
            });
            expect(deniedRes.AccessDeniedCount).toBe(1);
            expect(targetWb.Worksheets[0].Cells['C3']?.ComputedValue).toBe('#MJ_ACCESS_DENIED!');

            permSpy.mockResolvedValueOnce({
                ArtifactID: sourceArtId,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                Source: 'Owner',
                Reason: 'Artifact owner',
            });

            const allowedRes = await sheetEngine.EvaluateMjCustomFunctions(targetWb, ownerUser, fakeProvider, {
                BypassCache: true,
            });
            expect(allowedRes.AccessDeniedCount).toBe(0);
            expect(targetWb.Worksheets[0].Cells['C3']?.ComputedValue).toBe('Region');
            expect(targetWb.Worksheets[0].Cells['D3']?.ComputedValue).toBe('Amount');
            expect(targetWb.Worksheets[0].Cells['C4']?.ComputedValue).toBe('North');
            expect(targetWb.Worksheets[0].Cells['D4']?.ComputedValue).toBe(420);
            expect(targetWb.Worksheets[0].Cells['E3']?.ComputedValue).toBe(840);

            const serialized = sheetEngine.SerializeWorkbook(targetWb);
            const reparsed = sheetEngine.ParseWorkbook(serialized);
            expect(reparsed.Worksheets[0].Cells['D4']).toBeUndefined();
            expect(reparsed.Worksheets[0].Cells['C3']?.ComputedValue).toBe('#MJ_PENDING!');
        });

        it('detects circular IMPORTRANGE chains and caps recursion depth at 3', async () => {
            const wb = sheetEngine.CreateEmptyWorkbook('Cycle Check', ['Sheet 1']);
            sheetEngine.SetCell(wb, 'Sheet 1', 'A1', { Formula: '=MJ.IMPORTRANGE("self-id", "Sheet 1!A1:B2")' }, false);

            await sheetEngine.EvaluateMjCustomFunctions(wb, ownerUser, undefined, {
                BypassCache: true,
                ImportRangeVisitedKeys: ['self-id'],
            });
            expect(wb.Worksheets[0].Cells['A1']?.ComputedValue).toBe('#VALUE!');
            expect(wb.Worksheets[0].Cells['A1']?.ErrorMessage).toContain('Circular');

            sheetEngine.SetCell(wb, 'Sheet 1', 'A2', { Formula: '=MJ.IMPORTRANGE("deep-id", "Sheet 1!A1:A2")' }, false);
            await sheetEngine.EvaluateMjCustomFunctions(wb, ownerUser, undefined, {
                BypassCache: true,
                ImportRangeDepth: 3,
            });
            expect(wb.Worksheets[0].Cells['A2']?.ComputedValue).toBe('#VALUE!');
            expect(wb.Worksheets[0].Cells['A2']?.ErrorMessage).toContain('depth (3)');
        });
    });

    describe('SpreadsheetEngine opt-in =MJ.AI (§5.2b)', () => {
        it('never evaluates LLM on open/recalc, caches by input hash, and caps batches at 50', async () => {
            const wb = sheetEngine.CreateEmptyWorkbook('AI Sheet', ['Sheet 1']);
            sheetEngine.SetCell(wb, 'Sheet 1', 'A1', { Value: 'Quarterly revenue rose 22%' }, false);
            sheetEngine.SetCell(
                wb,
                'Sheet 1',
                'B1',
                { Formula: '=MJ.AI("Summarize in 3 words", A1)' },
                true
            );

            // Sync recalc produces #AI_PENDING and invokes zero AI calls
            expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe('#AI_PENDING');
            expect(sheetEngine.CountPendingAiFormulaCells(wb).PendingOrStaleCount).toBe(1);

            const evaluatorCalls: number[] = [];
            const mockEval = async (cells: Array<{ SheetID: string; Address: string; InputHash: string; Prompt: string }>) => {
                evaluatorCalls.push(cells.length);
                return cells.map((c) => ({
                    SheetID: c.SheetID,
                    Address: c.Address,
                    InputHash: c.InputHash,
                    Value: `Summary(${c.Address})`,
                }));
            };

            const firstRun = await sheetEngine.EvaluateAiFormulas(wb, ownerUser, undefined, {
                AiEvaluator: mockEval,
            });
            expect(firstRun.EvaluatedCount).toBe(1);
            expect(wb.Worksheets[0].Cells['B1']?.ComputedValue).toBe('Summary(B1)');

            // Re-running without input changes hits input-hash cache cleanly
            const secondRun = await sheetEngine.EvaluateAiFormulas(wb, ownerUser, undefined, {
                AiEvaluator: mockEval,
            });
            expect(secondRun.EvaluatedCount).toBe(0);
            expect(secondRun.CacheHitCount).toBe(1);
            expect(evaluatorCalls).toHaveLength(1);

            // Changing upstream cell marks AI cell stale again
            sheetEngine.SetCell(wb, 'Sheet 1', 'A1', { Value: 'Quarterly revenue rose 30%' }, true);
            expect(sheetEngine.CountPendingAiFormulaCells(wb).PendingOrStaleCount).toBe(1);

            // Batch cap test: 55 cells -> evaluates 50, skips 5
            const bigWb = sheetEngine.CreateEmptyWorkbook('Cap Test', ['Sheet 1'], 60, 4);
            for (let r = 1; r <= 55; r++) {
                sheetEngine.SetCell(bigWb, 'Sheet 1', `A${r}`, { Formula: `=MJ.AI("Tag ${r}")` }, false);
            }
            const capRun = await sheetEngine.EvaluateAiFormulas(bigWb, ownerUser, undefined, {
                AiEvaluator: mockEval,
                MaxCells: 100, // clamped to 50
            });
            expect(capRun.EvaluatedCount).toBe(50);
            expect(capRun.SkippedOverCapCount).toBe(5);
        });
    });

    describe('Protected Ranges, Locked Slides, and Locked Doc Regions (§6.2)', () => {
        it('enforces Spreadsheet ProtectedRanges in SetCell and ClearRange', () => {
            const wb = sheetEngine.CreateEmptyWorkbook('Protected', ['Budget']);
            sheetEngine.SetCell(wb, 'Budget', 'B2', { Value: 100 }, false);
            const rule = sheetEngine.AddProtectedRange(wb, 'Budget', {
                RangeID: 'prot-1',
                Range: 'B2:C4',
                LockedByUserID: ownerId,
                AllowEditors: false,
            });
            expect(rule.Range).toBe('B2:C4');

            // Other user cannot overwrite or clear
            expect(() =>
                sheetEngine.SetCell(wb, 'Budget', 'B2', { Value: 999 }, true, {
                    UserID: editorId,
                    OwnerUserID: ownerId,
                    IsEditor: true,
                })
            ).toThrow(/protected range/i);
            expect(() =>
                sheetEngine.ClearRange(wb, 'Budget', 'B2:B3', true, {
                    UserID: editorId,
                    OwnerUserID: ownerId,
                    IsEditor: true,
                })
            ).toThrow(/protected range/i);

            // Owner CAN edit
            const updated = sheetEngine.SetCell(wb, 'Budget', 'B2', { Value: 250 }, true, {
                UserID: ownerId,
                OwnerUserID: ownerId,
            });
            expect(updated.RawValue).toBe(250);

            // Unauthorized user cannot remove protection, owner can
            expect(() =>
                sheetEngine.RemoveProtectedRange(wb, 'Budget', 'prot-1', { UserID: editorId, OwnerUserID: ownerId })
            ).toThrow(/Cannot unlock/i);
            expect(
                sheetEngine.RemoveProtectedRange(wb, 'Budget', 'prot-1', { UserID: ownerId, OwnerUserID: ownerId })
            ).toBe(true);
        });

        it('enforces SlideDeckEngine Slide and Region locks', () => {
            const deck = slideEngine.CreateDefaultDeck('Locked Deck', 'deck-lock');
            const slideId = deck.Slides[0].SlideID;
            const regionId = deck.Slides[0].Regions[0].RegionID;

            const lockedRes = slideEngine.SetSlideLock(deck, slideId, true, ownerId, false, ownerId);
            expect(lockedRes.UpdatedSlide?.Locked).toBe(true);

            expect(() =>
                slideEngine.UpdateSlideMetadata(lockedRes.Deck, slideId, { Title: 'Hacked' }, {
                    ActorUserID: editorId,
                    OwnerUserID: ownerId,
                    IsEditor: true,
                })
            ).toThrow(/locked/i);

            expect(() =>
                slideEngine.UpsertSlideRegion(
                    lockedRes.Deck,
                    slideId,
                    { RegionID: regionId, MarkdownContent: 'Hacked' },
                    { ActorUserID: editorId, OwnerUserID: ownerId }
                )
            ).toThrow(/locked/i);

            const unlockedRes = slideEngine.SetSlideLock(lockedRes.Deck, slideId, false, ownerId, false, ownerId);
            const updated = slideEngine.UpdateSlideMetadata(
                unlockedRes.Deck,
                slideId,
                { Title: 'Approved Title' },
                { ActorUserID: editorId, OwnerUserID: ownerId }
            );
            expect(updated.UpdatedSlide?.Title).toBe('Approved Title');
        });

        it('parses and enforces <!-- mj-lock: owner-only --> directives in DocumentLiveBlockEngine', () => {
            const original = [
                '# Public Intro',
                'Editable notes.',
                '',
                `<!-- mj-lock: owner-only user=${ownerId} -->`,
                '## Legal Signoff',
                'Final legal terms signed by counsel.',
                '',
                '# Next Section',
                'Open discussion.',
            ].join('\n');

            const locks = docEngine.ParseDocumentLocks(original);
            expect(locks).toHaveLength(1);
            expect(locks[0].Kind).toBe('heading');
            expect(locks[0].Label).toBe('Legal Signoff');
            expect(locks[0].StartLine).toBe(4);
            expect(locks[0].EndLine).toBe(7);

            const tampered = original.replace('Final legal terms signed by counsel.', 'Tampered legal terms.');
            const blocked = docEngine.ValidateDocumentEditAgainstLocks(original, tampered, editorId, ownerId, true);
            expect(blocked.Allowed).toBe(false);
            expect(blocked.ViolationReason).toContain('Legal Signoff');

            const allowedOwner = docEngine.ValidateDocumentEditAgainstLocks(original, tampered, ownerId, ownerId, true);
            expect(allowedOwner.Allowed).toBe(true);

            const toggled = docEngine.ToggleHeadingLockInMarkdown('# Heading\nBody', 1, true, ownerId);
            expect(toggled).toContain(`<!-- mj-lock: owner-only user=${ownerId} -->`);
        });
    });
});
