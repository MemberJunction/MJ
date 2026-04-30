/**
 * Search Validation Tests
 *
 * Tests for:
 * - search-availability-check: Guards on utilities.search access
 * - search-call-validation: Argument validation for Search() and PreviewSearch()
 * - data-result-validation: Result usage validation for search results
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '../../lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

const baseSpec = {
  name: 'TestComponent',
  type: 'chart' as const,
  title: 'Test Component',
  description: 'Test component for search validation',
  code: '',
  location: 'embedded' as const,
  functionalRequirements: 'Test requirements',
  technicalDesign: 'Test design',
  exampleUsage: '<TestComponent />',
  dataRequirements: {
    mode: 'entities' as const,
    queries: [],
    entities: [],
  },
} as ComponentSpec;

// ── search-availability-check ──────────────────────────────────────

describe('search-availability-check', () => {
  it('should flag utilities.search.Search() without guard', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        const result = await utilities.search.Search({ Query: 'test' });
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-availability-check',
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('medium');
    expect(violation?.message).toContain('utilities.search');
  });

  it('should NOT flag utilities.search?.Search() (optional chaining)', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        const result = await utilities.search?.Search({ Query: 'test' });
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-availability-check',
    );
    expect(violation).toBeUndefined();
  });

  it('should NOT flag with if-guard', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.Search({ Query: 'test' });
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-availability-check',
    );
    expect(violation).toBeUndefined();
  });
});

// ── search-call-validation ─────────────────────────────────────────

describe('search-call-validation', () => {
  it('should flag Search() with missing Query property', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.Search({ MaxResults: 10 });
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-call-validation' && v.message.includes('Query'),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('critical');
  });

  it('should flag Search() with invalid property names', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.Search({
            Query: 'test',
            Limit: 10,
          });
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-call-validation' && v.message.includes('Limit'),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('high');
  });

  it('should flag PreviewSearch() with non-string first arg', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.PreviewSearch(42);
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-call-validation' && v.message.includes('query string'),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('high');
  });

  it('should allow valid Search() call', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.Search({
            Query: 'find employees',
            MaxResults: 20,
            MinScore: 0.5,
            Filters: {
              EntityNames: ['Employees'],
              SourceTypes: ['Vector', 'FullText'],
            },
          });
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-call-validation',
    );
    expect(violation).toBeUndefined();
  });

  it('should allow valid PreviewSearch() call', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const result = await utilities.search.PreviewSearch('employees', 5);
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'search-call-validation',
    );
    expect(violation).toBeUndefined();
  });
});

// ── data-result-validation for search results ──────────────────────

describe('data-result-validation for search results', () => {
  it('should flag searchResult.data (invalid property, should be .Results)', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const searchResult = await utilities.search.Search({ Query: 'test' });
          const items = searchResult.data;
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'data-result-validation' && v.message.includes('data') && v.message.includes('Results'),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('critical');
  });

  it('should flag direct searchResult.map() (must use .Results.map())', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const searchResult = await utilities.search.Search({ Query: 'test' });
          const items = searchResult.map(r => r.name);
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const violation = lintResult.violations.find(
      (v) => v.rule === 'data-result-validation' && v.message.includes('map') && v.message.includes('Results'),
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('critical');
  });

  it('should NOT flag searchResult.Results with Success guard', async () => {
    const code = `
      async function TestComponent({ utilities }) {
        if (utilities.search) {
          const searchResult = await utilities.search.Search({ Query: 'test' });
          if (searchResult.Success) {
            const items = searchResult.Results;
          }
        }
        return React.createElement('div', null, 'done');
      }
    `;

    const lintResult = await ComponentLinter.lintComponent(code, 'TestComponent', baseSpec, true);

    const successViolation = lintResult.violations.find(
      (v) => v.rule === 'data-result-validation' && v.message.includes('Success') && v.message.includes('searchResult'),
    );
    expect(successViolation).toBeUndefined();
  });
});
