/**
 * Invariant 6 — Incremental sync consistency.
 *
 * For every IO where SupportsIncrementalSync=true verifies (per
 * INTEGRATION-FRAMEWORK-REQUIREMENTS.md §7.2):
 *
 *   1. IncrementalCursorFieldName is set
 *   2. The named IOF exists on this IO
 *   3. That IOF's Type is compatible with the declared IncrementalWatermarkType:
 *       Timestamp → date / datetime
 *       Version   → integer / string
 *       Cursor / ChangeToken → string
 *   4. WatermarkService.ValidateWatermark would accept values of that type
 *      (modeled as the type-compatibility table above)
 *
 * Failure modes caught:
 *   - SupportsIncrementalSync=true but no cursor field declared
 *   - Cursor field name doesn't match any IOF
 *   - Type mismatch (e.g., declares Timestamp but cursor IOF is a boolean)
 */
import type { MetadataFile, FailureDetail } from './types.js';

type WatermarkType = 'Timestamp' | 'Version' | 'Cursor' | 'ChangeToken';

/**
 * Maps watermark types to the IOF Type values that are compatible.
 * IOF Type vocabulary used by the extractor:
 *   string, integer, number, boolean, datetime, date, json, object
 */
const COMPATIBLE_IOF_TYPES: Record<WatermarkType, ReadonlySet<string>> = {
    Timestamp: new Set(['datetime', 'date', 'string']), // ISO8601 strings are common
    Version: new Set(['integer', 'number', 'string']),
    Cursor: new Set(['string']),
    ChangeToken: new Set(['string']),
};

export function CheckIncrementalConsistency(metadata: MetadataFile): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];

    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    for (const io of ios) {
        const ioName = io.fields.Name;
        const fields = io.fields as Record<string, unknown>;
        const supportsIncremental = fields['SupportsIncrementalSync'] === true;
        if (!supportsIncremental) continue;

        const cursorFieldName = fields['IncrementalCursorFieldName'];
        const watermarkType = fields['IncrementalWatermarkType'];

        // (1) IncrementalCursorFieldName must be set
        if (cursorFieldName == null || cursorFieldName === '') {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' has SupportsIncrementalSync=true but IncrementalCursorFieldName is not set.`,
                Location: `metadata.IO[${ioName}].IncrementalCursorFieldName`,
                SuggestedFix: `Set IncrementalCursorFieldName to the IOF name whose value is the watermark, OR set SupportsIncrementalSync=false.`,
            });
            continue;
        }

        if (typeof cursorFieldName !== 'string') {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' has IncrementalCursorFieldName but it is not a string.`,
                Location: `metadata.IO[${ioName}].IncrementalCursorFieldName`,
                SuggestedFix: `IncrementalCursorFieldName must be a string referencing an IOF by Name.`,
            });
            continue;
        }

        // (1.5) IncrementalWatermarkType must be set when SupportsIncrementalSync=true
        if (watermarkType == null || watermarkType === '') {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' has SupportsIncrementalSync=true but IncrementalWatermarkType is not set.`,
                Location: `metadata.IO[${ioName}].IncrementalWatermarkType`,
                SuggestedFix: `Set IncrementalWatermarkType to one of: Timestamp, Version, Cursor, ChangeToken.`,
            });
            continue;
        }

        if (
            typeof watermarkType !== 'string' ||
            !['Timestamp', 'Version', 'Cursor', 'ChangeToken'].includes(watermarkType)
        ) {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' has IncrementalWatermarkType='${String(watermarkType)}' which is not one of: Timestamp, Version, Cursor, ChangeToken.`,
                Location: `metadata.IO[${ioName}].IncrementalWatermarkType`,
                SuggestedFix: `IncrementalWatermarkType must match WatermarkService.ValidateWatermark enum.`,
            });
            continue;
        }

        // (2) Named IOF must exist
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const cursorIOF = iofs.find((iof) => iof.fields.Name === cursorFieldName);
        if (!cursorIOF) {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' declares IncrementalCursorFieldName='${cursorFieldName}' but no IOF with that Name exists on this IO.`,
                Location: `metadata.IO[${ioName}].IncrementalCursorFieldName`,
                SuggestedFix: `Verify the extractor emitted an IOF row with Name='${cursorFieldName}', or update IncrementalCursorFieldName to match an existing IOF.`,
            });
            continue;
        }

        // (3) IOF.Type compatible with IncrementalWatermarkType
        const iofType = cursorIOF.fields['Type'];
        if (typeof iofType !== 'string' || iofType === '') {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Warning',
                Failure: `IO '${ioName}' IncrementalCursorFieldName '${cursorFieldName}' has no Type — cannot verify watermark compatibility.`,
                Location: `metadata.IO[${ioName}].IOF[${cursorFieldName}].Type`,
                SuggestedFix: `Ensure the extractor populates Type on every IOF; without it, validator can't enforce IOF/watermark compatibility.`,
            });
            continue;
        }
        const compatible = COMPATIBLE_IOF_TYPES[watermarkType as WatermarkType];
        if (!compatible.has(iofType.toLowerCase())) {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Error',
                Failure: `IO '${ioName}' IncrementalWatermarkType='${watermarkType}' is incompatible with IOF '${cursorFieldName}' (Type='${iofType}'). Allowed IOF types for ${watermarkType}: ${[...compatible].join(', ')}.`,
                Location: `metadata.IO[${ioName}].IOF[${cursorFieldName}].Type`,
                SuggestedFix: `Either change IncrementalWatermarkType to a category that matches IOF Type, or pick a different IOF as the cursor (one with the right Type).`,
            });
        }

        // Cross-check: the cursor IOF should be marked IsIncrementalCursorCandidate=true
        const isCandidate = cursorIOF.fields['IsIncrementalCursorCandidate'];
        if (isCandidate !== true) {
            failures.push({
                InvariantNumber: 6,
                Severity: 'Warning',
                Failure: `IO '${ioName}' uses IOF '${cursorFieldName}' as incremental cursor but IsIncrementalCursorCandidate=false on that IOF.`,
                Location: `metadata.IO[${ioName}].IOF[${cursorFieldName}].IsIncrementalCursorCandidate`,
                SuggestedFix: `If the IOF is genuinely the cursor, set IsIncrementalCursorCandidate=true with provenance citing the source signal. Otherwise pick a different IOF.`,
            });
        }
    }

    const hardErrors = failures.filter((f) => f.Severity === 'Error');
    return { Status: hardErrors.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}
