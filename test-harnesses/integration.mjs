#!/usr/bin/env node
/**
 * Dual-DBMS integration test harness for Phase 0 MJ Docs Unification checks.
 *
 * Usage:
 *   node test-harnesses/integration.mjs --check record-artifact-permissions
 *   node test-harnesses/integration.mjs
 */

import { runRecordArtifactPermissionsCheck } from '../packages/IntegrationTests/checks/record-artifact-permissions.check.mjs';
import { runPromoteAndRecordDocsCheck } from '../packages/IntegrationTests/checks/promote-and-record-docs.check.mjs';
import { runDelegatedSearchAndCitationsCheck } from '../packages/IntegrationTests/checks/delegated-search-and-citations.check.mjs';

const CHECKS = {
    'record-artifact-permissions': runRecordArtifactPermissionsCheck,
    'promote-and-record-docs': runPromoteAndRecordDocsCheck,
    'delegated-search-and-citations': runDelegatedSearchAndCitationsCheck,
};

function parseArgs(argv) {
    const selected = [];
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--check' && argv[i + 1]) {
            selected.push(argv[i + 1]);
            i++;
        } else if (argv[i].startsWith('--check=')) {
            selected.push(argv[i].slice('--check='.length));
        }
    }
    return selected.length > 0 ? selected : Object.keys(CHECKS);
}

const selectedNames = parseArgs(process.argv);
const results = [];
let allPassed = true;

for (const name of selectedNames) {
    const fn = CHECKS[name];
    if (!fn) {
        console.error(`[integration-harness] Unknown check '${name}'. Available: ${Object.keys(CHECKS).join(', ')}`);
        process.exit(2);
    }
    try {
        const res = await fn();
        results.push(res);
    } catch (err) {
        allPassed = false;
        results.push({
            check: name,
            platform: (process.env.DB_PLATFORM ?? 'sqlserver').toLowerCase(),
            passed: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

console.log(
    JSON.stringify(
        {
            passed: allPassed,
            platform: (process.env.DB_PLATFORM ?? 'sqlserver').toLowerCase(),
            checksRun: results.length,
            checksPassed: results.filter((r) => r.passed).length,
            checksFailed: results.filter((r) => !r.passed).length,
            results,
        },
        null,
        2
    )
);

if (!allPassed) {
    process.exit(1);
}
