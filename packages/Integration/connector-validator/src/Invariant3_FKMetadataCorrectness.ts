/**
 * Invariant 3: every IOF with RelatedIntegrationObjectID (typically a
 * @lookup: reference) resolves to a real IO in the same metadata file, AND
 * the RelatedIntegrationObjectFieldName matches a real IOF on that target IO.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17.4
 */
import type { MetadataFile, FailureDetail } from './types.js';

type IOEntry = NonNullable<MetadataFile['relatedEntities']>['MJ: Integration Objects'] extends Array<infer T> | undefined ? T : never;

export function CheckInvariant3(
    metadata: MetadataFile
): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];
    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];

    const ioByName = new Map<string, IOEntry>();
    for (const io of ios) {
        ioByName.set(io.fields.Name.toLowerCase(), io);
    }

    for (const io of ios) {
        const ioName = io.fields.Name;
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];

        for (const iof of iofs) {
            const iofName = iof.fields.Name;
            const relatedID = iof.fields.RelatedIntegrationObjectID;
            const relatedFieldName = iof.fields.RelatedIntegrationObjectFieldName;
            if (!relatedID && !relatedFieldName) continue;

            // Extract target IO name from @lookup: reference syntax
            let targetIOName: string | null = null;
            if (typeof relatedID === 'string' && relatedID.startsWith('@lookup:MJ: Integration Objects.Name=')) {
                targetIOName = relatedID.split('Name=')[1].split('&')[0];
            }

            if (!targetIOName) {
                failures.push({
                    InvariantNumber: 3,
                    Severity: 'Error',
                    Failure: `IOF '${ioName}.${iofName}' has RelatedIntegrationObjectID '${relatedID ?? ''}' but cannot resolve target IO name from @lookup: reference.`,
                    Location: `metadata.IO[${ioName}].IOF[${iofName}].RelatedIntegrationObjectID`,
                    SuggestedFix: `Use @lookup: syntax: '@lookup:MJ: Integration Objects.Name=<TargetObjectName>&IntegrationID=@parent:ID' OR omit FK if not provable.`,
                });
                continue;
            }

            const targetIO = ioByName.get(targetIOName.toLowerCase());
            if (!targetIO) {
                failures.push({
                    InvariantNumber: 3,
                    Severity: 'Error',
                    Failure: `IOF '${ioName}.${iofName}' references RelatedIO '${targetIOName}' but no such IO exists in metadata.`,
                    Location: `metadata.IO[${ioName}].IOF[${iofName}].RelatedIntegrationObjectID`,
                    SuggestedFix: `Either add the target IO to metadata or remove the FK reference.`,
                });
                continue;
            }

            if (relatedFieldName) {
                const targetIOFs = targetIO.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
                const found = targetIOFs.some((t) => t.fields.Name.toLowerCase() === relatedFieldName.toLowerCase());
                if (!found) {
                    failures.push({
                        InvariantNumber: 3,
                        Severity: 'Error',
                        Failure: `IOF '${ioName}.${iofName}' points to '${targetIOName}.${relatedFieldName}' but that field doesn't exist on target.`,
                        Location: `metadata.IO[${ioName}].IOF[${iofName}].RelatedIntegrationObjectFieldName`,
                        SuggestedFix: `Either correct the field name OR remove the FK reference.`,
                    });
                }
            } else {
                failures.push({
                    InvariantNumber: 3,
                    Severity: 'Warning',
                    Failure: `IOF '${ioName}.${iofName}' has RelatedIntegrationObjectID but no RelatedIntegrationObjectFieldName.`,
                    Location: `metadata.IO[${ioName}].IOF[${iofName}].RelatedIntegrationObjectFieldName`,
                    SuggestedFix: `Specify which field on the target IO this FK points to (typically the target's PK).`,
                });
            }
        }
    }

    const errors = failures.filter((f) => f.Severity === 'Error');
    return { Status: errors.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}
