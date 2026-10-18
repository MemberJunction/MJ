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
export function MockRunView(responses: RunViewMockMap): void {
  _mockResponses = new Map(
    [...responses.entries()].map(([k, v]) => [k.toLowerCase(), v])
  );
}

/** @deprecated Use {@link MockRunView}. */
export function mockRunView(responses: RunViewMockMap): void {
  return MockRunView(responses);
}

/**
 * Create a mock RunView instance that returns configured test data.
 * Use with vi.mock() to replace the real RunView.
 */
export function CreateMockRunViewClass() {
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

/** @deprecated Use {@link CreateMockRunViewClass}. */
export function createMockRunViewClass() {
  return CreateMockRunViewClass();
}

/**
 * Configure mock responses for batch RunViews calls.
 * Same as mockRunView but semantically indicates batch usage.
 */
export function MockRunViews(responses: RunViewMockMap): void {
  MockRunView(responses);
}

/** @deprecated Use {@link MockRunViews}. */
export function mockRunViews(responses: RunViewMockMap): void {
  return MockRunViews(responses);
}

/**
 * Reset all RunView mock responses.
 */
export function ResetRunViewMocks(): void {
  _mockResponses = new Map();
}

/** @deprecated Use {@link ResetRunViewMocks}. */
export function resetRunViewMocks(): void {
  return ResetRunViewMocks();
}
