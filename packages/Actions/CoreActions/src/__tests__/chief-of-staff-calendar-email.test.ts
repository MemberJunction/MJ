import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunActionParams } from '@memberjunction/actions-base';
import { UserInfo } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJCommunicationProviderEntity,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';

const {
    mockGetProvider,
    mockProvidersList,
    mockRunViewFn,
    mockGetEntityObjectFn,
} = vi.hoisted(() => ({
    mockGetProvider: vi.fn(),
    mockProvidersList: [] as MJCommunicationProviderEntity[],
    mockRunViewFn: vi.fn(),
    mockGetEntityObjectFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            RunView = mockRunViewFn;
        },
        Metadata: class {
            GetEntityObject = mockGetEntityObjectFn;
        },
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Agents: [
                {
                    ID: 'agent-cos-id',
                    Name: 'Chief of Staff',
                },
            ],
        },
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            EnsureLoaded: vi.fn().mockResolvedValue(undefined),
            GetAgentRequestTypeByName: (name: string) =>
                name === 'Approval' ? { ID: 'approval-type-id', Name: 'Approval' } : undefined,
        },
    },
}));

vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Providers() {
                return mockProvidersList;
            },
            GetProvider: mockGetProvider,
        },
    },
}));

import {
    BaseUserScopedCommunicationAction,
    VerifyMyCommunicationCapabilitiesAction,
    GetMyCalendarAndAvailabilityAction,
    ManageMyCalendarEventAction,
    ManageMyEmailInboxAction,
} from '../custom/ai/chief-of-staff-calendar-email.action';

const aliceUser = {
    ID: 'user-alice-1',
    Name: 'Alice Executive',
    Email: 'alice@bluecypress.io',
    IsActive: true,
} as UserInfo;

function buildProviderEntity(
    overrides: Partial<{
        Name: string;
        Status: MJCommunicationProviderEntity['Status'];
        SupportsCalendar: boolean;
        SupportsFreeBusy: boolean;
        EnterpriseScopeMode: MJCommunicationProviderEntity['EnterpriseScopeMode'];
        AllowedEmailDomains: string | null;
    }> = {}
): MJCommunicationProviderEntity {
    return {
        ID: 'prov-msgraph-1',
        Name: 'Microsoft Graph',
        Status: 'Active',
        SupportsCalendar: true,
        SupportsFreeBusy: true,
        EnterpriseScopeMode: 'SecurityGroupScoped',
        AllowedEmailDomains: 'bluecypress.io, association.org',
        ...overrides,
    } as unknown as MJCommunicationProviderEntity;
}

function buildPolicy(
    overrides: Partial<{
        Status: MJAIAgentUserPolicyEntity['Status'];
        EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
        CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'];
        RequireApprovalForExternalComms: boolean;
    }> = {}
): MJAIAgentUserPolicyEntity {
    return {
        ID: 'policy-alice-1',
        AgentID: 'agent-cos-id',
        UserID: 'user-alice-1',
        Status: 'Active',
        EmailChannelMode: 'DraftOnly',
        CalendarChannelMode: 'ProposeWithApproval',
        PhoneChannelMode: 'OutboundWithApproval',
        MessagingChannelMode: 'Enabled',
        RequireApprovalForExternalComms: true,
        ...overrides,
    } as unknown as MJAIAgentUserPolicyEntity;
}

describe('Chief of Staff User-Scoped Calendar, Email, and External Scheduling Actions', () => {
    const originalFetch = globalThis.fetch;

    const savedApprovalRequests: Array<{ ID: string; RequestTypeID: string | null }> = [];

    beforeEach(() => {
        vi.clearAllMocks();
        AgentUserPolicyEngine.Instance.ClearCache();
        mockProvidersList.length = 0;
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        savedApprovalRequests.length = 0;
        mockGetEntityObjectFn.mockImplementation(async () => {
            const stub = {
                ID: 'approval-req-123',
                RequestTypeID: null as string | null,
                Save: vi.fn(async () => {
                    savedApprovalRequests.push(stub);
                    return true;
                }),
            };
            return stub;
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe('Domain Verification & EnterpriseMailboxSecurityGate', () => {
        it('validates AllowedEmailDomains case-insensitively and strips leading @', () => {
            expect(
                BaseUserScopedCommunicationAction.IsEmailDomainAllowed(
                    'Alice@BlueCypress.io',
                    'bluecypress.io, @association.org'
                )
            ).toBe(true);
            expect(
                BaseUserScopedCommunicationAction.IsEmailDomainAllowed(
                    'alice@personal-gmail.com',
                    'bluecypress.io, association.org'
                )
            ).toBe(false);
            expect(BaseUserScopedCommunicationAction.IsEmailDomainAllowed('alice@any.com', null)).toBe(true);
        });

        it('blocks personal calendar access when EnterpriseScopeMode is UtilityMailboxesOnly', async () => {
            mockProvidersList.push(
                buildProviderEntity({
                    EnterpriseScopeMode: 'UtilityMailboxesOnly',
                })
            );
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn(),
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const action = new GetMyCalendarAndAvailabilityAction();
            const res = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [{ Name: 'Operation', Value: 'GetEvents', Type: 'Input' }],
            } as unknown as RunActionParams);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('UTILITY_MAILBOXES_ONLY');
        });

        it('blocks personal mailbox access when user email domain does not match AllowedEmailDomains', async () => {
            mockProvidersList.push(
                buildProviderEntity({
                    EnterpriseScopeMode: 'SecurityGroupScoped',
                    AllowedEmailDomains: 'enterprise-only.com',
                })
            );
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn(),
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const action = new GetMyCalendarAndAvailabilityAction();
            const res = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [{ Name: 'Operation', Value: 'GetEvents', Type: 'Input' }],
            } as unknown as RunActionParams);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('DOMAIN_MISMATCH');
        });

        it('blocks personal calendar access when Exchange Application Access Policy preflight returns CanReadCalendar=false', async () => {
            mockProvidersList.push(buildProviderEntity({ EnterpriseScopeMode: 'SecurityGroupScoped' }));
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: false,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: false,
                    CanReadCalendar: false,
                    ErrorMessage: 'ErrorAccessDenied: Application is not authorized for this mailbox.',
                }),
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const action = new GetMyCalendarAndAvailabilityAction();
            const res = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [{ Name: 'Operation', Value: 'GetEvents', Type: 'Input' }],
            } as unknown as RunActionParams);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('MAILBOX_ACCESS_DENIED_BY_TENANT_POLICY');
        });
    });

    describe('VerifyMyCommunicationCapabilitiesAction', () => {
        it('returns complete capabilities report across providers, user policy, and utility mailboxes', async () => {
            mockProvidersList.push(buildProviderEntity());
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: true,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: true,
                    CanReadCalendar: true,
                }),
            });
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    {
                        ID: 'bridge-1',
                        IdentityValue: 'maya-alice@bluecypress.io',
                        DisplayName: 'Maya (Chief of Staff for Alice)',
                    },
                ],
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const action = new VerifyMyCommunicationCapabilitiesAction();
            const params: RunActionParams = {
                ContextUser: aliceUser,
                Params: [{ Name: 'HubSpotAccessToken', Value: 'hs-token', Type: 'Input' }],
            } as unknown as RunActionParams;

            const res = await action['InternalRunAction'](params);
            expect(res.Success).toBe(true);
            const reportParam = params.Params.find((p) => p.Name === 'CapabilitiesReport');
            expect(reportParam?.Value).toMatchObject({
                User: { Email: 'alice@bluecypress.io' },
                UserPolicy: {
                    EmailChannelMode: 'DraftOnly',
                    CalendarChannelMode: 'ProposeWithApproval',
                },
                AgentUtilityMailbox: {
                    Address: 'maya-alice@bluecypress.io',
                },
                ExternalSchedulingConnectors: {
                    HubSpotMeetingsAvailable: true,
                    CalendlyAvailable: false,
                },
            });
        });
    });

    describe('GetMyCalendarAndAvailabilityAction — MS Graph, HubSpot Meetings API v3 & Calendly API v2', () => {
        it('queries GetEvents, GetFreeBusy, and FindMeetingTimes pinned strictly to contextUser.Email', async () => {
            mockProvidersList.push(buildProviderEntity());
            const mockGetEvents = vi.fn().mockResolvedValue({
                Success: true,
                Events: [{ ExternalSystemRecordID: 'evt-1', Subject: 'Exec Staff Meeting', Attendees: [] }],
            });
            const mockGetFreeBusy = vi.fn().mockResolvedValue({
                Success: true,
                Schedules: [{ ScheduleID: 'alice@bluecypress.io', Slots: [] }],
            });
            const mockFindMeetingTimes = vi.fn().mockResolvedValue({
                Success: true,
                Suggestions: [{ StartTime: new Date('2026-10-20T15:00:00Z'), EndTime: new Date('2026-10-20T15:30:00Z'), Confidence: 100, AttendeeAvailability: [] }],
            });

            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: true,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: true,
                    CanReadCalendar: true,
                }),
                GetEvents: mockGetEvents,
                GetFreeBusy: mockGetFreeBusy,
                FindMeetingTimes: mockFindMeetingTimes,
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const action = new GetMyCalendarAndAvailabilityAction();

            // 1. GetEvents
            const eventsRes = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [{ Name: 'Operation', Value: 'GetEvents', Type: 'Input' }],
            } as unknown as RunActionParams);
            expect(eventsRes.Success).toBe(true);
            expect(mockGetEvents).toHaveBeenCalledWith(
                expect.objectContaining({ Identifier: 'alice@bluecypress.io' })
            );

            // 2. GetFreeBusy
            const fbRes = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'GetFreeBusy', Type: 'Input' },
                    { Name: 'AttendeeEmails', Value: 'bob@bluecypress.io', Type: 'Input' },
                ],
            } as unknown as RunActionParams);
            expect(fbRes.Success).toBe(true);
            expect(mockGetFreeBusy).toHaveBeenCalledWith(
                expect.objectContaining({
                    Identifier: 'alice@bluecypress.io',
                    Schedules: ['alice@bluecypress.io', 'bob@bluecypress.io'],
                })
            );

            // 3. FindMeetingTimes
            const findRes = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'FindMeetingTimes', Type: 'Input' },
                    { Name: 'AttendeeEmails', Value: 'bob@bluecypress.io', Type: 'Input' },
                    { Name: 'DurationMinutes', Value: 45, Type: 'Input' },
                ],
            } as unknown as RunActionParams);
            expect(findRes.Success).toBe(true);
            expect(mockFindMeetingTimes).toHaveBeenCalledWith(
                expect.objectContaining({
                    Identifier: 'alice@bluecypress.io',
                    DurationMinutes: 45,
                })
            );
        });

        it('queries HubSpot Meetings API v3 and Calendly API v2 for external scheduling availability and enforces Calendly identity lock', async () => {
            AgentUserPolicyEngine.Instance.SetCachedPolicy(buildPolicy());

            const mockFetch = vi.fn().mockImplementation(async (url: string) => {
                if (url.includes('api.hubapi.com/scheduler/v3/meetings/meeting-links/book/availability-page')) {
                    return {
                        ok: true,
                        json: async () => ({
                            linkAvailability: {
                                linkAvailabilityByDuration: {
                                    '1800000': {
                                        availabilities: [
                                            { startMillisUtc: 1792508400000, endMillisUtc: 1792510200000 },
                                        ],
                                    },
                                },
                            },
                        }),
                    };
                }
                if (url.includes('api.hubapi.com/scheduler/v3/meetings/meeting-links')) {
                    return {
                        ok: true,
                        json: async () => ({
                            results: [
                                {
                                    slug: 'alice-30min',
                                    name: '30 Minute Executive Sync',
                                    link: 'https://meetings.hubspot.com/alice/30min',
                                },
                            ],
                        }),
                    };
                }
                if (url.includes('api.calendly.com/users/me')) {
                    return {
                        ok: true,
                        json: async () => ({
                            resource: {
                                uri: 'https://api.calendly.com/users/U1',
                                email: 'alice@bluecypress.io',
                                name: 'Alice Executive',
                            },
                        }),
                    };
                }
                if (url.includes('api.calendly.com/event_types')) {
                    return {
                        ok: true,
                        json: async () => ({
                            collection: [
                                {
                                    uri: 'https://api.calendly.com/event_types/ET1',
                                    name: 'Calendly Coffee Chat',
                                    scheduling_url: 'https://calendly.com/alice/coffee',
                                    duration: 30,
                                },
                            ],
                        }),
                    };
                }
                if (url.includes('api.calendly.com/event_type_available_times')) {
                    return {
                        ok: true,
                        json: async () => ({
                            collection: [
                                {
                                    start_time: '2026-10-22T16:00:00Z',
                                    scheduling_url: 'https://calendly.com/alice/coffee/2026-10-22T16:00:00Z',
                                },
                            ],
                        }),
                    };
                }
                return { ok: false, status: 404 };
            });
            globalThis.fetch = mockFetch as unknown as typeof fetch;

            const action = new GetMyCalendarAndAvailabilityAction();
            const params: RunActionParams = {
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'CheckExternalSchedulingAvailability', Type: 'Input' },
                    { Name: 'HubSpotAccessToken', Value: 'hs-pat-123', Type: 'Input' },
                    { Name: 'CalendlyAccessToken', Value: 'cal-pat-123', Type: 'Input' },
                ],
            } as unknown as RunActionParams;

            const res = await action['InternalRunAction'](params);
            expect(res.Success).toBe(true);
            const slots = params.Params.find((p) => p.Name === 'ExternalAvailabilitySlots')?.Value as Array<{
                Source: string;
            }>;
            expect(slots).toHaveLength(2);
            expect(slots.map((s) => s.Source)).toEqual(['HubSpot', 'Calendly']);
        });
    });

    describe('ManageMyCalendarEventAction — ProposeWithApproval vs Autonomous', () => {
        it('executes DryRun and creates an AIAgentRequest approval when CalendarChannelMode is ProposeWithApproval', async () => {
            mockProvidersList.push(buildProviderEntity());
            const mockCreateCalendarEvent = vi.fn().mockResolvedValue({
                Success: true,
                DryRun: true,
                Event: {
                    ExternalSystemRecordID: 'DRY_RUN_EVENT_ID',
                    Subject: 'Board Prep Review',
                },
            });
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: true,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: true,
                    CanReadCalendar: true,
                }),
                CreateCalendarEvent: mockCreateCalendarEvent,
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                buildPolicy({ CalendarChannelMode: 'ProposeWithApproval' })
            );

            const action = new ManageMyCalendarEventAction();
            const params: RunActionParams = {
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'Create', Type: 'Input' },
                    { Name: 'Subject', Value: 'Board Prep Review', Type: 'Input' },
                    { Name: 'StartTime', Value: '2026-10-23T14:00:00Z', Type: 'Input' },
                    { Name: 'EndTime', Value: '2026-10-23T14:30:00Z', Type: 'Input' },
                    { Name: 'AttendeeEmails', Value: 'bob@bluecypress.io', Type: 'Input' },
                ],
            } as unknown as RunActionParams;

            const res = await action['InternalRunAction'](params);
            expect(res.Success).toBe(true);
            expect(res.ResultCode).toBe('APPROVAL_REQUIRED');
            expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    Identifier: 'alice@bluecypress.io',
                    DryRun: true,
                })
            );
            const approvalId = params.Params.find((p) => p.Name === 'ApprovalRequestID')?.Value;
            expect(approvalId).toBe('approval-req-123');
            // The Approval request type comes from the AI engine cache by name, never a hardcoded id.
            expect(savedApprovalRequests[0]?.RequestTypeID).toBe('approval-type-id');
        });

        it('executes live CreateCalendarEvent when CalendarChannelMode is Autonomous', async () => {
            mockProvidersList.push(buildProviderEntity());
            const mockCreateCalendarEvent = vi.fn().mockResolvedValue({
                Success: true,
                Event: {
                    ExternalSystemRecordID: 'live-evt-1',
                    Subject: 'Autonomous Sync',
                },
                OnlineMeetingUrl: 'https://teams.microsoft.com/l/meetup-join/999',
            });
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: true,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: true,
                    CanReadCalendar: true,
                }),
                CreateCalendarEvent: mockCreateCalendarEvent,
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                buildPolicy({ CalendarChannelMode: 'Autonomous' })
            );

            const action = new ManageMyCalendarEventAction();
            const params: RunActionParams = {
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'Create', Type: 'Input' },
                    { Name: 'Subject', Value: 'Autonomous Sync', Type: 'Input' },
                    { Name: 'StartTime', Value: '2026-10-23T14:00:00Z', Type: 'Input' },
                    { Name: 'EndTime', Value: '2026-10-23T14:30:00Z', Type: 'Input' },
                ],
            } as unknown as RunActionParams;

            const res = await action['InternalRunAction'](params);
            expect(res.Success).toBe(true);
            expect(res.ResultCode).toBe('SUCCESS');
            expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    Identifier: 'alice@bluecypress.io',
                    DryRun: false,
                })
            );
        });
    });

    describe('ManageMyEmailInboxAction — DraftOnly & UtilityMailbox Routing', () => {
        it('allows CreateDraft under DraftOnly and blocks direct Reply sending', async () => {
            mockProvidersList.push(buildProviderEntity());
            const mockCreateDraft = vi.fn().mockResolvedValue({
                Success: true,
                DraftID: 'draft-777',
            });
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                VerifyMailboxAccess: vi.fn().mockResolvedValue({
                    Success: true,
                    Identifier: 'alice@bluecypress.io',
                    CanReadMail: true,
                    CanReadCalendar: true,
                }),
                CreateDraft: mockCreateDraft,
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                buildPolicy({ EmailChannelMode: 'DraftOnly' })
            );

            const action = new ManageMyEmailInboxAction();
            const draftRes = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'CreateDraft', Type: 'Input' },
                    { Name: 'To', Value: 'board@bluecypress.io', Type: 'Input' },
                    { Name: 'Subject', Value: 'Q4 Packet', Type: 'Input' },
                    { Name: 'Body', Value: 'Attached is the Q4 summary.', Type: 'Input' },
                ],
            } as unknown as RunActionParams);
            expect(draftRes.Success).toBe(true);
            expect(mockCreateDraft).toHaveBeenCalled();

            const replyRes = await action['InternalRunAction']({
                ContextUser: aliceUser,
                Params: [
                    { Name: 'Operation', Value: 'Reply', Type: 'Input' },
                    { Name: 'MessageID', Value: 'msg-1', Type: 'Input' },
                    { Name: 'Body', Value: 'Approved.', Type: 'Input' },
                ],
            } as unknown as RunActionParams);
            expect(replyRes.Success).toBe(false);
            expect(replyRes.ResultCode).toBe('POLICY_DENIED');
        });

        it('routes email operations through the dedicated agent utility inbox when EnterpriseScopeMode is UtilityMailboxesOnly', async () => {
            mockProvidersList.push(
                buildProviderEntity({ EnterpriseScopeMode: 'UtilityMailboxesOnly' })
            );
            const mockGetMessages = vi.fn().mockResolvedValue({
                Success: true,
                Messages: [{ ExternalSystemRecordID: 'm-1', Subject: 'Update from Finance' }],
            });
            mockGetProvider.mockReturnValue({
                supportsOperation: () => true,
                GetMessages: mockGetMessages,
            });
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [
                    {
                        ID: 'bridge-1',
                        IdentityValue: 'maya-alice@bluecypress.io',
                        DisplayName: 'Maya (CoS for Alice)',
                    },
                ],
            });
            AgentUserPolicyEngine.Instance.SetCachedPolicy(
                buildPolicy({ EmailChannelMode: 'SendAsAgent' })
            );

            const action = new ManageMyEmailInboxAction();
            const params: RunActionParams = {
                ContextUser: aliceUser,
                Params: [{ Name: 'Operation', Value: 'ListMessages', Type: 'Input' }],
            } as unknown as RunActionParams;

            const res = await action['InternalRunAction'](params);
            expect(res.Success).toBe(true);
            expect(mockGetMessages).toHaveBeenCalledWith(
                expect.objectContaining({
                    Identifier: 'maya-alice@bluecypress.io',
                })
            );
        });
    });
});
