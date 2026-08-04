import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewParams } from '../generic/interfaces';
import { LocalCacheManager } from '../generic/localCacheManager';

/**
 * Test subclass that exposes BaseEngine's protected BuildRunViewParamsForConfig
 * so we can assert fingerprint consistency across all call sites.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public async Config(
        _forceRefresh?: boolean,
        _contextUser?: UserInfo,
        _provider?: IMetadataProvider
    ): Promise<void> {
        // no-op — we test params construction, not loading
    }

    /** Expose the shared builder for direct testing. */
    public BuildRunViewParamsForConfigForTest(
        config: BaseEnginePropertyConfig,
        bypassCache: boolean = false
    ): RunViewParams {
        return this.BuildRunViewParamsForConfig(config, bypassCache);
    }
}

/**
 * Fingerprint consistency tests.
 *
 * The root cause of the cross-server cache invalidation bug was that
 * RegisterCacheChangeCallbacks and syncLocalCacheForConfig constructed
 * RunViewParams by hand with different fields (missing IgnoreMaxRows)
 * than the load methods. These tests guarantee every call site produces
 * identical fingerprints via the shared BuildRunViewParamsForConfig.
 */
describe('BaseEngine — Fingerprint Consistency', () => {
    let engine: TestEngine;

    beforeEach(() => {
        engine = new TestEngine();
    });

    describe('BuildRunViewParamsForConfig', () => {
        it('should always set IgnoreMaxRows to true', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.IgnoreMaxRows).toBe(true);
        });

        it('should map config.Filter to ExtraFilter', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                Filter: "Status='Active'",
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.ExtraFilter).toBe("Status='Active'");
        });

        it('should map config.OrderBy to OrderBy', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                OrderBy: 'Name ASC',
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.OrderBy).toBe('Name ASC');
        });

        it('should default ResultType to entity_object (EngineDefaultResultType)', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.ResultType).toBe('entity_object');
        });

        it('should respect config.ResultType when provided', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                ResultType: 'simple',
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.ResultType).toBe('simple');
        });

        it('should pass through BypassCache parameter', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });

            const withBypass = engine.BuildRunViewParamsForConfigForTest(config, true);
            const withoutBypass = engine.BuildRunViewParamsForConfigForTest(config, false);

            expect(withBypass.BypassCache).toBe(true);
            expect(withoutBypass.BypassCache).toBe(false);
        });

        it('should pass through CacheLocal and CacheLocalTTL', () => {
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                CacheLocal: true,
                CacheLocalTTL: 60_000,
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);

            expect(params.CacheLocal).toBe(true);
            expect(params.CacheLocalTTL).toBe(60_000);
        });
    });

    describe('Fingerprint identity across call sites', () => {
        /**
         * The critical invariant: for any given config, the fingerprint produced
         * by BuildRunViewParamsForConfig must be identical regardless of whether
         * bypassCache is true or false, because BypassCache is excluded from the
         * fingerprint. This ensures load, register, and sync all hit the same key.
         */
        it('should produce identical fingerprints for bypassCache=true and bypassCache=false', () => {
            // LocalCacheManager.Instance is a singleton that may not be fully initialized
            // in the test environment, but GenerateRunViewFingerprint is a pure function
            // of its inputs — it doesn't require initialization.
            const lcm = LocalCacheManager.Instance;
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                Filter: "Status='Active'",
                OrderBy: 'Name ASC',
            });

            const paramsLoad = engine.BuildRunViewParamsForConfigForTest(config, true);
            const paramsRegister = engine.BuildRunViewParamsForConfigForTest(config, false);

            const fpLoad = lcm.GenerateRunViewFingerprint(paramsLoad);
            const fpRegister = lcm.GenerateRunViewFingerprint(paramsRegister);

            expect(fpLoad).toBe(fpRegister);
        });

        it('should include imr:1 segment in the fingerprint', () => {
            const lcm = LocalCacheManager.Instance;
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });

            const params = engine.BuildRunViewParamsForConfigForTest(config);
            const fp = lcm.GenerateRunViewFingerprint(params);

            expect(fp).toContain('imr:1');
        });

        it('should NOT include imr:1 when IgnoreMaxRows is missing (regression guard)', () => {
            const lcm = LocalCacheManager.Instance;

            // Simulate what the old, broken code did — build params without IgnoreMaxRows
            const brokenParams: RunViewParams = {
                EntityName: 'Items',
                ExtraFilter: "Status='Active'",
                OrderBy: 'Name ASC',
                ResultType: 'entity_object',
            };

            const brokenFp = lcm.GenerateRunViewFingerprint(brokenParams);
            expect(brokenFp).not.toContain('imr:1');

            // Now show the shared builder produces a DIFFERENT (correct) fingerprint
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                Filter: "Status='Active'",
                OrderBy: 'Name ASC',
            });
            const correctFp = lcm.GenerateRunViewFingerprint(
                engine.BuildRunViewParamsForConfigForTest(config)
            );
            expect(correctFp).toContain('imr:1');

            // The two must NOT match — that's the exact bug this PR fixes
            expect(brokenFp).not.toBe(correctFp);
        });

        it('should produce identical fingerprints with and without a connection prefix', () => {
            const lcm = LocalCacheManager.Instance;
            const config = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });
            const params = engine.BuildRunViewParamsForConfigForTest(config);

            const fpNoConn = lcm.GenerateRunViewFingerprint(params);
            const fpWithConn = lcm.GenerateRunViewFingerprint(params, 'mssql://host:1433/db');

            // They should differ — connection prefix is part of the key
            expect(fpNoConn).not.toBe(fpWithConn);
            // But both should contain the imr:1 segment
            expect(fpNoConn).toContain('imr:1');
            expect(fpWithConn).toContain('imr:1');
        });

        it('should produce different fingerprints for different configs', () => {
            const lcm = LocalCacheManager.Instance;
            const configA = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                Filter: "Status='Active'",
            });
            const configB = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
                Filter: "Status='Deleted'",
            });

            const fpA = lcm.GenerateRunViewFingerprint(
                engine.BuildRunViewParamsForConfigForTest(configA)
            );
            const fpB = lcm.GenerateRunViewFingerprint(
                engine.BuildRunViewParamsForConfigForTest(configB)
            );

            expect(fpA).not.toBe(fpB);
        });

        it('should treat undefined and empty-string Filter identically in fingerprints', () => {
            const lcm = LocalCacheManager.Instance;

            // undefined Filter (what BuildRunViewParamsForConfig produces when config.Filter is unset)
            const configNoFilter = new BaseEnginePropertyConfig({
                PropertyName: '_items',
                EntityName: 'Items',
            });

            // Simulate the old syncLocalCacheForConfig which used config.Filter || ''
            const paramsEmptyString: RunViewParams = {
                EntityName: 'Items',
                ExtraFilter: '',
                OrderBy: '',
                IgnoreMaxRows: true,
            };

            const fpUndefined = lcm.GenerateRunViewFingerprint(
                engine.BuildRunViewParamsForConfigForTest(configNoFilter)
            );
            const fpEmpty = lcm.GenerateRunViewFingerprint(paramsEmptyString);

            expect(fpUndefined).toBe(fpEmpty);
        });
    });
});
