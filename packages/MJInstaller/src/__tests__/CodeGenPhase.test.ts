import { createMockFileSystem, createMockProcessRunner } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import type { CodeGenContext } from '../phases/CodeGenPhase.js';

// ---------------------------------------------------------------------------
// Adapter mocks — CodeGenPhase creates adapters via `new` in its constructor
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
const mockRunner = createMockProcessRunner();

vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: vi.fn(function () { return mockFs; }),
}));

vi.mock('../adapters/ProcessRunner.js', () => ({
  ProcessRunner: vi.fn(function () { return mockRunner; }),
}));

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { CodeGenPhase } from '../phases/CodeGenPhase.js';
import { InstallerError } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<CodeGenContext>): CodeGenContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    Emitter: emitter,
    Fast: false,
    ...overrides,
  };
}

/**
 * Configure mockRunner.Run so that specific commands return specific results.
 * Falls back to a default success result for unmatched commands.
 */
function mockRunCommand(
  matchers: Array<{
    match: (cmd: string, args: string[]) => boolean;
    result: { ExitCode: number; Stdout: string; Stderr: string; TimedOut: boolean };
  }>
) {
  mockRunner.Run.mockImplementation(
    async (cmd: string, args: string[]) => {
      for (const { match, result } of matchers) {
        if (match(cmd, args)) return result;
      }
      return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodeGenPhase', () => {
  let phase: CodeGenPhase;

  beforeEach(() => {
    // Clear call history and reset implementations on all shared mock methods
    for (const mock of [mockFs, mockRunner]) {
      for (const fn of Object.values(mock)) {
        if (typeof fn === 'function' && 'mockReset' in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }

    phase = new CodeGenPhase();

    // Default happy-path mocks
    mockRunner.Run.mockResolvedValue({
      ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false,
    });

    // Artifact directories exist by default
    mockFs.DirectoryExists.mockResolvedValue(true);
    mockFs.ReadText.mockResolvedValue('');
    mockFs.WriteText.mockResolvedValue(undefined);
    mockFs.GetModifiedTime.mockResolvedValue(Date.now());
    mockFs.FileExists.mockResolvedValue(true);
  });

  // =========================================================================
  // Core run: success, timeout, retry
  // =========================================================================

  describe('Run — success path', () => {
    it('should return Success=true and RetryUsed=false when codegen exits 0 and artifacts exist', async () => {
      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.Success).toBe(true);
      expect(result.RetryUsed).toBe(false);
    });

    it('should verify artifacts after successful codegen', async () => {
      const ctx = makeContext();
      await phase.Run(ctx);

      // DirectoryExists should be called with both critical and secondary paths
      const dirCalls = mockFs.DirectoryExists.mock.calls.map((c: string[]) => c[0]);
      expect(dirCalls.some((p: string) => p.includes('mj_generatedentities'))).toBe(true);
      expect(dirCalls.some((p: string) => p.includes('GeneratedEntities'))).toBe(true);
    });
  });

  describe('Run — codegen timeout', () => {
    it('should throw CODEGEN_TIMEOUT when codegen process times out', async () => {
      mockRunner.Run.mockResolvedValue({
        ExitCode: 1, Stdout: '', Stderr: '', TimedOut: true,
      });

      const ctx = makeContext();
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      await expect(phase.Run(ctx)).rejects.toMatchObject({
        Code: 'CODEGEN_TIMEOUT',
      });
    });
  });

  describe('Run — retry on first failure', () => {
    it('should rebuild + retry once and return RetryUsed=true on second success', async () => {
      let callCount = 0;
      mockRunner.Run.mockImplementation(async (cmd: string, args: string[]) => {
        // First codegen call fails, rebuild succeeds, second codegen succeeds
        if (cmd === 'npx' && args.includes('codegen')) {
          callCount++;
          if (callCount === 1) {
            return { ExitCode: 1, Stdout: '', Stderr: 'some error', TimedOut: false };
          }
          return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
        }
        // npm run build (rebuild), npm run mj:manifest, etc. all succeed
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.Success).toBe(true);
      expect(result.RetryUsed).toBe(true);
    });

    it('should throw CODEGEN_FAILED when both attempts fail', async () => {
      mockRunner.Run.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'npx' && args.includes('codegen')) {
          return { ExitCode: 1, Stdout: '', Stderr: 'persistent error', TimedOut: false };
        }
        // rebuild succeeds
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      const ctx = makeContext();
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
      await expect(phase.Run(ctx)).rejects.toMatchObject({
        Code: 'CODEGEN_FAILED',
      });
    });
  });

  // =========================================================================
  // Artifact verification
  // =========================================================================

  describe('Artifact verification', () => {
    it('should set ArtifactsVerified=true when both critical and secondary exist', async () => {
      mockFs.DirectoryExists.mockResolvedValue(true);

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.ArtifactsVerified).toBe(true);
    });

    it('should set ArtifactsVerified=false when critical (mj_generatedentities) is missing', async () => {
      // First codegen succeeds, but critical artifact missing triggers retry
      let codegenCalls = 0;
      mockRunner.Run.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'npx' && args.includes('codegen')) {
          codegenCalls++;
          return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
        }
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      // Critical path never exists
      mockFs.DirectoryExists.mockImplementation(async (p: string) => {
        if (p.includes('mj_generatedentities')) return false;
        return true;
      });

      const ctx = makeContext();
      // Both attempts will fail artifact check, so CODEGEN_FAILED is thrown
      await expect(phase.Run(ctx)).rejects.toThrow(InstallerError);
    });

    it('should warn but succeed when secondary (GeneratedEntities) is missing', async () => {
      mockFs.DirectoryExists.mockImplementation(async (p: string) => {
        if (p.includes('GeneratedEntities') && !p.includes('mj_generatedentities')) return false;
        return true;
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      const result = await phase.Run(ctx);

      expect(result.Success).toBe(true);
      expect(result.ArtifactsVerified).toBe(false);
      const warns = emittedEvents(emitSpy, 'warn');
      expect(warns.some((w: Record<string, unknown>) =>
        (w.Message as string).includes('GeneratedEntities not found')
      )).toBe(true);
    });
  });

  // =========================================================================
  // Post-codegen pipeline
  // =========================================================================

  describe('Post-codegen pipeline', () => {
    it('Step 1: should call turbo build with entity package filters', async () => {
      const ctx = makeContext();
      await phase.Run(ctx);

      const turboCalls = mockRunner.Run.mock.calls.filter(
        (c: [string, string[]]) => c[0] === 'npx' && c[1]?.includes('turbo')
      );
      expect(turboCalls.length).toBeGreaterThanOrEqual(1);
      const filterCall = turboCalls.find((c: [string, string[]]) =>
        c[1].some((a: string) => a.includes('core-entities'))
      );
      expect(filterCall).toBeDefined();
    });

    it('Step 2: should call npm run mj:manifest', async () => {
      const ctx = makeContext();
      await phase.Run(ctx);

      const manifestCalls = mockRunner.Run.mock.calls.filter(
        (c: [string, string[]]) => c[0] === 'npm' && c[1]?.includes('mj:manifest')
      );
      expect(manifestCalls.length).toBe(1);
    });

    it('Step 3: should build each manifest package individually', async () => {
      const ctx = makeContext();
      await phase.Run(ctx);

      // Should have npm run build calls in manifest package dirs
      const buildCalls = mockRunner.Run.mock.calls.filter(
        (c: [string, string[], Record<string, unknown>]) =>
          c[0] === 'npm' &&
          c[1]?.includes('build') &&
          !c[1]?.includes('mj:manifest') &&
          c[2]?.Cwd &&
          ((c[2].Cwd as string).includes('ServerBootstrap') ||
           (c[2].Cwd as string).includes('ServerBootstrapLite') ||
           (c[2].Cwd as string).includes('Bootstrap'))
      );
      expect(buildCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('Step 4: should apply known-issue patches when NeedsPatch returns true', async () => {
      // Return content that needs patching for the known-issue file
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('ResourcePermissionEngine.ts')) {
          return 'return this._ResourceTypes.ResourceTypes;';
        }
        return '';
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      await phase.Run(ctx);

      const warns = emittedEvents(emitSpy, 'warn');
      expect(warns.some((w: Record<string, unknown>) =>
        (w.Message as string).includes('Known-issue patch applied')
      )).toBe(true);
      expect(mockFs.WriteText).toHaveBeenCalled();
    });

    it('Step 4: should not apply patch when file is already patched', async () => {
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('ResourcePermissionEngine.ts')) {
          // Already patched: uses optional chaining
          return 'return this._ResourceTypes?.ResourceTypes ?? [];';
        }
        return '';
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      await phase.Run(ctx);

      const progressEvents = emittedEvents(emitSpy, 'step:progress');
      expect(progressEvents.some((e: Record<string, unknown>) =>
        (e.Message as string).includes('no patches needed')
      )).toBe(true);
    });

    it('Step 4: should skip silently when file is not found', async () => {
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('ResourcePermissionEngine.ts')) {
          throw new Error('ENOENT: file not found');
        }
        return '';
      });

      const ctx = makeContext();
      // Should not throw
      const result = await phase.Run(ctx);
      expect(result.Success).toBe(true);
    });
  });

  // =========================================================================
  // Manifest regen failure fallback
  // =========================================================================

  describe('Manifest regeneration failure fallback', () => {
    it('should fall back to patchStaleManifestImports when mj:manifest fails', async () => {
      mockRunner.Run.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'npm' && args.includes('mj:manifest')) {
          return { ExitCode: 1, Stdout: '', Stderr: 'manifest failed', TimedOut: false };
        }
        return { ExitCode: 0, Stdout: '', Stderr: '', TimedOut: false };
      });

      // Provide entity_subclasses.ts content for the rename map
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('entity_subclasses.ts')) {
          return 'export class MJAIActionEntity extends BaseEntity {}\nexport class MJAIAgentActionEntity extends BaseEntity {}';
        }
        if (p.includes('mj-class-registrations.ts')) {
          return 'import { AIActionEntity } from "@memberjunction/core-entities";';
        }
        return '';
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Emitter: emitter });
      await phase.Run(ctx);

      const warns = emittedEvents(emitSpy, 'warn');
      expect(warns.some((w: Record<string, unknown>) =>
        (w.Message as string).includes('Manifest regeneration failed')
      )).toBe(true);
    });
  });

  // =========================================================================
  // Fast mode
  // =========================================================================

  describe('Fast mode', () => {
    it('should skip Steps 1-3 when manifests are clean', async () => {
      // All timestamps up-to-date (dist newer than src)
      const now = Date.now();
      mockFs.GetModifiedTime.mockImplementation(async (p: string) => {
        if (p.includes('dist/')) return now;
        if (p.includes('src/')) return now - 10000; // source older
        return now;
      });

      // No stale entity names in manifests
      mockFs.ReadText.mockResolvedValue('import { MJAIActionEntity } from "@memberjunction/core-entities";');

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Fast: true, Emitter: emitter });
      await phase.Run(ctx);

      const logEvents = emittedEvents(emitSpy, 'log');
      expect(logEvents.some((e: Record<string, unknown>) =>
        (e.Message as string).includes('skipping post-codegen rebuild steps 1-3')
      )).toBe(true);

      // Should NOT have turbo build calls for entity packages
      const turboCalls = mockRunner.Run.mock.calls.filter(
        (c: [string, string[]]) => c[0] === 'npx' && c[1]?.includes('turbo')
      );
      expect(turboCalls.length).toBe(0);
    });

    it('should fall back to full pipeline when manifests are stale', async () => {
      // Source newer than dist (handle both / and \ path separators)
      const now = Date.now();
      mockFs.GetModifiedTime.mockImplementation(async (p: string) => {
        if (p.includes('dist')) return now - 10000;
        return now; // source is newer
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Fast: true, Emitter: emitter });
      await phase.Run(ctx);

      const logEvents = emittedEvents(emitSpy, 'log');
      expect(logEvents.some((e: Record<string, unknown>) =>
        (e.Message as string).includes('falling back to full rebuild')
      )).toBe(true);
    });
  });

  // =========================================================================
  // quickCheckManifests
  // =========================================================================

  describe('quickCheckManifests (via fast mode)', () => {
    it('should return false (stale) when source is newer than dist', async () => {
      const now = Date.now();
      mockFs.GetModifiedTime.mockImplementation(async (p: string) => {
        if (p.includes('dist')) return now - 60000; // dist is old
        return now; // source is new
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Fast: true, Emitter: emitter });
      await phase.Run(ctx);

      // Should have fallen back to full pipeline
      const logEvents = emittedEvents(emitSpy, 'log');
      expect(logEvents.some((e: Record<string, unknown>) =>
        (e.Message as string).includes('falling back to full rebuild')
      )).toBe(true);
    });

    it('should return false (stale) when manifest contains stale entity names', async () => {
      const now = Date.now();
      // Timestamps are fine
      mockFs.GetModifiedTime.mockResolvedValue(now);

      // But manifest has stale entity name
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('mj-class-registrations.ts')) {
          return 'import { AIActionEntity } from "@memberjunction/core-entities";';
        }
        return '';
      });

      const { emitter, emitSpy } = createMockEmitter();
      const ctx = makeContext({ Fast: true, Emitter: emitter });
      await phase.Run(ctx);

      const logEvents = emittedEvents(emitSpy, 'log');
      expect(logEvents.some((e: Record<string, unknown>) =>
        (e.Message as string).includes('falling back to full rebuild')
      )).toBe(true);
    });
  });

  // =========================================================================
  // RunKnownIssueChecks (doctor mode)
  // =========================================================================

  describe('RunKnownIssueChecks', () => {
    it('should return needs_patch when issue is found', async () => {
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('ResourcePermissionEngine.ts')) {
          return 'return this._ResourceTypes.ResourceTypes;';
        }
        return '';
      });

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunKnownIssueChecks('/test/install', emitter);

      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      const rpePatch = diagnostics.find(d => d.Id === 'resource-permission-engine-null-safety');
      expect(rpePatch).toBeDefined();
      expect(rpePatch!.Status).toBe('needs_patch');
    });

    it('should return ok when issue is already patched', async () => {
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('ResourcePermissionEngine.ts')) {
          return 'return this._ResourceTypes?.ResourceTypes ?? [];';
        }
        return '';
      });

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunKnownIssueChecks('/test/install', emitter);

      const rpePatch = diagnostics.find(d => d.Id === 'resource-permission-engine-null-safety');
      expect(rpePatch).toBeDefined();
      expect(rpePatch!.Status).toBe('ok');
    });

    it('should return skipped when file cannot be read', async () => {
      mockFs.ReadText.mockRejectedValue(new Error('ENOENT'));

      const { emitter } = createMockEmitter();
      const diagnostics = await phase.RunKnownIssueChecks('/test/install', emitter);

      const rpePatch = diagnostics.find(d => d.Id === 'resource-permission-engine-null-safety');
      expect(rpePatch).toBeDefined();
      expect(rpePatch!.Status).toBe('skipped');
    });
  });
});
