import { vi } from 'vitest';

interface RunViewResult<T = unknown> {
  Success: boolean;
  Results: T[];
  ErrorMessage?: string;
  TotalRowCount?: number;
  RowCount: number;
  Metrics?: Record<string, unknown>;
}

type RunViewMockMap = Map<string, unknown[]>;

let _mockResponses: RunViewMockMap = new Map();

/**
 * Configure mock responses for RunView calls.
 * Responses are keyed by entity name (case-insensitive).
 *
 * @param responses Map of entity name to array of result objects
 *
 * @example
 * ```ts
 * mockRunView(new Map([
 *   ['Users', [{ ID: '1', Name: 'Test User' }]],
 *   ['MJ: AI Models', [{ ID: '2', Name: 'GPT-4' }]],
 * ]));
 * ```
 */
export function mockRunView(responses: RunViewMockMap): void {
  _mockResponses = new Map(
    [...responses.entries()].map(([k, v]) => [k.toLowerCase(), v])
  );
}

/**
 * Create a mock RunView instance that returns configured test data.
 * Use with vi.mock() to replace the real RunView.
 */
export function createMockRunViewClass() {
  return class MockRunView {
    async RunView<T = unknown>(params: { EntityName?: string; ExtraFilter?: string }): Promise<RunViewResult<T>> {
      const entityName = params.EntityName?.toLowerCase() ?? '';
      const results = (_mockResponses.get(entityName) ?? []) as T[];
      return {
        Success: true,
        Results: results,
        RowCount: results.length,
        TotalRowCount: results.length,
      };
    }

    async RunViews<T = unknown>(paramsList: Array<{ EntityName?: string }>): Promise<Array<RunViewResult<T>>> {
      const results: Array<RunViewResult<T>> = [];
      for (const params of paramsList) {
        results.push(await this.RunView<T>(params));
      }
      return results;
    }
  };
}

/**
 * Configure mock responses for batch RunViews calls.
 * Same as mockRunView but semantically indicates batch usage.
 */
export function mockRunViews(responses: RunViewMockMap): void {
  mockRunView(responses);
}

/**
 * Reset all RunView mock responses.
 */
export function resetRunViewMocks(): void {
  _mockResponses = new Map();
}
