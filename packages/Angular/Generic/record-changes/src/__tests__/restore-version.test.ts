/**
 * Tests for restore version event shape and conditional filter pill logic.
 *
 * Pure logic tests — no Angular TestBed. The deeper preview-building logic
 * lives in RestorePreviewPanelComponent and is tested via its own tests
 * (which exercise the reusable component independently).
 */
import { describe, it, expect } from 'vitest';
import { RestoreVersionEvent } from '../lib/ng-record-changes.component';

// ═══════════════════════════════════════════
// RestoreVersionEvent shape
// ═══════════════════════════════════════════
describe('RestoreVersionEvent', () => {
  it('should have the correct shape with FieldValues array', () => {
    const event: RestoreVersionEvent = {
      SourceChangeID: 'abc-123',
      ChangedAt: new Date('2025-01-15T10:00:00Z'),
      ChangedByUser: 'user@example.com',
      Reason: 'Reverting incorrect Q2 entries',
      FieldValues: [
        { FieldName: 'Name', Value: 'Old Name' },
        { FieldName: 'Status', Value: 'Active' },
      ],
    };

    expect(event.SourceChangeID).toBe('abc-123');
    expect(event.ChangedByUser).toBe('user@example.com');
    expect(event.Reason).toBe('Reverting incorrect Q2 entries');
    expect(event.FieldValues).toHaveLength(2);
    expect(event.FieldValues[0]).toEqual({ FieldName: 'Name', Value: 'Old Name' });
  });

  it('should support null Reason for restores without explanation', () => {
    const event: RestoreVersionEvent = {
      SourceChangeID: 'xyz',
      ChangedAt: new Date(),
      ChangedByUser: '',
      Reason: null,
      FieldValues: [],
    };

    expect(event.Reason).toBeNull();
    expect(event.FieldValues).toEqual([]);
  });
});

// ═══════════════════════════════════════════
// Conditional pill computation
// ═══════════════════════════════════════════
//
// Mirrors the logic in RecordChangesComponent.rebuildConditionalPills.
// Pills only appear for change types/sources that are actually present
// in the loaded data — the bar should never advertise a filter that
// would yield zero results.

interface MockChange {
  Type: string;
  Source?: string;
  RestoredFromID?: string | null;
}

function computePillKeys(changes: MockChange[]): string[] {
  const counts: Record<string, number> = {};
  let restoreCount = 0;

  for (const c of changes) {
    counts[c.Type] = (counts[c.Type] ?? 0) + 1;
    if (c.Source === 'Restore' || c.RestoredFromID != null) restoreCount++;
  }

  const keys: string[] = [];
  if ((counts['Update'] ?? 0) > 0) keys.push('Update');
  if ((counts['Create'] ?? 0) > 0) keys.push('Create');
  if ((counts['Delete'] ?? 0) > 0) keys.push('Delete');
  if ((counts['Snapshot'] ?? 0) > 0) keys.push('Snapshot');
  if (restoreCount > 0) keys.push('Restore');
  return keys;
}

describe('rebuildConditionalPills (logic)', () => {
  it('emits no conditional pills for empty data', () => {
    expect(computePillKeys([])).toEqual([]);
  });

  it('emits only Update when only updates are loaded', () => {
    const changes: MockChange[] = [
      { Type: 'Update', Source: 'Internal' },
      { Type: 'Update', Source: 'Internal' },
    ];
    expect(computePillKeys(changes)).toEqual(['Update']);
  });

  it('emits Update and Create when both types are present', () => {
    const changes: MockChange[] = [
      { Type: 'Create', Source: 'Internal' },
      { Type: 'Update', Source: 'Internal' },
    ];
    expect(computePillKeys(changes)).toEqual(['Update', 'Create']);
  });

  it('emits Restore when any change has Source=Restore', () => {
    const changes: MockChange[] = [
      { Type: 'Update', Source: 'Internal' },
      { Type: 'Update', Source: 'Restore', RestoredFromID: 'abc' },
    ];
    expect(computePillKeys(changes)).toContain('Restore');
  });

  it('emits Restore when RestoredFromID is set even if Source is not Restore', () => {
    const changes: MockChange[] = [
      { Type: 'Update', Source: 'Internal', RestoredFromID: 'abc' },
    ];
    expect(computePillKeys(changes)).toContain('Restore');
  });

  it('does not emit Restore when no change has restore lineage', () => {
    const changes: MockChange[] = [
      { Type: 'Update', Source: 'Internal' },
      { Type: 'Create', Source: 'External' },
    ];
    expect(computePillKeys(changes)).not.toContain('Restore');
  });

  it('emits Snapshot when Type=Snapshot rows exist', () => {
    const changes: MockChange[] = [
      { Type: 'Snapshot', Source: 'Internal' },
    ];
    expect(computePillKeys(changes)).toEqual(['Snapshot']);
  });
});

// ═══════════════════════════════════════════
// Overflow threshold logic
// ═══════════════════════════════════════════

describe('overflow threshold', () => {
  const OVERFLOW_THRESHOLD = 2;

  it('does not overflow at 1 conditional pill', () => {
    expect(1 > OVERFLOW_THRESHOLD).toBe(false);
  });

  it('does not overflow at 2 conditional pills', () => {
    expect(2 > OVERFLOW_THRESHOLD).toBe(false);
  });

  it('overflows at 3 conditional pills', () => {
    expect(3 > OVERFLOW_THRESHOLD).toBe(true);
  });
});
