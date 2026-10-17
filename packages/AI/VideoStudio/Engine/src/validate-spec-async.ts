/**
 * @fileoverview Server-side asynchronous validator for `VideoGenerationSpec`
 * (Plan §3.2, §15 VS-SPEC-2b).
 *
 * Runs the pure `ValidateVideoGenerationSpec` validator from `@memberjunction/video-studio-core`
 * first, then verifies database-backed references (`BrandKitID`, `Archetype`, and all `MJ: Files`
 * `FileID` references) using `BrandKitEngine`, `VideoStudioEngine`, and `RunView` as `contextUser`.
 * Fails closed (`AsyncValidationFailed`) without throwing if any engine or view read fails.
 *
 * @module @memberjunction/video-studio
 */

import { RunView, UserInfo } from '@memberjunction/core';
import { BrandKitEngine, VideoStudioEngine } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    ValidateVideoGenerationSpec,
    VideoFormat,
    VideoGenerationSpec,
    VideoProductionStatus,
    VideoSpecValidationError,
    VideoSpecValidationOptions,
    VideoSpecValidationResult,
} from '@memberjunction/video-studio-core';

/** Maximum number of validated file IDs queried in a single `MJ: Files` `RunView` call. */
export const FILE_VALIDATION_BATCH_SIZE = 500;

interface FileIdReference {
    id: string;
    path: string;
}

/**
 * Validates a `VideoGenerationSpec` against both pure structural/stage rules and server-side
 * database state (`MJ: Brand Kits`, `MJ: Video Archetypes`, and `MJ: Files` readability as
 * `contextUser`).
 *
 * Never throws: if an engine `Config` call or `RunView` fails, adds an `'AsyncValidationFailed'`
 * error and returns `{ Valid: false, Errors }`.
 *
 * @param spec The `VideoGenerationSpec` document to validate.
 * @param stage Target lifecycle stage to validate against (defaults to `spec?.Status`).
 * @param contextUser Server-side user context used for engine configuration and `MJ: Files` RLS/permissions.
 * @param options Optional pure-validator constraints (`MaxGeneratedVideoSeconds`, `BrandKitAssetKeys`).
 */
export async function ValidateVideoGenerationSpecAsync(
    spec: VideoGenerationSpec,
    stage: VideoProductionStatus | undefined = spec?.Status,
    contextUser: UserInfo,
    options?: VideoSpecValidationOptions,
): Promise<VideoSpecValidationResult> {
    const pureResult = ValidateVideoGenerationSpec(spec, stage, options);
    const errors: VideoSpecValidationError[] = [...pureResult.Errors];
    const safeSpec = (spec ?? {}) as VideoGenerationSpec;

    try {
        await BrandKitEngine.Instance.Config(false, contextUser);
        await VideoStudioEngine.Instance.Config(false, contextUser);

        validateBrandKit(safeSpec, errors);
        validateArchetype(safeSpec, errors);
        await validateFiles(safeSpec, contextUser, errors);
    } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        errors.push({
            Code: 'AsyncValidationFailed',
            Path: '',
            Message: `Async validation failed: ${detail}`,
        });
        return {
            Valid: false,
            Errors: errors,
        };
    }

    return {
        Valid: errors.length === 0,
        Errors: errors,
    };
}

function validateBrandKit(spec: VideoGenerationSpec, errors: VideoSpecValidationError[]): void {
    const rawBrandKitId = typeof spec.BrandKitID === 'string' ? spec.BrandKitID.trim() : '';
    if (!rawBrandKitId) {
        return;
    }

    const companyId = typeof spec.CompanyID === 'string' && spec.CompanyID.trim().length > 0
        ? spec.CompanyID.trim()
        : null;

    const scopedKits = BrandKitEngine.Instance.GetKitsForCompany(companyId);
    if (scopedKits.some((k) => UUIDsEqual(k.ID, rawBrandKitId))) {
        return;
    }

    const allKits = BrandKitEngine.Instance.BrandKits;
    const matchingKit = allKits.find((k) => UUIDsEqual(k.ID, rawBrandKitId));
    if (matchingKit && matchingKit.Status === 'Active') {
        errors.push({
            Code: 'BrandKitNotInScope',
            Path: 'BrandKitID',
            Message: `BrandKitID "${spec.BrandKitID}" belongs to another company and is not in scope for CompanyID "${companyId ?? 'org-wide'}".`,
        });
        return;
    }

    errors.push({
        Code: 'BrandKitNotFound',
        Path: 'BrandKitID',
        Message: `BrandKitID "${spec.BrandKitID}" was not found or is not Active.`,
    });
}

function validateArchetype(spec: VideoGenerationSpec, errors: VideoSpecValidationError[]): void {
    const companyId = typeof spec.CompanyID === 'string' && spec.CompanyID.trim().length > 0
        ? spec.CompanyID.trim()
        : null;

    const archetypeId = typeof spec.Archetype?.ArchetypeID === 'string' ? spec.Archetype.ArchetypeID.trim() : '';
    if (archetypeId.length > 0) {
        const scopedArchetypes = VideoStudioEngine.Instance.GetArchetypesForCompany(companyId);
        if (!scopedArchetypes.some((a) => UUIDsEqual(a.ID, archetypeId))) {
            errors.push({
                Code: 'ArchetypeNotFound',
                Path: 'Archetype',
                Message: `Archetype with ArchetypeID "${spec.Archetype.ArchetypeID}" was not found for CompanyID "${companyId ?? 'org-wide'}".`,
            });
        }
        return;
    }

    const rawName = typeof spec.Archetype?.Name === 'string' ? spec.Archetype.Name : '';
    if (rawName.trim().length > 0) {
        const matched = VideoStudioEngine.Instance.GetArchetypeByName(rawName, companyId);
        if (!matched) {
            errors.push({
                Code: 'ArchetypeNotFound',
                Path: 'Archetype',
                Message: `Archetype "${rawName}" was not found for CompanyID "${companyId ?? 'org-wide'}".`,
            });
        }
    }
}

function collectFileReferences(spec: VideoGenerationSpec, errors: VideoSpecValidationError[]): FileIdReference[] {
    const validRefs: FileIdReference[] = [];

    const recordCandidate = (rawId: unknown, path: string): void => {
        if (rawId === undefined || rawId === null) {
            return;
        }
        if (typeof rawId === 'string' && rawId.trim() === '') {
            return;
        }
        const trimmed = typeof rawId === 'string' ? rawId.trim() : String(rawId);
        if (!IsValidUUID(trimmed)) {
            errors.push({
                Code: 'InvalidFileID',
                Path: path,
                Message: `File ID "${String(rawId)}" at ${path} is not a valid UUID.`,
            });
            return;
        }
        validRefs.push({ id: trimmed, path });
    };

    if (Array.isArray(spec.Assets?.Approved)) {
        spec.Assets.Approved.forEach((asset, idx) => {
            if (asset && asset.FileID !== undefined && asset.FileID !== null) {
                recordCandidate(asset.FileID, `Assets.Approved[${idx}].FileID`);
            }
        });
    }

    if (spec.DataSnapshot && spec.DataSnapshot.FileID !== undefined && spec.DataSnapshot.FileID !== null) {
        recordCandidate(spec.DataSnapshot.FileID, 'DataSnapshot.FileID');
    }

    if (Array.isArray(spec.Audio?.Narration?.Script)) {
        spec.Audio.Narration.Script.forEach((line, idx) => {
            if (line && line.AudioFileID !== undefined && line.AudioFileID !== null) {
                recordCandidate(line.AudioFileID, `Audio.Narration.Script[${idx}].AudioFileID`);
            }
        });
    }

    if (Array.isArray(spec.Review?.Rounds)) {
        spec.Review.Rounds.forEach((round, rIdx) => {
            if (!round?.ContactSheetFileIDs || typeof round.ContactSheetFileIDs !== 'object') {
                return;
            }
            for (const [format, ids] of Object.entries(round.ContactSheetFileIDs as Record<VideoFormat, string[]>)) {
                if (Array.isArray(ids)) {
                    ids.forEach((fileId, cIdx) => {
                        recordCandidate(fileId, `Review.Rounds[${rIdx}].ContactSheetFileIDs.${format}[${cIdx}]`);
                    });
                }
            }
        });
    }

    if (spec.Output) {
        if (spec.Output.Videos && typeof spec.Output.Videos === 'object') {
            for (const [format, videoOut] of Object.entries(spec.Output.Videos)) {
                if (videoOut && videoOut.FileID !== undefined && videoOut.FileID !== null) {
                    recordCandidate(videoOut.FileID, `Output.Videos.${format}.FileID`);
                }
            }
        }
        if (spec.Output.PosterFileID !== undefined && spec.Output.PosterFileID !== null) {
            recordCandidate(spec.Output.PosterFileID, 'Output.PosterFileID');
        }
        if (spec.Output.CaptionsFileID !== undefined && spec.Output.CaptionsFileID !== null) {
            recordCandidate(spec.Output.CaptionsFileID, 'Output.CaptionsFileID');
        }
        if (spec.Output.ContactSheetFileIDs && typeof spec.Output.ContactSheetFileIDs === 'object') {
            for (const [format, ids] of Object.entries(spec.Output.ContactSheetFileIDs as Record<VideoFormat, string[]>)) {
                if (Array.isArray(ids)) {
                    ids.forEach((fileId, cIdx) => {
                        recordCandidate(fileId, `Output.ContactSheetFileIDs.${format}[${cIdx}]`);
                    });
                }
            }
        }
    }

    return validRefs;
}

async function validateFiles(
    spec: VideoGenerationSpec,
    contextUser: UserInfo,
    errors: VideoSpecValidationError[],
): Promise<void> {
    const validRefs = collectFileReferences(spec, errors);
    if (validRefs.length === 0) {
        return;
    }

    const uniqueIds = [...new UUIDSet(validRefs.map((r) => r.id))];
    const readable = new UUIDSet();
    const rv = new RunView();

    for (let offset = 0; offset < uniqueIds.length; offset += FILE_VALIDATION_BATCH_SIZE) {
        const batch = uniqueIds.slice(offset, offset + FILE_VALIDATION_BATCH_SIZE);
        const inList = batch.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        const viewResult = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Files',
                ExtraFilter: `ID IN (${inList})`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            contextUser,
        );

        if (!viewResult.Success) {
            throw new Error(viewResult.ErrorMessage || 'RunView on MJ: Files returned Success: false');
        }

        for (const row of viewResult.Results) {
            if (typeof row.ID === 'string') {
                readable.Add(row.ID);
            }
        }
    }

    for (const ref of validRefs) {
        if (!readable.Has(ref.id)) {
            errors.push({
                Code: 'FileNotReadable',
                Path: ref.path,
                Message: `File "${ref.id}" at ${ref.path} does not exist or is not readable by the current user.`,
            });
        }
    }
}
