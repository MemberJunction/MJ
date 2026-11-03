import { describe, it, expect } from 'vitest';
import { FormChromeCoordinator } from '../form-chrome-coordinator.service';
import { MORE_SECTION_KEY, type FormChromeSpec } from '../form-chrome';

const spec = (): FormChromeSpec => ({
  Layout: 'left-nav',
  Groups: [
    { Key: 'details', Title: 'Details', Icon: 'fa-solid fa-list', SectionKeys: ['identity'], IsMore: false },
    { Key: 'payments', Title: 'Payments', Icon: 'fa-solid fa-table', SectionKeys: ['payments'], IsMore: false },
    { Key: MORE_SECTION_KEY, Title: 'More', Icon: 'fa-solid fa-folder', SectionKeys: ['audit', 'logs'], IsMore: true },
  ],
  RelatedRoles: new Map(),
  MoreSectionKeys: ['audit', 'logs'],
});

describe('FormChromeCoordinator.Apply', () => {
  it('keeps a More child active across a re-resolve (a child is a valid active key, not just a group)', () => {
    const c = new FormChromeCoordinator();
    c.Apply(spec());
    c.SetActiveGroup('audit');
    expect(c.MoreExpanded).toBe(true);
    c.Apply(spec());
    expect(c.ActiveGroupKey).toBe('audit');
  });

  it('still falls back to the first group when the active key is gone from the new spec', () => {
    const c = new FormChromeCoordinator();
    c.Apply(spec());
    c.SetActiveGroup('logs');
    const next = spec();
    next.Groups[2].SectionKeys = ['audit'];
    next.MoreSectionKeys = ['audit'];
    c.Apply(next);
    expect(c.ActiveGroupKey).toBe('details');
  });
});
