/**
 * runview-matrix-tests.ts — CLIENT-FIRST exhaustive RunView sweep across EVERY entity.
 *
 * Connects the way a browser does — GraphQLDataProvider → live MJAPI (system API key) —
 * and exercises the core RunView feature surface against all entities in the metadata,
 * over the real GraphQL wire. This is a bug-finding SWEEP: it never stops at the first
 * failure; it probes every entity, collects every failure, and prints a categorized report.
 *
 * Per-entity probes (all over the wire):
 *   P1 count_only            — RunView({ResultType:'count_only'}) → TotalRowCount populated
 *   P2 full-width read       — RunView({ResultType:'simple', MaxRows:N}) → rows, all columns present
 *   P3 Fields projection     — RunView({Fields:[firstNonPK], MaxRows:1}) → only that field + forced PK
 *   P4 entity_object         — RunView({ResultType:'entity_object', MaxRows:1}) → real BaseEntity rows
 *   P5 count parity          — P1 TotalRowCount == P2 TotalRowCount (fingerprint/pagination consistency)
 *
 * Permission-denied results are categorized separately (NOT failures). Genuine errors are bugs.
 *
 * PREREQUISITE: MJAPI running (packages/MJAPI → npm run start). Endpoint from env
 * (MJAPI_URL or http://localhost:{GRAPHQL_PORT}{GRAPHQL_ROOT_PATH}); auth via MJ_API_KEY.
 *
 * USAGE (repo root):  npx tsx packages/MJServer/integration-test-scripts/runview-matrix-tests.ts
 * Optional:
 *   RUNVIEW_MATRIX_MAXROWS=<n>  — rows to pull on the full-width read probe (default 5)
 *   RUNVIEW_MATRIX_LIMIT=<n>    — only sweep the first N entities (smoke)
 *   RUNVIEW_MATRIX_VERBOSE=1    — print every entity result, not just failures
 *
 * Exit code: 0 = no bug-class failures, 1 = failures found, 2 = bootstrap/connectivity error.
 */
import { bootstrapIntegrationClient } from './lib/harness';
import { Metadata, RunView, EntityInfo, EntityFieldInfo } from '@memberjunction/core';

type ProbeName = 'count_only' | 'full_width' | 'fields_projection' | 'entity_object' | 'count_parity';

interface EntityProbeResult {
    Entity: string;
    Schema: string;
    Skipped?: string;          // reason skipped (not a pass, not a fail)
    PermissionDenied?: boolean; // expected non-failure
    Failures: { Probe: ProbeName; Message: string }[];
}

const MAXROWS = Number(process.env.RUNVIEW_MATRIX_MAXROWS ?? '5');
const LIMIT = process.env.RUNVIEW_MATRIX_LIMIT ? Number(process.env.RUNVIEW_MATRIX_LIMIT) : undefined;
const VERBOSE = process.env.RUNVIEW_MATRIX_VERBOSE === '1';

/** A RunView result whose ErrorMessage indicates a permissions block rather than a real error. */
function isPermissionError(msg: string | undefined): boolean {
    if (!msg) return false;
    const m = msg.toLowerCase();
    return m.includes('permission') || m.includes('not authorized') || m.includes('access denied') || m.includes('do not have');
}

function firstNonPKField(entity: EntityInfo): EntityFieldInfo | undefined {
    return entity.Fields.find(f => !f.IsPrimaryKey && !f.IsVirtual) ?? entity.Fields.find(f => !f.IsPrimaryKey);
}

async function probeEntity(entity: EntityInfo): Promise<EntityProbeResult> {
    const rv = new RunView();
    const result: EntityProbeResult = { Entity: entity.Name, Schema: entity.SchemaName, Failures: [] };

    // P1 — count_only
    let p1Count: number | null = null;
    try {
        const r = await rv.RunView({ EntityName: entity.Name, ResultType: 'count_only' });
        if (!r.Success) {
            if (isPermissionError(r.ErrorMessage)) { result.PermissionDenied = true; return result; }
            result.Failures.push({ Probe: 'count_only', Message: r.ErrorMessage || 'Success=false, no message' });
        } else {
            p1Count = r.TotalRowCount;
            if (r.TotalRowCount == null) result.Failures.push({ Probe: 'count_only', Message: 'Success but TotalRowCount is null/undefined' });
        }
    } catch (e) {
        result.Failures.push({ Probe: 'count_only', Message: `THREW: ${e instanceof Error ? e.message : String(e)}` });
    }

    // P2 — full-width read
    let p2Total: number | null = null;
    try {
        const r = await rv.RunView({ EntityName: entity.Name, ResultType: 'simple', MaxRows: MAXROWS });
        if (!r.Success) {
            if (isPermissionError(r.ErrorMessage)) { result.PermissionDenied = true; return result; }
            result.Failures.push({ Probe: 'full_width', Message: r.ErrorMessage || 'Success=false, no message' });
        } else {
            p2Total = r.TotalRowCount;
            if (r.Results && r.Results.length > 0) {
                const row = r.Results[0] as Record<string, unknown>;
                // every non-virtual field should be a key on the returned row
                const missing = entity.Fields
                    .filter(f => !f.IsVirtual)
                    .map(f => f.Name)
                    .filter(name => !(name in row));
                if (missing.length > 0) {
                    result.Failures.push({ Probe: 'full_width', Message: `Row missing ${missing.length} field(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` });
                }
            }
        }
    } catch (e) {
        result.Failures.push({ Probe: 'full_width', Message: `THREW: ${e instanceof Error ? e.message : String(e)}` });
    }

    // P5 — count parity (only if both succeeded)
    if (p1Count != null && p2Total != null && p1Count !== p2Total) {
        result.Failures.push({ Probe: 'count_parity', Message: `count_only=${p1Count} but full_width TotalRowCount=${p2Total}` });
    }

    // P3 — Fields projection (subset + forced PK)
    const projField = firstNonPKField(entity);
    if (projField) {
        try {
            const r = await rv.RunView({ EntityName: entity.Name, Fields: [projField.Name], ResultType: 'simple', MaxRows: 1 });
            if (!r.Success) {
                if (!isPermissionError(r.ErrorMessage)) result.Failures.push({ Probe: 'fields_projection', Message: r.ErrorMessage || 'Success=false' });
            } else if (r.Results && r.Results.length > 0) {
                const row = r.Results[0] as Record<string, unknown>;
                const pkNames = entity.PrimaryKeys.map(pk => pk.Name);
                const allowed = new Set<string>([projField.Name, ...pkNames]);
                const extra = Object.keys(row).filter(k => !allowed.has(k));
                const pkMissing = pkNames.filter(pk => !(pk in row));
                if (pkMissing.length > 0) result.Failures.push({ Probe: 'fields_projection', Message: `forced PK missing from projection: ${pkMissing.join(', ')}` });
                if (extra.length > 0) result.Failures.push({ Probe: 'fields_projection', Message: `projection returned unrequested columns: ${extra.slice(0, 8).join(', ')}` });
            }
        } catch (e) {
            result.Failures.push({ Probe: 'fields_projection', Message: `THREW: ${e instanceof Error ? e.message : String(e)}` });
        }
    }

    // P4 — entity_object
    try {
        const r = await rv.RunView({ EntityName: entity.Name, ResultType: 'entity_object', MaxRows: 1 });
        if (!r.Success) {
            if (!isPermissionError(r.ErrorMessage)) result.Failures.push({ Probe: 'entity_object', Message: r.ErrorMessage || 'Success=false' });
        } else if (r.Results && r.Results.length > 0) {
            const obj = r.Results[0];
            if (typeof (obj as { Save?: unknown }).Save !== 'function') {
                result.Failures.push({ Probe: 'entity_object', Message: `entity_object result is not a BaseEntity (no .Save method)` });
            }
        }
    } catch (e) {
        result.Failures.push({ Probe: 'entity_object', Message: `THREW: ${e instanceof Error ? e.message : String(e)}` });
    }

    return result;
}

async function main(): Promise<void> {
    await bootstrapIntegrationClient();
    const md = new Metadata(); // global-provider-ok: dedicated single-provider client test process
    let entities = md.Entities.slice().sort((a, b) => a.Name.localeCompare(b.Name));
    if (LIMIT) entities = entities.slice(0, LIMIT);

    console.log(`\n╭─ RunView Matrix Sweep (client-first, GraphQLDataProvider → live MJAPI) ─`);
    console.log(`│  Entities: ${entities.length}   MaxRows(full read): ${MAXROWS}   User: ${md.CurrentUser?.Email ?? '?'}`);
    console.log(`╰${'─'.repeat(72)}\n`);

    const results: EntityProbeResult[] = [];
    let done = 0;
    for (const entity of entities) {
        const r = await probeEntity(entity);
        results.push(r);
        done++;
        if (VERBOSE || r.Failures.length > 0) {
            const tag = r.Failures.length > 0 ? '✗' : (r.PermissionDenied ? '–' : '✓');
            process.stdout.write(`  ${tag} [${done}/${entities.length}] ${entity.Name}${r.PermissionDenied ? ' (permission-denied)' : ''}\n`);
            for (const f of r.Failures) console.log(`        · ${f.Probe}: ${f.Message}`);
        } else if (done % 25 === 0) {
            process.stdout.write(`  … ${done}/${entities.length}\r`);
        }
    }

    const failed = results.filter(r => r.Failures.length > 0);
    const permDenied = results.filter(r => r.PermissionDenied);
    const clean = results.filter(r => r.Failures.length === 0 && !r.PermissionDenied);

    console.log(`\n╭─ Results ${'─'.repeat(60)}`);
    console.log(`│  ${clean.length} clean   ${failed.length} with failures   ${permDenied.length} permission-denied`);
    if (failed.length > 0) {
        // group by probe + message signature to reveal systemic bugs
        const byProbe = new Map<ProbeName, number>();
        for (const r of failed) for (const f of r.Failures) byProbe.set(f.Probe, (byProbe.get(f.Probe) ?? 0) + 1);
        console.log(`│  failures by probe: ${[...byProbe.entries()].map(([p, n]) => `${p}=${n}`).join('  ')}`);
    }
    console.log(`╰${'─'.repeat(69)}`);

    if (failed.length > 0) {
        console.log(`\n─ Entities with failures ─`);
        for (const r of failed) {
            console.log(`  ✗ ${r.Entity}  [${r.Schema}]`);
            for (const f of r.Failures) console.log(`      ${f.Probe}: ${f.Message}`);
        }
    }

    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`\nBootstrap / connectivity error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
});
