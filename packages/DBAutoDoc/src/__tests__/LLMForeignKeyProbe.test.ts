import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from '../core/AnalysisEngine.js';
import { KeyVerifier } from '../discovery/JoinProbe.js';
import { BaseAutoDocDriver, DriverProbeOutcome } from '../drivers/BaseAutoDocDriver.js';
import { DBAutoDocConfig } from '../types/config.js';
import { DatabaseDocumentation } from '../types/state.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';
import { ForeignKeyPromptResult } from '../types/prompts.js';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';

/**
 * MJC-128 — the P0 row.
 *
 * These tests drive the REAL `AnalysisEngine.processFKInsightsFromLLM`, not a
 * reimplementation of its logic. The defect was never in a formula that could be
 * restated in a test; it was that this specific call site never consulted a probe. A
 * test that rebuilds the decision locally would pass against the broken engine, so the
 * pin has to reach the engine itself.
 */

interface ProbeOnlyDriver {
    probeJoinContainment(
        child: { schema: string; table: string; column: string },
        parent: { schema: string; table: string; column: string },
        sampleSize: number,
        timeoutMs: number,
    ): Promise<DriverProbeOutcome>;
}

/** The private method under test, named so the cast stays typed rather than `any`. */
interface FKInsightSink {
    processFKInsightsFromLLM(
        state: DatabaseDocumentation,
        schemaName: string,
        tableName: string,
        foreignKeys: ForeignKeyPromptResult[],
    ): Promise<void>;
}

function driverFor(
    byTarget: Record<string, DriverProbeOutcome>,
    fallback: DriverProbeOutcome = { ok: true, sampledValues: 1000, matchedValues: 1000 },
): { driver: BaseAutoDocDriver; probed: Array<{ child: string; parent: string }> } {
    const probed: Array<{ child: string; parent: string }> = [];
    const impl: ProbeOnlyDriver = {
        probeJoinContainment: async (child, parent) => {
            const p = `${parent.schema}.${parent.table}.${parent.column}`;
            probed.push({ child: `${child.schema}.${child.table}.${child.column}`, parent: p });
            return byTarget[p] ?? fallback;
        },
    };
    return { driver: impl as unknown as BaseAutoDocDriver, probed };
}

function testConfig(): DBAutoDocConfig {
    return {
        version: '1.0.0',
        database: { server: 'localhost', database: 'TestDB', user: 'u', password: 'p' },
        ai: { provider: 'gemini', model: 'm', apiKey: 'k', temperature: 0.1 },
        analysis: {
            cardinalityThreshold: 20,
            sampleSize: 10,
            includeStatistics: true,
            includePatternAnalysis: true,
            convergence: { maxIterations: 10, stabilityWindow: 2, confidenceThreshold: 0.85 },
            backpropagation: { enabled: true, maxDepth: 3 },
            sanityChecks: { dependencyLevel: true, schemaLevel: true, crossSchema: true },
        },
        output: { stateFile: './s.json', sqlFile: './o.sql', markdownFile: './o.md' },
        schemas: { exclude: [] },
        tables: { exclude: [] },
    } as unknown as DBAutoDocConfig;
}

/** The ACGI shape: a namespaced parent PK and children holding the bare id. */
function acgiState(): DatabaseDocumentation {
    const col = (name: string, isPrimaryKey = false) => ({
        name,
        dataType: 'text',
        description: '',
        isPrimaryKey,
        isForeignKey: false,
        nullable: false,
    });
    return {
        schemas: [
            {
                name: 'acgi',
                tables: [
                    {
                        name: 'customer',
                        columns: [col('record_key', true), col('cust_id'), col('surname')],
                        dependsOn: [],
                        dependents: [],
                    },
                    {
                        name: 'address',
                        columns: [col('address_id', true), col('cust_id'), col('postal_code')],
                        dependsOn: [],
                        dependents: [],
                    },
                ],
            },
        ],
        phases: {
            keyDetection: {
                discovered: { primaryKeys: [], foreignKeys: [] },
                feedbackFromAnalysis: [],
            },
        },
    } as unknown as DatabaseDocumentation;
}

function engineWith(verifier: KeyVerifier | null): { engine: AnalysisEngine; sink: FKInsightSink; progress: string[] } {
    const progress: string[] = [];
    const engine = new AnalysisEngine(
        testConfig(),
        { setGuardrailCheck: () => {} } as unknown as PromptEngine,
        {} as unknown as StateManager,
        {} as unknown as IterationTracker,
        (msg: string) => progress.push(msg),
    );
    engine.setKeyVerifier(verifier);
    return { engine, sink: engine as unknown as FKInsightSink, progress };
}

const insight = (columnName: string, table: string, column: string): ForeignKeyPromptResult => ({
    columnName,
    referencesSchema: 'acgi',
    referencesTable: table,
    referencesColumn: column,
    confidence: 0.95,
});

const MATCHES_NOTHING: DriverProbeOutcome = { ok: true, sampledValues: 1000, matchedValues: 0 };

describe('AnalysisEngine — an LLM-proposed FK is probed before it is confirmed', () => {
    it('a refuted join is NOT written to discovered.foreignKeys', async () => {
        // The register row's exact case: 0 of 41,115 rows matched, on every child table.
        const state = acgiState();
        const { driver, probed } = driverFor({ 'acgi.customer.record_key': MATCHES_NOTHING });
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        expect(probed).toEqual([{ child: 'acgi.address.cust_id', parent: 'acgi.customer.record_key' }]);
        expect(state.phases.keyDetection?.discovered.foreignKeys).toEqual([]);
    });

    it('a refuted join does NOT stamp the column either — the second, ungated door', async () => {
        // `AdditionalSchemaInfoGenerator.collectIntrospectedFKs` emits from
        // `col.isForeignKey && col.foreignKeyReferences` with NO confidence, status or
        // containment filter. So suppressing the candidate is not enough: if the column
        // is stamped, the key reaches additionalSchemaInfo through a path that has no
        // gate to fail. Both writes have to be suppressed.
        const state = acgiState();
        const { driver } = driverFor({ 'acgi.customer.record_key': MATCHES_NOTHING });
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        const addressTable = state.schemas[0].tables.find((t) => t.name === 'address');
        const custIdCol = addressTable?.columns.find((c) => c.name === 'cust_id');
        expect(custIdCol?.isForeignKey).toBeFalsy();
        expect(custIdCol?.foreignKeyReferences).toBeUndefined();
        expect(addressTable?.dependsOn).toEqual([]);
    });

    it('and therefore nothing reaches additionalSchemaInfo', async () => {
        const state = acgiState();
        const { driver } = driverFor({ 'acgi.customer.record_key': MATCHES_NOTHING });
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        // `generate` returns the additionalSchemaInfo JSON as text.
        const asi = JSON.parse(new AdditionalSchemaInfoGenerator().generate(state, {})) as Record<
            string,
            Array<Record<string, unknown>>
        >;
        const acgi = asi.acgi;

        // Asserted structurally, not by searching the JSON text for 'record_key' — that
        // string legitimately appears as customer's OWN PrimaryKey entry, so a text search
        // would pass or fail for the wrong reason. What must be absent is any ForeignKey
        // block, on any table.
        expect(acgi.length).toBeGreaterThan(0);
        // The generator's key is `ForeignKeys`, plural. Asserting on `ForeignKey` would
        // pass vacuously against any output at all.
        expect(Object.keys(asi.acgi[0])).not.toContain('ForeignKey');
        for (const table of acgi) {
            expect(table.ForeignKeys).toBeUndefined();
        }
    });

    it('a verified join IS confirmed, and carries the real measurement', async () => {
        const state = acgiState();
        const { driver } = driverFor({}); // fallback: 1000/1000
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'cust_id'),
        ]);

        const fks = state.phases.keyDetection?.discovered.foreignKeys ?? [];
        expect(fks.length).toBe(1);
        expect(fks[0].targetColumn).toBe('cust_id');
        expect(fks[0].status).toBe('confirmed');
        // The old code hardcoded valueOverlap: 0 and sampleSize: 0 here, which is
        // indistinguishable from a probe that ran and found nothing.
        expect(fks[0].evidence.valueOverlap).toBe(1);
        expect(fks[0].evidence.sampleSize).toBe(1000);
        expect(fks[0].evidence.orphanCount).toBe(0);
        expect(fks[0].verification?.Verification).toBe('Verified');
        expect(fks[0].verification?.Provenance).toBe('LLM');
        expect(fks[0].verification?.MatchedRows).toBe(1000);
        expect(fks[0].verification?.SampledRows).toBe(1000);
    });

    it('an Unprobed join is still emitted, but stamped Unprobed — not silently dropped', async () => {
        // Refusing whenever the probe cannot run converts a permissions or budget problem
        // into total key loss with no signal, which is the failure mode this work exists
        // to remove. It proceeds, visibly unverified.
        const state = acgiState();
        const { driver } = driverFor({
            'acgi.customer.cust_id': { ok: false, reason: 'no permission to read one of the columns' },
        });
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'cust_id'),
        ]);

        const fks = state.phases.keyDetection?.discovered.foreignKeys ?? [];
        expect(fks.length).toBe(1);
        expect(fks[0].verification?.Verification).toBe('Unprobed');
        expect(fks[0].verification?.MatchedRows).toBeNull();
        expect(fks[0].evidence.warnings.some((w) => w.includes('NOT verified'))).toBe(true);
    });

    it('with no verifier configured, behaviour is preserved but marked Unprobed', async () => {
        const state = acgiState();
        const { sink } = engineWith(null);

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        const fks = state.phases.keyDetection?.discovered.foreignKeys ?? [];
        expect(fks.length).toBe(1);
        expect(fks[0].verification?.Verification).toBe('Unprobed');
        expect(fks[0].verification?.VerificationNote).toContain('no key verifier');
    });

    it('a verified key carries its provenance into additionalSchemaInfo (MJC-130)', async () => {
        // A wrong inferred key and a correct hand-written one used to sit side by side in
        // this file with nothing recording which had ever been checked.
        const state = acgiState();
        const { driver } = driverFor({});
        const { sink } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'cust_id'),
        ]);

        const asi = JSON.parse(new AdditionalSchemaInfoGenerator().generate(state, {})) as Record<
            string,
            Array<Record<string, unknown>>
        >;
        const address = asi.acgi.find((t) => t.TableName === 'address');
        const fkEntries = address?.ForeignKeys as Array<Record<string, unknown>> | undefined;
        expect(fkEntries).toBeDefined();
        const stamp = fkEntries?.[0].Verification as Record<string, unknown> | undefined;
        expect(stamp).toBeDefined();
        expect(stamp?.Provenance).toBe('LLM');
        expect(stamp?.Verification).toBe('Verified');
        expect(stamp?.MatchedRows).toBe(1000);
        expect(stamp?.SampledRows).toBe(1000);
        // Counts only — the persisted stamp must not carry a data value.
        expect(Object.keys(stamp ?? {}).sort()).toEqual(
            ['MatchedRows', 'Provenance', 'SampledRows', 'Verification', 'VerificationNote', 'VerifiedAt'],
        );
        // NOTE which path emitted this. `collectIntrospectedFKs` runs first and claims the
        // dedup key, so `collectDiscoveredFKs` skips it and `describeDiscoveredFK`'s
        // sentence never appears. That is precisely why the stamp has to be attached on
        // BOTH paths: the ungated one is the one that actually emits.
        expect(stamp?.VerificationNote).toContain('1000 of 1000 sampled values matched');
    });

    it('reports each rejection rather than dropping it silently', async () => {
        const state = acgiState();
        const { driver } = driverFor({ 'acgi.customer.record_key': MATCHES_NOTHING });
        const { sink, progress } = engineWith(new KeyVerifier(driver));

        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        expect(progress.some((m) => m.includes('Rejected LLM-proposed FK'))).toBe(true);
        expect(progress.some((m) => m.includes('0 of 1000'))).toBe(true);
    });

    it('refutes every child of a namespaced parent key, which is the whole-schema shape', async () => {
        const state = acgiState();
        const { driver } = driverFor({ 'acgi.customer.record_key': MATCHES_NOTHING });
        const { sink } = engineWith(new KeyVerifier(driver));

        // Two different child tables, same wrong inferred target.
        await sink.processFKInsightsFromLLM(state, 'acgi', 'address', [
            insight('cust_id', 'customer', 'record_key'),
        ]);
        await sink.processFKInsightsFromLLM(state, 'acgi', 'customer', [
            insight('cust_id', 'customer', 'record_key'),
        ]);

        expect(state.phases.keyDetection?.discovered.foreignKeys).toEqual([]);
    });
});
