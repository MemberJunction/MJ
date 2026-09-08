import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  BaseEngine: class {
    protected async Load() {}
    static getInstance<T>(): T {
      return new (this as unknown as new () => T)();
    }
  },
  UserInfo: class {},
  IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJTestTypeEntity: class {},
  MJTestEntity: class {},
  MJTestSuiteEntity: class {},
  MJTestRubricEntity: class {},
  MJTestSuiteTestEntity: class {},
}));

import { TestEngineBase } from '../TestEngineBase';

describe('TestEngineBase', () => {
  let engine: TestEngineBase;

  beforeEach(() => {
    engine = new TestEngineBase();
  });

  describe('initial state', () => {
    it('should have empty TestTypes array', () => {
      expect(engine.TestTypes).toEqual([]);
    });

    it('should have empty Tests array', () => {
      expect(engine.Tests).toEqual([]);
    });

    it('should have empty TestSuites array', () => {
      expect(engine.TestSuites).toEqual([]);
    });

    it('should have empty TestSuiteTests array', () => {
      expect(engine.TestSuiteTests).toEqual([]);
    });

    it('should have empty TestRubrics array', () => {
      expect(engine.TestRubrics).toEqual([]);
    });
  });

  describe('GetTestTypeByID', () => {
    it('should return undefined when no types loaded', () => {
      expect(engine.GetTestTypeByID('some-id')).toBeUndefined();
    });
  });

  describe('GetTestTypeByName', () => {
    it('should return undefined when no types loaded', () => {
      expect(engine.GetTestTypeByName('Agent Test')).toBeUndefined();
    });
  });

  describe('GetTestByID', () => {
    it('should return undefined when no tests loaded', () => {
      expect(engine.GetTestByID('test-123')).toBeUndefined();
    });
  });

  describe('GetTestByName', () => {
    it('should return undefined when no tests loaded', () => {
      expect(engine.GetTestByName('My Test')).toBeUndefined();
    });
  });

  describe('GetTestSuiteByID', () => {
    it('should return undefined when no suites loaded', () => {
      expect(engine.GetTestSuiteByID('suite-123')).toBeUndefined();
    });
  });

  describe('GetTestSuiteByName', () => {
    it('should return undefined when no suites loaded', () => {
      expect(engine.GetTestSuiteByName('Auth Suite')).toBeUndefined();
    });
  });

  describe('GetTestRubricByID', () => {
    it('should return undefined when no rubrics loaded', () => {
      expect(engine.GetTestRubricByID('rubric-123')).toBeUndefined();
    });
  });

  describe('GetTestRubricByName', () => {
    it('should return undefined when no rubrics loaded', () => {
      expect(engine.GetTestRubricByName('Default Rubric')).toBeUndefined();
    });
  });

  describe('GetTestsByType', () => {
    it('should return empty array when no tests loaded', () => {
      expect(engine.GetTestsByType('type-123')).toEqual([]);
    });
  });

  describe('GetTestsByTag', () => {
    it('should return empty array when no tests loaded', () => {
      expect(engine.GetTestsByTag('auth')).toEqual([]);
    });
  });

  describe('GetTestsForSuite', () => {
    it('should return empty array when no suite tests loaded', () => {
      expect(engine.GetTestsForSuite('suite-123')).toEqual([]);
    });

    // The O(n) rewrite must preserve behavior — only this suite's tests,
    // sorted by Sequence, dropping join rows whose test doesn't exist.
    it('returns only the suite members, ordered by sequence', () => {
      const inject = engine as unknown as {
        _tests: Array<{ ID: string; Name: string }>;
        _testSuiteTests: Array<{ SuiteID: string; TestID: string; Sequence: number }>;
      };
      inject._tests = [
        { ID: 'a', Name: 'A' },
        { ID: 'b', Name: 'B' },
        { ID: 'c', Name: 'C' },
        { ID: 'x', Name: 'OtherSuite' },
      ];
      inject._testSuiteTests = [
        { SuiteID: 's1', TestID: 'c', Sequence: 3 },
        { SuiteID: 's1', TestID: 'a', Sequence: 1 },
        { SuiteID: 's1', TestID: 'b', Sequence: 2 },
        { SuiteID: 's2', TestID: 'x', Sequence: 1 }, // other suite — excluded
        { SuiteID: 's1', TestID: 'ghost', Sequence: 4 }, // no matching test — dropped
      ];
      expect(engine.GetTestsForSuite('s1').map(t => t.Name)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('GetActiveTests', () => {
    it('should return empty array when no tests loaded', () => {
      expect(engine.GetActiveTests()).toEqual([]);
    });
  });

  describe('GetActiveTestSuites', () => {
    it('should return empty array when no suites loaded', () => {
      expect(engine.GetActiveTestSuites()).toEqual([]);
    });
  });
});
