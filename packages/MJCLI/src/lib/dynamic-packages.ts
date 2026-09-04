/**
 * CLI adapter for @memberjunction/dynamic-packages.
 *
 * Every heavy `mj` command runs this from the prerun hook, right after the server-bootstrap-lite
 * manifest is imported and before the command opens a database provider. The loader itself is
 * process-agnostic; what this module owns is the CLI's identity (`cli:<command>`), the raw config
 * source, and stdio discipline — nothing may reach stdout, because `--format=json` callers parse
 * it. Progress goes to stderr under `--verbose`; genuine load failures always go to stderr.
 */
import {
  CliProcessId,
  DYNAMIC_PACKAGES_PROCESS_ENV_VAR,
  LoadDynamicPackages,
  type DynamicPackagesLogger,
  type DynamicPackagesReport,
} from '@memberjunction/dynamic-packages';
import { getRawConfig } from '../config.js';

export interface LoadDynamicPackagesForCommandOptions {
  /** Print per-package progress (stderr). Failures print regardless. */
  verbose?: boolean;
  /**
   * Override the config source — for tests, or for a caller that has already discovered a
   * config elsewhere. Defaults to the CLI's own cosmiconfig result.
   */
  raw?: { config: Record<string, unknown> | undefined; configFilePath?: string };
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
 * Loads the dynamic packages that apply to one CLI command. Never throws for a package problem;
 * a broken app package is reported on stderr and the command proceeds (it may then fall back to
 * BaseEntity for that app's entities — `mj sync push` warns per entity when that happens).
 */
export async function loadDynamicPackagesForCommand(
  commandId: string,
  options: LoadDynamicPackagesForCommandOptions = {}
): Promise<DynamicPackagesReport> {
  const verbose = options.verbose ?? false;
  const write = options.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const raw = options.raw ?? getRawConfig();
  const processId = CliProcessId(commandId);
  // Publish this command's identity for hosts the command imports in-process (`mj ai …` drives
  // @memberjunction/ai-cli, `mj test …` drives @memberjunction/testing-cli). Their own provider
  // bootstraps call the loader too; under this id they apply the same scoping and policy the
  // prerun pass applied, instead of re-attempting entries an operator excluded from `cli`.
  process.env[DYNAMIC_PACKAGES_PROCESS_ENV_VAR] = processId;
  const report = await LoadDynamicPackages({
    processId,
    tier: 'server',
    config: raw.config ?? null,
    configFilePath: raw.configFilePath,
    log: stderrLogger(verbose, write),
  });
  if (verbose && (report.Loaded.length > 0 || report.Skipped.length > 0 || report.NotFound.length > 0 || report.Failed.length > 0)) {
    write(
      `[dynamic-packages] ${report.ProcessId}: loaded ${report.Loaded.length}, skipped ${report.Skipped.length}, ` +
        `not found ${report.NotFound.length}, failed ${report.Failed.length} (mode '${report.Mode}', source: ${report.ModeSource})`
    );
  }
  return report;
}
