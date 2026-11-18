import { describe, it, expect } from 'vitest';
import { StripPatchInfo } from '../target/LockfileStrip';

describe('StripPatchInfo', () => {
  const lock = ['lockfileVersion: 9.0', '', 'patchedDependencies:', '  type-graphql@2.0.0-beta.3:', '    hash: abc123', '    path: patches/type-graphql@2.0.0-beta.3.patch', '', 'importers:', '  .:',
    '    dependencies:', '      type-graphql:', '        version: 2.0.0-beta.3(patch_hash=abc123)(class-validator@0.14.3)(graphql@16.12.0)', 'packages:', '  type-graphql@2.0.0-beta.3(patch_hash=abc123)(graphql@16.12.0):', '    resolution: {}', ''].join('\n');
  it('removes the patchedDependencies block and every patch_hash segment, and keeps every other line', () => {
    expect(StripPatchInfo(lock)).toBe(['lockfileVersion: 9.0', '', 'importers:', '  .:', '    dependencies:', '      type-graphql:',
      '        version: 2.0.0-beta.3(class-validator@0.14.3)(graphql@16.12.0)', 'packages:', '  type-graphql@2.0.0-beta.3(graphql@16.12.0):', '    resolution: {}', ''].join('\n'));
  });
  it('returns a lockfile without patches unchanged', () => {
    const plain = 'lockfileVersion: 9.0\n\nimporters:\n  .: {}\n';
    expect(StripPatchInfo(plain)).toBe(plain);
  });
  it('removes a patch_hash segment that sits between other peer segments', () => {
    expect(StripPatchInfo("  /a@1.0.0(b@2.0.0)(patch_hash=zz9)(c@3.0.0):\n")).toBe('  /a@1.0.0(b@2.0.0)(c@3.0.0):\n');
  });
});
