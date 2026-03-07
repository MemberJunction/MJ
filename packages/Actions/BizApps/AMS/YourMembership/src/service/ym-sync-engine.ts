import fs from 'node:fs';
import path from 'node:path';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { YM_ENDPOINT_REGISTRY, type YMEndpointConfig, type YMEndpointName } from '../types/ym-endpoint-config';
import type { YMSyncOptions, YMSyncResult, YMEndpointSyncResult } from '../types/ym-sync-types';
import { YMSchemaManager } from './ym-schema-manager';

/** YourMembership REST API base URL */
const YM_API_BASE = 'https://ws.yourmembership.com';

/** Delay in ms between paginated API requests to avoid Cloudflare 429 rate limiting */
const REQUEST_THROTTLE_MS = 350;

/**
 * Orchestrates the YM data sync across all configured endpoints.
 *
 * For each endpoint it:
 * 1. Authenticates via session (POST /Ams/Authenticate)
 * 2. Fetches all data via the YM API (paginated)
 * 3. Validates the MJ entity exists (created by migration + CodeGen)
 * 4. Upserts records via MJ entity objects + TransactionGroup
 *
 * Fully provider-agnostic — works on SQL Server and PostgreSQL.
 */

/** Directory where YM sync logs are written */
const YM_LOG_DIR = path.join(process.cwd(), 'ym-sync-logs');

export class YMSyncEngine {
  private clientId: string;
  private apiKey: string;
  private apiPassword: string;
  private schemaManager: YMSchemaManager;
  private sessionId: string | null = null;
  private sessionCreatedAt = 0;
  private logFilePath: string;

  constructor(clientId: string, apiKey: string, apiPassword: string, contextUser: UserInfo) {
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.apiPassword = apiPassword;
    this.schemaManager = new YMSchemaManager(contextUser);
    this.logFilePath = this.initLogFile();
    this.schemaManager.LogFilePath = this.logFilePath;
  }

  /**
   * Creates the log directory and returns the path to a timestamped log file.
   */
  private initLogFile(): string {
    if (!fs.existsSync(YM_LOG_DIR)) {
      fs.mkdirSync(YM_LOG_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(YM_LOG_DIR, `ym-sync-${timestamp}.log`);
    this.writeLog(`=== YM Sync started at ${new Date().toISOString()} ===`);
    return filePath;
  }

  /**
   * Appends a timestamped message to the log file.
   */
  private writeLog(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    try {
      fs.appendFileSync(this.logFilePath ?? path.join(YM_LOG_DIR, 'ym-sync-fallback.log'), line);
    } catch {
      // If file logging fails, don't break the sync — console only
    }
  }

  /**
   * Runs the sync across specified (or all) endpoints.
   */
  public async RunSync(options: YMSyncOptions): Promise<YMSyncResult> {
    const startTime = Date.now();

    // MJ's TransactionGroup uses rxjs internally. When a SQL error occurs,
    // the error propagates both as a rejected promise (which we catch) AND
    // as an unsubscribed Observable error. rxjs fires the leak via
    // reportUnhandledError which does setTimeout(() => { throw err }),
    // making it an uncaughtException (NOT an unhandledRejection).
    // Install scoped handlers for BOTH events to absorb those leaked errors.
    const capturedErrors: string[] = [];
    const isTransactionError = (err: unknown): boolean => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes('Transaction rolled back');
    };
    const rejectHandler = (reason: unknown) => {
      if (isTransactionError(reason)) {
        capturedErrors.push(reason instanceof Error ? reason.message : String(reason));
        this.writeLog(`Caught leaked TransactionGroup rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    };
    const exceptionHandler = (err: Error) => {
      if (isTransactionError(err)) {
        capturedErrors.push(err.message);
        this.writeLog(`Caught leaked TransactionGroup uncaughtException: ${err.message}`);
      } else {
        // Re-throw non-transaction errors — they're real crashes
        throw err;
      }
    };
    process.on('unhandledRejection', rejectHandler);
    process.on('uncaughtException', exceptionHandler);

    try {
      return await this.runSyncInner(options, startTime);
    } finally {
      // Allow the microtask/setTimeout queue to drain so any pending rxjs
      // errors fire before we remove the handlers.
      await new Promise((resolve) => setTimeout(resolve, 200));
      process.removeListener('unhandledRejection', rejectHandler);
      process.removeListener('uncaughtException', exceptionHandler);
      if (capturedErrors.length > 0) {
        this.writeLog(`Absorbed ${capturedErrors.length} leaked TransactionGroup error(s)`);
      }
    }
  }

  /**
   * Inner sync logic, separated so RunSync can wrap it with error handlers.
   */
  private async runSyncInner(options: YMSyncOptions, startTime: number): Promise<YMSyncResult> {
    // Authenticate before starting
    this.writeLog('Authenticating...');
    await this.ensureSession();

    const endpointNames = options.Endpoints.length > 0 ? options.Endpoints : (Object.keys(YM_ENDPOINT_REGISTRY) as YMEndpointName[]);

    const endpointResults: YMEndpointSyncResult[] = [];

    for (const endpointName of endpointNames) {
      const config = YM_ENDPOINT_REGISTRY[endpointName];
      if (!config) {
        endpointResults.push({
          EndpointName: endpointName,
          TableName: '',
          RecordsFetched: 0,
          RecordsInserted: 0,
          RecordsUpdated: 0,
          RecordsSkipped: 0,
          Errors: [`Unknown endpoint: ${endpointName}`],
          DurationMs: 0,
        });
        continue;
      }

      const result = await this.syncEndpoint(endpointName, config, options);
      endpointResults.push(result);

      if (result.Errors.length > 0) {
        this.writeLog(`ERRORS for ${endpointName}: ${JSON.stringify(result.Errors)}`);
      }
    }

    const finalResult = this.buildSyncResult(endpointResults, startTime);
    this.writeLog(
      `=== Sync complete. Success: ${finalResult.Success}, Total synced: ${finalResult.TotalRecordsSynced}, Errors: ${finalResult.TotalErrors}, Duration: ${finalResult.DurationMs}ms ===`,
    );
    this.writeLog(`Full result: ${JSON.stringify(finalResult, null, 2)}`);
    this.writeLog(`Log file: ${this.logFilePath}`);
    LogStatus(`YM Sync: Log file written to ${this.logFilePath}`);
    return finalResult;
  }

  // ─── Session management ──────────────────────────────────────

  private async ensureSession(): Promise<string> {
    const SESSION_TTL_MS = 14 * 60 * 1000;
    if (this.sessionId && Date.now() - this.sessionCreatedAt < SESSION_TTL_MS) {
      return this.sessionId;
    }
    return this.createSession();
  }

  private async createSession(): Promise<string> {
    LogStatus(`YM Sync Auth: Creating session for client ${this.clientId}`);

    const response = await fetch(`${YM_API_BASE}/Ams/Authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        provider: 'credentials',
        UserName: this.apiKey,
        Password: this.apiPassword,
        UserType: 'Admin',
        ClientID: Number(this.clientId),
      }),
    });

    if (!response.ok) {
      throw new Error(`YM Auth failed: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      SessionId?: string;
      ResponseStatus?: { ErrorCode?: string; Message?: string };
    };

    if (json.ResponseStatus?.ErrorCode) {
      throw new Error(`YM Auth error: ${json.ResponseStatus.Message ?? json.ResponseStatus.ErrorCode}`);
    }

    if (!json.SessionId) {
      throw new Error('YM Auth: No SessionId returned');
    }

    this.sessionId = json.SessionId;
    this.sessionCreatedAt = Date.now();
    LogStatus(`YM Sync Auth: Session created for client ${this.clientId}`);
    return this.sessionId;
  }

  // ─── Endpoint sync ───────────────────────────────────────────

  private async syncEndpoint(endpointName: string, config: YMEndpointConfig, options: YMSyncOptions): Promise<YMEndpointSyncResult> {
    const endpointStart = Date.now();
    const errors: string[] = [];
    let recordsFetched = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;

    try {
      LogStatus(`YM Sync: Fetching ${endpointName}...`);
      this.writeLog(`--- Starting endpoint: ${endpointName} (entity: ${config.EntityName}) ---`);

      // Apply date filtering for incremental sync where supported
      const effectiveConfig = await this.applyDateFilter(config, options);

      let records = await this.fetchAllPages(effectiveConfig, options.MaxRecordsPerEndpoint);

      // Apply optional transform (e.g., flatten nested Groups)
      if (config.TransformData) {
        records = config.TransformData(records);
        this.writeLog(`${endpointName}: Transformed to ${records.length} records`);
      }

      recordsFetched = records.length;
      this.writeLog(`${endpointName}: Fetched ${recordsFetched} records`);

      if (records.length === 0) {
        LogStatus(`YM Sync: No records found for ${endpointName}`);
        return this.buildEndpointResult(endpointName, config, 0, 0, 0, 0, [], endpointStart);
      }

      // Validate entity exists (created by migration + CodeGen)
      this.schemaManager.ValidateEntityExists(config.EntityName);

      if (options.FullRefresh) {
        await this.schemaManager.TruncateEntity(config.EntityName);
      }

      const upsertResult = await this.schemaManager.UpsertRecords(config.EntityName, records, config.PKFields);
      recordsInserted = upsertResult.Inserted;
      recordsUpdated = upsertResult.Updated;
      recordsSkipped = upsertResult.Skipped;

      const summary = `${endpointName} complete — ${recordsFetched} fetched, ${recordsInserted} inserted, ${recordsUpdated} updated, ${recordsSkipped} skipped (unchanged)`;
      LogStatus(`YM Sync: ${summary}`);
      this.writeLog(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      errors.push(message);
      LogError(`YM Sync: Error syncing ${endpointName}: ${message}`);
      this.writeLog(`ERROR syncing ${endpointName}: ${message}`);
      if (stack) {
        this.writeLog(`Stack trace: ${stack}`);
      }
    }

    return this.buildEndpointResult(endpointName, config, recordsFetched, recordsInserted, recordsUpdated, recordsSkipped, errors, endpointStart);
  }

  // ─── Data fetching ───────────────────────────────────────────

  private async fetchAllPages(config: YMEndpointConfig, maxRecords: number): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    let pageNumber = 1;
    const pageSize = config.DefaultPageSize;
    let hasMore = true;

    const baseUrl = `${YM_API_BASE}/Ams/${this.clientId}`;

    while (hasMore) {
      const extraParams = config.DefaultQueryParams
        ? Object.entries(config.DefaultQueryParams)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&')
        : '';

      let url: string;
      if (config.SupportsPagination) {
        const paginationParams = `PageSize=${pageSize}&PageNumber=${pageNumber}`;
        url = extraParams ? `${baseUrl}/${config.Path}?${paginationParams}&${extraParams}` : `${baseUrl}/${config.Path}?${paginationParams}`;
      } else {
        url = extraParams ? `${baseUrl}/${config.Path}?${extraParams}` : `${baseUrl}/${config.Path}`;
      }

      LogStatus(`YM Sync: GET ${url}`);
      const response = await this.fetchWithSession(url);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '(no body)');
        throw new Error(`YM API error for ${config.Path}: ${response.status} ${response.statusText} — ${errorBody}`);
      }

      const rawJson: unknown = await response.json();

      // Some endpoints (e.g. Products) return a raw JSON array instead of an object
      let page: Record<string, unknown>[];
      if (Array.isArray(rawJson)) {
        page = rawJson as Record<string, unknown>[];
      } else {
        const json = rawJson as Record<string, unknown>;
        if (this.hasApiError(json)) {
          const rs = json.ResponseStatus as { Message?: string; ErrorCode?: string };
          throw new Error(`YM API error for ${config.Path}: ${rs.Message ?? rs.ErrorCode}`);
        }
        page = this.extractDataFromResponse(json, config.ResponseDataKey);
      }
      if (page.length === 0) {
        const debugKeys = Array.isArray(rawJson) ? '(raw array)' : Object.keys(rawJson as Record<string, unknown>).join(', ');
        this.writeLog(`${config.Path}: Empty page (keys in response: ${debugKeys})`);
        if (config.ResponseDataKey && !Array.isArray(rawJson)) {
          this.writeLog(`${config.Path}: Value for key "${config.ResponseDataKey}": ${JSON.stringify((rawJson as Record<string, unknown>)[config.ResponseDataKey])}`);
        }
        hasMore = false;
        break;
      }

      results.push(...page);

      if (!config.SupportsPagination || page.length < pageSize) {
        hasMore = false;
      } else {
        pageNumber++;
        // Throttle between pages to avoid Cloudflare 429 rate limiting
        await new Promise((resolve) => setTimeout(resolve, REQUEST_THROTTLE_MS));
      }

      if (maxRecords > 0 && results.length >= maxRecords) {
        return results.slice(0, maxRecords);
      }
    }

    return results;
  }

  /**
   * Fetches a URL with session auth, retrying once on 401.
   */
  private async fetchWithSession(url: string): Promise<Response> {
    const sessionId = await this.ensureSession();
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-SS-ID': sessionId,
        Accept: 'application/json',
      },
    });

    if (response.status === 401) {
      this.sessionId = null;
      const newSessionId = await this.ensureSession();
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-SS-ID': newSessionId,
          Accept: 'application/json',
        },
      });
    }

    return response;
  }

  private hasApiError(json: Record<string, unknown>): boolean {
    const rs = json.ResponseStatus as { ErrorCode?: string } | undefined;
    return !!rs?.ErrorCode;
  }

  /**
   * Extracts the data array from the YM response using the configured key.
   * YM returns data in named properties (e.g., Members, Events), not a generic 'Result'.
   */
  private extractDataFromResponse(json: Record<string, unknown>, dataKey: string | null): Record<string, unknown>[] {
    if (!dataKey) {
      // No data key — treat the whole response as a single record
      return [json];
    }

    const data = json[dataKey];
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }

    // If the key exists but isn't an array, try it as a single object
    if (data && typeof data === 'object') {
      return [data as Record<string, unknown>];
    }

    return [];
  }

  // ─── Result building ─────────────────────────────────────────

  /**
   * For endpoints that support date filtering and are not in FullRefresh mode,
   * computes the date parameter from the last sync timestamp.
   * Returns a shallow copy of the config with updated DefaultQueryParams.
   */
  private async applyDateFilter(config: YMEndpointConfig, options: YMSyncOptions): Promise<YMEndpointConfig> {
    if (!config.SupportsDateFilter || !config.DateFilterParam || options.FullRefresh) {
      return config;
    }

    const lastSync = await this.schemaManager.GetLastSyncTimestamp(config.EntityName);
    const dateValue = lastSync ? lastSync.toISOString().split('T')[0] : '2000-01-01';

    this.writeLog(`${config.EntityName}: Using date filter ${config.DateFilterParam}=${dateValue}`);

    return {
      ...config,
      DefaultQueryParams: {
        ...config.DefaultQueryParams,
        [config.DateFilterParam]: dateValue,
      },
    };
  }

  private buildEndpointResult(
    endpointName: string,
    config: YMEndpointConfig,
    fetched: number,
    inserted: number,
    updated: number,
    skipped: number,
    errors: string[],
    startTime: number,
  ): YMEndpointSyncResult {
    return {
      EndpointName: endpointName,
      TableName: config.TargetTable,
      RecordsFetched: fetched,
      RecordsInserted: inserted,
      RecordsUpdated: updated,
      RecordsSkipped: skipped,
      Errors: errors,
      DurationMs: Date.now() - startTime,
    };
  }

  private buildSyncResult(endpointResults: YMEndpointSyncResult[], startTime: number): YMSyncResult {
    const totalRecordsSynced = endpointResults.reduce((sum, r) => sum + r.RecordsFetched, 0);
    const totalRecordsSkipped = endpointResults.reduce((sum, r) => sum + r.RecordsSkipped, 0);
    const totalErrors = endpointResults.reduce((sum, r) => sum + r.Errors.length, 0);

    return {
      Success: totalErrors === 0,
      EndpointResults: endpointResults,
      TotalRecordsSynced: totalRecordsSynced,
      TotalRecordsSkipped: totalRecordsSkipped,
      TotalErrors: totalErrors,
      DurationMs: Date.now() - startTime,
    };
  }
}
