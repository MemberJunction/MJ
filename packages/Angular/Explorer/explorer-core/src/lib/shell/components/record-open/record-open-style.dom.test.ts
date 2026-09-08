import { describe, it, expect } from 'vitest';
import {
  RECORDS_RESOURCE_TYPE,
  RECORD_DOCKED_TO_WORKSPACE_KEY,
  IsRecordsTabConfiguration,
  IsRecordDockedToWorkspace,
  IsRecordsRegionTab
} from '@memberjunction/ng-shared';

/**
 * Pure predicate coverage for the record-open style helpers — the region-
 * membership vs record-identity split that "Move to Workspace" hangs on.
 * ng-shared has no test harness of its own; these run in explorer-core's
 * suite, which already consumes the package.
 */

const recordConfig = (extra: Record<string, unknown> = {}) =>
  ({ resourceType: RECORDS_RESOURCE_TYPE, Entity: 'Widgets', ...extra });

describe('record-open-style predicates', () => {
  it('key literal is stable — persisted tab configurations depend on it', () => {
    expect(RECORD_DOCKED_TO_WORKSPACE_KEY).toBe('recordDockedToWorkspace');
  });

  describe('IsRecordDockedToWorkspace', () => {
    it('true only for an explicit boolean true', () => {
      expect(IsRecordDockedToWorkspace(recordConfig({ recordDockedToWorkspace: true }))).toBe(true);
    });

    it('false for false, missing, null config, and truthy non-boolean values', () => {
      expect(IsRecordDockedToWorkspace(recordConfig({ recordDockedToWorkspace: false }))).toBe(false);
      expect(IsRecordDockedToWorkspace(recordConfig())).toBe(false);
      expect(IsRecordDockedToWorkspace(null)).toBe(false);
      expect(IsRecordDockedToWorkspace(undefined)).toBe(false);
      expect(IsRecordDockedToWorkspace(recordConfig({ recordDockedToWorkspace: 'true' }))).toBe(false);
      expect(IsRecordDockedToWorkspace(recordConfig({ recordDockedToWorkspace: 1 }))).toBe(false);
    });
  });

  describe('IsRecordsRegionTab (region membership)', () => {
    it('true for an undocked record tab', () => {
      expect(IsRecordsRegionTab(recordConfig())).toBe(true);
      expect(IsRecordsRegionTab(recordConfig({ recordDockedToWorkspace: false }))).toBe(true);
    });

    it('false for a DOCKED record tab — it lives in the main layout', () => {
      expect(IsRecordsRegionTab(recordConfig({ recordDockedToWorkspace: true }))).toBe(false);
    });

    it('false for non-record tabs regardless of the flag', () => {
      expect(IsRecordsRegionTab({ resourceType: 'Dashboards' })).toBe(false);
      expect(IsRecordsRegionTab({ resourceType: 'Dashboards', recordDockedToWorkspace: true })).toBe(false);
      expect(IsRecordsRegionTab(null)).toBe(false);
      expect(IsRecordsRegionTab(undefined)).toBe(false);
    });
  });

  describe('identity vs membership split', () => {
    it('a docked record is still a RECORD (identity) but not a REGION tab (membership)', () => {
      const docked = recordConfig({ recordDockedToWorkspace: true });
      expect(IsRecordsTabConfiguration(docked)).toBe(true);
      expect(IsRecordsRegionTab(docked)).toBe(false);
    });
  });
});
