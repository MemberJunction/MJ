import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { DocumentLiveBlockEngine } from './DocumentLiveBlockEngine';
import { SlideDeckEngine, SlideDeckSpec } from './SlideDeckEngine';
import {
    EXCEL_MAX_COLS,
    EXCEL_MAX_ROWS,
    FormatCellAddress,
    ParseCellAddress,
    ParseRangeAddress,
    SpreadsheetEngine,
    SpreadsheetProtectedRangeSpec,
    WorkbookSpec,
    WorksheetSpec
} from './SpreadsheetEngine';

/**
 * Outcome of validating an artifact content mutation against document locks, slide locks,
 * and spreadsheet protected ranges.
 */
export interface ArtifactLockValidationResult {
    Allowed: boolean;
    Reason?: string;
}

/**
 * Optional configuration / context payloads evaluated alongside primary `Content` during lock validation (`B3`).
 */
export interface ArtifactLockValidationOptions {
    currentConfiguration?: string | null;
    nextConfiguration?: string | null;
}

function isSlideLockConfigEqual(
    a: { Locked?: boolean; LockedByUserID?: string; AllowEditors?: boolean } | undefined,
    b: { Locked?: boolean; LockedByUserID?: string; AllowEditors?: boolean } | undefined
): boolean {
    return (
        Boolean(a?.Locked) === Boolean(b?.Locked) &&
        (a?.LockedByUserID ?? '').trim().toLowerCase() === (b?.LockedByUserID ?? '').trim().toLowerCase() &&
        Boolean(a?.AllowEditors) === Boolean(b?.AllowEditors)
    );
}

function findDuplicateNonEmptyId(ids: Array<string | undefined | null>): string | null {
    const seen = new Set<string>();
    for (const raw of ids) {
        const trimmed = (raw ?? '').trim();
        if (!trimmed) {
            continue;
        }
        if (seen.has(trimmed)) {
            return trimmed;
        }
        seen.add(trimmed);
    }
    return null;
}

function doParsedRangesOverlap(
    a: { startRow: number; endRow: number; startCol: number; endCol: number },
    b: { startRow: number; endRow: number; startCol: number; endCol: number }
): boolean {
    return a.startRow <= b.endRow && b.startRow <= a.endRow && a.startCol <= b.endCol && b.startCol <= a.endCol;
}

interface CompiledProtectedRangeEntry {
    rule: SpreadsheetProtectedRangeSpec;
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

interface CompiledProtectedRangeIndex {
    byRow: Map<number, CompiledProtectedRangeEntry[]>;
    byCol: Map<number, CompiledProtectedRangeEntry[]>;
    wideRules: CompiledProtectedRangeEntry[];
}

const INDEXED_BUCKET_SPAN = 64;

function buildCompiledProtectedRangeIndex(
    rules: readonly SpreadsheetProtectedRangeSpec[],
    maxRows: number,
    maxCols: number,
    predicate?: (rule: SpreadsheetProtectedRangeSpec) => boolean
): {
    index: CompiledProtectedRangeIndex;
    allEntries: CompiledProtectedRangeEntry[];
    unparsedRules: SpreadsheetProtectedRangeSpec[];
} {
    const byRow = new Map<number, CompiledProtectedRangeEntry[]>();
    const byCol = new Map<number, CompiledProtectedRangeEntry[]>();
    const wideRules: CompiledProtectedRangeEntry[] = [];
    const allEntries: CompiledProtectedRangeEntry[] = [];
    const unparsedRules: SpreadsheetProtectedRangeSpec[] = [];

    for (const rule of rules) {
        if (predicate && !predicate(rule)) {
            continue;
        }
        const bounds = ParseRangeAddress(rule.Range, maxRows, maxCols);
        if (!bounds) {
            unparsedRules.push(rule);
            continue;
        }
        const entry: CompiledProtectedRangeEntry = {
            rule,
            startRow: bounds.startRow,
            endRow: bounds.endRow,
            startCol: bounds.startCol,
            endCol: bounds.endCol
        };
        allEntries.push(entry);
        if (bounds.endRow - bounds.startRow <= INDEXED_BUCKET_SPAN) {
            for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                let list = byRow.get(r);
                if (!list) {
                    list = [];
                    byRow.set(r, list);
                }
                list.push(entry);
            }
        } else if (bounds.endCol - bounds.startCol <= INDEXED_BUCKET_SPAN) {
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                let list = byCol.get(c);
                if (!list) {
                    list = [];
                    byCol.set(c, list);
                }
                list.push(entry);
            }
        } else {
            wideRules.push(entry);
        }
    }

    return { index: { byRow, byCol, wideRules }, allEntries, unparsedRules };
}

function isActorAllowedForLockRule(
    rule: SpreadsheetProtectedRangeSpec,
    editCtx: { UserID?: string; OwnerUserID: string; IsEditor: boolean }
): boolean {
    const actor = (editCtx.UserID ?? '').trim();
    if (actor && editCtx.OwnerUserID && UUIDsEqual(actor, editCtx.OwnerUserID)) {
        return true;
    }
    if (actor && rule.LockedByUserID && UUIDsEqual(actor, rule.LockedByUserID)) {
        return true;
    }
    if (rule.AllowEditors && editCtx.IsEditor) {
        return true;
    }
    return false;
}

function checkSheetCellWithIndex(
    index: CompiledProtectedRangeIndex,
    cellAddress: string,
    editCtx: { UserID?: string; OwnerUserID: string; IsEditor: boolean }
): ArtifactLockValidationResult {
    const pos = ParseCellAddress(cellAddress);
    if (!pos) {
        return { Allowed: true };
    }
    const candidates: Array<readonly CompiledProtectedRangeEntry[] | undefined> = [
        index.byRow.get(pos.row),
        index.byCol.get(pos.col),
        index.wideRules
    ];
    for (const bucket of candidates) {
        if (!bucket) {
            continue;
        }
        for (const entry of bucket) {
            if (
                pos.row >= entry.startRow &&
                pos.row <= entry.endRow &&
                pos.col >= entry.startCol &&
                pos.col <= entry.endCol &&
                !isActorAllowedForLockRule(entry.rule, editCtx)
            ) {
                return {
                    Allowed: false,
                    Reason: `Cell '${cellAddress}' falls inside protected range '${entry.rule.Range}' (locked by ${entry.rule.LockedByUserID}).`
                };
            }
        }
    }
    return { Allowed: true };
}

function findOverlappingIndexedProtectedRule(
    nextBounds: { startRow: number; endRow: number; startCol: number; endCol: number },
    compiled: {
        index: CompiledProtectedRangeIndex;
        allEntries: CompiledProtectedRangeEntry[];
    }
): SpreadsheetProtectedRangeSpec | null {
    const seen = new Set<CompiledProtectedRangeEntry>();
    if (nextBounds.endRow - nextBounds.startRow <= INDEXED_BUCKET_SPAN) {
        for (let r = nextBounds.startRow; r <= nextBounds.endRow; r++) {
            const list = compiled.index.byRow.get(r);
            if (!list) continue;
            for (const entry of list) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                if (doParsedRangesOverlap(nextBounds, entry)) {
                    return entry.rule;
                }
            }
        }
        for (const entry of compiled.index.wideRules) {
            if (doParsedRangesOverlap(nextBounds, entry)) {
                return entry.rule;
            }
        }
        // Row-narrow incoming range could also intersect col-bucketed rules covering that column
        for (let c = nextBounds.startCol; c <= nextBounds.endCol && c - nextBounds.startCol <= INDEXED_BUCKET_SPAN; c++) {
            const list = compiled.index.byCol.get(c);
            if (!list) continue;
            for (const entry of list) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                if (doParsedRangesOverlap(nextBounds, entry)) {
                    return entry.rule;
                }
            }
        }
        if (nextBounds.endCol - nextBounds.startCol > INDEXED_BUCKET_SPAN) {
            for (const colEntries of compiled.index.byCol.values()) {
                for (const entry of colEntries) {
                    if (seen.has(entry)) continue;
                    seen.add(entry);
                    if (doParsedRangesOverlap(nextBounds, entry)) {
                        return entry.rule;
                    }
                }
            }
        }
        return null;
    }
    if (nextBounds.endCol - nextBounds.startCol <= INDEXED_BUCKET_SPAN) {
        for (let c = nextBounds.startCol; c <= nextBounds.endCol; c++) {
            const list = compiled.index.byCol.get(c);
            if (!list) continue;
            for (const entry of list) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                if (doParsedRangesOverlap(nextBounds, entry)) {
                    return entry.rule;
                }
            }
        }
        for (const entry of compiled.index.wideRules) {
            if (doParsedRangesOverlap(nextBounds, entry)) {
                return entry.rule;
            }
        }
        for (const rowEntries of compiled.index.byRow.values()) {
            for (const entry of rowEntries) {
                if (seen.has(entry)) continue;
                seen.add(entry);
                if (doParsedRangesOverlap(nextBounds, entry)) {
                    return entry.rule;
                }
            }
        }
        return null;
    }
    for (const entry of compiled.allEntries) {
        if (doParsedRangesOverlap(nextBounds, entry)) {
            return entry.rule;
        }
    }
    return null;
}

function findFirstRowIdMismatchIndex(
    prevRows: ReadonlyArray<{ RowID: string }> | undefined,
    nextRows: ReadonlyArray<{ RowID: string }> | undefined
): number {
    const prev = prevRows ?? [];
    const next = nextRows ?? [];
    const shared = Math.min(prev.length, next.length);
    for (let i = 0; i < shared; i++) {
        if (prev[i].RowID !== next[i].RowID) {
            return i;
        }
    }
    return shared;
}

function findFirstColIdMismatchIndex(
    prevCols: ReadonlyArray<{ ColumnID: string }> | undefined,
    nextCols: ReadonlyArray<{ ColumnID: string }> | undefined
): number {
    const prev = prevCols ?? [];
    const next = nextCols ?? [];
    const shared = Math.min(prev.length, next.length);
    for (let i = 0; i < shared; i++) {
        if (prev[i].ColumnID !== next[i].ColumnID) {
            return i;
        }
    }
    return shared;
}

function inspectStructuredJsonKind(raw: string | null | undefined): 'slides' | 'workbook' | null {
    if (!raw || typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) {
        return null;
    }
    try {
        const parsed = JSON.parse(trimmed) as { Slides?: Array<object>; Worksheets?: Array<object> };
        if (Array.isArray(parsed.Slides)) {
            return 'slides';
        }
        if (Array.isArray(parsed.Worksheets)) {
            return 'workbook';
        }
    } catch {
        return null;
    }
    return null;
}

function isXlsxBinaryTextPayload(raw: string | null | undefined): boolean {
    if (!raw || typeof raw !== 'string') {
        return false;
    }
    const trimmed = raw.trim();
    return trimmed.startsWith('data:') || trimmed.startsWith('UEsDB');
}

function validateNewLocksOnEmptyContent(
    nextContent: string,
    actorUserId: string | null | undefined,
    isOwner: boolean
): ArtifactLockValidationResult | null {
    const trimmedNext = nextContent.trim();
    const isWorkbookPayload = inspectStructuredJsonKind(trimmedNext) === 'workbook' || isXlsxBinaryTextPayload(trimmedNext);
    const isSlidePayload = inspectStructuredJsonKind(trimmedNext) === 'slides';
    if (!isWorkbookPayload && !isSlidePayload) {
        return null;
    }
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    try {
        if (isSlidePayload) {
            const nextDeck = SlideDeckEngine.Instance.ParseDeckSpec(nextContent);
            const dupSlideId = findDuplicateNonEmptyId(nextDeck.Slides.map((s) => s.SlideID));
            if (dupSlideId) {
                return { Allowed: false, Reason: `Duplicate SlideID '${dupSlideId}' is not allowed.` };
            }
            for (const nextSlide of nextDeck.Slides) {
                const dupRegionId = findDuplicateNonEmptyId(nextSlide.Regions.map((r) => r.RegionID));
                if (dupRegionId) {
                    return { Allowed: false, Reason: `Duplicate RegionID '${dupRegionId}' is not allowed.` };
                }
                if (!isOwner) {
                    if (nextSlide.Locked && (!normActor || NormalizeUUID(nextSlide.LockedByUserID ?? '') !== normActor)) {
                        return {
                            Allowed: false,
                            Reason: 'Cannot create locked slide with another user as LockedByUserID.'
                        };
                    }
                    for (const reg of nextSlide.Regions) {
                        if (reg.Locked && (!normActor || NormalizeUUID(reg.LockedByUserID ?? '') !== normActor)) {
                            return {
                                Allowed: false,
                                Reason: 'Cannot create locked region with another user as LockedByUserID.'
                            };
                        }
                    }
                }
            }
            return { Allowed: true };
        }
        if (isWorkbookPayload) {
            const nextWb = SpreadsheetEngine.Instance.ParseWorkbook(nextContent, undefined, { SkipEvaluate: true });
            const dupSheetId = findDuplicateNonEmptyId(nextWb.Worksheets.map((w) => w.SheetID));
            if (dupSheetId) {
                return { Allowed: false, Reason: `Duplicate SheetID '${dupSheetId}' is not allowed.` };
            }
            for (const nextSheet of nextWb.Worksheets) {
                const dupRangeId = findDuplicateNonEmptyId(
                    (nextSheet.ProtectedRanges ?? []).map((r) => r.RangeID)
                );
                if (dupRangeId) {
                    return { Allowed: false, Reason: `Duplicate RangeID '${dupRangeId}' is not allowed.` };
                }
                if (!isOwner) {
                    for (const rule of nextSheet.ProtectedRanges ?? []) {
                        if (!normActor || NormalizeUUID(rule.LockedByUserID) !== normActor) {
                            return {
                                Allowed: false,
                                Reason: `Cannot create protected range '${rule.Range}' with spoofed LockedByUserID.`
                            };
                        }
                    }
                }
            }
            return { Allowed: true };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('Spreadsheet ')) {
            return { Allowed: false, Reason: msg };
        }
        return {
            Allowed: false,
            Reason: 'Write rejected: malformed update to structured document.'
        };
    }
    return null;
}

function validateSlideDeckLockTransition(
    prevDeck: SlideDeckSpec,
    nextDeck: SlideDeckSpec,
    actorUserId: string | null | undefined,
    isOwner: boolean
): ArtifactLockValidationResult {
    const effectiveOwnerId = isOwner && actorUserId ? actorUserId : '__artifact_owner__';
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    const dupSlideId = findDuplicateNonEmptyId(nextDeck.Slides.map((s) => s.SlideID));
    if (dupSlideId) {
        return { Allowed: false, Reason: `Duplicate SlideID '${dupSlideId}' is not allowed.` };
    }
    const nextSlidesById = new Map(nextDeck.Slides.map((s) => [s.SlideID, s]));
    for (const nextSlide of nextDeck.Slides) {
        const dupRegionId = findDuplicateNonEmptyId(nextSlide.Regions.map((r) => r.RegionID));
        if (dupRegionId) {
            return {
                Allowed: false,
                Reason: `Duplicate RegionID '${dupRegionId}' on slide '${nextSlide.SlideID}' is not allowed.`
            };
        }
    }
    for (const prevSlide of prevDeck.Slides) {
        const nextSlide = nextSlidesById.get(prevSlide.SlideID);
        const slideCheck = SlideDeckEngine.Instance.CanActorEditSlide(
            prevSlide,
            actorUserId,
            effectiveOwnerId,
            true
        );
        if (!slideCheck.Allowed) {
            if (!nextSlide || JSON.stringify(prevSlide) !== JSON.stringify(nextSlide)) {
                return { Allowed: false, Reason: slideCheck.Reason };
            }
            continue;
        }
        if (!isOwner && nextSlide && !isSlideLockConfigEqual(prevSlide, nextSlide)) {
            const canSelfLockSlide =
                !prevSlide.Locked &&
                Boolean(nextSlide.Locked) &&
                normActor !== '' &&
                NormalizeUUID(nextSlide.LockedByUserID ?? '') === normActor &&
                !nextSlide.AllowEditors;
            const isSelfLockOwner =
                Boolean(prevSlide.Locked) &&
                normActor !== '' &&
                NormalizeUUID(prevSlide.LockedByUserID ?? '') === normActor &&
                (!nextSlide.Locked || NormalizeUUID(nextSlide.LockedByUserID ?? '') === normActor);
            if (!canSelfLockSlide && !isSelfLockOwner) {
                return {
                    Allowed: false,
                    Reason: 'Cannot modify slide lock metadata without owner permission.'
                };
            }
        }
        if (prevSlide.Regions.length > 0) {
            const nextRegionsById = nextSlide
                ? new Map(nextSlide.Regions.map((r) => [r.RegionID, r]))
                : null;
            for (const prevRegion of prevSlide.Regions) {
                const regionCheck = SlideDeckEngine.Instance.CanActorEditRegion(
                    prevSlide,
                    prevRegion,
                    actorUserId,
                    effectiveOwnerId,
                    true
                );
                const nextRegion = nextRegionsById?.get(prevRegion.RegionID);
                if (!regionCheck.Allowed) {
                    if (!nextSlide || !nextRegion || JSON.stringify(prevRegion) !== JSON.stringify(nextRegion)) {
                        return { Allowed: false, Reason: regionCheck.Reason };
                    }
                } else if (
                    !isOwner &&
                    nextRegion &&
                    !isSlideLockConfigEqual(prevRegion, nextRegion)
                ) {
                    const canSelfLockRegion =
                        !prevRegion.Locked &&
                        Boolean(nextRegion.Locked) &&
                        normActor !== '' &&
                        NormalizeUUID(nextRegion.LockedByUserID ?? '') === normActor &&
                        !nextRegion.AllowEditors;
                    const isSelfLockOwner =
                        Boolean(prevRegion.Locked) &&
                        normActor !== '' &&
                        NormalizeUUID(prevRegion.LockedByUserID ?? '') === normActor &&
                        (!nextRegion.Locked ||
                            NormalizeUUID(nextRegion.LockedByUserID ?? '') === normActor);
                    if (!canSelfLockRegion && !isSelfLockOwner) {
                        return {
                            Allowed: false,
                            Reason: 'Cannot modify slide region lock metadata without owner permission.'
                        };
                    }
                }
            }
        }
    }
    if (!isOwner) {
        const prevSlidesById = new Map(prevDeck.Slides.map((s) => [s.SlideID, s]));
        for (const nextSlide of nextDeck.Slides) {
            const prevSlide = prevSlidesById.get(nextSlide.SlideID);
            if (!prevSlide && nextSlide.Locked) {
                if (!normActor || NormalizeUUID(nextSlide.LockedByUserID ?? '') !== normActor) {
                    return {
                        Allowed: false,
                        Reason: 'Cannot create locked slide with another user as LockedByUserID.'
                    };
                }
            }
            const prevRegIds = new Set(prevSlide ? prevSlide.Regions.map((r) => r.RegionID) : []);
            for (const nextReg of nextSlide.Regions) {
                if (!prevRegIds.has(nextReg.RegionID) && nextReg.Locked) {
                    if (!normActor || NormalizeUUID(nextReg.LockedByUserID ?? '') !== normActor) {
                        return {
                            Allowed: false,
                            Reason: 'Cannot create locked region with another user as LockedByUserID.'
                        };
                    }
                }
            }
        }
    }
    return { Allowed: true };
}

function serializeSheetCellForLockDiff(
    cell: WorkbookSpec['Worksheets'][number]['Cells'][string] | undefined
): string {
    if (!cell) {
        return 'null';
    }
    const { ComputedValue: _cv, DisplayValue: _dv, ...structuralCell } = cell;
    return JSON.stringify(structuralCell);
}

function validateWorkbookLockTransition(
    prevWb: WorkbookSpec,
    nextWb: WorkbookSpec,
    actorUserId: string | null | undefined,
    isOwner: boolean
): ArtifactLockValidationResult {
    const effectiveOwnerId = isOwner && actorUserId ? actorUserId : '__artifact_owner__';
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    const dupSheetId = findDuplicateNonEmptyId(nextWb.Worksheets.map((s) => s.SheetID));
    if (dupSheetId) {
        return { Allowed: false, Reason: `Duplicate SheetID '${dupSheetId}' is not allowed.` };
    }
    const nextSheetsById = new Map<string, WorksheetSpec>(
        nextWb.Worksheets.map((s) => [s.SheetID, s])
    );
    const prevSheetsById = new Map<string, WorksheetSpec>(
        prevWb.Worksheets.map((s) => [s.SheetID, s])
    );
    const editCtx = {
        UserID: actorUserId ?? undefined,
        OwnerUserID: effectiveOwnerId,
        IsEditor: true
    };
    for (const prevSheet of prevWb.Worksheets) {
        const rules = prevSheet.ProtectedRanges ?? [];
        const nextSheet = nextSheetsById.get(prevSheet.SheetID);
        if (!nextSheet) {
            if (rules.length > 0 && !isOwner) {
                return {
                    Allowed: false,
                    Reason: `Cannot delete worksheet '${prevSheet.Name}' containing protected ranges.`
                };
            }
            continue;
        }

        const dupRangeId = findDuplicateNonEmptyId(
            (nextSheet.ProtectedRanges ?? []).map((r) => r.RangeID)
        );
        if (dupRangeId) {
            return {
                Allowed: false,
                Reason: `Duplicate RangeID '${dupRangeId}' on worksheet '${prevSheet.Name}' is not allowed.`
            };
        }

        const prevRulesById = new Map(rules.map((r) => [r.RangeID, r]));
        const nextRulesById = new Map((nextSheet.ProtectedRanges ?? []).map((r) => [r.RangeID, r]));

        for (const rule of rules) {
            const matchingNextRule = nextRulesById.get(rule.RangeID);
            const isRuleOwner =
                isOwner || (normActor !== '' && NormalizeUUID(rule.LockedByUserID) === normActor);
            const ruleModified =
                !matchingNextRule ||
                matchingNextRule.Range !== rule.Range ||
                Boolean(matchingNextRule.AllowEditors) !== Boolean(rule.AllowEditors) ||
                NormalizeUUID(matchingNextRule.LockedByUserID) !== NormalizeUUID(rule.LockedByUserID) ||
                (matchingNextRule.Description ?? '') !== (rule.Description ?? '') ||
                (matchingNextRule.LockedAt ?? '') !== (rule.LockedAt ?? '');
            if (ruleModified && !isRuleOwner) {
                return {
                    Allowed: false,
                    Reason: `Cannot alter or remove protected range '${rule.Range}' without owner permission.`
                };
            }
        }
        const maxRows = Math.max(prevSheet.Rows?.length ?? 0, nextSheet.Rows?.length ?? 0, 1000);
        const maxCols = Math.max(prevSheet.Columns?.length ?? 0, nextSheet.Columns?.length ?? 0, 260);
        if (!isOwner && rules.length > 0) {
            const newRulesToCheck = (nextSheet.ProtectedRanges ?? []).filter((nr) => !prevRulesById.has(nr.RangeID));
            if (newRulesToCheck.length > 0) {
                const disallowedPrev = buildCompiledProtectedRangeIndex(rules, maxRows, maxCols, (prevRule) => {
                    const isPrevRuleCreator =
                        normActor !== '' && NormalizeUUID(prevRule.LockedByUserID) === normActor;
                    return !isPrevRuleCreator && !prevRule.AllowEditors;
                });
                for (const nextRule of newRulesToCheck) {
                    if (!normActor || NormalizeUUID(nextRule.LockedByUserID) !== normActor) {
                        return {
                            Allowed: false,
                            Reason: `Cannot create protected range '${nextRule.Range}' with spoofed LockedByUserID.`
                        };
                    }
                    const nextParsed = ParseRangeAddress(nextRule.Range, maxRows, maxCols);
                    if (!nextParsed) {
                        return {
                            Allowed: false,
                            Reason: `Invalid protected range address '${nextRule.Range}'.`
                        };
                    }
                    if (disallowedPrev.unparsedRules.length > 0) {
                        return {
                            Allowed: false,
                            Reason: `Cannot add protected range '${nextRule.Range}' overlapping locked range '${disallowedPrev.unparsedRules[0].Range}'.`
                        };
                    }
                    const overlapping = findOverlappingIndexedProtectedRule(nextParsed, disallowedPrev);
                    if (overlapping) {
                        return {
                            Allowed: false,
                            Reason: `Cannot add protected range '${nextRule.Range}' overlapping locked range '${overlapping.Range}'.`
                        };
                    }
                }
            }
        } else if (!isOwner) {
            for (const nextRule of nextSheet.ProtectedRanges ?? []) {
                if (!prevRulesById.has(nextRule.RangeID)) {
                    if (!normActor || NormalizeUUID(nextRule.LockedByUserID) !== normActor) {
                        return {
                            Allowed: false,
                            Reason: `Cannot create protected range '${nextRule.Range}' with spoofed LockedByUserID.`
                        };
                    }
                    const nextParsed = ParseRangeAddress(nextRule.Range, maxRows, maxCols);
                    if (!nextParsed) {
                        return {
                            Allowed: false,
                            Reason: `Invalid protected range address '${nextRule.Range}'.`
                        };
                    }
                }
            }
        }

        if (rules.length === 0) {
            continue;
        }

        const prevRowsLen = prevSheet.Rows?.length ?? 0;
        const nextRowsLen = nextSheet.Rows?.length ?? 0;
        const firstRowMismatchIdx = findFirstRowIdMismatchIndex(prevSheet.Rows, nextSheet.Rows);
        const prevColsLen = prevSheet.Columns?.length ?? 0;
        const nextColsLen = nextSheet.Columns?.length ?? 0;
        const firstColMismatchIdx = findFirstColIdMismatchIndex(prevSheet.Columns, nextSheet.Columns);
        const sortSpecChanged =
            JSON.stringify(prevSheet.SortSpec ?? null) !== JSON.stringify(nextSheet.SortSpec ?? null);
        const mergeRangesChanged =
            JSON.stringify(prevSheet.MergeRanges ?? []) !== JSON.stringify(nextSheet.MergeRanges ?? []);

        for (const rule of rules) {
            const parsedRange = ParseRangeAddress(rule.Range, maxRows, maxCols);
            if (!parsedRange) {
                if (!isOwner) {
                    return {
                        Allowed: false,
                        Reason: `Blocked structural edit: invalid protected range '${rule.Range}'.`
                    };
                }
                continue;
            }
            if (isActorAllowedForLockRule(rule, editCtx)) {
                continue;
            }
            const sampleAddr = FormatCellAddress(parsedRange.startRow, parsedRange.startCol);
            const sampleDeniedReason = `Cell '${sampleAddr}' falls inside protected range '${rule.Range}' (locked by ${rule.LockedByUserID}).`;

            const prevRowPrefixLen = Math.min(prevRowsLen, parsedRange.endRow);
            const nextRowPrefixLen = Math.min(nextRowsLen, parsedRange.endRow);
            if (prevRowPrefixLen !== nextRowPrefixLen || firstRowMismatchIdx < prevRowPrefixLen) {
                return {
                    Allowed: false,
                    Reason: sampleDeniedReason
                };
            }

            const prevColPrefixLen = Math.min(prevColsLen, parsedRange.endCol);
            const nextColPrefixLen = Math.min(nextColsLen, parsedRange.endCol);
            if (prevColPrefixLen !== nextColPrefixLen || firstColMismatchIdx < prevColPrefixLen) {
                return {
                    Allowed: false,
                    Reason: sampleDeniedReason
                };
            }

            if (sortSpecChanged) {
                return {
                    Allowed: false,
                    Reason: `Cannot alter sort specification on worksheet with protected range '${rule.Range}'.`
                };
            }
            if (mergeRangesChanged) {
                return {
                    Allowed: false,
                    Reason: `Cannot alter merged ranges on worksheet with protected range '${rule.Range}'.`
                };
            }
        }

        const compiledPrevCellIndex = buildCompiledProtectedRangeIndex(
            rules,
            EXCEL_MAX_ROWS,
            EXCEL_MAX_COLS
        ).index;
        const allAddresses = new Set<string>([
            ...Object.keys(prevSheet.Cells ?? {}),
            ...Object.keys(nextSheet.Cells ?? {})
        ]);
        for (const addr of allAddresses) {
            const prevCell = prevSheet.Cells?.[addr];
            const nextCell = nextSheet.Cells?.[addr];
            if (serializeSheetCellForLockDiff(prevCell) === serializeSheetCellForLockDiff(nextCell)) {
                continue;
            }
            const perm = checkSheetCellWithIndex(compiledPrevCellIndex, addr, editCtx);
            if (!perm.Allowed) {
                return { Allowed: false, Reason: perm.Reason };
            }
        }
    }

    if (!isOwner) {
        for (const nextSheet of nextWb.Worksheets) {
            if (prevSheetsById.has(nextSheet.SheetID)) {
                continue;
            }
            const dupRangeId = findDuplicateNonEmptyId(
                (nextSheet.ProtectedRanges ?? []).map((r) => r.RangeID)
            );
            if (dupRangeId) {
                return {
                    Allowed: false,
                    Reason: `Duplicate RangeID '${dupRangeId}' on worksheet '${nextSheet.Name}' is not allowed.`
                };
            }
            for (const nextRule of nextSheet.ProtectedRanges ?? []) {
                if (!normActor || NormalizeUUID(nextRule.LockedByUserID) !== normActor) {
                    return {
                        Allowed: false,
                        Reason: `Cannot create protected range '${nextRule.Range}' with spoofed LockedByUserID.`
                    };
                }
            }
        }
    }
    return { Allowed: true };
}

/**
 * Validates an artifact content mutation (`currentContent -> nextContent`) and optional
 * `Configuration` transition against Markdown heading/block locks, Slide Deck locks (`Locked`,
 * `LockedByUserID`, `AllowEditors`), and Spreadsheet protected ranges (`ProtectedRanges`) (`B3`).
 */
export function ValidateArtifactContentMutationAgainstLocks(
    currentContent: string,
    nextContent: string,
    actorUserId?: string | null,
    isOwner: boolean = false,
    options?: ArtifactLockValidationOptions
): ArtifactLockValidationResult {
    const currentConfig = options?.currentConfiguration ?? null;
    const nextConfig = options?.nextConfiguration ?? null;
    if (currentContent === nextContent && currentConfig === nextConfig) {
        return { Allowed: true };
    }
    const effectiveOwnerId = isOwner && actorUserId ? actorUserId : '__artifact_owner__';
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    const trimmedCurrent = currentContent.trim();

    if (!trimmedCurrent && !(currentConfig ?? '').trim()) {
        if (nextConfig && inspectStructuredJsonKind(nextConfig)) {
            const emptyConfigCheck = validateNewLocksOnEmptyContent(nextConfig, actorUserId, isOwner);
            if (emptyConfigCheck !== null && !emptyConfigCheck.Allowed) {
                return emptyConfigCheck;
            }
        }
        const emptyContentCheck = validateNewLocksOnEmptyContent(nextContent, actorUserId, isOwner);
        if (emptyContentCheck !== null && !emptyContentCheck.Allowed) {
            return emptyContentCheck;
        }
    }

    const currentContentKind = inspectStructuredJsonKind(currentContent);
    const nextContentKind = inspectStructuredJsonKind(nextContent);
    const currentConfigKind = inspectStructuredJsonKind(currentConfig);
    const nextConfigKind = inspectStructuredJsonKind(nextConfig);
    const hasCurrentSlides = currentContentKind === 'slides' || currentConfigKind === 'slides';
    const isSlidesInvolved =
        hasCurrentSlides || nextContentKind === 'slides' || nextConfigKind === 'slides';
    const hasCurrentWorkbook =
        currentContentKind === 'workbook' ||
        currentConfigKind === 'workbook' ||
        isXlsxBinaryTextPayload(currentContent);
    const isWorkbookInvolved =
        hasCurrentWorkbook ||
        nextContentKind === 'workbook' ||
        nextConfigKind === 'workbook' ||
        isXlsxBinaryTextPayload(nextContent);

    if (isSlidesInvolved) {
        try {
            const checkSlidePair = (prevPayload: string, nextPayload: string): ArtifactLockValidationResult | null => {
                if (prevPayload.trim()) {
                    const res = validateSlideDeckLockTransition(
                        SlideDeckEngine.Instance.ParseDeckSpec(prevPayload),
                        SlideDeckEngine.Instance.ParseDeckSpec(nextPayload),
                        actorUserId,
                        isOwner
                    );
                    if (!res.Allowed) {
                        return res;
                    }
                } else {
                    const newCheck = validateNewLocksOnEmptyContent(nextPayload, actorUserId, isOwner);
                    if (newCheck && !newCheck.Allowed) {
                        return newCheck;
                    }
                }
                return null;
            };

            if (hasCurrentSlides) {
                // R4 / Lower: Use the Content slot only when it parses as slides (so an owner with Markdown
                // Content + slides Configuration never fails parsing); still block non-owners replacing
                // locked slides with non-slide Markdown Content (`R4`).
                const prevRenderedSlide =
                    currentContentKind === 'slides'
                        ? currentContent
                        : currentConfigKind === 'slides'
                          ? currentConfig!
                          : '';
                const nonOwnerNonSlideContentOverride =
                    !isOwner && nextContent.trim().length > 0 && nextContentKind !== 'slides';
                const nextRenderedSlide = nonOwnerNonSlideContentOverride
                    ? nextContent
                    : nextContentKind === 'slides'
                      ? nextContent
                      : nextConfigKind === 'slides'
                        ? nextConfig!
                        : '';
                if (prevRenderedSlide || nextRenderedSlide) {
                    const renderedCheck = checkSlidePair(prevRenderedSlide, nextRenderedSlide);
                    if (renderedCheck) {
                        return renderedCheck;
                    }
                }
            } else {
                // Prior state was not slides (e.g. locked Markdown); validate any newly introduced slide locks
                // without returning Allowed early so DocumentLiveBlockEngine still inspects `Content` (`B1`).
                if (nextContentKind === 'slides') {
                    const newSlideContentCheck = validateNewLocksOnEmptyContent(nextContent, actorUserId, isOwner);
                    if (newSlideContentCheck && !newSlideContentCheck.Allowed) {
                        return newSlideContentCheck;
                    }
                }
                if (nextConfigKind === 'slides' && nextConfig) {
                    const newSlideConfigCheck = validateNewLocksOnEmptyContent(nextConfig, actorUserId, isOwner);
                    if (newSlideConfigCheck && !newSlideConfigCheck.Allowed) {
                        return newSlideConfigCheck;
                    }
                }
            }

            if (currentContentKind === 'slides' || (hasCurrentSlides && nextContentKind === 'slides')) {
                const contentCheck = checkSlidePair(currentContent, nextContent);
                if (contentCheck) {
                    return contentCheck;
                }
            }

            if (currentConfigKind === 'slides' || (hasCurrentSlides && nextConfigKind === 'slides')) {
                const configCheck = checkSlidePair(currentConfig ?? '', nextConfig ?? '');
                if (configCheck) {
                    return configCheck;
                }
            }
        } catch {
            return {
                Allowed: false,
                Reason: 'Write rejected: malformed update to structured presentation with protected regions.'
            };
        }
    }

    if (isWorkbookInvolved) {
        try {
            if (hasCurrentWorkbook) {
                const prevEffectiveWb = SpreadsheetEngine.Instance.ParseWorkbook(currentContent, currentConfig, {
                    SkipEvaluate: true
                });
                const nextEffectiveWb = SpreadsheetEngine.Instance.ParseWorkbook(nextContent, nextConfig, {
                    SkipEvaluate: true
                });
                const effectiveRes = validateWorkbookLockTransition(
                    prevEffectiveWb,
                    nextEffectiveWb,
                    actorUserId,
                    isOwner
                );
                if (!effectiveRes.Allowed) {
                    return effectiveRes;
                }
            } else {
                // Prior state was not a workbook (e.g. locked Markdown); validate any newly introduced
                // protected ranges without returning Allowed early so `docCheck` still runs (`B1`).
                if (nextContentKind === 'workbook' || isXlsxBinaryTextPayload(nextContent)) {
                    const newWbContentCheck = validateNewLocksOnEmptyContent(nextContent, actorUserId, isOwner);
                    if (newWbContentCheck && !newWbContentCheck.Allowed) {
                        return newWbContentCheck;
                    }
                }
                if (nextConfigKind === 'workbook' && nextConfig) {
                    const newWbConfigCheck = validateNewLocksOnEmptyContent(nextConfig, actorUserId, isOwner);
                    if (newWbConfigCheck && !newWbConfigCheck.Allowed) {
                        return newWbConfigCheck;
                    }
                }
            }

            // Also independently guard Content vs Content and Configuration vs Configuration so
            // tampering either field (even when the other already parses) cannot smuggle edits (`B3`).
            if (
                (currentContentKind === 'workbook' || isXlsxBinaryTextPayload(currentContent)) &&
                (nextContentKind === 'workbook' || isXlsxBinaryTextPayload(nextContent)) &&
                currentContent !== nextContent
            ) {
                const contentRes = validateWorkbookLockTransition(
                    SpreadsheetEngine.Instance.ParseWorkbook(currentContent, null, { SkipEvaluate: true }),
                    SpreadsheetEngine.Instance.ParseWorkbook(nextContent, null, { SkipEvaluate: true }),
                    actorUserId,
                    isOwner
                );
                if (!contentRes.Allowed) {
                    return contentRes;
                }
            }
            if (currentConfigKind === 'workbook' && nextConfigKind === 'workbook' && currentConfig !== nextConfig) {
                const configRes = validateWorkbookLockTransition(
                    SpreadsheetEngine.Instance.ParseWorkbook(null, currentConfig, { SkipEvaluate: true }),
                    SpreadsheetEngine.Instance.ParseWorkbook(null, nextConfig, { SkipEvaluate: true }),
                    actorUserId,
                    isOwner
                );
                if (!configRes.Allowed) {
                    return configRes;
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.startsWith('Spreadsheet ')) {
                return { Allowed: false, Reason: msg };
            }
            return {
                Allowed: false,
                Reason: 'Write rejected: malformed update to structured workbook with protected ranges.'
            };
        }
    }

    const docCheck = DocumentLiveBlockEngine.Instance.ValidateDocumentEditAgainstLocks(
        currentContent,
        nextContent,
        actorUserId,
        effectiveOwnerId,
        true
    );
    if (!docCheck.Allowed) {
        return { Allowed: false, Reason: docCheck.ViolationReason };
    }
    if (!isOwner) {
        const prevLocks = DocumentLiveBlockEngine.Instance.ParseDocumentLocks(currentContent);
        const nextLocks = DocumentLiveBlockEngine.Instance.ParseDocumentLocks(nextContent);
        if (nextLocks.length > prevLocks.length) {
            const prevKeys = prevLocks.map(
                (l) => `${l.Kind}|${l.Scope}|${l.LockedByUserID ? NormalizeUUID(l.LockedByUserID) : ''}|${l.Label}`
            );
            for (const nl of nextLocks) {
                const nlKey = `${nl.Kind}|${nl.Scope}|${nl.LockedByUserID ? NormalizeUUID(nl.LockedByUserID) : ''}|${nl.Label}`;
                const existingIdx = prevKeys.indexOf(nlKey);
                if (existingIdx >= 0) {
                    prevKeys.splice(existingIdx, 1);
                    continue;
                }
                const lockedByNorm = nl.LockedByUserID ? NormalizeUUID(nl.LockedByUserID) : '';
                if (nl.Scope === 'owner-only' || !normActor || lockedByNorm !== normActor) {
                    return {
                        Allowed: false,
                        Reason: `Cannot add document lock '${nl.Label}' without owner permission.`
                    };
                }
            }
        }
    }
    return { Allowed: true };
}
