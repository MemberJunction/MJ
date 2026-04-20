/**
 * Checkpoint state for the MJ installer, persisted to `.mj-install-state.json`.
 *
 * Enables resume of interrupted installs. After each phase completes (or fails),
 * the engine calls {@link InstallState.Save} to write the current state to disk.
 * On the next run, {@link InstallState.Load} reads the state file and
 * {@link InstallerEngine.Run} skips already-completed phases.
 *
 * The state file is also used by the {@link ScaffoldPhase} to detect whether the
 * target directory contains installer-owned artifacts (so it doesn't trigger the
 * "directory is not empty" prompt for its own state file).
 *
 * @module models/InstallState
 *
 * @example
 * ```typescript
 * // Create fresh state
 * const state = new InstallState('/path/to/install', 'v5.1.0');
 * state.MarkCompleted('preflight');
 * await state.Save();
 *
 * // Resume from existing state
 * const resumed = await InstallState.Load('/path/to/install');
 * if (resumed) {
 *   const nextPhase = resumed.FirstIncompletePhase(ALL_PHASES);
 *   console.log(`Resuming from: ${nextPhase}`);
 * }
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PhaseId } from '../errors/InstallerError.js';

/**
 * Lifecycle status of a single installer phase.
 *
 * - `'pending'` — not yet started (default).
 * - `'completed'` — finished successfully.
 * - `'failed'` — terminated with an error.
 * - `'skipped'` — excluded by plan flags (e.g., `--skip-db`, `--fast`).
 */
export type PhaseStatus = 'pending' | 'completed' | 'failed' | 'skipped';

/**
 * Serialized state of a single installer phase within the checkpoint file.
 *
 * @see InstallStateData — the parent object that maps phase IDs to states.
 */
export interface PhaseState {
  /** Current lifecycle status of the phase. */
  Status: PhaseStatus;
  /** ISO 8601 timestamp when the phase completed (present only if `Status === 'completed'`). */
  CompletedAt?: string;
  /** ISO 8601 timestamp when the phase failed (present only if `Status === 'failed'`). */
  FailedAt?: string;
  /** Error message from the phase failure (present only if `Status === 'failed'`). */
  Error?: string;
}

/**
 * Serialized shape of the `.mj-install-state.json` checkpoint file.
 * This is the on-disk JSON structure read by {@link InstallState.Load}
 * and written by {@link InstallState.Save}.
 */
export interface InstallStateData {
  /** Git tag of the version being installed (e.g., `"v5.1.0"`). */
  Tag: string;
  /** ISO 8601 timestamp when the install was started. */
  StartedAt: string;
  /** Per-phase status map. Phases not yet reached are absent (treated as `'pending'`). */
  Phases: Partial<Record<PhaseId, PhaseState>>;
}

/** Filename of the checkpoint state file, written to the install target directory. */
const STATE_FILENAME = '.mj-install-state.json';

/**
 * Checkpoint state manager for the MJ installer.
 *
 * Tracks per-phase completion status and persists it to a JSON file in
 * the install target directory. The engine writes checkpoint state after
 * each phase so that interrupted installs can be resumed from the last
 * completed phase.
 *
 * @example
 * ```typescript
 * const state = new InstallState('/path/to/install', 'v5.1.0');
 * state.MarkCompleted('preflight');
 * state.MarkCompleted('scaffold');
 * await state.Save();
 *
 * // Later, resume:
 * const loaded = await InstallState.Load('/path/to/install');
 * console.log(loaded?.GetPhaseStatus('preflight'));  // 'completed'
 * console.log(loaded?.GetPhaseStatus('configure'));  // 'pending'
 * ```
 */
export class InstallState {
  /** Internal state data (serialized to JSON on Save). */
  private data: InstallStateData;

  /** Absolute path to the `.mj-install-state.json` file. */
  private filePath: string;

  /**
   * Create a new checkpoint state for a fresh install.
   *
   * @param dir - Target directory where the state file will be written.
   * @param tag - Git tag of the version being installed (e.g., `"v5.1.0"`).
   */
  constructor(dir: string, tag: string) {
    this.filePath = path.join(dir, STATE_FILENAME);
    this.data = {
      Tag: tag,
      StartedAt: new Date().toISOString(),
      Phases: {},
    };
  }

  /** Git tag of the version being installed. */
  get Tag(): string {
    return this.data.Tag;
  }

  /** ISO 8601 timestamp when the install was started. */
  get StartedAt(): string {
    return this.data.StartedAt;
  }

  /**
   * Load checkpoint state from disk.
   *
   * @param dir - Directory containing the `.mj-install-state.json` file.
   * @returns The loaded state, or `null` if the file doesn't exist or is malformed.
   */
  static async Load(dir: string): Promise<InstallState | null> {
    const filePath = path.join(dir, STATE_FILENAME);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as InstallStateData;
      const state = new InstallState(dir, parsed.Tag);
      state.data = parsed;
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Check whether a checkpoint state file exists at the given directory.
   *
   * @param dir - Directory to check.
   * @returns `true` if `.mj-install-state.json` exists and is accessible.
   */
  static async Exists(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, STATE_FILENAME));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current status of a phase.
   *
   * @param phase - Phase identifier to query.
   * @returns The phase's status, defaulting to `'pending'` if not yet recorded.
   */
  GetPhaseStatus(phase: PhaseId): PhaseStatus {
    return this.data.Phases[phase]?.Status ?? 'pending';
  }

  /**
   * Mark a phase as successfully completed.
   *
   * @param phase - Phase identifier to mark as completed.
   */
  MarkCompleted(phase: PhaseId): void {
    this.data.Phases[phase] = {
      Status: 'completed',
      CompletedAt: new Date().toISOString(),
    };
  }

  /**
   * Mark a phase as failed with an error message.
   *
   * @param phase - Phase identifier to mark as failed.
   * @param error - Error message describing the failure.
   */
  MarkFailed(phase: PhaseId, error: string): void {
    this.data.Phases[phase] = {
      Status: 'failed',
      FailedAt: new Date().toISOString(),
      Error: error,
    };
  }

  /**
   * Mark a phase as skipped (excluded by plan flags).
   *
   * @param phase - Phase identifier to mark as skipped.
   */
  MarkSkipped(phase: PhaseId): void {
    this.data.Phases[phase] = {
      Status: 'skipped',
    };
  }

  /**
   * Find the first phase that is neither completed nor skipped.
   * Used by the engine to determine the resume point after loading checkpoint state.
   *
   * @param orderedPhases - Ordered list of all phase identifiers.
   * @returns The first incomplete phase ID, or `null` if all phases are done.
   */
  FirstIncompletePhase(orderedPhases: PhaseId[]): PhaseId | null {
    for (const phase of orderedPhases) {
      const status = this.GetPhaseStatus(phase);
      if (status !== 'completed' && status !== 'skipped') {
        return phase;
      }
    }
    return null;
  }

  /**
   * Persist the current state to disk as `.mj-install-state.json`.
   * Called by the engine after each phase completes, fails, or is skipped.
   *
   * @throws Error if the file cannot be written (e.g., permission denied).
   */
  async Save(): Promise<void> {
    const json = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.filePath, json, 'utf-8');
  }

  /**
   * Delete the checkpoint state file from disk.
   * Silently succeeds if the file doesn't exist.
   */
  async Delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // file may not exist — that's fine
    }
  }

  /**
   * Return a deep clone of the internal state data for serialization
   * or inspection without exposing the mutable internal reference.
   *
   * @returns A deep copy of the {@link InstallStateData}.
   */
  ToJSON(): InstallStateData {
    return structuredClone(this.data);
  }
}
