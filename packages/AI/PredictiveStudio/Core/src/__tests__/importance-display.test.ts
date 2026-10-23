import { describe, it, expect } from 'vitest';
import { ImportanceDisplay } from '../importance-display';

const lineage = (kind: string | undefined): string => JSON.stringify({ evaluation: kind === undefined ? {} : { ImportanceKind: kind } });

describe('ImportanceDisplay.GlobalDriversShowable', () => {
  it('shows coefficient importance', () => expect(ImportanceDisplay.GlobalDriversShowable(lineage('coefficient'))).toBe(true));
  it('hides split/impurity importance', () => expect(ImportanceDisplay.GlobalDriversShowable(lineage('split_or_impurity'))).toBe(false));
  it('hides a model with no stored kind (trained before the kind was recorded)', () => {
    expect(ImportanceDisplay.GlobalDriversShowable(lineage(undefined))).toBe(false);
    expect(ImportanceDisplay.GlobalDriversShowable(null)).toBe(false);
  });
});
