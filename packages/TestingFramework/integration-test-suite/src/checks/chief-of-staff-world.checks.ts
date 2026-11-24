/**
 * chief-of-staff-world.checks.ts — the 'chief-of-staff-world' bundle (COSW1–COSW3, IT183):
 * idempotent persistent World Model seed for Chief of Staff core MJ layers.
 *
 * Unlike ephemeral test bundles that tear down all created rows, this IT0-style world builder
 * deliberately leaves realistic, human-navigable Chief of Staff sample data in the database:
 *   - Two non-Owner UI-role executive personas (Jordan Blake + Elena Rostova) with active
 *     `MJ: AI Agent User Policies` (`CoordinationMode = 'Coordinator'`, `EmailChannelMode = 'DraftOnly'`,
 *     `AllowInterAgentCoordination = true`, `OnboardingStatus = 'Completed'`).
 *   - Two active offered-rhythm `MJ: User Routines` scheduled in the future (no unwanted firing),
 *     three realistic `MJ: AI Agent Suggestions` (`Offered`, `Accepted`, `Declined`), and two
 *     `MJ: AI Agent Notes` capturing executive preferences and constraints.
 *   - One observable multi-participant `MJ: Agent Channels` coordination thread
 *     (`CoS World — Q4 Executive Launch Alignment`) with both Jordan Blake and Elena Rostova
 *     enrolled in `MJ: Agent Channel Participants` and a multi-turn agent + human conversation.
 *
 * Fully idempotent: running the bundle repeatedly finds existing records by deterministic keys
 * and converges without creating duplicates or disturbing unrelated rows.
 */
import { CompositeKey, DatabaseProviderBase, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import {
    MJAIAgentNoteEntity,
    MJAIAgentSuggestionEntity,
    MJAIAgentUserPolicyEntity,
    MJAgentChannelEntity,
    MJAgentChannelParticipantEntity,
    MJConversationDetailEntity,
    MJUserEntity,
    MJUserRoleEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
} from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

export const COS_WORLD_JORDAN_EMAIL = 'jordan.blake@cos-world.test';
export const COS_WORLD_ELENA_EMAIL = 'elena.rostova@cos-world.test';
export const COS_WORLD_CHANNEL_TOPIC = 'CoS World — Q4 Executive Launch Alignment';

export interface ChiefOfStaffWorldState {
    ChiefOfStaffAgentID: string;
    JordanUserID: string;
    ElenaUserID: string;
    JordanPolicyID: string;
    ElenaPolicyID: string;
    RoutineIDs: string[];
    SuggestionIDs: string[];
    NoteIDs: string[];
    AgentChannelID: string;
}

const CHIEF_OF_STAFF_NAME = 'Chief of Staff';
let worldState: ChiefOfStaffWorldState | null = null;

export function GetChiefOfStaffWorldState(): ChiefOfStaffWorldState | null {
    return worldState;
}

function getProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    return ctx.Provider as DatabaseProviderBase;
}

async function ensureWorldUser(
    provider: DatabaseProviderBase,
    adminUser: UserInfo,
    uiRoleID: string,
    spec: { Email: string; Name: string; FirstName: string; LastName: string; Title: string },
): Promise<UserInfo> {
    const rv = RunView.FromMetadataProvider(provider);
    const existing = await rv.RunView<MJUserEntity>(
        {
            EntityName: 'MJ: Users',
            ExtraFilter: `Email='${EscapeSQLString(spec.Email)}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        adminUser,
    );
    Assert(existing.Success, `RunView(MJ: Users) for ${spec.Email} failed: ${existing.ErrorMessage}`);

    let userEntity = existing.Results[0] ?? null;
    if (!userEntity) {
        userEntity = await provider.GetEntityObject<MJUserEntity>('MJ: Users', adminUser);
        userEntity.NewRecord();
        userEntity.Name = spec.Name;
        userEntity.FirstName = spec.FirstName;
        userEntity.LastName = spec.LastName;
        userEntity.Title = spec.Title;
        userEntity.Email = spec.Email;
        userEntity.Type = 'User';
        userEntity.IsActive = true;
        Assert(await userEntity.Save(), `Creating CoS world user ${spec.Email} failed: ${userEntity.LatestResult?.CompleteMessage}`);
    }

    const roleCheck = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: User Roles',
            ExtraFilter: `UserID='${userEntity.ID}' AND RoleID='${uiRoleID}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true,
        },
        adminUser,
    );
    if (roleCheck.Success && roleCheck.Results.length === 0) {
        const ur = await provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', adminUser);
        ur.NewRecord();
        ur.UserID = userEntity.ID;
        ur.RoleID = uiRoleID;
        Assert(await ur.Save(), `Assigning UI role to ${spec.Email} failed: ${ur.LatestResult?.CompleteMessage}`);
    }

    await UserCache.Instance.Refresh(provider);
    const cached = UserCache.Instance.Users.find((u) => (u.Email ?? '').toLowerCase() === spec.Email.toLowerCase());
    Assert(!!cached, `World user ${spec.Email} not found in UserCache after refresh`);
    return cached!;
}

async function ensureWorldPolicy(
    provider: DatabaseProviderBase,
    adminUser: UserInfo,
    agentID: string,
    targetUserID: string,
    displayNameOverride: string,
): Promise<MJAIAgentUserPolicyEntity> {
    const rv = RunView.FromMetadataProvider(provider);
    const existing = await rv.RunView<MJAIAgentUserPolicyEntity>(
        {
            EntityName: 'MJ: AI Agent User Policies',
            ExtraFilter: `AgentID='${agentID}' AND UserID='${targetUserID}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
            BypassCache: true,
        },
        adminUser,
    );
    Assert(existing.Success, `RunView(MJ: AI Agent User Policies) failed: ${existing.ErrorMessage}`);

    let policy = existing.Results[0] ?? null;
    if (!policy) {
        policy = await provider.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', adminUser);
        policy.NewRecord();
        policy.AgentID = agentID;
        policy.UserID = targetUserID;
    }
    policy.DisplayNameOverride = displayNameOverride;
    policy.Status = 'Active';
    policy.OnboardingStatus = 'Completed';
    policy.CoordinationMode = 'Coordinator';
    policy.EmailChannelMode = 'DraftOnly';
    policy.CalendarChannelMode = 'ReadOnly';
    policy.AllowInterAgentCoordination = true;
    policy.RequireApprovalForExternalComms = true;
    policy.RequireApprovalForFinancials = true;
    policy.RequireApprovalForDestructiveActions = true;
    Assert(await policy.Save(), `Saving CoS world policy failed: ${policy.LatestResult?.CompleteMessage}`);
    return policy;
}

async function runCoreAction(
    actionName: string,
    params: ActionParam[],
    user: UserInfo,
): Promise<{ Success: boolean; ResultCode: string; Message: string; Params: ActionParam[] }> {
    const action = ActionEngineServer.Instance.Actions.find((a) => a.Name === actionName && a.Status === 'Active');
    Assert(!!action, `Core action '${actionName}' must exist and be Active`);
    const runParams: RunActionParams = {
        Action: action!,
        ContextUser: user,
        Params: params,
        SkipActionLog: true,
        Filters: [],
    };
    const res = await ActionEngineServer.Instance.RunAction(runParams);
    return {
        Success: res.Success,
        ResultCode: res.Result?.ResultCode ?? '',
        Message: res.Message ?? '',
        Params: res.Params ?? [],
    };
}

export const ChiefOfStaffWorldChecks: NamedCheck[] = [
    {
        Id: 'chief-of-staff-world.COSW1',
        Name: 'COSW1: Seed persistent Chief of Staff executive personas (Jordan Blake & Elena Rostova) with active Coordinator policies',
        Fn: async (ctx: IntegrationCheckContext) => {
            const provider = getProvider(ctx);
            await AIEngine.Instance.Config(false, ctx.User, provider);
            await AIEngine.Instance.RefreshNoteEmbeddings(ctx.User);
            await ActionEngineServer.Instance.Config(false, ctx.User, provider);

            const cosAgent = AIEngine.Instance.Agents.find(
                (a) => (a.Name ?? '').trim().toLowerCase() === CHIEF_OF_STAFF_NAME.toLowerCase(),
            );
            Assert(!!cosAgent, "Chief of Staff agent must exist in MJ: AI Agents");

            const rv = RunView.FromMetadataProvider(provider);
            const uiRoleRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Roles',
                    ExtraFilter: `Name='UI'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User,
            );
            Assert(uiRoleRes.Success && uiRoleRes.Results.length === 1, 'UI role must exist in MJ: Roles');
            const uiRoleID = uiRoleRes.Results[0].ID;

            const jordan = await ensureWorldUser(provider, ctx.User, uiRoleID, {
                Email: COS_WORLD_JORDAN_EMAIL,
                Name: 'Jordan Blake',
                FirstName: 'Jordan',
                LastName: 'Blake',
                Title: 'Chief Operating Officer',
            });
            const elena = await ensureWorldUser(provider, ctx.User, uiRoleID, {
                Email: COS_WORLD_ELENA_EMAIL,
                Name: 'Elena Rostova',
                FirstName: 'Elena',
                LastName: 'Rostova',
                Title: 'VP of Finance',
            });

            const jordanPolicy = await ensureWorldPolicy(provider, ctx.User, cosAgent!.ID, jordan.ID, "Jordan's Chief of Staff");
            const elenaPolicy = await ensureWorldPolicy(provider, ctx.User, cosAgent!.ID, elena.ID, "Elena's Chief of Staff");

            worldState = {
                ChiefOfStaffAgentID: cosAgent!.ID,
                JordanUserID: jordan.ID,
                ElenaUserID: elena.ID,
                JordanPolicyID: jordanPolicy.ID,
                ElenaPolicyID: elenaPolicy.ID,
                RoutineIDs: [],
                SuggestionIDs: [],
                NoteIDs: [],
                AgentChannelID: '',
            };

            Assert(jordan.Type?.trim().toLowerCase() === 'user', `COSW1: Jordan Blake must be a non-Owner UI user (got '${jordan.Type}')`);
            Assert(elena.Type?.trim().toLowerCase() === 'user', `COSW1: Elena Rostova must be a non-Owner UI user (got '${elena.Type}')`);
            AssertEqual(jordanPolicy.Status, 'Active', 'COSW1: Jordan CoS policy is Active');
            AssertEqual(elenaPolicy.Status, 'Active', 'COSW1: Elena CoS policy is Active');
        },
    },
    {
        Id: 'chief-of-staff-world.COSW2',
        Name: 'COSW2: Seed persistent offered-rhythm User Routines, AI Agent Suggestions (Offered/Accepted/Declined), and executive memory notes',
        Fn: async (ctx: IntegrationCheckContext) => {
            Assert(!!worldState, 'COSW1 must run before COSW2');
            const ws = worldState!;
            const provider = getProvider(ctx);
            const rv = RunView.FromMetadataProvider(provider);

            // 1. Seed two realistic future-scheduled CoS routines for Jordan Blake (idempotent by Name + UserID)
            const routineSpecs = [
                {
                    Name: 'CoS World — Executive Morning Briefing',
                    Description: 'Daily executive briefing assembling priorities, approvals, calendar, and cross-app skill signals.',
                    CronExpression: '0 7 * * 1-5',
                },
                {
                    Name: 'CoS World — Weekly Executive Alignment Review',
                    Description: 'Friday synthesis of open commitments, strategic OKR drift, and next-week leadership prep.',
                    CronExpression: '0 15 * * 5',
                },
            ];

            const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            for (const spec of routineSpecs) {
                const existing = await rv.RunView<MJUserRoutineEntity>(
                    {
                        EntityName: 'MJ: User Routines',
                        ExtraFilter: `UserID='${ws.JordanUserID}' AND Name='${EscapeSQLString(spec.Name)}'`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    ctx.User,
                );
                let routine = existing.Results[0] ?? null;
                if (!routine) {
                    routine = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', ctx.User);
                    routine.NewRecord();
                    routine.UserID = ws.JordanUserID;
                    routine.Name = spec.Name;
                    routine.RoutineType = 'Scheduled';
                    routine.ScheduleMode = 'Recurring';
                    routine.TargetType = 'Agent';
                    routine.TargetID = ws.ChiefOfStaffAgentID;
                    routine.Timezone = 'America/Chicago';
                }
                routine.Description = spec.Description;
                routine.CronExpression = spec.CronExpression;
                routine.Status = 'Active';
                routine.NextRunAt = nextWeek;
                Assert(await routine.Save(), `Saving world routine '${spec.Name}' failed: ${routine.LatestResult?.CompleteMessage}`);
                ws.RoutineIDs.push(routine.ID);
            }
            AssertEqual(ws.RoutineIDs.length, 2, 'COSW2: 2 persistent CoS world routines committed');

            // 2. Seed three realistic AI Agent Suggestions across Offered / Accepted / Declined states
            const suggestionSpecs: Array<{
                Kind: MJAIAgentSuggestionEntity['Kind'];
                TargetKey: string;
                Summary: string;
                Status: MJAIAgentSuggestionEntity['Status'];
            }> = [
                {
                    Kind: 'Rhythm',
                    TargetKey: 'cos-world:rhythm:monday-exec-prep',
                    Summary: 'Enable a Monday 7:30 AM executive leadership prep brief ahead of the 9 AM L10 huddle.',
                    Status: 'Offered',
                },
                {
                    Kind: 'Skill',
                    TargetKey: 'cos-world:skill:post-meeting-transcripts',
                    Summary: 'Automatically process Zoom transcripts after external customer calls to extract follow-up commitments.',
                    Status: 'Accepted',
                },
                {
                    Kind: 'Behavior',
                    TargetKey: 'cos-world:behavior:auto-archive-newsletters',
                    Summary: 'Auto-archive recurring vendor marketing digests without surfacing them in the morning briefing.',
                    Status: 'Declined',
                },
            ];

            for (const spec of suggestionSpecs) {
                const existing = await rv.RunView<MJAIAgentSuggestionEntity>(
                    {
                        EntityName: 'MJ: AI Agent Suggestions',
                        ExtraFilter: `AgentID='${ws.ChiefOfStaffAgentID}' AND UserID='${ws.JordanUserID}' AND TargetKey='${EscapeSQLString(spec.TargetKey)}'`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    ctx.User,
                );
                let suggestion = existing.Results[0] ?? null;
                if (!suggestion) {
                    suggestion = await provider.GetEntityObject<MJAIAgentSuggestionEntity>('MJ: AI Agent Suggestions', ctx.User);
                    suggestion.NewRecord();
                    suggestion.AgentID = ws.ChiefOfStaffAgentID;
                    suggestion.UserID = ws.JordanUserID;
                    suggestion.TargetKey = spec.TargetKey;
                    suggestion.OfferedAt = new Date();
                }
                suggestion.Kind = spec.Kind;
                suggestion.Summary = spec.Summary;
                suggestion.Status = spec.Status;
                suggestion.RespondedAt = spec.Status === 'Offered' ? null : new Date();
                Assert(await suggestion.Save(), `Saving world suggestion '${spec.TargetKey}' failed: ${suggestion.LatestResult?.CompleteMessage}`);
                ws.SuggestionIDs.push(suggestion.ID);
            }
            AssertEqual(ws.SuggestionIDs.length, 3, 'COSW2: 3 persistent CoS suggestions committed');

            // 3. Seed two realistic executive AI Agent Notes for Jordan Blake
            const noteSpecs: Array<{ Type: MJAIAgentNoteEntity['Type']; Note: string }> = [
                {
                    Type: 'Preference',
                    Note: 'CoS World: Keep morning executive briefings under 6 bullet points and lead with decisions requiring sign-off today.',
                },
                {
                    Type: 'Constraint',
                    Note: 'CoS World: Never send external vendor or board emails directly; always stage drafts for Jordan to review first.',
                },
            ];

            for (const spec of noteSpecs) {
                const existing = await rv.RunView<MJAIAgentNoteEntity>(
                    {
                        EntityName: 'MJ: AI Agent Notes',
                        ExtraFilter: `AgentID='${ws.ChiefOfStaffAgentID}' AND UserID='${ws.JordanUserID}' AND Note='${EscapeSQLString(spec.Note)}'`,
                        MaxRows: 1,
                        ResultType: 'entity_object',
                        BypassCache: true,
                    },
                    ctx.User,
                );
                let note = existing.Results[0] ?? null;
                if (!note) {
                    note = await provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', ctx.User);
                    note.NewRecord();
                    note.AgentID = ws.ChiefOfStaffAgentID;
                    note.UserID = ws.JordanUserID;
                    note.Type = spec.Type;
                    note.Note = spec.Note;
                    note.Status = 'Active';
                    note.IsAutoGenerated = false;
                    Assert(await note.Save(), `Saving world agent note failed: ${note.LatestResult?.CompleteMessage}`);
                }
                ws.NoteIDs.push(note.ID);
            }
            AssertEqual(ws.NoteIDs.length, 2, 'COSW2: 2 persistent executive memory notes committed');
        },
    },
    {
        Id: 'chief-of-staff-world.COSW3',
        Name: 'COSW3: Seed persistent observable Agent Channel with Jordan Blake & Elena Rostova and multi-turn coordination thread',
        Fn: async (ctx: IntegrationCheckContext) => {
            Assert(!!worldState, 'COSW1 must run before COSW3');
            const ws = worldState!;
            const provider = getProvider(ctx);
            const rv = RunView.FromMetadataProvider(provider);

            const jordanUser = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, ws.JordanUserID));
            const elenaUser = UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, ws.ElenaUserID));
            Assert(!!jordanUser && !!elenaUser, 'COSW3: Jordan and Elena must exist in UserCache');

            const existingChannels = await rv.RunView<MJAgentChannelEntity>(
                {
                    EntityName: 'MJ: Agent Channels',
                    ExtraFilter: `Topic='${EscapeSQLString(COS_WORLD_CHANNEL_TOPIC)}'`,
                    MaxRows: 1,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                ctx.User,
            );
            Assert(existingChannels.Success, `RunView(MJ: Agent Channels) failed: ${existingChannels.ErrorMessage}`);

            let channelID = existingChannels.Results[0]?.ID ?? '';
            if (!channelID) {
                const opened = await runCoreAction(
                    'Open Agent Channel',
                    [
                        { Name: 'Topic', Type: 'Input', Value: COS_WORLD_CHANNEL_TOPIC },
                        { Name: 'TargetUserIDs', Type: 'Input', Value: JSON.stringify([ws.ElenaUserID]) },
                        {
                            Name: 'InitialMessage',
                            Type: 'Input',
                            Value: "Jordan's Chief of Staff: Confirming Q4 board deck revenue targets and close readiness milestones for Friday's leadership review.",
                        },
                    ],
                    jordanUser!,
                );
                Assert(opened.Success, `COSW3: Open Agent Channel failed: ${opened.Message}`);
                const idParam = opened.Params.find((p) => p.Name === 'ChannelID');
                channelID = String(idParam?.Value ?? '').trim();
                if (!channelID && opened.Message) {
                    try {
                        const parsed = JSON.parse(opened.Message) as { ChannelID?: string };
                        channelID = String(parsed.ChannelID ?? '').trim();
                    } catch { /* ignore non-JSON message */ }
                }
                Assert(channelID.length > 0, 'COSW3: Open Agent Channel must return ChannelID');

                const reply = await runCoreAction(
                    'Reply In Agent Channel',
                    [
                        { Name: 'ChannelID', Type: 'Input', Value: channelID },
                        {
                            Name: 'Message',
                            Type: 'Input',
                            Value: "Elena's Chief of Staff: Finance close milestones are on track; draft ARR variance table will be ready Thursday at 2 PM CT.",
                        },
                    ],
                    elenaUser!,
                );
                Assert(reply.Success, `COSW3: Elena reply in Agent Channel failed: ${reply.Message}`);
            }

            // Verify both participants and at least 2 messages are persisted on the observable channel
            const participants = await rv.RunView<MJAgentChannelParticipantEntity>(
                {
                    EntityName: 'MJ: Agent Channel Participants',
                    ExtraFilter: `AgentChannelID='${channelID}'`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                ctx.User,
            );
            Assert(participants.Success && participants.Results.length >= 2, 'COSW3: Agent Channel must have both Jordan and Elena enrolled');

            const messages = await rv.RunView<MJConversationDetailEntity>(
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${channelID}'`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                ctx.User,
            );
            Assert(messages.Success && messages.Results.length >= 2, 'COSW3: Agent Channel must contain multi-turn thread');

            // Verify the channel entity itself loads cleanly via CompositeKey
            const loadedChannel = await provider.GetEntityObject<MJAgentChannelEntity>('MJ: Agent Channels', ctx.User);
            Assert(await loadedChannel.InnerLoad(CompositeKey.FromID(channelID)), 'COSW3: Agent Channel loads by ID');
            AssertEqual(loadedChannel.Topic, COS_WORLD_CHANNEL_TOPIC, 'COSW3: Agent Channel topic preserved');

            ws.AgentChannelID = channelID;
        },
    },
];

for (const check of ChiefOfStaffWorldChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
