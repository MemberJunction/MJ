/**
 * Event API contract for the MJ installer engine.
 *
 * The engine communicates exclusively through events. CLI, VSCode, Docker,
 * and tests all build against this contract.
 */

import { EventEmitter } from 'node:events';
import { InstallerError, type PhaseId } from '../errors/InstallerError.js';

// ---------------------------------------------------------------------------
// Event type discriminator
// ---------------------------------------------------------------------------

export type InstallerEventType =
  | 'phase:start'
  | 'phase:end'
  | 'step:progress'
  | 'log'
  | 'warn'
  | 'error'
  | 'prompt'
  | 'diagnostic';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface PhaseStartEvent {
  Type: 'phase:start';
  Phase: PhaseId;
  Description: string;
}

export interface PhaseEndEvent {
  Type: 'phase:end';
  Phase: PhaseId;
  Status: 'completed' | 'failed' | 'skipped';
  DurationMs: number;
  Error?: InstallerError;
}

export interface StepProgressEvent {
  Type: 'step:progress';
  Phase: PhaseId;
  Message: string;
  Percent?: number; // 0–100 if known
}

export interface LogEvent {
  Type: 'log';
  Level: 'info' | 'verbose';
  Message: string;
}

export interface WarnEvent {
  Type: 'warn';
  Message: string;
  Phase?: PhaseId;
}

export interface ErrorEvent {
  Type: 'error';
  Error: InstallerError;
  Phase: PhaseId;
}

export interface PromptEvent {
  Type: 'prompt';
  PromptId: string;
  PromptType: 'input' | 'confirm' | 'select';
  Message: string;
  Choices?: { Label: string; Value: string }[];
  Default?: string;
  /** Frontend calls this with the user's answer. */
  Resolve: (answer: string) => void;
}

export interface DiagnosticEvent {
  Type: 'diagnostic';
  Check: string;
  Status: 'pass' | 'fail' | 'warn' | 'info';
  Message: string;
  SuggestedFix?: string;
}

export type InstallerEvent =
  | PhaseStartEvent
  | PhaseEndEvent
  | StepProgressEvent
  | LogEvent
  | WarnEvent
  | ErrorEvent
  | PromptEvent
  | DiagnosticEvent;

export type InstallerEventHandler = (event: InstallerEvent) => void;

// ---------------------------------------------------------------------------
// Typed event map for the emitter
// ---------------------------------------------------------------------------

export interface InstallerEventMap {
  'phase:start': [PhaseStartEvent];
  'phase:end': [PhaseEndEvent];
  'step:progress': [StepProgressEvent];
  'log': [LogEvent];
  'warn': [WarnEvent];
  'error': [ErrorEvent];
  'prompt': [PromptEvent];
  'diagnostic': [DiagnosticEvent];
}

// ---------------------------------------------------------------------------
// Typed emitter wrapper
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around Node's EventEmitter with typed events.
 */
export class InstallerEventEmitter {
  private emitter = new EventEmitter();

  On<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.on(event, handler as (...args: unknown[]) => void);
  }

  Off<K extends keyof InstallerEventMap>(event: K, handler: (...args: InstallerEventMap[K]) => void): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  Emit<K extends keyof InstallerEventMap>(event: K, ...args: InstallerEventMap[K]): void {
    this.emitter.emit(event, ...args);
  }

  RemoveAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
