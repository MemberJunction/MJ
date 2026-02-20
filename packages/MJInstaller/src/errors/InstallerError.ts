/**
 * Typed error class for the MJ installer engine.
 * Every error carries the phase it occurred in, a machine-readable code,
 * a human-readable message, and a suggested fix the frontend can display.
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

export class InstallerError extends Error {
  Phase: PhaseId;
  Code: string;
  SuggestedFix: string;

  constructor(phase: PhaseId, code: string, message: string, suggestedFix: string) {
    super(message);
    this.name = 'InstallerError';
    this.Phase = phase;
    this.Code = code;
    this.SuggestedFix = suggestedFix;
  }
}
