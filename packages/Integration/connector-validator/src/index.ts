#!/usr/bin/env node
/**
 * Eight-invariant validator CLI entry point.
 *
 * Usage:
 *   mj-validate-invariants <connector-name> [<registry-root>]
 *
 * Exit codes:
 *   0 — Overall=Pass (all 8 invariants Pass; warnings only)
 *   1 — Overall=Fail (one or more invariants Fail)
 *   2 — Bad invocation (missing args)
 *
 * Invariants checked:
 *   1   — Provable-only (every hard-constraint field has provenance)
 *   1b  — Script inspection (CODE_EVIDENCE URLs actually fetched)
 *   2   — Three-way name match
 *   3   — FK metadata correctness
 *   4   — Capability ↔ method existence
 *   5   — Hierarchy validity (new — parent refs, traversal order)
 *   6   — Incremental sync consistency (new — cursor field, watermark type)
 *   7   — CRUD bodies real (new — non-stub via ts-morph)
 *
 * Output: structured JSON {@link InvariantValidationResult} on stdout.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CheckInvariant1 } from './Invariant1_ProvableOnly.js';
import { CheckInvariant2 } from './Invariant2_ThreeWayNameMatch.js';
import { CheckInvariant3 } from './Invariant3_FKMetadataCorrectness.js';
import { CheckInvariant4 } from './Invariant4_CapabilityMethodMatch.js';
import { CheckScriptInspection } from './InvariantScriptInspection.js';
import { CheckHierarchyValidity } from './Invariant5_HierarchyValidity.js';
import { CheckIncrementalConsistency } from './Invariant6_IncrementalConsistency.js';
import { CheckCRUDBodiesReal } from './Invariant7_CRUDBodiesReal.js';
import type {
    InvariantValidationResult,
    MetadataFile,
    ProvenanceFile,
    CodeEvidenceFile,
} from './types.js';

export function ValidateInvariants(connectorName: string, registryRoot: string): InvariantValidationResult {
    const connectorDir = resolve(registryRoot, connectorName);
    const metadataPath = resolve(connectorDir, `metadata/integrations/.${connectorName}.json`);
    const provenancePath = resolve(connectorDir, 'PROVENANCE.json');
    const codeEvidencePath = resolve(connectorDir, 'CODE_EVIDENCE.json');
    const extractorScriptPath = resolve(connectorDir, 'scripts', 'extract-io-iof.ts');

    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as MetadataFile;
    const provenance: ProvenanceFile = existsOr(provenancePath, { Entries: [] });
    const codeEvidence: CodeEvidenceFile = existsOr(codeEvidencePath, { Entries: [] });

    // Derive the expected connector TS path from the metadata's ClassName field
    // (which is set verbatim from Phase 1's brand-researcher output). Falling back
    // to `capitalize(connectorName)` only when ClassName is unreadable produces
    // wrong results for multi-word brands (e.g. yourmembership → Yourmembership
    // instead of the actual YourMembership). The metadata holds the source of truth.
    const className =
        typeof metadata.fields?.ClassName === 'string' && metadata.fields.ClassName.length > 0
            ? metadata.fields.ClassName
            : `${capitalize(connectorName)}Connector`;
    const connectorTsPath = resolve(connectorDir, 'src', `${className}.ts`);

    const r1 = CheckInvariant1(metadata, provenance, codeEvidence);
    const r1b = CheckScriptInspection(extractorScriptPath, codeEvidence);
    const r2 = CheckInvariant2(metadata, connectorTsPath);
    const r3 = CheckInvariant3(metadata);
    const r4 = CheckInvariant4(metadata, connectorTsPath);
    const r5 = CheckHierarchyValidity(metadata);
    const r6 = CheckIncrementalConsistency(metadata);
    const r7 = CheckCRUDBodiesReal(connectorTsPath, metadata);

    const allFailures = [
        ...r1.Failures, ...r1b.Failures, ...r2.Failures, ...r3.Failures,
        ...r4.Failures, ...r5.Failures, ...r6.Failures, ...r7.Failures,
    ];
    const errors = allFailures.filter((f) => f.Severity === 'Error');
    const warnings = allFailures.filter((f) => f.Severity === 'Warning');

    return {
        ConnectorName: connectorName,
        Invariant1_ProvableOnly: r1.Status,
        Invariant1b_ScriptInspection: r1b.Status,
        Invariant2_ThreeWayNameMatch: r2.Status,
        Invariant3_FKMetadataCorrectness: r3.Status,
        Invariant4_CapabilityMethodMatch: r4.Status,
        Invariant5_HierarchyValidity: r5.Status,
        Invariant6_IncrementalConsistency: r6.Status,
        Invariant7_CRUDBodiesReal: r7.Status,
        FailureDetails: errors,
        WarningDetails: warnings,
        Overall: errors.length === 0 ? 'Pass' : 'Fail',
        ValidatedAt: new Date().toISOString(),
    };
}

function existsOr<T>(path: string, fallback: T): T {
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

function capitalize(s: string): string {
    return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// CLI entry — runs when invoked directly (not when imported)
if (import.meta.url === `file://${process.argv[1]}`) {
    const connectorName = process.argv[2];
    const registryRoot = process.argv[3] ?? resolve(process.cwd(), 'packages/Integration/connectors-registry');
    if (!connectorName) {
        process.stderr.write('Usage: mj-validate-invariants <connector-name> [<registry-root>]\n');
        process.exit(2);
    }
    const result = ValidateInvariants(connectorName, registryRoot);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.Overall === 'Pass' ? 0 : 1);
}

export type {
    InvariantValidationResult,
    FailureDetail,
    InvariantResult,
    MetadataFile,
    ProvenanceFile,
    CodeEvidenceFile,
} from './types.js';
