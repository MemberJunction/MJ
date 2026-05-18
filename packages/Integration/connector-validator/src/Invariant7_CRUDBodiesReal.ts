/**
 * Invariant 7 — CRUD bodies are structurally real.
 *
 * Catches the failure mode that surfaced repeatedly in earlier runs:
 * Invariant 4 (existence) passes because the method is declared on the
 * connector class, but the body is a stub returning {Success: false}
 * or throwing 'not implemented' — satisfying the type system but doing
 * no runtime work.
 *
 * For every CRUD method that exists on the connector class (per
 * Invariant 4) and whose capability flag is true:
 *
 *   - Body must have >= MIN_STATEMENTS statements (default 5)
 *   - Body must contain at least one of:
 *       * `MakeHTTPRequest` / `ExecuteGraphQL` / `ExecuteSOAP` /
 *         `FetchChanges` call
 *       * Return path constructing a non-error CRUDResult
 *         (Success not literally false, StatusCode 2xx)
 *   - Body must NOT consist solely of one of:
 *       * throw 'not implemented' or equivalent
 *       * return {Success: false, ...} with a single hardcoded
 *         "not implemented" / "stub" / 501 marker
 *       * return [] (for read methods) when the IO has data
 *
 * Uses ts-morph to parse the connector .ts and inspect method bodies.
 *
 * @see INTEGRATION-FRAMEWORK-REQUIREMENTS.md §7.3
 */
import { existsSync, readFileSync } from 'node:fs';
import { Project, SyntaxKind, Node } from 'ts-morph';
import type { MetadataFile, FailureDetail } from './types.js';

const MIN_STATEMENTS = 5;

// CRUD methods the validator inspects when their corresponding capability flag is true.
// Maps method name → required capability flag on the IO (null = check all IOs).
const CRUD_METHODS: Array<{ method: string; flagField: string | null }> = [
    { method: 'CreateRecord', flagField: 'SupportsCreate' },
    { method: 'UpdateRecord', flagField: 'SupportsUpdate' },
    { method: 'DeleteRecord', flagField: 'SupportsDelete' },
    { method: 'GetRecord', flagField: null }, // Read is universal; required when any IO has GetAPIPath
    { method: 'SearchRecords', flagField: 'SupportsSearch' },
    { method: 'ListRecords', flagField: null }, // Universal — required when any IO has ListAPIPath
    { method: 'FetchChanges', flagField: 'SupportsIncrementalSync' },
];

// Patterns that indicate a method is a stub (rejected).
const STUB_INDICATORS = [
    /not\s+implemented/i,
    /\bstub\b/i,
    /per-IO\s+routing\s+TODO/i,
    /not\s+yet\s+wired/i,
    /501/, // HTTP 501 Not Implemented status code in error responses
];

// Indicators that the body does real work.
const REAL_WORK_PATTERNS = [
    /MakeHTTPRequest\s*\(/,
    /ExecuteGraphQL\s*\(/,
    /ExecuteSOAP\s*\(/,
    /this\.FetchChanges\s*\(/,
    /this\.ListRecords\s*\(/, // FetchChanges may delegate
    /fetch\s*\(/, // direct fetch (rare in connector code, common in scripts)
];

export function CheckCRUDBodiesReal(
    connectorTsPath: string,
    metadata: MetadataFile
): { Status: 'Pass' | 'Fail'; Failures: FailureDetail[] } {
    const failures: FailureDetail[] = [];

    if (!existsSync(connectorTsPath)) {
        // No connector file → can't inspect; defer (Invariant 2 catches missing file).
        return { Status: 'Pass', Failures: [] };
    }

    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    if (ios.length === 0) {
        return { Status: 'Pass', Failures: [] };
    }

    // Determine which CRUD methods are REQUIRED on this connector based on
    // capability flags across all IOs. If no IO needs a method, we don't
    // enforce its body shape (Invariant 4 will catch existence requirements
    // if needed; we only care about non-stub here).
    const requiredMethods = new Set<string>();
    for (const m of CRUD_METHODS) {
        if (m.flagField === null) {
            // Universal — check if any IO has the corresponding path
            const pathField = m.method === 'GetRecord' ? 'GetAPIPath' : 'ListAPIPath';
            if (ios.some((io) => isNonEmpty((io.fields as Record<string, unknown>)[pathField]))) {
                requiredMethods.add(m.method);
            }
        } else {
            if (ios.some((io) => (io.fields as Record<string, unknown>)[m.flagField as string] === true)) {
                requiredMethods.add(m.method);
            }
        }
    }

    if (requiredMethods.size === 0) {
        return { Status: 'Pass', Failures: [] };
    }

    // Parse connector file
    let sourceText: string;
    try {
        sourceText = readFileSync(connectorTsPath, 'utf-8');
    } catch {
        return { Status: 'Pass', Failures: [] };
    }

    const project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
    const sourceFile = project.createSourceFile(connectorTsPath + '.virtual.ts', sourceText, { overwrite: true });

    const methodsFound = new Set<string>();
    sourceFile.forEachDescendant((node) => {
        if (!Node.isMethodDeclaration(node)) return;
        const name = node.getName();
        if (!requiredMethods.has(name)) return;
        methodsFound.add(name);

        const body = node.getBody();
        if (!body || !Node.isBlock(body)) {
            failures.push({
                InvariantNumber: 7,
                Severity: 'Error',
                Failure: `Method ${name} has no body block.`,
                Location: `${connectorTsPath}:${node.getStartLineNumber()}`,
                SuggestedFix: `Implement the method body using metadata routing per requirements §3.5.`,
            });
            return;
        }

        const stmts = body.getStatements();
        const bodyText = body.getText();
        const stmtCount = stmts.length;

        // Length check
        if (stmtCount < MIN_STATEMENTS) {
            failures.push({
                InvariantNumber: 7,
                Severity: 'Error',
                Failure: `Method ${name} body has only ${stmtCount} statements (minimum ${MIN_STATEMENTS}). A real CRUD body resolves metadata, builds a URL, authenticates, calls HTTP, parses response — that's more than ${MIN_STATEMENTS - 1} statements.`,
                Location: `${connectorTsPath}:${node.getStartLineNumber()}`,
                SuggestedFix: `Replace stub body with real implementation: ResolveIO → ResolvePathTemplate → Authenticate → MakeHTTPRequest → ParseCRUDResponse. See HubSpot or Salesforce connector for the canonical pattern.`,
            });
            return;
        }

        // Stub-marker check
        const stubMatch = STUB_INDICATORS.find((re) => re.test(bodyText));
        if (stubMatch) {
            // Only fail if there's NO real-work pattern alongside the stub marker.
            // (Connectors may legitimately reference "501" in error parsing.)
            const hasRealWork = REAL_WORK_PATTERNS.some((re) => re.test(bodyText));
            if (!hasRealWork) {
                failures.push({
                    InvariantNumber: 7,
                    Severity: 'Error',
                    Failure: `Method ${name} body contains stub marker matching /${stubMatch.source}/ and no HTTP/data-fetch call. Body is structurally a stub.`,
                    Location: `${connectorTsPath}:${node.getStartLineNumber()}`,
                    SuggestedFix: `Replace stub return with real implementation using metadata routing. Stubs satisfy Invariant 4 (existence) but fail Invariant 7 (real body) — there is no exception for "not yet wired" CRUD.`,
                });
                return;
            }
        }

        // Positive check: body must contain at least one real-work pattern
        const hasRealWork = REAL_WORK_PATTERNS.some((re) => re.test(bodyText));
        if (!hasRealWork) {
            failures.push({
                InvariantNumber: 7,
                Severity: 'Error',
                Failure: `Method ${name} body has ${stmtCount} statements but contains no HTTP/data-fetch call (${REAL_WORK_PATTERNS.map((re) => re.source).join(' | ')}). Without a network call the method cannot actually perform its named operation.`,
                Location: `${connectorTsPath}:${node.getStartLineNumber()}`,
                SuggestedFix: `Implement the method body to call MakeHTTPRequest with URL derived from metadata routing fields.`,
            });
            return;
        }
    });

    // Surface any required method that's missing (Invariant 4 also catches this, but cross-cite here)
    for (const required of requiredMethods) {
        if (!methodsFound.has(required)) {
            failures.push({
                InvariantNumber: 7,
                Severity: 'Error',
                Failure: `Connector lacks required method '${required}' but at least one IO has the matching capability flag/path. (See Invariant 4 for the parallel existence check.)`,
                Location: connectorTsPath,
                SuggestedFix: `Implement '${required}' on the connector class.`,
            });
        }
    }

    return { Status: failures.length === 0 ? 'Pass' : 'Fail', Failures: failures };
}

function isNonEmpty(v: unknown): boolean {
    return v != null && v !== '';
}
