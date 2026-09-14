/**
 * Loads the host's dynamic packages for an `mj sync` command (5.x LTS).
 *
 * `mj sync` bootstraps entity classes from the server-bootstrap-lite manifest, which covers only
 * `@memberjunction/*`. Without this, every entity from an installed Open App (`dynamicPackages.server`)
 * or from the host's own generated packages (`codeGeneration.packages`) is created as a generic
 * `BaseEntity`: push skips the entity's custom `Save()`, validation and lifecycle hooks, and pull
 * misses the values its class computes. MJAPI has always loaded these packages at boot; this gives
 * `mj sync push` / `mj sync pull` the same classes.
 *
 * On 6.x the `mj` CLI's prerun hook loads packages for every command. On the 5.x line only the
 * sync commands call this — nothing else in the process list changes. The loader is the 6.x one
 * (./dynamic-packages), so an entry's `Enabled`, `Processes` / `ExcludeProcesses`, the
 * `dynamicPackages.policy` map and `MJ_DYNAMIC_PACKAGES=none` behave identically on both lines.
 *
 * Output goes to stderr (stdout may be a `--format=json` envelope): per-package progress only with
 * `--verbose`, genuine load failures always.
 */
import { configManager } from './config-manager';
import {
  CliProcessId,
  LoadDynamicPackages,
  type DynamicPackagesLogger,
  type DynamicPackagesReport,
} from './dynamic-packages/index';

export interface LoadSyncDynamicPackagesOptions {
  /** Print per-package progress (stderr). Failures print regardless. */
  verbose?: boolean;
  /**
   * Override the config source — for tests. Defaults to the mj.config.cjs the sync command
   * already loaded (same file its database settings came from).
   */
  raw?: { config: Record<string, unknown> | null; configFilePath?: string };
  /** Test seam for the stderr channel. */
  stderr?: (line: string) => void;
}

function stderrLogger(verbose: boolean, write: (line: string) => void): DynamicPackagesLogger {
  return {
    info: (message) => {
      if (verbose) write(message);
    },
    warn: (message, error) => {
      const detail = error === undefined ? '' : ` ${error instanceof Error ? error.message : String(error)}`;
      write(`${message}${detail}`);
    },
    verbose: (message) => {
      if (verbose) write(message);
    },
  };
}

/**
 * Loads the dynamic packages that apply to one sync command, under process ID `cli:<commandId>`
 * (`sync:push` → `cli:sync:push`). Call it after the class-registration manifest is loaded and
 * before the database provider is initialized. Never throws for a package problem: a broken app
 * package is reported on stderr and the command proceeds with `BaseEntity` for that app's entities.
 */
export async function loadSyncDynamicPackages(
  commandId: string,
  options: LoadSyncDynamicPackagesOptions = {}
): Promise<DynamicPackagesReport> {
  const verbose = options.verbose ?? false;
  const write = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const raw = options.raw ?? {
    config: configManager.getRawMJConfig(),
    configFilePath: configManager.getMJConfigFilePath(),
  };

  const report = await LoadDynamicPackages({
    processId: CliProcessId(commandId),
    tier: 'server',
    config: raw.config,
    configFilePath: raw.configFilePath,
    log: stderrLogger(verbose, write),
  });

  const touched = report.Loaded.length + report.Skipped.length + report.NotFound.length + report.Failed.length;
  if (verbose && touched > 0) {
    write(
      `[dynamic-packages] ${report.ProcessId}: loaded ${report.Loaded.length}, skipped ${report.Skipped.length}, ` +
        `not found ${report.NotFound.length}, failed ${report.Failed.length} (mode '${report.Mode}', source: ${report.ModeSource})`
    );
  }
  return report;
}
