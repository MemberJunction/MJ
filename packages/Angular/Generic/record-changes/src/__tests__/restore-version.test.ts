/**
 * Tests for restore version logic extracted from RecordChangesComponent.
 *
 * We test pure logic functions directly to avoid Angular TestBed complexity.
 * These mirror the component's parseFieldChanges, buildRestorePreviewFields, etc.
 */
import { describe, it, expect } from 'vitest';
import { RestoreFieldDiff, RestoreVersionEvent } from '../lib/ng-record-changes.component';

// ── Extracted pure logic mirrors from RecordChangesComponent ──

/** Mirrors RecordChangesComponent.parseFieldChanges */
function parseFieldChanges(
  changesJSON: string
): Record<string, { OldValue: unknown; NewValue: unknown }> {
  const fieldChanges: Record<string, { OldValue: unknown; NewValue: unknown }> = {};
  try {
    const changesJson = JSON.parse(changesJSON || '{}') as Record<
      string,
      { field?: string; oldValue?: unknown; newValue?: unknown }
    >;
    for (const key of Object.keys(changesJson)) {
      const entry = changesJson[key];
      const fieldName = entry.field || key;
      fieldChanges[fieldName] = {
        OldValue: entry.oldValue,
        NewValue: entry.newValue,
      };
    }
  } catch {
    // Return empty on parse failure
  }
  return fieldChanges;
}

/** Mirrors RecordChangesComponent.buildRestorePreviewFields (simplified without EntityInfo) */
function buildRestorePreviewFields(
  changesJSON: string,
  currentValues: Record<string, string>
): RestoreFieldDiff[] {
  let changesJson: Record<string, { field?: string; oldValue?: unknown; newValue?: unknown }>;
  try {
    changesJson = JSON.parse(changesJSON || '{}');
  } catch {
    return [];
  }

  const diffs: RestoreFieldDiff[] = [];
  for (const key of Object.keys(changesJson)) {
    const entry = changesJson[key];
    const fieldName = entry.field || key;
    const versionValue = String(entry.oldValue ?? '');
    const currentValue = currentValues[fieldName] ?? '';

    diffs.push({
      FieldName: fieldName,
      DisplayName: fieldName,
      VersionValue: versionValue,
      CurrentValue: currentValue,
      IsChanged: versionValue !== currentValue,
    });
  }
  return diffs;
}

// ═══════════════════════════════════════════
// RestoreVersionEvent emission logic
// ═══════════════════════════════════════════
describe('parseFieldChanges', () => {
  it('should parse ChangesJSON into field change map', () => {
    const json = JSON.stringify({
      '0': { field: 'FirstName', oldValue: 'John', newValue: 'Jonathan' },
      '1': { field: 'Email', oldValue: 'old@example.com', newValue: 'new@example.com' },
    });

    const result = parseFieldChanges(json);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['FirstName']).toEqual({ OldValue: 'John', NewValue: 'Jonathan' });
    expect(result['Email']).toEqual({
      OldValue: 'old@example.com',
      NewValue: 'new@example.com',
    });
  });

  it('should use key as field name when field property is missing', () => {
    const json = JSON.stringify({
      Status: { oldValue: 'Active', newValue: 'Inactive' },
    });

    const result = parseFieldChanges(json);
    expect(result['Status']).toEqual({ OldValue: 'Active', NewValue: 'Inactive' });
  });

  it('should return empty object for invalid JSON', () => {
    const result = parseFieldChanges('not valid json');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should return empty object for empty string', () => {
    const result = parseFieldChanges('');
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should handle null/undefined old and new values', () => {
    const json = JSON.stringify({
      '0': { field: 'Description', oldValue: null, newValue: 'New description' },
    });

    const result = parseFieldChanges(json);
    expect(result['Description']).toEqual({
      OldValue: null,
      NewValue: 'New description',
    });
  });
});

// ═══════════════════════════════════════════
// Diff computation between version and current
// ═══════════════════════════════════════════
describe('buildRestorePreviewFields', () => {
  it('should mark fields as changed when version differs from current', () => {
    const json = JSON.stringify({
      '0': { field: 'Name', oldValue: 'Old Name', newValue: 'Current Name' },
      '1': { field: 'Status', oldValue: 'Active', newValue: 'Inactive' },
    });
    const currentValues: Record<string, string> = {
      Name: 'Current Name',
      Status: 'Inactive',
    };

    const diffs = buildRestorePreviewFields(json, currentValues);
    expect(diffs).toHaveLength(2);

    const nameDiff = diffs.find((d) => d.FieldName === 'Name');
    expect(nameDiff!.VersionValue).toBe('Old Name');
    expect(nameDiff!.CurrentValue).toBe('Current Name');
    expect(nameDiff!.IsChanged).toBe(true);

    const statusDiff = diffs.find((d) => d.FieldName === 'Status');
    expect(statusDiff!.VersionValue).toBe('Active');
    expect(statusDiff!.CurrentValue).toBe('Inactive');
    expect(statusDiff!.IsChanged).toBe(true);
  });

  it('should mark fields as unchanged when version matches current', () => {
    const json = JSON.stringify({
      '0': { field: 'Name', oldValue: 'Same Value', newValue: 'Different' },
    });
    const currentValues: Record<string, string> = {
      Name: 'Same Value',
    };

    const diffs = buildRestorePreviewFields(json, currentValues);
    expect(diffs[0].IsChanged).toBe(false);
  });

  it('should return empty array for invalid JSON', () => {
    const diffs = buildRestorePreviewFields('bad json', {});
    expect(diffs).toHaveLength(0);
  });

  it('should handle missing current values (treats as empty string)', () => {
    const json = JSON.stringify({
      '0': { field: 'NewField', oldValue: 'some value', newValue: '' },
    });

    const diffs = buildRestorePreviewFields(json, {});
    expect(diffs[0].CurrentValue).toBe('');
    expect(diffs[0].VersionValue).toBe('some value');
    expect(diffs[0].IsChanged).toBe(true);
  });

  it('should treat null oldValue as empty string for comparison', () => {
    const json = JSON.stringify({
      '0': { field: 'Notes', oldValue: null, newValue: 'Added notes' },
    });

    const diffs = buildRestorePreviewFields(json, { Notes: '' });
    expect(diffs[0].VersionValue).toBe('');
    expect(diffs[0].CurrentValue).toBe('');
    expect(diffs[0].IsChanged).toBe(false);
  });
});

// ═══════════════════════════════════════════
// RestoreVersionEvent interface shape
// ═══════════════════════════════════════════
describe('RestoreVersionEvent', () => {
  it('should have the correct shape', () => {
    const event: RestoreVersionEvent = {
      VersionID: 'abc-123',
      ChangedAt: new Date('2025-01-15T10:00:00Z'),
      ChangedByUser: 'user@example.com',
      FieldChanges: {
        Name: { OldValue: 'Old', NewValue: 'New' },
        Status: { OldValue: 'Active', NewValue: 'Inactive' },
      },
    };

    expect(event.VersionID).toBe('abc-123');
    expect(event.ChangedByUser).toBe('user@example.com');
    expect(Object.keys(event.FieldChanges)).toHaveLength(2);
    expect(event.FieldChanges['Name'].OldValue).toBe('Old');
  });
});
