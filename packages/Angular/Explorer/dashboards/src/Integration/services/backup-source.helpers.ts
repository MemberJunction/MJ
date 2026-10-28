/**
 * Pure helpers for the SQL Server backup bootstrap flow: byte formatting and the Azure Blob
 * URL arithmetic the wizard and the integration data service share. Kept out of the component
 * so the Explorer surface holds no domain logic and the rules are unit-testable on their own.
 */

import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { IntegrationArchiveSeedSummary, IntegrationArchiveSeedTable } from '@memberjunction/graphql-dataprovider';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Outcome of a bootstrap run as the wizard's completion step shows it. */
export interface BootstrapResultSummary {
  Success: boolean;
  Message: string;
  RunID?: string;
  BackupStartDate?: string;
  StagingDatabaseName?: string;
  TablesProcessed?: number;
  TotalRowsTransferred?: number;
  DurationSeconds?: number;
  StagingDatabaseDropped?: boolean;
}

/** One line of the wizard's live progress log, derived from a run event. */
export interface BootstrapProgressLine {
  Seq: number;
  Ts: string;
  Stage: string;
  Message: string;
  Level: 'info' | 'warn' | 'error';
}

/** The subset of a run event the bootstrap helpers read (matches the GraphQL integration client's event shape). */
export interface BootstrapRunEvent {
  Seq: number;
  Ts: string;
  EventType: string;
  Level?: string;
  Stage?: string;
  Message?: string;
  DataJSON?: string;
}

/** The subset of a run summary the bootstrap helpers read. */
export interface BootstrapRunState {
  RunID: string;
  IsInFlight: boolean;
  Success?: boolean;
  ExitReason?: string;
  LatestMessage?: string;
  DurationMs?: number;
}

/**
 * The progress-log lines a batch of run events contributes: stage starts, stage completions, errors
 * and warnings, each with its stage and message. Heartbeats and record-level events are skipped so
 * the log stays readable over a run of hours.
 */
export function ProgressLinesFromEvents(events: readonly BootstrapRunEvent[]): BootstrapProgressLine[] {
  const shown = new Set(['run.start', 'stage.start', 'stage.complete', 'stage.error', 'warning', 'run.complete', 'run.fail', 'run.cancel']);
  return events
    .filter(ev => shown.has(ev.EventType) && (ev.Message || ev.Stage))
    .map(ev => ({
      Seq: ev.Seq,
      Ts: ev.Ts,
      Stage: ev.Stage ?? (ev.EventType.startsWith('run.') ? 'Run' : ''),
      Message: ev.Message ?? ev.EventType,
      Level: ev.Level === 'error' || ev.EventType === 'stage.error' || ev.EventType === 'run.fail' ? 'error' : ev.Level === 'warn' ? 'warn' : 'info',
    }));
}

/**
 * The outcome of a finished bootstrap run. The action reports its outputs on a terminal `Summary`
 * stage event, so a successful run's figures come from there; a failed run's message comes from the
 * run's own errors or last event.
 */
export function SummarizeBootstrapRun(run: BootstrapRunState, events: readonly BootstrapRunEvent[], errors?: readonly string[]): BootstrapResultSummary {
  const summaryEvent = [...events].reverse().find(ev => ev.EventType === 'stage.complete' && ev.Stage === 'Summary');
  const outputs = summaryEvent?.DataJSON ? parseOutputs(summaryEvent.DataJSON) : {};
  const succeeded = run.Success === true && run.ExitReason === 'completed';
  const failureMessage = errors && errors.length > 0 ? errors[errors.length - 1] : run.LatestMessage ?? `Run ended (${run.ExitReason ?? 'unknown'}).`;
  return {
    Success: succeeded,
    Message: succeeded ? summaryEvent?.Message ?? run.LatestMessage ?? 'Bootstrap completed.' : failureMessage,
    RunID: run.RunID,
    BackupStartDate: asString(outputs['BackupStartDate']),
    StagingDatabaseName: asString(outputs['StagingDatabaseName']),
    TablesProcessed: asNumber(outputs['TablesProcessed']),
    TotalRowsTransferred: asNumber(outputs['TotalRowsTransferred']),
    DurationSeconds: asNumber(outputs['DurationSeconds']) ?? (run.DurationMs !== undefined ? Math.round(run.DurationMs / 1000) : undefined),
    StagingDatabaseDropped: outputs['StagingDatabaseDropped'] === 1 || outputs['StagingDatabaseDropped'] === '1' || outputs['StagingDatabaseDropped'] === true || outputs['StagingDatabaseDropped'] === 'true',
  };
}

function parseOutputs(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : String(value);
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Human-readable size with two decimals, e.g. 1073741824 → "1 GB", 2048 → "2 KB", 1536 → "1.5 KB". */
export function FormatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${parseFloat(value.toFixed(2))} ${BYTE_UNITS[exponent]}`;
}

/**
 * The Azure Blob container URL (origin plus the first path segment) of a blob URL, or undefined
 * when the value is not an http(s) URL with a container segment.
 * `https://acct.blob.core.windows.net/backups/db.bak` → `https://acct.blob.core.windows.net/backups`.
 */
export function DeriveContainerUrl(blobUrl: string): string | undefined {
  const trimmed = blobUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    const container = url.pathname.split('/').find(segment => segment.length > 0);
    return container ? `${url.origin}/${container}` : undefined;
  } catch {
    return undefined;
  }
}

/** The first comma-separated entry of a backup URL list, trimmed; empty string when there is none. */
export function FirstBackupUrl(backupUrls: string): string {
  return backupUrls.split(',')[0]?.trim() ?? '';
}

/**
 * The `MJ: External Data Sources` ID an external-data-source connection names in its
 * `CompanyIntegration.Configuration` JSON (`externalDataSourceID`), or undefined when the
 * configuration is absent, not JSON, or names none.
 */
export function ReadExternalDataSourceID(configuration: string | null | undefined): string | undefined {
  if (!configuration) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(configuration);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    const id = (parsed as Record<string, unknown>)['externalDataSourceID'];
    return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The `BackupUrls` value after choosing a directory preset. A preset is a directory on the SQL Server
 * host, not a backup file, so it is never added as an entry of its own: it starts a new entry ending in
 * the directory's own separator for the user to complete with a file name. With nothing entered yet the
 * value becomes that directory; otherwise the directory is appended as a further comma-separated entry.
 */
export function AppendDirectoryPreset(currentBackupUrls: string, directory: string): string {
  const separator = /^[A-Za-z]:/.test(directory) || directory.includes('\\') ? '\\' : '/';
  const entry = `${TrimTrailingChars(directory, '\\/')}${separator}`;
  const current = TrimTrailingChars(currentBackupUrls.trim(), ', \t');
  return current ? `${current}, ${entry}` : entry;
}

/**
 * The string without any trailing run of the given characters. A loop rather than a `[...]+$`
 * regular expression: that pattern has polynomial worst-case cost on user-typed input, which is
 * what every path here is.
 */
export function TrimTrailingChars(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value[end - 1])) {
    end--;
  }
  return value.slice(0, end);
}

/**
 * The comma-separated `BackupUrls` value for a set of blob names selected inside a container.
 * A blob name is appended to the container URL (trailing slashes removed); without a container the
 * names are passed through as given.
 */
export function BuildBackupUrlList(containerUrl: string, blobNames: Iterable<string>): string {
  const base = TrimTrailingChars(containerUrl.trim(), '/');
  return Array.from(blobNames)
    .map(name => (base ? `${base}/${name}` : name))
    .join(', ');
}

/** Wizard steps of the archive seed flow: Archive, Restore, Tables, Build, Cleanup, Done. */
export type ArchiveSeedWizardStep = 1 | 2 | 3 | 4 | 5 | 6;

/** The wizard step that shows an archive seed job in the given state. */
export function StepForSeedState(state: string, hasTables: boolean): ArchiveSeedWizardStep {
  switch (state) {
    case 'AwaitingSelection':
      return 3;
    case 'Building':
    case 'Mapping':
    case 'Loading':
    case 'Seeding':
      return 4;
    case 'AwaitingCleanupDecision':
      return 5;
    case 'Done':
      return 6;
    case 'Failed':
      return hasTables ? 4 : 2;
    default:
      return 2;
  }
}

/** The tables the job's `Tables` stage event reported, or undefined when absent or unreadable. */
export function ReadSeedTablesFromEvents(events: readonly BootstrapRunEvent[]): IntegrationArchiveSeedTable[] | undefined {
  const event = [...events].reverse().find(ev => ev.EventType === 'stage.complete' && ev.Stage === 'Tables' && ev.DataJSON);
  if (!event?.DataJSON) {
    return undefined;
  }
  const tables = parseOutputs(event.DataJSON)['tables'];
  return Array.isArray(tables) ? (tables as IntegrationArchiveSeedTable[]) : undefined;
}

function readSeededFromBackup(configuration: string | null | undefined): Record<string, unknown> | undefined {
  if (!configuration) {
    return undefined;
  }
  const seeded = parseOutputs(configuration)['seededFromBackup'];
  return seeded && typeof seeded === 'object' ? (seeded as Record<string, unknown>) : undefined;
}

/** The archive seed job ID a connection records in its Configuration (`seededFromBackup.jobID`). */
export function ReadSeededJobID(configuration: string | null | undefined): string | undefined {
  const id = readSeededFromBackup(configuration)?.['jobID'];
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** True when the connection was seeded from a backup and its data source is still Disabled (awaiting a live source). */
export function IsSeededAwaitingSource(configuration: string | null | undefined, dataSourceStatus: MJExternalDataSourceEntity['Status'] | null | undefined): boolean {
  return readSeededFromBackup(configuration) !== undefined && dataSourceStatus === 'Disabled';
}

/** The wizard's completion summary for an archive seed job. */
export function SummarizeArchiveSeed(summary: IntegrationArchiveSeedSummary | undefined, error: string | undefined): BootstrapResultSummary {
  if (error || !summary) {
    return { Success: false, Message: error ?? 'Archive seed did not complete.' };
  }
  return {
    Success: true,
    Message: 'Archive seed completed.',
    TablesProcessed: summary.TablesProcessed,
    TotalRowsTransferred: summary.TotalRowsTransferred,
    DurationSeconds: summary.DurationSeconds,
    StagingDatabaseDropped: summary.StagingDatabaseDropped,
  };
}
