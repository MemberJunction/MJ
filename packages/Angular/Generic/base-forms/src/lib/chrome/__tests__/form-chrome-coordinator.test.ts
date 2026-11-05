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

describe('FormChromeCoordinator chrome-rule suppression', () => {
    it('answers undefined while the rules are pending', () => {
        const c = new FormChromeCoordinator();
        expect(c.RulesResolved).toBe(false);
        expect(c.IsSuppressed('orders')).toBeUndefined();
        expect(c.Suppression.RulesResolved).toBe(false);
    });

    it('answers true for a suppressed key and false for any other once resolved', () => {
        const c = new FormChromeCoordinator();
        c.SetSuppressed(['orders']);
        expect(c.IsSuppressed('orders')).toBe(true);
        expect(c.IsSuppressed('payments')).toBe(false);
        expect([...c.Suppression.SuppressedSectionKeys]).toEqual(['orders']);
    });

    it('resolves with nothing suppressed when the entity has no rules', () => {
        const c = new FormChromeCoordinator();
        c.SetSuppressed([]);
        expect(c.RulesResolved).toBe(true);
        expect(c.IsSuppressed('orders')).toBe(false);
    });

    it('goes back to pending on reset', () => {
        const c = new FormChromeCoordinator();
        c.SetSuppressed(['orders']);
        c.ResetSuppression();
        expect(c.IsSuppressed('orders')).toBeUndefined();
    });

    it('hides a suppressed section in accordion layout too', () => {
        const c = new FormChromeCoordinator();
        c.Apply({ Layout: 'accordion', Groups: [], RelatedRoles: new Map(), MoreSectionKeys: [] });
        expect(c.IsAccordionSectionVisible('orders')).toBe(true);
        c.SetSuppressed(['orders']);
        expect(c.IsAccordionSectionVisible('orders')).toBe(false);
        expect(c.IsAccordionSectionVisible('payments')).toBe(true);
    });
});
