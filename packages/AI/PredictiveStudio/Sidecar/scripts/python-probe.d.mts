export interface PythonVersion { Major: number; Minor: number; Patch: number }
export interface ProbeResult { Command: string; Found: boolean; Version: PythonVersion | null }
export type SelectResult =
  | { Ok: true; Command: string; Version: PythonVersion; Probed: ProbeResult[] }
  | { Ok: false; Probed: ProbeResult[] };
export declare class PythonProbe {
  static readonly SupportedMinors: readonly number[];
  static readonly DefaultCandidates: readonly string[];
  static ParseVersion(text: string | null | undefined): PythonVersion | null;
  static IsSupported(version: PythonVersion | null): boolean;
  static ProbeCommand(command: string): ProbeResult;
  static Select(candidates: readonly string[], probe?: (command: string) => ProbeResult): SelectResult;
  static FormatVersion(v: PythonVersion): string;
  static FormatReport(probed: readonly ProbeResult[]): string;
}
