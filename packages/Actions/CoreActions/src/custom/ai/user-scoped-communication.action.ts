import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentUserPolicyEntity,
    MJAIBridgeAgentIdentityEntity,
    MJCommunicationProviderEntity,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import {
    BaseCommunicationProvider,
    CreateCalendarEventParams,
    FindMeetingTimesParams,
    GetEventsParams,
    GetFreeBusyParams,
    ProcessedMessage,
    RespondToCalendarEventParams,
    UpdateCalendarEventParams,
} from '@memberjunction/communication-types';


/**
 * Result of evaluating whether the enterprise communication provider is permitted
 * and able to access a user's personal mailbox or utility agent inbox.
 */
export interface MailboxGateDecision {
    Allowed: boolean;
    TargetMailbox: string;
    UsingUtilityMailbox: boolean;
    ScopeMode: MJCommunicationProviderEntity['EnterpriseScopeMode'];
    ReasonCode:
        | 'ALLOWED_PERSONAL_MAILBOX'
        | 'ALLOWED_UTILITY_MAILBOX'
        | 'MISSING_USER_EMAIL'
        | 'DOMAIN_MISMATCH'
        | 'UTILITY_MAILBOXES_ONLY'
        | 'MAILBOX_ACCESS_DENIED_BY_TENANT_POLICY'
        | 'PROVIDER_NOT_SUPPORTED';
    Message: string;
    CanReadMail: boolean;
    CanReadCalendar: boolean;
}

/**
 * Normalized external scheduling availability slot from HubSpot Meetings API v3 or Calendly API v2.
 */
export interface ExternalSchedulingAvailabilitySlot {
    Source: 'HubSpot' | 'Calendly';
    StartTimeISO: string;
    EndTimeISO?: string;
    DurationMinutes?: number;
    BookingUrl?: string;
    EventTypeName?: string;
}

/**
 * Shared security gate and helper methods for Chief of Staff user-scoped Email, Calendar,
 * and External Scheduling actions.
 *
 * Security Invariants:
 * 1. User-scoped actions NEVER accept an arbitrary mailbox/email address from the LLM to act as.
 *    Personal mailbox operations are always hard-pinned to `params.ContextUser.Email`.
 * 2. Before accessing a personal mailbox via an enterprise provider (`Microsoft Graph` or `Gmail`),
 *    `EnterpriseMailboxSecurityGate` verifies:
 *    - `contextUser.Email` domain matches `provider.AllowedEmailDomains` (when configured)
 *    - `provider.EnterpriseScopeMode` allows personal mailboxes (`SecurityGroupScoped` or `TenantWide`),
 *      or falls back to the user's dedicated `MJ: AI Bridge Agent Identities` utility inbox when
 *      `EnterpriseScopeMode === 'UtilityMailboxesOnly'`
 *    - `provider.VerifyMailboxAccess` preflight succeeds for the requested channel (`Mail` or `Calendar`).
 */
export abstract class BaseUserScopedCommunicationAction extends BaseAction {
    protected getParamValue(params: RunActionParams, name: string): unknown {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        return found?.Value;
    }

    protected getStringParam(params: RunActionParams, name: string): string | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > 0 ? str : null;
    }

    protected getBooleanParam(params: RunActionParams, name: string): boolean | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') return true;
            if (lower === 'false' || lower === '0' || lower === 'no') return false;
        }
        return null;
    }

    protected getNumericParam(params: RunActionParams, name: string): number | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        const num = Number(val);
        return Number.isFinite(num) ? num : null;
    }

    protected parseStringArrayParam(params: RunActionParams, name: string): string[] {
        const val = this.getParamValue(params, name);
        if (Array.isArray(val)) {
            return val.map((v) => String(v).trim()).filter((v) => v.length > 0);
        }
        if (typeof val === 'string' && val.trim().length > 0) {
            const parsed = SafeJSONParse<unknown>(val);
            if (Array.isArray(parsed)) {
                return parsed.map((v) => String(v).trim()).filter((v) => v.length > 0);
            }
            return val
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
        }
        return [];
    }

    protected setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (existing) {
            existing.Value = value;
        } else {
            params.Params.push({
                Name: name,
                Value: value,
                Type: 'Output',
            });
        }
    }

    protected async resolveAgentAndUserPolicy(
        params: RunActionParams,
        contextUser: UserInfo
    ): Promise<{ agentId: string | null; policy: MJAIAgentUserPolicyEntity | null }> {
        await AIEngine.Instance.Config(false, contextUser);
        const rawAgentId = this.getStringParam(params, 'AgentID');
        const rawAgentName = this.getStringParam(params, 'AgentName') ?? 'Chief of Staff';
        const agent = rawAgentId
            ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, rawAgentId))
            : AIEngine.Instance.Agents.find(
                  (a) => a.Name.trim().toLowerCase() === rawAgentName.trim().toLowerCase()
              );

        if (!agent) {
            return { agentId: null, policy: null };
        }

        const policy = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
            agent.ID,
            contextUser.ID,
            contextUser
        );
        return { agentId: agent.ID, policy };
    }

    protected async findUserUtilityMailbox(
        contextUser: UserInfo,
        agentId: string | null
    ): Promise<MJAIBridgeAgentIdentityEntity | null> {
        try {
            const rv = new RunView();
            const safeUserId = contextUser.ID.replace(/'/g, "''");
            const filterParts = [
                `UserID='${safeUserId}'`,
                `IdentityType='Email'`,
                `IsActive=1`,
            ];
            if (agentId) {
                const safeAgentId = agentId.replace(/'/g, "''");
                filterParts.push(`AgentID='${safeAgentId}'`);
            }
            const res = await rv.RunView<MJAIBridgeAgentIdentityEntity>(
                {
                    EntityName: 'MJ: AI Bridge Agent Identities',
                    ExtraFilter: filterParts.join(' AND '),
                    MaxRows: 1,
                    ResultType: 'entity_object',
                },
                contextUser
            );
            if (res.Success && res.Results.length > 0) {
                return res.Results[0];
            }
        } catch {
            // Non-fatal in environments without bridge rows
        }
        return null;
    }

    public static IsEmailDomainAllowed(email: string, allowedDomainsRaw: string | null | undefined): boolean {
        if (!allowedDomainsRaw || allowedDomainsRaw.trim().length === 0) {
            return true;
        }
        const atIdx = email.lastIndexOf('@');
        if (atIdx < 0) {
            return false;
        }
        const userDomain = email.slice(atIdx + 1).trim().toLowerCase();
        const allowedDomains = allowedDomainsRaw
            .split(',')
            .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
            .filter((d) => d.length > 0);

        if (allowedDomains.length === 0) {
            return true;
        }
        return allowedDomains.includes(userDomain);
    }

    protected async evaluateEnterpriseMailboxGate(
        providerEntity: MJCommunicationProviderEntity,
        providerInstance: BaseCommunicationProvider,
        contextUser: UserInfo,
        channel: 'Mail' | 'Calendar',
        preferUtilityMailbox: boolean,
        agentId: string | null
    ): Promise<MailboxGateDecision> {
        const scopeMode: MJCommunicationProviderEntity['EnterpriseScopeMode'] =
            providerEntity.EnterpriseScopeMode ?? 'UtilityMailboxesOnly';
        const userEmail = contextUser.Email?.trim().toLowerCase() ?? '';

        const utilityIdentity = await this.findUserUtilityMailbox(contextUser, agentId);
        const utilityAddress = utilityIdentity?.IdentityValue?.trim().toLowerCase() ?? null;

        if (
            (preferUtilityMailbox || scopeMode === 'UtilityMailboxesOnly') &&
            channel === 'Mail' &&
            utilityAddress
        ) {
            return {
                Allowed: true,
                TargetMailbox: utilityAddress,
                UsingUtilityMailbox: true,
                ScopeMode: scopeMode,
                ReasonCode: 'ALLOWED_UTILITY_MAILBOX',
                Message: `Using dedicated agent utility mailbox '${utilityAddress}' under EnterpriseScopeMode='${scopeMode}'.`,
                CanReadMail: true,
                CanReadCalendar: false,
            };
        }

        if (!userEmail) {
            return {
                Allowed: false,
                TargetMailbox: '',
                UsingUtilityMailbox: false,
                ScopeMode: scopeMode,
                ReasonCode: 'MISSING_USER_EMAIL',
                Message: 'Authenticated user does not have an email address on their MJ User profile.',
                CanReadMail: false,
                CanReadCalendar: false,
            };
        }

        if (!BaseUserScopedCommunicationAction.IsEmailDomainAllowed(userEmail, providerEntity.AllowedEmailDomains)) {
            return {
                Allowed: false,
                TargetMailbox: userEmail,
                UsingUtilityMailbox: false,
                ScopeMode: scopeMode,
                ReasonCode: 'DOMAIN_MISMATCH',
                Message: `User email '${userEmail}' does not match provider '${providerEntity.Name}' AllowedEmailDomains (${providerEntity.AllowedEmailDomains}). Personal mailbox access is blocked.`,
                CanReadMail: false,
                CanReadCalendar: false,
            };
        }

        if (scopeMode === 'UtilityMailboxesOnly') {
            return {
                Allowed: false,
                TargetMailbox: userEmail,
                UsingUtilityMailbox: false,
                ScopeMode: scopeMode,
                ReasonCode: 'UTILITY_MAILBOXES_ONLY',
                Message: `Provider '${providerEntity.Name}' is configured with EnterpriseScopeMode='UtilityMailboxesOnly'. Personal user mailbox/calendar access (${userEmail}) is disabled by enterprise policy.`,
                CanReadMail: false,
                CanReadCalendar: false,
            };
        }

        if (!providerInstance.supportsOperation('VerifyMailboxAccess')) {
            return {
                Allowed: true,
                TargetMailbox: userEmail,
                UsingUtilityMailbox: false,
                ScopeMode: scopeMode,
                ReasonCode: 'ALLOWED_PERSONAL_MAILBOX',
                Message: `Personal mailbox '${userEmail}' permitted under EnterpriseScopeMode='${scopeMode}'.`,
                CanReadMail: true,
                CanReadCalendar: Boolean(providerEntity.SupportsCalendar),
            };
        }

        const preflight = await providerInstance.VerifyMailboxAccess({
            Identifier: userEmail,
            CheckMailRead: channel === 'Mail',
            CheckCalendarRead: channel === 'Calendar',
        });

        const channelAllowed = channel === 'Mail' ? preflight.CanReadMail : preflight.CanReadCalendar;
        if (!channelAllowed) {
            return {
                Allowed: false,
                TargetMailbox: userEmail,
                UsingUtilityMailbox: false,
                ScopeMode: scopeMode,
                ReasonCode: 'MAILBOX_ACCESS_DENIED_BY_TENANT_POLICY',
                Message: `Enterprise credential for '${providerEntity.Name}' cannot access ${channel.toLowerCase()} for '${userEmail}' (${preflight.ErrorMessage ?? 'Access denied by Exchange Application Access Policy or Workspace scope'}).`,
                CanReadMail: preflight.CanReadMail,
                CanReadCalendar: preflight.CanReadCalendar,
            };
        }

        return {
            Allowed: true,
            TargetMailbox: userEmail,
            UsingUtilityMailbox: false,
            ScopeMode: scopeMode,
            ReasonCode: 'ALLOWED_PERSONAL_MAILBOX',
            Message: `Verified enterprise access to '${userEmail}' (${channel}) via '${providerEntity.Name}'.`,
            CanReadMail: preflight.CanReadMail,
            CanReadCalendar: preflight.CanReadCalendar,
        };
    }

    protected async resolveActiveProvider(
        params: RunActionParams,
        contextUser: UserInfo,
        requireCalendar: boolean
    ): Promise<{
        providerEntity: MJCommunicationProviderEntity;
        providerInstance: BaseCommunicationProvider;
    } | null> {
        await CommunicationEngine.Instance.Config(false, contextUser);
        const requestedName = this.getStringParam(params, 'ProviderName');
        const activeProviders = CommunicationEngine.Instance.Providers.filter(
            (p) => p.Status === 'Active' && (!requireCalendar || p.SupportsCalendar)
        );

        const chosenEntity = requestedName
            ? activeProviders.find((p) => p.Name.trim().toLowerCase() === requestedName.trim().toLowerCase())
            : activeProviders.find((p) => p.Name === 'Microsoft Graph' || p.Name === 'Gmail') ?? activeProviders[0];

        if (!chosenEntity) {
            return null;
        }

        try {
            const instance = CommunicationEngine.Instance.GetProvider(chosenEntity.Name);
            return { providerEntity: chosenEntity, providerInstance: instance };
        } catch {
            return null;
        }
    }

    protected async createApprovalRequest(
        contextUser: UserInfo,
        agentId: string | null,
        summary: string,
        payloadDetails: Record<string, unknown>,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        try {
            const approvalTypeId = await AIEngine.Instance.ResolveAgentRequestTypeID('Approval', contextUser);
            if (!approvalTypeId) {
                LogError('Agent request type "Approval" is not in metadata; cannot create an approval request.');
                return null;
            }
            const md = provider ?? new Metadata();
            const req = await md.GetEntityObject<MJAIAgentRequestEntity>('MJ: AI Agent Requests', contextUser);
            req.RequestForUserID = contextUser.ID;
            if (agentId) {
                req.AgentID = agentId;
            }
            req.RequestTypeID = approvalTypeId;
            req.RequestedAt = new Date();
            req.Status = 'Requested';
            req.Priority = 50;
            req.Request = summary;
            req.Comments = JSON.stringify(payloadDetails, null, 2);
            const saved = await req.Save();
            return saved ? req.ID : null;
        } catch {
            return null;
        }
    }
}

/**
 * Preflight action that inspects the enterprise communication posture, active providers,
 * the calling user's `MJ: AI Agent User Policies` channel permissions, utility mailboxes,
 * and external scheduling connectors (HubSpot Meetings API v3 / Calendly API v2).
 */
@RegisterClass(BaseAction, '__VerifyMyCommunicationCapabilities')
@RegisterClass(BaseAction, 'Verify My Communication Capabilities')
export class VerifyMyCommunicationCapabilitiesAction extends BaseUserScopedCommunicationAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser?.ID) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER_CONTEXT',
                Message: 'Verify My Communication Capabilities requires a valid ContextUser.',
                Params: params.Params,
            };
        }

        try {
            await CommunicationEngine.Instance.Config(false, contextUser);
            const { agentId, policy } = await this.resolveAgentAndUserPolicy(params, contextUser);
            const utilityIdentity = await this.findUserUtilityMailbox(contextUser, agentId);

            const providerReports: Array<{
                ProviderName: string;
                EnterpriseScopeMode: MJCommunicationProviderEntity['EnterpriseScopeMode'];
                AllowedEmailDomains: string | null;
                SupportsCalendar: boolean;
                SupportsFreeBusy: boolean;
                MailGate: MailboxGateDecision;
                CalendarGate: MailboxGateDecision | null;
            }> = [];

            const activeProviders = CommunicationEngine.Instance.Providers.filter((p) => p.Status === 'Active');
            for (const prov of activeProviders) {
                let instance: BaseCommunicationProvider | null = null;
                try {
                    instance = CommunicationEngine.Instance.GetProvider(prov.Name);
                } catch {
                    instance = null;
                }
                if (!instance) continue;

                const mailGate = await this.evaluateEnterpriseMailboxGate(
                    prov,
                    instance,
                    contextUser,
                    'Mail',
                    policy?.EmailChannelMode === 'SendAsAgent',
                    agentId
                );

                const calendarGate = prov.SupportsCalendar
                    ? await this.evaluateEnterpriseMailboxGate(
                          prov,
                          instance,
                          contextUser,
                          'Calendar',
                          false,
                          agentId
                      )
                    : null;

                providerReports.push({
                    ProviderName: prov.Name,
                    EnterpriseScopeMode: prov.EnterpriseScopeMode,
                    AllowedEmailDomains: prov.AllowedEmailDomains,
                    SupportsCalendar: prov.SupportsCalendar,
                    SupportsFreeBusy: prov.SupportsFreeBusy,
                    MailGate: mailGate,
                    CalendarGate: calendarGate,
                });
            }

            const hubspotConfigured = Boolean(
                this.getStringParam(params, 'HubSpotAccessToken') ?? process.env['HUBSPOT_ACCESS_TOKEN']
            );
            const calendlyConfigured = Boolean(
                this.getStringParam(params, 'CalendlyAccessToken') ?? process.env['CALENDLY_ACCESS_TOKEN']
            );

            const report = {
                User: {
                    ID: contextUser.ID,
                    Name: contextUser.Name,
                    Email: contextUser.Email,
                },
                UserPolicy: {
                    EmailChannelMode: policy?.EmailChannelMode ?? 'DraftOnly',
                    CalendarChannelMode: policy?.CalendarChannelMode ?? 'ProposeWithApproval',
                    PhoneChannelMode: policy?.PhoneChannelMode ?? 'OutboundWithApproval',
                    MessagingChannelMode: policy?.MessagingChannelMode ?? 'Enabled',
                },
                AgentUtilityMailbox: utilityIdentity
                    ? {
                          ID: utilityIdentity.ID,
                          Address: utilityIdentity.IdentityValue,
                          DisplayName: utilityIdentity.DisplayName,
                      }
                    : null,
                EnterpriseProviders: providerReports,
                ExternalSchedulingConnectors: {
                    HubSpotMeetingsAvailable: hubspotConfigured,
                    CalendlyAvailable: calendlyConfigured,
                },
            };

            this.setOutputParam(params, 'CapabilitiesReport', report);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Verified communication capabilities for ${contextUser.Email}: ${providerReports.length} active provider(s), EmailChannelMode=${report.UserPolicy.EmailChannelMode}, CalendarChannelMode=${report.UserPolicy.CalendarChannelMode}.`,
                Params: params.Params,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`VerifyMyCommunicationCapabilitiesAction error: ${msg}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error verifying communication capabilities: ${msg}`,
                Params: params.Params,
            };
        }
    }
}

/**
 * User-scoped action to read the calling user's calendar events, query free/busy schedules,
 * find optimal meeting times across attendees, or check external scheduling availability
 * in HubSpot Meetings API v3 and Calendly API v2.
 */
@RegisterClass(BaseAction, '__GetMyCalendarAndAvailability')
@RegisterClass(BaseAction, 'Get My Calendar Events and Availability')
export class GetMyCalendarAndAvailabilityAction extends BaseUserScopedCommunicationAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser?.ID) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER_CONTEXT',
                Message: 'Get My Calendar Events and Availability requires a valid ContextUser.',
                Params: params.Params,
            };
        }

        try {
            const { agentId, policy } = await this.resolveAgentAndUserPolicy(params, contextUser);
            const calPolicy = AgentUserPolicyEngine.Instance.EvaluateCalendarOperation(policy, false);
            if (calPolicy.verdict === 'Deny') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: calPolicy.reason,
                    Params: params.Params,
                };
            }

            const operation =
                (this.getStringParam(params, 'Operation') as
                    | 'GetEvents'
                    | 'GetFreeBusy'
                    | 'FindMeetingTimes'
                    | 'CheckExternalSchedulingAvailability'
                    | null) ?? 'GetEvents';

            const startIso = this.getStringParam(params, 'StartDateTime');
            const endIso = this.getStringParam(params, 'EndDateTime');
            const startTime = startIso ? new Date(startIso) : new Date();
            const endTime = endIso ? new Date(endIso) : new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);

            if (operation === 'CheckExternalSchedulingAvailability') {
                return await this.runExternalSchedulingCheck(params, contextUser, startTime, endTime);
            }

            const resolved = await this.resolveActiveProvider(params, contextUser, true);
            if (!resolved) {
                return {
                    Success: false,
                    ResultCode: 'NO_CALENDAR_PROVIDER',
                    Message: 'No active communication provider with SupportsCalendar=true is configured.',
                    Params: params.Params,
                };
            }

            const gate = await this.evaluateEnterpriseMailboxGate(
                resolved.providerEntity,
                resolved.providerInstance,
                contextUser,
                'Calendar',
                false,
                agentId
            );
            if (!gate.Allowed) {
                return {
                    Success: false,
                    ResultCode: gate.ReasonCode,
                    Message: gate.Message,
                    Params: params.Params,
                };
            }

            if (operation === 'GetEvents') {
                const getEventsParams: GetEventsParams = {
                    Identifier: gate.TargetMailbox,
                    NumEvents: this.getNumericParam(params, 'MaxEvents') ?? 25,
                    StartDateTime: startTime,
                    EndDateTime: endTime,
                    IncludeCancelled: this.getBooleanParam(params, 'IncludeCancelled') ?? false,
                };
                const res = await resolved.providerInstance.GetEvents(getEventsParams);
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to retrieve calendar events.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Events', res.Events);
                this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Retrieved ${res.Events.length} calendar event(s) for ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            if (operation === 'GetFreeBusy') {
                const extraSchedules = this.parseStringArrayParam(params, 'AttendeeEmails');
                const schedules = Array.from(new Set([gate.TargetMailbox, ...extraSchedules]));
                const fbParams: GetFreeBusyParams = {
                    Identifier: gate.TargetMailbox,
                    Schedules: schedules,
                    StartDateTime: startTime,
                    EndDateTime: endTime,
                    AvailabilityViewIntervalMinutes: this.getNumericParam(params, 'IntervalMinutes') ?? 30,
                };
                const res = await resolved.providerInstance.GetFreeBusy(fbParams);
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to retrieve free/busy schedules.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Schedules', res.Schedules);
                this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Retrieved free/busy availability for ${res.Schedules.length} schedule(s).`,
                    Params: params.Params,
                };
            }

            // FindMeetingTimes
            const attendeeEmails = this.parseStringArrayParam(params, 'AttendeeEmails');
            const findParams: FindMeetingTimesParams = {
                Identifier: gate.TargetMailbox,
                Attendees: attendeeEmails.map((email) => ({ Email: email, Required: true })),
                StartDateTime: startTime,
                EndDateTime: endTime,
                DurationMinutes: this.getNumericParam(params, 'DurationMinutes') ?? 30,
                MaxCandidates: this.getNumericParam(params, 'MaxCandidates') ?? 5,
            };
            const res = await resolved.providerInstance.FindMeetingTimes(findParams);
            if (!res.Success) {
                return {
                    Success: false,
                    ResultCode: 'PROVIDER_ERROR',
                    Message: res.ErrorMessage ?? 'Failed to find meeting times.',
                    Params: params.Params,
                };
            }
            this.setOutputParam(params, 'Suggestions', res.Suggestions);
            this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${res.Suggestions.length} candidate meeting slot(s) for ${gate.TargetMailbox}.`,
                Params: params.Params,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`GetMyCalendarAndAvailabilityAction error: ${msg}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error querying calendar/availability: ${msg}`,
                Params: params.Params,
            };
        }
    }

    /**
     * Queries HubSpot Meetings API v3 and/or Calendly API v2 for the calling user's
     * external scheduling links and open availability slots.
     */
    private async runExternalSchedulingCheck(
        params: RunActionParams,
        contextUser: UserInfo,
        startTime: Date,
        endTime: Date
    ): Promise<ActionResultSimple> {
        const externalSystem = (this.getStringParam(params, 'ExternalSchedulingSystem') ?? 'All').toLowerCase();
        const userEmail = contextUser.Email?.trim().toLowerCase() ?? '';
        const timezone = this.getStringParam(params, 'TimeZone') ?? 'UTC';
        const slots: ExternalSchedulingAvailabilitySlot[] = [];
        const meetingLinks: Array<{ Source: 'HubSpot' | 'Calendly'; Name: string; Url: string; Slug?: string }> = [];
        const errors: string[] = [];

        // 1. HubSpot Meetings API v3 (`/scheduler/v3/meetings/meeting-links`)
        if (externalSystem === 'all' || externalSystem === 'hubspot') {
            const hubspotToken =
                this.getStringParam(params, 'HubSpotAccessToken') ?? process.env['HUBSPOT_ACCESS_TOKEN'];
            if (hubspotToken) {
                try {
                    const linksResp = await fetch(
                        'https://api.hubapi.com/scheduler/v3/meetings/meeting-links',
                        {
                            method: 'GET',
                            headers: {
                                Authorization: `Bearer ${hubspotToken}`,
                                Accept: 'application/json',
                            },
                        }
                    );
                    if (linksResp.ok) {
                        const linksData = (await linksResp.json()) as {
                            results?: Array<{
                                id?: string;
                                slug?: string;
                                name?: string;
                                link?: string;
                                organizerUserId?: string;
                            }>;
                        };
                        const allLinks = linksData.results ?? [];
                        const requestedSlug = this.getStringParam(params, 'MeetingSlug');
                        const targetLinks = requestedSlug
                            ? allLinks.filter((l) => l.slug === requestedSlug)
                            : allLinks;

                        for (const linkItem of targetLinks) {
                            if (linkItem.link) {
                                meetingLinks.push({
                                    Source: 'HubSpot',
                                    Name: linkItem.name ?? linkItem.slug ?? 'HubSpot Meeting',
                                    Url: linkItem.link,
                                    Slug: linkItem.slug,
                                });
                            }
                            if (linkItem.slug) {
                                const availUrl = `https://api.hubapi.com/scheduler/v3/meetings/meeting-links/book/availability-page/${encodeURIComponent(
                                    linkItem.slug
                                )}?timezone=${encodeURIComponent(timezone)}`;
                                const availResp = await fetch(availUrl, {
                                    method: 'GET',
                                    headers: {
                                        Authorization: `Bearer ${hubspotToken}`,
                                        Accept: 'application/json',
                                    },
                                });
                                if (availResp.ok) {
                                    const availData = (await availResp.json()) as {
                                        linkAvailability?: {
                                            linkAvailabilityByDuration?: Record<
                                                string,
                                                {
                                                    availabilities?: Array<{
                                                        startMillisUtc?: number;
                                                        endMillisUtc?: number;
                                                    }>;
                                                }
                                            >;
                                        };
                                    };
                                    const byDuration =
                                        availData.linkAvailability?.linkAvailabilityByDuration ?? {};
                                    for (const [durationKey, bucket] of Object.entries(byDuration)) {
                                        const durMinutes = Math.round(Number(durationKey) / 60000) || 30;
                                        for (const slot of bucket.availabilities ?? []) {
                                            if (slot.startMillisUtc) {
                                                slots.push({
                                                    Source: 'HubSpot',
                                                    StartTimeISO: new Date(slot.startMillisUtc).toISOString(),
                                                    EndTimeISO: slot.endMillisUtc
                                                        ? new Date(slot.endMillisUtc).toISOString()
                                                        : undefined,
                                                    DurationMinutes: durMinutes,
                                                    BookingUrl: linkItem.link,
                                                    EventTypeName: linkItem.name,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        errors.push(`HubSpot Meetings API returned HTTP ${linksResp.status}`);
                    }
                } catch (hsErr) {
                    errors.push(
                        `HubSpot Meetings API error: ${hsErr instanceof Error ? hsErr.message : String(hsErr)}`
                    );
                }
            }
        }

        // 2. Calendly API v2 (`/users/me`, `/event_types`, `/event_type_available_times`)
        if (externalSystem === 'all' || externalSystem === 'calendly') {
            const calendlyToken =
                this.getStringParam(params, 'CalendlyAccessToken') ?? process.env['CALENDLY_ACCESS_TOKEN'];
            if (calendlyToken) {
                try {
                    const meResp = await fetch('https://api.calendly.com/users/me', {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${calendlyToken}`,
                            Accept: 'application/json',
                        },
                    });
                    if (meResp.ok) {
                        const meData = (await meResp.json()) as {
                            resource?: { uri?: string; email?: string; scheduling_url?: string; name?: string };
                        };
                        const calUserUri = meData.resource?.uri;
                        const calEmail = meData.resource?.email?.trim().toLowerCase();

                        if (calEmail && userEmail && calEmail !== userEmail) {
                            errors.push(
                                `Calendly token belongs to '${calEmail}', which does not match authenticated user '${userEmail}'. Blocked by identity lock.`
                            );
                        } else if (calUserUri) {
                            const etResp = await fetch(
                                `https://api.calendly.com/event_types?user=${encodeURIComponent(calUserUri)}&active=true`,
                                {
                                    method: 'GET',
                                    headers: {
                                        Authorization: `Bearer ${calendlyToken}`,
                                        Accept: 'application/json',
                                    },
                                }
                            );
                            if (etResp.ok) {
                                const etData = (await etResp.json()) as {
                                    collection?: Array<{
                                        uri?: string;
                                        name?: string;
                                        scheduling_url?: string;
                                        duration?: number;
                                    }>;
                                };
                                for (const et of etData.collection ?? []) {
                                    if (et.scheduling_url) {
                                        meetingLinks.push({
                                            Source: 'Calendly',
                                            Name: et.name ?? 'Calendly Event',
                                            Url: et.scheduling_url,
                                        });
                                    }
                                    if (et.uri) {
                                        const availUrl = `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(
                                            et.uri
                                        )}&start_time=${encodeURIComponent(
                                            startTime.toISOString()
                                        )}&end_time=${encodeURIComponent(endTime.toISOString())}`;
                                        const availResp = await fetch(availUrl, {
                                            method: 'GET',
                                            headers: {
                                                Authorization: `Bearer ${calendlyToken}`,
                                                Accept: 'application/json',
                                            },
                                        });
                                        if (availResp.ok) {
                                            const availData = (await availResp.json()) as {
                                                collection?: Array<{
                                                    start_time?: string;
                                                    scheduling_url?: string;
                                                }>;
                                            };
                                            for (const item of availData.collection ?? []) {
                                                if (item.start_time) {
                                                    slots.push({
                                                        Source: 'Calendly',
                                                        StartTimeISO: item.start_time,
                                                        DurationMinutes: et.duration,
                                                        BookingUrl: item.scheduling_url ?? et.scheduling_url,
                                                        EventTypeName: et.name,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        errors.push(`Calendly API returned HTTP ${meResp.status}`);
                    }
                } catch (calErr) {
                    errors.push(
                        `Calendly API error: ${calErr instanceof Error ? calErr.message : String(calErr)}`
                    );
                }
            }
        }

        this.setOutputParam(params, 'ExternalAvailabilitySlots', slots);
        this.setOutputParam(params, 'MeetingLinks', meetingLinks);
        if (errors.length > 0) {
            this.setOutputParam(params, 'Warnings', errors);
        }

        return {
            Success: errors.length === 0 || slots.length > 0 || meetingLinks.length > 0,
            ResultCode: errors.length > 0 && slots.length === 0 ? 'EXTERNAL_SCHEDULING_ERROR' : 'SUCCESS',
            Message:
                slots.length > 0 || meetingLinks.length > 0
                    ? `Found ${meetingLinks.length} scheduling link(s) and ${slots.length} open slot(s) across external scheduling systems.`
                    : errors.join('; ') || 'No external scheduling credentials (HubSpot/Calendly) configured.',
            Params: params.Params,
        };
    }
}

/**
 * User-scoped action to create, update, respond to (accept/tentativelyAccept/decline), or cancel
 * a calendar event on the calling user's calendar, or generate a single-use Calendly scheduling link.
 *
 * Enforces `CalendarChannelMode` (`Disabled` | `ReadOnly` | `ProposeWithApproval` | `Autonomous`)
 * and `EnterpriseMailboxSecurityGate`.
 */
@RegisterClass(BaseAction, '__ManageMyCalendarEvent')
@RegisterClass(BaseAction, 'Manage My Calendar Event')
export class ManageMyCalendarEventAction extends BaseUserScopedCommunicationAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser?.ID) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER_CONTEXT',
                Message: 'Manage My Calendar Event requires a valid ContextUser.',
                Params: params.Params,
            };
        }

        try {
            const { agentId, policy } = await this.resolveAgentAndUserPolicy(params, contextUser);
            const calEval = AgentUserPolicyEngine.Instance.EvaluateCalendarOperation(policy, true);
            if (calEval.verdict === 'Deny') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: calEval.reason,
                    Params: params.Params,
                };
            }

            const operation =
                (this.getStringParam(params, 'Operation') as
                    | 'Create'
                    | 'Update'
                    | 'Respond'
                    | 'Cancel'
                    | 'CreateCalendlySingleUseLink'
                    | null) ?? 'Create';

            if (operation === 'CreateCalendlySingleUseLink') {
                return await this.createCalendlySingleUseLink(params);
            }

            const resolved = await this.resolveActiveProvider(params, contextUser, true);
            if (!resolved) {
                return {
                    Success: false,
                    ResultCode: 'NO_CALENDAR_PROVIDER',
                    Message: 'No active communication provider with SupportsCalendar=true is configured.',
                    Params: params.Params,
                };
            }

            const gate = await this.evaluateEnterpriseMailboxGate(
                resolved.providerEntity,
                resolved.providerInstance,
                contextUser,
                'Calendar',
                false,
                agentId
            );
            if (!gate.Allowed) {
                return {
                    Success: false,
                    ResultCode: gate.ReasonCode,
                    Message: gate.Message,
                    Params: params.Params,
                };
            }

            const confirmedApprovalId = this.getStringParam(params, 'ConfirmedApprovalRequestID');
            const explicitDryRun = this.getBooleanParam(params, 'DryRun') ?? false;
            const requiresApproval = calEval.verdict === 'RequireApproval' && !confirmedApprovalId;
            const isDryRun = explicitDryRun || requiresApproval;

            if (operation === 'Create') {
                const subject = this.getStringParam(params, 'Subject') ?? 'Meeting';
                const startIso = this.getStringParam(params, 'StartTime');
                const endIso = this.getStringParam(params, 'EndTime');
                if (!startIso || !endIso) {
                    return {
                        Success: false,
                        ResultCode: 'MISSING_PARAMETERS',
                        Message: 'Create calendar event requires StartTime and EndTime (ISO-8601).',
                        Params: params.Params,
                    };
                }
                const attendeeEmails = this.parseStringArrayParam(params, 'AttendeeEmails');
                const createParams: CreateCalendarEventParams = {
                    Identifier: gate.TargetMailbox,
                    Subject: subject,
                    Body: this.getStringParam(params, 'Body') ?? undefined,
                    IsHTML: this.getBooleanParam(params, 'IsHTML') ?? false,
                    StartTime: new Date(startIso),
                    EndTime: new Date(endIso),
                    TimeZone: this.getStringParam(params, 'TimeZone') ?? 'UTC',
                    Location: this.getStringParam(params, 'Location') ?? undefined,
                    Attendees: attendeeEmails.map((email) => ({ Email: email, Required: true })),
                    IsOnlineMeeting: this.getBooleanParam(params, 'IsOnlineMeeting') ?? true,
                    DryRun: isDryRun,
                };

                const res = await resolved.providerInstance.CreateCalendarEvent(createParams);
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to create calendar event.',
                        Params: params.Params,
                    };
                }

                if (requiresApproval) {
                    const reqId = await this.createApprovalRequest(
                        contextUser,
                        agentId,
                        `Approve calendar invite: "${subject}" (${startIso} - ${endIso})`,
                        {
                            Operation: 'CreateCalendarEvent',
                            TargetMailbox: gate.TargetMailbox,
                            EventPreview: res.Event,
                            AttendeeEmails: attendeeEmails,
                        }
                    );
                    this.setOutputParam(params, 'ApprovalRequestID', reqId);
                    this.setOutputParam(params, 'EventPreview', res.Event);
                    return {
                        Success: true,
                        ResultCode: 'APPROVAL_REQUIRED',
                        Message: `CalendarChannelMode is 'ProposeWithApproval'. Created dry-run preview for '${subject}' and queued approval request${reqId ? ` (${reqId})` : ''}.`,
                        Params: params.Params,
                    };
                }

                this.setOutputParam(params, 'Event', res.Event);
                this.setOutputParam(params, 'OnlineMeetingUrl', res.OnlineMeetingUrl);
                return {
                    Success: true,
                    ResultCode: isDryRun ? 'DRY_RUN_SUCCESS' : 'SUCCESS',
                    Message: `Created calendar event '${subject}' on ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            const eventId = this.getStringParam(params, 'EventID');
            if (!eventId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETERS',
                    Message: `Calendar operation '${operation}' requires EventID.`,
                    Params: params.Params,
                };
            }

            if (operation === 'Update') {
                const startIso = this.getStringParam(params, 'StartTime');
                const endIso = this.getStringParam(params, 'EndTime');
                const attendeeEmails = this.parseStringArrayParam(params, 'AttendeeEmails');
                const updateParams: UpdateCalendarEventParams = {
                    Identifier: gate.TargetMailbox,
                    EventID: eventId,
                    Subject: this.getStringParam(params, 'Subject') ?? undefined,
                    Body: this.getStringParam(params, 'Body') ?? undefined,
                    StartTime: startIso ? new Date(startIso) : undefined,
                    EndTime: endIso ? new Date(endIso) : undefined,
                    TimeZone: this.getStringParam(params, 'TimeZone') ?? undefined,
                    Location: this.getStringParam(params, 'Location') ?? undefined,
                    Attendees:
                        attendeeEmails.length > 0
                            ? attendeeEmails.map((email) => ({ Email: email, Required: true }))
                            : undefined,
                    DryRun: isDryRun,
                };
                const res = await resolved.providerInstance.UpdateCalendarEvent(updateParams);
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to update calendar event.',
                        Params: params.Params,
                    };
                }
                if (requiresApproval) {
                    const reqId = await this.createApprovalRequest(
                        contextUser,
                        agentId,
                        `Approve calendar update for event ${eventId}`,
                        { Operation: 'UpdateCalendarEvent', EventID: eventId, Updates: updateParams }
                    );
                    this.setOutputParam(params, 'ApprovalRequestID', reqId);
                    return {
                        Success: true,
                        ResultCode: 'APPROVAL_REQUIRED',
                        Message: `Queued approval request${reqId ? ` (${reqId})` : ''} to update calendar event '${eventId}'.`,
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Event', res.Event);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Updated calendar event '${eventId}' on ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            if (operation === 'Respond') {
                const responseType =
                    (this.getStringParam(params, 'Response') as RespondToCalendarEventParams['Response'] | null) ??
                    'Accept';
                const rsvpParams: RespondToCalendarEventParams = {
                    Identifier: gate.TargetMailbox,
                    EventID: eventId,
                    Response: responseType,
                    Comment: this.getStringParam(params, 'Comment') ?? undefined,
                    SendResponse: this.getBooleanParam(params, 'SendResponse') ?? true,
                    DryRun: isDryRun,
                };
                const res = await resolved.providerInstance.RespondToCalendarEvent(rsvpParams);
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to respond to calendar event.',
                        Params: params.Params,
                    };
                }
                if (requiresApproval) {
                    const reqId = await this.createApprovalRequest(
                        contextUser,
                        agentId,
                        `Approve RSVP '${responseType}' for event ${eventId}`,
                        { Operation: 'RespondToCalendarEvent', EventID: eventId, Response: responseType }
                    );
                    this.setOutputParam(params, 'ApprovalRequestID', reqId);
                    return {
                        Success: true,
                        ResultCode: 'APPROVAL_REQUIRED',
                        Message: `Queued approval request${reqId ? ` (${reqId})` : ''} to RSVP '${responseType}' to event '${eventId}'.`,
                        Params: params.Params,
                    };
                }
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Responded '${responseType}' to calendar event '${eventId}'.`,
                    Params: params.Params,
                };
            }

            // Cancel
            const cancelRes = await resolved.providerInstance.CancelCalendarEvent({
                Identifier: gate.TargetMailbox,
                EventID: eventId,
                Comment: this.getStringParam(params, 'Comment') ?? undefined,
                DryRun: isDryRun,
            });
            if (!cancelRes.Success) {
                return {
                    Success: false,
                    ResultCode: 'PROVIDER_ERROR',
                    Message: cancelRes.ErrorMessage ?? 'Failed to cancel calendar event.',
                    Params: params.Params,
                };
            }
            if (requiresApproval) {
                const reqId = await this.createApprovalRequest(
                    contextUser,
                    agentId,
                    `Approve cancellation of calendar event ${eventId}`,
                    { Operation: 'CancelCalendarEvent', EventID: eventId }
                );
                this.setOutputParam(params, 'ApprovalRequestID', reqId);
                return {
                    Success: true,
                    ResultCode: 'APPROVAL_REQUIRED',
                    Message: `Queued approval request${reqId ? ` (${reqId})` : ''} to cancel event '${eventId}'.`,
                    Params: params.Params,
                };
            }
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Cancelled calendar event '${eventId}' on ${gate.TargetMailbox}.`,
                Params: params.Params,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ManageMyCalendarEventAction error: ${msg}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error managing calendar event: ${msg}`,
                Params: params.Params,
            };
        }
    }

    private async createCalendlySingleUseLink(params: RunActionParams): Promise<ActionResultSimple> {
        const calendlyToken =
            this.getStringParam(params, 'CalendlyAccessToken') ?? process.env['CALENDLY_ACCESS_TOKEN'];
        const eventTypeUri = this.getStringParam(params, 'CalendlyEventTypeUri');
        if (!calendlyToken || !eventTypeUri) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETERS',
                Message:
                    'CreateCalendlySingleUseLink requires CalendlyEventTypeUri and a configured Calendly access token.',
                Params: params.Params,
            };
        }

        const resp = await fetch('https://api.calendly.com/scheduling_links', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${calendlyToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                max_event_count: 1,
                owner: eventTypeUri,
                owner_type: 'EventType',
            }),
        });

        if (!resp.ok) {
            return {
                Success: false,
                ResultCode: 'CALENDLY_ERROR',
                Message: `Calendly scheduling_links returned HTTP ${resp.status}`,
                Params: params.Params,
            };
        }

        const data = (await resp.json()) as { resource?: { booking_url?: string } };
        const bookingUrl = data.resource?.booking_url ?? null;
        this.setOutputParam(params, 'BookingUrl', bookingUrl);
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: `Generated single-use Calendly booking link: ${bookingUrl}`,
            Params: params.Params,
        };
    }
}

/**
 * User-scoped action to read messages, search threads, or create/reply/forward drafts
 * in the calling user's personal mailbox or dedicated agent utility mailbox.
 *
 * Security Invariant:
 * - Never accepts an arbitrary `From` or `Mailbox` parameter from the LLM.
 * - Enforces `EmailChannelMode` and `EnterpriseMailboxSecurityGate`.
 */
@RegisterClass(BaseAction, '__ManageMyEmailInbox')
@RegisterClass(BaseAction, 'Manage My Email Inbox and Drafts')
export class ManageMyEmailInboxAction extends BaseUserScopedCommunicationAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser?.ID) {
            return {
                Success: false,
                ResultCode: 'MISSING_USER_CONTEXT',
                Message: 'Manage My Email Inbox and Drafts requires a valid ContextUser.',
                Params: params.Params,
            };
        }

        try {
            const { agentId, policy } = await this.resolveAgentAndUserPolicy(params, contextUser);
            const operation =
                (this.getStringParam(params, 'Operation') as
                    | 'ListMessages'
                    | 'SearchMessages'
                    | 'GetSingleMessage'
                    | 'CreateDraft'
                    | 'Reply'
                    | 'Forward'
                    | null) ?? 'ListMessages';

            const opCategory: 'Read' | 'Draft' | 'Send' =
                operation === 'ListMessages' || operation === 'SearchMessages' || operation === 'GetSingleMessage'
                    ? 'Read'
                    : operation === 'CreateDraft'
                    ? 'Draft'
                    : 'Send';

            const emailEval = AgentUserPolicyEngine.Instance.EvaluateEmailOperation(policy, opCategory);
            if (emailEval.verdict === 'Deny') {
                return {
                    Success: false,
                    ResultCode: 'POLICY_DENIED',
                    Message: emailEval.reason,
                    Params: params.Params,
                };
            }

            const resolved = await this.resolveActiveProvider(params, contextUser, false);
            if (!resolved) {
                return {
                    Success: false,
                    ResultCode: 'NO_EMAIL_PROVIDER',
                    Message: 'No active communication provider is configured.',
                    Params: params.Params,
                };
            }

            const preferUtility = policy?.EmailChannelMode === 'SendAsAgent';
            const gate = await this.evaluateEnterpriseMailboxGate(
                resolved.providerEntity,
                resolved.providerInstance,
                contextUser,
                'Mail',
                preferUtility,
                agentId
            );
            if (!gate.Allowed) {
                return {
                    Success: false,
                    ResultCode: gate.ReasonCode,
                    Message: gate.Message,
                    Params: params.Params,
                };
            }

            if (operation === 'ListMessages') {
                const res = await resolved.providerInstance.GetMessages({
                    Identifier: gate.TargetMailbox,
                    NumMessages: this.getNumericParam(params, 'MaxMessages') ?? 20,
                    UnreadOnly: this.getBooleanParam(params, 'UnreadOnly') ?? false,
                    ContextData: { Email: gate.TargetMailbox },
                });
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to list messages.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Messages', res.Messages);
                this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Retrieved ${res.Messages.length} message(s) for ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            if (operation === 'SearchMessages') {
                const query = this.getStringParam(params, 'Query') ?? '';
                const res = await resolved.providerInstance.SearchMessages({
                    Query: query,
                    MaxResults: this.getNumericParam(params, 'MaxMessages') ?? 20,
                    ContextData: { Email: gate.TargetMailbox },
                });
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to search messages.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Messages', res.Messages ?? []);
                this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Found ${res.Messages?.length ?? 0} message(s) matching '${query}' in ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            if (operation === 'GetSingleMessage') {
                const messageId = this.getStringParam(params, 'MessageID');
                if (!messageId) {
                    return {
                        Success: false,
                        ResultCode: 'MISSING_PARAMETERS',
                        Message: 'GetSingleMessage requires MessageID.',
                        Params: params.Params,
                    };
                }
                const res = await resolved.providerInstance.GetSingleMessage({
                    MessageID: messageId,
                    ContextData: { Email: gate.TargetMailbox },
                });
                if (!res.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: res.ErrorMessage ?? 'Failed to get message.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'Message', res.Message);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Retrieved message '${messageId}' from ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            // CreateDraft / Reply / Forward
            const to = this.getStringParam(params, 'To') ?? '';
            const subject = this.getStringParam(params, 'Subject') ?? '';
            const body = this.getStringParam(params, 'Body') ?? '';
            const cc = this.parseStringArrayParam(params, 'CCRecipients');

            const draftMessage = {
                From: gate.TargetMailbox,
                To: to,
                Subject: subject,
                ProcessedSubject: subject,
                Body: body,
                ProcessedBody: body,
                HTMLBody: this.getBooleanParam(params, 'IsHTML') ? body : '',
                ProcessedHTMLBody: this.getBooleanParam(params, 'IsHTML') ? body : '',
                CCRecipients: cc,
                BCCRecipients: [],
                ContextData: { Email: gate.TargetMailbox },
            } as unknown as ProcessedMessage;

            if (operation === 'CreateDraft') {
                const draftRes = await resolved.providerInstance.CreateDraft({
                    Message: draftMessage,
                    ContextData: { Email: gate.TargetMailbox },
                });
                if (!draftRes.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: draftRes.ErrorMessage ?? 'Failed to create draft.',
                        Params: params.Params,
                    };
                }
                this.setOutputParam(params, 'DraftID', draftRes.DraftID);
                this.setOutputParam(params, 'TargetMailbox', gate.TargetMailbox);
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Created email draft (${draftRes.DraftID ?? 'saved'}) in ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            if (emailEval.verdict === 'RequireApproval' && !this.getStringParam(params, 'ConfirmedApprovalRequestID')) {
                const reqId = await this.createApprovalRequest(
                    contextUser,
                    agentId,
                    `Approve outbound email (${operation}) from ${gate.TargetMailbox} to ${to}`,
                    {
                        Operation: operation,
                        From: gate.TargetMailbox,
                        To: to,
                        Subject: subject,
                        Body: body,
                    }
                );
                this.setOutputParam(params, 'ApprovalRequestID', reqId);
                return {
                    Success: true,
                    ResultCode: 'APPROVAL_REQUIRED',
                    Message: `Queued approval request${reqId ? ` (${reqId})` : ''} for ${operation} from ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            const messageId = this.getStringParam(params, 'MessageID') ?? '';
            if (operation === 'Reply') {
                const replyRes = await resolved.providerInstance.ReplyToMessage({
                    MessageID: messageId,
                    Message: draftMessage,
                    ContextData: { Email: gate.TargetMailbox },
                });
                if (!replyRes.Success) {
                    return {
                        Success: false,
                        ResultCode: 'PROVIDER_ERROR',
                        Message: replyRes.ErrorMessage ?? 'Failed to reply to message.',
                        Params: params.Params,
                    };
                }
                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Replied to message '${messageId}' from ${gate.TargetMailbox}.`,
                    Params: params.Params,
                };
            }

            // Forward
            const fwdRes = await resolved.providerInstance.ForwardMessage({
                MessageID: messageId,
                Message: body,
                ToRecipients: [to].filter(Boolean),
                CCRecipients: cc,
            });
            if (!fwdRes.Success) {
                return {
                    Success: false,
                    ResultCode: 'PROVIDER_ERROR',
                    Message: fwdRes.ErrorMessage ?? 'Failed to forward message.',
                    Params: params.Params,
                };
            }
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Forwarded message '${messageId}' to ${to} from ${gate.TargetMailbox}.`,
                Params: params.Params,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ManageMyEmailInboxAction error: ${msg}`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error managing email inbox: ${msg}`,
                Params: params.Params,
            };
        }
    }
}
