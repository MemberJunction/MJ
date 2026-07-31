/**
 * @fileoverview Base engine for test metadata management
 * @module @memberjunction/testing-engine-base
 */

import {
    BaseEngine,
    BaseEntity,
    IMetadataProvider,
    UserInfo
} from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import {
    MJTestTypeEntity,
    MJTestEntity,
    MJTestSuiteEntity,
    MJTestRubricEntity,
    MJTestSuiteTestEntity
} from '@memberjunction/core-entities';

/**
 * Base engine for test framework metadata management.
 *
 * This class handles loading and caching test metadata (types, tests, suites, rubrics).
 * It does NOT contain execution logic - that's in TestEngine.
 * This separation allows the metadata to be safely used in UI contexts.
 *
 * Follows pattern from ActionEngineBase, SchedulingEngineBase.
 *
 * @example
 * ```typescript
 * const engine = TestEngineBase.Instance;
 * await engine.Config(false, contextUser);
 * const types = engine.TestTypes;
 * const tests = engine.Tests;
 * ```
 */
export class TestEngineBase extends BaseEngine<TestEngineBase> {
    private _testTypes: MJTestTypeEntity[] = [];
    private _tests: MJTestEntity[] = [];
    private _testSuites: MJTestSuiteEntity[] = [];
    private _testSuiteTests: MJTestSuiteTestEntity[] = [];
    private _testRubrics: MJTestRubricEntity[] = [];
    private _testOutputTypes: BaseEntity[] = [];

    /**
     * Singleton instance accessor
     */
    public static get Instance(): TestEngineBase {
        return super.getInstance<TestEngineBase>();
    }

    /**
     * All loaded test types
     */
    public get TestTypes(): MJTestTypeEntity[] {
        return this._testTypes;
    }

    /**
     * All loaded tests
     */
    public get Tests(): MJTestEntity[] {
        return this._tests;
    }

    /**
     * All loaded test suites
     */
    public get TestSuites(): MJTestSuiteEntity[] {
        return this._testSuites;
    }

    /**
     * All loaded test suite tests
     */
    public get TestSuiteTests(): MJTestSuiteTestEntity[] {
        return this._testSuiteTests;
    }

    /**
     * All loaded test rubrics
     */
    public get TestRubrics(): MJTestRubricEntity[] {
        return this._testRubrics;
    }

    /**
     * All loaded test run output types
     */
    public get TestOutputTypes(): BaseEntity[] {
        return this._testOutputTypes;
    }

    /**
     * Configure and load metadata
     *
     * @param forceRefresh - Force reload even if already loaded
     * @param contextUser - User context for data access
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const params = [
            {
                PropertyName: '_testTypes',
                EntityName: 'MJ: Test Types',
                CacheLocal: true
            },
            {
                PropertyName: '_tests',
                EntityName: 'MJ: Tests',
                CacheLocal: true
            },
            {
                PropertyName: '_testSuites',
                EntityName: 'MJ: Test Suites',
                CacheLocal: true
            },
            {
                PropertyName: '_testRubrics',
                EntityName: 'MJ: Test Rubrics',
                CacheLocal: true
            },
            {
                PropertyName: '_testSuiteTests',
                EntityName: 'MJ: Test Suite Tests',
                CacheLocal: true
            },
            {
                PropertyName: '_testOutputTypes',
                EntityName: 'MJ: Test Run Output Types',
                CacheLocal: true
            }
        ];
        return await this.Load(params, provider!, forceRefresh, contextUser);
    }

    /**
     * Get test type by ID
     */
    public GetTestTypeByID(id: string): MJTestTypeEntity | undefined {
        return this._testTypes.find(t => UUIDsEqual(t.ID, id));
    }

    /**
     * Get test type by name
     */
    public GetTestTypeByName(name: string): MJTestTypeEntity | undefined {
        return this._testTypes.find(t => t.Name === name);
    }

    /**
     * Get test by ID
     */
    public GetTestByID(id: string): MJTestEntity | undefined {
        return this._tests.find(t => UUIDsEqual(t.ID, id));
    }

    /**
     * Get test by name
     */
    public GetTestByName(name: string): MJTestEntity | undefined {
        return this._tests.find(t => t.Name === name);
    }

    /**
     * Get test suite by ID
     */
    public GetTestSuiteByID(id: string): MJTestSuiteEntity | undefined {
        return this._testSuites.find(s => UUIDsEqual(s.ID, id));
    }

    /**
     * Get test suite by name
     */
    public GetTestSuiteByName(name: string): MJTestSuiteEntity | undefined {
        return this._testSuites.find(s => s.Name === name);
    }

    /**
     * Get test rubric by ID
     */
    public GetTestRubricByID(id: string): MJTestRubricEntity | undefined {
        return this._testRubrics.find(r => UUIDsEqual(r.ID, id));
    }

    /**
     * Get test rubric by name
     */
    public GetTestRubricByName(name: string): MJTestRubricEntity | undefined {
        return this._testRubrics.find(r => r.Name === name);
    }

    /**
     * Get tests by type
     */
    public GetTestsByType(typeId: string): MJTestEntity[] {
        return this._tests.filter(t => UUIDsEqual(t.TypeID, typeId));
    }

    /**
     * Get tests by tag
     */
    public GetTestsByTag(tag: string): MJTestEntity[] {
        return this._tests.filter(t => {
            if (!t.Tags) return false;
            try {
                const tags = JSON.parse(t.Tags) as string[];
                return tags.includes(tag);
            } catch {
                return false;
            }
        });
    }

    /**
     * Returns all of the tests associated with a given test suite, sorted by their sequence.
     * @param suiteId 
     * @returns 
     */
    public GetTestsForSuite(suiteId: string): MJTestEntity[] {
        // DR-D9: index once (O(n)) so membership lookup and the sort comparator
        // are O(1) each. The previous version called GetTestByID (a linear scan)
        // inside the loop AND ran two `suiteTests.find()` per sort comparison —
        // O(n²·log n) overall for a large suite.
        const testById = new Map<string, MJTestEntity>();
        for (const t of this._tests) {
            testById.set(NormalizeUUID(t.ID), t);
        }
        const seqByTestId = new Map<string, number>();
        const tests: MJTestEntity[] = [];
        for (const st of this._testSuiteTests) {
            if (!UUIDsEqual(st.SuiteID, suiteId)) {
                continue;
            }
            seqByTestId.set(NormalizeUUID(st.TestID), st.Sequence);
            const test = testById.get(NormalizeUUID(st.TestID));
            if (test) {
                tests.push(test);
            }
        }
        return tests.sort(
            (a, b) => (seqByTestId.get(NormalizeUUID(a.ID)) ?? 0) - (seqByTestId.get(NormalizeUUID(b.ID)) ?? 0)
        );
    }

    /**
     * Get active tests (Status = 'Active')
     */
    public GetActiveTests(): MJTestEntity[] {
        return this._tests.filter(t => t.Status === 'Active');
    }

    /**
     * Get active test suites (Status = 'Active')
     */
    public GetActiveTestSuites(): MJTestSuiteEntity[] {
        return this._testSuites.filter(s => s.Status === 'Active');
    }
}
