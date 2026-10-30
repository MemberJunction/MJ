/**
 * @fileoverview Event-Driven Wake Trigger Service for Chief of Staff & Autonomous Agents.
 *
 * Implements Stage 5 Deliverable 2 of the Chief of Staff architecture:
 * 1. **Approval & Inter-Agent Resolution / Arrival Wake**:
 *    - When an action-created `MJ: AI Agent Requests` record (`OriginatingAgentRunID == null` and
 *      `OriginatingTaskID == null`) transitions from `'Requested'` to `'Approved' | 'Rejected' | 'Responded'`,
 *      schedules an immediate `AgentWake` routine (`MJ: User Routines` with `RoutineType = 'AgentWake'`,
 *      `NextRunAt = now`) for the owning user's agent (or the sender user's Chief of Staff on a
 *      `InterAgentCoordinationEnvelope` resolution) with the resolved request context in `resumeState`.
 *    - When a new peer-to-peer `InterAgent` request (`interAgentCoordination: true`) is created with
 *      `Status = 'Requested'`, schedules an immediate `AgentWake` routine for the target user's Chief of Staff
 *      (when their `MJ: AI Agent User Policies` row is active and `AllowInterAgentCoordination !== false`).
 * 2. **Inbound Utility Mailbox Wake**:
 *    - Routes inbound emails addressed to an active `MJ: AI Bridge Agent Identities` mailbox (`IdentityType = 'Email'`,
 *      e.g., `cos@company.com`) from a verified internal MJ User (`senderEmail === user.Email`) to schedule an
 *      immediate `AgentWake` routine in the verified user's `contextUser` scope with the inbound email payload
 *      in `resumeState`. Rejects unverified/external senders.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJUserRoutineEntity,
    MJUserRoutineEntity_IRoutineWakeConfiguration,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { UserCache } from '@memberjunction/generic-database-provider';

/**
 * Type of `resumeState` derived directly from `MJUserRoutineEntity_IRoutineWakeConfiguration`.
 */
export type AgentWakeResumeState = NonNullable<MJUserRoutineEntity_IRoutineWakeConfiguration['resumeState']>;

/**
 * Envelope shape stored in `MJAIAgentRequestEntity.Comments` by `Send Inter-Agent Request`.
 */
export interface InterAgentCoordinationEnvelopeShape {
    interAgentCoordination?: boolean;
    /** Written by `InterAgentCoordinationEnvelope` (`Send Inter-Agent Request`). */
    protocolVersion?: string;
    /** @deprecated older envelopes; prefer `protocolVersion`. */
    envelopeVersion?: string;
    senderUserID?: string;
    senderUserName?: string;
    senderUserEmail?: string;
    senderAgentID?: string;
    targetUserID?: string;
    targetUserName?: string;
    targetUserEmail?: string;
    /** `InterAgentCoS` is the pre-rename value still present on in-flight rows; treated exactly like `InterAgent`. */
    deliveryMode?: 'InterAgent' | 'InterAgentCoS' | 'DirectUserRequest';
    subject?: string;
    /** Message body as written by `InterAgentCoordinationEnvelope`. */
    message?: string;
    /** @deprecated older envelopes; prefer `message`. */
    messageBody?: string;
    workstreamKey?: string | null;
    createdAt?: string;
}

/**
 * Optional configuration stored in `MJAIBridgeAgentIdentityEntity.Configuration` for utility mailbox routing.
 */
export interface UtilityMailboxIdentityConfiguration {
    allowedUserID?: string;
    allowedEmailDomains?: string[];
    defaultWorkstreamKey?: string;
}

/**
 * Input for routing an inbound email sent to an agent utility mailbox (e.g. `cos@company.com`).
 */
export interface InboundUtilityMailboxEmailInput {
    /** Recipient mailbox address (e.g. `cos@company.com`). */
    toAddress: string;
    /** Verified sender email address (must match an active internal MJ User's `Email`). */
    fromAddress: string;
    /** Email subject line. */
    subject: string;
    /** Plain-text preview or summary of the email body. */
    bodyPreview?: string;
    /** External provider message ID for deduplication/reference. */
    messageID?: string;
    /** ISO-8601 timestamp when the message was received. */
    receivedAtISO?: string;
    /** Optional bridge provider ID to scope the identity lookup. */
    providerID?: string;
    /** Optional workstream key override (defaults to `'inbound-utility-mailbox'`). */
    workstreamKey?: string;
    /** System or service user context used for initial lookup before switching to the verified sender's UserInfo. */
    systemContextUser: UserInfo;
    /** Optional metadata provider (defaults to `new Metadata()`). */
    metadataProvider?: IMetadataProvider;
    /** Optional pre-loaded bridge identities (for unit testing or cached `AIBridgeEngineBase` injection). */
    identities?: MJAIBridgeAgentIdentityEntity[];
    /** Optional pre-loaded MJ users (for unit testing or `UserCache` injection). */
    users?: UserInfo[];
    /** Optional clock override for deterministic tests. */
    now?: Date;
}

/**
 * Result codes returned by `AgentWakeTriggerService` operations.
 */
export type AgentWakeTriggerResultCode =
    | 'WAKE_SCHEDULED'
    | 'SKIPPED_NOT_APPLICABLE'
    | 'POLICY_DENIED'
    | 'IDENTITY_NOT_FOUND'
    | 'UNVERIFIED_EXTERNAL_SENDER'
    | 'SENDER_NOT_AUTHORIZED_FOR_IDENTITY'
    | 'SAVE_FAILED';

/**
 * Outcome of an event-driven wake trigger evaluation.
 */
export interface AgentWakeTriggerResult {
    triggered: boolean;
    resultCode: AgentWakeTriggerResultCode;
    reason: string;
    routineID: string | null;
    targetUserID: string | null;
    targetAgentID: string | null;
    workstreamKey: string | null;
    nextRunAtISO: string | null;
}

/**
 * Service that evaluates and schedules event-driven `AgentWake` routines on `MJ: User Routines`.
 */
interface ImmediateWakeRoutineParams {
    targetUserID: string;
    targetAgentID: string;
    /** The agent's name (from the user's policy) for the routine name; null falls back to "AgentWake". */
    targetAgentName: string | null;
    workstreamKey: string;
    wakeReason: string;
    resumeState: AgentWakeResumeState;
    contextUser: UserInfo;
    metadataProvider?: IMetadataProvider;
    now: Date;
}

export class AgentWakeTriggerService extends BaseSingleton<AgentWakeTriggerService> {
    public constructor() {
        super();
    }

    public static get Instance(): AgentWakeTriggerService {
        return AgentWakeTriggerService.getInstance<AgentWakeTriggerService>();
    }

    /**
     * Evaluates an `MJAIAgentRequestEntity` whose `Status` just transitioned from `'Requested'`
     * to `'Approved' | 'Rejected' | 'Responded'` (when `OriginatingAgentRunID == null` and
     * `OriginatingTaskID == null`) and schedules an immediate `AgentWake` routine for the
     * appropriate user's agent.
     *
     * - For peer-to-peer `InterAgent` requests (`interAgentCoordination: true` in `Comments`),
     *   wakes the **sender user's** Chief of Staff (`envelope.senderUserID`) with the peer's response.
     * - For standard action-created approval requests (Calendar, Email, Outbound Call),
     *   wakes the **request owner's** agent (`request.RequestForUserID`) with the approval outcome.
     */
    public async TriggerWakeOnAgentRequestResolution(
        request: MJAIAgentRequestEntity,
        contextUser: UserInfo | undefined,
        metadataProvider?: IMetadataProvider,
        now: Date = new Date()
    ): Promise<AgentWakeTriggerResult> {
        if (!contextUser) {
            return this.notTriggered('SKIPPED_NOT_APPLICABLE', 'No contextUser available for agent request resolution wake.');
        }

        if (request.OriginatingAgentRunID != null || request.OriginatingTaskID != null || !request.AgentID) {
            return this.notTriggered(
                'SKIPPED_NOT_APPLICABLE',
                'Request has OriginatingAgentRunID, OriginatingTaskID, or no AgentID; handled by standard resumption.'
            );
        }

        const resolvedStatuses: ReadonlyArray<MJAIAgentRequestEntity['Status']> = ['Approved', 'Rejected', 'Responded'];
        if (!resolvedStatuses.includes(request.Status)) {
            return this.notTriggered('SKIPPED_NOT_APPLICABLE', `Request status "${request.Status}" is not a resolved status.`);
        }

        const envelope = this.parseInterAgentEnvelope(request.Comments);
        const isInterAgent = envelope?.interAgentCoordination === true && Boolean(envelope.senderUserID);

        const targetUserID = isInterAgent
            ? envelope!.senderUserID!
            : request.RequestForUserID || request.ResponseByUserID || contextUser.ID;
        const targetAgentID = isInterAgent
            ? envelope!.senderAgentID || request.AgentID
            : request.AgentID;
        const workstreamKey = isInterAgent
            ? envelope!.workstreamKey?.trim() || 'inter-agent-resolution'
            : 'approval-resolution';

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            targetAgentID,
            targetUserID,
            contextUser
        );
        if (policy && (policy.Status === 'Disabled' || policy.Status === 'Paused')) {
            return this.notTriggered(
                'POLICY_DENIED',
                `Target user ${targetUserID} has ${policy.Status} policy for agent ${targetAgentID}.`
            );
        }

        const parsedResponseData = request.ResponseData
            ? SafeJSONParse<AgentWakeResumeState>(request.ResponseData)
            : null;
        const parsedComments = request.Comments
            ? SafeJSONParse<AgentWakeResumeState>(request.Comments)
            : null;

        const wakeReason = isInterAgent
            ? `Inter-agent request "${envelope?.subject || request.ID}" was ${request.Status.toLowerCase()}.`
            : `Approval request ${request.ID} was ${request.Status.toLowerCase()}.`;

        const resumeState: AgentWakeResumeState = isInterAgent
            ? {
                  triggerType: 'InterAgentRequestResolved',
                  requestID: request.ID,
                  status: request.Status,
                  subject: envelope?.subject ?? null,
                  response: request.Response ?? null,
                  responseData: parsedResponseData,
                  respondedByUserID: request.ResponseByUserID ?? envelope?.targetUserID ?? null,
                  respondedAt: (request.RespondedAt ?? now).toISOString(),
                  targetUserID: envelope?.targetUserID ?? request.RequestForUserID ?? null,
                  targetUserName: envelope?.targetUserName ?? null,
                  workstreamKey,
              }
            : {
                  triggerType: 'AgentRequestResolution',
                  requestID: request.ID,
                  status: request.Status,
                  request: request.Request,
                  response: request.Response ?? null,
                  responseData: parsedResponseData,
                  commentsData: parsedComments,
                  respondedByUserID: request.ResponseByUserID ?? null,
                  respondedAt: (request.RespondedAt ?? now).toISOString(),
                  workstreamKey,
              };

        return this.upsertImmediateWakeRoutine({
            targetUserID,
            targetAgentID,
            targetAgentName: policy?.Agent ?? null,
            workstreamKey,
            wakeReason,
            resumeState,
            contextUser,
            metadataProvider,
            now,
        });
    }

    /**
     * Evaluates a newly created `MJAIAgentRequestEntity` (`Status === 'Requested'`) and, when it
     * carries a peer-to-peer `InterAgent` envelope (`interAgentCoordination: true`,
     * `deliveryMode === 'InterAgent'`), schedules an immediate `AgentWake` routine for the
     * target user's Chief of Staff so it can triage the incoming request.
     */
    public async TriggerWakeOnIncomingInterAgentRequest(
        request: MJAIAgentRequestEntity,
        contextUser: UserInfo | undefined,
        metadataProvider?: IMetadataProvider,
        now: Date = new Date()
    ): Promise<AgentWakeTriggerResult> {
        if (!contextUser || !request.AgentID || request.Status !== 'Requested') {
            return this.notTriggered('SKIPPED_NOT_APPLICABLE', 'Request is not a newly requested agent request.');
        }

        const envelope = this.parseInterAgentEnvelope(request.Comments);
        if (!envelope || envelope.interAgentCoordination !== true || envelope.deliveryMode === 'DirectUserRequest') {
            return this.notTriggered('SKIPPED_NOT_APPLICABLE', 'Request is not an InterAgent coordination request.');
        }

        const targetUserID = envelope.targetUserID || request.RequestForUserID;
        if (!targetUserID) {
            return this.notTriggered('SKIPPED_NOT_APPLICABLE', 'No targetUserID found on InterAgent request.');
        }

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            request.AgentID,
            targetUserID,
            contextUser
        );
        if (!policy || policy.Status !== 'Active' || policy.AllowInterAgentCoordination === false) {
            return this.notTriggered(
                'POLICY_DENIED',
                `Target user ${targetUserID} does not have an active policy with AllowInterAgentCoordination enabled.`
            );
        }

        const workstreamKey = envelope.workstreamKey?.trim() || 'inter-agent-inbox';
        const wakeReason = `Incoming inter-agent request from ${envelope.senderUserName || 'colleague'}: "${envelope.subject || 'Coordination request'}"`;
        const resumeState: AgentWakeResumeState = {
            triggerType: 'InterAgentRequestReceived',
            requestID: request.ID,
            senderUserID: envelope.senderUserID ?? null,
            senderUserName: envelope.senderUserName ?? null,
            senderAgentID: envelope.senderAgentID ?? request.AgentID,
            subject: envelope.subject ?? null,
            messageBody: envelope.message ?? envelope.messageBody ?? request.Request,
            workstreamKey,
        };

        return this.upsertImmediateWakeRoutine({
            targetUserID,
            targetAgentID: request.AgentID,
            targetAgentName: policy.Agent ?? null,
            workstreamKey,
            wakeReason,
            resumeState,
            contextUser,
            metadataProvider,
            now,
        });
    }

    /**
     * Routes an inbound email sent to an agent utility mailbox (e.g., `cos@company.com`) registered
     * in `MJ: AI Bridge Agent Identities` (`IdentityType = 'Email'`, `IsActive = true`).
     *
     * Security enforcement:
     * 1. Recipient address (`toAddress`) must match an active `Email` bridge identity.
     * 2. Sender address (`fromAddress`) must match an active internal MJ User (`Email === fromAddress`
     *    case-insensitively). External/unverified senders are rejected.
     * 3. If the bridge identity's `Configuration` pins `allowedUserID`, `senderUser.ID` must match it.
     * 4. If the sender has an `MJ: AI Agent User Policies` row for the agent, it must not be
     *    `Disabled` or `Paused`, and `EmailChannelMode` must not be `'Disabled'`.
     * 5. The resulting `AgentWake` routine is saved in the verified `senderUser`'s `contextUser` scope.
     */
    public async RouteInboundUtilityMailboxWake(
        input: InboundUtilityMailboxEmailInput
    ): Promise<AgentWakeTriggerResult> {
        const now = input.now ?? new Date();
        const md: IMetadataProvider = input.metadataProvider ?? Metadata.Provider;
        const normalizedTo = (input.toAddress ?? '').trim().toLowerCase();
        const normalizedFrom = (input.fromAddress ?? '').trim().toLowerCase();

        if (!normalizedTo || !normalizedFrom) {
            return this.notTriggered('IDENTITY_NOT_FOUND', 'Both toAddress and fromAddress are required.');
        }

        // 1. Resolve active Email bridge identity matching toAddress
        const identity = await this.resolveEmailBridgeIdentity(
            normalizedTo,
            input.providerID,
            input.identities,
            input.systemContextUser,
            md
        );
        if (!identity) {
            return this.notTriggered(
                'IDENTITY_NOT_FOUND',
                `No active Email bridge identity found for utility mailbox "${input.toAddress}".`
            );
        }

        // 2. Verify sender is an active internal MJ User (sender === user.Email)
        const senderUser = await this.resolveVerifiedInternalSender(
            normalizedFrom,
            input.users,
            input.systemContextUser
        );
        if (!senderUser) {
            LogStatus(
                `[AgentWakeTriggerService] Rejected inbound utility mailbox email to ${input.toAddress} from unverified/external sender "${input.fromAddress}".`
            );
            return this.notTriggered(
                'UNVERIFIED_EXTERNAL_SENDER',
                `Sender "${input.fromAddress}" does not match an active internal MJ user.`
            );
        }

        // 3. Enforce optional identity-level Configuration constraints (e.g., allowedUserID / allowedEmailDomains)
        const identityConfig = identity.Configuration
            ? SafeJSONParse<UtilityMailboxIdentityConfiguration>(identity.Configuration)
            : null;
        if (identityConfig?.allowedUserID && !UUIDsEqual(identityConfig.allowedUserID, senderUser.ID)) {
            return this.notTriggered(
                'SENDER_NOT_AUTHORIZED_FOR_IDENTITY',
                `Sender user ${senderUser.ID} is not authorized for pinned bridge identity ${identity.ID}.`
            );
        }
        if (Array.isArray(identityConfig?.allowedEmailDomains) && identityConfig.allowedEmailDomains.length > 0) {
            const senderDomain = normalizedFrom.split('@')[1] ?? '';
            const domainAllowed = identityConfig.allowedEmailDomains.some(
                (d) => d.trim().toLowerCase() === senderDomain
            );
            if (!domainAllowed) {
                return this.notTriggered(
                    'SENDER_NOT_AUTHORIZED_FOR_IDENTITY',
                    `Sender domain "${senderDomain}" is not in allowedEmailDomains for identity ${identity.ID}.`
                );
            }
        }

        // 4. Enforce user's Chief of Staff / Agent policy in senderUser's context
        const policy: MJAIAgentUserPolicyEntity | null =
            await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
                identity.AgentID,
                senderUser.ID,
                senderUser
            );
        if (policy) {
            if (policy.Status === 'Disabled' || policy.Status === 'Paused') {
                return this.notTriggered(
                    'POLICY_DENIED',
                    `User ${senderUser.Email} has ${policy.Status} policy for agent ${identity.AgentID}.`
                );
            }
            if (policy.EmailChannelMode === 'Disabled') {
                return this.notTriggered(
                    'POLICY_DENIED',
                    `User ${senderUser.Email} has EmailChannelMode="Disabled" for agent ${identity.AgentID}.`
                );
            }
        }

        // 5. Schedule immediate AgentWake routine in senderUser's contextUser scope
        const workstreamKey =
            input.workstreamKey?.trim() ||
            identityConfig?.defaultWorkstreamKey?.trim() ||
            'inbound-utility-mailbox';
        const wakeReason = `Inbound utility mailbox email from ${senderUser.Email}: "${input.subject}"`;
        const resumeState: AgentWakeResumeState = {
            triggerType: 'InboundUtilityMailboxEmail',
            identityID: identity.ID,
            utilityMailboxAddress: identity.IdentityValue,
            senderUserID: senderUser.ID,
            senderEmail: senderUser.Email,
            messageID: input.messageID ?? null,
            subject: input.subject,
            bodyPreview: input.bodyPreview ?? '',
            receivedAt: input.receivedAtISO ?? now.toISOString(),
            workstreamKey,
        };

        return this.upsertImmediateWakeRoutine({
            targetUserID: senderUser.ID,
            targetAgentID: identity.AgentID,
            targetAgentName: policy?.Agent ?? null,
            workstreamKey,
            wakeReason,
            resumeState,
            contextUser: senderUser,
            metadataProvider: md,
            now,
        });
    }

    private parseInterAgentEnvelope(comments: string | null): InterAgentCoordinationEnvelopeShape | null {
        if (!comments || !comments.trim().startsWith('{')) {
            return null;
        }
        const parsed = SafeJSONParse<InterAgentCoordinationEnvelopeShape>(comments);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed;
    }

    private async resolveEmailBridgeIdentity(
        normalizedToAddress: string,
        providerID: string | undefined,
        injectedIdentities: MJAIBridgeAgentIdentityEntity[] | undefined,
        contextUser: UserInfo,
        md: IMetadataProvider
    ): Promise<MJAIBridgeAgentIdentityEntity | null> {
        if (injectedIdentities) {
            const match = injectedIdentities.find(
                (i) =>
                    i.IsActive === true &&
                    i.IdentityType === 'Email' &&
                    (i.IdentityValue ?? '').trim().toLowerCase() === normalizedToAddress &&
                    (providerID === undefined || UUIDsEqual(i.ProviderID, providerID))
            );
            return match ?? null;
        }

        const rv = RunView.FromMetadataProvider(md);
        const safeEmail = EscapeSQLString(normalizedToAddress);
        const providerClause = providerID ? ` AND ProviderID='${EscapeSQLString(providerID)}'` : '';
        const res = await rv.RunView<MJAIBridgeAgentIdentityEntity>(
            {
                EntityName: 'MJ: AI Bridge Agent Identities',
                ExtraFilter: `IsActive=1 AND IdentityType='Email' AND LOWER(IdentityValue)='${safeEmail}'${providerClause}`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (res.Success && res.Results.length > 0) {
            return res.Results[0];
        }
        return null;
    }

    private async resolveVerifiedInternalSender(
        normalizedFromAddress: string,
        injectedUsers: UserInfo[] | undefined,
        contextUser: UserInfo
    ): Promise<UserInfo | null> {
        if (injectedUsers) {
            const match = injectedUsers.find(
                (u) => u.IsActive !== false && (u.Email ?? '').trim().toLowerCase() === normalizedFromAddress
            );
            return match ?? null;
        }

        if (
            contextUser.IsActive !== false &&
            (contextUser.Email ?? '').trim().toLowerCase() === normalizedFromAddress
        ) {
            return contextUser;
        }

        // UserCache returns a fully hydrated UserInfo (roles included) and falls back to the database
        // on a miss. A hand-built UserInfo with no roles cannot pass the entity permission checks that
        // `routine.Save()` and the policy lookup run as this user.
        const cached = await UserCache.Instance.FindUser({ Email: normalizedFromAddress });
        if (cached && cached.IsActive !== false) {
            return cached;
        }
        return null;
    }

    /**
     * `MJ: User Routines` are private to their owner: the entity server rejects a save by a non-Owner-type
     * user for a routine they do not own, and row-level security hides other users' rows from the lookup.
     * A wake for another user (inter-agent arrival or resolution) therefore runs as the scheduler's system
     * user, which the ownership gate exempts. A wake for the caller's own agent stays in the caller's scope.
     */
    private resolveRoutineSaveUser(targetUserID: string, contextUser: UserInfo): UserInfo {
        if (UUIDsEqual(contextUser.ID, targetUserID) || contextUser.Type?.trim().toLowerCase() === 'owner') {
            return contextUser;
        }
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            LogStatus(
                `[AgentWakeTriggerService] No system user in UserCache; saving cross-user wake routine as ${contextUser.ID}, which the ownership gate may reject.`
            );
            return contextUser;
        }
        return systemUser;
    }

    /**
     * Events that must reach the agent on the next wake. While a routine is still waiting for the dispatcher
     * (`Status = 'Active'` with a `NextRunAt`), a new event is appended to the queue already stored in its
     * `resumeState.pendingEvents` rather than replacing it, so two approvals clicked within one sweep both
     * arrive. Once the dispatcher has claimed the routine (`NextRunAt` nulled, later `Disabled`), the queue
     * starts over. The same request in the same status is queued once.
     */
    private buildPendingEvents(
        routine: MJUserRoutineEntity,
        existingConfig: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration>,
        newEvent: AgentWakeResumeState
    ): AgentWakeResumeState[] {
        const isUnclaimedPending = routine.Status === 'Active' && routine.NextRunAt != null && !!routine.ID;
        const prior = isUnclaimedPending ? this.readPendingEvents(existingConfig.resumeState) : [];
        const key = this.wakeEventKey(newEvent);
        const deduped = prior.filter((e) => this.wakeEventKey(e) !== key);
        return [...deduped, newEvent];
    }

    private readPendingEvents(resumeState: Record<string, unknown> | undefined): AgentWakeResumeState[] {
        if (!resumeState) {
            return [];
        }
        const queued = resumeState['pendingEvents'];
        if (Array.isArray(queued)) {
            return queued.filter((e): e is AgentWakeResumeState => typeof e === 'object' && e !== null);
        }
        // A row written before the queue existed holds a single event at the top level.
        return typeof resumeState['triggerType'] === 'string' ? [resumeState] : [];
    }

    private wakeEventKey(event: AgentWakeResumeState): string {
        const id = event['requestID'] ?? event['messageID'] ?? '';
        return `${String(event['triggerType'] ?? '')}:${String(id)}:${String(event['status'] ?? '')}`.toLowerCase();
    }

    private buildCoalescedWakeReason(workstreamKey: string, latestReason: string, pendingEvents: AgentWakeResumeState[]): string {
        if (pendingEvents.length <= 1) {
            return latestReason;
        }
        const lines = pendingEvents.map((e, i) => `${i + 1}. ${this.describeWakeEvent(e)}`);
        return `${pendingEvents.length} events require action in workstream "${workstreamKey}" (all listed in resumeState.pendingEvents):\n${lines.join('\n')}`;
    }

    private describeWakeEvent(event: AgentWakeResumeState): string {
        const trigger = String(event['triggerType'] ?? 'Event');
        const id = event['requestID'] ?? event['messageID'];
        const status = event['status'] ? ` ${String(event['status'])}` : '';
        const subject = event['subject'] ?? event['request'];
        const subjectText = typeof subject === 'string' && subject.trim().length > 0 ? ` — ${subject.trim().slice(0, 120)}` : '';
        return `${trigger}${status}${id ? ` (${String(id)})` : ''}${subjectText}`;
    }

    /**
     * In-process write chains keyed by `${targetUserID}:${targetAgentID}:${workstreamKey}` so two
     * events for the same routine arriving in the same Node process never both miss the existing
     * row (duplicate OneShot routines) or overwrite each other's `pendingEvents`. Same pattern as
     * `CredentialEngine.enqueueCredentialWrite`. Cross-process races are not covered here; the
     * dispatcher coalesces on claim.
     */
    private _wakeWriteChains: Map<string, Promise<void>> = new Map();

    private wakeWriteKey(targetUserID: string, targetAgentID: string, workstreamKey: string): string {
        return `${targetUserID}:${targetAgentID}:${workstreamKey}`.toLowerCase();
    }

    private enqueueWakeWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
        const prev = this._wakeWriteChains.get(key) ?? Promise.resolve();
        const next = prev.then(operation, operation);
        // The chain link swallows the rejection (it surfaces to this call's caller via `next`) so an
        // un-awaited chain never emits an unhandled rejection, and cleans the map up once it drains.
        const link: Promise<void> = next.then(
            () => undefined,
            () => undefined
        ).finally(() => {
            if (this._wakeWriteChains.get(key) === link) {
                this._wakeWriteChains.delete(key);
            }
        });
        this._wakeWriteChains.set(key, link);
        return next;
    }

    private upsertImmediateWakeRoutine(params: ImmediateWakeRoutineParams): Promise<AgentWakeTriggerResult> {
        const key = this.wakeWriteKey(params.targetUserID, params.targetAgentID, params.workstreamKey);
        return this.enqueueWakeWrite(key, () => this.upsertImmediateWakeRoutineUnlocked(params));
    }

    private async upsertImmediateWakeRoutineUnlocked(params: ImmediateWakeRoutineParams): Promise<AgentWakeTriggerResult> {
        try {
            const md: IMetadataProvider = params.metadataProvider ?? Metadata.Provider;
            const saveUser = this.resolveRoutineSaveUser(params.targetUserID, params.contextUser);
            const rv = RunView.FromMetadataProvider(md);
            const safeUserId = EscapeSQLString(params.targetUserID);
            const safeAgentId = EscapeSQLString(params.targetAgentID);

            const existingResult = await rv.RunView<MJUserRoutineEntity>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${safeUserId}' AND RoutineType='AgentWake' AND TargetType='Agent' AND TargetID='${safeAgentId}'`,
                    OrderBy: '__mj_UpdatedAt DESC',
                    MaxRows: 25,
                    ResultType: 'entity_object',
                },
                saveUser
            );

            let routine: MJUserRoutineEntity | null = null;
            if (existingResult.Success && existingResult.Results.length > 0) {
                routine =
                    existingResult.Results.find((r) => {
                        const cfg =
                            r.WakeConfigurationObject ??
                            (r.WakeConfiguration
                                ? SafeJSONParse<MJUserRoutineEntity_IRoutineWakeConfiguration>(r.WakeConfiguration)
                                : null);
                        return (cfg?.workstreamKey ?? 'default').toLowerCase() === params.workstreamKey.toLowerCase();
                    }) ?? null;
            }

            if (!routine) {
                routine = await md.GetEntityObject<MJUserRoutineEntity>(
                    'MJ: User Routines',
                    saveUser
                );
                routine.NewRecord();
                routine.UserID = params.targetUserID;
                // Same name Schedule Next Agent Wake gives a routine, so all of an agent's wakes read alike.
                routine.Name = params.targetAgentName
                    ? `${params.targetAgentName} — Wake (${params.workstreamKey})`
                    : `AgentWake (${params.workstreamKey})`;
                routine.RoutineType = 'AgentWake';
                routine.ScheduleMode = 'OneShot';
                routine.TargetType = 'Agent';
                routine.TargetID = params.targetAgentID;
                routine.CronExpression = null;
                routine.Timezone = 'UTC';
            }

            const existingConfig: Partial<MJUserRoutineEntity_IRoutineWakeConfiguration> =
                routine.WakeConfigurationObject ?? {};
            const pendingEvents = this.buildPendingEvents(routine, existingConfig, params.resumeState);
            const wakeReason = this.buildCoalescedWakeReason(params.workstreamKey, params.wakeReason, pendingEvents);
            // Latest event stays at the top level for consumers that predate the queue; the full list rides alongside.
            const coalescedResumeState: AgentWakeResumeState = { ...params.resumeState, pendingEvents };
            const updatedConfig: MJUserRoutineEntity_IRoutineWakeConfiguration = {
                ...existingConfig,
                workstreamKey: params.workstreamKey,
                wakeReason,
                resumeState: coalescedResumeState,
            };

            routine.Status = 'Active';
            routine.NextRunAt = params.now;
            routine.InitialMessage = `[AgentWake:${params.workstreamKey}] Resume workstream "${params.workstreamKey}": ${wakeReason}`;
            routine.StartingPayload = JSON.stringify({
                workstreamKey: params.workstreamKey,
                wakeReason,
                resumeState: coalescedResumeState,
            });
            routine.WakeConfigurationObject = updatedConfig;
            routine.Description = wakeReason;

            const saved = await routine.Save();
            if (!saved) {
                const errMessage = routine.LatestResult?.CompleteMessage || 'Unknown error saving MJ: User Routines.';
                LogError(`[AgentWakeTriggerService] Failed to save AgentWake routine: ${errMessage}`);
                return this.notTriggered('SAVE_FAILED', errMessage);
            }

            return {
                triggered: true,
                resultCode: 'WAKE_SCHEDULED',
                reason: params.wakeReason,
                routineID: routine.ID,
                targetUserID: params.targetUserID,
                targetAgentID: params.targetAgentID,
                workstreamKey: params.workstreamKey,
                nextRunAtISO: params.now.toISOString(),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`[AgentWakeTriggerService] Error scheduling event-driven wake: ${msg}`);
            return this.notTriggered('SAVE_FAILED', msg);
        }
    }

    private notTriggered(
        resultCode: AgentWakeTriggerResultCode,
        reason: string
    ): AgentWakeTriggerResult {
        return {
            triggered: false,
            resultCode,
            reason,
            routineID: null,
            targetUserID: null,
            targetAgentID: null,
            workstreamKey: null,
            nextRunAtISO: null,
        };
    }
}
