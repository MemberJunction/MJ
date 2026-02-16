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

/** Regex matching bash conditional syntax: if [ ... ]; then ... fi */
const BASH_CONDITIONAL_PATTERN = /^if\s+\[/;

/**
 * Regex matching single-quoted arguments in npm scripts.
 * On Windows cmd.exe, single quotes are passed literally to commands
 * (they're NOT quote characters in cmd.exe). This breaks glob patterns
 * like cpy 'src/lib/styles/**' because the tool receives 'src/... with
 * the quotes embedded in the path.
 */
const SINGLE_QUOTED_ARG_PATTERN = /'[^']*\*[^']*'/;

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
