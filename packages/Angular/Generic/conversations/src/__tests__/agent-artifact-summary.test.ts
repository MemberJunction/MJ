import { describe, it, expect } from 'vitest';
import {
  GroupVersionsByArtifact,
  type AgentArtifactRow,
  type AgentArtifactVersionRow
} from '../lib/utils/agent-artifact-summary';

/**
 * Grouping for the "Prior Artifacts Created by This Agent" block.
 *
 * This helper backs a query that replaced an array scan over the loaded transcript window —
 * and in doing so it dropped the explicit sort the scan performed. The claim is that the
 * version read's `__mj_CreatedAt DESC` ordering already produces BOTH orderings the prompt
 * depends on: versions newest-first within an artifact, and artifacts ordered by
 * most-recently-touched. That claim is load-bearing and invisible in the code.
 */
function group(versions: AgentArtifactVersionRow[], artifacts: AgentArtifactRow[]) {
  return GroupVersionsByArtifact(versions, new Map(artifacts.map(a => [a.ID, a])));
}

const ART_A: AgentArtifactRow = { ID: 'art-a', Name: 'Revenue Model', Type: 'Report' };
const ART_B: AgentArtifactRow = { ID: 'art-b', Name: 'Segment List', Type: 'Data' };

describe('GroupVersionsByArtifact', () => {
  it('keeps versions newest-first so the prompt can read versions[0] as "Latest"', () => {
    // The read is __mj_CreatedAt DESC, so v3 arrives before v1.
    const [summary] = group(
      [
        { ID: 'v-3', ArtifactID: 'art-a', VersionNumber: 3, Name: 'third' },
        { ID: 'v-2', ArtifactID: 'art-a', VersionNumber: 2, Name: 'second' },
        { ID: 'v-1', ArtifactID: 'art-a', VersionNumber: 1, Name: null }
      ],
      [ART_A]
    );

    expect(summary.versions.map(v => v.versionNumber)).toEqual([3, 2, 1]);
    expect(summary.versions[0].versionName).toBe('third');
  });

  it('orders artifacts by most-recently-touched without an explicit sort', () => {
    // art-b's newest version predates art-a's, so art-a must come first. This is the ordering
    // the removed sort used to compute, now falling out of Map insertion order.
    const summaries = group(
      [
        { ID: 'v-a2', ArtifactID: 'art-a', VersionNumber: 2, Name: null },
        { ID: 'v-b1', ArtifactID: 'art-b', VersionNumber: 1, Name: null },
        { ID: 'v-a1', ArtifactID: 'art-a', VersionNumber: 1, Name: null }
      ],
      [ART_A, ART_B]
    );

    expect(summaries.map(s => s.artifactId)).toEqual(['art-a', 'art-b']);
    expect(summaries[0].versions).toHaveLength(2);
    expect(summaries[1].versions).toHaveLength(1);
  });

  it('carries the artifact name and type the prompt prints', () => {
    const [summary] = group([{ ID: 'v-1', ArtifactID: 'art-a', VersionNumber: 1, Name: null }], [ART_A]);

    expect(summary.artifactName).toBe('Revenue Model');
    expect(summary.artifactType).toBe('Report');
  });

  it('drops a version whose artifact row is missing, matching INNER JOIN semantics', () => {
    // A version can outlive the artifact row the caller can read; emitting a summary with an
    // undefined name would put the string "undefined" into the classifier prompt.
    const summaries = group(
      [
        { ID: 'v-1', ArtifactID: 'art-a', VersionNumber: 1, Name: null },
        { ID: 'v-x', ArtifactID: 'art-missing', VersionNumber: 1, Name: null }
      ],
      [ART_A]
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].artifactId).toBe('art-a');
  });

  it('returns nothing for no versions', () => {
    expect(group([], [ART_A])).toEqual([]);
  });
});
