/**
 * ReportGenerator — produces comprehensive diagnostic reports for remote troubleshooting.
 *
 * Generates a single markdown file containing everything needed to diagnose
 * an installation failure without access to the user's machine:
 *
 * - Environment info (OS, Node, npm, architecture)
 * - Install state (version, phase statuses, timestamps)
 * - Sanitized configuration (passwords/secrets redacted)
 * - Diagnostic check results (preflight + known issues)
 * - Key file existence checks
 * - Full event log (timestamped, all severity levels)
 *
 * **Security**: All passwords, secrets, and API keys are redacted before
 * inclusion in the report. The report is safe to share publicly.
 *
 * @module logging/ReportGenerator
 * @see EventLogger — provides the event log buffer consumed by this generator.
 * @see InstallerEngine — triggers report generation on install failure.
 */

import type { Diagnostics, EnvironmentInfo } from '../models/Diagnostics.js';
import type { InstallStateData } from '../models/InstallState.js';
import type { PartialInstallConfig } from '../models/InstallConfig.js';
import type { InstallResult } from '../models/InstallPlan.js';
import type { LogEntry } from './EventLogger.js';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter.js';
import path from 'node:path';

/** Fields in InstallConfig that contain sensitive values and must be redacted. */
const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'CodeGenPassword',
  'APIPassword',
  'BaseEncryptionKey',
  'OpenAIKey',
  'AnthropicKey',
  'MistralKey',
]);

/** Fields within AuthProviderValues that contain sensitive values. */
const SENSITIVE_AUTH_FIELDS: ReadonlySet<string> = new Set([
  'ClientSecret',
]);

/**
 * Environment variable keys whose values must be redacted in config file snapshots.
 * Matches both exact keys and patterns.
 */
const SENSITIVE_ENV_PATTERNS: ReadonlyArray<string | RegExp> = [
  'CODEGEN_DB_PASSWORD',
  'DB_PASSWORD',
  'MJ_BASE_ENCRYPTION_KEY',
  'AUTH0_CLIENT_SECRET',
  /^AI_VENDOR_API_KEY__/,
  'MJ_INSTALL_CODEGEN_PASSWORD',
  'MJ_INSTALL_API_PASSWORD',
  'MJ_INSTALL_OPENAI_KEY',
  'MJ_INSTALL_ANTHROPIC_KEY',
  'MJ_INSTALL_MISTRAL_KEY',
  'MJ_INSTALL_AUTH0_CLIENT_SECRET',
];

/**
 * Configuration files to snapshot for the diagnostic report.
 * Paths are relative to the install directory; multiple candidates
 * are checked (monorepo vs distribution layout).
 */
const CONFIG_FILE_CANDIDATES: ReadonlyArray<{
  RelativePaths: string[];
  Description: string;
  Format: 'env' | 'typescript' | 'javascript';
}> = [
  {
    RelativePaths: ['.env'],
    Description: 'Root .env',
    Format: 'env',
  },
  {
    RelativePaths: ['apps/MJAPI/.env', 'packages/MJAPI/.env'],
    Description: 'MJAPI .env',
    Format: 'env',
  },
  {
    RelativePaths: [
      'apps/MJExplorer/src/environments/environment.ts',
      'packages/MJExplorer/src/environments/environment.ts',
    ],
    Description: 'Explorer environment.ts',
    Format: 'typescript',
  },
  {
    RelativePaths: [
      'apps/MJExplorer/src/environments/environment.development.ts',
      'packages/MJExplorer/src/environments/environment.development.ts',
    ],
    Description: 'Explorer environment.development.ts',
    Format: 'typescript',
  },
  {
    RelativePaths: ['mj.config.cjs'],
    Description: 'MJ configuration',
    Format: 'javascript',
  },
];

/** Key files whose existence indicates installation health. */
const KEY_FILES: ReadonlyArray<{ Path: string; Description: string }> = [
  { Path: '.mj-install-state.json', Description: 'Installer checkpoint state' },
  { Path: '.env', Description: 'Root environment file' },
  { Path: 'mj.config.cjs', Description: 'MJ configuration' },
  { Path: 'package.json', Description: 'Root package.json' },
  { Path: 'package-lock.json', Description: 'npm lock file' },
  { Path: 'node_modules', Description: 'Dependencies installed' },
  { Path: 'mj-db-setup.sql', Description: 'Database setup script' },
  { Path: 'mj-db-validate.sql', Description: 'Database validation script' },
  // Distribution layout (apps/) — runs from source via register.js, no dist needed
  { Path: 'apps/MJAPI/.env', Description: 'MJAPI environment file (distribution)' },
  { Path: 'apps/MJAPI/src/index.ts', Description: 'MJAPI entry point (distribution)' },
  { Path: 'apps/MJExplorer/src/environments/environment.ts', Description: 'Explorer environment (distribution)' },
  // Monorepo layout (packages/) — compiled to dist
  { Path: 'packages/MJAPI/.env', Description: 'MJAPI environment file (monorepo)' },
  { Path: 'packages/MJAPI/dist', Description: 'MJAPI compiled output (monorepo)' },
  { Path: 'packages/MJExplorer/src/environments/environment.ts', Description: 'Explorer environment (monorepo)' },
];

/** Report filename written to the install directory. */
const REPORT_FILENAME = 'mj-diagnostic-report.md';

/**
 * Data collected for the diagnostic report.
 *
 * All fields are optional — the generator produces whatever sections have data.
 * This allows reports from both full installs (all fields populated) and
 * standalone `mj doctor` runs (only diagnostics + environment).
 */
/**
 * Sanitized contents of a configuration file for inclusion in the report.
 */
export interface ConfigFileSnapshot {
  /** Relative path from the install directory. */
  RelativePath: string;
  /** Whether the file was found. */
  Exists: boolean;
  /** Sanitized file contents (passwords/secrets redacted), or `null` if not found. */
  Content: string | null;
}

/**
 * Captured startup output from a service (MJAPI or Explorer).
 */
export interface ServiceLogCapture {
  /** Service name (e.g., `"MJAPI"`, `"Explorer"`). */
  Service: string;
  /** Whether the service started successfully. */
  Started: boolean;
  /** Captured stdout/stderr lines during startup. */
  Output: string[];
  /** Duration of the startup capture in milliseconds. */
  DurationMs: number;
  /** Reason for failure (if applicable). */
  FailureReason?: string;
}

export interface ReportData {
  /** Detected runtime environment (OS, Node, npm, architecture). */
  Environment?: EnvironmentInfo;
  /** Install state from the checkpoint file. */
  InstallState?: InstallStateData;
  /** Install result (success, duration, warnings, phases). */
  InstallResult?: InstallResult;
  /** Sanitized configuration (passwords redacted). */
  Config?: PartialInstallConfig;
  /** Diagnostic check results from preflight and known-issue scans. */
  Diagnostics?: Diagnostics;
  /** Full event log from the install or doctor run. */
  EventLog?: ReadonlyArray<LogEntry>;
  /** Absolute path to the install directory. */
  TargetDir?: string;
  /** Trigger that caused the report to be generated. */
  Trigger?: 'install-failure' | 'doctor-report' | 'manual';
  /** Sanitized snapshots of key configuration files. */
  ConfigFiles?: ConfigFileSnapshot[];
  /** Captured service startup logs (MJAPI, Explorer). */
  ServiceLogs?: ServiceLogCapture[];
}

/**
 * Generates and saves comprehensive diagnostic reports.
 *
 * @example
 * ```typescript
 * const generator = new ReportGenerator();
 * const reportPath = await generator.Generate({
 *   Environment: diagnostics.Environment,
 *   InstallState: state.ToJSON(),
 *   EventLog: logger.Entries,
 *   TargetDir: '/path/to/install',
 *   Trigger: 'install-failure',
 * });
 * console.log(`Report saved to: ${reportPath}`);
 * ```
 */
export class ReportGenerator {
  private fileSystem = new FileSystemAdapter();

  /**
   * Generate a markdown diagnostic report and save it to the target directory.
   *
   * @param data - Collected diagnostic data for the report.
   * @returns Absolute path to the generated report file.
   */
  async Generate(data: ReportData): Promise<string> {
    const markdown = this.renderMarkdown(data);
    const reportPath = data.TargetDir
      ? path.join(data.TargetDir, REPORT_FILENAME)
      : REPORT_FILENAME;

    await this.fileSystem.WriteText(reportPath, markdown);
    return reportPath;
  }

  /**
   * Generate the markdown report content without saving to disk.
   *
   * @param data - Collected diagnostic data for the report.
   * @returns The full markdown string.
   */
  Render(data: ReportData): string {
    return this.renderMarkdown(data);
  }

  /**
   * Check which key files exist in the target directory.
   *
   * @param targetDir - The install directory to check.
   * @returns Array of file checks with existence status.
   */
  async CheckKeyFiles(targetDir: string): Promise<Array<{ Path: string; Description: string; Exists: boolean }>> {
    const results: Array<{ Path: string; Description: string; Exists: boolean }> = [];
    for (const file of KEY_FILES) {
      const fullPath = path.join(targetDir, file.Path);
      const exists = await this.fileSystem.FileExists(fullPath)
        || await this.fileSystem.DirectoryExists(fullPath);
      results.push({ Path: file.Path, Description: file.Description, Exists: exists });
    }
    return results;
  }

  /**
   * Redact sensitive fields from a config object.
   *
   * @param config - The config to sanitize (not mutated).
   * @returns A new object with sensitive values replaced by `"[REDACTED]"`.
   */
  SanitizeConfig(config: PartialInstallConfig): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (SENSITIVE_FIELDS.has(key)) {
        sanitized[key] = value ? '[REDACTED]' : '(not set)';
      } else if (key === 'AuthProviderValues' && typeof value === 'object' && value !== null) {
        const sanitizedAuth: Record<string, unknown> = {};
        for (const [authKey, authValue] of Object.entries(value as Record<string, unknown>)) {
          if (SENSITIVE_AUTH_FIELDS.has(authKey)) {
            sanitizedAuth[authKey] = authValue ? '[REDACTED]' : '(not set)';
          } else {
            sanitizedAuth[authKey] = authValue;
          }
        }
        sanitized[key] = sanitizedAuth;
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Snapshot all key configuration files with sensitive values redacted.
   *
   * Reads `.env`, `environment.ts`, and `mj.config.cjs` files from both
   * monorepo and distribution layouts, redacting passwords and secrets.
   *
   * @param targetDir - The install directory to scan.
   * @returns Array of config file snapshots for inclusion in the report.
   */
  async SnapshotConfigFiles(targetDir: string): Promise<ConfigFileSnapshot[]> {
    const snapshots: ConfigFileSnapshot[] = [];

    for (const candidate of CONFIG_FILE_CANDIDATES) {
      let found = false;
      for (const relativePath of candidate.RelativePaths) {
        const fullPath = path.join(targetDir, relativePath);
        if (await this.fileSystem.FileExists(fullPath)) {
          const rawContent = await this.fileSystem.ReadText(fullPath);
          const sanitized = this.sanitizeFileContent(rawContent, candidate.Format);
          snapshots.push({ RelativePath: relativePath, Exists: true, Content: sanitized });
          found = true;
          break; // Use first found path for this candidate
        }
      }
      if (!found) {
        snapshots.push({ RelativePath: candidate.RelativePaths[0], Exists: false, Content: null });
      }
    }

    return snapshots;
  }

  /**
   * Sanitize file content based on format, redacting sensitive values.
   *
   * @param content - Raw file content.
   * @param format - File format for context-aware redaction.
   * @returns Content with sensitive values replaced by `[REDACTED]`.
   */
  private sanitizeFileContent(content: string, format: 'env' | 'typescript' | 'javascript'): string {
    if (format === 'env') {
      return this.sanitizeEnvContent(content);
    }
    // TypeScript and JavaScript files: redact known sensitive patterns
    return this.sanitizeCodeContent(content);
  }

  /**
   * Sanitize a `.env` file by redacting values of sensitive keys.
   */
  private sanitizeEnvContent(content: string): string {
    return content.split('\n').map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex < 0) return line;

      const key = trimmed.slice(0, eqIndex).trim();
      if (this.isSensitiveEnvKey(key)) {
        return `${key}=[REDACTED]`;
      }
      return line;
    }).join('\n');
  }

  /**
   * Sanitize TypeScript/JavaScript code by redacting known secret patterns.
   * Handles patterns like `CLIENT_SECRET: 'value'` and `password: 'value'`.
   */
  private sanitizeCodeContent(content: string): string {
    // Redact values that look like secrets in assignment contexts
    const patterns = [
      // Keys containing password, secret, api_key, encryption_key (compound names like CLIENT_SECRET)
      /(\b\w*(?:password|secret|api_key|apiKey|encryption_key|encryptionKey)\s*[:=]\s*)(['"])([^'"]*)\2/gi,
      // MJ_BASE_ENCRYPTION_KEY: 'value'
      /(MJ_BASE_ENCRYPTION_KEY\s*[:=]\s*)(['"])([^'"]*)\2/gi,
      // systemApiKey: 'value'
      /(systemApiKey\s*[:=]\s*)(['"])([^'"]*)\2/gi,
    ];

    let result = content;
    for (const pattern of patterns) {
      result = result.replace(pattern, (_match, prefix: string, quote: string) => {
        return `${prefix}${quote}[REDACTED]${quote}`;
      });
    }
    return result;
  }

  /** Check if an environment variable key holds a sensitive value. */
  private isSensitiveEnvKey(key: string): boolean {
    for (const pattern of SENSITIVE_ENV_PATTERNS) {
      if (typeof pattern === 'string') {
        if (key === pattern) return true;
      } else {
        if (pattern.test(key)) return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Markdown rendering
  // -------------------------------------------------------------------------

  private renderMarkdown(data: ReportData): string {
    const sections: string[] = [];

    sections.push(this.renderHeader(data));

    if (data.Environment) {
      sections.push(this.renderEnvironment(data.Environment));
    }

    if (data.InstallResult) {
      sections.push(this.renderInstallResult(data.InstallResult));
    }

    if (data.InstallState) {
      sections.push(this.renderInstallState(data.InstallState));
    }

    if (data.Config) {
      sections.push(this.renderConfig(data.Config));
    }

    if (data.ConfigFiles && data.ConfigFiles.length > 0) {
      sections.push(this.renderConfigFiles(data.ConfigFiles));
    }

    if (data.Diagnostics) {
      sections.push(this.renderDiagnostics(data.Diagnostics));
    }

    if (data.TargetDir) {
      sections.push(this.renderKeyFilesPlaceholder());
    }

    if (data.ServiceLogs && data.ServiceLogs.length > 0) {
      sections.push(this.renderServiceLogs(data.ServiceLogs));
    }

    if (data.EventLog && data.EventLog.length > 0) {
      sections.push(this.renderEventLog(data.EventLog));
    }

    return sections.join('\n\n');
  }

  private renderHeader(data: ReportData): string {
    const timestamp = new Date().toISOString();
    const trigger = data.Trigger ?? 'manual';
    return [
      '# MJ Diagnostic Report',
      '',
      `**Generated:** ${timestamp}`,
      `**Trigger:** ${trigger}`,
      data.TargetDir ? `**Directory:** ${data.TargetDir}` : '',
    ].filter(Boolean).join('\n');
  }

  private renderEnvironment(env: EnvironmentInfo): string {
    return [
      '## Environment',
      '',
      '| Property | Value |',
      '|----------|-------|',
      `| OS | ${env.OS} |`,
      `| Node.js | ${env.NodeVersion} |`,
      `| npm | ${env.NpmVersion} |`,
      `| Architecture | ${env.Architecture} |`,
    ].join('\n');
  }

  private renderInstallResult(result: InstallResult): string {
    const status = result.Success ? 'SUCCESS' : 'FAILED';
    const duration = this.formatDuration(result.DurationMs);
    const lines = [
      '## Install Result',
      '',
      `| Property | Value |`,
      `|----------|-------|`,
      `| Status | **${status}** |`,
      `| Duration | ${duration} |`,
      `| Phases completed | ${result.PhasesCompleted.join(', ') || '(none)'} |`,
      `| Phases failed | ${result.PhasesFailed.join(', ') || '(none)'} |`,
      `| Warnings | ${result.Warnings.length} |`,
    ];

    if (result.Warnings.length > 0) {
      lines.push('', '### Warnings', '');
      for (const warning of result.Warnings) {
        lines.push(`- ${warning}`);
      }
    }

    return lines.join('\n');
  }

  private renderInstallState(state: InstallStateData): string {
    const lines = [
      '## Install State (Checkpoint)',
      '',
      `**Version:** ${state.Tag}`,
      `**Started:** ${state.StartedAt}`,
      '',
      '| Phase | Status | Timestamp | Error |',
      '|-------|--------|-----------|-------|',
    ];

    const phaseOrder = [
      'preflight', 'scaffold', 'configure', 'database',
      'platform', 'dependencies', 'migrate', 'codegen', 'smoke_test',
    ];

    for (const phaseId of phaseOrder) {
      const phase = state.Phases[phaseId as keyof typeof state.Phases];
      if (phase) {
        const timestamp = phase.CompletedAt ?? phase.FailedAt ?? '';
        const error = phase.Error ? this.truncate(phase.Error, 100) : '';
        lines.push(`| ${phaseId} | ${phase.Status} | ${timestamp} | ${error} |`);
      } else {
        lines.push(`| ${phaseId} | pending | | |`);
      }
    }

    return lines.join('\n');
  }

  private renderConfig(config: PartialInstallConfig): string {
    const sanitized = this.SanitizeConfig(config);
    const lines = [
      '## Configuration (Sanitized)',
      '',
      '```json',
      JSON.stringify(sanitized, null, 2),
      '```',
    ];
    return lines.join('\n');
  }

  private renderDiagnostics(diagnostics: Diagnostics): string {
    const lines = [
      '## Diagnostic Checks',
      '',
      `**Failures:** ${diagnostics.Failures.length}  `,
      `**Warnings:** ${diagnostics.Warnings.length}  `,
      `**Passed:** ${diagnostics.Checks.filter((c) => c.Status === 'pass').length}`,
      '',
      '| Check | Status | Message | Suggested Fix |',
      '|-------|--------|---------|---------------|',
    ];

    for (const check of diagnostics.Checks) {
      const fix = check.SuggestedFix ?? '';
      lines.push(`| ${this.escapeMarkdownTable(check.Name)} | ${check.Status} | ${this.escapeMarkdownTable(check.Message)} | ${this.escapeMarkdownTable(fix)} |`);
    }

    return lines.join('\n');
  }

  private renderKeyFilesPlaceholder(): string {
    // Actual file check results are injected by the caller after running CheckKeyFiles()
    // This provides a section header for when file checks are appended
    return [
      '## Key Files',
      '',
      '_File existence checks will be populated when the report is generated with a target directory._',
    ].join('\n');
  }

  private renderEventLog(entries: ReadonlyArray<LogEntry>): string {
    const lines = [
      '## Event Log',
      '',
      `_${entries.length} entries captured._`,
      '',
      '<details>',
      '<summary>Click to expand full event log</summary>',
      '',
      '```',
    ];

    for (const entry of entries) {
      const ts = entry.Timestamp.slice(11, 23); // HH:MM:SS.mmm
      const phase = entry.Phase ? `[${entry.Phase}]` : '';
      const level = entry.Level.toUpperCase().padEnd(7);
      lines.push(`${ts} ${level} ${phase} ${entry.Message}`);
    }

    lines.push('```', '', '</details>');
    return lines.join('\n');
  }

  private renderConfigFiles(files: ConfigFileSnapshot[]): string {
    const lines = [
      '## Configuration Files (Sanitized)',
      '',
      '_Passwords, secrets, and API keys have been redacted._',
    ];

    for (const file of files) {
      lines.push('');
      if (!file.Exists) {
        lines.push(`### ${file.RelativePath}`, '', '**Not found**');
        continue;
      }

      const ext = file.RelativePath.endsWith('.ts') ? 'typescript'
        : file.RelativePath.endsWith('.cjs') || file.RelativePath.endsWith('.js') ? 'javascript'
        : 'bash';

      lines.push(
        `### ${file.RelativePath}`,
        '',
        '<details>',
        '<summary>Click to expand</summary>',
        '',
        '```' + ext,
        file.Content ?? '(empty)',
        '```',
        '',
        '</details>',
      );
    }

    return lines.join('\n');
  }

  private renderServiceLogs(logs: ServiceLogCapture[]): string {
    const lines = [
      '## Service Startup Logs',
      '',
      '_Brief startup capture to detect runtime errors._',
    ];

    for (const log of logs) {
      const status = log.Started ? 'STARTED' : 'FAILED';
      const duration = this.formatDuration(log.DurationMs);
      lines.push(
        '',
        `### ${log.Service} (${status}, ${duration})`,
      );

      if (log.FailureReason) {
        lines.push('', `**Failure reason:** ${log.FailureReason}`);
      }

      if (log.Output.length > 0) {
        lines.push(
          '',
          '<details>',
          '<summary>Click to expand output</summary>',
          '',
          '```',
          ...log.Output.slice(-100), // Last 100 lines
          '```',
          '',
          '</details>',
        );
      } else {
        lines.push('', '_No output captured._');
      }
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }

  private escapeMarkdownTable(text: string): string {
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }
}
