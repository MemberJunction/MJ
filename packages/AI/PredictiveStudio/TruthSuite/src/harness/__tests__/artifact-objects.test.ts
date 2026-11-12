import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ArtifactObjects } from '../artifact-objects';

const ROOT = path.resolve('/tmp/ps-storage-root');

describe('ArtifactObjects.ObjectPath', () => {
  it('resolves a provider key beneath the storage root, as the local driver does', () => {
    const key = 'predictive-studio/model-artifacts/46f1a07d/trainer-6DCDDECF-glm.json';
    expect(ArtifactObjects.ObjectPath(ROOT, 'F1', key)).toBe(path.join(ROOT, 'predictive-studio', 'model-artifacts', '46f1a07d', 'trainer-6DCDDECF-glm.json'));
  });

  it('refuses a key with a parent segment or an absolute key, naming the file row', () => {
    expect(() => ArtifactObjects.ObjectPath(ROOT, 'F1', 'predictive-studio/../../etc/passwd')).toThrow('MJ: Files F1 has an unsafe storage key "predictive-studio/../../etc/passwd"');
    expect(() => ArtifactObjects.ObjectPath(ROOT, 'F2', '/etc/passwd')).toThrow('MJ: Files F2');
  });
});
