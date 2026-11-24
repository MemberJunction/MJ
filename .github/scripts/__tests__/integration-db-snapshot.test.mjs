/**
 * Pins the SQL Server DB snapshot reuse and first-run scheduled job pre-bake in integration.yml.
 *
 * Ensures:
 *  - integration-sqlserver, cross-server-invalidation, and codegen-drift restore a cached DB
 *    snapshot via ./.github/actions/restore-sqlserver-db-snapshot (which is strictly restore-only).
 *  - codegen-drift strictly uses variant: base (never `full`) and skips restore on PRs touching
 *    migrations/ or metadata/ so fresh-install coverage is preserved.
 *  - Nightly cold re-seeds save under a unique `-cold-<run_id>` key so they supersede earlier
 *    push snapshots instead of failing with a duplicate cache key.
 *  - integration-sqlserver resets baked vector-sync state on vector/scheduling PRs, pauses
 *    non-first-run cron jobs during pre-bake, and asserts zero held locks before BACKUP.
 *  - Snapshot saves are strictly restricted to push/schedule backstops (never pull_request).
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

/** Extract a single step block by exact `- name:` text from a job block. */
function stepBlock(jobText, stepName) {
    const marker = `      - name: ${stepName}\n`;
    const start = jobText.indexOf(marker);
    expect(start, `step "${stepName}" must exist`).toBeGreaterThan(-1);
    const rest = jobText.slice(start + marker.length);
    const nextIdx = rest.search(/\n      - /);
    return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

/** Extract the single `if:` line from a step block. */
function stepIfLine(stepText) {
    const m = /^ {8}if:\s*(.+?)\s*$/m.exec(stepText);
    expect(m, 'step must declare an if: guard').not.toBeNull();
    return m[1];
}

describe('integration.yml — SQL Server DB snapshot reuse & vector-sync pre-bake', () => {
    it('composite action is strictly restore-only, isolates full vs base, hashes all DB inputs, and emits unique cold save keys', () => {
        expect(actionText).not.toContain('actions/cache/save@');
        expect(actionText).toContain('VERSION_TAG="mj-ci-db-v4"');
        expect(actionText).toContain('VERSION_TAG="mj-ci-db-base-v1"');
        expect(actionText).toContain('SAVE_KEY="${KEY}-cold-${RUN_ID}"');
        expect(actionText).toContain('mj.config.cjs');
        expect(actionText).toContain('packages/SQLServerDataProvider/src');
        expect(actionText).toContain('.github/actions/restore-sqlserver-db-snapshot');
        expect(actionText).toContain('@memberjunction/skyway-core@');
        // Base variant block must never hash metadata-optional.
        const baseBranch = actionText.split('elif [ "$VARIANT" = "base" ]; then')[1].split('else')[0];
        expect(baseBranch).not.toContain('metadata-optional');
    });

    it('integration-sqlserver restores full, resets vector state on vector PRs, pre-bakes deterministically, and saves strictly on push/schedule', () => {
        const block = jobBlock('integration-sqlserver');
        const restoreStep = stepBlock(block, 'Restore SQL Server DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(/skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule'\s*\}\}/);

        // Vector/scheduling PRs must clear pre-baked vector rows so PR code runs Entity Vector Sync fresh.
        const resetStep = stepBlock(block, 'Reset baked vector-sync state on vector/scheduling PRs');
        expect(stepIfLine(resetStep)).toContain("needs.changes.outputs.vectors == 'true'");
        expect(resetStep).toContain('DELETE FROM [__mj].[EntityRecordDocument]');

        // Ordering: prebake -> snapshot -> save, with lock-free assertion and step-summary warning.
        const prebakeIdx = block.indexOf('name: Pre-run first-run scheduled jobs for the snapshot');
        const snapIdx = block.indexOf('name: Snapshot the provisioned DB');
        const saveIdx = block.indexOf('name: Save the provisioned-DB snapshot');
        expect(prebakeIdx).toBeGreaterThan(-1);
        expect(snapIdx).toBeGreaterThan(prebakeIdx);
        expect(saveIdx).toBeGreaterThan(snapIdx);

        const prebakeStep = stepBlock(block, 'Pre-run first-run scheduled jobs for the snapshot');
        expect(prebakeStep).toContain("SET [Status] = 'Paused'");
        expect(prebakeStep).toContain('WHERE [LockToken] IS NOT NULL');
        expect(prebakeStep).toContain("WHERE [Status] = 'Running'");
        expect(prebakeStep).toContain('GITHUB_STEP_SUMMARY');

        const snapStep = stepBlock(block, 'Snapshot the provisioned DB');
        expect(stepIfLine(snapStep)).toContain("steps.prebake.outcome == 'success'");

        const saveStep = stepBlock(block, 'Save the provisioned-DB snapshot');
        const saveIf = stepIfLine(saveStep);
        expect(saveIf).toMatch(
            /^\(github\.event_name == 'push' \|\| github\.event_name == 'schedule'\) && steps\.db\.outputs\.cache-hit != 'true' && steps\.dbsnapshot\.outcome == 'success'$/,
        );
        expect(saveIf).not.toMatch(/pull_request|workflow_dispatch/);
        expect(saveStep).toContain('key: ${{ steps.db.outputs.save-key }}');
    });

    it('cross-server-invalidation restores variant: full with nightly cold bypass and never saves snapshots', () => {
        const block = jobBlock('cross-server-invalidation');
        const restoreStep = stepBlock(block, 'Restore SQL Server DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(/skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule'\s*\}\}/);
        expect(block).not.toContain('actions/cache/save@');
    });

    it('codegen-drift restores variant: base, bypasses restore on migration/metadata PRs, and saves strictly on push/schedule before codegen', () => {
        const block = jobBlock('codegen-drift');
        const restoreStep = stepBlock(block, 'Restore SQL Server base DB snapshot and migrate');
        expect(restoreStep).toContain('uses: ./.github/actions/restore-sqlserver-db-snapshot');
        expect(restoreStep).toMatch(/variant:\s*base/);
        expect(block).not.toMatch(/variant:\s*full/);
        expect(restoreStep).toMatch(
            /skip-restore:\s*\$\{\{\s*github\.event_name == 'schedule' \|\| needs\.changes\.outputs\.migrations == 'true'\s*\}\}/,
        );

        const saveIdx = block.indexOf('name: Save the base DB snapshot');
        const codegenIdx = block.indexOf('name: Run CodeGen against the migrated DB');
        expect(saveIdx).toBeGreaterThan(-1);
        expect(codegenIdx).toBeGreaterThan(saveIdx);

        const saveStep = stepBlock(block, 'Save the base DB snapshot');
        const saveIf = stepIfLine(saveStep);
        expect(saveIf).toMatch(
            /^\(github\.event_name == 'push' \|\| github\.event_name == 'schedule'\) && steps\.db\.outputs\.cache-hit != 'true' && steps\.dbsnapshot\.outcome == 'success'$/,
        );
        expect(saveIf).not.toMatch(/pull_request|workflow_dispatch/);
        expect(saveStep).toContain('key: ${{ steps.db.outputs.save-key }}');
    });
});
