/**
 * Checkpoint state written to .mj-install-state.json after each phase.
 * Enables resume of interrupted installs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PhaseId } from '../errors/InstallerError.js';

export type PhaseStatus = 'pending' | 'completed' | 'failed' | 'skipped';

export interface PhaseState {
  Status: PhaseStatus;
  CompletedAt?: string;
  FailedAt?: string;
  Error?: string;
}

export interface InstallStateData {
  Tag: string;
  StartedAt: string;
  Phases: Partial<Record<PhaseId, PhaseState>>;
}

const STATE_FILENAME = '.mj-install-state.json';

export class InstallState {
  private data: InstallStateData;
  private filePath: string;

  constructor(dir: string, tag: string) {
    this.filePath = path.join(dir, STATE_FILENAME);
    this.data = {
      Tag: tag,
      StartedAt: new Date().toISOString(),
      Phases: {},
    };
  }

  get Tag(): string {
    return this.data.Tag;
  }

  get StartedAt(): string {
    return this.data.StartedAt;
  }

  /**
   * Load state from disk. Returns null if the file doesn't exist.
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
   * Check if the state file exists at the given directory.
   */
  static async Exists(dir: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, STATE_FILENAME));
      return true;
    } catch {
      return false;
    }
  }

  GetPhaseStatus(phase: PhaseId): PhaseStatus {
    return this.data.Phases[phase]?.Status ?? 'pending';
  }

  MarkCompleted(phase: PhaseId): void {
    this.data.Phases[phase] = {
      Status: 'completed',
      CompletedAt: new Date().toISOString(),
    };
  }

  MarkFailed(phase: PhaseId, error: string): void {
    this.data.Phases[phase] = {
      Status: 'failed',
      FailedAt: new Date().toISOString(),
      Error: error,
    };
  }

  MarkSkipped(phase: PhaseId): void {
    this.data.Phases[phase] = {
      Status: 'skipped',
    };
  }

  /**
   * Find the first phase that is not completed or skipped.
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
   * Write current state to disk.
   */
  async Save(): Promise<void> {
    const json = JSON.stringify(this.data, null, 2);
    await fs.writeFile(this.filePath, json, 'utf-8');
  }

  /**
   * Delete the state file.
   */
  async Delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // file may not exist — that's fine
    }
  }

  ToJSON(): InstallStateData {
    return structuredClone(this.data);
  }
}
