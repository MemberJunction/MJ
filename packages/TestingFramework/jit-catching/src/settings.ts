import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Bucket, GenerationLimits, Vendor } from './types';

export const SettingsSchema = z.object({
    GeneratorModel: z.string(),
    /**
     * How hard the generator model thinks. Absent means the provider default. The Gemini runner sends it as `effortLevel`;
     * the Claude Agent SDK runner ignores it.
     */
    GeneratorEffort: z.enum(['low', 'medium', 'high']).optional(),
    AnalyzerModel: z.string(),
    /** `Staged`: the first bucket judge runs first, and a Low from it skips the other bucket judges. */
    Judges: z.object({
        TpProbModel: z.string(),
        BucketModels: z.array(z.object({ Vendor: z.enum(['Anthropic', 'OpenAI', 'Gemini']), Model: z.string() })).min(1),
        Staged: z.boolean(),
    }),
    /** TokensPerSession counts input, cache reads and output (D37); UsdPerSession is the cap that acts first on a normal session (D42). */
    Limits: z.object({
        TestsPerPackage: z.number().int().positive(), RisksPerPackage: z.number().int().positive(), TestsPerRisk: z.number().int().positive(),
        PackagesPerPR: z.number().int().positive(), ParallelSessions: z.number().int().positive(), TurnsPerSession: z.number().int().positive(), TokensPerSession: z.number().int().positive(),
        UsdPerSession: z.number().positive(),
    }),
    Repeats: z.number().int().positive(),
    /** Whether job 2 measures changed-line coverage on head for tests that pass on both revisions. */
    Coverage: z.boolean(),
    TestTimeoutMs: z.number().int().positive(),
    SequenceSeed: z.number().int(),
    Thresholds: z.object({
        Label: z.object({ MinMedian: z.enum(['High', 'Medium', 'Low']), MaxReported: z.number().int().positive() }),
        Nightly: z.object({ MinMedian: z.enum(['High', 'Medium', 'Low']), MediumWithBoosts: z.array(z.string()) }),
    }),
    Prices: z.record(z.string(), z.object({ Input: z.number(), Output: z.number(), CachedInput: z.number() })),
    /** `PnpmVersion` is the pnpm the image installs; the host fetch runs the same version so the store layout matches. */
    Sandbox: z.object({ Image: z.string(), MemoryGB: z.number().positive(), Cpus: z.number().positive(), PidsLimit: z.number().int().positive(), PnpmVersion: z.string().regex(/^\d+\.\d+\.\d+$/), BuildExclude: z.array(z.string()) }),
    RiskPaths: z.array(z.string()),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type { GenerationLimits, Bucket, Vendor };

export const DEFAULT_SETTINGS: Settings = {
    GeneratorModel: 'claude-opus-5-5',
    AnalyzerModel: 'claude-sonnet-5-5',
    Judges: { TpProbModel: 'gpt-4.1-mini', BucketModels: [{ Vendor: 'Anthropic', Model: 'claude-opus-5-5' }, { Vendor: 'Gemini', Model: 'gemini-4-argon' }, { Vendor: 'OpenAI', Model: 'gpt-5.1' }], Staged: true },
    Limits: { TestsPerPackage: 5, RisksPerPackage: 3, TestsPerRisk: 2, PackagesPerPR: 3, ParallelSessions: 4, TurnsPerSession: 30, TokensPerSession: 2_000_000, UsdPerSession: 3 },
    Repeats: 3,
    Coverage: true,
    TestTimeoutMs: 30_000,
    SequenceSeed: 1,
    Thresholds: { Label: { MinMedian: 'Medium', MaxReported: 3 }, Nightly: { MinMedian: 'High', MediumWithBoosts: ['AccessChange', 'MatchesRisk'] } },
    Prices: {
        'claude-opus-5-5': { Input: 4, Output: 20, CachedInput: 0.2 }, 'claude-sonnet-5-5': { Input: 2, Output: 10, CachedInput: 0.2 },
        'claude-haiku-5-5': { Input: 0.1, Output: 0.5, CachedInput: 0.01 }, 'gemini-4-argon': { Input: 2, Output: 10, CachedInput: 0.1 },
        'gpt-4.1-mini': { Input: 0.4, Output: 1.6, CachedInput: 0.1 }, 'gpt-5.1': { Input: 1.25, Output: 10, CachedInput: 0.125 },
        'gemini-3.8-flash': { Input: 0.75, Output: 3.75, CachedInput: 0.075 }, 'gemini-4-hydrogen': { Input: 1.5, Output: 7.5, CachedInput: 0.075 },
    },
    // BuildExclude: packages left out of the sandbox build closure. The CLI's build copies a folder with a recursive
    // fs.cpSync, which fails with EACCES on a Docker Desktop bind mount; a Linux host can set this to [].
    Sandbox: { Image: 'jit-sandbox:local', MemoryGB: 6, Cpus: 3, PidsLimit: 1024, PnpmVersion: '10.33.0', BuildExclude: ['@memberjunction/cli'] },
    RiskPaths: [
        'packages/MJCore/src/generic/securityInfo.ts', 'packages/MJCore/src/generic/fieldSecuritySQLGate.ts', 'packages/GenericDatabaseProvider/', 'packages/MJServer/',
        'packages/SQLServerDataProvider/', 'packages/PostgreSQLDataProvider/', 'packages/GraphQLDataProvider/', 'packages/RedisProvider/', 'packages/CodeGenLib/', 'packages/OpenApp/',
    ],
};

/** Deep-merges the JSON file at `path` over the defaults and validates the result. Returns a copy of the defaults when no path is given. */
export function LoadSettings(path: string | undefined): Settings {
    if (!path) return structuredClone(DEFAULT_SETTINGS);
    const file = parseJsonObject(readFileSync(path, 'utf8'), path);
    return SettingsSchema.parse(merge(DEFAULT_SETTINGS as unknown as Record<string, unknown>, file));
}

function merge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) {
        const b = base[k];
        out[k] = isPlainObject(b) && isPlainObject(v) ? merge(b, v) : v;
    }
    return out;
}
function isPlainObject(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }

/** The file's JSON. The parser's message is not kept, because it quotes the file's content. */
function parseJsonObject(text: string, path: string): Record<string, unknown> {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error(`settings file is not valid JSON: ${path}`); }
    if (!isPlainObject(parsed)) throw new Error(`settings file must hold a JSON object: ${path}`);
    return parsed;
}
