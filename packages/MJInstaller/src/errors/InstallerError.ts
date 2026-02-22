/**
 * Typed error class for the MJ installer engine.
 *
 * Every error carries the phase it occurred in, a machine-readable code,
 * a human-readable message, and a suggested fix the frontend can display.
 * This structured approach lets frontends (CLI, VSCode, Docker) render
 * actionable error messages with remediation steps.
 *
 * @module errors/InstallerError
 *
 * @example
 * ```typescript
 * throw new InstallerError(
 *   'preflight',
 *   'NODE_VERSION',
 *   'Node.js v16 found, but >= 22 is required.',
 *   'Download Node.js 22 LTS from https://nodejs.org'
 * );
 * ```
 */

/**
 * Discriminated union of all installer phase identifiers.
 *
 * Each value corresponds to one of the nine ordered phases executed by
 * {@link InstallerEngine.Run}. The identifier is used in error reporting,
 * checkpoint state, event payloads, and plan generation.
 *
 * Phase execution order:
 * 1. `preflight` — prerequisite checks
 * 2. `scaffold` — download and extract release
 * 3. `configure` — generate configuration files
 * 4. `database` — SQL Server provisioning scripts
 * 5. `platform` — cross-platform compatibility fixes
 * 6. `dependencies` — npm install + build
 * 7. `migrate` — database migrations
 * 8. `codegen` — code generation + manifest rebuild
 * 9. `smoke_test` — service startup verification
 */
export type PhaseId =
  | 'preflight'
  | 'scaffold'
  | 'database'
  | 'migrate'
  | 'configure'
  | 'platform'
  | 'dependencies'
  | 'codegen'
  | 'smoke_test';

/**
 * Structured error thrown by installer phases when a recoverable or
 * terminal failure occurs.
 *
 * Unlike a generic `Error`, `InstallerError` carries machine-readable
 * metadata that frontends use to render actionable diagnostics:
 *
 * - {@link Phase} identifies which phase failed (for checkpoint/resume).
 * - {@link Code} is a stable, machine-readable error code for programmatic handling.
 * - {@link SuggestedFix} is a human-readable remediation step displayed to the user.
 *
 * The engine catches `InstallerError` during phase execution, records it in
 * the checkpoint state file, and emits it via the `error` event channel.
 *
 * @extends Error
 *
 * @example
 * ```typescript
 * try {
 *   await phase.Run(context);
 * } catch (err) {
 *   if (err instanceof InstallerError) {
 *     console.error(`[${err.Phase}] ${err.Code}: ${err.message}`);
 *     console.error(`Fix: ${err.SuggestedFix}`);
 *   }
 * }
 * ```
 */
export class InstallerError extends Error {
  /** The installer phase where this error originated. */
  Phase: PhaseId;

  /**
   * Machine-readable error code (e.g., `'NODE_VERSION'`, `'DOWNLOAD_FAILED'`).
   * Stable across versions — safe for programmatic error handling.
   */
  Code: string;

  /**
   * Human-readable remediation step displayed to the user.
   * Should be a concrete, actionable instruction (e.g., a command to run
   * or a URL to visit).
   */
  SuggestedFix: string;

  /**
   * Create a new InstallerError.
   *
   * @param phase - The phase where the error occurred.
   * @param code - Machine-readable error code (e.g., `'NPM_INSTALL_FAILED'`).
   * @param message - Human-readable error description.
   * @param suggestedFix - Actionable remediation step for the user.
   */
  constructor(phase: PhaseId, code: string, message: string, suggestedFix: string) {
    super(message);
    this.name = 'InstallerError';
    this.Phase = phase;
    this.Code = code;
    this.SuggestedFix = suggestedFix;
  }
}
