import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';

/**
 * A fake provider whose batched `RunViews` answer each model's read only when the test releases it, so a test can
 * change a component's `Model` while an earlier model's read is still in flight and finish the reads in any order
 * (M7-3). The read's model is the first `ModelID='…'` its views filter on.
 */
export class GatedReads {
  private readonly waiting = new Map<string, () => void>();

  /** @param rowsOf the rows each view of a model's read returns */
  constructor(private readonly rowsOf: (modelId: string, params: RunViewParams) => object[]) {}

  /** The provider to render the component with. */
  public Provider(): IMetadataProvider {
    const provider = CreateFakeProvider({});
    return Object.assign(provider, { RunViews: (all: RunViewParams[]): Promise<RunViewResult[]> => this.read(all) });
  }

  /** Lets the pending read of `modelId` answer. */
  public Release(modelId: string): void {
    const release = this.waiting.get(modelId);
    if (!release) throw new Error(`GatedReads: no read of ${modelId} is pending`);
    this.waiting.delete(modelId);
    release();
  }

  private async read(all: RunViewParams[]): Promise<RunViewResult[]> {
    const filtered = all.map((p) => /ModelID='([^']+)'/.exec(typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '')).find((m) => m !== null);
    const modelId = filtered ? filtered[1] : '';
    await new Promise<void>((resolve) => this.waiting.set(modelId, resolve));
    return all.map((p): RunViewResult => {
      const rows = this.rowsOf(modelId, p);
      return { Success: true, ErrorMessage: '', Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0 };
    });
  }
}

/** Lets pending promise callbacks run (a few macrotask turns). */
export async function SettleReads(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
