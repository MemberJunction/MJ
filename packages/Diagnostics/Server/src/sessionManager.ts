import { AsyncLocalStorage } from 'node:async_hooks';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { monitorEventLoopDelay, IntervalHistogram } from 'node:perf_hooks';
import { BaseSingleton, EscapeSQLString, MJGlobal } from '@memberjunction/global';
import {
  DiagnosticContext,
  IDiagnosticContextProvider,
  SetDiagnosticContextProvider,
  RegisterLogSink,
  WithoutDiagnosticCapture,
  IsInMJLogToConsole,
  LogEntry,
  LogError,
  IMetadataProvider,
  Metadata,
  RunView,
  UserInfo,
  LocalCacheManager
} from '@memberjunction/core';
import {
  MJDiagnosticSessionEntity,
  MJDiagnosticSessionChunkEntity,
  MJDiagnosticBundleEntity,
  MJDiagnosticSessionEntity_IDiagnosticSessionScope as IDiagnosticSessionScope
} from '@memberjunction/core-entities';
import {
  DatabasePoolStats,
  GenericDatabaseProvider,
  SqlObservation
} from '@memberjunction/generic-database-provider';
import {
  DiagnosticBundleData,
  DiagnosticLogEntry,
  DiagnosticServerSpanEntry,
  DiagnosticSqlEntry,
  DiagnosticServerHealthSnapshot,
  DiagnosticNetworkEntry,
  DiagnosticTelemetryEntry,
  ScrubBundleDataWithCount,
  ScrubString,
  AnalyzeDiagnosticBundleData,
  BuildMjdiagArchive,
  VerifyBundleArchive,
  DiagnosticContributorRegistry
} from '@memberjunction/diagnostics';
import { MJ_VERSION } from './version.js';
import { CollectorSendResult, SendBundleToCollector, SendBundleToCollectorParams } from './collectorClient.js';
import { DiagnosticsSettings } from './settings.js';
import { SessionTargetsCaller } from './clientCapture.js';

export interface ActiveDiagnosticSession {
  id: string;
  name: string;
  reason?: string;
  status: MJDiagnosticSessionEntity['Status'];
  scopeType: MJDiagnosticSessionEntity['ScopeType'];
  scope: IDiagnosticSessionScope;
  level: MJDiagnosticSessionEntity['Level'];
  categories: string[];
  scrubLiterals: boolean;
  startedAtMs: number;
  endsAtMs: number;
  maxBytes: number;
  createdByUserId: string;
  companyId?: string | null;
  bytesWritten: number;
}

export type ChunkContentKind = MJDiagnosticSessionChunkEntity['ContentKind'];

interface PendingChunkBuffer {
  sessionId: string;
  source: MJDiagnosticSessionChunkEntity['Source'];
  contentKind: ChunkContentKind;
  entries: Record<string, unknown>[];
  approxBytes: number;
  firstEntryAt: Date;
  lastEntryAt: Date;
}

interface DownloadTokenClaims {
  bundleId: string;
  userId: string;
  expiresAtMs: number;
  nonce: string;
}

/** A chunk buffer taken out of memory, compressed and numbered, ready to save. */
type DrainedChunk = ReturnType<DiagnosticSessionManager['DrainPendingBuffersForSession']>[number];

const diagnosticAls = new AsyncLocalStorage<DiagnosticContext>();

class ServerDiagnosticContextProvider implements IDiagnosticContextProvider {
  public GetContext(): DiagnosticContext | undefined {
    return this.GetCurrentContext();
  }

  public GetCurrentContext(): DiagnosticContext | undefined {
    const ctx = diagnosticAls.getStore();
    if (!ctx) {
      return undefined;
    }
    if (ctx.SessionEndsAtMs != null && Date.now() >= ctx.SessionEndsAtMs) {
      ctx.sessionId = undefined;
      ctx.IsCaptured = false;
    } else if (ctx.sessionId) {
      ctx.IsCaptured = !ctx.SuppressCapture && !ctx.suppressCapture;
    }
    return ctx;
  }

  public RunWithContext<T>(ctx: DiagnosticContext | undefined, fn: () => T): T {
    if (ctx === undefined) {
      return diagnosticAls.exit(fn);
    }
    return diagnosticAls.run(ctx, fn);
  }

  public WithoutDiagnosticCapture<T>(fn: () => T): T {
    const current = diagnosticAls.getStore();
    const suppressed: DiagnosticContext = {
      ...(current ?? {}),
      suppressCapture: true,
      SuppressCapture: true,
      IsCaptured: false
    };
    return diagnosticAls.run(suppressed, fn);
  }

  public RunDetached<T>(fn: () => T): T {
    return diagnosticAls.exit(fn);
  }
}

const serverDiagnosticContextProvider = new ServerDiagnosticContextProvider();
SetDiagnosticContextProvider(serverDiagnosticContextProvider);

export function RunWithServerDiagnosticContext<T>(
  context: DiagnosticContext,
  fn: () => T
): T {
  SetDiagnosticContextProvider(serverDiagnosticContextProvider);
  return diagnosticAls.run(context, fn);
}

export function SafeSerializeConsoleArgs(args: unknown[], maxBytes: number = 8192): string {
  const seen = new WeakSet<object>();
  const stringifyDepth = (val: unknown, depth: number): unknown => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
    if (val instanceof Error) {
      return { name: val.name, message: val.message, stack: val.stack };
    }
    if (typeof val !== 'object') return String(val);
    if (seen.has(val)) return '[Circular]';
    if (depth >= 4) return '[MaxDepth]';
    seen.add(val);
    if (Array.isArray(val)) {
      return val.slice(0, 25).map((item) => stringifyDepth(item, depth + 1));
    }
    const out: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).slice(0, 30);
    for (const k of keys) {
      out[k] = stringifyDepth((val as Record<string, unknown>)[k], depth + 1);
    }
    return out;
  };

  const parts = args.map((arg) => {
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(stringifyDepth(arg, 0));
    } catch {
      return String(arg);
    }
  });
  const combined = parts.join(' ');
  if (combined.length > maxBytes) {
    return combined.slice(0, maxBytes) + '...[TRUNCATED_8KB]';
  }
  return combined;
}

export class DiagnosticSessionManager extends BaseSingleton<DiagnosticSessionManager> {
  private _activeSessions = new Map<string, ActiveDiagnosticSession>();
  private _chunkBuffers = new Map<string, PendingChunkBuffer>();
  private _sequenceCounters = new Map<string, number>();
  private _redeemedDownloadNonces = new Map<string, number>();
  private _hmacSecret: Buffer = crypto.randomBytes(32);
  private _hostInstanceLabel: string = `${os.hostname()}-${MJGlobal.Instance.ProcessUUID?.slice(0, 8) ?? process.pid}`;
  private _eventLoopHistogram: IntervalHistogram | null = null;
  private _initialized = false;
  private _consoleTapInstalled = false;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _installId: string = crypto.randomUUID();
  private _onSessionExpired: ((session: ActiveDiagnosticSession) => void) | null = null;

  public constructor() {
    super();
  }

  public static get Instance(): DiagnosticSessionManager {
    return DiagnosticSessionManager.getInstance<DiagnosticSessionManager>();
  }

  public get HostInstanceLabel(): string {
    return this._hostInstanceLabel;
  }

  /** The `Diagnostics.InstallID` setting, or a per-process ID until one is saved. */
  public get InstallID(): string {
    return DiagnosticsSettings.Current().InstallID || this._installId;
  }

  public ResetForTests(): void {
    this._activeSessions.clear();
    this._chunkBuffers.clear();
    this._sequenceCounters.clear();
    this._redeemedDownloadNonces.clear();
  }

  public Initialize(options?: { enableConsoleTap?: boolean; enablePolling?: boolean }): void {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    SetDiagnosticContextProvider(new ServerDiagnosticContextProvider());

    try {
      this._eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
      this._eventLoopHistogram.enable();
    } catch {
      this._eventLoopHistogram = null;
    }

    RegisterLogSink((entry: LogEntry, context: DiagnosticContext | undefined) => {
      this.onLogEntry(entry, context);
    });

    GenericDatabaseProvider.RegisterSqlObserver((obs: SqlObservation) => {
      this.onSqlObservation(obs);
    });

    if (options?.enableConsoleTap !== false) {
      this.InstallConsoleTap();
    }

    if (options?.enablePolling) {
      this._pollTimer = setInterval(() => {
        WithoutDiagnosticCapture(() => {
          void this.FlushAllPendingChunks().catch(() => {});
        });
      }, 10_000);
      this._pollTimer.unref?.();
    }
  }

  public InstallConsoleTap(): void {
    if (this._consoleTapInstalled) {
      return;
    }
    this._consoleTapInstalled = true;

    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    console.log = (...args: unknown[]): void => {
      if (!IsInMJLogToConsole()) {
        this.recordDirectConsoleCall('info', args);
      }
      origLog(...args);
    };

    console.warn = (...args: unknown[]): void => {
      if (!IsInMJLogToConsole()) {
        this.recordDirectConsoleCall('warn', args);
      }
      origWarn(...args);
    };

    console.error = (...args: unknown[]): void => {
      if (!IsInMJLogToConsole()) {
        this.recordDirectConsoleCall('error', args);
      }
      origError(...args);
    };
  }

  private recordDirectConsoleCall(severity: DiagnosticLogEntry['severity'], args: unknown[]): void {
    const ctx = diagnosticAls.getStore();
    if (!ctx?.sessionId || ctx.SuppressCapture || ctx.suppressCapture) {
      return;
    }
    const session = this.GetActiveSession(ctx.sessionId);
    if (!session) {
      return;
    }
    const message = ScrubString(SafeSerializeConsoleArgs(args, 8192), {
      scrubberProfile: session.scrubLiterals ? 'Standard' : 'FullRaw'
    });
    this.AppendToChunkBuffer(session.id, 'Server', 'Logs', {
      timestamp: new Date().toISOString(),
      severity,
      source: 'server',
      category: 'console.tap',
      message,
      traceId: ctx.traceId ?? ctx.TraceID,
      spanId: ctx.spanId ?? ctx.SpanID
    });
  }

  public RegisterActiveSession(session: ActiveDiagnosticSession): void {
    this._activeSessions.set(session.id, session);
  }

  /** Sets the function called when a held `Active` session passes its end time and is dropped. */
  public SetSessionExpiredHandler(handler: ((session: ActiveDiagnosticSession) => void) | null): void {
    this._onSessionExpired = handler;
  }

  public GetActiveSession(sessionId: string): ActiveDiagnosticSession | undefined {
    const s = this._activeSessions.get(sessionId);
    if (!s) return undefined;
    if (s.status !== 'Active' || Date.now() >= s.endsAtMs) {
      this.dropEndedSession(s);
      return undefined;
    }
    return s;
  }

  /** Drops a session that is no longer active; an `Active` one is marked `Expired` and passed to the expiry handler. */
  private dropEndedSession(session: ActiveDiagnosticSession): void {
    this._activeSessions.delete(session.id);
    if (session.status === 'Active') {
      session.status = 'Expired';
      this._onSessionExpired?.(session);
    }
  }

  /**
   * Returns the session this process holds, even when its end time has passed.
   * A session that ended is no longer held; its `MJ: Diagnostic Sessions` row is the record.
   */
  public GetSessionRecord(sessionId: string): ActiveDiagnosticSession | undefined {
    return this._activeSessions.get(sessionId);
  }

  public GetAllActiveSessions(): ActiveDiagnosticSession[] {
    const now = Date.now();
    const out: ActiveDiagnosticSession[] = [];
    for (const s of this._activeSessions.values()) {
      if (s.status === 'Active' && now < s.endsAtMs) {
        out.push(s);
      } else {
        this.dropEndedSession(s);
      }
    }
    return out;
  }

  public StopActiveSessionInMemory(sessionId: string): ActiveDiagnosticSession | undefined {
    const s = this._activeSessions.get(sessionId);
    if (s) {
      s.status = Date.now() >= s.endsAtMs ? 'Expired' : 'Stopped';
      this._activeSessions.delete(s.id);
    }
    return s;
  }

  /**
   * Stage 1 (Pre-Auth HTTP): Evaluates Instance and BrowserSession scopes.
   * The explicit session header picks a session only when that session is active and targets
   * this request before auth (the whole instance, or this browser session); otherwise it is ignored.
   */
  public MatchPreAuth(
    context: DiagnosticContext,
    explicitSessionId?: string,
    browserSessionId?: string
  ): ActiveDiagnosticSession | undefined {
    const explicit = explicitSessionId ? this.GetActiveSession(explicitSessionId) : undefined;
    const candidates = explicit ? [explicit, ...this.GetAllActiveSessions()] : this.GetAllActiveSessions();
    const matched = candidates.find((s) => this.targetsRequestBeforeAuth(s, browserSessionId));
    if (matched) {
      this.attachSessionToContext(context, matched);
    }
    return matched;
  }

  /** True when a session captures a request before auth: instance-wide (no tenant) or this browser session. */
  private targetsRequestBeforeAuth(session: ActiveDiagnosticSession, browserSessionId?: string): boolean {
    if (session.scopeType === 'Instance') {
      return !session.companyId;
    }
    return session.scopeType === 'BrowserSession' && Boolean(browserSessionId) && session.scope.browserSessionId === browserSessionId;
  }

  /**
   * Stage 2 (Post-Auth HTTP & WS): Evaluates Users and APIKeys scopes with strict CompanyID tenant isolation.
   */
  public MatchPostAuth(
    context: DiagnosticContext,
    userId?: string,
    apiKeyId?: string,
    companyId?: string | null
  ): ActiveDiagnosticSession | undefined {
    context.userId = userId;
    context.UserID = userId;
    context.CompanyID = companyId ?? undefined;

    // Verify existing pre-auth match still satisfies tenant isolation
    if (context.sessionId) {
      const currentSession = this.GetActiveSession(context.sessionId);
      if (currentSession) {
        if (currentSession.companyId && currentSession.companyId !== companyId) {
          this.detachSessionFromContext(context);
        } else {
          return currentSession;
        }
      }
    }

    for (const s of this.GetAllActiveSessions()) {
      if (s.companyId && s.companyId !== companyId) {
        continue;
      }
      if (s.scopeType === 'Instance') {
        this.attachSessionToContext(context, s);
        return s;
      }
      if (s.scopeType === 'Users' && userId && SessionTargetsCaller(s, userId, context.BrowserSessionID)) {
        this.attachSessionToContext(context, s);
        return s;
      }
      if (s.scopeType === 'APIKeys' && apiKeyId && s.scope.apiKeyIds?.includes(apiKeyId)) {
        this.attachSessionToContext(context, s);
        return s;
      }
    }
    return undefined;
  }

  /**
   * Stage 3 (Apollo Operation / Remote Operation): Evaluates Operations scope.
   */
  public MatchOperation(
    context: DiagnosticContext,
    operationName?: string,
    remoteOperationKey?: string
  ): ActiveDiagnosticSession | undefined {
    if (context.sessionId) {
      const existing = this.GetActiveSession(context.sessionId);
      if (existing) return existing;
    }

    for (const s of this.GetAllActiveSessions()) {
      if (s.companyId && s.companyId !== context.CompanyID) {
        continue;
      }
      if (s.scopeType === 'Operations') {
        if (operationName && s.scope.operationNames?.includes(operationName)) {
          this.attachSessionToContext(context, s);
          return s;
        }
        if (remoteOperationKey && s.scope.remoteOperationKeys?.includes(remoteOperationKey)) {
          this.attachSessionToContext(context, s);
          return s;
        }
      }
    }
    return undefined;
  }

  private attachSessionToContext(context: DiagnosticContext, session: ActiveDiagnosticSession): void {
    context.sessionId = session.id;
    context.SessionID = session.id;
    context.SessionEndsAtMs = session.endsAtMs;
    context.Level = session.level;
    context.IsCaptured = !context.SuppressCapture && !context.suppressCapture;
  }

  private detachSessionFromContext(context: DiagnosticContext): void {
    context.sessionId = undefined;
    context.SessionID = undefined;
    context.SessionEndsAtMs = undefined;
    context.Level = undefined;
    context.IsCaptured = false;
  }

  private onLogEntry(entry: LogEntry, context: DiagnosticContext | undefined): void {
    const sessionId = context?.sessionId ?? context?.SessionID;
    if (!sessionId || context?.SuppressCapture || context?.suppressCapture) {
      return;
    }
    const session = this.GetActiveSession(sessionId);
    if (!session) {
      return;
    }
    const severityMap: Record<LogEntry['severity'], DiagnosticLogEntry['severity']> = {
      debug: 'debug',
      info: 'info',
      warning: 'warn',
      error: 'error',
      critical: 'error'
    };
    const profile = session.scrubLiterals ? 'Standard' : 'FullRaw';
    const logItem: DiagnosticLogEntry = {
      timestamp: entry.timestamp,
      severity: severityMap[entry.severity] ?? 'info',
      source: 'server',
      category: entry.category,
      message: ScrubString(entry.message, { scrubberProfile: profile }),
      traceId: context?.traceId ?? context?.TraceID,
      spanId: context?.spanId ?? context?.SpanID,
      errorStack: entry.error ? ScrubString(entry.error.stack ?? entry.error.message, { scrubberProfile: profile }) : undefined
    };
    this.AppendToChunkBuffer(
      session.id,
      'Server',
      entry.severity === 'error' ? 'Errors' : 'Logs',
      logItem as unknown as Record<string, unknown>
    );
  }

  private onSqlObservation(obs: SqlObservation): void {
    const ctx = obs.diagnosticContext ?? diagnosticAls.getStore();
    const sessionId = ctx?.sessionId ?? ctx?.SessionID;
    if (!sessionId || ctx?.SuppressCapture || ctx?.suppressCapture) {
      return;
    }
    const session = this.GetActiveSession(sessionId);
    if (!session) {
      return;
    }
    const profile = session.scrubLiterals ? 'Standard' : 'FullRaw';
    const sqlEntry: DiagnosticSqlEntry = {
      timestamp: new Date().toISOString(),
      traceId: ctx?.traceId ?? ctx?.TraceID,
      spanId: ctx?.spanId ?? ctx?.SpanID,
      sql: ScrubString(obs.sql, { scrubberProfile: profile }),
      durationMs: obs.durationMs,
      rowCount: obs.rowCount,
      errorMessage: obs.errorMessage ? ScrubString(obs.errorMessage, { scrubberProfile: profile }) : undefined,
      parameterTypes: obs.parameterTypes
    };
    this.AppendToChunkBuffer(session.id, 'Server', 'SQL', sqlEntry as unknown as Record<string, unknown>);
  }

  public RecordServerSpan(sessionId: string, span: DiagnosticServerSpanEntry): void {
    const session = this.GetActiveSession(sessionId);
    if (!session) {
      return;
    }
    this.AppendToChunkBuffer(session.id, 'Server', 'Spans', span as unknown as Record<string, unknown>);
  }

  public AppendToChunkBuffer(
    sessionId: string,
    source: MJDiagnosticSessionChunkEntity['Source'],
    contentKind: ChunkContentKind,
    entry: Record<string, unknown>
  ): void {
    const session = this._activeSessions.get(sessionId);
    if (session && session.bytesWritten >= session.maxBytes) {
      return;
    }

    const key = `${sessionId}|${source}|${contentKind}`;
    const now = new Date();
    let buf = this._chunkBuffers.get(key);
    if (!buf) {
      buf = {
        sessionId,
        source,
        contentKind,
        entries: [],
        approxBytes: 0,
        firstEntryAt: now,
        lastEntryAt: now
      };
      this._chunkBuffers.set(key, buf);
    }

    const entryJson = JSON.stringify(entry);
    buf.entries.push(entry);
    buf.approxBytes += entryJson.length;
    buf.lastEntryAt = now;
  }

  public NextSequence(
    sessionId: string,
    source: MJDiagnosticSessionChunkEntity['Source'],
    contentKind: ChunkContentKind
  ): number {
    const key = `${sessionId}|${source}|${this._hostInstanceLabel}|${contentKind}`;
    const next = (this._sequenceCounters.get(key) ?? 0) + 1;
    this._sequenceCounters.set(key, next);
    return next;
  }

  public DrainPendingBuffersForSession(sessionId: string): Array<{
    source: MJDiagnosticSessionChunkEntity['Source'];
    contentKind: ChunkContentKind;
    sequence: number;
    compressedData: Buffer;
    entryCount: number;
    firstEntryAt: Date;
    lastEntryAt: Date;
  }> {
    const drained: DrainedChunk[] = [];

    for (const [key, buf] of this._chunkBuffers.entries()) {
      if (buf.sessionId !== sessionId || buf.entries.length === 0) {
        continue;
      }
      this._chunkBuffers.delete(key);
      const ndjson = buf.entries.map((e) => JSON.stringify(e)).join('\n');
      const compressedData = zlib.gzipSync(Buffer.from(ndjson, 'utf8'));
      const seq = this.NextSequence(sessionId, buf.source, buf.contentKind);
      const session = this._activeSessions.get(sessionId);
      if (session) {
        session.bytesWritten += compressedData.byteLength;
      }
      drained.push({
        source: buf.source,
        contentKind: buf.contentKind,
        sequence: seq,
        compressedData,
        entryCount: buf.entries.length,
        firstEntryAt: buf.firstEntryAt,
        lastEntryAt: buf.lastEntryAt
      });
    }
    return drained;
  }

  public async FlushSessionChunksToDatabase(
    sessionId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<number> {
    return WithoutDiagnosticCapture(async () => {
      const drained = this.DrainPendingBuffersForSession(sessionId);
      if (drained.length === 0) {
        return 0;
      }
      let md: IMetadataProvider;
      try {
        md = provider ?? Metadata.Provider;
        if (!md.EntityByName('MJ: Diagnostic Session Chunks')) {
          return 0;
        }
      } catch {
        return 0;
      }
      let written = 0;
      const failures: string[] = [];
      for (const item of drained) {
        const failure = await this.saveChunk(md, sessionId, item, contextUser);
        if (failure === null) {
          written++;
        } else {
          failures.push(failure);
        }
      }
      if (failures.length > 0) {
        LogError(
          `Diagnostic session '${sessionId}': ${failures.length} of ${drained.length} chunk saves failed. First error: ${failures[0]}`
        );
      }
      return written;
    });
  }

  /** Saves one drained chunk. Returns `null` on success, otherwise the error message. */
  private async saveChunk(
    md: IMetadataProvider,
    sessionId: string,
    item: DrainedChunk,
    contextUser?: UserInfo
  ): Promise<string | null> {
    try {
      const chunk = await md.GetEntityObject<MJDiagnosticSessionChunkEntity>('MJ: Diagnostic Session Chunks', contextUser);
      chunk.DiagnosticSessionID = sessionId;
      chunk.Source = item.source;
      chunk.HostInstanceLabel = this._hostInstanceLabel;
      chunk.Sequence = item.sequence;
      chunk.ContentKind = item.contentKind;
      chunk.Data = item.compressedData.toString('base64');
      chunk.EntryCount = item.entryCount;
      chunk.FirstEntryAt = item.firstEntryAt;
      chunk.LastEntryAt = item.lastEntryAt;
      if (await chunk.Save()) {
        return null;
      }
      return chunk.LatestResult?.CompleteMessage ?? 'unknown error';
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  public async FlushAllPendingChunks(contextUser?: UserInfo): Promise<number> {
    const sessionIds = new Set<string>();
    for (const buf of this._chunkBuffers.values()) {
      sessionIds.add(buf.sessionId);
    }
    let total = 0;
    for (const sid of sessionIds) {
      total += await this.FlushSessionChunksToDatabase(sid, contextUser);
    }
    return total;
  }

  /** Builds the health snapshot. The pool block appears only when the database provider measured it. */
  public CollectServerHealthSnapshot(provider?: IMetadataProvider): DiagnosticServerHealthSnapshot {
    const mem = process.memoryUsage();
    const lagP95Ms = this._eventLoopHistogram
      ? Number((this._eventLoopHistogram.percentile(95) / 1_000_000).toFixed(2))
      : 0;

    let cacheEntryCount = 0;
    let cacheEnabled = false;
    try {
      const stats = LocalCacheManager.Instance.GetStats();
      cacheEnabled = true;
      cacheEntryCount = stats.totalEntries ?? 0;
    } catch {
      cacheEnabled = false;
    }

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      eventLoopLagP95Ms: lagP95Ms,
      memory: {
        rssBytes: mem.rss,
        heapTotalBytes: mem.heapTotal,
        heapUsedBytes: mem.heapUsed,
        externalBytes: mem.external
      },
      databasePool: this.readDatabasePool(provider ?? Metadata.Provider),
      cacheStats: {
        enabled: cacheEnabled,
        entryCount: cacheEntryCount
      }
    };
  }

  /** Maps the provider's measured pool counts to the snapshot shape, or `undefined` when there are none. */
  private readDatabasePool(provider: IMetadataProvider | undefined): DiagnosticServerHealthSnapshot['databasePool'] {
    const stats: DatabasePoolStats | null =
      provider instanceof GenericDatabaseProvider ? provider.GetPoolStats() : null;
    if (!stats) {
      return undefined;
    }
    return {
      totalConnections: stats.TotalConnections,
      activeConnections: stats.ActiveConnections,
      idleConnections: stats.IdleConnections,
      waitingRequests: stats.WaitingRequests
    };
  }

  public async AssembleBundleDataFromChunks(
    sessionId: string | undefined,
    scrubLiterals: boolean,
    clientSeed?: Partial<DiagnosticBundleData>,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<{
    bundleData: DiagnosticBundleData;
    archiveBytes: Uint8Array;
    sha256: string;
    manifest: Record<string, unknown>;
    scrubReport: {
      credentialsScrubbedCount: number;
      sqlLiteralsNormalizedCount: number;
      customPatternsAppliedCount: number;
    };
  }> {
    return WithoutDiagnosticCapture(async () => {
      const serverLogs: DiagnosticLogEntry[] = [];
      const serverTraces: DiagnosticServerSpanEntry[] = [];
      const serverSql: DiagnosticSqlEntry[] = [];
      const clientLogs: DiagnosticLogEntry[] = [...(clientSeed?.clientLogs ?? [])];
      const clientWaterfall: DiagnosticNetworkEntry[] = [...(clientSeed?.clientWaterfall ?? [])];
      const clientTelemetry: DiagnosticTelemetryEntry[] = [...(clientSeed?.clientTelemetry ?? [])];

      if (sessionId) {
        // First drain any in-memory buffers for this session
        const inMem = this.DrainPendingBuffersForSession(sessionId);
        for (const chunk of inMem) {
          this.unpackCompressedChunk(
            chunk.contentKind,
            chunk.source,
            chunk.compressedData,
            serverLogs,
            serverTraces,
            serverSql,
            clientLogs,
            clientWaterfall,
            clientTelemetry
          );
        }

        // Also query persisted chunks if database provider is available and entity exists
        try {
          const md = provider ?? Metadata.Provider;
          if (md.EntityByName('MJ: Diagnostic Session Chunks')) {
            const rv = RunView.FromMetadataProvider(md);
            const res = await rv.RunView<MJDiagnosticSessionChunkEntity>(
              {
                EntityName: 'MJ: Diagnostic Session Chunks',
                ExtraFilter: `DiagnosticSessionID = '${EscapeSQLString(sessionId)}'`,
                OrderBy: 'Sequence ASC',
                ResultType: 'simple'
              },
              contextUser
            );
            if (res.Success && Array.isArray(res.Results)) {
              for (const row of res.Results) {
                if (row.Data) {
                  const buf = Buffer.from(row.Data, 'base64');
                  this.unpackCompressedChunk(
                    row.ContentKind,
                    row.Source,
                    buf,
                    serverLogs,
                    serverTraces,
                    serverSql,
                    clientLogs,
                    clientWaterfall,
                    clientTelemetry
                  );
                }
              }
            }
          }
        } catch {
          // Database may not be initialized in unit test environments
        }
      }

      const scrubberProfile = scrubLiterals ? 'Standard' : 'FullRaw';
      const contrib = await DiagnosticContributorRegistry.Instance.CollectAll({
        sessionId: sessionId ?? 'client-only',
        userId: contextUser?.ID,
        scrubberProfile
      });

      const rawData: DiagnosticBundleData = {
        environment: clientSeed?.environment ?? {
          mjVersion: MJ_VERSION,
          nodeVersion: process.version,
          osPlatform: os.platform(),
          osRelease: os.release(),
          osArch: os.arch(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        repro: clientSeed?.repro ?? {
          breadcrumbs: []
        },
        clientLogs,
        clientWaterfall,
        clientTelemetry,
        serverTraces,
        serverSql,
        serverLogs,
        serverHealth: clientSeed?.serverHealth ?? this.CollectServerHealthSnapshot(provider),
        findings: [],
        contrib
      };

      const scrubbed = ScrubBundleDataWithCount(rawData, { scrubberProfile });
      const scrubbedData = scrubbed.Data;
      scrubbedData.findings = AnalyzeDiagnosticBundleData(scrubbedData);

      const scrubReport = {
        credentialsScrubbedCount: scrubbed.CredentialsScrubbedCount,
        sqlLiteralsNormalizedCount: scrubLiterals ? scrubbedData.serverSql.length : 0,
        customPatternsAppliedCount: 0
      };

      const archiveBytes = await BuildMjdiagArchive(scrubbedData, {
        sessionId,
        captureReason: 'Manual',
        scrubberProfile,
        redactionSummary: scrubReport
      });

      const verified = await VerifyBundleArchive(archiveBytes);
      if (!verified.valid || !verified.manifest) {
        throw new Error(`Assembled bundle failed VerifyBundleArchive: ${verified.reason}`);
      }

      const sha256 = crypto.createHash('sha256').update(archiveBytes).digest('hex');

      return {
        bundleData: scrubbedData,
        archiveBytes,
        sha256,
        manifest: verified.manifest as unknown as Record<string, unknown>,
        scrubReport
      };
    });
  }

  private unpackCompressedChunk(
    contentKind: ChunkContentKind,
    source: MJDiagnosticSessionChunkEntity['Source'],
    compressedData: Buffer,
    serverLogs: DiagnosticLogEntry[],
    serverTraces: DiagnosticServerSpanEntry[],
    serverSql: DiagnosticSqlEntry[],
    clientLogs: DiagnosticLogEntry[],
    clientWaterfall: DiagnosticNetworkEntry[],
    clientTelemetry: DiagnosticTelemetryEntry[]
  ): void {
    try {
      const text = zlib.gunzipSync(compressedData).toString('utf8');
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (contentKind === 'Logs' || contentKind === 'Errors') {
          if (source === 'Client') {
            clientLogs.push(parsed as unknown as DiagnosticLogEntry);
          } else {
            serverLogs.push(parsed as unknown as DiagnosticLogEntry);
          }
        } else if (contentKind === 'Spans') {
          serverTraces.push(parsed as unknown as DiagnosticServerSpanEntry);
        } else if (contentKind === 'SQL') {
          serverSql.push(parsed as unknown as DiagnosticSqlEntry);
        } else if (contentKind === 'Network') {
          clientWaterfall.push(parsed as unknown as DiagnosticNetworkEntry);
        } else if (contentKind === 'Telemetry') {
          clientTelemetry.push(parsed as unknown as DiagnosticTelemetryEntry);
        }
      }
    } catch {
      // Ignore corrupt chunk line
    }
  }

  public MintDownloadToken(bundleId: string, userId: string, ttlMs: number = 60_000): string {
    const claims: DownloadTokenClaims = {
      bundleId,
      userId,
      expiresAtMs: Date.now() + Math.min(ttlMs, 60_000),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', this._hmacSecret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  public RedeemDownloadToken(token: string, expectedBundleId: string): { valid: boolean; userId?: string; reason?: string } {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Malformed token' };
    }
    const [payloadB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', this._hmacSecret).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'Invalid token signature' };
    }

    let claims: DownloadTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as DownloadTokenClaims;
    } catch {
      return { valid: false, reason: 'Invalid token claims' };
    }

    if (claims.bundleId !== expectedBundleId) {
      return { valid: false, reason: 'Bundle ID mismatch' };
    }
    if (Date.now() > claims.expiresAtMs) {
      return { valid: false, reason: 'Token expired' };
    }
    if (this._redeemedDownloadNonces.has(claims.nonce)) {
      return { valid: false, reason: 'Token already redeemed (single-use)' };
    }

    // Prune expired nonces and record this one
    const now = Date.now();
    for (const [nonce, exp] of this._redeemedDownloadNonces.entries()) {
      if (now > exp) this._redeemedDownloadNonces.delete(nonce);
    }
    this._redeemedDownloadNonces.set(claims.nonce, claims.expiresAtMs + 60_000);

    return { valid: true, userId: claims.userId };
  }

  /** Sends an archive to an enrolled collector. See `collectorClient.ts`. */
  public async SendBundleToCollector(params: SendBundleToCollectorParams): Promise<CollectorSendResult> {
    return SendBundleToCollector(params);
  }
}
