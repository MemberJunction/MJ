import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text, hasClass } from '@memberjunction/ng-test-utils';
import type { AudienceSource } from '@memberjunction/lists-base';
import { AudienceSourceSummaryComponent } from './audience-source-summary.component';

// AudienceSourceSummaryComponent is module-declared (standalone: false). The template
// has two branches: the populated summary (@if Source && label) and the empty-state
// (@else). `label` is resolved asynchronously (name lookup) so we drive the populated
// branch by setting the public `label` field directly in `setup` (before the first CD —
// NG0100-safe), which keeps these tests deterministic and free of a backend round-trip.

const DECLARATIONS = [AudienceSourceSummaryComponent];

const listSource: AudienceSource = { kind: 'list', listId: 'list-1' };
const viewSource: AudienceSource = { kind: 'view', viewId: 'view-1' };
const adhocSource: AudienceSource = { kind: 'adhoc', entityName: 'Contacts', extraFilter: 'IsActive=1' };

describe('AudienceSourceSummaryComponent (DOM)', () => {
  describe('empty state', () => {
    it('renders the empty-state when no Source is set', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, { declarations: DECLARATIONS });
      expect(query(fixture, '.audience-summary--empty')).not.toBeNull();
      expect(text(fixture, '.audience-summary--empty')).toContain('No audience selected.');
    });

    it('renders the empty-state when a Source is set but the label has not resolved', () => {
      // Source set, label still null (resolve pending) → @else branch.
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: adhocSource },
        setup: (instance) => {
          instance.label = null;
        },
      });
      expect(query(fixture, '.audience-summary--empty')).not.toBeNull();
    });
  });

  describe('populated summary', () => {
    it('renders the resolved label and the list kind', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: listSource },
        setup: (instance) => {
          instance.label = 'VIP Donors Q4';
        },
      });
      expect(query(fixture, '.audience-summary--empty')).toBeNull();
      expect(text(fixture, '.audience-summary__name')).toContain('VIP Donors Q4');
      expect(text(fixture, '.audience-summary__kind')).toBe('List');
    });

    it('reflects the View kind label', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: viewSource },
        setup: (instance) => {
          instance.label = 'Active Contacts';
        },
      });
      expect(text(fixture, '.audience-summary__kind')).toBe('View');
    });

    it('reflects the Ad-hoc Filter kind label', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: adhocSource },
        setup: (instance) => {
          instance.label = 'Custom filter';
        },
      });
      expect(text(fixture, '.audience-summary__kind')).toBe('Ad-hoc Filter');
    });

    it('shows the record count when RecordCount is provided', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: listSource, RecordCount: 348 },
        setup: (instance) => {
          instance.label = 'VIP Donors Q4';
        },
      });
      const detail = text(fixture, '.audience-summary__detail');
      expect(detail).toContain('348');
      expect(detail).toContain('record(s)');
    });

    it('shows the "resolves at execution time" copy when no RecordCount is provided', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: viewSource },
        setup: (instance) => {
          instance.label = 'Active Contacts';
        },
      });
      expect(text(fixture, '.audience-summary__detail')).toContain('resolves at execution time');
    });

    it('renders the default bullseye icon, not the empty-state container', () => {
      const fixture = renderComponentFixture(AudienceSourceSummaryComponent, {
        declarations: DECLARATIONS,
        inputs: { Source: listSource },
        setup: (instance) => {
          instance.label = 'VIP Donors Q4';
        },
      });
      expect(hasClass(fixture, '.audience-summary', 'audience-summary--empty')).toBe(false);
      expect(query(fixture, '.audience-summary i')).not.toBeNull();
    });
  });
});
