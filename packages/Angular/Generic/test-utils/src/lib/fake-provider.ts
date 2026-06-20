import { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';

/**
 * Options for {@link createFakeProvider}.
 *
 * @typeParam T - the row shape your `RunView` calls return (inferred from `runViewResults`).
 */
export interface FakeProviderOptions<T = unknown> {
  /**
   * Rows any `RunView` / `RunViews` call returns — a fixed array (same for every call) or a
   * function of the params (to vary by `EntityName` / `ExtraFilter`).
   */
  runViewResults?: T[] | ((params: RunViewParams) => T[]);
  /** The provider's `CurrentUser`. Merged over a stub default. */
  currentUser?: Partial<UserInfo>;
}

/**
 * Build a fake `IMetadataProvider` for DOM specs of **data-bound** components — the ones
 * that read data through the `@Input() Provider` / `ProviderToUse` pattern. Pass it via
 * the component's `Provider` input; its `RunView` returns your canned rows, and because
 * `RunView.FromMetadataProvider(provider)` delegates to the provider, calls like
 * `RunView.FromMetadataProvider(this.ProviderToUse).RunView(...)` resolve to that data —
 * no backend, no `vi.mock` of `@memberjunction/core`.
 *
 * @example
 * const provider = createFakeProvider({ runViewResults: [{ ID: '1', Name: 'Ada' }] }); // T inferred
 * const f = renderComponentFixture(MyDataComponent, { inputs: { Provider: provider } });
 */
export function createFakeProvider<T = unknown>(options: FakeProviderOptions<T> = {}): IMetadataProvider {
  const rowsFor = (params: RunViewParams): T[] =>
    typeof options.runViewResults === 'function' ? options.runViewResults(params) : (options.runViewResults ?? []);

  const toResult = (rows: T[]): RunViewResult => ({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length }) as RunViewResult;

  const fake = {
    CurrentUser: { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com', ...options.currentUser },
    RunView: async (params: RunViewParams): Promise<RunViewResult> => toResult(rowsFor(params)),
    RunViews: async (paramsList: RunViewParams[]): Promise<RunViewResult[]> => paramsList.map((p) => toResult(rowsFor(p))),
  };

  // `IMetadataProvider` is a large interface; this fake deliberately implements only the
  // slice components call in tests. Casting a partial to it requires `as unknown as` —
  // TypeScript itself demands it, and `@memberjunction/core` uses the identical pattern
  // (`RunView.FromMetadataProvider`: `provider as unknown as IRunViewProvider`). This is
  // the one justified seam — everything the caller touches above is fully typed.
  return fake as unknown as IMetadataProvider;
}
