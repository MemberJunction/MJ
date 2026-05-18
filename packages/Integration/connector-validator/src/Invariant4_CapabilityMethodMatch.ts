/**
 * Invariant 4: every IO declaring SupportsWrite=true must have the connector
 * class implement CreateRecord/UpdateRecord/DeleteRecord, with capability
 * getters overridden accordingly. Similarly for SupportsSearch/SupportsListing.
 *
 * Lightweight check — verifies methods are present + capability getters
 * resolve to `true`. Does NOT statically prove the method handles every
 * object's ObjectName (that's a runtime concern; Tier T2 covers it).
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17.5
 */
import { Project } from 'ts-morph';
import type { MetadataFile, FailureDetail } from './types.js';

export function CheckInvariant4(
    metadata: MetadataFile,
    connectorTsPath: string
): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];
    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const anyIOSupportsWrite = ios.some((io) => io.fields.SupportsWrite);

    let project: Project;
    try {
        project = new Project({ skipAddingFilesFromTsConfig: true });
        project.addSourceFileAtPath(connectorTsPath);
    } catch (err: unknown) {
        failures.push({
            InvariantNumber: 4,
            Severity: 'Error',
            Failure: `Cannot read connector TS file at ${connectorTsPath}: ${err instanceof Error ? err.message : String(err)}`,
            Location: connectorTsPath,
            SuggestedFix: `Verify the file exists.`,
        });
        return { Status: 'Fail', Failures: failures };
    }

    const sourceFile = project.getSourceFile(connectorTsPath)!;
    const classes = sourceFile.getClasses();
    if (classes.length === 0) {
        failures.push({
            InvariantNumber: 4,
            Severity: 'Error',
            Failure: `No class found in ${connectorTsPath}.`,
            Location: connectorTsPath,
            SuggestedFix: `Add the connector class.`,
        });
        return { Status: 'Fail', Failures: failures };
    }
    const cls = classes[0];

    const getCapability = (name: string): boolean | null => {
        const getter = cls.getGetAccessor(name);
        if (!getter) return null;
        const body = getter.getBodyText() ?? '';
        if (body.includes('return true')) return true;
        if (body.includes('return false')) return false;
        return null;
    };

    const methodExists = (name: string): boolean => cls.getMethod(name) != null;

    if (anyIOSupportsWrite) {
        const checks: Array<{ Capability: string; Method: string }> = [
            { Capability: 'SupportsCreate', Method: 'CreateRecord' },
            { Capability: 'SupportsUpdate', Method: 'UpdateRecord' },
            { Capability: 'SupportsDelete', Method: 'DeleteRecord' },
        ];

        for (const { Capability, Method } of checks) {
            const cap = getCapability(Capability);
            if (cap !== true) {
                failures.push({
                    InvariantNumber: 4,
                    Severity: 'Error',
                    Failure: `At least one IO has SupportsWrite=true but capability getter ${Capability} doesn't return true.`,
                    Location: connectorTsPath,
                    SuggestedFix: `Override ${Capability} getter to return true: public override get ${Capability}(): boolean { return true; }`,
                });
            }
            if (!methodExists(Method)) {
                failures.push({
                    InvariantNumber: 4,
                    Severity: 'Error',
                    Failure: `${Capability}=true but ${Method} method is not implemented; will throw "${Method} is not supported" at runtime.`,
                    Location: connectorTsPath,
                    SuggestedFix: `Implement public override async ${Method}(ctx) { ... } method.`,
                });
            }
        }
    }

    if (getCapability('SupportsSearch') === true && !methodExists('SearchRecords')) {
        failures.push({
            InvariantNumber: 4,
            Severity: 'Error',
            Failure: `SupportsSearch=true but SearchRecords method is not implemented.`,
            Location: connectorTsPath,
            SuggestedFix: `Implement SearchRecords method.`,
        });
    }

    if (getCapability('SupportsListing') === true && !methodExists('ListRecords')) {
        failures.push({
            InvariantNumber: 4,
            Severity: 'Error',
            Failure: `SupportsListing=true but ListRecords method is not implemented.`,
            Location: connectorTsPath,
            SuggestedFix: `Implement ListRecords method.`,
        });
    }

    return { Status: failures.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}
