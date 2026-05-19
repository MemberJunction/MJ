/**
 * Tests for badge count loading logic in MjRecordFormContainerComponent.
 *
 * We test the pure data logic without Angular TestBed by extracting
 * the badge count update patterns used in the container component.
 */
import { describe, it, expect } from 'vitest';

/**
 * Simulates the TagCount update pattern from LoadTagCount.
 * The real method queries RunView; here we test the state update logic.
 */
function updateTagCount(currentCount: number, queryResults: { ID: string }[]): number {
  return queryResults.length;
}

/**
 * Simulates the VersionCount update pattern from LoadVersionCount.
 * The real method queries RunView; here we test the state update logic.
 */
function updateVersionCount(
  trackRecordChanges: boolean,
  queryResults: { ID: string }[]
): number {
  if (!trackRecordChanges) return 0;
  return queryResults.length;
}

describe('TagCount badge', () => {
  it('should set TagCount from query result length', () => {
    const results = [{ ID: 'a' }, { ID: 'b' }, { ID: 'c' }];
    expect(updateTagCount(0, results)).toBe(3);
  });

  it('should set TagCount to 0 when no tags exist', () => {
    expect(updateTagCount(5, [])).toBe(0);
  });

  it('should update TagCount when tags change', () => {
    // Initially 2 tags
    let count = updateTagCount(0, [{ ID: 'a' }, { ID: 'b' }]);
    expect(count).toBe(2);

    // After adding a tag
    count = updateTagCount(count, [{ ID: 'a' }, { ID: 'b' }, { ID: 'c' }]);
    expect(count).toBe(3);

    // After removing all tags
    count = updateTagCount(count, []);
    expect(count).toBe(0);
  });
});

describe('VersionCount badge', () => {
  it('should set VersionCount from query result length', () => {
    const results = [{ ID: 'v1' }, { ID: 'v2' }];
    expect(updateVersionCount(true, results)).toBe(2);
  });

  it('should return 0 when trackRecordChanges is false', () => {
    const results = [{ ID: 'v1' }, { ID: 'v2' }];
    expect(updateVersionCount(false, results)).toBe(0);
  });

  it('should set VersionCount to 0 when no changes exist', () => {
    expect(updateVersionCount(true, [])).toBe(0);
  });

  it('should reflect new versions after save', () => {
    // Initial: 3 versions
    let count = updateVersionCount(true, [{ ID: 'v1' }, { ID: 'v2' }, { ID: 'v3' }]);
    expect(count).toBe(3);

    // After a save creates a new version
    count = updateVersionCount(true, [
      { ID: 'v1' },
      { ID: 'v2' },
      { ID: 'v3' },
      { ID: 'v4' },
    ]);
    expect(count).toBe(4);
  });
});
