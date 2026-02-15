/**
 * Phase F — Platform Compatibility
 *
 * F1: Detect and fix Unix-only env var syntax in package.json scripts (cross-env).
 * F2: Advisory for --max-old-space-size flags on Node >= 24.
 */

import path from 'node:path';
import type { InstallerEventEmitter } from '../events/InstallerEvents.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';

/** Regex matching Unix-only env var syntax like FOO=bar some-command */
const UNIX_ENV_PATTERN = /^([A-Z_]+=\S+\s+)+/;

export interface PlatformCompatContext {
  /** Target directory (repo root) */
  Dir: string;
  /** Detected OS from preflight */
  DetectedOS: 'windows' | 'macos' | 'linux' | 'other';
  Emitter: InstallerEventEmitter;
}

export interface PlatformCompatResult {
  /** Package.json files that had scripts patched */
  ScriptsPatched: string[];
  /** Whether cross-env was flagged as needed */
  CrossEnvNeeded: boolean;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export class PlatformCompatPhase {
  private fileSystem = new FileSystemAdapter();

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

    const packageJsonFiles = await this.fileSystem.FindFiles(context.Dir, 'package.json', 3);

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

    return {
      ScriptsPatched: patchedFiles,
      CrossEnvNeeded: crossEnvNeeded,
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

    const affectedScripts: string[] = [];
    for (const [name, script] of Object.entries(pkg.scripts)) {
      if (this.hasUnixEnvSyntax(script) && !script.startsWith('cross-env ')) {
        affectedScripts.push(name);
      }
    }

    if (affectedScripts.length === 0) {
      return { Patched: false, NeedsCrossEnv: false };
    }

    // On non-Windows, just warn
    if (detectedOS !== 'windows') {
      emitter.Emit('warn', {
        Type: 'warn',
        Phase: 'platform',
        Message: `${path.basename(path.dirname(pkgPath))}/package.json has Unix-only env syntax in: ${affectedScripts.join(', ')}. These won't work on Windows.`,
      });
      return { Patched: false, NeedsCrossEnv: false };
    }

    // On Windows, patch scripts
    let needsCrossEnv = false;
    const hasCrossEnv = !!(pkg.devDependencies?.['cross-env'] ?? pkg.dependencies?.['cross-env']);

    for (const name of affectedScripts) {
      const original = pkg.scripts[name];
      pkg.scripts[name] = `cross-env ${original}`;

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'platform',
        Message: `Patched script "${name}" in ${path.basename(path.dirname(pkgPath))}/package.json`,
      });
    }

    if (!hasCrossEnv) {
      pkg.devDependencies = pkg.devDependencies ?? {};
      pkg.devDependencies['cross-env'] = '^7.0.3';
      needsCrossEnv = true;

      emitter.Emit('step:progress', {
        Type: 'step:progress',
        Phase: 'platform',
        Message: `Added cross-env as devDependency in ${path.basename(path.dirname(pkgPath))}/package.json`,
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
