/**
 * @fileoverview Base engine for test metadata management
 * @module @memberjunction/testing-engine-base
 */

import {
    BaseEngine,
    IMetadataProvider,
    UserInfo
} from '@memberjunction/core';
import {
    TestTypeEntity,
    TestEntity,
    TestSuiteEntity,
    TestRubricEntity
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
    private _testTypes: TestTypeEntity[] = [];
    private _tests: TestEntity[] = [];
    private _testSuites: TestSuiteEntity[] = [];
    private _testRubrics: TestRubricEntity[] = [];

    /**
     * Singleton instance accessor
     */
    public static get Instance(): TestEngineBase {
        return super.getInstance<TestEngineBase>();
    }

    /**
     * All loaded test types
     */
    public get TestTypes(): TestTypeEntity[] {
        return this._testTypes;
    }

    /**
     * All loaded tests
     */
    public get Tests(): TestEntity[] {
        return this._tests;
    }

    /**
     * All loaded test suites
     */
    public get TestSuites(): TestSuiteEntity[] {
        return this._testSuites;
    }

    /**
     * All loaded test rubrics
     */
    public get TestRubrics(): TestRubricEntity[] {
        return this._testRubrics;
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
                EntityName: 'MJ: Test Types'
            },
            {
                PropertyName: '_tests',
                EntityName: 'MJ: Tests'
            },
            {
                PropertyName: '_testSuites',
                EntityName: 'MJ: Test Suites'
            },
            {
                PropertyName: '_testRubrics',
                EntityName: 'MJ: Test Rubrics'
            }
        ];
        return await this.Load(params, provider, forceRefresh, contextUser);
    }

    /**
     * Get test type by ID
     */
    public GetTestTypeByID(id: string): TestTypeEntity | undefined {
        return this._testTypes.find(t => t.ID === id);
    }

    /**
     * Get test type by name
     */
    public GetTestTypeByName(name: string): TestTypeEntity | undefined {
        return this._testTypes.find(t => t.Name === name);
    }

    /**
     * Get test by ID
     */
    public GetTestByID(id: string): TestEntity | undefined {
        return this._tests.find(t => t.ID === id);
    }

    /**
     * Get test by name
     */
    public GetTestByName(name: string): TestEntity | undefined {
        return this._tests.find(t => t.Name === name);
    }

    /**
     * Get test suite by ID
     */
    public GetTestSuiteByID(id: string): TestSuiteEntity | undefined {
        return this._testSuites.find(s => s.ID === id);
    }

    /**
     * Get test suite by name
     */
    public GetTestSuiteByName(name: string): TestSuiteEntity | undefined {
        return this._testSuites.find(s => s.Name === name);
    }

    /**
     * Get test rubric by ID
     */
    public GetTestRubricByID(id: string): TestRubricEntity | undefined {
        return this._testRubrics.find(r => r.ID === id);
    }

    /**
     * Get test rubric by name
     */
    public GetTestRubricByName(name: string): TestRubricEntity | undefined {
        return this._testRubrics.find(r => r.Name === name);
    }

    /**
     * Get tests by type
     */
    public GetTestsByType(typeId: string): TestEntity[] {
        return this._tests.filter(t => t.TypeID === typeId);
    }

    /**
     * Get tests by tag
     */
    public GetTestsByTag(tag: string): TestEntity[] {
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
     * Get active tests (Status = 'Active')
     */
    public GetActiveTests(): TestEntity[] {
        return this._tests.filter(t => t.Status === 'Active');
    }

    /**
     * Get active test suites (Status = 'Active')
     */
    public GetActiveTestSuites(): TestSuiteEntity[] {
        return this._testSuites.filter(s => s.Status === 'Active');
    }
}
