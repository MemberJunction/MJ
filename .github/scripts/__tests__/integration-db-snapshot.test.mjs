/**
 * Pins the SQL Server DB snapshot reuse and first-run scheduled job pre-bake in integration.yml.
 *
 * Ensures:
 *  - integration-sqlserver, cross-server-invalidation, and codegen-drift restore a cached DB
 *    snapshot via ./.github/actions/restore-sqlserver-db-snapshot.
 *  - codegen-drift strictly uses variant: base (never `full`, so optional test fixtures and
 *    ScheduledJobRun rows never pollute CodeGen output).
 *  - integration-sqlserver pre-runs first-run scheduled jobs before snapshotting `full` v4.
 *  - Snapshot saves are restricted to push/schedule backstops (never pull_request).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GITHUB_DIR = resolve(HERE, '..', '..');
const integrationText = readFileSync(resolve(GITHUB_DIR, 'workflows', 'integration.yml'), 'utf8');
const actionText = readFileSync(
    resolve(GITHUB_DIR, 'actions', 'restore-sqlserver-db-snapshot', 'action.yml'),
    'utf8',
);

function jobBlock(name) {
    const start = integrationText.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name} must exist in integration.yml`).toBeGreaterThan(-1);
    const rest = integrationText.slice(start + 1);
    const nextMatch = rest.slice(10).search(/\n  [a-z0-9_-]+:\n/);
    return nextMatch === -1 ? rest : rest.slice(0, nextMatch + 10);
}

describe('integration.yml — SQL Server DB snapshot reuse & vector-sync pre-bake', () => {
    it('defines distinct cache namespaces for full (v4) and base (v1) variants in the composite action', () => {
        expect(actionText).toContain('VERSION_TAG="mj-ci-db-v4"');
        expect(actionText).toContain('VERSION_TAG="mj-ci-db-base-v1"');
        // Base variant must never hash metadata-optional (so test edits do not bust CodeGen drift's DB cache).
        expect(actionText).toMatch(/TREE_LIST=\(migrations metadata packages\/MJCLI\/src packages\/MetadataSync\/src\)/);
    });

    it('integration-sqlserver uses variant: full, pre-bakes first-run jobs before snapshotting, and saves only on backstops', () => {
        const block = jobBlock('integration-sqlserver');
        expect(block).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(block).toMatch(/variant:\s*full/);
        const prebakeIdx = block.indexOf('name: Pre-run first-run scheduled jobs for the snapshot');
        const snapIdx = block.indexOf('name: Snapshot the provisioned DB');
        const saveIdx = block.indexOf('name: Save the provisioned-DB snapshot');
        expect(prebakeIdx).toBeGreaterThan(-1);
        expect(snapIdx).toBeGreaterThan(prebakeIdx);
        expect(saveIdx).toBeGreaterThan(snapIdx);
        expect(block.slice(snapIdx, saveIdx)).toContain("steps.prebake.outcome == 'success'");
        expect(block.slice(saveIdx, saveIdx + 400)).toContain("github.event_name == 'push' || github.event_name == 'schedule'");
    });

    it('cross-server-invalidation restores variant: full and never saves snapshots', () => {
        const block = jobBlock('cross-server-invalidation');
        expect(block).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(block).toMatch(/variant:\s*full/);
        expect(block).not.toContain('actions/cache/save@');
    });

    it('codegen-drift restores variant: base (not full) and saves base only on push/schedule before codegen runs', () => {
        const block = jobBlock('codegen-drift');
        expect(block).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(block).toMatch(/variant:\s*base/);
        expect(block).not.toMatch(/variant:\s*full/);
        const saveIdx = block.indexOf('name: Save the base DB snapshot');
        const codegenIdx = block.indexOf('name: Run CodeGen against the migrated DB');
        expect(saveIdx).toBeGreaterThan(-1);
        expect(codegenIdx).toBeGreaterThan(saveIdx);
        expect(block.slice(saveIdx, saveIdx + 400)).toContain("github.event_name == 'push' || github.event_name == 'schedule'");
    });
});
