/**
 * Tests for the mjRepoVersion pin written by ConfigurePhase into mj.config.cjs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockFileSystem } from './mocks/adapters.js';
import { createMockEmitter } from './mocks/emitter.js';
import type { ConfigureContext } from '../phases/ConfigurePhase.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';

const mockFs = createMockFileSystem();
vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: function FileSystemAdapter() { return mockFs; },
}));

import { ConfigurePhase } from '../phases/ConfigurePhase.js';

function baseConfig(): PartialInstallConfig {
  return {
    DatabaseHost: 'localhost', DatabasePort: 1433, DatabaseName: 'TestDB', DatabaseTrustCert: true,
    CodeGenUser: 'cg', CodeGenPassword: 'cgpw', APIUser: 'api', APIPassword: 'apipw',
    APIPort: 4000, ExplorerPort: 4200, AuthProvider: 'none',
  };
}

function makeContext(overrides?: Partial<ConfigureContext>): ConfigureContext {
  const { emitter } = createMockEmitter();
  return { Dir: '/test/install', Config: baseConfig(), Yes: true, Emitter: emitter, ...overrides };
}

/**
 * The content of the most recent mj.config.cjs write. ConfigurePhase writes that
 * file at most once per Run, so the last matching write is always the current
 * test's — robust regardless of mock call-history accumulation across tests.
 */
function lastConfigWrite(): string {
  const matches = mockFs.WriteText.mock.calls
    .filter((call) => String(call[0]).endsWith('mj.config.cjs'))
    .map((call) => String(call[1]));
  return matches[matches.length - 1] ?? '';
}

describe('ConfigurePhase mjRepoVersion pin', () => {
  let phase: ConfigurePhase;

  beforeEach(() => {
    for (const key of Object.keys(mockFs) as (keyof typeof mockFs)[]) {
      mockFs[key].mockReset();
    }
    phase = new ConfigurePhase();
    mockFs.FileExists.mockResolvedValue(false);
    mockFs.DirectoryExists.mockResolvedValue(false);
    mockFs.ReadText.mockResolvedValue('');
    mockFs.ListFiles.mockResolvedValue([]);
    mockFs.WriteText.mockResolvedValue(undefined);
  });

  it('writes mjRepoVersion into a freshly generated mj.config.cjs', async () => {
    await phase.Run(makeContext({ ResolvedVersion: 'v5.38.0' }));
    expect(lastConfigWrite()).toContain("mjRepoVersion: 'v5.38.0'");
  });

  it('omits mjRepoVersion when no version is resolved', async () => {
    await phase.Run(makeContext());
    expect(lastConfigWrite()).not.toContain('mjRepoVersion');
  });

  it('patches mjRepoVersion into an existing distribution mj.config.cjs', async () => {
    mockFs.FileExists.mockImplementation((p: string) => Promise.resolve(p.endsWith('mj.config.cjs')));
    mockFs.ReadText.mockResolvedValue('module.exports = {\n  output: [],\n  commands: [],\n};\n');
    await phase.Run(makeContext({ ResolvedVersion: 'v5.39.0' }));
    expect(lastConfigWrite()).toContain("mjRepoVersion: 'v5.39.0'");
  });

  it('replaces an existing mjRepoVersion pin in-place', async () => {
    mockFs.FileExists.mockImplementation((p: string) => Promise.resolve(p.endsWith('mj.config.cjs')));
    mockFs.ReadText.mockResolvedValue("module.exports = {\n  mjRepoVersion: 'v5.30.0',\n  output: [],\n};\n");
    await phase.Run(makeContext({ ResolvedVersion: 'v5.40.0' }));
    expect(lastConfigWrite()).toContain("mjRepoVersion: 'v5.40.0'");
    expect(lastConfigWrite()).not.toContain('v5.30.0');
  });
});
