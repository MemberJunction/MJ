/**
 * Invariant 1: every hard constraint emitted in metadata has a provenance entry
 * OR a code-evidence entry supporting it. No reasoning-only emissions.
 *
 * Hard constraints scanned: IsPrimaryKey=true, IsRequired=true, FK refs on IOFs;
 * SupportsWrite=true on IOs; CredentialTypeID, BatchMaxRequestCount,
 * BatchRequestWaitTime on integration root.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17.2
 */
import type { MetadataFile, ProvenanceFile, CodeEvidenceFile, FailureDetail } from './types.js';

export function CheckInvariant1(
    metadata: MetadataFile,
    provenance: ProvenanceFile,
    codeEvidence: CodeEvidenceFile
): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];
    const provenanceFields = new Set(provenance.Entries.map((e) => e.TargetField));
    const codeEvidenceFields = new Set(codeEvidence.Entries.map((e) => e.TargetField));
    const hasEvidence = (field: string): boolean =>
        provenanceFields.has(field) || codeEvidenceFields.has(field);

    // Root-level hard constraints — expanded per requirements §7.4
    // Each entry: { field, predicate: (value) => triggers-the-check }
    type RootHardConstraint = { field: string; triggers: (v: unknown) => boolean };
    const rootHardConstraints: RootHardConstraint[] = [
        // Original baseline:
        { field: 'CredentialTypeID',           triggers: (v) => v != null && v !== '' },
        { field: 'BatchMaxRequestCount',       triggers: (v) => v != null },
        { field: 'BatchRequestWaitTime',       triggers: (v) => v != null },
        // Framework expansion (§7.4 + §4.1):
        { field: 'IncrementalSyncCapability',  triggers: (v) => v != null && v !== '' },
        { field: 'IncrementalQueryParamName',  triggers: (v) => v != null && v !== '' },
        { field: 'WebhooksAvailable',          triggers: (v) => v === true },
        { field: 'WebhookSignatureAlgorithm',  triggers: (v) => v != null && v !== '' && v !== 'none' },
        { field: 'BulkOperationsAvailable',    triggers: (v) => v === true },
        { field: 'CustomObjectMarkerPattern',  triggers: (v) => v != null && v !== '' && v !== 'none' },
        { field: 'CustomFieldMarkerPattern',   triggers: (v) => v != null && v !== '' && v !== 'none' },
        { field: 'APIVersioningStrategy',      triggers: (v) => v != null && v !== '' && v !== 'none' },
        { field: 'TokenRefreshStrategy',       triggers: (v) => v != null && v !== '' && v !== 'none' },
        { field: 'AuthHeaderPattern',          triggers: (v) => v != null && v !== '' && v !== 'none-uses-query' },
        { field: 'ErrorResponseShape',         triggers: (v) => v != null && v !== '' },
    ];

    for (const c of rootHardConstraints) {
        const value = (metadata.fields as Record<string, unknown>)[c.field];
        if (!c.triggers(value)) continue;
        if (!hasEvidence(`integration.${c.field}`)) {
            failures.push({
                InvariantNumber: 1,
                Severity: 'Error',
                Failure: `Root field '${c.field}' has value '${String(value)}' but no provenance or code-evidence entry.`,
                Location: `metadata.fields.${c.field}`,
                SuggestedFix: `Add a provenance entry to PROVENANCE.json with TargetField='integration.${c.field}' citing the source where this value was determined.`,
            });
        }
    }

    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];

    // IO-level hard constraints
    type IOHardConstraint = { field: string; triggers: (v: unknown) => boolean };
    const ioHardConstraints: IOHardConstraint[] = [
        { field: 'SupportsWrite',           triggers: (v) => v === true },
        { field: 'IsBidirectional',         triggers: (v) => v === true },
        { field: 'SupportsIncrementalSync', triggers: (v) => v === true },
        { field: 'IncrementalCursorFieldName', triggers: (v) => v != null && v !== '' },
        { field: 'IncrementalWatermarkType', triggers: (v) => v != null && v !== '' },
        { field: 'IsCustomObject',          triggers: (v) => v === true },
        { field: 'BulkAPIPath',             triggers: (v) => v != null && v !== '' },
    ];

    // IOF-level hard constraints
    type IOFHardConstraint = { field: string; triggers: (v: unknown) => boolean };
    const iofHardConstraints: IOFHardConstraint[] = [
        { field: 'IsPrimaryKey',                triggers: (v) => v === true },
        { field: 'IsRequired',                  triggers: (v) => v === true },
        { field: 'RelatedIntegrationObjectID',  triggers: (v) => v != null && v !== '' },
        { field: 'IsAPIWritable',               triggers: (v) => v === true },
        { field: 'IsForeignKey',                triggers: (v) => v === true },
        { field: 'FKDetectionMethod',           triggers: (v) => v != null && v !== '' && v !== 'unknown' },
        { field: 'IsCustomField',               triggers: (v) => v === true },
        { field: 'IsIncrementalCursorCandidate',triggers: (v) => v === true },
    ];

    for (const io of ios) {
        const ioName = io.fields.Name;
        const ioFields = io.fields as Record<string, unknown>;
        for (const c of ioHardConstraints) {
            const value = ioFields[c.field];
            if (!c.triggers(value)) continue;
            if (!hasEvidence(`io.${ioName}.${c.field}`)) {
                failures.push({
                    InvariantNumber: 1,
                    Severity: 'Error',
                    Failure: `IO '${ioName}' has ${c.field}='${String(value)}' but no evidence.`,
                    Location: `metadata.IO[${ioName}].${c.field}`,
                    SuggestedFix: `Add a provenance or code-evidence entry citing vendor docs/source that establishes this value, OR set the field to its safe default (false/null).`,
                });
            }
        }

        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        for (const iof of iofs) {
            const iofName = iof.fields.Name;
            const fieldKey = `iof.${ioName}.${iofName}`;
            const iofFields = iof.fields as Record<string, unknown>;
            for (const c of iofHardConstraints) {
                const value = iofFields[c.field];
                if (!c.triggers(value)) continue;
                if (!hasEvidence(`${fieldKey}.${c.field}`)) {
                    failures.push({
                        InvariantNumber: 1,
                        Severity: 'Error',
                        Failure: `IOF '${ioName}.${iofName}' has ${c.field}='${String(value)}' but no evidence.`,
                        Location: `metadata.IO[${ioName}].IOF[${iofName}].${c.field}`,
                        SuggestedFix: `Add a provenance or code-evidence entry citing the source signal that establishes this flag, OR set the field to its safe default.`,
                    });
                }
            }
        }
    }

    return { Status: failures.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}
