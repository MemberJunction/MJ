import { describe, it, expect } from 'vitest';
import { selectDistinctLatestArtifacts } from '../lib/utils/distinct-artifacts';

/**
 * Regression guard for the bug where a message carrying TWO distinct artifacts
 * (e.g. a research report + a standalone generated infographic) only ever showed
 * ONE of them — the message list previously displayed `artifactList[length - 1]`,
 * silently hiding the report behind the image. The fix surfaces every distinct
 * artifact (latest version each); these tests lock that behavior in.
 */
describe('selectDistinctLatestArtifacts', () => {
  const make = (artifactId: string, versionNumber: number, tag = '') =>
    ({ artifactId, versionNumber, tag });

  it('returns an empty array for empty input', () => {
    expect(selectDistinctLatestArtifacts([])).toEqual([]);
  });

  it('keeps BOTH distinct artifacts (the report-hidden-behind-image bug)', () => {
    const report = make('report-id', 1, 'report');
    const image = make('image-id', 1, 'image');
    const result = selectDistinctLatestArtifacts([report, image]);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.artifactId)).toEqual(['report-id', 'image-id']);
  });

  it('collapses multiple versions of the SAME artifact to the latest', () => {
    const v1 = make('a', 1, 'v1');
    const v2 = make('a', 2, 'v2');
    const v3 = make('a', 3, 'v3');
    const result = selectDistinctLatestArtifacts([v1, v3, v2]);

    expect(result).toHaveLength(1);
    expect(result[0].versionNumber).toBe(3);
    expect(result[0].tag).toBe('v3');
  });

  it('handles a mix: distinct artifacts each collapsed to their latest version', () => {
    const reportV1 = make('report', 1, 'r1');
    const reportV2 = make('report', 2, 'r2');
    const image = make('image', 1, 'img');
    const result = selectDistinctLatestArtifacts([reportV1, image, reportV2]);

    expect(result).toHaveLength(2);
    const byId = Object.fromEntries(result.map(r => [r.artifactId, r]));
    expect(byId['report'].versionNumber).toBe(2);
    expect(byId['report'].tag).toBe('r2');
    expect(byId['image'].versionNumber).toBe(1);
  });

  it('preserves first-seen ordering of distinct artifacts', () => {
    const image = make('image', 1);
    const report = make('report', 1);
    // image seen first → image stays first even though report has a later update
    const result = selectDistinctLatestArtifacts([image, report, make('report', 2)]);
    expect(result.map(r => r.artifactId)).toEqual(['image', 'report']);
  });

  it('does not mutate the input array', () => {
    const input = [make('a', 1), make('a', 2), make('b', 1)];
    const copy = [...input];
    selectDistinctLatestArtifacts(input);
    expect(input).toEqual(copy);
  });
});
