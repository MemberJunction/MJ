/**
 * TabService's record-URL replacement mark: after a record is deleted, the URL
 * sync leaving that record's URL replaces its history entry (so browser Back
 * can't reopen a deleted record). The mark is keyed by the record, not by "the
 * next sync", and is consumed exactly once.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
}));

import { TabService } from '../tab.service';

describe('TabService record URL replacement', () => {
  it('replaces nothing without a mark', () => {
    const service = new TabService();
    expect(service.ConsumeRecordUrlReplacement('MJ: Widgets', 'w1')).toBe(false);
  });

  it('replaces only when leaving the marked record, then clears the mark', () => {
    const service = new TabService();
    service.MarkRecordUrlForReplacement('MJ: Widgets', 'w1');

    // An unrelated sync landing first must not consume the mark.
    expect(service.ConsumeRecordUrlReplacement('MJ: Widgets', 'w2')).toBe(false);

    expect(service.ConsumeRecordUrlReplacement('mj: widgets', 'W1')).toBe(true);
    expect(service.ConsumeRecordUrlReplacement('MJ: Widgets', 'w1')).toBe(false);
  });

  it('keeps only the latest mark', () => {
    const service = new TabService();
    service.MarkRecordUrlForReplacement('MJ: Widgets', 'w1');
    service.MarkRecordUrlForReplacement('MJ: Widgets', 'w2');
    expect(service.ConsumeRecordUrlReplacement('MJ: Widgets', 'w1')).toBe(false);
    expect(service.ConsumeRecordUrlReplacement('MJ: Widgets', 'w2')).toBe(true);
  });
});
