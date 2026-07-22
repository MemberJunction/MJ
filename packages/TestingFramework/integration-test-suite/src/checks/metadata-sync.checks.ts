/**
 * metadata-sync.checks.ts — the 'metadata-sync' bundle (MS1–MS9).
 *
 * Domain 9 deterministic legs for the mj-sync seams, WITHOUT ever pushing:
 *  - the `@lookup` / `@parent` / `@root` / `@file` / `@env` reference-parsing contracts of
 *    `SyncEngine.processFieldValue` — including a LOUD pin of the ampersand-in-value landmine
 *    (a lookup value containing '&' breaks the compound-lookup split; see MS1),
 *  - real `@lookup` RESOLUTION over the live provider (single-field, compound, and the
 *    case-insensitive value match — catalog MT3) with read-only RunView traffic,
 *  - validate-only `ValidationService.validateDirectory` against the known-good in-repo
 *    `metadata-optional/integration-test` tree (read-only; no push),
 *  - the donor-cache delegation rules of `SyncMetadataEngine.delegateEntityIfCached`, driven
 *    by REAL BaseEngine donors loaded through the run's provider.
 *
 * The bundle performs ZERO database writes (lookups and validation are reads; the fixture
 * BaseEntity records used for @parent are never saved), so it needs no lifecycle/teardown.
 * The two throwaway donor engines it loads stay registered for the remainder of the process —
 * harmless (they cache two tiny, static core lookup tables) and true to how real donors behave.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BaseEngine, BaseEngineRegistry, BaseEntity, Metadata } from '@memberjunction/core';
import type { BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJQueryCategoryEntity, MJQueueTypeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { SyncEngine, SyncMetadataEngine, ValidationService } from '@memberjunction/metadata-sync';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Walk up from cwd looking for the MJ repo root (identified by the in-repo integration-test metadata dir). */
function findIntegrationTestMetadataDir(): string | undefined {
    const marker = path.join('metadata-optional', 'integration-test', '.mj-sync.json');
    let dir = process.cwd();
    for (let i = 0; i < 12; i++) {
        if (fs.existsSync(path.join(dir, marker))) {
            return path.join(dir, 'metadata-optional', 'integration-test');
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return undefined;
}

/** Run `processFieldValue` and coerce the (any-typed) library return to a string for assertions. */
async function processToString(engine: SyncEngine, value: string, baseDir: string): Promise<string> {
    const result: unknown = await engine.processFieldValue(value, baseDir);
    return String(result);
}

/** Expect `processFieldValue` to REJECT; returns the error message (fails the check when it resolves). */
async function expectProcessRejection(engine: SyncEngine, value: string, baseDir: string): Promise<string> {
    try {
        const resolved: unknown = await engine.processFieldValue(value, baseDir);
        Assert(false, `expected '${value}' to be rejected, but it resolved to '${String(resolved)}'`);
        return ''; // unreachable — Assert threw
    } catch (e) {
        if (e instanceof Error && !e.message.startsWith("expected '")) {
            return e.message;
        }
        throw e; // re-throw the Assert failure
    }
}

// ─── MS9 donor engines: two REAL BaseEngine subclasses loaded through the run's provider ───

/** Qualifying donor: caches a tiny core lookup table unfiltered/unordered as entity objects. */
class ItMsUnorderedDonorEngine extends BaseEngine<ItMsUnorderedDonorEngine> {
    public Rows: MJQueueTypeEntity[] = [];

    public static get Instance(): ItMsUnorderedDonorEngine {
        return super.getInstance<ItMsUnorderedDonorEngine>();
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { EntityName: 'MJ: Queue Types', PropertyName: 'Rows' }
        ];
        await this.Load(configs, provider as IMetadataProvider, forceRefresh ?? false, contextUser);
    }
}

/** Disqualified donor: same shape but WITH an OrderBy — ordered configs must never be delegated to. */
class ItMsOrderedDonorEngine extends BaseEngine<ItMsOrderedDonorEngine> {
    public RowsOrdered: BaseEntity[] = [];

    public static get Instance(): ItMsOrderedDonorEngine {
        return super.getInstance<ItMsOrderedDonorEngine>();
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { EntityName: 'MJ: Entity Document Types', PropertyName: 'RowsOrdered', OrderBy: 'Name' }
        ];
        await this.Load(configs, provider as IMetadataProvider, forceRefresh ?? false, contextUser);
    }
}

export const MetadataSyncChecks: NamedCheck[] = [
    {
        Id: 'metadata-sync.MS1',
        Name: "MS1: LANDMINE PIN — a @lookup VALUE containing ' & ' is rejected (compound-split has no escaping)",
        Fn: async (ctx): Promise<void> => {
            // The compound-lookup parser splits the lookup part unconditionally on '&'
            // (sync-engine.ts — `lookupPart.split('&')`), so '&' is structural and a value like
            // "Sales & Marketing" fragments into a second "pair" with no '=' → a hard throw.
            // This check PINS the current behavior so any future fix (an escape syntax) or any
            // silent regression (resolving against the truncated 'Sales' value) goes red here.
            const engine = new SyncEngine(ctx.User);
            const message = await expectProcessRejection(engine, '@lookup:MJ: Entities.Name=Sales & Marketing', process.cwd());
            Assert(message.includes('Invalid lookup field format'),
                `expected the ampersand landmine to throw 'Invalid lookup field format', got: ${message}`);
            console.warn("  ⚠ PRODUCT NOTE (metadata-sync.MS1): a record Name containing ' & ' cannot be referenced by @lookup "
                + '(no escaping mechanism), and ValidationService.parseReference SILENTLY DROPS the fragment instead of erroring — '
                + 'validation passes files the runtime parser will reject at push time.');
            console.log(`      → landmine pinned: '${message}'`);
        }
    },
    {
        Id: 'metadata-sync.MS2',
        Name: 'MS2: single-field @lookup resolves a real row through the live provider',
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            const expected = new Metadata().EntityByName('MJ: Users'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!expected, "'MJ: Users' must exist in metadata");
            const resolved = await processToString(engine, '@lookup:MJ: Entities.Name=MJ: Users', process.cwd());
            Assert(UUIDsEqual(resolved, expected!.ID),
                `@lookup:MJ: Entities.Name=MJ: Users resolved '${resolved}', expected the MJ: Users entity ID '${expected!.ID}'`);
            console.log(`      → resolved to entity row ${resolved}`);
        }
    },
    {
        Id: 'metadata-sync.MS3',
        Name: 'MS3: @lookup value matching is case-insensitive (catalog MT3 — the PG LOWER() seam)',
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            const expected = new Metadata().EntityByName('MJ: Users'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!expected, "'MJ: Users' must exist in metadata");
            // A case-mangled VALUE must still resolve: the lookup filter wraps string comparisons
            // in LOWER() per dialect, so this passes on both SQL Server (CI collation) and PG.
            const resolved = await processToString(engine, '@lookup:MJ: Entities.Name=mj: users', process.cwd());
            Assert(UUIDsEqual(resolved, expected!.ID),
                `case-mangled @lookup value 'mj: users' resolved '${resolved}', expected '${expected!.ID}' — the case-insensitive lookup seam regressed`);
            console.log('      → case-mangled lookup value resolved to the same row');
        }
    },
    {
        Id: 'metadata-sync.MS4',
        Name: "MS4: compound @lookup ('A=1&B=2') resolves with '&' as the structural field separator",
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            const expected = new Metadata().EntityByName('MJ: Users'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!expected, "'MJ: Users' must exist in metadata");
            const schema = ctx.Schema ?? '__mj';
            const resolved = await processToString(engine, `@lookup:MJ: Entities.SchemaName=${schema}&Name=MJ: Users`, process.cwd());
            Assert(UUIDsEqual(resolved, expected!.ID),
                `compound @lookup resolved '${resolved}', expected '${expected!.ID}'`);
            console.log('      → compound two-field lookup resolved correctly');
        }
    },
    {
        Id: 'metadata-sync.MS5',
        Name: 'MS5: non-keyword @-strings pass through untouched; @env round-trips; non-strings are returned as-is',
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            // npm-scoped package names are the classic false-positive shape for the '@' prefix scan.
            AssertEqual(await processToString(engine, '@mui/material', process.cwd()), '@mui/material',
                'a non-keyword @-string must be returned verbatim');
            AssertEqual(await processToString(engine, 'plain value', process.cwd()), 'plain value',
                'a plain string must be returned verbatim');
            const numeric: unknown = await engine.processFieldValue(42, process.cwd());
            AssertEqual(typeof numeric, 'number', 'a non-string value must be returned as-is');

            const envName = 'MJ_IT_METADATA_SYNC_MS5';
            process.env[envName] = 'ms5-env-value';
            try {
                AssertEqual(await processToString(engine, `@env:${envName}`, process.cwd()), 'ms5-env-value',
                    '@env must resolve from process.env');
            } finally {
                delete process.env[envName];
            }
            const envMessage = await expectProcessRejection(engine, '@env:MJ_IT_METADATA_SYNC_MS5_MISSING', process.cwd());
            Assert(envMessage.length > 0, 'an undefined @env variable must reject with a message');
            console.log('      → passthrough + @env contracts hold');
        }
    },
    {
        Id: 'metadata-sync.MS6',
        Name: 'MS6: @parent/@root require a record and read through BaseEntity.Get (never saved — zero writes)',
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            const orphanMessage = await expectProcessRejection(engine, '@parent:Name', process.cwd());
            Assert(orphanMessage.includes('@parent'), `@parent without a parent record must name @parent in the error, got: ${orphanMessage}`);
            const rootMessage = await expectProcessRejection(engine, '@root:Name', process.cwd());
            Assert(rootMessage.includes('@root'), `@root without a root record must name @root in the error, got: ${rootMessage}`);

            // A REAL (but never-saved) BaseEntity as the parent — the reference resolves via .Get().
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const parent = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
            parent.NewRecord();
            parent.Name = 'mj-integration-test ms6 parent (never saved)';
            const resolved: unknown = await engine.processFieldValue('@parent:Name', process.cwd(), parent);
            AssertEqual(String(resolved), parent.Name, '@parent:Name must return the parent record field value');
            const viaRoot: unknown = await engine.processFieldValue('@root:Name', process.cwd(), null, parent);
            AssertEqual(String(viaRoot), parent.Name, '@root:Name must return the root record field value');
            console.log('      → @parent/@root contracts hold against a real (unsaved) BaseEntity');
        }
    },
    {
        Id: 'metadata-sync.MS7',
        Name: 'MS7: @file resolves relative to baseDir for existing files and rejects missing ones',
        Fn: async (ctx): Promise<void> => {
            const engine = new SyncEngine(ctx.User);
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-it-metadata-sync-'));
            try {
                const content = 'ms7 file content (mj-integration-test — safe to delete)';
                fs.writeFileSync(path.join(tempDir, 'probe.txt'), content, 'utf8');
                AssertEqual(await processToString(engine, '@file:probe.txt', tempDir), content,
                    '@file must return the referenced file text');
                const missing = await expectProcessRejection(engine, '@file:definitely-missing.txt', tempDir);
                Assert(missing.includes('File not found'), `missing @file must reject with 'File not found', got: ${missing}`);
            } finally {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            console.log('      → @file resolution + missing-file rejection hold');
        }
    },
    {
        Id: 'metadata-sync.MS8',
        Name: 'MS8: validate-only ValidationService passes the in-repo integration-test metadata tree (read-only)',
        Fn: async (ctx): Promise<void> => {
            const dir = findIntegrationTestMetadataDir();
            if (!dir) {
                console.warn('  ⚠ metadata-sync.MS8 SKIPPED — metadata-optional/integration-test not reachable from cwd '
                    + `('${process.cwd()}'); run from inside the MJ repo to exercise validate-only mode`);
                return;
            }
            const service = new ValidationService({ verbose: false });
            const result = await service.validateDirectory(dir);
            Assert(result.summary.totalFiles > 0,
                `validation of '${dir}' visited zero files — vacuous run (config/filePattern drift?)`);
            const errorLines = result.errors.map(e => `${e.file}: ${e.message}`);
            Assert(result.isValid && result.errors.length === 0,
                `the shipped integration-test metadata tree failed validate-only mode (${result.errors.length} errors):\n  ${errorLines.slice(0, 10).join('\n  ')}${errorLines.length > 10 ? `\n  … +${errorLines.length - 10} more` : ''}`);
            console.log(`      → ${result.summary.totalFiles} files / ${result.summary.totalEntities} records validated clean `
                + `(${result.warnings.length} warnings)`);
        }
    },
    {
        Id: 'metadata-sync.MS9',
        Name: 'MS9: donor-cache delegation — qualifying donors accepted, ordered donors refused, no-donor entities self-load',
        Fn: async (ctx): Promise<void> => {
            // Load two REAL donors through the run's provider: one qualifying (unfiltered, unordered,
            // entity objects) and one disqualified (OrderBy set). Then drive the exact vetting rules
            // SyncMetadataEngine applies at push time (see CLAUDE.md 'Check the Registry Before You Query').
            await ItMsUnorderedDonorEngine.Instance.Config(false, ctx.User, ctx.Provider);
            await ItMsOrderedDonorEngine.Instance.Config(false, ctx.User, ctx.Provider);

            // Registry contract: the qualifying donor is discoverable and serves live BaseEntity rows.
            const matches = BaseEngineRegistry.Instance.FindCachedEntity('MJ: Queue Types', { unfilteredOnly: true });
            Assert(matches.length > 0, "FindCachedEntity found no unfiltered donor for 'MJ: Queue Types' after loading one");
            const cached = BaseEngineRegistry.Instance.TryGetCachedRecords<BaseEntity>('MJ: Queue Types', { unfilteredOnly: true });
            Assert(cached != null, 'TryGetCachedRecords must return the qualifying donor cache');
            if (cached!.length > 0) {
                Assert(cached![0] instanceof BaseEntity, 'donor-cached rows must be real BaseEntity instances');
            }

            const sync = new SyncMetadataEngine();
            Assert(sync.delegateEntityIfCached('MJ: Queue Types') === true,
                'delegateEntityIfCached must accept the unfiltered/unordered entity-object donor');
            Assert(sync.getDelegationSummary().some(d => d.entityName === 'MJ: Queue Types'),
                'the delegation summary must record the accepted donor pairing');

            // Ordered-only donor must be refused — but only assert when OUR ordered engine is the
            // only candidate (another loaded engine could legitimately qualify; then this leg is moot).
            const orderedMatches = BaseEngineRegistry.Instance.FindCachedEntity('MJ: Entity Document Types', { unfilteredOnly: true });
            const qualifyingOther = orderedMatches.some(m => !m.config.OrderBy && m.config.ResultType !== 'simple' && !!m.config.PropertyName);
            if (qualifyingOther) {
                console.warn("  ⚠ metadata-sync.MS9 ordered-donor leg SKIPPED — another loaded engine caches 'MJ: Entity Document Types' "
                    + 'without an OrderBy, so refusal cannot be asserted in this process');
            } else {
                Assert(orderedMatches.length > 0, "precondition: the ordered donor for 'MJ: Entity Document Types' must be discoverable");
                Assert(sync.delegateEntityIfCached('MJ: Entity Document Types') === false,
                    'delegateEntityIfCached must REFUSE a donor whose config has an OrderBy (ordered donors reassign arrays mid-push)');
            }

            // No-donor entity → no delegation (self-load path). Chosen dynamically so a future
            // engine caching a candidate cannot silently turn this leg vacuous.
            const noDonorCandidates = ['MJ: Record Merge Logs', 'MJ: Query Categories', 'MJ: Company Integrations'];
            const noDonor = noDonorCandidates.find(name => BaseEngineRegistry.Instance.FindCachedEntity(name, { unfilteredOnly: true }).length === 0);
            if (!noDonor) {
                console.warn(`  ⚠ metadata-sync.MS9 no-donor leg SKIPPED — every candidate (${noDonorCandidates.join(', ')}) has a loaded donor in this process`);
            } else {
                Assert(sync.delegateEntityIfCached(noDonor) === false,
                    `delegateEntityIfCached must return false for '${noDonor}' (no loaded engine caches it)`);
            }
            console.log('      → donor vetting rules hold against real registry state');
        }
    }
];

for (const check of MetadataSyncChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
