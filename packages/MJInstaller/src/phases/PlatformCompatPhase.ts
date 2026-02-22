/**
 * Phase F — Platform Compatibility
 *
 * Detects and fixes cross-platform issues in npm scripts that would
 * prevent the MemberJunction workspace from building or running on Windows.
 *
 * **F1: Cross-platform script patching** (Windows only):
 * - **Unix env vars** (`FOO=bar command`) — prefixed with `cross-env`.
 * - **Bash conditionals** (`if [ -d dir ]; then ...`) — rewritten to
 *   `node -e` equivalents that work in `cmd.exe`.
 * - **Single-quoted globs** (`'src/**'`) — replaced with double quotes
 *   (single quotes are literal in `cmd.exe`, breaking glob expansion).
 *
 * On non-Windows platforms, these issues are only warned about (not patched).
 *
 * **F2: Heap size advisory** (Node >= 24):
 * - Informs users that `--max-old-space-size` flags may no longer be needed
 *   since Node 24+ has improved memory management.
 *
 * **F3: TypeScript build hygiene** (all platforms):
 * - Ensures `tsconfig.json` files exclude test directories (`__tests__`,
 *   `*.test.ts`, `*.spec.ts`) so that test-only compilation errors don't
 *   block production builds. This fixes a known issue where release packages
 *   ship test files referencing features from a newer version.
 *
 * **F4: Stale entity file cleanup** (all platforms):
 * - Removes old-name entity files from `MJCoreEntities/src/custom/` that
 *   were superseded by MJ-prefixed versions during the 5.x entity rename.
 *   The published packages may ship both old and new files (e.g.,
 *   `UserViewEntity.ts` alongside `MJUserViewEntityExtended.ts`). The old
 *   files cause build errors (private property type conflicts) and runtime
 *   issues (duplicate `@RegisterClass` registrations).
 *
 * @module phases/PlatformCompatPhase
 * @see PreflightPhase — provides the detected OS used for conditional patching.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

/**
 * Regex matching Unix-only env var syntax like `FOO=bar some-command`.
 * These scripts fail on Windows where `cmd.exe` doesn't support inline env vars.
 */
const UNIX_ENV_PATTERN = /^([A-Z_]+=\S+\s+)+/;

/**
 * Regex matching bash conditional syntax: `if [ ... ]; then ... fi`.
 * These scripts fail on Windows where `cmd.exe` doesn't support `[` test syntax.
 */
const BASH_CONDITIONAL_PATTERN = /^if\s+\[/;

/**
 * Regex matching single-quoted arguments containing glob wildcards.
 *
 * On Windows `cmd.exe`, single quotes are passed literally to commands
 * (they're NOT quote characters in `cmd.exe`). This breaks glob patterns
 * like `cpy 'src/lib/styles/**'` because the tool receives the path with
 * quotes embedded. Double quotes work correctly on both platforms.
 */
const SINGLE_QUOTED_ARG_PATTERN = /'[^']*\*[^']*'/;

/**
 * Input context for the platform compatibility phase.
 *
 * @see PlatformCompatPhase.Run
 */
export interface PlatformCompatContext {
  /** Absolute path to the repo root. */
  Dir: string;
  /** Detected operating system from the preflight phase. */
  DetectedOS: 'windows' | 'macos' | 'linux' | 'other';
  /** Event emitter for progress, warn, and log events. */
  Emitter: InstallerEventEmitter;
}

/**
 * Result of the platform compatibility phase.
 *
 * @see PlatformCompatPhase.Run
 */
export interface PlatformCompatResult {
  /** Absolute paths of `package.json` files that had scripts patched. */
  ScriptsPatched: string[];
  /** Whether `cross-env` was added as a dependency to any package. */
  CrossEnvNeeded: boolean;
  /** Number of `tsconfig.json` files patched to exclude test files from compilation. */
  TsconfigsPatched: number;
  /** Number of stale pre-MJ-prefix entity files removed from MJCoreEntities. */
  StaleFilesRemoved: number;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

interface TsconfigJson {
  include?: string[];
  exclude?: string[];
  compilerOptions?: Record<string, unknown>;
  extends?: string;
}

/**
 * Phase F — Detects and patches cross-platform incompatibilities in npm scripts.
 *
 * @example
 * ```typescript
 * const platform = new PlatformCompatPhase();
 * const result = await platform.Run({
 *   Dir: '/path/to/install',
 *   DetectedOS: 'windows',
 *   Emitter: emitter,
 * });
 * console.log(`Patched ${result.ScriptsPatched.length} file(s)`);
 * ```
 */
export class PlatformCompatPhase {
  private fileSystem = new FileSystemAdapter();

  /**
   * Execute the platform compatibility phase.
   *
   * Scans all `package.json` files in the workspace for platform-specific
   * script issues and patches them on Windows. Also emits a heap size
   * advisory for Node >= 24.
   *
   * @param context - Platform compat input with directory, detected OS, and emitter.
   * @returns List of patched files and whether cross-env was added.
   */
  async Run(context: PlatformCompatContext): Promise<PlatformCompatResult> {
    const { Emitter: emitter } = context;
    const patchedFiles: string[] = [];
    let crossEnvNeeded = false;

    // F1: Cross-platform script fix
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'platform',
      Message: 'Scanning package.json files for platform-specific scripts...',
    });

    const packageJsonFiles = await this.fileSystem.FindFiles(context.Dir, 'package.json', 5);

    for (const pkgPath of packageJsonFiles) {
      const result = await this.checkAndPatchPackageJson(pkgPath, context.DetectedOS, emitter);
      if (result.Patched) {
        patchedFiles.push(pkgPath);
      }
      if (result.NeedsCrossEnv) {
        crossEnvNeeded = true;
      }
    }

    if (patchedFiles.length > 0) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Patched ${patchedFiles.length} package.json file(s) for cross-platform compatibility.`,
      });
    } else {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'No platform-specific script issues detected.',
      });
    }

    // F2: Heap size advisory
    await this.checkHeapAdvisory(context.Dir, emitter);

    // F3: TypeScript build hygiene — exclude test files from tsconfig compilation
    const tsconfigsPatched = await this.ensureTsconfigTestExclusions(context.Dir, emitter);

    // F4: Remove stale pre-MJ-prefix entity files that cause build errors
    const staleFilesRemoved = await this.removeStaleEntityFiles(context.Dir, emitter);

    return {
      ScriptsPatched: patchedFiles,
      CrossEnvNeeded: crossEnvNeeded,
      TsconfigsPatched: tsconfigsPatched,
      StaleFilesRemoved: staleFilesRemoved,
    };
  }

  // ---------------------------------------------------------------------------
  // F1: Cross-env detection and patching
  // ---------------------------------------------------------------------------

  private async checkAndPatchPackageJson(
    pkgPath: string,
    detectedOS: string,
    emitter: InstallerEventEmitter
  ): Promise<{ Patched: boolean; NeedsCrossEnv: boolean }> {
    let content: string;
    try {
      content = await this.fileSystem.ReadText(pkgPath);
    } catch {
      return { Patched: false, NeedsCrossEnv: false };
    }

    let pkg: PackageJson;
    try {
      pkg = JSON.parse(content) as PackageJson;
    } catch {
      return { Patched: false, NeedsCrossEnv: false };
    }

    if (!pkg.scripts) return { Patched: false, NeedsCrossEnv: false };

    const envVarScripts: string[] = [];
    const bashScripts: string[] = [];
    const singleQuoteScripts: string[] = [];

    for (const [name, script] of Object.entries(pkg.scripts)) {
      if (this.hasUnixEnvSyntax(script) && !script.startsWith('cross-env ')) {
        envVarScripts.push(name);
      }
      if (this.hasBashConditionalSyntax(script)) {
        bashScripts.push(name);
      }
      if (this.hasSingleQuotedGlobs(script)) {
        singleQuoteScripts.push(name);
      }
    }

    if (envVarScripts.length === 0 && bashScripts.length === 0 && singleQuoteScripts.length === 0) {
      return { Patched: false, NeedsCrossEnv: false };
    }

    const pkgName = path.basename(path.dirname(pkgPath));

    // On non-Windows, just warn
    if (detectedOS !== 'windows') {
      if (envVarScripts.length > 0) {
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'platform',
          Message: `${pkgName}/package.json has Unix-only env syntax in: ${envVarScripts.join(', ')}. These won't work on Windows.`,
        });
      }
      if (bashScripts.length > 0) {
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'platform',
          Message: `${pkgName}/package.json has bash-only syntax in: ${bashScripts.join(', ')}. These won't work on Windows.`,
        });
      }
      return { Patched: false, NeedsCrossEnv: false };
    }

    // On Windows, patch scripts
    let needsCrossEnv = false;
    const hasCrossEnv = !!(pkg.devDependencies?.['cross-env'] ?? pkg.dependencies?.['cross-env']);

    for (const name of envVarScripts) {
      const original = pkg.scripts[name];
      pkg.scripts[name] = `cross-env ${original}`;

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'platform',
        Message: `Patched env-var script "${name}" in ${pkgName}/package.json`,
      });
    }

    if (envVarScripts.length > 0 && !hasCrossEnv) {
      pkg.devDependencies = pkg.devDependencies ?? {};
      pkg.devDependencies['cross-env'] = '^7.0.3';
      needsCrossEnv = true;

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'platform',
        Message: `Added cross-env as devDependency in ${pkgName}/package.json`,
      });
    }

    for (const name of bashScripts) {
      const original = pkg.scripts[name];
      const replacement = this.rewriteBashConditional(original);
      if (replacement) {
        pkg.scripts[name] = replacement;
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'platform',
          Message: `Rewrote bash script "${name}" in ${pkgName}/package.json for Windows compatibility`,
        });
      } else {
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'platform',
          Message: `Could not auto-patch bash script "${name}" in ${pkgName}/package.json. You may need to fix it manually.`,
        });
      }
    }

    for (const name of singleQuoteScripts) {
      pkg.scripts[name] = this.replaceSingleQuotes(pkg.scripts[name]);
      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'platform',
        Message: `Replaced single-quoted globs in "${name}" in ${pkgName}/package.json for Windows compatibility`,
      });
    }

    // Write back the patched package.json
    const updatedContent = JSON.stringify(pkg, null, 2) + '\n';
    await this.fileSystem.WriteText(pkgPath, updatedContent);

    return { Patched: true, NeedsCrossEnv: needsCrossEnv };
  }

  private hasUnixEnvSyntax(script: string): boolean {
    return UNIX_ENV_PATTERN.test(script);
  }

  private hasBashConditionalSyntax(script: string): boolean {
    return BASH_CONDITIONAL_PATTERN.test(script);
  }

  private hasSingleQuotedGlobs(script: string): boolean {
    return SINGLE_QUOTED_ARG_PATTERN.test(script);
  }

  /**
   * Replaces single-quoted arguments with double-quoted equivalents.
   * e.g. cpy 'src/lib/styles/**' → cpy "src/lib/styles/**"
   */
  private replaceSingleQuotes(script: string): string {
    return script.replace(/'([^']+)'/g, '"$1"');
  }

  /**
   * Rewrites bash conditional scripts to cross-platform Node.js equivalents.
   *
   * Strategy: replace the entire script with a single `node -e` that performs
   * the condition check and branch logic inline, then chains the actual commands
   * with && / ||. This avoids nested quoting issues.
   *
   * Returns null if the script can't be auto-rewritten.
   */
  private rewriteBashConditional(script: string): string | null {
    // Pattern: if [ -d DIR ]; then THEN_BODY; else ELSE_BODY; fi
    const dirIfElse = script.match(
      /^if\s+\[\s+-d\s+(\S+)\s+\];\s*then\s+(.*?);\s*else\s+(.*?);\s*fi$/
    );
    if (dirIfElse) {
      const dir = dirIfElse[1];
      const thenBody = this.rewriteBashCommands(dirIfElse[2].trim());
      const elseBody = this.rewriteBashCommands(dirIfElse[3].trim());
      // node -e exits 0 if dir exists, 1 if not.
      // cmd.exe: A && B || C  → if A succeeds run B, if A fails run C
      const check = `node -e "if(!require('fs').existsSync('${dir}'))process.exit(1)"`;
      return `${check} && (${thenBody}) || (${elseBody})`;
    }

    // Pattern: if [ -f FILE ]; then THEN_BODY; fi
    const fileIf = script.match(
      /^if\s+\[\s+-f\s+(\S+)\s+\];\s*then\s+(.*?);\s*fi$/
    );
    if (fileIf) {
      const file = fileIf[1];
      const thenBody = this.rewriteBashCommands(fileIf[2].trim());
      const check = `node -e "if(!require('fs').existsSync('${file}'))process.exit(1)"`;
      return `${check} && (${thenBody}) || echo Skipped`;
    }

    return null;
  }

  /**
   * Rewrites bash-only commands within a command chain to cross-platform equivalents.
   * Replaces: `touch FILE`, `rm FILE`
   * Leaves other commands (npm, mj, tsc, echo, etc.) unchanged.
   * Handles `&&` chains and `||` fallbacks.
   */
  private rewriteBashCommands(chain: string): string {
    // Split on && but preserve || fallbacks
    // e.g. "rm .needs-manifest-rebuild && (mj codegen ... || echo warning)"
    return chain.replace(/\btouch\s+(\S+)/g, (_match, file: string) => {
      return `node -e "require('fs').writeFileSync('${file}','')"`;
    }).replace(/\brm\s+(\S+)/g, (_match, file: string) => {
      return `node -e "try{require('fs').unlinkSync('${file}')}catch(e){}"`;
    });
  }

  // ---------------------------------------------------------------------------
  // F3: TypeScript build hygiene — exclude test files from tsconfig
  // ---------------------------------------------------------------------------

  /**
   * Standard test-file exclusion patterns added to tsconfig `exclude` arrays.
   * These ensure that `tsc` doesn't compile test files during production builds.
   * Vitest handles its own compilation via its config, so tests still run fine.
   */
  private static readonly TEST_EXCLUDE_PATTERNS = [
    'src/__tests__/**',
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
  ];

  /**
   * Scans all `tsconfig.json` files under `packages/` and adds test-file
   * exclusion patterns where missing. This prevents test files that reference
   * newer or unreleased APIs from breaking the production build.
   *
   * @returns Number of tsconfig files that were patched.
   */
  private async ensureTsconfigTestExclusions(
    dir: string,
    emitter: InstallerEventEmitter
  ): Promise<number> {
    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'platform',
      Message: 'Checking tsconfig.json files for test-file exclusions...',
    });

    const tsconfigFiles = await this.fileSystem.FindFiles(dir, 'tsconfig.json', 5);
    let patchedCount = 0;

    for (const tsconfigPath of tsconfigFiles) {
      const patched = await this.patchTsconfigIfNeeded(tsconfigPath);
      if (patched) {
        patchedCount++;
      }
    }

    if (patchedCount > 0) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Added test-file exclusions to ${patchedCount} tsconfig.json file(s).`,
      });
    }

    return patchedCount;
  }

  /**
   * Patches a single tsconfig.json to exclude test files if not already excluded.
   * Only patches files that include `src/**` patterns (package tsconfigs).
   *
   * @returns `true` if the file was modified.
   */
  private async patchTsconfigIfNeeded(tsconfigPath: string): Promise<boolean> {
    let content: string;
    try {
      content = await this.fileSystem.ReadText(tsconfigPath);
    } catch {
      return false;
    }

    let tsconfig: TsconfigJson;
    try {
      tsconfig = JSON.parse(content) as TsconfigJson;
    } catch {
      return false;
    }

    // Only patch tsconfigs that include src/** (package-level configs)
    const includePatterns = tsconfig.include ?? [];
    const includesSrc = includePatterns.some(
      (p) => p.includes('src/') || p.includes('src\\') || p === 'src/**/*' || p === 'src/**'
    );
    if (!includesSrc) {
      return false;
    }

    // Check if test exclusions are already present
    const excludePatterns = tsconfig.exclude ?? [];
    const existingExcludes = new Set(excludePatterns.map((p) => p.toLowerCase()));
    const missingPatterns = PlatformCompatPhase.TEST_EXCLUDE_PATTERNS.filter(
      (pattern) => !existingExcludes.has(pattern.toLowerCase())
    );

    if (missingPatterns.length === 0) {
      return false; // Already has all needed exclusions
    }

    // Patch: add missing test exclusion patterns
    tsconfig.exclude = [...excludePatterns, ...missingPatterns];
    const updatedContent = JSON.stringify(tsconfig, null, 2) + '\n';
    await this.fileSystem.WriteText(tsconfigPath, updatedContent);

    return true;
  }

  // ---------------------------------------------------------------------------
  // F4: Stale entity file cleanup
  // ---------------------------------------------------------------------------

  /**
   * Removes stale entity files from `packages/MJCoreEntities/src/custom/` that
   * were superseded by MJ-prefixed versions during the 5.x entity rename.
   *
   * The published npm packages may ship both old-name and new-name files (e.g.,
   * `UserViewEntity.ts` alongside `MJUserViewEntityExtended.ts`). The old files
   * are unreferenced by `index.ts` but still compiled by `tsc`, causing build
   * errors (TS2322: private property type conflicts) and potential runtime issues
   * (duplicate `@RegisterClass` registrations for the same entity).
   *
   * Detection strategy: reads `index.ts` to identify active custom exports,
   * then deletes any `.ts` files in `custom/` that contain `@RegisterClass`
   * but are not referenced by any `index.ts` export line.
   *
   * @returns Number of stale files removed.
   */
  private async removeStaleEntityFiles(
    dir: string,
    emitter: InstallerEventEmitter
  ): Promise<number> {
    const coreEntitiesSrc = path.join(dir, 'packages', 'MJCoreEntities', 'src');
    const indexPath = path.join(coreEntitiesSrc, 'index.ts');

    if (!(await this.fileSystem.FileExists(indexPath))) {
      return 0; // MJCoreEntities not present
    }

    // Build the set of active custom file paths from index.ts exports
    const indexContent = await this.fileSystem.ReadText(indexPath);
    const activeFiles = this.extractActiveCustomFiles(indexContent, coreEntitiesSrc);

    if (activeFiles.size === 0) {
      return 0; // No custom exports found
    }

    // Scan custom/ directory for stale .ts files with @RegisterClass
    const customDir = path.join(coreEntitiesSrc, 'custom');
    if (!(await this.fileSystem.DirectoryExists(customDir))) {
      return 0;
    }

    const staleFiles = await this.findStaleEntityFiles(customDir, activeFiles);
    if (staleFiles.length === 0) {
      return 0;
    }

    emitter.Emit('step:progress', {
      Type: 'step:progress',
      Phase: 'platform',
      Message: `Found ${staleFiles.length} stale pre-rename entity file(s) in MJCoreEntities — removing...`,
    });

    // Delete stale files
    let removedCount = 0;
    for (const staleFile of staleFiles) {
      const relName = path.relative(coreEntitiesSrc, staleFile).replace(/\\/g, '/');
      try {
        await this.fileSystem.RemoveFile(staleFile);
        removedCount++;
        emitter.Emit('step:progress', {
          Type: 'step:progress',
          Phase: 'platform',
          Message: `Removed stale entity file: ${relName}`,
        });
      } catch {
        emitter.Emit('warn', {
          Type: 'warn',
          Phase: 'platform',
          Message: `Could not remove stale entity file: ${relName}. This may cause build errors.`,
        });
      }
    }

    if (removedCount > 0) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: `Removed ${removedCount} stale entity file(s) from MJCoreEntities.`,
      });
    }

    return removedCount;
  }

  /**
   * Extracts the set of active custom file paths from `index.ts` export lines.
   *
   * Parses lines like `export * from './custom/MJUserViewEntityExtended'`
   * and resolves them to absolute paths with `.ts` extensions.
   */
  private extractActiveCustomFiles(indexContent: string, srcDir: string): Set<string> {
    const activeFiles = new Set<string>();
    const exportPattern = /export\s+\*\s+from\s+['"]\.\/custom\/([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = exportPattern.exec(indexContent)) !== null) {
      const relPath = match[1] + '.ts';
      activeFiles.add(path.normalize(path.join(srcDir, 'custom', relPath)));
    }
    return activeFiles;
  }

  /**
   * Recursively finds `.ts` files in a directory that:
   * 1. Are NOT in the `activeFiles` set (not exported by `index.ts`)
   * 2. Contain `@RegisterClass` (indicating entity registration, not utilities)
   */
  private async findStaleEntityFiles(
    dirPath: string,
    activeFiles: Set<string>
  ): Promise<string[]> {
    const staleFiles: string[] = [];
    const entries = await this.fileSystem.ListDirectoryEntries(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);

      if (await this.fileSystem.DirectoryExists(fullPath)) {
        // Recurse into subdirectories
        const subStale = await this.findStaleEntityFiles(fullPath, activeFiles);
        staleFiles.push(...subStale);
      } else if (entry.endsWith('.ts') && !activeFiles.has(path.normalize(fullPath))) {
        // Check if it's a stale entity file (contains @RegisterClass)
        try {
          const content = await this.fileSystem.ReadText(fullPath);
          if (content.includes('@RegisterClass')) {
            staleFiles.push(fullPath);
          }
        } catch {
          // Can't read — skip
        }
      }
    }

    return staleFiles;
  }

  // ---------------------------------------------------------------------------
  // F2: Heap size advisory
  // ---------------------------------------------------------------------------

  private async checkHeapAdvisory(dir: string, emitter: InstallerEventEmitter): Promise<void> {
    const nodeMatch = process.version.match(/^v?(\d+)/);
    const majorVersion = nodeMatch ? parseInt(nodeMatch[1], 10) : 0;

    if (majorVersion >= 24) {
      emitter.Emit('log', {
        Type: 'log',
        Level: 'info',
        Message: 'Node 24+ detected. The --max-old-space-size flags in start scripts may no longer be necessary. You can remove them if memory usage is acceptable without them.',
      });
    }

    // Check for heap flags in scripts
    const packageJsonFiles = await this.fileSystem.FindFiles(dir, 'package.json', 2);
    for (const pkgPath of packageJsonFiles) {
      try {
        const content = await this.fileSystem.ReadText(pkgPath);
        if (content.includes('--max-old-space-size')) {
          const pkgName = path.basename(path.dirname(pkgPath));
          emitter.Emit('log', {
            Type: 'log',
            Level: 'verbose',
            Message: `${pkgName}/package.json contains --max-old-space-size flags (left as-is).`,
          });
        }
      } catch {
        // skip
      }
    }
  }
}
