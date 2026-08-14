/**
 * Unit tests for `MJCompanyIntegrationEntityServer.Save()` — the activation schema refresh and its
 * opt-out.
 *
 * Activating a connection (`IsActive` false→true) runs the connector schema-refresh pipeline INSIDE
 * `Save()`, awaited. `SuppressActivationSchemaRefresh` lets a caller take ownership of that run
 * instead. `IntegrationCreateConnection` sets it for `awaitSchemaRefresh: false`, for two reasons:
 * without it the create mutation pays a full live introspect no matter what the caller asked for,
 * and the Save-side run would happen BEFORE the connection test — so a test failure would roll back
 * a connection whose discovered schema had already been written.
 *
 * The pipeline itself is not under test here; `fireSchemaRefreshPipeline` is stubbed so these tests
 * pin exactly one thing: WHETHER it is invoked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Neutralize the class-factory registration decorator.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

// Minimal settable base standing in for the generated `MJCompanyIntegrationEntity`.
vi.mock('@memberjunction/core-entities', () => {
    class MockMJCompanyIntegrationEntity {
        public ID = 'ci-1';
        public Integration: string | undefined = 'TestVendor';
        public IsActive = false;
        public superSaveCalls = 0;
        private _saved = false;
        private _oldIsActive: unknown = false;

        public get IsSaved(): boolean { return this._saved; }
        public markSaved(oldIsActive: unknown): void { this._saved = true; this._oldIsActive = oldIsActive; }
        public GetFieldByName(name: string): { OldValue: unknown } {
            if (name !== 'IsActive') throw new Error(`unexpected field ${name}`);
            return { OldValue: this._oldIsActive };
        }
        public async Save(): Promise<boolean> { this.superSaveCalls++; return true; }
    }
    return { MJCompanyIntegrationEntity: MockMJCompanyIntegrationEntity, MJIntegrationEntity: class {} };
});

vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationConnectorCreationPipeline: class { async Run() { return { RunID: 'r', Success: true }; } },
    IntegrationEngine: { Instance: { Config: async () => undefined } },
    ConnectorFactory: { Resolve: () => ({}) },
}));

vi.mock('../custom/IntegrationLLMPKCallback', () => ({ buildIntegrationLLMPKCallback: async () => undefined }));

const { MJCompanyIntegrationEntityServer } = await import('../custom/MJCompanyIntegrationEntityServer.server');

/** Builds the subclass with `fireSchemaRefreshPipeline` replaced by a counter. */
function makeEntity() {
    const ci = new MJCompanyIntegrationEntityServer();
    const fired = { count: 0 };
    // The pipeline is exercised by its own tests; here we pin only whether Save() reaches it.
    (ci as unknown as { fireSchemaRefreshPipeline: () => Promise<void> }).fireSchemaRefreshPipeline =
        async () => { fired.count++; };
    return { ci, fired };
}

describe('MJCompanyIntegrationEntityServer — activation schema refresh', () => {
    let entity: ReturnType<typeof makeEntity>;
    beforeEach(() => { entity = makeEntity(); });

    it('runs the refresh when a NEW record is saved active (the wizard-Finish path)', async () => {
        entity.ci.IsActive = true;
        await entity.ci.Save();
        expect(entity.fired.count).toBe(1);
    });

    it('does NOT run the refresh when the caller opted out', async () => {
        entity.ci.IsActive = true;
        entity.ci.SuppressActivationSchemaRefresh = true;
        await entity.ci.Save();

        expect(entity.fired.count).toBe(0);
        // The save itself must still happen — this suppresses the refresh, not the write.
        expect((entity.ci as unknown as { superSaveCalls: number }).superSaveCalls).toBe(1);
    });

    it('defaults to running it — every path that does not opt in is unchanged', async () => {
        expect(entity.ci.SuppressActivationSchemaRefresh).toBe(false);
    });

    it('does not run the refresh when the record was already active (no transition)', async () => {
        (entity.ci as unknown as { markSaved: (v: unknown) => void }).markSaved(true);
        entity.ci.IsActive = true;
        await entity.ci.Save();
        expect(entity.fired.count).toBe(0);
    });

    it('does not run the refresh when the record is saved inactive', async () => {
        entity.ci.IsActive = false;
        await entity.ci.Save();
        expect(entity.fired.count).toBe(0);
    });
});
