/**
 * Result model for `mj doctor` — a collection of diagnostic checks
 * that can be displayed by any frontend.
 *
 * The {@link Diagnostics} class aggregates individual {@link DiagnosticCheck}
 * results produced by {@link PreflightPhase} and {@link CodeGenPhase}, along
 * with environment metadata and last-install state. Frontends render this
 * data as a health report with pass/fail/warn indicators.
 *
 * @module models/Diagnostics
 *
 * @example
 * ```typescript
 * const engine = new InstallerEngine();
 * const diagnostics = await engine.Doctor('/path/to/install');
 * if (diagnostics.HasFailures) {
 *   for (const failure of diagnostics.Failures) {
 *     console.error(`FAIL: ${failure.Name} — ${failure.Message}`);
 *     if (failure.SuggestedFix) console.error(`  Fix: ${failure.SuggestedFix}`);
 *   }
 * }
 * ```
 */

/**
 * Outcome severity of a single diagnostic check.
 *
 * - `'pass'` — check succeeded, no action needed.
 * - `'fail'` — hard failure that blocks the install or indicates a broken state.
 * - `'warn'` — non-blocking issue that should be reviewed.
 * - `'info'` — informational only (e.g., detected OS, Node recommendation).
 */
export type DiagnosticStatus = 'pass' | 'fail' | 'warn' | 'info';

/**
 * A single diagnostic check result, produced by preflight or doctor checks.
 *
 * @see PreflightPhase — produces checks for Node version, npm, disk space, ports, SQL connectivity, OS, and write permissions.
 * @see CodeGenPhase.RunKnownIssueChecks — produces checks for known source-level issues.
 */
export interface DiagnosticCheck {
  /** Short label for the check (e.g., `"Node.js version"`, `"Disk space"`). */
  Name: string;
  /** Outcome severity of this check. */
  Status: DiagnosticStatus;
  /** Human-readable description of the check result. */
  Message: string;
  /** Actionable remediation step, present only for `'fail'` and `'warn'` statuses. */
  SuggestedFix?: string;
}

/**
 * Detected runtime environment metadata gathered during preflight.
 *
 * @see PreflightPhase — populates this from `process.version`, `npm --version`, and `os` module.
 */
export interface EnvironmentInfo {
  /** Operating system description (e.g., `"win32 10.0.19045 (x64)"`). */
  OS: string;
  /** Node.js version string (e.g., `"v22.11.0"`). */
  NodeVersion: string;
  /** npm version string (e.g., `"10.9.0"`) or `"not found"`. */
  NpmVersion: string;
  /** CPU architecture (e.g., `"x64"`, `"arm64"`). */
  Architecture: string;
}

/**
 * Summary of the most recent install attempt, loaded from the
 * `.mj-install-state.json` checkpoint file.
 *
 * @see InstallState — the checkpoint state class that persists this data.
 */
export interface LastInstallInfo {
  /** Git tag of the installed version (e.g., `"v5.1.0"`). */
  Tag: string;
  /** ISO 8601 timestamp when the install was started. */
  Timestamp: string;
}

/**
 * Aggregated diagnostic report produced by `mj doctor` or preflight checks.
 *
 * Collects individual {@link DiagnosticCheck} results along with environment
 * metadata and optional last-install state. Provides convenience getters for
 * filtering checks by severity.
 *
 * @example
 * ```typescript
 * const diagnostics = new Diagnostics(environment);
 * diagnostics.AddCheck({ Name: 'npm', Status: 'pass', Message: 'npm 10.9.0' });
 * diagnostics.AddCheck({ Name: 'Disk space', Status: 'fail', Message: 'Only 0.5 GB free' });
 * console.log(diagnostics.HasFailures); // true
 * console.log(diagnostics.Failures.length); // 1
 * ```
 */
export class Diagnostics {
  /** All diagnostic checks collected during the run, in execution order. */
  Checks: DiagnosticCheck[] = [];

  /** Detected runtime environment metadata (OS, Node, npm, architecture). */
  Environment: EnvironmentInfo;

  /** Summary of the last install attempt, if a checkpoint state file exists. */
  LastInstall?: LastInstallInfo;

  /**
   * Create a new Diagnostics container.
   *
   * @param environment - Detected runtime environment metadata.
   */
  constructor(environment: EnvironmentInfo) {
    this.Environment = environment;
  }

  /**
   * Whether any check has a `'fail'` status.
   * Used by preflight to determine whether the install should proceed.
   */
  get HasFailures(): boolean {
    return this.Checks.some((c) => c.Status === 'fail');
  }

  /** All checks with `'fail'` status. */
  get Failures(): DiagnosticCheck[] {
    return this.Checks.filter((c) => c.Status === 'fail');
  }

  /** All checks with `'warn'` status. */
  get Warnings(): DiagnosticCheck[] {
    return this.Checks.filter((c) => c.Status === 'warn');
  }

  /**
   * Append a diagnostic check to the collection.
   *
   * @param check - The diagnostic check result to add.
   */
  AddCheck(check: DiagnosticCheck): void {
    this.Checks.push(check);
  }
}
