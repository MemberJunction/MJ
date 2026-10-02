/**
 * @fileoverview {@link SessionVerificationPortsBase} — the config-free half of the production
 * {@link VerificationPorts}: reading and writing a session, publishing `identity.verified`, and the
 * audit entry. Everything that depends on server configuration (the settings, the service principal,
 * the mail provider) is left abstract.
 *
 * The split exists so the DB-facing behaviour can be exercised with real sessions by anything that
 * cannot — or must not — load the server's configuration at import time (the integration-test bundle
 * subclasses it with captured email and a fixed principal). `RuntimeVerificationPorts`, in
 * `RealtimeSessionVerificationService.ts`, is the production subclass that supplies the configuration.
 *
 * ## Which identity performs the writes, and why
 *
 * Reads of the session for **authorization** run as the CALLER, so row-level security is the first gate
 * (a widget guest cannot even load another guest's session). Every **write** of server-decided state
 * runs as a service principal ({@link SessionVerificationPortsBase.ResolveServiceUser}), inside
 * `RunWithTrustedSessionConfigWrites`. That is not a convenience: the session owner can already `Update`
 * their own session row, which is exactly why `MJAIAgentSessionEntityServer` refuses owner writes to
 * `identityVerification` and `maxSessionDeadlineIso`. Server-decided state must be written by the server,
 * after the caller was authorized, in a scope no remote caller can enter. The verify link has no caller
 * identity at all (the token is the capability), so it needs the service principal for its reads too.
 *
 * @module @memberjunction/server/realtimeSessions
 */

import { LogError, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RunWithTrustedSessionConfigWrites } from '@memberjunction/core-entities-server';
import type { MJAuditLogEntity } from '@memberjunction/core-entities';
import type { IdentityVerifiedEventPayload } from '@memberjunction/ai-core-plus';
import { LoadSessionForAccess, type LoadedSessionForAccess } from './sessionAccess.js';
import { RealtimeSessionEventService } from './RealtimeSessionEventService.js';
import {
    type ConfigMutation,
    type ConfigMutationResult,
    type OutboundEmail,
    type SessionSnapshot,
    type VerificationAuditEntry,
    type VerificationCaller,
    type VerificationPorts,
    type VerificationSettings,
} from './verificationWorkflow.js';

/** The seeded audit-log type (see `metadata/audit-log-types/.realtime-session-audit-types.json`). */
export const REALTIME_IDENTITY_VERIFIED_AUDIT_TYPE = 'Realtime Identity Verified';

const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';
const SESSION_ENTITY_NAME = 'MJ: AI Agent Sessions';


/** Reduces a loaded session to the snapshot the workflow reasons about. */
function toSnapshot(loaded: LoadedSessionForAccess): SessionSnapshot {
    const { Session } = loaded;
    return {
        AgentSessionID: Session.ID,
        OwnerUserID: Session.UserID,
        ConversationExternalID: loaded.ConversationExternalID,
        Status: Session.Status,
        ConfigRaw: Session.Config_,
        // `__mj_CreatedAt` is the row's creation instant — i.e. the session start. It is read-only and
        // set by the database, so a client cannot move it.
        StartedAtMs: Session.__mj_CreatedAt instanceof Date ? Session.__mj_CreatedAt.getTime() : Date.now(),
    };
}


/**
 * The session-facing {@link VerificationPorts}, minus configuration. Subclasses supply the settings, the
 * service principal and the mail delivery.
 */
export abstract class SessionVerificationPortsBase implements VerificationPorts {
    /** The live settings. */
    public abstract GetSettings(): VerificationSettings;

    /** Delivers an email. Must not throw; reports failure in the result. */
    public abstract SendEmail(email: OutboundEmail): Promise<{ Success: boolean; ErrorMessage?: string }>;

    /** The principal state writes (and the link caller's reads) run as; null when none is available. */
    protected abstract ResolveServiceUser(): UserInfo | null;

    public Now(): number {
        return Date.now();
    }

    public async LoadSession(agentSessionId: string, caller: VerificationCaller): Promise<SessionSnapshot | null> {
        const reader = this.readerFor(caller);
        if (!reader) {
            return null;
        }
        const loaded = await LoadSessionForAccess(agentSessionId, reader.User, reader.Provider);
        return loaded ? toSnapshot(loaded) : null;
    }

    public async MutateSessionConfig<T>(
        agentSessionId: string,
        caller: VerificationCaller,
        mutate: ConfigMutation<T>,
    ): Promise<ConfigMutationResult<T>> {
        const writer = this.writerFor(caller);
        if (!writer) {
            return { Persisted: false, ErrorMessage: 'No service principal is available to record verification state.' };
        }
        try {
            const loaded = await LoadSessionForAccess(agentSessionId, writer.User, writer.Provider);
            if (!loaded) {
                return { Persisted: false, ErrorMessage: `Session ${agentSessionId} could not be read.` };
            }
            const session = toSnapshot(loaded);
            const { NextConfigRaw, Outcome } = mutate(session);
            if (NextConfigRaw === null) {
                return { Session: session, Outcome, Persisted: false };
            }
            loaded.Session.Config_ = NextConfigRaw;
            const saved = await RunWithTrustedSessionConfigWrites(() => loaded.Session.Save());
            if (!saved) {
                const detail = loaded.Session.LatestResult?.CompleteMessage ?? 'unknown error';
                LogError(`RealtimeSessionVerification: saving session ${agentSessionId} failed: ${detail}`);
                return { Session: session, Outcome, Persisted: false, ErrorMessage: detail };
            }
            return { Session: session, Outcome, Persisted: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RealtimeSessionVerification: updating session ${agentSessionId} threw: ${message}`);
            return { Persisted: false, ErrorMessage: message };
        }
    }

    public PublishVerified(
        routing: { AgentSessionID: string; OwnerUserID: string; ScopeKey: string | null },
        payload: IdentityVerifiedEventPayload,
    ): { Success: boolean; ErrorMessage?: string } {
        return RealtimeSessionEventService.Instance.PublishRouted(routing, 'identity.verified', payload);
    }

    public async WriteAudit(entry: VerificationAuditEntry): Promise<void> {
        const writer = this.ResolveServiceUser();
        const provider = Metadata.Provider; // global-provider-ok: server-side audit write under the server's single default provider
        const type = provider?.AuditLogTypes?.find((t) => t.Name?.trim().toLowerCase() === REALTIME_IDENTITY_VERIFIED_AUDIT_TYPE.toLowerCase());
        const sessionEntityId = provider?.EntityByName(SESSION_ENTITY_NAME)?.ID;
        if (!writer || !type) {
            // The audit type ships as metadata (a release seed); without it, fall back to the server log so
            // the verification is still recorded somewhere durable-ish rather than silently unaudited.
            LogError(
                `RealtimeSessionVerification: audit entry not written for session ${entry.AgentSessionID} ` +
                    `(${writer ? `audit log type '${REALTIME_IDENTITY_VERIFIED_AUDIT_TYPE}' is not seeded` : 'no service principal'}): ` +
                    `${entry.Email} via ${entry.Method}.`,
            );
            return;
        }
        try {
            const row = await provider.GetEntityObject<MJAuditLogEntity>(AUDIT_LOG_ENTITY, writer);
            row.NewRecord();
            row.UserID = entry.OwnerUserID;
            row.AuditLogTypeID = type.ID;
            row.Status = 'Success';
            row.EntityID = sessionEntityId ?? null;
            row.RecordID = entry.AgentSessionID;
            row.Description = `Realtime session verified ${entry.Email} by ${entry.Method === 'link' ? 'emailed link' : 'typed code'}.`;
            row.Details = JSON.stringify({
                email: entry.Email,
                method: entry.Method,
                ipAddress: entry.ClientIp ?? null,
                maxSessionDeadlineIso: entry.MaxSessionDeadlineIso ?? null,
            });
            if (!(await row.Save())) {
                LogError(`RealtimeSessionVerification: audit row save failed for session ${entry.AgentSessionID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (error) {
            LogError(`RealtimeSessionVerification: audit write threw for session ${entry.AgentSessionID}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** The identity + provider an authorization read runs under. */
    private readerFor(caller: VerificationCaller): { User: UserInfo; Provider: IMetadataProvider } | null {
        if (caller.Kind === 'principal') {
            return { User: caller.ContextUser, Provider: caller.Provider };
        }
        const user = this.ResolveServiceUser();
        return user ? { User: user, Provider: Metadata.Provider } : null; // global-provider-ok: public verify route has no request-scoped provider
    }

    /** The identity + provider a state write runs under: always the service principal. */
    private writerFor(caller: VerificationCaller): { User: UserInfo; Provider: IMetadataProvider } | null {
        const user = this.ResolveServiceUser();
        if (!user) {
            return null;
        }
        return { User: user, Provider: caller.Kind === 'principal' ? caller.Provider : Metadata.Provider }; // global-provider-ok: public verify route has no request-scoped provider
    }
}
