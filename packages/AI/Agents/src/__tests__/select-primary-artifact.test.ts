import { describe, expect, it } from 'vitest';
import { selectPrimaryArtifact, type CreatedArtifactInfo } from '../AgentRunner.js';

const FILE: CreatedArtifactInfo = { artifactId: 'file-1', versionId: 'fv-1', versionNumber: 1 };
const FILE_2: CreatedArtifactInfo = { artifactId: 'file-2', versionId: 'fv-2', versionNumber: 1 };
const PAYLOAD: CreatedArtifactInfo = { artifactId: 'payload-1', versionId: 'pv-1', versionNumber: 3 };

describe('selectPrimaryArtifact', () => {
  it('prefers a file artifact over the payload artifact', () => {
    // The regression: a run that generated a .docx reported its payload artifact, so "open the
    // artifact" opened the agent's internal JSON instead of the document.
    expect(selectPrimaryArtifact([FILE], PAYLOAD)).toBe(FILE);
  });

  it('uses the first file when several were produced', () => {
    expect(selectPrimaryArtifact([FILE, FILE_2], PAYLOAD)).toBe(FILE);
  });

  it('falls back to the payload artifact when no file was produced', () => {
    expect(selectPrimaryArtifact([], PAYLOAD)).toBe(PAYLOAD);
    expect(selectPrimaryArtifact(undefined, PAYLOAD)).toBe(PAYLOAD);
  });

  it('returns undefined when a run produced neither', () => {
    expect(selectPrimaryArtifact([], undefined)).toBeUndefined();
    expect(selectPrimaryArtifact(undefined, undefined)).toBeUndefined();
  });
});
