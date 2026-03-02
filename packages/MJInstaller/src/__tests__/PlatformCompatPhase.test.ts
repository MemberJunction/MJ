import { createMockFileSystem } from './mocks/adapters.js';
import { createMockEmitter, emittedEvents } from './mocks/emitter.js';
import type { PlatformCompatContext } from '../phases/PlatformCompatPhase.js';

// ---------------------------------------------------------------------------
// Adapter mocks — PlatformCompatPhase creates adapters via `new` in constructor
// ---------------------------------------------------------------------------

const mockFs = createMockFileSystem();
vi.mock('../adapters/FileSystemAdapter.js', () => ({
  FileSystemAdapter: vi.fn(function () { return mockFs; }),
}));

// ---------------------------------------------------------------------------
// Import the phase under test AFTER mocks are set up
// ---------------------------------------------------------------------------

import { PlatformCompatPhase } from '../phases/PlatformCompatPhase.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<PlatformCompatContext>): PlatformCompatContext {
  const { emitter } = createMockEmitter();
  return {
    Dir: '/test/install',
    DetectedOS: 'windows',
    Emitter: emitter,
    ...overrides,
  };
}

function pkgJson(scripts: Record<string, string>, extras?: {
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}): string {
  return JSON.stringify({
    name: 'test-pkg',
    scripts,
    ...extras,
  });
}

/**
 * Set process.version to a specific value for a test.
 * Returns a cleanup function.
 */
function mockNodeVersion(version: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'version');
  Object.defineProperty(process, 'version', { value: version, configurable: true });
  return () => {
    if (original) {
      Object.defineProperty(process, 'version', original);
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlatformCompatPhase', () => {
  let phase: PlatformCompatPhase;

  beforeEach(() => {
    // Clear call history and reset implementations on all shared mock methods
    for (const fn of Object.values(mockFs)) {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }

    phase = new PlatformCompatPhase();

    // Default: no files found, no directories, no content
    mockFs.FindFiles.mockResolvedValue([]);
    mockFs.ReadText.mockResolvedValue('');
    mockFs.FileExists.mockResolvedValue(false);
    mockFs.DirectoryExists.mockResolvedValue(false);
    mockFs.ListDirectoryEntries.mockResolvedValue([]);
    mockFs.WriteText.mockResolvedValue(undefined);
    mockFs.RemoveFile.mockResolvedValue(undefined);
  });

  // =========================================================================
  // F1: Cross-platform script patching
  // =========================================================================

  describe('F1: Cross-platform script patching', () => {

    describe('Windows', () => {
      it('should prefix NODE_ENV=production with cross-env on Windows', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          start: 'NODE_ENV=production node server.js',
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(1);
        expect(mockFs.WriteText).toHaveBeenCalledTimes(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.scripts.start).toBe('cross-env NODE_ENV=production node server.js');
      });

      it('should add cross-env to devDependencies when not present', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          build: 'NODE_ENV=production tsc',
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.CrossEnvNeeded).toBe(true);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.devDependencies['cross-env']).toBe('^7.0.3');
      });

      it('should not add cross-env to devDependencies when already present', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson(
          { build: 'NODE_ENV=production tsc' },
          { devDependencies: { 'cross-env': '^7.0.0' } }
        ));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.CrossEnvNeeded).toBe(false);
        expect(result.ScriptsPatched).toHaveLength(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        // Should still have the original version, not upgraded
        expect(writtenContent.devDependencies['cross-env']).toBe('^7.0.0');
      });

      it('should rewrite bash conditional (if [ -d dir ]) to node -e on Windows', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          prebuild: 'if [ -d dist ]; then rm dist; else echo clean; fi',
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.scripts.prebuild).toContain('node -e');
        expect(writtenContent.scripts.prebuild).not.toContain('if [');
      });

      it('should replace single-quoted globs with double-quoted on Windows', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          copy: "cpy 'src/lib/styles/**' dist/",
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.scripts.copy).toBe('cpy "src/lib/styles/**" dist/');
      });

      it('should replace single-quoted paths without wildcards on Windows', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          'copy-assets': "cpy 'src/lib/_tokens.scss' dist/lib --flat",
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.scripts['copy-assets']).toBe('cpy "src/lib/_tokens.scss" dist/lib --flat');
      });

      it('should not replace single quotes inside node -e code on Windows', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          prebuild: `node -e "try { require.resolve('turbo') } catch (e) { console.error('missing'); process.exit(1); }"`,
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        // No patching needed — single quotes inside node -e are JS string delimiters
        expect(result.ScriptsPatched).toHaveLength(0);
      });

      it('should not replace single quotes with paths inside node -e code on Windows', async () => {
        // Even if the JS code contains '/' (which would match the path heuristic),
        // the node -e safety net must protect it from replacement.
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          prebuild: `node -e "const p = require('path/posix'); console.log(p.join('a/b','c'))"`,
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(0);
      });

      it('should patch single-quoted globs but preserve node -e code in the same script', async () => {
        // A script that chains a node -e check with a glob command. Only the glob
        // part should be patched; the node -e block must be left untouched.
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          prebuild: `node -e "require('turbo')" && cpy 'src/**/*.js' dist/`,
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(1);
        const writtenContent = JSON.parse(mockFs.WriteText.mock.calls[0][1] as string);
        expect(writtenContent.scripts.prebuild).toBe(
          `node -e "require('turbo')" && cpy "src/**/*.js" dist/`
        );
      });

      it('should not duplicate cross-env prefix when script already has it', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          start: 'cross-env NODE_ENV=production node server.js',
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        // Already has cross-env, so no patching needed
        expect(result.ScriptsPatched).toHaveLength(0);
      });
    });

    describe('non-Windows', () => {
      it('should only emit warn for env syntax on non-Windows (no patch)', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          start: 'NODE_ENV=production node server.js',
        }));

        const { emitter, emitSpy } = createMockEmitter();
        const ctx = makeContext({ DetectedOS: 'linux', Emitter: emitter });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(0);
        expect(mockFs.WriteText).not.toHaveBeenCalled();
        const warns = emittedEvents(emitSpy, 'warn');
        expect(warns.some((w: Record<string, unknown>) =>
          (w.Message as string).includes('Unix-only env syntax')
        )).toBe(true);
      });

      it('should only emit warn for bash syntax on non-Windows (no patch)', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          prebuild: 'if [ -d dist ]; then rm dist; else echo clean; fi',
        }));

        const { emitter, emitSpy } = createMockEmitter();
        const ctx = makeContext({ DetectedOS: 'macos', Emitter: emitter });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(0);
        expect(mockFs.WriteText).not.toHaveBeenCalled();
        const warns = emittedEvents(emitSpy, 'warn');
        expect(warns.some((w: Record<string, unknown>) =>
          (w.Message as string).includes('bash-only syntax')
        )).toBe(true);
      });
    });

    describe('no issues', () => {
      it('should return empty ScriptsPatched when no problematic scripts exist', async () => {
        mockFs.FindFiles.mockResolvedValue(['/test/install/packages/foo/package.json']);
        mockFs.ReadText.mockResolvedValue(pkgJson({
          build: 'tsc',
          test: 'vitest run',
        }));

        const ctx = makeContext({ DetectedOS: 'windows' });
        const result = await phase.Run(ctx);

        expect(result.ScriptsPatched).toHaveLength(0);
        expect(result.CrossEnvNeeded).toBe(false);
      });
    });
  });

  // =========================================================================
  // F2: Heap advisory
  // =========================================================================

  describe('F2: Heap advisory', () => {
    it('should emit info log about heap advisory on Node 24+', async () => {
      const restore = mockNodeVersion('v24.1.0');
      try {
        mockFs.FindFiles.mockResolvedValue([]);

        const { emitter, emitSpy } = createMockEmitter();
        const ctx = makeContext({ Emitter: emitter });
        await phase.Run(ctx);

        const logEvents = emittedEvents(emitSpy, 'log');
        expect(logEvents.some((e: Record<string, unknown>) =>
          (e.Message as string).includes('--max-old-space-size')
        )).toBe(true);
      } finally {
        restore();
      }
    });

    it('should not emit heap advisory for Node < 24', async () => {
      const restore = mockNodeVersion('v22.11.0');
      try {
        mockFs.FindFiles.mockResolvedValue([]);

        const { emitter, emitSpy } = createMockEmitter();
        const ctx = makeContext({ Emitter: emitter });
        await phase.Run(ctx);

        const logEvents = emittedEvents(emitSpy, 'log');
        expect(logEvents.some((e: Record<string, unknown>) =>
          (e.Message as string).includes('--max-old-space-size') &&
          (e.Message as string).includes('Node 24+')
        )).toBe(false);
      } finally {
        restore();
      }
    });
  });

  // =========================================================================
  // F3: tsconfig test exclusion patching
  // =========================================================================

  describe('F3: tsconfig test exclusion patching', () => {
    it('should add test exclusions to tsconfig with src/** in include', async () => {
      // First FindFiles call: package.json (F1), second: tsconfig.json (F3), third: package.json (F2)
      mockFs.FindFiles.mockImplementation(async (_dir: string, pattern: string) => {
        if (pattern === 'tsconfig.json') return ['/test/install/packages/foo/tsconfig.json'];
        return [];
      });

      mockFs.ReadText.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify({
            include: ['src/**/*'],
            compilerOptions: { strict: true },
          });
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.TsconfigsPatched).toBe(1);
      expect(mockFs.WriteText).toHaveBeenCalled();

      const writeCall = mockFs.WriteText.mock.calls.find(
        (call: string[]) => (call[0] as string).includes('tsconfig.json')
      );
      expect(writeCall).toBeDefined();
      const written = JSON.parse(writeCall![1] as string);
      expect(written.exclude).toContain('src/__tests__/**');
      expect(written.exclude).toContain('src/**/*.test.ts');
      expect(written.exclude).toContain('src/**/*.spec.ts');
    });

    it('should skip tsconfig without src/** in include', async () => {
      mockFs.FindFiles.mockImplementation(async (_dir: string, pattern: string) => {
        if (pattern === 'tsconfig.json') return ['/test/install/tsconfig.base.json'];
        return [];
      });

      mockFs.ReadText.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig')) {
          return JSON.stringify({
            compilerOptions: { strict: true },
          });
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.TsconfigsPatched).toBe(0);
    });

    it('should not patch tsconfig that already has all exclusions', async () => {
      mockFs.FindFiles.mockImplementation(async (_dir: string, pattern: string) => {
        if (pattern === 'tsconfig.json') return ['/test/install/packages/foo/tsconfig.json'];
        return [];
      });

      mockFs.ReadText.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify({
            include: ['src/**/*'],
            exclude: ['src/__tests__/**', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
          });
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.TsconfigsPatched).toBe(0);
    });

    it('should return count of patched tsconfig files', async () => {
      mockFs.FindFiles.mockImplementation(async (_dir: string, pattern: string) => {
        if (pattern === 'tsconfig.json') {
          return [
            '/test/install/packages/foo/tsconfig.json',
            '/test/install/packages/bar/tsconfig.json',
          ];
        }
        return [];
      });

      mockFs.ReadText.mockImplementation(async (filePath: string) => {
        if (filePath.includes('tsconfig.json')) {
          return JSON.stringify({ include: ['src/**'] });
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.TsconfigsPatched).toBe(2);
    });
  });

  // =========================================================================
  // F4: Stale entity file removal
  // =========================================================================

  describe('F4: Stale entity file removal', () => {
    it('should remove stale entity files with @RegisterClass not referenced by index.ts', async () => {
      mockFs.FindFiles.mockResolvedValue([]);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('index.ts')
      );
      // Only the custom/ directory itself is a directory; .ts files are not
      mockFs.DirectoryExists.mockImplementation(async (p: string) =>
        p.endsWith('custom')
      );
      mockFs.ListDirectoryEntries.mockResolvedValue([
        'MJUserViewEntityExtended.ts',
        'OldEntity.ts',
      ]);

      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('index.ts')) {
          return "export * from './custom/MJUserViewEntityExtended';";
        }
        if (p.includes('OldEntity.ts')) {
          return '@RegisterClass(BaseEntity, "Old Entities")\nexport class OldEntity {}';
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.StaleFilesRemoved).toBe(1);
      expect(mockFs.RemoveFile).toHaveBeenCalledTimes(1);
      // The removed file path should contain OldEntity.ts
      const removedPath = mockFs.RemoveFile.mock.calls[0][0] as string;
      expect(removedPath).toContain('OldEntity.ts');
    });

    it('should not remove files that are referenced by index.ts', async () => {
      mockFs.FindFiles.mockResolvedValue([]);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('index.ts')
      );
      // Only the custom/ directory itself is a directory; .ts files are not
      mockFs.DirectoryExists.mockImplementation(async (p: string) =>
        p.endsWith('custom')
      );
      mockFs.ListDirectoryEntries.mockResolvedValue([
        'MJUserViewEntityExtended.ts',
      ]);

      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('index.ts')) {
          return "export * from './custom/MJUserViewEntityExtended';";
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.StaleFilesRemoved).toBe(0);
      expect(mockFs.RemoveFile).not.toHaveBeenCalled();
    });

    it('should return 0 when index.ts does not exist', async () => {
      mockFs.FindFiles.mockResolvedValue([]);
      mockFs.FileExists.mockResolvedValue(false);
      mockFs.DirectoryExists.mockResolvedValue(false);

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.StaleFilesRemoved).toBe(0);
    });

    it('should return 0 when custom dir does not exist', async () => {
      mockFs.FindFiles.mockResolvedValue([]);
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('index.ts')
      );
      mockFs.DirectoryExists.mockResolvedValue(false);

      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('index.ts')) {
          return "export * from './custom/MJUserViewEntityExtended';";
        }
        return '';
      });

      const ctx = makeContext();
      const result = await phase.Run(ctx);

      expect(result.StaleFilesRemoved).toBe(0);
    });
  });

  // =========================================================================
  // Run aggregation
  // =========================================================================

  describe('Run aggregation', () => {
    it('should return correct aggregate counts when all features trigger', async () => {
      // F1: one package.json to patch (env var script)
      mockFs.FindFiles.mockImplementation(async (_dir: string, pattern: string) => {
        if (pattern === 'package.json') return ['/test/install/packages/foo/package.json'];
        if (pattern === 'tsconfig.json') return ['/test/install/packages/foo/tsconfig.json'];
        return [];
      });

      let readCallCount = 0;
      mockFs.ReadText.mockImplementation(async (p: string) => {
        if (p.includes('package.json')) {
          return pkgJson({ start: 'NODE_ENV=production node server.js' });
        }
        if (p.includes('tsconfig.json')) {
          return JSON.stringify({ include: ['src/**'] });
        }
        if (p.includes('index.ts')) {
          return "export * from './custom/MJFoo';";
        }
        return '';
      });

      // F4: index.ts exists but custom dir does not
      mockFs.FileExists.mockImplementation(async (p: string) =>
        p.includes('index.ts')
      );
      mockFs.DirectoryExists.mockResolvedValue(false);

      const ctx = makeContext({ DetectedOS: 'windows' });
      const result = await phase.Run(ctx);

      expect(result.ScriptsPatched).toHaveLength(1);
      expect(result.CrossEnvNeeded).toBe(true);
      expect(result.TsconfigsPatched).toBe(1);
      // custom dir doesn't exist, so 0 stale files
      expect(result.StaleFilesRemoved).toBe(0);
    });
  });
});
