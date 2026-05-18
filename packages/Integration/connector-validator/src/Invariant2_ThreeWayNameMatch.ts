/**
 * Invariant 2: connector.IntegrationName getter === MJ: Integrations.Name
 * === every emitted Action's Config.IntegrationName.
 *
 * Legs 1+2 are checked statically here; the third leg (Actions) is enforced
 * post-install when the action generator runs.
 *
 * @see INTEGRATION-AGENT-TODO.md §2.17.3
 */
import { Project } from 'ts-morph';
import type { MetadataFile, FailureDetail } from './types.js';

export function CheckInvariant2(
    metadata: MetadataFile,
    connectorTsPath: string
): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];
    const metadataName = metadata.fields.Name;
    const metadataClassName = metadata.fields.ClassName;

    let project: Project;
    try {
        project = new Project({ skipAddingFilesFromTsConfig: true });
        project.addSourceFileAtPath(connectorTsPath);
    } catch (err: unknown) {
        failures.push({
            InvariantNumber: 2,
            Severity: 'Error',
            Failure: `Cannot read connector TS file at ${connectorTsPath}: ${err instanceof Error ? err.message : String(err)}`,
            Location: connectorTsPath,
            SuggestedFix: `Verify the file exists. Expected path: <connector-dir>/src/<ConnectorName>Connector.ts`,
        });
        return { Status: 'Fail', Failures: failures };
    }

    const sourceFile = project.getSourceFile(connectorTsPath)!;
    const classes = sourceFile.getClasses();
    let foundIntegrationName: string | null = null;
    let registeredClassName: string | null = null;

    for (const cls of classes) {
        const getter = cls.getGetAccessor('IntegrationName');
        if (getter) {
            const body = getter.getBodyText() ?? '';
            const match = body.match(/return\s+['"`]([^'"`]+)['"`]/);
            if (match) foundIntegrationName = match[1];
        }
        const decorators = cls.getDecorators();
        for (const dec of decorators) {
            if (dec.getName() === 'RegisterClass') {
                const args = dec.getArguments();
                if (args.length >= 2) {
                    const secondArg = args[1].getText();
                    const m = secondArg.match(/['"`]([^'"`]+)['"`]/);
                    if (m) registeredClassName = m[1];
                }
            }
        }
    }

    if (!foundIntegrationName) {
        failures.push({
            InvariantNumber: 2,
            Severity: 'Error',
            Failure: `Connector class in ${connectorTsPath} does not override IntegrationName getter.`,
            Location: connectorTsPath,
            SuggestedFix: `Add: public override get IntegrationName(): string { return '${metadataName}'; }`,
        });
    } else if (foundIntegrationName !== metadataName) {
        failures.push({
            InvariantNumber: 2,
            Severity: 'Error',
            Failure: `IntegrationName getter returns '${foundIntegrationName}' but metadata.Name is '${metadataName}'.`,
            Location: connectorTsPath,
            SuggestedFix: `Make connector.IntegrationName return '${metadataName}' exactly.`,
        });
    }

    if (!registeredClassName) {
        failures.push({
            InvariantNumber: 2,
            Severity: 'Error',
            Failure: `Connector class is not decorated with @RegisterClass(BaseIntegrationConnector, '...').`,
            Location: connectorTsPath,
            SuggestedFix: `Add @RegisterClass(BaseIntegrationConnector, '${metadataClassName}') above the class declaration.`,
        });
    } else if (registeredClassName !== metadataClassName) {
        failures.push({
            InvariantNumber: 2,
            Severity: 'Error',
            Failure: `@RegisterClass registered as '${registeredClassName}' but metadata.ClassName is '${metadataClassName}'.`,
            Location: connectorTsPath,
            SuggestedFix: `Update @RegisterClass second arg to '${metadataClassName}'.`,
        });
    }

    return { Status: failures.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}
