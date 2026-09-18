/**
 * Package-manager abstraction for the installer.
 *
 * The installer historically shelled out to hardcoded `npm` / `npx` commands.
 * As of era 6 the platform manifest declares pnpm, so the installer defaults
 * to pnpm and accepts an explicit npm override via
 * {@link InstallConfig.PackageManager}. Every phase that shells out to a
 * package manager builds its command through {@link PackageManagerCommands}
 * so the choice lives in exactly one place.
 *
 * There is deliberately **no silent fallback**: if the configured package
 * manager is missing, preflight hard-fails with instructions. Two installs of
 * the same version must produce the same tree — certification evidence
 * depends on it.
 *
 * @module models/PackageManager
 * @see PreflightPhase — verifies the configured package manager exists.
 * @see DependencyPhase — install/build entry point.
 */

/** Package managers the installer supports. Yarn is deliberately out of scope. */
export type PackageManagerType = 'npm' | 'pnpm';

/** A resolved shell invocation: the binary plus its argument list. */
export interface PmCommand {
  Cmd: string;
  Args: string[];
}

/**
 * The exact version pinned into the scaffolded root `package.json`'s
 * `packageManager` field per package manager. The pnpm pin matches the MJ
 * monorepo's own pin; corepack activates the right version from it.
 */
const PACKAGE_MANAGER_PINS: Record<PackageManagerType, string> = {
  npm: 'npm@11.7.0',
  pnpm: 'pnpm@10.33.0',
};

/** Lockfile each package manager writes at the workspace root. */
const LOCKFILE_NAMES: Record<PackageManagerType, string> = {
  npm: 'package-lock.json',
  pnpm: 'pnpm-lock.yaml',
};

/**
 * Resolve the effective package manager from a config value.
 * The default is pnpm — the era-6 platform manifest declares pnpm 10.x.
 */
export function resolvePackageManager(configured: PackageManagerType | undefined): PackageManagerType {
  return configured ?? 'pnpm';
}

/**
 * Builds the shell commands for one package manager.
 *
 * @example
 * ```typescript
 * const pm = PackageManagerCommands.For(config.PackageManager);
 * const { Cmd, Args } = pm.RunScript('build');
 * await processRunner.Run(Cmd, Args, { Cwd: dir });
 * ```
 */
export class PackageManagerCommands {
  constructor(public readonly Name: PackageManagerType) {}

  /** Build from a config value, applying the pnpm default. */
  static For(configured: PackageManagerType | undefined): PackageManagerCommands {
    return new PackageManagerCommands(resolvePackageManager(configured));
  }

  /** `npm install [...extra]` / `pnpm install [...extra]`. */
  Install(extraArgs: string[] = []): PmCommand {
    return { Cmd: this.Name, Args: ['install', ...extraArgs] };
  }

  /** `npm run <script>` / `pnpm run <script>`. */
  RunScript(script: string): PmCommand {
    return { Cmd: this.Name, Args: ['run', script] };
  }

  /** Run a locally-installed binary: `npx <bin>` / `pnpm exec <bin>`. */
  Exec(binary: string, args: string[]): PmCommand {
    if (this.Name === 'npm') {
      return { Cmd: 'npx', Args: [binary, ...args] };
    }
    return { Cmd: 'pnpm', Args: ['exec', binary, ...args] };
  }

  /** Run a remote package without installing it: `npx <spec>` / `pnpm dlx <spec>`. */
  Dlx(packageSpec: string, args: string[]): PmCommand {
    if (this.Name === 'npm') {
      return { Cmd: 'npx', Args: [packageSpec, ...args] };
    }
    return { Cmd: 'pnpm', Args: ['dlx', packageSpec, ...args] };
  }

  /** The lockfile this package manager writes at the workspace root. */
  get LockfileName(): string {
    return LOCKFILE_NAMES[this.Name];
  }

  /** Value for the root `package.json` `packageManager` field. */
  get PackageManagerPin(): string {
    return PACKAGE_MANAGER_PINS[this.Name];
  }
}
