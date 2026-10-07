/**
 * @fileoverview `RealtimeSessionVerificationService` — the production wiring of mid-session identity
 * verification: the real {@link VerificationPorts} (session read/write, email, event publish, audit)
 * behind a process-wide singleton the GraphQL resolver and the public verify route both call.
 *
 * The decisions live in `verificationWorkflow.ts`; this file is deliberately thin glue. See that
 * module's header for the operation table, what verification does and does not do, and the
 * concurrency contract; see `README.md` in this folder for the end-to-end flow and security model.
 *
 * The session-facing half of the ports (reads, trusted writes, event publish, audit — and the reasoning
 * for which identity performs which) is {@link SessionVerificationPortsBase}; this file adds the server
 * configuration to it.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import type { UserInfo } from '@memberjunction/core';
import { BaseSingleton, TrimTrailingSlashes } from '@memberjunction/global';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { UserCache } from '@memberjunction/generic-database-provider';
import { configInfo } from '../config.js';
import { ResolveConfiguredPrincipal } from '../auth/principals.js';
import { SessionVerificationPortsBase } from './SessionVerificationPortsBase.js';
import { ReadIdentityVerificationPolicyLayer } from './verificationPolicy.js';
import {
    RealtimeSessionVerificationWorkflow,
    type OutboundEmail,
    type PrincipalCaller,
    type VerificationOperationResult,
    type VerificationSettings,
} from './verificationWorkflow.js';

/** Purpose label for principal-resolution diagnostics. */
const PRINCIPAL_PURPOSE = 'RealtimeVerification';

/** The base URL emailed links are built from: explicit setting, else the server's public URL (same derivation magic links use). */
function resolvePublicBaseUrl(explicit: string | undefined): string | undefined {
    const candidate =
        explicit?.trim() || configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
    return candidate ? TrimTrailingSlashes(candidate) : undefined;
}

/** The shortest `hmacSecret` accepted. */
const MIN_HMAC_SECRET_LENGTH = 16;

/** True when the configured HMAC secret is long enough to protect the stored code hash. */
function hasUsableHmacSecret(secret: string | undefined): boolean {
    return !!secret && secret.length >= MIN_HMAC_SECRET_LENGTH;
}

/** Reads the live settings from server config. */
function readSettings(): VerificationSettings {
    const cfg = configInfo.realtime?.identityVerification;
    const limits = cfg?.rateLimits;
    return {
        // A feature that cannot send mail, or cannot protect the codes it issues, is not available — whatever `enabled` says.
        Enabled: !!cfg?.enabled && !!cfg.communicationProvider && hasUsableHmacSecret(cfg.hmacSecret),
        CodeHashKey: cfg?.hmacSecret ?? '',
        PolicyDefaults: ReadIdentityVerificationPolicyLayer(cfg?.policy),
        PublicBaseUrl: resolvePublicBaseUrl(cfg?.publicBaseUrl),
        RateLimits: {
            SendWindowMs: limits?.sendWindowMs ?? 3_600_000,
            PerIpSends: limits?.perIpSends ?? 10,
            PerEmailDomainSends: limits?.perEmailDomainSends ?? 30,
            PerEmailSends: limits?.perEmailSends ?? 3,
            CodeAttemptWindowMs: limits?.codeAttemptWindowMs ?? 600_000,
            PerSessionCodeAttempts: limits?.perSessionCodeAttempts ?? 10,
        },
    };
}

/**
 * The production ports: {@link SessionVerificationPortsBase} plus the server configuration — the settings
 * read from `realtime.identityVerification`, the configured service principal, and delivery through the
 * configured communication provider. Exported for tests and for hosts that want to compose their own
 * workflow around them; application code should use {@link RealtimeSessionVerificationService}.
 */
export class RuntimeVerificationPorts extends SessionVerificationPortsBase {
    public GetSettings(): VerificationSettings {
        return readSettings();
    }

    public async SendEmail(email: OutboundEmail): Promise<{ Success: boolean; ErrorMessage?: string }> {
        const cfg = configInfo.realtime?.identityVerification;
        const user = this.ResolveServiceUser();
        if (!cfg?.communicationProvider || !user) {
            return { Success: false, ErrorMessage: 'No communication provider or service principal is configured.' };
        }
        try {
            const engine = CommunicationEngine.Instance;
            await engine.Config(false, user);
            const message = new Message();
            // Rehearsal mode: the engine builds and LOGS the message but never delivers it (see the config docs).
            message.DryRun = cfg.deliveryMode === 'dry-run';
            message.From = cfg.fromAddress ?? '';
            message.To = email.To;
            message.Subject = email.Subject;
            message.Body = email.Text;
            message.HTMLBody = email.Html;
            const result = await engine.SendSingleMessage(cfg.communicationProvider, 'Email', message);
            return result?.Success ? { Success: true } : { Success: false, ErrorMessage: result?.Error ?? 'unknown provider error' };
        } catch (error) {
            return { Success: false, ErrorMessage: error instanceof Error ? error.message : String(error) };
        }
    }


    /** The configured service principal (see {@link SessionVerificationPortsBase}). */
    protected ResolveServiceUser(): UserInfo | null {
        const configured = configInfo.realtime?.identityVerification?.contextUserForVerification;
        return ResolveConfiguredPrincipal(configured, PRINCIPAL_PURPOSE) ?? UserCache.Instance.GetSystemUser() ?? null;
    }
}

/**
 * The process-wide verification service. Call it from the `RealtimeSessionVerificationResolver`
 * (authenticated principal) and the public `/realtime/verify` router (link capability).
 */
export class RealtimeSessionVerificationService extends BaseSingleton<RealtimeSessionVerificationService> {
    private workflow: RealtimeSessionVerificationWorkflow | undefined;

    protected constructor() {
        super();
    }

    /** The process-wide instance. */
    public static get Instance(): RealtimeSessionVerificationService {
        return super.getInstance<RealtimeSessionVerificationService>();
    }

    /** Whether verification is switched on and able to send mail. */
    public get IsEnabled(): boolean {
        return readSettings().Enabled;
    }

    /** See {@link RealtimeSessionVerificationWorkflow.RequestVerification}. */
    public RequestVerification(
        input: { AgentSessionID: string; Name: string; Email: string },
        caller: PrincipalCaller,
    ): Promise<VerificationOperationResult> {
        return this.getWorkflow().RequestVerification(input, caller);
    }

    /** See {@link RealtimeSessionVerificationWorkflow.SubmitCode}. */
    public SubmitCode(input: { AgentSessionID: string; Code: string }, caller: PrincipalCaller): Promise<VerificationOperationResult> {
        return this.getWorkflow().SubmitCode(input, caller);
    }

    /** See {@link RealtimeSessionVerificationWorkflow.RedeemLink}. */
    public RedeemLink(token: string, clientIp?: string): Promise<VerificationOperationResult> {
        return this.getWorkflow().RedeemLink(token, { Kind: 'link', ClientIp: clientIp });
    }

    /** See {@link RealtimeSessionVerificationWorkflow.GetStatus}. */
    public GetStatus(input: { AgentSessionID: string }, caller: PrincipalCaller): Promise<VerificationOperationResult> {
        return this.getWorkflow().GetStatus(input, caller);
    }

    /** The workflow is created on first use so its limiters pick up the loaded config. */
    private getWorkflow(): RealtimeSessionVerificationWorkflow {
        if (!this.workflow) {
            this.workflow = new RealtimeSessionVerificationWorkflow(new RuntimeVerificationPorts());
        }
        return this.workflow;
    }
}
