/**
 * Populated-first related sections (#5087) are off by default and a form opts in. The container
 * waits until the counts have loaded, gathers the empty related groups once, and keeps that
 * gathering for the record so the rail does not move again as counts change.
 */
// The container's import graph reaches partially-compiled Angular libraries
// (@angular/common), which need the JIT compiler present under the node preset.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { FormRole } from '@memberjunction/core';
import { MjRecordFormContainerComponent } from '../record-form-container.component';
import { FormChromeCoordinator } from '../../chrome/form-chrome-coordinator.service';
import { DETAILS_SECTION_KEY, type FormChromeSpec } from '../../chrome/form-chrome';
import { NO_RECORDS_GROUP_KEY } from '../../chrome/resolve-form-chrome';

const counts: Record<string, number> = { orders: 0, tickets: 3, payments: 0 };

function spec(): FormChromeSpec {
  const group = (key: string) => ({ Key: key, Title: key, Icon: 'fa fa-table', SectionKeys: [key], IsMore: false });
  return {
    Layout: 'left-nav',
    Groups: [{ ...group(DETAILS_SECTION_KEY), SectionKeys: ['identity'] }, group('orders'), group('tickets'), group('payments')],
    RelatedRoles: new Map<string, FormRole>([['orders', 'Primary'], ['tickets', 'Primary'], ['payments', 'Primary']]),
    MoreSectionKeys: [],
  };
}

interface Harness { Apply(s: FormChromeSpec): boolean; SetPhase(p: string): void }

function harness(optIn: boolean): Harness {
  const record = { IsSaved: true, EntityInfo: { Name: 'Sample: People' }, PrimaryKey: { ToURLSegment: () => 'ID|1' } };
  const form = { record, PopulatedRelatedSectionsFirst: optIn, PeekSectionRowCount: (key: string) => counts[key] };
  const container = Object.create(MjRecordFormContainerComponent.prototype) as MjRecordFormContainerComponent;
  Object.assign(container, { chrome: new FormChromeCoordinator(), _formComponent: form, relatedOrderLatch: null, countPhase: 'loading' });
  const priv = container as unknown as { applyPopulatedFirst(s: FormChromeSpec): boolean; countPhase: string };
  return { Apply: (s) => priv.applyPopulatedFirst(s), SetPhase: (p) => { priv.countPhase = p; } };
}

const keys = (s: FormChromeSpec) => s.Groups.map((g) => g.Key);

describe('MjRecordFormContainerComponent populated-first related sections', () => {
  it('waits for the counts, gathers the empty groups once, then keeps that order', () => {
    const h = harness(true);
    const first = spec();
    expect(h.Apply(first)).toBe(false);
    expect(keys(first)).toEqual([DETAILS_SECTION_KEY, 'orders', 'tickets', 'payments']);

    h.SetPhase('loaded');
    const second = spec();
    expect(h.Apply(second)).toBe(true);
    expect(keys(second)).toEqual([DETAILS_SECTION_KEY, 'tickets', NO_RECORDS_GROUP_KEY]);

    counts['orders'] = 2; // a row added later does not move the rail again
    const third = spec();
    expect(h.Apply(third)).toBe(false);
    expect(keys(third)).toEqual([DETAILS_SECTION_KEY, 'tickets', NO_RECORDS_GROUP_KEY]);
    counts['orders'] = 0;
  });

  it('leaves the order alone when the form has not opted in', () => {
    const h = harness(false);
    h.SetPhase('loaded');
    const s = spec();
    expect(h.Apply(s)).toBe(false);
    expect(keys(s)).toEqual([DETAILS_SECTION_KEY, 'orders', 'tickets', 'payments']);
  });
});
