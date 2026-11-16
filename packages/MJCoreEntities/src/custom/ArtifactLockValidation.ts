import { NormalizeUUID } from '@memberjunction/global';
import { DocumentLiveBlockEngine } from './DocumentLiveBlockEngine';
import { SlideDeckEngine } from './SlideDeckEngine';
import {
    FormatCellAddress,
    ParseRangeAddress,
    SpreadsheetEngine,
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

function checkSheetCellMostRestrictive(
    sheet: WorksheetSpec,
    cellAddress: string,
    editCtx: { UserID?: string; OwnerUserID: string; IsEditor: boolean }
): ArtifactLockValidationResult {
    const rules = sheet.ProtectedRanges ?? [];
    for (const rule of rules) {
        const singleRuleRes = SpreadsheetEngine.Instance.CheckCellWritePermission(
            { ...sheet, ProtectedRanges: [rule] },
            cellAddress,
            editCtx
        );
        if (!singleRuleRes.Allowed) {
            return singleRuleRes;
        }
    }
    return { Allowed: true };
}

function validateNewLocksOnEmptyContent(
    nextContent: string,
    actorUserId: string | null | undefined,
    isOwner: boolean
): ArtifactLockValidationResult | null {
    const trimmedNext = nextContent.trim();
    if (!trimmedNext.startsWith('{')) {
        return null;
    }
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    let parsedType: 'slides' | 'workbook' | null = null;
    try {
        const parsedNext = JSON.parse(trimmedNext) as {
            Slides?: Array<object>;
            Worksheets?: Array<object>;
        };
        if (Array.isArray(parsedNext.Slides)) {
            parsedType = 'slides';
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
        if (Array.isArray(parsedNext.Worksheets)) {
            parsedType = 'workbook';
            const nextWb = SpreadsheetEngine.Instance.ParseWorkbook(nextContent);
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
    } catch {
        if (parsedType !== null) {
            return {
                Allowed: false,
                Reason: 'Write rejected: malformed update to structured document.'
            };
        }
    }
    return null;
}

/**
 * Validates an artifact content mutation (`currentContent -> nextContent`) against Markdown heading/block locks,
 * Slide Deck locks (`Locked`, `LockedByUserID`, `AllowEditors`), and Spreadsheet protected ranges (`ProtectedRanges`).
 * Shared across real-time Yjs collaboration, version persistence (`MJArtifactVersionEntityServer`), and server tools (`B3`).
 */
export function ValidateArtifactContentMutationAgainstLocks(
    currentContent: string,
    nextContent: string,
    actorUserId?: string | null,
    isOwner: boolean = false
): ArtifactLockValidationResult {
    if (currentContent === nextContent) {
        return { Allowed: true };
    }
    const effectiveOwnerId = isOwner && actorUserId ? actorUserId : '__artifact_owner__';
    const normActor = actorUserId ? NormalizeUUID(actorUserId) : '';
    const trimmedCurrent = currentContent.trim();

    if (!trimmedCurrent) {
        const emptyStructCheck = validateNewLocksOnEmptyContent(nextContent, actorUserId, isOwner);
        if (emptyStructCheck !== null) {
            return emptyStructCheck;
        }
    }

    if (trimmedCurrent.startsWith('{')) {
        let parsedCurrentType: 'slides' | 'workbook' | null = null;
        try {
            const parsedCurrent = JSON.parse(trimmedCurrent) as { Slides?: Array<object>; Worksheets?: Array<object> };
            if (Array.isArray(parsedCurrent.Slides)) {
                parsedCurrentType = 'slides';
                const prevDeck = SlideDeckEngine.Instance.ParseDeckSpec(currentContent);
                const nextDeck = SlideDeckEngine.Instance.ParseDeckSpec(nextContent);
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

            if (Array.isArray(parsedCurrent.Worksheets)) {
                parsedCurrentType = 'workbook';
                const prevWb = SpreadsheetEngine.Instance.ParseWorkbook(currentContent);
                const nextWb = SpreadsheetEngine.Instance.ParseWorkbook(nextContent);
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
                    if (!isOwner) {
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
                                for (const prevRule of rules) {
                                    const isPrevRuleCreator =
                                        normActor !== '' && NormalizeUUID(prevRule.LockedByUserID) === normActor;
                                    if (isPrevRuleCreator || prevRule.AllowEditors) {
                                        continue;
                                    }
                                    const prevParsed = ParseRangeAddress(prevRule.Range, maxRows, maxCols);
                                    if (!prevParsed || doParsedRangesOverlap(nextParsed, prevParsed)) {
                                        return {
                                            Allowed: false,
                                            Reason: `Cannot add protected range '${nextRule.Range}' overlapping locked range '${prevRule.Range}'.`
                                        };
                                    }
                                }
                            }
                        }
                    }

                    if (rules.length === 0) {
                        continue;
                    }

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
                        const sampleAddr = FormatCellAddress(parsedRange.startRow, parsedRange.startCol);
                        const samplePerm = SpreadsheetEngine.Instance.CheckCellWritePermission(
                            { ...prevSheet, ProtectedRanges: [rule] },
                            sampleAddr,
                            editCtx
                        );
                        if (samplePerm.Allowed) {
                            continue;
                        }

                        const prevRowsPrefix = (prevSheet.Rows ?? [])
                            .slice(0, parsedRange.endRow)
                            .map((r) => r.RowID);
                        const nextRowsPrefix = (nextSheet.Rows ?? [])
                            .slice(0, parsedRange.endRow)
                            .map((r) => r.RowID);
                        if (
                            prevRowsPrefix.length !== nextRowsPrefix.length ||
                            prevRowsPrefix.some((id, idx) => id !== nextRowsPrefix[idx])
                        ) {
                            return {
                                Allowed: false,
                                Reason:
                                    samplePerm.Reason ??
                                    `Cannot insert, delete, or reorder rows intersecting protected range '${rule.Range}'.`
                            };
                        }

                        const prevColsPrefix = (prevSheet.Columns ?? [])
                            .slice(0, parsedRange.endCol)
                            .map((c) => c.ColumnID);
                        const nextColsPrefix = (nextSheet.Columns ?? [])
                            .slice(0, parsedRange.endCol)
                            .map((c) => c.ColumnID);
                        if (
                            prevColsPrefix.length !== nextColsPrefix.length ||
                            prevColsPrefix.some((id, idx) => id !== nextColsPrefix[idx])
                        ) {
                            return {
                                Allowed: false,
                                Reason:
                                    samplePerm.Reason ??
                                    `Cannot insert, delete, or reorder columns intersecting protected range '${rule.Range}'.`
                            };
                        }

                        if (
                            JSON.stringify(prevSheet.SortSpec ?? null) !==
                            JSON.stringify(nextSheet.SortSpec ?? null)
                        ) {
                            return {
                                Allowed: false,
                                Reason: `Cannot alter sort specification on worksheet with protected range '${rule.Range}'.`
                            };
                        }
                        if (
                            JSON.stringify(prevSheet.MergeRanges ?? []) !==
                            JSON.stringify(nextSheet.MergeRanges ?? [])
                        ) {
                            return {
                                Allowed: false,
                                Reason: `Cannot alter merged ranges on worksheet with protected range '${rule.Range}'.`
                            };
                        }
                    }

                    const allAddresses = new Set<string>([
                        ...Object.keys(prevSheet.Cells ?? {}),
                        ...Object.keys(nextSheet.Cells ?? {})
                    ]);
                    for (const addr of allAddresses) {
                        const prevCell = prevSheet.Cells?.[addr];
                        const nextCell = nextSheet.Cells?.[addr];
                        if (JSON.stringify(prevCell ?? null) === JSON.stringify(nextCell ?? null)) {
                            continue;
                        }
                        const perm = checkSheetCellMostRestrictive(prevSheet, addr, editCtx);
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
        } catch {
            if (parsedCurrentType !== null) {
                return {
                    Allowed: false,
                    Reason: 'Write rejected: malformed update to structured document with protected regions.'
                };
            }
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
