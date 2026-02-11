import { describe, it, expect } from 'vitest';
import type { MicroViewData, FieldChangeView, SlidePanelMode } from '../lib/types';

describe('MicroViewData type', () => {
  it('should be constructable with required fields', () => {
    const data: MicroViewData = {
      EntityName: 'Users',
      EntityID: 'entity-1',
      RecordID: 'rec-1',
      RecordChangeID: 'change-1',
      FullRecordJSON: { Name: 'John', Email: 'john@test.com' },
      FieldDiffs: null
    };
    expect(data.EntityName).toBe('Users');
    expect(data.RecordID).toBe('rec-1');
    expect(data.FullRecordJSON).toEqual({ Name: 'John', Email: 'john@test.com' });
  });

  it('should accept null FullRecordJSON', () => {
    const data: MicroViewData = {
      EntityName: 'Users',
      EntityID: 'entity-1',
      RecordID: 'rec-1',
      RecordChangeID: 'change-1',
      FullRecordJSON: null,
      FieldDiffs: []
    };
    expect(data.FullRecordJSON).toBeNull();
  });
});

describe('FieldChangeView type', () => {
  it('should represent a modified field', () => {
    const change: FieldChangeView = {
      FieldName: 'Email',
      OldValue: 'old@test.com',
      NewValue: 'new@test.com',
      ChangeType: 'Modified'
    };
    expect(change.ChangeType).toBe('Modified');
  });

  it('should represent an added field', () => {
    const change: FieldChangeView = {
      FieldName: 'Phone',
      OldValue: '',
      NewValue: '+1-555-0123',
      ChangeType: 'Added'
    };
    expect(change.ChangeType).toBe('Added');
  });

  it('should represent a removed field', () => {
    const change: FieldChangeView = {
      FieldName: 'Notes',
      OldValue: 'Some notes',
      NewValue: '',
      ChangeType: 'Removed'
    };
    expect(change.ChangeType).toBe('Removed');
  });
});

describe('SlidePanelMode type', () => {
  it('should accept valid modes', () => {
    const slide: SlidePanelMode = 'slide';
    const dialog: SlidePanelMode = 'dialog';
    expect(slide).toBe('slide');
    expect(dialog).toBe('dialog');
  });
});
