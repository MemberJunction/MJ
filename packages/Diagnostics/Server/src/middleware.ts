import * as crypto from 'node:crypto';
import type { ApolloServerPlugin } from '@apollo/server';
import { RegisterClass } from '@memberjunction/global';
import { GetDiagnosticContext, DiagnosticContext } from '@memberjunction/core';
import { BaseServerMiddleware, ApiRoute } from '@memberjunction/server';

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
import {
  DiagnosticIntakeService,
  IntakeCreateBundleRequest,
  IntakeCompleteRequest,
  MAX_INTAKE_BUNDLE_BYTES
} from './intakeService.js';

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
          if (ctx) {
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

  public override async Initialize(): Promise<void> {
    DiagnosticSessionManager.Instance.Initialize({ enableConsoleTap: true, enablePolling: false });
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

      DiagnosticSessionManager.Instance.MatchPreAuth(
        context,
        explicitSessionId,
        browserSessionId
      );

      RunWithServerDiagnosticContext(context, () => {
        next();
      });
    };

    return [preAuthHandler];
  }

  public override GetPostAuthMiddleware(): MiddlewareList {
    const postAuthHandler: MiddlewareHandler = (req: ExpressReq, _res: ExpressRes, next: ExpressNext) => {
      const ctx = GetDiagnosticContext();
      if (ctx) {
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
        DiagnosticSessionManager.Instance.MatchPostAuth(ctx, userId, apiKeyId, companyId);
      }
      next();
    };

    return [postAuthHandler];
  }

  public override GetApolloPlugins(): ApolloServerPlugin[] {
    return [CreateDiagnosticsApolloPlugin()];
  }

  public override ConfigureExpressApp(app: ExpressApp): void {
    // 1. Single-use signed bundle download route
    app.get(
      ApiRoute('/diagnostics/bundles/:bundleId/download'),
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

        const received = DiagnosticIntakeService.Instance.GetReceivedBundle(bundleId);
        if (received?.decryptedZipBytes) {
          res.setHeader('Content-Type', 'application/zip');
          res.status(200).send(Buffer.from(received.decryptedZipBytes));
          return;
        }
        res.status(404).json({ error: 'Bundle binary not found in memory cache' });
      }
    );

    // 2. Standard MJAPI Intake routes (/diagnostics/intake/v1)
    app.get(
      ApiRoute('/diagnostics/intake/v1/public-key'),
      async (_req: ExpressReq, res: ExpressRes) => {
        if (!DiagnosticIntakeService.Instance.Enabled) {
          res.status(404).json({ error: 'Diagnostic intake is disabled on this instance.' });
          return;
        }
        const descriptor = await DiagnosticIntakeService.Instance.GetPublicKeyDescriptor();
        res.status(200).json(descriptor);
      }
    );

    app.post(
      ApiRoute('/diagnostics/intake/v1/bundles'),
      (req: ExpressReq, res: ExpressRes) => {
        const intake = DiagnosticIntakeService.Instance;
        if (!intake.Enabled) {
          res.status(404).json({ error: 'Diagnostic intake is disabled on this instance.' });
          return;
        }
        const apiKey = req.headers['x-api-key'];
        const tokenStr = Array.isArray(apiKey) ? apiKey[0] : apiKey;
        if (!intake.ValidateIngestAuth(tokenStr)) {
          res.status(401).json({ error: 'Missing or invalid ingest API key (requires diagnostics:ingest scope).' });
          return;
        }
        const body = req.body as IntakeCreateBundleRequest;
        const callerKey = `${req.ip ?? 'unknown'}:${body?.installId ?? 'unknown'}`;
        if (!intake.CheckRateLimit(callerKey)) {
          res.status(429).json({ error: 'Diagnostic intake rate limit exceeded.' });
          return;
        }
        try {
          const created = intake.InitiateBundleIntake(body);
          res.status(201).json(created);
        } catch (err) {
          res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        }
      }
    );

    app.put(
      ApiRoute('/diagnostics/intake/v1/bundles/:referenceId/payload'),
      (req: ExpressReq, res: ExpressRes) => {
        const intake = DiagnosticIntakeService.Instance;
        if (!intake.Enabled) {
          res.status(404).json({ error: 'Diagnostic intake is disabled on this instance.' });
          return;
        }
        const apiKey = req.headers['x-api-key'];
        const tokenStr = Array.isArray(apiKey) ? apiKey[0] : apiKey;
        if (!intake.ValidateIngestAuth(tokenStr)) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }

        const rawReferenceId = req.params['referenceId'];
        const referenceId = Array.isArray(rawReferenceId) ? rawReferenceId[0] ?? '' : rawReferenceId ?? '';
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let aborted = false;

        req.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength;
          if (totalBytes > MAX_INTAKE_BUNDLE_BYTES) {
            aborted = true;
            res.status(413).json({ error: 'Payload exceeds 25 MiB limit.' });
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        req.on('end', () => {
          if (aborted) return;
          const payload = new Uint8Array(Buffer.concat(chunks));
          void intake.UploadEncryptedPayload(referenceId, payload).then((result) => {
            if (!result.accepted) {
              res.status(400).json(result);
            } else {
              res.status(200).json({ accepted: true, referenceId });
            }
          });
        });
      }
    );

    app.post(
      ApiRoute('/diagnostics/intake/v1/bundles/:referenceId/complete'),
      async (req: ExpressReq, res: ExpressRes) => {
        const intake = DiagnosticIntakeService.Instance;
        if (!intake.Enabled) {
          res.status(404).json({ error: 'Diagnostic intake is disabled on this instance.' });
          return;
        }
        const apiKey = req.headers['x-api-key'];
        const tokenStr = Array.isArray(apiKey) ? apiKey[0] : apiKey;
        if (!intake.ValidateIngestAuth(tokenStr)) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        const rawReferenceId = req.params['referenceId'];
        const referenceId = Array.isArray(rawReferenceId) ? rawReferenceId[0] ?? '' : rawReferenceId ?? '';
        const body = req.body as IntakeCompleteRequest;
        const result = await intake.CompleteBundleIntake(referenceId, body);
        if (result.status === 'rejected') {
          res.status(422).json(result);
        } else {
          res.status(200).json(result);
        }
      }
    );
  }
}
