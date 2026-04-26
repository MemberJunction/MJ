/**
 * Runtime Actions demo harness.
 *
 * Stands up a minimal MJ runtime (SQL pool + provider + class registrations),
 * finds the five demo Runtime actions in the catalog, and drives
 * `ActionEngineServer.RunAction` against each with sensible sample inputs.
 * Prints a compact pass/fail summary plus per-action output.
 *
 * Run with:
 *   npx tsx packages/Actions/Runtime/harness/run-demos.ts
 *
 * Env (loaded from /Users/amith/Dropbox/develop/M5/MJ/.env):
 *   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, DB_TRUST_SERVER_CERTIFICATE
 *   MJ_CORE_SCHEMA (default '__mj')
 *
 * Exits 0 on all-pass, 1 if any demo failed.
 */
/* eslint-disable no-console */

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

// Load env from the repo root so running from anywhere works.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import {
    SQLServerDataProvider,
    SQLServerProviderConfigData,
    UserCache,
    setupSQLServerClient
} from '@memberjunction/sqlserver-dataprovider';
import { UUIDsEqual } from '@memberjunction/global';
import { ActionParam } from '@memberjunction/actions-base';

// Force class-registration side effects. Without these, the ClassFactory
// doesn't know about BaseAction subclasses and ActionEngine can't dispatch
// Custom actions. Runtime actions don't need registrations (they're
// sandboxed JS) but the harness also calls existing Custom actions, and
// ActionEngine's dispatcher wants a populated registry.
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Dynamic imports of mj_generatedentities / mj_generatedactions because
// they may be absent in a minimal workspace; if they're present they
// register entity + action subclasses.
async function loadGeneratedRegistrations(): Promise<void> {
    for (const pkg of ['mj_generatedentities', 'mj_generatedactions']) {
        try {
            await import(pkg);
        } catch {
            // Optional — fine if not installed.
        }
    }
}

import { ActionEngineServer } from '@memberjunction/actions';
import { AIEngine } from '@memberjunction/aiengine';

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------

async function connect(): Promise<{ pool: sql.ConnectionPool; provider: SQLServerDataProvider; user: UserInfo; schema: string }> {
    const host = must('DB_HOST');
    const port = Number(process.env.DB_PORT ?? 1433);
    const user = must('DB_USERNAME');
    const password = must('DB_PASSWORD');
    const database = must('DB_DATABASE');
    const trustServer = (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true').toLowerCase() !== 'false';
    const schema = process.env.MJ_CORE_SCHEMA || '__mj';

    const pool = new sql.ConnectionPool({
        server: host,
        port,
        user,
        password,
        database,
        options: {
            trustServerCertificate: trustServer,
            enableArithAbort: true,
            encrypt: false
        },
        pool: { max: 5, min: 1, idleTimeoutMillis: 30000 }
    });

    await pool.connect();
    const config = new SQLServerProviderConfigData(pool, schema);
    const provider = await setupSQLServerClient(config);
    await UserCache.Instance.Refresh(pool);

    // Prefer an 'Owner' type user so we run with broad permissions.
    const owner =
        UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ??
        UserCache.Users[0];
    if (!owner) {
        throw new Error('No users found in UserCache — the database appears empty or the schema is wrong.');
    }

    return { pool, provider, user: owner, schema };
}

function must(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Missing required env var: ${key}`);
    return v;
}

// ---------------------------------------------------------------------------
// Harness — declares the demo test cases and runs each through ActionEngine
// ---------------------------------------------------------------------------

interface DemoCase {
    actionName: string;
    description: string;
    /** True = this demo depends on AI providers (env keys). Skipped if unavailable. */
    requiresAI?: boolean;
    /** True = this demo depends on a Communication provider. Typically dryRun-safe. */
    requiresComms?: boolean;
    /** Input params for ActionEngine. */
    input: Record<string, unknown>;
    /** Optional predicate on the result — pass in addition to result.Success. */
    assert?: (outputs: Record<string, unknown>, result: { Success: boolean; Message?: string | null }) => string | null;
}

const DEMOS: DemoCase[] = [
    {
        actionName: 'Calculate Array Statistics',
        description: 'Pure-compute, no bridge. Sanity-check the sandbox + libs.',
        input: {
            numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100],
            outlierThresholdSigma: 2
        },
        assert: (outputs) => {
            const count = toNum(outputs.count);
            const outliers = outputs.outliers as unknown[] | undefined;
            if (count !== 11) return `expected count=11, got ${count}`;
            if (!Array.isArray(outliers) || outliers.length === 0) return `expected at least one outlier, got ${JSON.stringify(outliers)}`;
            return null;
        }
    },
    {
        actionName: 'Entity Data Quality Report',
        description: 'md + rv against Users entity.',
        input: {
            entityName: 'MJ: Users',
            sampleSize: 100
        },
        assert: (outputs) => {
            const score = toNum(outputs.overallCompleteness);
            if (score == null || score < 0 || score > 1) return `expected completeness in [0,1], got ${score}`;
            const byField = outputs.byField as unknown[] | undefined;
            if (!Array.isArray(byField) || byField.length === 0) return `expected non-empty byField`;
            return null;
        }
    },
    {
        actionName: 'Find Similar Records',
        description: 'md + rv + compute — fuzzy record matching.',
        input: {
            entityName: 'MJ: Users',
            searchField: 'Name',
            searchText: 'a',
            threshold: 0,
            maxResults: 5,
            maxScan: 200
        },
        assert: (outputs) => {
            const rowsScanned = toNum(outputs.rowsScanned);
            if (rowsScanned == null || rowsScanned < 0) return `expected rowsScanned, got ${rowsScanned}`;
            return null;
        }
    },
    {
        actionName: 'Summarize Entity Records',
        description: 'rv + ai — classic query-then-LLM pattern.',
        requiresAI: true,
        input: {
            entityName: 'MJ: Users',
            maxRows: 5
        },
        assert: (outputs) => {
            const count = toNum(outputs.recordCount);
            if (count == null) return `expected recordCount`;
            return null;
        }
    },
    {
        actionName: 'Weekly Entity Digest',
        description: 'Full-stack — rv.RunViews + ai + actions.Invoke. Running in dryRun mode so no Send Single Message is needed.',
        requiresAI: true,
        input: {
            entityNames: ['MJ: Users', 'MJ: Actions'],
            timeRangeDays: 365,
            dryRun: true
        },
        assert: (outputs) => {
            const digest = outputs.digestMarkdown as string | undefined;
            if (!digest || digest.length < 20) return `expected non-trivial digestMarkdown, got ${String(digest).slice(0, 100)}`;
            return null;
        }
    }
];

function toNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

async function runDemo(demo: DemoCase, user: UserInfo): Promise<{ ok: boolean; action: string; message: string; outputs: Record<string, unknown>; raw: unknown }> {
    const engine = ActionEngineServer.Instance;

    const action = engine.Actions.find(
        (a) => a.Name?.trim().toLowerCase() === demo.actionName.trim().toLowerCase()
    );
    if (!action) {
        return {
            ok: false,
            action: demo.actionName,
            message: `Action '${demo.actionName}' not found in the catalog — did 'mj sync push' run?`,
            outputs: {},
            raw: null
        };
    }

    if (action.Type !== 'Runtime') {
        return {
            ok: false,
            action: demo.actionName,
            message: `Action '${demo.actionName}' is Type='${action.Type}', expected 'Runtime'.`,
            outputs: {},
            raw: null
        };
    }

    if (action.CodeApprovalStatus !== 'Approved') {
        return {
            ok: false,
            action: demo.actionName,
            message: `Action '${demo.actionName}' has CodeApprovalStatus='${action.CodeApprovalStatus}', expected 'Approved'.`,
            outputs: {},
            raw: null
        };
    }

    const runParams = Object.entries(demo.input).map(([name, value]) => {
        const p = new ActionParam();
        p.Name = name;
        p.Value = value;
        p.Type = 'Input';
        return p;
    });

    let result;
    try {
        result = await engine.RunAction({
            Action: action,
            ContextUser: user,
            Filters: [],
            Params: runParams,
            SkipActionLog: true
        });
    } catch (err) {
        return {
            ok: false,
            action: demo.actionName,
            message: `Exception during RunAction: ${err instanceof Error ? err.message : String(err)}`,
            outputs: {},
            raw: err
        };
    }

    const outputs: Record<string, unknown> = {};
    for (const p of result.Params ?? []) {
        if (p.Type === 'Output' || p.Type === 'Both') {
            outputs[p.Name] = p.Value;
        }
    }

    if (!result.Success) {
        return {
            ok: false,
            action: demo.actionName,
            message: result.Message ?? 'RunAction returned Success=false.',
            outputs,
            raw: result
        };
    }

    if (demo.assert) {
        const assertErr = demo.assert(outputs, { Success: result.Success, Message: result.Message });
        if (assertErr) {
            return {
                ok: false,
                action: demo.actionName,
                message: `Assertion failed: ${assertErr}`,
                outputs,
                raw: result
            };
        }
    }

    return {
        ok: true,
        action: demo.actionName,
        message: result.Message ?? 'OK',
        outputs,
        raw: result
    };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
    console.log('Runtime Actions demo harness\n');

    const { pool, user, schema } = await connect();
    console.log(`Connected to ${process.env.DB_DATABASE}@${process.env.DB_HOST} (schema: ${schema})`);
    console.log(`Running as user: ${user.Name} (${user.Email}, type=${user.Type})\n`);

    await loadGeneratedRegistrations();

    // Prime the engines so subsequent RunAction calls don't each pay config cost.
    const engine = ActionEngineServer.Instance;
    await engine.Config(false, user);
    try {
        await AIEngine.Instance.Config(false, user);
    } catch (err) {
        console.warn('AIEngine config failed (AI demos may be skipped):', err instanceof Error ? err.message : err);
    }

    console.log(`ActionEngine: ${engine.Actions.length} actions loaded\n`);

    const results: Awaited<ReturnType<typeof runDemo>>[] = [];
    for (const demo of DEMOS) {
        const label = `[${demo.actionName}]`;
        process.stdout.write(`▶ ${label} — ${demo.description}\n`);
        const res = await runDemo(demo, user);
        results.push(res);
        if (res.ok) {
            console.log(`  ✓ PASS — ${res.message}`);
        } else {
            console.log(`  ✗ FAIL — ${res.message}`);
        }
        // Compact output: print up to ~1500 chars of the outputs so failures
        // are self-documenting without drowning the console.
        if (Object.keys(res.outputs).length > 0) {
            const summary = JSON.stringify(res.outputs, null, 2);
            const trimmed = summary.length > 1500 ? summary.slice(0, 1500) + '\n… (truncated)' : summary;
            console.log(indent(trimmed, '    '));
        } else if (!res.ok) {
            // On failure with no output, dump the raw ActionEngine result
            // so we can see what the underlying run produced.
            const raw = res.raw && typeof res.raw === 'object'
                ? {
                    Success: (res.raw as { Success?: unknown }).Success,
                    Message: (res.raw as { Message?: unknown }).Message,
                    ResultCode: (res.raw as { Result?: { ResultCode?: unknown } }).Result?.ResultCode,
                    Params: (res.raw as { Params?: unknown }).Params
                }
                : res.raw;
            console.log(indent(`raw=${JSON.stringify(raw, null, 2)}`, '    '));
        }
        console.log('');
    }

    // Final summary
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log('─'.repeat(60));
    console.log(`${passed}/${results.length} demos passed${failed > 0 ? ` (${failed} failed)` : ''}`);
    if (failed > 0) {
        console.log('\nFailures:');
        for (const r of results.filter((x) => !x.ok)) {
            console.log(`  - ${r.action}: ${r.message}`);
        }
    }

    await pool.close();
    return failed > 0 ? 1 : 0;
}

function indent(text: string, prefix: string): string {
    return text.split('\n').map((line) => prefix + line).join('\n');
}

main()
    .then((code) => {
        process.exit(code);
    })
    .catch((err) => {
        LogError(err);
        console.error('Harness crashed:', err);
        process.exit(2);
    });
