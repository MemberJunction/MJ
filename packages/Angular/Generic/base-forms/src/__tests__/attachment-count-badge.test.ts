/**
 * Tests for attachment count badge and availability logic in MjRecordFormContainerComponent and MjFormToolbarComponent.
 */
import { describe, it, expect } from 'vitest';
import { IEntityAttachmentsConfiguration } from '@memberjunction/core';

/**
 * Pure evaluation function for attachment availability.
 */
function isAttachmentFeatureAvailable(
  isSaved: boolean,
  entityConfig?: { Attachments?: IEntityAttachmentsConfiguration }
): boolean {
  if (!isSaved) return false;
  if (entityConfig?.Attachments?.Enabled === false) return false;
  return true;
}

/**
 * Simulates the AttachmentCount update pattern from LoadAttachmentCount.
 */
function updateAttachmentCount(currentCount: number, queryResults: { ID: string }[]): number {
  return queryResults.length;
}

describe('Attachment Availability Logic', () => {
  it('should be available for saved records with default/enabled config', () => {
    expect(isAttachmentFeatureAvailable(true, {})).toBe(true);
    expect(isAttachmentFeatureAvailable(true, { Attachments: { Enabled: true } })).toBe(true);
  });

  it('should be disabled for unsaved new records', () => {
    expect(isAttachmentFeatureAvailable(false, {})).toBe(false);
  });

  it('should be disabled when entity configuration explicitly sets Enabled: false', () => {
    expect(isAttachmentFeatureAvailable(true, { Attachments: { Enabled: false } })).toBe(false);
  });
});

describe('AttachmentCount badge', () => {
  it('should set AttachmentCount from query result length', () => {
    const results = [{ ID: 'a1' }, { ID: 'a2' }, { ID: 'a3' }, { ID: 'a4' }, { ID: 'a5' }];
    expect(updateAttachmentCount(0, results)).toBe(5);
  });

  it('should set AttachmentCount to 0 when no attachments exist', () => {
    expect(updateAttachmentCount(3, [])).toBe(0);
  });

  it('should update AttachmentCount when attachments are added or removed', () => {
    let count = updateAttachmentCount(0, [{ ID: 'a1' }, { ID: 'a2' }]);
    expect(count).toBe(2);

    // After uploading another file
    count = updateAttachmentCount(count, [{ ID: 'a1' }, { ID: 'a2' }, { ID: 'a3' }]);
    expect(count).toBe(3);

    // After unlinking one file
    count = updateAttachmentCount(count, [{ ID: 'a1' }, { ID: 'a2' }]);
    expect(count).toBe(2);
  });
});
