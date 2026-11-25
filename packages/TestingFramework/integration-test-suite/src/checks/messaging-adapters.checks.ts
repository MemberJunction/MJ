/**
 * messaging-adapters.checks.ts — the 'messaging-adapters' bundle (MA1–MA6):
 * deterministic server-side integration tests for `@memberjunction/messaging-adapters`.
 *
 * Exercises the REAL `UserCache.Instance`, REAL `AIEngineBase.Instance`, REAL
 * `AIAgentPermissionHelper`, REAL SQL Server catalog (`MJ: AI Agents`,
 * `MJ: AI Agent Permissions`, `MJ: Users`, `MJ: Roles`), and REAL `BaseMessagingAdapter`
 * with zero mocked MJ internals and zero LLM calls.
 *
 * - MA1 (read-only): Real `UserCache.Instance` integrity, active user email lookup, fail-closed
 *   refusal for unknown emails, and opt-in `AllowFallbackUser: true`.
 * - MA2 (read-only): Real catalog `IsDirectlyDiscoverable` enforcement — Sub-Agents, child
 *   agents, and Required templates are excluded from `AvailableAgentNames`, refused on direct
 *   mention, and rejected as `DefaultAgentName`.
 * - MA3 (read-only): `AllowedAgentIDs` host allow-list enforced against real agents across
 *   `Initialize`, `AvailableAgentNames`, and `@mention` routing.
 * - MA4 (read-only): End-to-end `HandleMessage` fail-closed refusal for unmapped senders posts
 *   refusal without showing a typing indicator or creating any run.
 * - MA5 (mutation-gated): Live `MJ: AI Agent Permissions` 2x2 RBAC (`CanView`/`CanRun`) on
 *   `@mention` plus inactive-user refusal against real throwaway DB fixtures.
 * - MA6 (mutation-gated): Thread affinity enforces the replying user's permissions without
 *   leaking hidden agent names.
 */
import {
    CompositeKey,
    DatabaseProviderBase,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentPermissionEntity,
    MJRoleEntity,
    MJUserEntity,
    MJUserRoleEntity,
} from '@memberjunction/core-entities';
import type { ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper, AIEngineBase } from '@memberjunction/ai-engine-base';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    BaseMessagingAdapter,
    type AgentResponseMetadata,
    type FormattedResponse,
    type IncomingMessage,
    type MessagingAdapterSettings,
    type ResolveAgentResult,
} from '@memberjunction/messaging-adapters';
import { EscapeSQLString, UUIDsEqual, UUIDSet } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { MutationTierOn } from './fixture-gates';

const BUNDLE = 'messaging-adapters';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/**
 * In-process concrete adapter extending the real `BaseMessagingAdapter` so only the
 * external messaging transport is stubbed; all MJ singletons, DB reads, and permission
 * checks execute for real.
 */
class InProcessMessagingAdapter extends BaseMessagingAdapter {
    public TypingShown = false;
    public FinalMessages: FormattedResponse[] = [];
    public FinalUpdates: Array<{ messageId: string; response: FormattedResponse }> = [];
    public LookupEmails = new Map<string, string>();
    public ThreadHistory: IncomingMessage[] = [];

    protected get PlatformName(): string {
        return 'IntegrationTestChat';
    }

    protected async onInitialize(): Promise<void> {
        // No external network socket to open.
    }

    protected async showTypingIndicator(_message: IncomingMessage, _agent?: MJAIAgentEntityExtended): Promise<void> {
        this.TypingShown = true;
    }

    protected async fetchThreadHistory(_channelId: string, _threadId: string): Promise<IncomingMessage[]> {
        return this.ThreadHistory;
    }

    protected async sendOrUpdateStreamingMessage(
        _originalMessage: IncomingMessage,
        _currentContent: string,
        existingMessageId: string | null,
        _agent?: MJAIAgentEntityExtended
    ): Promise<string> {
        return existingMessageId ?? 'it-stream-1';
    }

    protected async sendFinalMessage(_originalMessage: IncomingMessage, response: FormattedResponse): Promise<void> {
        this.FinalMessages.push(response);
    }

    protected async updateFinalMessage(
        _originalMessage: IncomingMessage,
        messageId: string,
        response: FormattedResponse
    ): Promise<void> {
        this.FinalUpdates.push({ messageId, response });
    }

    protected async formatResponse(
        _result: ExecuteAgentResult | null,
        _agent: MJAIAgentEntityExtended,
        responseText: string,
        _metadata?: AgentResponseMetadata
    ): Promise<FormattedResponse> {
        return {
            PlainText: responseText,
            RichPayload: { text: responseText },
        };
    }

    protected getBotUserId(): string {
        return 'IT-BOT-001';
    }

    protected stripBotMention(text: string): string {
        return text.replace(/<@IT-BOT-001>/g, '').trim();
    }

    protected async lookupUserEmail(platformUserId: string, _message?: IncomingMessage): Promise<string | null> {
        return this.LookupEmails.get(platformUserId) ?? null;
    }

    public ResolveUserForTest(message: IncomingMessage): Promise<UserInfo | null> {
        return this.resolveContextUser(message);
    }

    public ResolveAgentForTest(
        message: IncomingMessage,
        user: UserInfo,
        threadHistory: IncomingMessage[] = [],
        rememberedAgentId?: string
    ): Promise<ResolveAgentResult> {
        return this.resolveAgent(message, user, threadHistory, rememberedAgentId);
    }
}

interface ReadOnlyCatalogFixture {
    DiscoverableAgents: MJAIAgentEntityExtended[];
    NonDiscoverableAgents: MJAIAgentEntityExtended[];
    DefaultAgent: MJAIAgentEntityExtended;
    SecondDiscoverableAgent: MJAIAgentEntityExtended | null;
}

interface MutationRbacFixture {
    Prefix: string;
    AdminUser: UserInfo;
    RegularUser: UserInfo;
    InactiveEmail: string;
    DefaultAgent: MJAIAgentEntity;
    RestrictedAgent: MJAIAgentEntity;
    HiddenAgent: MJAIAgentEntity;
    CreatedPermIDs: string[];
    CreatedAgentIDs: string[];
    CreatedUserRoleIDs: string[];
    CreatedUserIDs: string[];
    CreatedRoleIDs: string[];
}

let catalogFixture: ReadOnlyCatalogFixture | undefined;
let mutationFixture: MutationRbacFixture | undefined;

function buildMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        MessageID: `it-msg-${Date.now()}`,
        Text: 'hello',
        SenderID: 'it-platform-user',
        SenderName: 'IT User',
        ChannelID: 'it-channel',
        ThreadID: null,
        IsDirectMessage: true,
        IsBotMention: false,
        Timestamp: new Date(),
        RawEvent: {},
        ...overrides,
    };
}

function buildSettings(
    contextUserEmail: string,
    defaultAgentName: string,
    overrides: Partial<MessagingAdapterSettings> = {}
): MessagingAdapterSettings {
    return {
        DefaultAgentName: defaultAgentName,
        ContextUserEmail: contextUserEmail,
        BotToken: 'it-not-a-real-token',
        ShowTypingIndicator: true,
        ...overrides,
    };
}

function requireCatalog(): ReadOnlyCatalogFixture {
    Assert(catalogFixture != null, `${BUNDLE}: read-only catalog fixture not initialized`);
    return catalogFixture!;
}

function requireMutationFixture(): MutationRbacFixture {
    Assert(mutationFixture != null, `${BUNDLE}: mutation fixture not initialized`);
    return mutationFixture!;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

async function checkMa1UserCacheAndFailClosedSenderMapping(ctx: IntegrationCheckContext): Promise<void> {
    const cat = requireCatalog();
    const userCountBefore = UserCache.Instance.Users.length;
    Assert(userCountBefore > 0, 'MA1: UserCache.Instance must be warmed before adapter Initialize');
    Assert(!!ctx.User.Email, 'MA1: ctx.User must have an Email address');

    const adapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, cat.DefaultAgent.Name!));
    await adapter.Initialize();

    // Regression guard: Initialize must never wipe UserCache.Instance
    AssertEqual(UserCache.Instance.Users.length, userCountBefore, 'MA1: Initialize must preserve UserCache.Instance');

    // Case-insensitive match on a real active MJ user
    const resolved = await adapter.ResolveUserForTest(buildMessage({ SenderEmail: ctx.User.Email.toUpperCase() }));
    Assert(resolved != null, 'MA1: active MJ user email should resolve');
    Assert(UUIDsEqual(resolved!.ID, ctx.User.ID), 'MA1: resolved user ID should match ctx.User.ID');

    // Fail closed by default for unknown external email and missing email
    const unknownEmail = await adapter.ResolveUserForTest(
        buildMessage({ SenderEmail: 'unmapped-external-guest@example.invalid' })
    );
    AssertEqual(unknownEmail, null, 'MA1: unmapped email must return null by default (fail closed)');

    const missingEmail = await adapter.ResolveUserForTest(
        buildMessage({ SenderID: 'unmapped-id', SenderEmail: undefined })
    );
    AssertEqual(missingEmail, null, 'MA1: missing email must return null by default (fail closed)');

    // Opt-in AllowFallbackUser: true permits service-account fallback
    const openAdapter = new InProcessMessagingAdapter(
        buildSettings(ctx.User.Email, cat.DefaultAgent.Name!, { AllowFallbackUser: true })
    );
    await openAdapter.Initialize();
    const fallbackResolved = await openAdapter.ResolveUserForTest(
        buildMessage({ SenderEmail: 'unmapped-external-guest@example.invalid' })
    );
    Assert(fallbackResolved != null, 'MA1: AllowFallbackUser=true should fall back to service account');
    Assert(UUIDsEqual(fallbackResolved!.ID, ctx.User.ID), 'MA1: fallback user should be ContextUserEmail user');
}

async function checkMa2DiscoverabilityEnforcement(ctx: IntegrationCheckContext): Promise<void> {
    const cat = requireCatalog();
    const adapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, cat.DefaultAgent.Name!));
    await adapter.Initialize();

    const availableSet = new Set(adapter.AvailableAgentNames.map(n => n.toLowerCase()));
    Assert(availableSet.has(cat.DefaultAgent.Name!.toLowerCase()), 'MA2: default top-level agent should be in AvailableAgentNames');

    // Every non-discoverable active agent in the real catalog must be excluded
    for (const nonDisc of cat.NonDiscoverableAgents) {
        if (!nonDisc.Name) continue;
        // Skip only if a distinct directly-discoverable active agent happens to share the exact same name
        const hasDiscoverableTwin = cat.DiscoverableAgents.some(
            d => d.Name != null && d.Name.toLowerCase() === nonDisc.Name!.toLowerCase()
        );
        if (hasDiscoverableTwin) continue;

        Assert(
            !availableSet.has(nonDisc.Name.toLowerCase()),
            `MA2: non-discoverable agent '${nonDisc.Name}' (${nonDisc.ID}) must not appear in AvailableAgentNames`
        );
    }

    // Direct mention of a real shipped non-discoverable agent must be refused (or fail closed)
    const sampleSub = cat.NonDiscoverableAgents.find(
        s => s.Name != null && !cat.DiscoverableAgents.some(d => d.Name?.toLowerCase() === s.Name?.toLowerCase())
    );
    if (sampleSub && sampleSub.Name) {
        const res = await adapter.ResolveAgentForTest(
            buildMessage({ Text: `@${sampleSub.Name} run`, MentionedAgentNames: [sampleSub.Name] }),
            ctx.User
        );
        AssertEqual(res.agent, null, `MA2: direct mention of non-discoverable agent '${sampleSub.Name}' must be refused`);

        // Configuring a non-discoverable agent as DefaultAgentName must throw at Initialize
        const badAdapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, sampleSub.Name));
        let threw = false;
        try {
            await badAdapter.Initialize();
        } catch {
            threw = true;
        }
        Assert(threw, `MA2: Initialize must reject non-discoverable DefaultAgentName '${sampleSub.Name}'`);
    }
}

async function checkMa3AllowedAgentIDsEnforcement(ctx: IntegrationCheckContext): Promise<void> {
    const cat = requireCatalog();
    const scopedAdapter = new InProcessMessagingAdapter(
        buildSettings(ctx.User.Email, cat.DefaultAgent.Name!, {
            AllowedAgentIDs: [cat.DefaultAgent.ID.toLowerCase()],
        })
    );
    await scopedAdapter.Initialize();

    AssertEqual(
        scopedAdapter.AvailableAgentNames.length,
        1,
        'MA3: AllowedAgentIDs should restrict AvailableAgentNames to exactly one agent'
    );
    AssertEqual(
        scopedAdapter.AvailableAgentNames[0],
        cat.DefaultAgent.Name!,
        'MA3: AllowedAgentIDs should keep the allow-listed agent in AvailableAgentNames'
    );

    if (cat.SecondDiscoverableAgent && cat.SecondDiscoverableAgent.Name) {
        const other = cat.SecondDiscoverableAgent;
        const refused = await scopedAdapter.ResolveAgentForTest(
            buildMessage({ Text: `@${other.Name} hello`, MentionedAgentNames: [other.Name!] }),
            ctx.User
        );
        AssertEqual(refused.agent, null, `MA3: agent '${other.Name}' outside AllowedAgentIDs must be refused`);
        Assert(
            (refused.refusalMessage ?? '').includes('not available'),
            `MA3: expected not-available refusal message, got '${refused.refusalMessage ?? ''}'`
        );

        // DefaultAgentName outside AllowedAgentIDs must fail fast at Initialize
        const badConfigAdapter = new InProcessMessagingAdapter(
            buildSettings(ctx.User.Email, cat.DefaultAgent.Name!, {
                AllowedAgentIDs: [other.ID],
            })
        );
        let threw = false;
        try {
            await badConfigAdapter.Initialize();
        } catch {
            threw = true;
        }
        Assert(threw, 'MA3: Initialize must throw when DefaultAgentName is outside AllowedAgentIDs');
    }
}

async function checkMa4HandleMessageFailClosedEndToEnd(ctx: IntegrationCheckContext): Promise<void> {
    const cat = requireCatalog();
    const adapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, cat.DefaultAgent.Name!));
    await adapter.Initialize();

    await adapter.HandleMessage(
        buildMessage({
            IsDirectMessage: true,
            SenderID: 'it-unmapped-guest',
            SenderEmail: 'unmapped-guest@example.invalid',
            Text: 'run an agent please',
        })
    );

    AssertEqual(adapter.TypingShown, false, 'MA4: refused unmapped sender must not trigger typing indicator');
    AssertEqual(adapter.FinalMessages.length, 1, 'MA4: refused unmapped sender must receive exactly one refusal message');
    Assert(
        adapter.FinalMessages[0].PlainText.includes('MemberJunction user'),
        `MA4: refusal message should explain unmapped user, got '${adapter.FinalMessages[0].PlainText}'`
    );
}

async function checkMa5LiveAgentPermissionsRbacAndInactiveUser(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireMutationFixture();
    const adapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, f.DefaultAgent.Name!));
    await adapter.Initialize();

    // Inactive MJ user is refused by resolveContextUser
    const inactiveResolved = await adapter.ResolveUserForTest(buildMessage({ SenderEmail: f.InactiveEmail }));
    AssertEqual(inactiveResolved, null, 'MA5: inactive MJ user must fail closed');

    // Active regularUser resolves cleanly
    const regResolved = await adapter.ResolveUserForTest(buildMessage({ SenderEmail: f.RegularUser.Email }));
    Assert(regResolved != null && UUIDsEqual(regResolved.ID, f.RegularUser.ID), 'MA5: active regular user should resolve');

    // Admin (CanView + CanRun) resolves both RestrictedAgent and HiddenAgent
    const adminRestricted = await adapter.ResolveAgentForTest(
        buildMessage({ Text: `@${f.RestrictedAgent.Name} run`, MentionedAgentNames: [f.RestrictedAgent.Name!] }),
        f.AdminUser
    );
    Assert(
        adminRestricted.agent != null && UUIDsEqual(adminRestricted.agent.ID, f.RestrictedAgent.ID),
        'MA5: admin user with CanRun should resolve RestrictedAgent'
    );

    const adminHidden = await adapter.ResolveAgentForTest(
        buildMessage({ Text: `@${f.HiddenAgent.Name} run`, MentionedAgentNames: [f.HiddenAgent.Name!] }),
        f.AdminUser
    );
    Assert(
        adminHidden.agent != null && UUIDsEqual(adminHidden.agent.ID, f.HiddenAgent.ID),
        'MA5: admin user with CanView+CanRun should resolve HiddenAgent'
    );

    // Regular user (CanView=true, CanRun=false on RestrictedAgent) is refused without falling back
    const regRestricted = await adapter.ResolveAgentForTest(
        buildMessage({ Text: `@${f.RestrictedAgent.Name} run`, MentionedAgentNames: [f.RestrictedAgent.Name!] }),
        f.RegularUser
    );
    AssertEqual(regRestricted.agent, null, 'MA5: regular user lacking CanRun must be refused on RestrictedAgent');
    Assert(
        (regRestricted.refusalMessage ?? '').includes("don't have permission"),
        `MA5: expected permission refusal, got '${regRestricted.refusalMessage ?? ''}'`
    );

    // Regular user (CanView=false on HiddenAgent) gets silent fallback with NO note (indistinguishable from no match)
    const regHidden = await adapter.ResolveAgentForTest(
        buildMessage({ Text: `@${f.HiddenAgent.Name} run`, MentionedAgentNames: [f.HiddenAgent.Name!] }),
        f.RegularUser
    );
    Assert(
        regHidden.agent != null && UUIDsEqual(regHidden.agent.ID, f.DefaultAgent.ID),
        'MA5: unviewable explicit @mention should fall back silently to default agent'
    );
    AssertEqual(
        regHidden.multiAgentNote,
        null,
        'MA5: unviewable @mention must not emit a note revealing or confirming the hidden agent'
    );
}

async function checkMa6ThreadAffinityEnforcesReplyingUserPermissions(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireMutationFixture();
    const adapter = new InProcessMessagingAdapter(buildSettings(ctx.User.Email, f.DefaultAgent.Name!));
    await adapter.Initialize();

    const history: IncomingMessage[] = [
        buildMessage({
            MessageID: 'thread-root-1',
            SenderID: 'admin-platform-id',
            SenderEmail: f.AdminUser.Email,
            Text: `@${f.HiddenAgent.Name} pull restricted report`,
            MentionedAgentNames: [f.HiddenAgent.Name!],
        }),
        buildMessage({
            MessageID: 'bot-reply-1',
            SenderID: 'IT-BOT-001',
            Text: 'Here is the report.',
        }),
    ];

    // Admin continuing thread routes to HiddenAgent (both via history and rememberedAgentId)
    const adminReply = await adapter.ResolveAgentForTest(
        buildMessage({ ThreadID: 'thread-root-1', Text: 'follow up', MentionedAgentNames: [] }),
        f.AdminUser,
        history,
        f.HiddenAgent.ID
    );
    Assert(
        adminReply.agent != null && UUIDsEqual(adminReply.agent.ID, f.HiddenAgent.ID),
        'MA6: admin user should retain thread affinity to HiddenAgent'
    );

    // Regular user replying in a thread actually served by HiddenAgent (rememberedAgentId set)
    // is refused without leaking HiddenAgent's name.
    const regReply = await adapter.ResolveAgentForTest(
        buildMessage({ ThreadID: 'thread-root-1', Text: 'me too', MentionedAgentNames: [] }),
        f.RegularUser,
        history,
        f.HiddenAgent.ID
    );
    AssertEqual(regReply.agent, null, 'MA6: regular user replying in HiddenAgent thread must be refused');
    Assert(
        !(regReply.refusalMessage ?? '').includes(f.HiddenAgent.Name!),
        'MA6: refusal for unviewable thread agent must not leak its name'
    );

    // Regular user replying in a thread where HiddenAgent never actually ran (no rememberedAgentId)
    // falls back silently to DefaultAgent without confirming HiddenAgent exists.
    const regUnverifiedReply = await adapter.ResolveAgentForTest(
        buildMessage({ ThreadID: 'thread-root-1', Text: 'me too', MentionedAgentNames: [] }),
        f.RegularUser,
        history
    );
    Assert(
        regUnverifiedReply.agent != null && UUIDsEqual(regUnverifiedReply.agent.ID, f.DefaultAgent.ID),
        'MA6: unverified history mention of HiddenAgent must fall back silently to DefaultAgent'
    );
    AssertEqual(
        regUnverifiedReply.refusalMessage,
        undefined,
        'MA6: unverified history mention of HiddenAgent must not emit a refusal confirming existence'
    );
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngineBase.Instance.Config(false, ctx.User);
        const activeAgents = AIEngineBase.Instance.Agents.filter(a => a.Status === 'Active');
        const discoverable = activeAgents.filter(
            a => a.Name != null && AIAgentPermissionHelper.IsDirectlyDiscoverable(a)
        );
        const nonDiscoverable = activeAgents.filter(a => !AIAgentPermissionHelper.IsDirectlyDiscoverable(a));
        Assert(discoverable.length > 0, `${BUNDLE} Setup: no active directly-discoverable agents found`);

        // Prefer a root public agent (0 ACL rows) so ctx.User can always run it
        const agentsWithPerms = new UUIDSet(AIEngineBase.Instance.AgentPermissions.map(p => p.AgentID));
        const publicDiscoverable = discoverable.filter(
            a => !a.BaseAgentID && !agentsWithPerms.Has(a.ID)
        );
        const pool = publicDiscoverable.length > 0 ? publicDiscoverable : discoverable;
        const defaultAgent = pool.find(a => a.Name === 'Sage') ?? pool[0];
        const secondDiscoverable = pool.find(a => !UUIDsEqual(a.ID, defaultAgent.ID)) ?? null;

        catalogFixture = {
            DiscoverableAgents: discoverable,
            NonDiscoverableAgents: nonDiscoverable,
            DefaultAgent: defaultAgent,
            SecondDiscoverableAgent: secondDiscoverable,
        };

        if (!MutationTierOn(ctx)) {
            return;
        }

        const prefix = `mj-ma-${Date.now()}`;
        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const [typeRes, uiRoleRes] = await Promise.all([
            rv.RunView<{ ID: string; Name: string }>(
                { EntityName: 'MJ: AI Agent Types', Fields: ['ID', 'Name'], MaxRows: 10, ResultType: 'simple' },
                ctx.User
            ),
            rv.RunView<{ ID: string; Name: string }>(
                { EntityName: 'MJ: Roles', ExtraFilter: `Name='UI'`, Fields: ['ID', 'Name'], MaxRows: 1, ResultType: 'simple' },
                ctx.User
            ),
        ]);
        Assert(typeRes.Success && typeRes.Results.length > 0, `${BUNDLE} Setup: no AI Agent Types found`);
        Assert(uiRoleRes.Success && uiRoleRes.Results.length === 1, `${BUNDLE} Setup: UI role not found`);

        const loopType = typeRes.Results.find(t => t.Name.toLowerCase() === 'loop') ?? typeRes.Results[0];
        const uiRoleId = uiRoleRes.Results[0].ID;

        const createdRoleIDs: string[] = [];
        const createdUserIDs: string[] = [];
        const createdUserRoleIDs: string[] = [];
        const createdAgentIDs: string[] = [];
        const createdPermIDs: string[] = [];

        const adminRole = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
        adminRole.NewRecord();
        adminRole.Name = `${prefix}-AdminRole`;
        adminRole.Description = `IT194 test role ${FIXTURE_TAG}`;
        Assert(await adminRole.Save(), `${BUNDLE} Setup: failed to create AdminRole: ${adminRole.LatestResult?.CompleteMessage}`);
        createdRoleIDs.push(adminRole.ID);

        const makeUser = async (tag: string, active: boolean, withAdminRole: boolean): Promise<UserInfo> => {
            const u = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
            u.NewRecord();
            u.Name = `${prefix}-${tag}`;
            u.FirstName = tag;
            u.LastName = 'IT194';
            u.Email = `${prefix}-${tag.toLowerCase()}@example.test`;
            u.Type = 'User';
            u.IsActive = active;
            Assert(await u.Save(), `${BUNDLE} Setup: failed to create user ${tag}: ${u.LatestResult?.CompleteMessage}`);
            createdUserIDs.push(u.ID);

            const roles: Array<{ Role: string; RoleID: string }> = [{ Role: 'UI', RoleID: uiRoleId }];
            const uiUr = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
            uiUr.NewRecord();
            uiUr.UserID = u.ID;
            uiUr.RoleID = uiRoleId;
            Assert(await uiUr.Save(), `${BUNDLE} Setup: failed to assign UI role to ${tag}`);
            createdUserRoleIDs.push(uiUr.ID);

            if (withAdminRole) {
                const adminUr = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
                adminUr.NewRecord();
                adminUr.UserID = u.ID;
                adminUr.RoleID = adminRole.ID;
                Assert(await adminUr.Save(), `${BUNDLE} Setup: failed to assign AdminRole to ${tag}`);
                createdUserRoleIDs.push(adminUr.ID);
                roles.push({ Role: adminRole.Name, RoleID: adminRole.ID });
            }

            return new UserInfo(undefined, {
                ID: u.ID,
                Name: u.Name,
                Email: u.Email,
                Type: 'User',
                IsActive: active,
                UserRoles: roles,
            });
        };

        const adminUser = await makeUser('Admin', true, true);
        const regularUser = await makeUser('Regular', true, false);
        const inactiveUser = await makeUser('Inactive', false, false);

        const makeAgent = async (name: string): Promise<MJAIAgentEntity> => {
            const a = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
            a.NewRecord();
            a.Name = name;
            a.Description = `IT194 test agent ${FIXTURE_TAG}`;
            a.TypeID = loopType.ID;
            a.Status = 'Active';
            a.InvocationMode = 'Top-Level';
            a.InstantiationMode = 'None';
            Assert(await a.Save(), `${BUNDLE} Setup: failed to create agent ${name}: ${a.LatestResult?.CompleteMessage}`);
            createdAgentIDs.push(a.ID);
            return a;
        };

        const defaultAgentRow = await makeAgent(`${prefix}-PublicDefault`);
        const restrictedAgentRow = await makeAgent(`${prefix}-RestrictedRun`);
        const hiddenAgentRow = await makeAgent(`${prefix}-HiddenSecret`);

        const addPerm = async (
            agentId: string,
            target: { RoleID?: string; UserID?: string },
            canView: boolean,
            canRun: boolean
        ): Promise<void> => {
            const p = await ctx.Provider.GetEntityObject<MJAIAgentPermissionEntity>('MJ: AI Agent Permissions', ctx.User);
            p.NewRecord();
            p.AgentID = agentId;
            if (target.RoleID) p.RoleID = target.RoleID;
            if (target.UserID) p.UserID = target.UserID;
            p.CanView = canView;
            p.CanRun = canRun;
            p.CanEdit = false;
            p.CanDelete = false;
            Assert(await p.Save(), `${BUNDLE} Setup: failed to save permission: ${p.LatestResult?.CompleteMessage}`);
            createdPermIDs.push(p.ID);
        };

        // RestrictedAgent: AdminRole can view+run; regularUser can view ONLY (no run)
        await addPerm(restrictedAgentRow.ID, { RoleID: adminRole.ID }, true, true);
        await addPerm(restrictedAgentRow.ID, { UserID: regularUser.ID }, true, false);

        // HiddenAgent: AdminRole only (regularUser has neither view nor run)
        await addPerm(hiddenAgentRow.ID, { RoleID: adminRole.ID }, true, true);

        // Refresh real UserCache and AIEngineBase caches so adapters see the new fixtures
        if (ctx.Provider instanceof DatabaseProviderBase) {
            await UserCache.Instance.Refresh(ctx.Provider);
        }
        await AIEngineBase.Instance.Config(true, ctx.User);

        mutationFixture = {
            Prefix: prefix,
            AdminUser: adminUser,
            RegularUser: regularUser,
            InactiveEmail: inactiveUser.Email,
            DefaultAgent: defaultAgentRow,
            RestrictedAgent: restrictedAgentRow,
            HiddenAgent: hiddenAgentRow,
            CreatedPermIDs: createdPermIDs,
            CreatedAgentIDs: createdAgentIDs,
            CreatedUserRoleIDs: createdUserRoleIDs,
            CreatedUserIDs: createdUserIDs,
            CreatedRoleIDs: createdRoleIDs,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        catalogFixture = undefined;
        const f = mutationFixture;
        mutationFixture = undefined;
        if (!f) {
            return;
        }

        const del = async (entityName: string, ids: readonly string[]) => {
            for (const id of [...ids].reverse()) {
                const row = await ctx.Provider.GetEntityObject(entityName, ctx.User).catch(() => undefined);
                if (row && (await row.InnerLoad(CompositeKey.FromID(id)).catch(() => false))) {
                    await row.Delete().catch(() => undefined);
                }
            }
        };

        await del('MJ: AI Agent Permissions', f.CreatedPermIDs);
        await del('MJ: AI Agents', f.CreatedAgentIDs);
        await del('MJ: User Roles', f.CreatedUserRoleIDs);

        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const rcEntity = ctx.Provider.EntityByName('MJ: Record Changes');
        for (const uid of [...f.CreatedUserIDs].reverse()) {
            const rcRes = await rv
                .RunView<{ ID: string }>(
                    {
                        EntityName: 'MJ: Record Changes',
                        ExtraFilter: `UserID='${EscapeSQLString(uid)}'`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                    },
                    ctx.User
                )
                .catch(() => null);
            const rcIds = rcRes?.Success ? rcRes.Results.map(r => r.ID) : [];
            if (rcIds.length > 0 && rcEntity?.AllowDeleteAPI) {
                await del('MJ: Record Changes', rcIds);
            }
            const userRow = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User).catch(() => undefined);
            if (userRow && (await userRow.InnerLoad(CompositeKey.FromID(uid)).catch(() => false))) {
                if (rcIds.length === 0 || rcEntity?.AllowDeleteAPI) {
                    const deleted = await userRow.Delete().catch(() => false);
                    if (!deleted) {
                        userRow.IsActive = false;
                        await userRow.Save().catch(() => undefined);
                    }
                } else {
                    userRow.IsActive = false;
                    await userRow.Save().catch(() => undefined);
                }
            }
        }

        await del('MJ: Roles', f.CreatedRoleIDs);
        if (ctx.Provider instanceof DatabaseProviderBase) {
            await UserCache.Instance.Refresh(ctx.Provider).catch(() => undefined);
        }
        await AIEngineBase.Instance.Config(true, ctx.User).catch(() => undefined);
    },
});

export const MessagingAdaptersChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.MA1`,
        Name: 'MA1: UserCache.Instance singleton integrity, fail-closed sender resolution, and opt-in AllowFallbackUser',
        Fn: checkMa1UserCacheAndFailClosedSenderMapping,
    },
    {
        Id: `${BUNDLE}.MA2`,
        Name: 'MA2: Real catalog IsDirectlyDiscoverable excludes sub-agents and refuses direct invocation',
        Fn: checkMa2DiscoverabilityEnforcement,
    },
    {
        Id: `${BUNDLE}.MA3`,
        Name: 'MA3: AllowedAgentIDs allow-list enforced across Initialize, AvailableAgentNames, and @mention',
        Fn: checkMa3AllowedAgentIDsEnforcement,
    },
    {
        Id: `${BUNDLE}.MA4`,
        Name: 'MA4: HandleMessage refuses unmapped senders end-to-end with zero side effects',
        Fn: checkMa4HandleMessageFailClosedEndToEnd,
    },
    {
        Id: `${BUNDLE}.MA5`,
        Name: 'MA5: Live MJ: AI Agent Permissions RBAC (CanView/CanRun) and inactive-user refusal',
        Fn: checkMa5LiveAgentPermissionsRbacAndInactiveUser,
        RequiresMutation: true,
    },
    {
        Id: `${BUNDLE}.MA6`,
        Name: 'MA6: Thread affinity enforces replying user permissions without leaking hidden agent names',
        Fn: checkMa6ThreadAffinityEnforcesReplyingUserPermissions,
        RequiresMutation: true,
    },
];

for (const check of MessagingAdaptersChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
