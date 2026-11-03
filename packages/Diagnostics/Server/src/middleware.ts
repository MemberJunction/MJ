import * as crypto from 'node:crypto';
import type { ApolloServerPlugin } from '@apollo/server';
import { RegisterClass } from '@memberjunction/global';
import { GetDiagnosticContext, DiagnosticContext, LogError, UserInfo } from '@memberjunction/core';
import {
  BaseServerMiddleware,
  ServerMiddlewareContext
} from '@memberjunction/server/middleware/BaseServerMiddleware';

type MiddlewareList = ReturnType<NonNullable<BaseServerMiddleware['GetPreAuthMiddleware']>>;
type MiddlewareHandler = MiddlewareList[number];
type ExpressApp = Parameters<NonNullable<BaseServerMiddleware['ConfigureExpressApp']>>[0];
type ExpressReq = Parameters<MiddlewareHandler>[0];
type ExpressRes = Parameters<MiddlewareHandler>[1];
type ExpressNext = Parameters<MiddlewareHandler>[2];
import {
  DiagnosticSessionManager,
  RunWithServerDiagnosticContext
} from './sessionManager.js';
import { DiagnosticIntakeService } from './intakeService.js';
import { RegisterIntakeRoutes } from './intakeRoutes.js';
import { GetInMemoryDiagnosticBundle } from './remoteOperations.js';
import { DiagnosticsSettings } from './settings.js';
import { ConfigureIntakeFromSettings } from './intakeStartup.js';
import { SetDiagnosticsApiRoute } from './apiRoute.js';
import { RestoreActiveSessions, WatchSessionExpiry } from './sessionStore.js';
import { SetClientCaptureTriggerHeader } from './clientCapture.js';
import { UserCache } from '@memberjunction/generic-database-provider';

export function ParseTraceparentHeader(headerValue?: string): { traceId: string; spanId: string } {
  if (headerValue && typeof headerValue === 'string') {
    const parts = headerValue.trim().split('-');
    if (
      parts.length === 4 &&
      /^[0-9a-f]{32}$/i.test(parts[1]) &&
      /^[0-9a-f]{16}$/i.test(parts[2])
    ) {
      return { traceId: parts[1].toLowerCase(), spanId: parts[2].toLowerCase() };
    }
  }
  return {
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex')
  };
}

export function CreateDiagnosticsApolloPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      const startTimeUnixMs = Date.now();
      let resolvedOpName: string | undefined;

      return {
        async didResolveOperation(requestContext) {
          resolvedOpName = requestContext.operationName ?? undefined;
          const ctx = GetDiagnosticContext();
          if (ctx && DiagnosticsSettings.Current().CaptureEnabled) {
            const variables = requestContext.request.variables as Record<string, unknown> | undefined;
            const inputObj = variables?.['input'] as Record<string, unknown> | undefined;
            const remoteOpKey =
              typeof inputObj?.['operationKey'] === 'string'
                ? inputObj['operationKey']
                : typeof inputObj?.['OperationKey'] === 'string'
                  ? inputObj['OperationKey']
                  : undefined;
            DiagnosticSessionManager.Instance.MatchOperation(ctx, resolvedOpName, remoteOpKey);
          }
        },
        async willSendResponse(requestContext) {
          const ctx = GetDiagnosticContext();
          const sessionId = ctx?.sessionId ?? ctx?.SessionID;
          if (!sessionId || ctx?.SuppressCapture || ctx?.suppressCapture) {
            return;
          }
          const durationMs = Math.max(0, Date.now() - startTimeUnixMs);
          const hasErrors = Boolean(
            requestContext.errors && requestContext.errors.length > 0
          );
          DiagnosticSessionManager.Instance.RecordServerSpan(sessionId, {
            traceId: ctx.traceId ?? ctx.TraceID ?? '0'.repeat(32),
            spanId: crypto.randomBytes(8).toString('hex'),
            parentSpanId: ctx.spanId ?? ctx.SpanID,
            name: `GraphQL.${resolvedOpName ?? 'Anonymous'}`,
            layer: 'graphql',
            startTimeUnixMs,
            durationMs,
            status: hasErrors ? 'error' : 'ok',
            attributes: {
              operationName: resolvedOpName ?? 'Anonymous',
              errorCount: requestContext.errors?.length ?? 0
            }
          });
        }
      };
    }
  };
}

@RegisterClass(BaseServerMiddleware, 'DiagnosticsServerMiddleware')
export class DiagnosticsServerMiddleware extends BaseServerMiddleware {
  public get Label(): string {
    return 'mj:diagnostics';
  }

  private serverContext: ServerMiddlewareContext | undefined;

  /**
   * Starts the session manager, loads the `Diagnostics.*` settings, configures intake from them,
   * saves sessions that expire in memory as `Expired` and loads the active sessions. The capture hooks
   * are installed only while capture is enabled and a session is held. MJServer calls this after
   * metadata and the user cache are loaded. When the settings fail to load, the error is logged and capture and intake stay off.
   */
  public override async Initialize(context?: ServerMiddlewareContext): Promise<void> {
    this.serverContext = context;
    SetDiagnosticsApiRoute(context?.ApiRoute);
    DiagnosticSessionManager.Instance.Initialize({ enableConsoleTap: true, enablePolling: false });
    const systemUser = UserCache.Instance.GetSystemUser();
    const settings = await this.loadSettings(systemUser);
    DiagnosticSessionManager.Instance.SyncCaptureHooks();
    if (!settings) {
      return;
    }
    await ConfigureIntakeFromSettings(settings, systemUser);
    WatchSessionExpiry(systemUser);
    await this.restoreSessions(systemUser);
  }

  private async loadSettings(systemUser: UserInfo | undefined): Promise<DiagnosticsSettings | null> {
    try {
      return await DiagnosticsSettings.Load(systemUser);
    } catch (err) {
      LogError(
        `Diagnostics capture and intake are off: the Diagnostics settings could not be loaded: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }

  private async restoreSessions(systemUser: UserInfo | undefined): Promise<void> {
    try {
      await RestoreActiveSessions(systemUser);
    } catch (err) {
      LogError(`Could not load the active diagnostic sessions: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Builds a route path under MJAPI's base path with the server's route builder.
   * Throws when `Initialize` has not received a context, so a route is never registered at the wrong path.
   */
  private route(subpath: string): string {
    if (!this.serverContext) {
      throw new Error(
        `DiagnosticsServerMiddleware cannot build route '${subpath}': Initialize() received no ServerMiddlewareContext.`
      );
    }
    return this.serverContext.ApiRoute(subpath);
  }

  public override GetPreAuthMiddleware(): MiddlewareList {
    const preAuthHandler: MiddlewareHandler = (req: ExpressReq, res: ExpressRes, next: ExpressNext) => {
      const traceparentRaw = req.headers['traceparent'];
      const traceHeader = Array.isArray(traceparentRaw) ? traceparentRaw[0] : traceparentRaw;
      const { traceId, spanId } = ParseTraceparentHeader(traceHeader);

      res.setHeader('X-MJ-Trace-ID', traceId);

      const explicitSessionHeader = req.headers['x-mj-diagnostic-session'];
      const explicitSessionId = Array.isArray(explicitSessionHeader)
        ? explicitSessionHeader[0]
        : explicitSessionHeader;

      const browserSessionHeader = req.headers['x-session-id'];
      const browserSessionId = Array.isArray(browserSessionHeader)
        ? browserSessionHeader[0]
        : browserSessionHeader;

      const context: DiagnosticContext = {
        traceId,
        TraceID: traceId,
        spanId,
        SpanID: spanId,
        BrowserSessionID: browserSessionId,
        IsCaptured: false
      };

      if (DiagnosticsSettings.Current().CaptureEnabled) {
        DiagnosticSessionManager.Instance.MatchPreAuth(context, explicitSessionId, browserSessionId);
      }

      RunWithServerDiagnosticContext(context, () => {
        next();
      });
    };

    return [preAuthHandler];
  }

  public override GetPostAuthMiddleware(): MiddlewareList {
    const postAuthHandler: MiddlewareHandler = (req: ExpressReq, res: ExpressRes, next: ExpressNext) => {
      const ctx = GetDiagnosticContext();
      if (ctx && DiagnosticsSettings.Current().CaptureEnabled) {
        const reqWithUser = req as ExpressReq & {
          userPayload?: {
            userRecord?: { ID?: string };
            apiKeyId?: string;
            companyId?: string;
          };
        };
        const userId = reqWithUser.userPayload?.userRecord?.ID;
        const apiKeyId = reqWithUser.userPayload?.apiKeyId;
        const companyId = reqWithUser.userPayload?.companyId;
        const matched = DiagnosticSessionManager.Instance.MatchPostAuth(ctx, userId, apiKeyId, companyId);
        SetClientCaptureTriggerHeader(res, matched);
      }
      next();
    };

    return [postAuthHandler];
  }

  public override GetApolloPlugins(): ApolloServerPlugin[] {
    return [CreateDiagnosticsApolloPlugin()];
  }

  public override ConfigureExpressApp(app: ExpressApp, context?: ServerMiddlewareContext): void {
    this.serverContext = context ?? this.serverContext;
    if (context) {
      SetDiagnosticsApiRoute(context.ApiRoute);
    }
    // 1. Single-use signed bundle download route
    app.get(
      this.route('/diagnostics/bundles/:bundleId/download'),
      (req: ExpressReq, res: ExpressRes) => {
        const rawBundleId = req.params['bundleId'];
        const bundleId = Array.isArray(rawBundleId) ? rawBundleId[0] ?? '' : rawBundleId ?? '';
        const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';
        const redemption = DiagnosticSessionManager.Instance.RedeemDownloadToken(token, bundleId);
        if (!redemption.valid) {
          res.status(403).json({ error: redemption.reason ?? 'Forbidden' });
          return;
        }
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${bundleId.replace(/[^a-zA-Z0-9_-]/g, '')}.mjdiag"`
        );

        const localBundle = GetInMemoryDiagnosticBundle(bundleId);
        if (localBundle?.archiveBytes) {
          res.setHeader('Content-Type', 'application/zip');
          res.status(200).send(Buffer.from(localBundle.archiveBytes));
          return;
        }

        const received = DiagnosticIntakeService.Instance.GetReceivedBundle(bundleId);
        if (received?.decryptedZipBytes) {
          res.setHeader('Content-Type', 'application/zip');
          res.status(200).send(Buffer.from(received.decryptedZipBytes));
          return;
        }
        res.status(410).json({
          error: 'The bundle bytes are no longer available on this instance; rebuild the bundle.'
        });
      }
    );

    // 2. Standard MJAPI Intake routes (/diagnostics/intake/v1)
    RegisterIntakeRoutes(app, (subpath) => this.route(subpath));
  }
}
