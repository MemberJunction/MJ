/**
 * widget-guest-isolation.checks.ts — the 'widget-guest-isolation' bundle (WG1–WG6).
 *
 * Every public web-widget guest authenticates as the one shared magic-link Anonymous user, holding
 * the Widget Guest role and a per-session scope (MagicLinkScope.ResourceID). The guest's session
 * Conversation is stamped with ExternalID = that scope, and the Widget Guest row filters scope each
 * entity to rows reachable from that Conversation. A grant with no filter is RLS-exempt, so without
 * a filter one guest reaches every row of the entity.
 *
 * WHAT THIS BUNDLE PROVES, against the real database and the real role-driven permission engine:
 *  - WG1: guest B's RunView returns none of guest A's rows on MJ: AI Agent Requests,
 *    MJ: Conversation Skills, MJ: Conversation Detail Artifacts and MJ: AI Agent Runs,
 *  - WG2: guest A's RunView returns its own row on each of those entities,
 *  - WG3: a Widget Guest principal with no scope reads none of either guest's rows (fail-closed),
 *  - WG4: guest B's update of A's Agent Request, Conversation Skill and Agent Run is refused and the
 *    stored row is unchanged. The entity object is hydrated from A's full row the way the server
 *    hydrates it from a client's OldValues, so the provider's Update row filter is what refuses the
 *    Agent Request and Conversation Skill. (The Agent Run subclass re-reads the stored row under the
 *    caller before saving, so the read filter refuses that one first.)
 *  - WG5: guest A's update of its own Agent Request, Conversation Skill and Agent Run succeeds.
 *  - WG6: the system user still reads both guests' rows (the filters bind only the Widget Guest role).
 *
 * PRINCIPALS are synthesized the way MJServer's `BuildMagicLinkSessionUser` builds a widget guest:
 * a fresh UserInfo over the core-seeded Anonymous user whose only role is Widget Guest, with
 * `IsMagicLinkAnonymous` and a `MagicLinkScope`. Fixture rows are written by the system user (the
 * text path runs agents under a server principal) into one Conversation per guest, and removed in
 * the lifecycle teardown in FK-safe order.
 */
import { randomUUID } from 'node:crypto';
import { CompositeKey, RunView, UserInfo } from '@memberjunction/core';
import type { BaseEntity, RoleInfo } from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJAIAgentRunEntity,
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJConversationSkillEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const BUNDLE = 'widget-guest-isolation';
const FIXTURE_TAG = '(mj-integration-test widget-guest-isolation — safe to delete)';
const MAGIC_LINK_ANONYMOUS_EMAIL = 'anonymous@magic-link.local';
const WIDGET_GUEST_ROLE = 'Widget Guest';

const AGENT_REQUESTS = 'MJ: AI Agent Requests';
const CONVERSATION_SKILLS = 'MJ: Conversation Skills';
const DETAIL_ARTIFACTS = 'MJ: Conversation Detail Artifacts';
const AGENT_RUNS = 'MJ: AI Agent Runs';

/** The entities whose guest rows the checks read, in the order they are reported. */
const ISOLATED_ENTITIES = [AGENT_REQUESTS, CONVERSATION_SKILLS, DETAIL_ARTIFACTS, AGENT_RUNS] as const;
type IsolatedEntity = (typeof ISOLATED_ENTITIES)[number];

/** The entities on which Widget Guest holds Update, and so whose cross-guest update must be refused. */
const UPDATABLE_ENTITIES = [AGENT_REQUESTS, CONVERSATION_SKILLS, AGENT_RUNS] as const;
type UpdatableEntity = (typeof UPDATABLE_ENTITIES)[number];

/** One guest's principal and the IDs of the fixture rows in its session. */
interface GuestFixture {
    Principal: UserInfo;
    ConversationID: string;
    RowIDs: Record<IsolatedEntity, string>;
    /** Rows that support the fixture but are not under test, deleted in teardown. */
    DetailID: string;
    ArtifactID: string;
    ArtifactVersionID: string;
}

interface WidgetGuestState {
    GuestA?: GuestFixture;
    GuestB?: GuestFixture;
    Unscoped?: UserInfo;
    SkipReason?: string;
    ProvisionError?: string;
    /** Every row created, in creation order, so teardown can delete in reverse. */
    Created: Array<{ Entity: string; ID: string }>;
}

const state: WidgetGuestState = { Created: [] };

// ─────────────────────────────────────────────────────────────────── principals

/** A widget guest principal over the Anonymous user, as `BuildMagicLinkSessionUser` builds one. */
function makeWidgetGuest(ctx: IntegrationCheckContext, anonymous: UserInfo, role: RoleInfo, scope: string | undefined): UserInfo {
    const guest = new UserInfo(ctx.Provider, {
        ...anonymous,
        _UserRoles: undefined,
        UserRoles: [{ UserID: anonymous.ID, RoleID: role.ID, RoleName: role.Name }],
    });
    guest.IsMagicLinkAnonymous = true;
    if (scope) {
        guest.MagicLinkScope = { ResourceID: scope };
    }
    return guest;
}

function findAnonymousUser(): UserInfo | undefined {
    return UserCache.Instance.Users.find((u) => u.Email?.trim().toLowerCase() === MAGIC_LINK_ANONYMOUS_EMAIL);
}

// ─────────────────────────────────────────────────────────────────── fixture

async function firstID(entity: string, user: UserInfo): Promise<string | undefined> {
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: entity, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 }, user,
    );
    return r.Success ? r.Results?.[0]?.ID : undefined;
}

async function saveTracked(entity: BaseEntity & { ID: string }, entityName: string, label: string): Promise<void> {
    const saved = await entity.Save();
    Assert(saved, `creating the ${label} fixture failed: ${entity.LatestResult?.CompleteMessage ?? '(no message)'}`);
    state.Created.push({ Entity: entityName, ID: entity.ID });
}

interface SharedRefs {
    AgentID: string;
    SkillID: string;
    ArtifactTypeID: string;
}

/** Creates one guest's Conversation (ExternalID = scope) and one row per isolated entity in it. */
async function createGuestRows(ctx: IntegrationCheckContext, guest: UserInfo, scope: string, refs: SharedRefs): Promise<GuestFixture> {
    const sys = ctx.User;
    const p = ctx.Provider;

    const conversation = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', sys);
    conversation.NewRecord();
    conversation.Name = `WG fixture ${FIXTURE_TAG}`;
    conversation.UserID = sys.ID;
    conversation.ExternalID = scope;
    await saveTracked(conversation, 'MJ: Conversations', 'conversation');

    const detail = await p.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', sys);
    detail.NewRecord();
    detail.ConversationID = conversation.ID;
    detail.Role = 'User';
    detail.UserID = sys.ID;
    detail.Message = `WG fixture message ${FIXTURE_TAG}`;
    await saveTracked(detail, 'MJ: Conversation Details', 'conversation detail');

    const artifact = await p.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', sys);
    artifact.NewRecord();
    artifact.Name = `WG fixture artifact ${FIXTURE_TAG}`;
    artifact.TypeID = refs.ArtifactTypeID;
    artifact.UserID = sys.ID;
    await saveTracked(artifact, 'MJ: Artifacts', 'artifact');

    const version = await p.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', sys);
    version.NewRecord();
    version.ArtifactID = artifact.ID;
    version.VersionNumber = 1;
    version.UserID = sys.ID;
    version.Content = 'WG fixture content';
    await saveTracked(version, 'MJ: Artifact Versions', 'artifact version');

    const link = await p.GetEntityObject<MJConversationDetailArtifactEntity>(DETAIL_ARTIFACTS, sys);
    link.NewRecord();
    link.ConversationDetailID = detail.ID;
    link.ArtifactVersionID = version.ID;
    link.Direction = 'Output';
    await saveTracked(link, DETAIL_ARTIFACTS, 'conversation detail artifact');

    const run = await p.GetEntityObject<MJAIAgentRunEntity>(AGENT_RUNS, sys);
    run.NewRecord();
    run.AgentID = refs.AgentID;
    run.ConversationID = conversation.ID;
    run.Status = 'Running';
    run.StartedAt = new Date();
    await saveTracked(run, AGENT_RUNS, 'agent run');

    const request = await p.GetEntityObject<MJAIAgentRequestEntity>(AGENT_REQUESTS, sys);
    request.NewRecord();
    request.AgentID = refs.AgentID;
    request.OriginatingAgentRunID = run.ID;
    request.RequestedAt = new Date();
    request.Status = 'Requested';
    request.Request = `WG fixture request ${FIXTURE_TAG}`;
    await saveTracked(request, AGENT_REQUESTS, 'agent request');

    const skill = await p.GetEntityObject<MJConversationSkillEntity>(CONVERSATION_SKILLS, sys);
    skill.NewRecord();
    skill.ConversationID = conversation.ID;
    skill.SkillID = refs.SkillID;
    skill.Status = 'Active';
    await saveTracked(skill, CONVERSATION_SKILLS, 'conversation skill');

    return {
        Principal: guest,
        ConversationID: conversation.ID,
        RowIDs: {
            [AGENT_REQUESTS]: request.ID,
            [CONVERSATION_SKILLS]: skill.ID,
            [DETAIL_ARTIFACTS]: link.ID,
            [AGENT_RUNS]: run.ID,
        },
        DetailID: detail.ID,
        ArtifactID: artifact.ID,
        ArtifactVersionID: version.ID,
    };
}

async function setupWidgetGuest(ctx: IntegrationCheckContext): Promise<void> {
    state.GuestA = undefined;
    state.GuestB = undefined;
    state.Unscoped = undefined;
    state.SkipReason = undefined;
    state.ProvisionError = undefined;
    state.Created = [];

    const anonymous = findAnonymousUser();
    const role = ctx.Provider.Roles.find((r) => r.Name?.trim().toLowerCase() === WIDGET_GUEST_ROLE.toLowerCase());
    const [agentID, skillID, artifactTypeID] = await Promise.all([
        firstID('MJ: AI Agents', ctx.User),
        firstID('MJ: AI Skills', ctx.User),
        firstID('MJ: Artifact Types', ctx.User),
    ]);
    if (!anonymous || !role || !agentID || !skillID || !artifactTypeID) {
        state.SkipReason = `needs the magic-link Anonymous user (${MAGIC_LINK_ANONYMOUS_EMAIL}), the '${WIDGET_GUEST_ROLE}' role, `
            + 'and at least one seeded MJ: AI Agents, MJ: AI Skills and MJ: Artifact Types row';
        return;
    }
    const refs: SharedRefs = { AgentID: agentID, SkillID: skillID, ArtifactTypeID: artifactTypeID };
    const scopeA = randomUUID();
    const scopeB = randomUUID();
    try {
        state.GuestA = await createGuestRows(ctx, makeWidgetGuest(ctx, anonymous, role, scopeA), scopeA, refs);
        state.GuestB = await createGuestRows(ctx, makeWidgetGuest(ctx, anonymous, role, scopeB), scopeB, refs);
        state.Unscoped = makeWidgetGuest(ctx, anonymous, role, undefined);
    } catch (e) {
        state.ProvisionError = e instanceof Error ? e.message : String(e);
    }
}

async function teardownWidgetGuest(ctx: IntegrationCheckContext): Promise<void> {
    for (const row of state.Created.splice(0).reverse()) {
        try {
            const entity = await ctx.Provider.GetEntityObject<BaseEntity>(row.Entity, ctx.User);
            if (await entity.InnerLoad(CompositeKey.FromID(row.ID)) && !(await entity.Delete())) {
                console.warn(`  ⚠ ${BUNDLE}: fixture Delete failed for ${row.Entity} ${row.ID}: `
                    + `${entity.LatestResult?.CompleteMessage ?? '(no message)'}`);
            }
        } catch (e) {
            console.warn(`  ⚠ ${BUNDLE}: could not clean up ${row.Entity} ${row.ID}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, { Setup: setupWidgetGuest, Teardown: teardownWidgetGuest });

// ─────────────────────────────────────────────────────────────────── helpers

/** The provisioned fixture; the check is SKIPPED when prerequisites are absent and FAILS when provisioning broke. */
function ready(checkId: string): { A: GuestFixture; B: GuestFixture; Unscoped: UserInfo } {
    if (state.ProvisionError) {
        Assert(false, `${checkId}: the widget guest fixture could not be provisioned: ${state.ProvisionError}`);
    }
    if (state.SkipReason || !state.GuestA || !state.GuestB || !state.Unscoped) {
        const reason = state.SkipReason ?? 'fixture not provisioned';
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${reason}`);
        return SkipCheck(`${checkId}: ${reason}`);
    }
    return { A: state.GuestA, B: state.GuestB, Unscoped: state.Unscoped };
}

/** IDs of the given rows `user` can read, read cold. */
async function visibleIDs(entity: IsolatedEntity, ids: string[], user: UserInfo): Promise<string[]> {
    const list = ids.map((id) => `'${id}'`).join(', ');
    const r = await new RunView().RunView<{ ID: string }>(
        { EntityName: entity, ExtraFilter: `ID IN (${list})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user,
    );
    Assert(r.Success, `RunView on ${entity} as ${user.Email} failed: ${r.ErrorMessage}`);
    return r.Results.map((row) => row.ID);
}

/** Applies a field change that each updatable fixture entity accepts. */
function applyEdit(entity: UpdatableEntity, row: BaseEntity, marker: string): void {
    switch (entity) {
        case AGENT_REQUESTS:
            (row as MJAIAgentRequestEntity).Comments = marker;
            break;
        case CONVERSATION_SKILLS:
            (row as MJConversationSkillEntity).EndedAt = new Date();
            (row as MJConversationSkillEntity).Status = 'Ended';
            break;
        case AGENT_RUNS:
            (row as MJAIAgentRunEntity).Message = marker;
            break;
    }
}

/** The value `applyEdit` changes, read back from a row, for comparing before and after. */
function editedValue(entity: UpdatableEntity, row: BaseEntity): string | null {
    switch (entity) {
        case AGENT_REQUESTS:
            return (row as MJAIAgentRequestEntity).Comments;
        case CONVERSATION_SKILLS:
            return (row as MJConversationSkillEntity).Status;
        case AGENT_RUNS:
            return (row as MJAIAgentRunEntity).Message;
    }
}

async function loadAs(ctx: IntegrationCheckContext, entity: string, id: string, user: UserInfo): Promise<BaseEntity> {
    const row = await ctx.Provider.GetEntityObject<BaseEntity>(entity, user);
    Assert(await row.InnerLoad(CompositeKey.FromID(id)), `could not load ${entity} ${id} as ${user.Email}`);
    return row;
}

async function trySave(row: BaseEntity): Promise<{ Saved: boolean; Message: string }> {
    try {
        const saved = await row.Save();
        return { Saved: saved, Message: saved ? '' : row.LatestResult?.CompleteMessage ?? '(no message)' };
    } catch (e) {
        return { Saved: false, Message: e instanceof Error ? e.message : String(e) };
    }
}

// ─────────────────────────────────────────────────────────────────── checks

export const WidgetGuestIsolationChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WG1`,
        Name: 'WG1: guest B reads none of guest A\'s Agent Requests, Conversation Skills, Conversation Detail Artifacts or Agent Runs',
        Fn: async (): Promise<void> => {
            const { A, B } = ready('WG1');
            const leaks: string[] = [];
            for (const entity of ISOLATED_ENTITIES) {
                const seen = await visibleIDs(entity, [A.RowIDs[entity]], B.Principal);
                if (seen.length > 0) {
                    leaks.push(entity);
                }
            }
            AssertEqual(leaks.join(', '), '', 'guest B read guest A\'s rows on these entities');
            console.log(`      → guest B read none of guest A's rows on ${ISOLATED_ENTITIES.length} entities`);
        },
    },
    {
        Id: `${BUNDLE}.WG2`,
        Name: 'WG2: each guest reads its own row on every isolated entity',
        Fn: async (): Promise<void> => {
            const { A, B } = ready('WG2');
            for (const guest of [A, B]) {
                for (const entity of ISOLATED_ENTITIES) {
                    const seen = await visibleIDs(entity, [A.RowIDs[entity], B.RowIDs[entity]], guest.Principal);
                    Assert(seen.length === 1 && UUIDsEqual(seen[0], guest.RowIDs[entity]),
                        `a guest should read exactly its own ${entity} row; read ${seen.length} row(s)`);
                }
            }
            console.log('      → each guest reads exactly its own row on every isolated entity');
        },
    },
    {
        Id: `${BUNDLE}.WG3`,
        Name: 'WG3: a Widget Guest principal with no scope reads no guest rows (fail-closed)',
        Fn: async (): Promise<void> => {
            const { A, B, Unscoped } = ready('WG3');
            for (const entity of ISOLATED_ENTITIES) {
                const seen = await visibleIDs(entity, [A.RowIDs[entity], B.RowIDs[entity]], Unscoped);
                AssertEqual(seen.length, 0, `an unscoped Widget Guest principal read ${entity} rows`);
            }
            console.log('      → an unscoped guest reads nothing');
        },
    },
    {
        Id: `${BUNDLE}.WG4`,
        Name: 'WG4: guest B\'s update of guest A\'s Agent Request, Conversation Skill and Agent Run is refused',
        Fn: async (ctx): Promise<void> => {
            const { A, B } = ready('WG4');
            for (const entity of UPDATABLE_ENTITIES) {
                const id = A.RowIDs[entity];
                const stored = await loadAs(ctx, entity, id, ctx.User);
                const before = editedValue(entity, stored);

                // Hydrated from A's full row, as the server hydrates an update from a client's OldValues.
                const asB = await ctx.Provider.GetEntityObject<BaseEntity>(entity, B.Principal);
                Assert(await asB.LoadFromData(stored.GetAll()), `hydrating ${entity} ${id} as guest B failed`);
                applyEdit(entity, asB, `WG4 cross-guest edit ${FIXTURE_TAG}`);
                const { Saved, Message } = await trySave(asB);
                Assert(!Saved, `guest B was allowed to update guest A's ${entity} row`);
                // The Agent Run subclass re-reads the stored row under the caller before saving, so the
                // read filter refuses B's save there, without a message, before the provider is reached.
                if (entity !== AGENT_RUNS) {
                    Assert(/access denied|permission/i.test(Message), `expected an access denial for ${entity}, got: ${Message}`);
                }

                const after = await loadAs(ctx, entity, id, ctx.User);
                AssertEqual(editedValue(entity, after), before, `guest A's ${entity} row changed after guest B's refused update`);
            }
            console.log(`      → guest B's update refused on ${UPDATABLE_ENTITIES.length} entities; rows unchanged`);
        },
    },
    {
        Id: `${BUNDLE}.WG5`,
        Name: 'WG5: guest A updates its own Agent Request, Conversation Skill and Agent Run',
        Fn: async (ctx): Promise<void> => {
            const { A } = ready('WG5');
            for (const entity of UPDATABLE_ENTITIES) {
                const id = A.RowIDs[entity];
                const asA = await loadAs(ctx, entity, id, A.Principal);
                applyEdit(entity, asA, `WG5 own edit ${FIXTURE_TAG}`);
                const expected = editedValue(entity, asA);
                const { Saved, Message } = await trySave(asA);
                Assert(Saved, `guest A could not update its own ${entity} row: ${Message}`);

                const after = await loadAs(ctx, entity, id, ctx.User);
                AssertEqual(editedValue(entity, after), expected, `guest A's update of its own ${entity} row did not persist`);
            }
            console.log(`      → guest A updated its own row on ${UPDATABLE_ENTITIES.length} entities`);
        },
    },
    {
        Id: `${BUNDLE}.WG6`,
        Name: 'WG6: the system user still reads both guests\' rows',
        Fn: async (ctx): Promise<void> => {
            const { A, B } = ready('WG6');
            for (const entity of ISOLATED_ENTITIES) {
                const seen = await visibleIDs(entity, [A.RowIDs[entity], B.RowIDs[entity]], ctx.User);
                AssertEqual(seen.length, 2, `the system user should read both guests' ${entity} rows`);
            }
            console.log('      → the system user reads both guests\' rows');
        },
    },
];

for (const check of WidgetGuestIsolationChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
