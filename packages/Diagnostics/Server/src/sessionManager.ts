import { AsyncLocalStorage } from 'node:async_hooks';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { monitorEventLoopDelay, IntervalHistogram } from 'node:perf_hooks';
import { Base64ToBytes, BaseSingleton, EscapeSQLString, MJGlobal } from '@memberjunction/global';
import {
  DiagnosticContext,
  IDiagnosticContextProvider,
  SetDiagnosticContextProvider,
  RegisterLogSink,
  WithoutDiagnosticCapture,
  IsInMJLogToConsole,
  LogEntry,
  LogError,
  LogWarning,
  RunDetachedFromDiagnosticContext,
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
  DiagnosticBreadcrumb,
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
  /** Compressed bytes of this session's chunks saved to the database. */
  bytesWritten: number;
  /**
   * Serialized bytes (UTF-8 JSON plus one newline per entry) of the entries accepted for this
   * session, saved or still buffered. `maxBytes` caps this count.
   */
  bytesCaptured?: number;
  /** True once an entry was refused because the session reached `maxBytes`. */
  maxBytesReached?: boolean;
}

/** Buffered bytes of one session that start a background save of its buffers. */
export const SESSION_FLUSH_THRESHOLD_BYTES = 1_048_576;

/** How often held sessions are checked for their end time while the capture hooks are installed. */
const SESSION_EXPIRY_SWEEP_MS = 30_000;

/** The user and provider that save session buffers outside a request. */
interface BackgroundSaveContext {
  contextUser: UserInfo;
  provider?: IMetadataProvider;
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

/** The result of checking or redeeming a download token. */
export interface DownloadTokenCheck {
  valid: boolean;
  userId?: string;
  reason?: string;
}

interface DownloadTokenClaims {
  bundleId: string;
  userId: string;
  expiresAtMs: number;
  nonce: string;
}

/** A chunk buffer taken out of memory, compressed and numbered, ready to save. */
type DrainedChunk = ReturnType<DiagnosticSessionManager['DrainPendingBuffersForSession']>[number];

/** The chunk columns the bundle build reads. Naming `Data` makes RunView return that binary column. */
const CHUNK_READ_FIELDS = ['Source', 'ContentKind', 'Sequence', 'EntryCount', 'Data'] as const;

/** Saved chunks are read one writer at a time (host and process), each in save order. */
const CHUNK_READ_ORDER = 'HostInstanceLabel ASC, __mj_CreatedAt ASC, Sequence ASC';

/** Entity name of the saved session chunks. */
export const DIAGNOSTIC_SESSION_CHUNK_ENTITY = 'MJ: Diagnostic Session Chunks';

/** Wait after a failed chunk save before a background save of the same session starts again. */
const BACKGROUND_SAVE_RETRY_MS = 30_000;

/** How long chunks a save could not write are kept for a session this process no longer holds. */
export const UNHELD_UNSAVED_CHUNK_TTL_MS = 15 * 60_000;

/** How often kept chunks of sessions no longer held are checked against their time-to-live. */
const UNSAVED_CHUNK_SWEEP_MS = 60_000;

/** One console method the console tap wraps. */
interface ConsoleTapMethod {
  method: 'log' | 'warn' | 'error';
  severity: DiagnosticLogEntry['severity'];
  /** The function the wrapper calls after recording. */
  inner: (...args: unknown[]) => void;
  wrapper: (...args: unknown[]) => void;
  /** True while the wrapper is in the console method's call chain. */
  attached: boolean;
}

/** A saved chunk row as the bundle build reads it. */
type SavedChunkRow = Pick<MJDiagnosticSessionChunkEntity, (typeof CHUNK_READ_FIELDS)[number]>;

/** One chunk to unpack into a bundle, from memory or from the database. */
interface ChunkToUnpack {
  source: MJDiagnosticSessionChunkEntity['Source'];
  contentKind: ChunkContentKind;
  sequence: number;
  entryCount: number;
  compressedData: Uint8Array | null;
}

/** What one save of a session's buffered chunks wrote to the database. */
export interface SavedSessionChunks {
  ChunksWritten: number;
  /** Compressed bytes of the saved chunks. */
  BytesWritten: number;
}

/** Options for {@link DiagnosticSessionManager.SaveSessionChunks}. */
export interface SaveSessionChunksOptions {
  /**
   * When true, the result also counts the saves of the same session that were queued or running
   * when this call started (for example a background save started while an upload was staged).
   */
  IncludeQueuedSaves?: boolean;
}

/** The session entries a bundle holds, by file. */
interface AssembledEntries {
  serverLogs: DiagnosticLogEntry[];
  serverTraces: DiagnosticServerSpanEntry[];
  serverSql: DiagnosticSqlEntry[];
  clientLogs: DiagnosticLogEntry[];
  clientWaterfall: DiagnosticNetworkEntry[];
  clientTelemetry: DiagnosticTelemetryEntry[];
  breadcrumbs: DiagnosticBreadcrumb[];
}

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

/** Gzips entries as NDJSON, one entry per line. */
function compressEntries(entries: Record<string, unknown>[]): Buffer {
  const ndjson = entries.map((e) => JSON.stringify(e)).join('\n');
  return zlib.gzipSync(Buffer.from(ndjson, 'utf8'));
}

/** The provider to use for session chunks, or null when there is none or it has no chunk entity. */
function chunkProviderOrNull(provider?: IMetadataProvider): IMetadataProvider | null {
  try {
    const md = provider ?? Metadata.Provider;
    return md?.EntityByName(DIAGNOSTIC_SESSION_CHUNK_ENTITY) ? md : null;
  } catch {
    return null;
  }
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
  private _consoleTapEnabled = true;
  private _consoleTapMethods: ConsoleTapMethod[] | null = null;
  private _consoleTapActive = false;
  private _removeLogSink: (() => void) | null = null;
  private _removeSqlObserver: (() => void) | null = null;
  private _expirySweepTimer: ReturnType<typeof setInterval> | null = null;
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _installId: string = crypto.randomUUID();
  private _onSessionExpired: ((session: ActiveDiagnosticSession) => void) | null = null;
  private _pendingBytes = new Map<string, number>();
  /** Chunks a save could not write, oldest first; the next save of the session retries them first. */
  private _unsavedChunks = new Map<string, DrainedChunk[]>();
  /** The end of each session's queue of saves and builds; work on one session runs one item at a time. */
  private _sessionWorkTails = new Map<string, Promise<void>>();
  private _queuedSaves = new Map<string, Set<Promise<SavedSessionChunks>>>();
  private _backgroundRetryAfterMs = new Map<string, number>();
  /** When the unsaved-chunk sweep first saw each session with kept chunks and no longer held. */
  private _unheldSinceMs = new Map<string, number>();
  private _unsavedSweepTimer: ReturnType<typeof setInterval> | null = null;
  private _backgroundSave: BackgroundSaveContext | null = null;

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
    this._pendingBytes.clear();
    this._unsavedChunks.clear();
    this._sessionWorkTails.clear();
    this._queuedSaves.clear();
    this._backgroundRetryAfterMs.clear();
    this._unheldSinceMs.clear();
    this.stopUnsavedChunkSweep();
    this.SyncCaptureHooks();
  }

  /**
   * Starts the session manager. The capture hooks (log sink, SQL observer and, unless
   * `enableConsoleTap` is false, the console tap) are installed later by {@link SyncCaptureHooks},
   * only while capture is enabled and a session is held.
   */
  public Initialize(options?: { enableConsoleTap?: boolean; enablePolling?: boolean }): void {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._consoleTapEnabled = options?.enableConsoleTap !== false;

    SetDiagnosticContextProvider(new ServerDiagnosticContextProvider());

    try {
      this._eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
      this._eventLoopHistogram.enable();
    } catch {
      this._eventLoopHistogram = null;
    }

    this.SyncCaptureHooks();

    if (options?.enablePolling) {
      this._pollTimer = setInterval(() => {
        WithoutDiagnosticCapture(() => {
          void this.FlushAllPendingChunks().catch(() => {});
        });
      }, 10_000);
      this._pollTimer.unref?.();
    }
  }

  /**
   * Installs the capture hooks while `Diagnostics.Capture.Enabled` is on and this process holds at
   * least one session, and removes them otherwise. Without the hooks, logs, SQL and console output
   * cost nothing extra. The expiry sweep runs while any session is held.
   */
  public SyncCaptureHooks(): void {
    const wanted = this._initialized && this._activeSessions.size > 0 && DiagnosticsSettings.Current().CaptureEnabled;
    if (wanted) {
      this.installCaptureHooks();
    } else {
      this.removeCaptureHooks();
    }
    this.syncExpirySweep();
  }

  private installCaptureHooks(): void {
    if (this._removeSqlObserver) {
      return;
    }
    this._removeLogSink = RegisterLogSink((entry: LogEntry, context: DiagnosticContext | undefined) => {
      this.onLogEntry(entry, context);
    });
    this._removeSqlObserver = GenericDatabaseProvider.RegisterSqlObserver((obs: SqlObservation) => {
      this.onSqlObservation(obs);
    });
    if (this._consoleTapEnabled) {
      this.InstallConsoleTap();
    }
  }

  private removeCaptureHooks(): void {
    this._removeLogSink?.();
    this._removeLogSink = null;
    this._removeSqlObserver?.();
    this._removeSqlObserver = null;
    this.removeConsoleTap();
  }

  /** Runs the expiry sweep while this process holds any session, whatever the capture setting. */
  private syncExpirySweep(): void {
    const wanted = this._initialized && this._activeSessions.size > 0;
    if (wanted && !this._expirySweepTimer) {
      this._expirySweepTimer = setInterval(() => this.sweepEndedSessions(), SESSION_EXPIRY_SWEEP_MS);
      this._expirySweepTimer.unref?.();
    } else if (!wanted && this._expirySweepTimer) {
      clearInterval(this._expirySweepTimer);
      this._expirySweepTimer = null;
    }
  }

  /** Drops held sessions past their end time, then installs or removes the hooks to match. */
  private sweepEndedSessions(): void {
    this.GetAllActiveSessions();
    this.SyncCaptureHooks();
  }

  /**
   * Wraps `console.log`, `console.warn` and `console.error` so direct console calls inside a session
   * are captured. The wrappers are made once and reused: removing the tap puts back a method that
   * still holds the wrapper, and a method that another library wrapped later keeps the wrapper,
   * which records nothing until the tap is installed again.
   */
  public InstallConsoleTap(): void {
    if (this._consoleTapActive) {
      return;
    }
    this._consoleTapMethods ??= this.createConsoleTapMethods();
    for (const m of this._consoleTapMethods) {
      if (!m.attached) {
        m.inner = console[m.method];
        console[m.method] = m.wrapper;
        m.attached = true;
      }
    }
    this._consoleTapActive = true;
  }

  private createConsoleTapMethods(): ConsoleTapMethod[] {
    const specs = [
      ['log', 'info'],
      ['warn', 'warn'],
      ['error', 'error']
    ] as const;
    return specs.map(([method, severity]) => {
      const entry: ConsoleTapMethod = {
        method,
        severity,
        inner: console[method],
        attached: false,
        wrapper: (...args: unknown[]): void => {
          if (this._consoleTapActive && !IsInMJLogToConsole()) {
            this.recordDirectConsoleCall(entry.severity, args);
          }
          entry.inner.apply(console, args);
        }
      };
      return entry;
    });
  }

  private removeConsoleTap(): void {
    this._consoleTapActive = false;
    for (const m of this._consoleTapMethods ?? []) {
      if (m.attached && console[m.method] === m.wrapper) {
        console[m.method] = m.inner;
        m.attached = false;
      }
    }
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
    this.SyncCaptureHooks();
  }

  /**
   * Sets the user (and provider) that save session buffers outside a request: when a session's
   * buffers pass {@link SESSION_FLUSH_THRESHOLD_BYTES} and when a session ends without Stop.
   * With no user, an ended session's buffers are dropped and the drop is logged.
   */
  public SetBackgroundSaveContext(contextUser: UserInfo | undefined, provider?: IMetadataProvider): void {
    this._backgroundSave = contextUser ? { contextUser, provider } : null;
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
      this.settleEndedSessionBuffers(session.id);
      this._onSessionExpired?.(session);
    }
    this.SyncCaptureHooks();
  }

  /** Saves the buffers of a session that ended without Stop, or drops them with a log line when no save user is set. */
  private settleEndedSessionBuffers(sessionId: string): void {
    const pendingBytes = this._pendingBytes.get(sessionId) ?? 0;
    if (pendingBytes === 0 && !this._sessionWorkTails.has(sessionId)) {
      return;
    }
    if (this._backgroundSave) {
      this.startBackgroundSave(sessionId, true);
      return;
    }
    this.queueDropUnsavedEntries(sessionId, 'ended with no user to save its entries');
  }

  /** Drops a session's unsaved entries now, or after its queued saves and builds finish when any are queued. */
  private queueDropUnsavedEntries(sessionId: string, reason: string): void {
    if (!this._sessionWorkTails.has(sessionId)) {
      this.dropUnsavedEntries(sessionId, reason);
      return;
    }
    void this.runSessionWork(sessionId, async () => this.dropUnsavedEntries(sessionId, reason));
  }

  /** Drops a session's kept chunks and buffers, and logs the number of entries dropped. */
  private dropUnsavedEntries(sessionId: string, reason: string): void {
    const dropped = this.DrainPendingBuffersForSession(sessionId).reduce((n, c) => n + c.entryCount, 0);
    this._backgroundRetryAfterMs.delete(sessionId);
    this._unheldSinceMs.delete(sessionId);
    if (dropped > 0) {
      WithoutDiagnosticCapture(() => LogError(`Diagnostic session '${sessionId}' ${reason}; ${dropped} unsaved entries were dropped.`));
    }
  }

  /**
   * Drops the kept chunks of each session this process no longer holds once
   * {@link UNHELD_UNSAVED_CHUNK_TTL_MS} has passed since the sweep first saw it unheld. A held session keeps its chunks.
   */
  private sweepUnsavedChunks(): void {
    const now = Date.now();
    for (const sessionId of [...this._unsavedChunks.keys()]) {
      if (this._activeSessions.has(sessionId)) {
        this._unheldSinceMs.delete(sessionId);
        continue;
      }
      const since = this._unheldSinceMs.get(sessionId);
      if (since === undefined) {
        this._unheldSinceMs.set(sessionId, now);
      } else if (now - since >= UNHELD_UNSAVED_CHUNK_TTL_MS) {
        this.queueDropUnsavedEntries(sessionId, `was no longer held and its unsaved chunks passed their ${UNHELD_UNSAVED_CHUNK_TTL_MS / 60_000}-minute limit`);
      }
    }
    if (this._unsavedChunks.size === 0) {
      this.stopUnsavedChunkSweep();
    }
  }

  private startUnsavedChunkSweep(): void {
    if (!this._unsavedSweepTimer) {
      this._unsavedSweepTimer = setInterval(() => this.sweepUnsavedChunks(), UNSAVED_CHUNK_SWEEP_MS);
      this._unsavedSweepTimer.unref?.();
    }
  }

  private stopUnsavedChunkSweep(): void {
    if (this._unsavedSweepTimer) {
      clearInterval(this._unsavedSweepTimer);
      this._unsavedSweepTimer = null;
    }
    this._unheldSinceMs.clear();
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
      this.SyncCaptureHooks();
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

  /**
   * Adds one entry to a session's buffer. For a session this process holds, the entry's serialized
   * size counts against `maxBytes`, and an entry that would pass it is refused. When the session's
   * buffered bytes pass {@link SESSION_FLUSH_THRESHOLD_BYTES}, a background save starts.
   */
  public AppendToChunkBuffer(
    sessionId: string,
    source: MJDiagnosticSessionChunkEntity['Source'],
    contentKind: ChunkContentKind,
    entry: Record<string, unknown>
  ): void {
    const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1;
    const session = this._activeSessions.get(sessionId);
    if (session && !this.reserveCapturedBytes(session, entryBytes)) {
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

    buf.entries.push(entry);
    buf.approxBytes += entryBytes;
    buf.lastEntryAt = now;

    const pendingBytes = (this._pendingBytes.get(sessionId) ?? 0) + entryBytes;
    this._pendingBytes.set(sessionId, pendingBytes);
    if (pendingBytes >= SESSION_FLUSH_THRESHOLD_BYTES) {
      this.startBackgroundSave(sessionId, false);
    }
  }

  /** Counts an entry against the session's `maxBytes`. Returns false, and logs once, when the entry does not fit. */
  private reserveCapturedBytes(session: ActiveDiagnosticSession, entryBytes: number): boolean {
    const captured = session.bytesCaptured ?? 0;
    if (captured + entryBytes > session.maxBytes) {
      if (!session.maxBytesReached) {
        session.maxBytesReached = true;
        WithoutDiagnosticCapture(() =>
          LogWarning(`Diagnostic session '${session.id}' reached its ${session.maxBytes}-byte limit; later entries are not captured.`)
        );
      }
      return false;
    }
    session.bytesCaptured = captured + entryBytes;
    return true;
  }

  /**
   * Saves a session's buffers outside the current request with the background save user.
   * Does nothing without that user. Unless `force` is true, it also does nothing while other work on
   * the session is queued, or for {@link BACKGROUND_SAVE_RETRY_MS} after a failed save.
   */
  private startBackgroundSave(sessionId: string, force: boolean): void {
    const ctx = this._backgroundSave;
    if (!ctx) {
      return;
    }
    const waiting = this._sessionWorkTails.has(sessionId) || Date.now() < (this._backgroundRetryAfterMs.get(sessionId) ?? 0);
    if (!force && waiting) {
      return;
    }
    RunDetachedFromDiagnosticContext(() => {
      void this.SaveSessionChunks(sessionId, ctx.contextUser, ctx.provider).catch((err: unknown) => {
        WithoutDiagnosticCapture(() =>
          LogError(`Diagnostic session '${sessionId}': background chunk save failed: ${err instanceof Error ? err.message : String(err)}`)
        );
      });
    });
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

  /**
   * Takes a session's unsaved chunks out of memory, compressed and numbered: first the chunks an
   * earlier save could not write (with their sequence numbers), then the current buffers.
   */
  public DrainPendingBuffersForSession(sessionId: string): Array<{
    source: MJDiagnosticSessionChunkEntity['Source'];
    contentKind: ChunkContentKind;
    sequence: number;
    compressedData: Buffer;
    entryCount: number;
    firstEntryAt: Date;
    lastEntryAt: Date;
    /** Serialized bytes of the chunk's entries, as counted at append time. */
    serializedBytes: number;
  }> {
    const drained: DrainedChunk[] = [...(this._unsavedChunks.get(sessionId) ?? [])];
    this._unsavedChunks.delete(sessionId);

    for (const [key, buf] of this._chunkBuffers.entries()) {
      if (buf.sessionId !== sessionId || buf.entries.length === 0) {
        continue;
      }
      this._chunkBuffers.delete(key);
      drained.push({
        source: buf.source,
        contentKind: buf.contentKind,
        sequence: this.NextSequence(sessionId, buf.source, buf.contentKind),
        compressedData: compressEntries(buf.entries),
        entryCount: buf.entries.length,
        firstEntryAt: buf.firstEntryAt,
        lastEntryAt: buf.lastEntryAt,
        serializedBytes: buf.approxBytes
      });
    }
    this._pendingBytes.delete(sessionId);
    return drained;
  }

  /** Puts chunks a save could not write back in front of the session's unsaved chunks, in order, with their sequence numbers. */
  private retainUnsavedChunks(sessionId: string, chunks: DrainedChunk[]): void {
    this._unsavedChunks.set(sessionId, [...chunks, ...(this._unsavedChunks.get(sessionId) ?? [])]);
    this.startUnsavedChunkSweep();
    const bytes = chunks.reduce((n, c) => n + c.serializedBytes, 0);
    this._pendingBytes.set(sessionId, (this._pendingBytes.get(sessionId) ?? 0) + bytes);
  }

  /** Copies a session's unsaved chunks and buffers as chunks to unpack, leaving them in place. */
  private copyPendingBuffersForSession(sessionId: string): ChunkToUnpack[] {
    const copies: ChunkToUnpack[] = (this._unsavedChunks.get(sessionId) ?? []).map((c) => ({
      source: c.source,
      contentKind: c.contentKind,
      sequence: c.sequence,
      entryCount: c.entryCount,
      compressedData: c.compressedData
    }));
    for (const buf of this._chunkBuffers.values()) {
      if (buf.sessionId === sessionId && buf.entries.length > 0) {
        copies.push({
          source: buf.source,
          contentKind: buf.contentKind,
          sequence: 0,
          entryCount: buf.entries.length,
          compressedData: compressEntries(buf.entries)
        });
      }
    }
    return copies;
  }

  /** Saves a session's buffered chunks to the database and returns how many were saved. */
  public async FlushSessionChunksToDatabase(
    sessionId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<number> {
    return (await this.SaveSessionChunks(sessionId, contextUser, provider)).ChunksWritten;
  }

  /**
   * Saves every unsaved chunk of a session, from any source, to the database. Returns the chunks
   * and compressed bytes saved. Saves and builds of one session run one at a time, so when this
   * resolves, every earlier save of the session has finished.
   *
   * Chunks are saved oldest first. At the first failed save, that chunk and the ones after it are put
   * back in memory, in order with their sequence numbers, and one line is logged; the next save retries
   * them first. They stay counted against the session's `maxBytes`.
   */
  public async SaveSessionChunks(
    sessionId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    options?: SaveSessionChunksOptions
  ): Promise<SavedSessionChunks> {
    const earlier = options?.IncludeQueuedSaves ? [...(this._queuedSaves.get(sessionId) ?? [])] : [];
    const run = this.runSessionWork(sessionId, () => this.saveDrainedChunks(sessionId, contextUser, provider));
    this.trackQueuedSave(sessionId, run);
    const own = await run;
    const others = await Promise.all(earlier.map((p) => p.catch(() => ({ ChunksWritten: 0, BytesWritten: 0 }))));
    return others.reduce(
      (sum, r) => ({ ChunksWritten: sum.ChunksWritten + r.ChunksWritten, BytesWritten: sum.BytesWritten + r.BytesWritten }),
      own
    );
  }

  /** Queues work on a session behind its earlier saves and builds. */
  private runSessionWork<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const tail = this._sessionWorkTails.get(sessionId) ?? Promise.resolve();
    const run = tail.then(work);
    const settled = run.then(
      () => undefined,
      () => undefined
    );
    this._sessionWorkTails.set(sessionId, settled);
    void settled.then(() => {
      if (this._sessionWorkTails.get(sessionId) === settled) {
        this._sessionWorkTails.delete(sessionId);
      }
    });
    return run;
  }

  /** Keeps a save in the session's queued saves until it settles. */
  private trackQueuedSave(sessionId: string, save: Promise<SavedSessionChunks>): void {
    const queued = this._queuedSaves.get(sessionId) ?? new Set<Promise<SavedSessionChunks>>();
    queued.add(save);
    this._queuedSaves.set(sessionId, queued);
    const forget = (): void => {
      queued.delete(save);
      if (queued.size === 0 && this._queuedSaves.get(sessionId) === queued) {
        this._queuedSaves.delete(sessionId);
      }
    };
    save.then(forget, forget);
  }

  /** Drains a session's unsaved chunks and saves them in order, with capture suppressed. Without a chunk entity, nothing is drained. */
  private async saveDrainedChunks(
    sessionId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<SavedSessionChunks> {
    return WithoutDiagnosticCapture(async () => {
      const saved: SavedSessionChunks = { ChunksWritten: 0, BytesWritten: 0 };
      const md = chunkProviderOrNull(provider);
      if (!md) {
        this._backgroundRetryAfterMs.set(sessionId, Date.now() + BACKGROUND_SAVE_RETRY_MS);
        return saved;
      }
      const drained = this.DrainPendingBuffersForSession(sessionId);
      let failure: string | null = null;
      let index = 0;
      for (; index < drained.length; index++) {
        failure = await this.saveChunk(md, sessionId, drained[index], contextUser);
        if (failure !== null) {
          break;
        }
        saved.ChunksWritten++;
        saved.BytesWritten += drained[index].compressedData.byteLength;
      }
      const session = this._activeSessions.get(sessionId);
      if (session) {
        session.bytesWritten += saved.BytesWritten;
      }
      if (failure !== null) {
        this.keepFailedChunks(sessionId, drained.slice(index), drained.length, failure);
      } else {
        this._backgroundRetryAfterMs.delete(sessionId);
        this._unheldSinceMs.delete(sessionId);
      }
      return saved;
    });
  }

  /** Puts back the chunks a save did not write, delays the next background save, and logs one line. */
  private keepFailedChunks(sessionId: string, kept: DrainedChunk[], drainedCount: number, failure: string): void {
    this.retainUnsavedChunks(sessionId, kept);
    this._backgroundRetryAfterMs.set(sessionId, Date.now() + BACKGROUND_SAVE_RETRY_MS);
    LogError(
      `Diagnostic session '${sessionId}': ${kept.length} of ${drainedCount} chunks were not saved and are kept in memory for the next save. First error: ${failure}`
    );
  }

  /** Saves one drained chunk. Returns `null` on success, otherwise the error message. */
  private async saveChunk(
    md: IMetadataProvider,
    sessionId: string,
    item: DrainedChunk,
    contextUser?: UserInfo
  ): Promise<string | null> {
    try {
      const chunk = await md.GetEntityObject<MJDiagnosticSessionChunkEntity>(DIAGNOSTIC_SESSION_CHUNK_ENTITY, contextUser);
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

  /**
   * Saves the buffers and kept chunks of every session, as `contextUser` or else the background save
   * user. A session still waiting after a failed save is skipped. Returns the chunks saved.
   */
  public async FlushAllPendingChunks(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number> {
    const saver = contextUser ? { contextUser, provider } : this._backgroundSave;
    const sessionIds = new Set<string>(this._unsavedChunks.keys());
    for (const buf of this._chunkBuffers.values()) {
      sessionIds.add(buf.sessionId);
    }
    let total = 0;
    for (const sid of sessionIds) {
      if (Date.now() < (this._backgroundRetryAfterMs.get(sid) ?? 0)) {
        continue;
      }
      total += (await this.SaveSessionChunks(sid, saver?.contextUser, saver?.provider)).ChunksWritten;
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
      const entries: AssembledEntries = {
        serverLogs: [],
        serverTraces: [],
        serverSql: [],
        clientLogs: [...(clientSeed?.clientLogs ?? [])],
        clientWaterfall: [...(clientSeed?.clientWaterfall ?? [])],
        clientTelemetry: [...(clientSeed?.clientTelemetry ?? [])],
        breadcrumbs: [...(clientSeed?.repro?.breadcrumbs ?? [])]
      };
      if (sessionId) {
        await this.unpackSessionChunks(sessionId, entries, contextUser, provider);
      }
      const { serverLogs, serverTraces, serverSql, clientLogs, clientWaterfall, clientTelemetry, breadcrumbs } = entries;

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
        repro: { ...clientSeed?.repro, breadcrumbs },
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

  /**
   * Adds every chunk of a session to `entries`. The buffers still in memory are saved first and
   * every chunk is then read from the database; with no chunk entity, the buffers are copied and
   * left in place. Throws when any chunk cannot be read in full, so a bundle never holds part of
   * a session.
   */
  private async unpackSessionChunks(
    sessionId: string,
    entries: AssembledEntries,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<void> {
    if (!chunkProviderOrNull(provider)) {
      for (const chunk of this.copyPendingBuffersForSession(sessionId)) {
        this.unpackChunk(sessionId, chunk, entries);
      }
      return;
    }
    await this.runSessionWork(sessionId, () => this.unpackSavedThenUnsaved(sessionId, entries, contextUser, provider));
  }

  /**
   * Saves the session's unsaved chunks, adds every saved chunk, then adds the chunks still in memory
   * (failed saves and entries buffered since). Runs as one item of the session's work queue, so no
   * other save moves a chunk between the database and memory meanwhile, and no entry is added twice.
   */
  private async unpackSavedThenUnsaved(
    sessionId: string,
    entries: AssembledEntries,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<void> {
    await this.saveDrainedChunks(sessionId, contextUser, provider);
    for (const row of await this.readSavedChunks(sessionId, contextUser, provider)) {
      this.unpackChunk(
        sessionId,
        {
          source: row.Source,
          contentKind: row.ContentKind,
          sequence: row.Sequence,
          entryCount: row.EntryCount,
          compressedData: row.Data ? Base64ToBytes(row.Data) : null
        },
        entries
      );
    }
    for (const chunk of this.copyPendingBuffersForSession(sessionId)) {
      this.unpackChunk(sessionId, chunk, entries);
    }
  }

  /** Reads the saved chunks of a session. Throws when the read fails. */
  private async readSavedChunks(
    sessionId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<SavedChunkRow[]> {
    const md = chunkProviderOrNull(provider);
    if (!md) {
      return [];
    }
    const res = await RunView.FromMetadataProvider(md).RunView<SavedChunkRow>(
      {
        EntityName: DIAGNOSTIC_SESSION_CHUNK_ENTITY,
        ExtraFilter: `DiagnosticSessionID = '${EscapeSQLString(sessionId)}'`,
        OrderBy: CHUNK_READ_ORDER,
        Fields: [...CHUNK_READ_FIELDS],
        ResultType: 'simple'
      },
      contextUser
    );
    if (!res.Success) {
      throw new Error(`Could not read the saved chunks of diagnostic session ${sessionId}: ${res.ErrorMessage}`);
    }
    return res.Results ?? [];
  }

  /** Adds one chunk's entries to `entries`. Throws when the chunk cannot be read in full. */
  private unpackChunk(sessionId: string, chunk: ChunkToUnpack, entries: AssembledEntries): void {
    const label = `Diagnostic session ${sessionId}: ${chunk.source} ${chunk.contentKind} chunk ${chunk.sequence}`;
    const add = this.entrySinkFor(chunk.contentKind, chunk.source, entries);
    if (!add) {
      throw new Error(`${label} has a content kind the bundle does not hold`);
    }
    if (!chunk.compressedData || chunk.compressedData.byteLength === 0) {
      throw new Error(`${label} has no data`);
    }
    const lines = this.decompressChunkLines(chunk.compressedData, label);
    if (lines.length !== chunk.entryCount) {
      throw new Error(`${label} holds ${lines.length} entries but recorded ${chunk.entryCount}`);
    }
    const parsed = lines.map((line, index) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`${label} has an unreadable entry at line ${index + 1}`);
      }
    });
    parsed.forEach(add);
  }

  /** Decompresses a gzip NDJSON chunk into its non-empty lines. */
  private decompressChunkLines(compressedData: Uint8Array, label: string): string[] {
    let text: string;
    try {
      text = zlib.gunzipSync(compressedData).toString('utf8');
    } catch (err) {
      throw new Error(`${label} could not be decompressed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return text.split('\n').filter((l) => l.trim().length > 0);
  }

  /** Returns the function that adds one entry of a chunk kind to its bundle file, or undefined for a kind the bundle does not hold. */
  private entrySinkFor(
    contentKind: ChunkContentKind,
    source: MJDiagnosticSessionChunkEntity['Source'],
    entries: AssembledEntries
  ): ((entry: Record<string, unknown>) => void) | undefined {
    switch (contentKind) {
      case 'Logs':
      case 'Errors':
        return source === 'Client'
          ? (e) => entries.clientLogs.push(e as unknown as DiagnosticLogEntry)
          : (e) => entries.serverLogs.push(e as unknown as DiagnosticLogEntry);
      case 'Spans':
        return (e) => entries.serverTraces.push(e as unknown as DiagnosticServerSpanEntry);
      case 'SQL':
        return (e) => entries.serverSql.push(e as unknown as DiagnosticSqlEntry);
      case 'Network':
        return (e) => entries.clientWaterfall.push(e as unknown as DiagnosticNetworkEntry);
      case 'Telemetry':
        return (e) => entries.clientTelemetry.push(e as unknown as DiagnosticTelemetryEntry);
      case 'Timeline':
        return (e) => entries.breadcrumbs.push(e as unknown as DiagnosticBreadcrumb);
      default:
        return undefined;
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

  /**
   * Checks a download token without using it up: signature, bundle ID, expiry, and that it was not
   * redeemed yet. Use {@link RedeemDownloadToken} to use it up.
   */
  public VerifyDownloadToken(token: string, expectedBundleId: string): DownloadTokenCheck {
    const checked = this.checkDownloadToken(token, expectedBundleId);
    return 'reason' in checked ? { valid: false, reason: checked.reason } : { valid: true, userId: checked.userId };
  }

  /**
   * Checks a download token and uses it up (single use). A token already redeemed is refused, so of
   * two requests racing on one token only one succeeds.
   */
  public RedeemDownloadToken(token: string, expectedBundleId: string): DownloadTokenCheck {
    const checked = this.checkDownloadToken(token, expectedBundleId);
    if ('reason' in checked) {
      return { valid: false, reason: checked.reason };
    }
    const now = Date.now();
    for (const [nonce, exp] of this._redeemedDownloadNonces.entries()) {
      if (now > exp) this._redeemedDownloadNonces.delete(nonce);
    }
    this._redeemedDownloadNonces.set(checked.nonce, checked.expiresAtMs + 60_000);
    return { valid: true, userId: checked.userId };
  }

  /** Returns a token's claims when it is valid for the bundle and not redeemed yet, otherwise the reason. */
  private checkDownloadToken(token: string, expectedBundleId: string): DownloadTokenClaims | { reason: string } {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { reason: 'Malformed token' };
    }
    const [payloadB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', this._hmacSecret).update(payloadB64).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { reason: 'Invalid token signature' };
    }

    let claims: DownloadTokenClaims;
    try {
      claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as DownloadTokenClaims;
    } catch {
      return { reason: 'Invalid token claims' };
    }

    if (claims.bundleId !== expectedBundleId) {
      return { reason: 'Bundle ID mismatch' };
    }
    if (Date.now() > claims.expiresAtMs) {
      return { reason: 'Token expired' };
    }
    if (this._redeemedDownloadNonces.has(claims.nonce)) {
      return { reason: 'Token already redeemed (single-use)' };
    }
    return claims;
  }


  /** Sends an archive to an enrolled collector. See `collectorClient.ts`. */
  public async SendBundleToCollector(params: SendBundleToCollectorParams): Promise<CollectorSendResult> {
    return SendBundleToCollector(params);
  }
}
