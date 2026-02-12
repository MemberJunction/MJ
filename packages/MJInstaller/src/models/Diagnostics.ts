/**
 * Result model for mj doctor — a collection of diagnostic checks
 * that can be displayed by any frontend.
 */

export type DiagnosticStatus = 'pass' | 'fail' | 'warn' | 'info';

export interface DiagnosticCheck {
  Name: string;
  Status: DiagnosticStatus;
  Message: string;
  SuggestedFix?: string;
}

export interface EnvironmentInfo {
  OS: string;
  NodeVersion: string;
  NpmVersion: string;
  Architecture: string;
}

export interface LastInstallInfo {
  Tag: string;
  Timestamp: string;
}

export class Diagnostics {
  Checks: DiagnosticCheck[] = [];
  Environment: EnvironmentInfo;
  LastInstall?: LastInstallInfo;

  constructor(environment: EnvironmentInfo) {
    this.Environment = environment;
  }

  get HasFailures(): boolean {
    return this.Checks.some((c) => c.Status === 'fail');
  }

  get Failures(): DiagnosticCheck[] {
    return this.Checks.filter((c) => c.Status === 'fail');
  }

  get Warnings(): DiagnosticCheck[] {
    return this.Checks.filter((c) => c.Status === 'warn');
  }

  AddCheck(check: DiagnosticCheck): void {
    this.Checks.push(check);
  }
}
