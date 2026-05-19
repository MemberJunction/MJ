#!/usr/bin/env node
/**
 * Five-invariant validator CLI entry point.
 *
 * Usage:
 *   mj-validate-invariants <connector-name> [<registry-root>]
 *
 * Exit codes:
 *   0 — Overall=Pass (all invariants Pass; warnings only)
 *   1 — Overall=Fail (one or more invariants Fail)
 *   2 — Bad invocation (missing args)
 *
 * Invariants checked (per INTEGRATION-REDESIGN-V1.md §12 — "no new invariants
 * beyond the original 5"):
 *   1   — Provable-only (every hard-constraint field has provenance)
 *   1b  — Script inspection (CODE_EVIDENCE URLs actually fetched)
 *   2   — Three-way name match
 *   3   — FK metadata correctness
 *   4   — Capability ↔ method existence
 *
 * Output: structured JSON {@link InvariantValidationResult} on stdout.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CheckInvariant1 } from './Invariant1_ProvableOnly.js';
import { CheckInvariant2 } from './Invariant2_ThreeWayNameMatch.js';
import { CheckInvariant3 } from './Invariant3_FKMetadataCorrectness.js';
import { CheckInvariant4 } from './Invariant4_CapabilityMethodMatch.js';
import { CheckScriptInspection } from './InvariantScriptInspection.js';
import { CheckUnresolvedEmissions } from './CheckUnresolvedEmissions.js';
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
    // Locate the extractor script. Both `.ts` and `.mts` are valid — the
    // strategy library's package.json `exports` field requires `.mts` for
    // tsx to resolve subpath imports in some Node versions, so the agent
    // legitimately picks either extension. We prefer `.ts` then `.mts`;
    // if neither exists, pass the `.ts` path through so I1b can emit its
    // "script absent + fabrication" error against a deterministic path.
    const extractorScriptPath = ResolveExtractorScriptPath(connectorDir);

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
    const rUE = CheckUnresolvedEmissions(metadata);

    const allFailures = [
        ...r1.Failures, ...r1b.Failures, ...r2.Failures, ...r3.Failures, ...r4.Failures,
        ...rUE.Failures,
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
        Check_UnresolvedEmissions: rUE.Status,
        FailureDetails: errors,
        WarningDetails: warnings,
        Overall: errors.length === 0 ? 'Pass' : 'Fail',
        ValidatedAt: new Date().toISOString(),
    };
}

/**
 * Resolves the connector's extractor script path. Tries `extract-io-iof.ts`
 * first, falls back to `extract-io-iof.mts`. The `.mts` variant is required
 * by some tsx/ESM setups when the script imports from packages whose
 * `package.json` declares `"type": "module"` + subpath exports.
 *
 * Returns the resolved existing path if found; otherwise returns the
 * canonical `.ts` path so downstream invariants (specifically Invariant 1b)
 * surface a deterministic "script absent" error.
 */
export function ResolveExtractorScriptPath(connectorDir: string): string {
    const tsPath = resolve(connectorDir, 'scripts', 'extract-io-iof.ts');
    if (existsSync(tsPath)) return tsPath;
    const mtsPath = resolve(connectorDir, 'scripts', 'extract-io-iof.mts');
    if (existsSync(mtsPath)) return mtsPath;
    return tsPath;
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

/**
 * Detect whether this module is the process's entry point.
 *
 * The naive check `import.meta.url === \`file://${process.argv[1]}\`` is BROKEN
 * when the CLI is invoked through npm's bin symlink (or `npx`): `import.meta.url`
 * points at the resolved file (after npm resolves the symlink), while
 * `process.argv[1]` is the symlink path itself. The two strings never match,
 * the CLI body silently doesn't run, and the process exits 0 — which made the
 * mj-test-runner MCP report `T1_InvariantValidator: Pass` on connectors that
 * actually failed validation. Clean-build verification surfaced this.
 *
 * Fix: resolve symlinks on both sides via `realpathSync` and compare absolute
 * filesystem paths.
 */
export function IsCLIEntryPoint(metaURL: string, argv1: string | undefined): boolean {
    if (!argv1) return false;
    try {
        const thisFile = realpathSync(fileURLToPath(metaURL));
        const entryFile = realpathSync(argv1);
        return thisFile === entryFile;
    } catch {
        return false;
    }
}

// CLI entry — runs when invoked directly (not when imported)
if (IsCLIEntryPoint(import.meta.url, process.argv[1])) {
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
