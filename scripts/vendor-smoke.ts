/**
 * Multi-vendor prompt-cache smoke harness — drives the FULL MemberJunction pipeline.
 *
 * Boots the same SQL Server data provider `mj sync` uses, registers every class via the
 * server-bootstrap manifest (so all AI provider drivers + the MJAIPromptRunEntityServer cost-calc
 * subclass are live), then runs ONE existing AI Prompt through `AIPromptRunner.ExecutePrompt`
 * against each active inference vendor (forced via `override`), TWICE per vendor (cold then warm,
 * to exercise prompt caching). It reads the persisted AIPromptRun back and prints a table so you can
 * verify, across vendors in one run: token normalization, cache read/write capture, cache-aware
 * cost, TTFT, and native-response (ModelSpecificResponseDetails) capture.
 *
 * Usage:
 *   npx tsx scripts/vendor-smoke.ts                 # auto-pick a simple active Chat prompt
 *   npx tsx scripts/vendor-smoke.ts --prompt "Name" # use a specific prompt by name
 *   npx tsx scripts/vendor-smoke.ts --vendor Groq   # limit to one vendor (substring match)
 *
 * Requires the vendors' API keys to be configured in the environment the way MJ expects; vendors
 * whose key is missing (or that otherwise error) are skipped and reported, never fatal.
 */
import 'dotenv/config';
// Side-effect import: registers ALL @memberjunction classes (providers, entity subclasses, engines).
import '@memberjunction/server-bootstrap/mj-class-registrations';
import sql from 'mssql';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { RunView, UserInfo, LogStatus } from '@memberjunction/core';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

interface ModelVendorRow {
    ModelID: string;
    VendorID: string;
    Model: string;
    Vendor: string;
    DriverClass: string | null;
    Priority: number | null;
}

interface RunStat {
    vendor: string;
    model: string;
    pass: 1 | 2;
    ok: boolean;
    promptTokens: number | null;
    completionTokens: number | null;
    cacheRead: number | null;
    cacheWrite: number | null;
    cost: number | null;
    ttft: number | null;
    nativeJSON: boolean;
    note: string;
}

function getArg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function bootstrapProvider(): Promise<sql.ConnectionPool> {
    const pool = new sql.ConnectionPool({
        server: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 1433,
        database: process.env.DB_DATABASE,
        user: process.env.CODEGEN_DB_USERNAME || process.env.DB_USERNAME,
        password: process.env.CODEGEN_DB_PASSWORD || process.env.DB_PASSWORD,
        options: {
            encrypt: (process.env.DB_HOST || '').includes('.database.windows.net'),
            trustServerCertificate: true,
            enableArithAbort: true,
        },
    } as sql.config);
    await pool.connect();
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    return pool;
}

function pickContextUser(): UserInfo {
    const users = UserCache.Instance.Users;
    const owner = users.find(u => u.Type?.toLowerCase() === 'owner');
    const user = owner ?? users[0];
    if (!user) {
        throw new Error('No users found in UserCache — cannot establish a context user.');
    }
    return user;
}

async function pickPrompt(contextUser: UserInfo, nameArg?: string): Promise<MJAIPromptEntityExtended> {
    const rv = new RunView();
    const filter = nameArg
        ? `Name = '${nameArg.replace(/'/g, "''")}'`
        : `Status = 'Active'`;
    const result = await rv.RunView<MJAIPromptEntityExtended>({
        EntityName: 'MJ: AI Prompts',
        ExtraFilter: filter,
        OrderBy: 'Name',
        ResultType: 'entity_object',
    }, contextUser);
    if (!result.Success || result.Results.length === 0) {
        throw new Error(`No prompt found (${nameArg ? `name='${nameArg}'` : 'any active'}): ${result.ErrorMessage ?? ''}`);
    }
    // Auto-pick: prefer the shortest-named active prompt (heuristic for a simple/general one).
    return nameArg ? result.Results[0] : result.Results.sort((a, b) => (a.Name?.length ?? 0) - (b.Name?.length ?? 0))[0];
}

async function listVendors(contextUser: UserInfo, vendorFilter?: string): Promise<Map<string, ModelVendorRow[]>> {
    const rv = new RunView();
    const result = await rv.RunView<ModelVendorRow>({
        EntityName: 'MJ: AI Model Vendors',
        ExtraFilter: `Status = 'Active' AND Type = 'Inference Provider' AND DriverClass IS NOT NULL`,
        OrderBy: 'Priority ASC',
        ResultType: 'simple',
    }, contextUser);
    if (!result.Success) {
        throw new Error(`Failed to load model vendors: ${result.ErrorMessage}`);
    }
    // Group models by vendor (priority order) so we can fall back through a vendor's models if its
    // top-priority one is undeployed/inaccessible — the goal is "does this PROVIDER work", not one model.
    const byVendor = new Map<string, ModelVendorRow[]>();
    for (const row of result.Results) {
        if (vendorFilter && !row.Vendor?.toLowerCase().includes(vendorFilter.toLowerCase())) continue;
        const list = byVendor.get(row.VendorID) ?? [];
        list.push(row);
        byVendor.set(row.VendorID, list);
    }
    return byVendor;
}

/** Try a vendor's models in priority order; on the first that runs, also do a warm (pass 2) call. */
async function runVendor(prompt: MJAIPromptEntityExtended, models: ModelVendorRow[], contextUser: UserInfo): Promise<RunStat[]> {
    let lastFail: RunStat | null = null;
    for (const mv of models) {
        LogStatus(`  ${mv.Vendor} / ${mv.Model}  (pass 1)...`);
        const first = await runOnce(prompt, mv, 1, contextUser);
        if (first.ok) {
            LogStatus(`  ${mv.Vendor} / ${mv.Model}  (pass 2)...`);
            const second = await runOnce(prompt, mv, 2, contextUser);
            return [first, second];
        }
        lastFail = first;
    }
    return lastFail ? [lastFail] : [];
}

async function runOnce(prompt: MJAIPromptEntityExtended, mv: ModelVendorRow, pass: 1 | 2, contextUser: UserInfo): Promise<RunStat> {
    const base: RunStat = {
        vendor: mv.Vendor, model: mv.Model, pass, ok: false,
        promptTokens: null, completionTokens: null, cacheRead: null, cacheWrite: null,
        cost: null, ttft: null, nativeJSON: false, note: '',
    };
    try {
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = contextUser;
        params.skipValidation = true;
        params.override = { modelId: mv.ModelID, vendorId: mv.VendorID };

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt(params);
        const pr = result.promptRun;
        if (!pr) {
            base.note = result.success ? 'no promptRun returned' : (result.errorMessage ?? 'failed');
            return base;
        }
        base.ok = result.success;
        base.promptTokens = pr.TokensPrompt;
        base.completionTokens = pr.TokensCompletion;
        base.cacheRead = pr.TokensCacheRead;
        base.cacheWrite = pr.TokensCacheWrite;
        base.cost = pr.Cost;
        base.ttft = pr.FirstTokenTime;
        base.nativeJSON = !!pr.ModelSpecificResponseDetails;
        if (!result.success) base.note = (result.errorMessage ?? '').slice(0, 60);
        return base;
    } catch (e) {
        base.note = (e instanceof Error ? e.message : String(e)).slice(0, 60);
        return base;
    }
}

function fmt(n: number | null): string {
    return n == null ? '-' : String(n);
}

async function main(): Promise<void> {
    const pool = await bootstrapProvider();
    try {
        const contextUser = pickContextUser();
        await AIEngineBase.Instance.Config(false, contextUser);

        const prompt = await pickPrompt(contextUser, getArg('--prompt'));
        const vendors = await listVendors(contextUser, getArg('--vendor'));
        LogStatus(`Smoke prompt: "${prompt.Name}"  |  vendors to test: ${vendors.size}`);

        const stats: RunStat[] = [];
        for (const models of vendors.values()) {
            stats.push(...await runVendor(prompt, models, contextUser));
        }

        // ── Report ──
        const header = ['Vendor', 'Model', 'P', 'OK', 'inTok', 'outTok', 'cacheR', 'cacheW', 'cost', 'ttft', 'rawJSON', 'note'];
        const rows = stats.map(s => [
            (s.vendor || '').slice(0, 14), (s.model || '').slice(0, 22), String(s.pass),
            s.ok ? '✓' : '✗', fmt(s.promptTokens), fmt(s.completionTokens), fmt(s.cacheRead),
            fmt(s.cacheWrite), s.cost == null ? '-' : s.cost.toFixed(6), fmt(s.ttft),
            s.nativeJSON ? 'yes' : 'no', s.note,
        ]);
        const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
        const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
        console.log('\n' + line(header));
        console.log(widths.map(w => '─'.repeat(w)).join('  '));
        for (const r of rows) console.log(line(r));
        console.log('');
    } finally {
        await pool.close();
    }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
