/**
 * self-avatar-client.checks.ts — the 'self-avatar-client' bundle (AV1–AV6, client transport, needs
 * MJAPI): the self-service avatar mutation `UpdateMyAvatar(ImageURL, IconClass)` proven over the
 * GraphQL wire, as two real users.
 *
 * WHY. Explorer's My Profile photo used to be a plain save of the caller's own `MJ: Users` row. A
 * deployment that locks its security model down cannot grant ordinary users Update on `MJ: Users`
 * (an own-row filter restricts rows, not columns, so it would also let users rewrite their Email),
 * so on such deployments every avatar save failed. The mutation loads the CALLER's row as the system
 * user and writes only the two avatar columns.
 *
 * IDENTITIES. A GraphQL client authenticates as one wire identity, so per-user behaviour is only
 * observable through per-user AUTHENTICATION (the same model as fls-enforcement-client): Setup mints
 * a `full_access` user API key for each seeded user and builds a secondary GraphQL connection
 * authenticated as that user alone.
 *   - it-avatar-locked@integration.test — role 'Integration Test: Avatar Self-Service': Read, no
 *     Update, on `MJ: Users` (the locked-down deployment).
 *   - it-avatar-editor@integration.test — role 'Integration Test: Avatar User Editor': Read and
 *     Update on `MJ: Users` (the mutation must still work there).
 *
 *   AV1: the locked user sets their own image through the mutation; nothing else on the row moves.
 *   AV2: an icon with a null image replaces the image.
 *   AV3: the old door is closed for the locked user: the generic `UpdateMJUser` mutation and a client
 *        entity Save() are both refused, and the row does not move.
 *   AV4: no other column and no other row can be changed: unknown arguments (Email, UserID) are
 *        rejected by the schema, the locked user's other columns still match the Setup snapshot, and
 *        the editor's row is untouched.
 *   AV5: bad input is refused with a message and writes nothing (javascript:, SVG, other data:
 *        types, oversize and malformed base64, bad icon classes).
 *   AV6: the editor (who holds Update on `MJ: Users`) can set and then clear their avatar too.
 *
 * MUTATION TIER. Every check writes (or would write if its guard regressed), so every check carries
 * `RequiresMutation: true`, and Setup provisions nothing when the tier is off. The only rows written
 * are the two seeded users' avatar columns (restored from the Setup snapshot in Teardown) and the
 * minted API keys (deleted in Teardown). Checks skip LOUDLY when the seed is absent.
 */
import { RunView } from '@memberjunction/core';
import type { EntityUserPermissionInfo } from '@memberjunction/core';
import type { MJUserEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry, IsTierEnabled } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, MintedUserKeyIds } from './fls-client.checks';

const BUNDLE = 'self-avatar-client';
const USERS_ENTITY = 'MJ: Users';
const LOCKED_EMAIL = 'it-avatar-locked@integration.test';
const EDITOR_EMAIL = 'it-avatar-editor@integration.test';
const SEED_COMMAND = 'pnpm mj sync push --dir=metadata-optional/integration-test';

/** A real 1×1 PNG. */
const PNG_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const ICON = 'fa-solid fa-user-astronaut';

/** Columns a successful avatar save is allowed to change. Everything else must match the snapshot. */
const AVATAR_COLUMNS = new Set(['UserImageURL', 'UserImageIconClass', '__mj_UpdatedAt']);

const UPDATE_MY_AVATAR = `
    mutation UpdateMyAvatar($ImageURL: String, $IconClass: String) {
        UpdateMyAvatar(ImageURL: $ImageURL, IconClass: $IconClass) { Success ErrorMessage }
    }
`;

type UserRow = Record<string, unknown>;

interface AvatarResult {
    Success: boolean;
    ErrorMessage?: string | null;
}

/** One seeded user: their ID, a GraphQL connection authenticated as them, and their row at Setup. */
interface AvatarUserLeg {
    Email: string;
    UserID: string;
    Provider: GraphQLDataProvider;
    Snapshot: UserRow;
}

interface SelfAvatarFixture extends MintedUserKeyIds {
    Usable: boolean;
    Reason?: string;
    Locked?: AvatarUserLeg;
    Editor?: AvatarUserLeg;
}

const fixture: { Current: SelfAvatarFixture | undefined } = { Current: undefined };

// ─────────────────────────────────────────────────────────────────── helpers

/** The fixture, or undefined after logging a loud skip. */
function usableFixture(checkId: string): SelfAvatarFixture | undefined {
    const fx = fixture.Current;
    if (!fx?.Usable || !fx.Locked || !fx.Editor) {
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${fx?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_COMMAND}\` and start MJAPI.`);
        return undefined;
    }
    return fx;
}

/** Calls UpdateMyAvatar AS the leg's user. */
async function updateMyAvatar(leg: AvatarUserLeg, imageURL: string | null, iconClass: string | null): Promise<AvatarResult> {
    const response = (await leg.Provider.ExecuteGQL(UPDATE_MY_AVATAR, { ImageURL: imageURL, IconClass: iconClass })) as {
        UpdateMyAvatar?: AvatarResult;
    } | null;
    Assert(response?.UpdateMyAvatar != null, `UpdateMyAvatar returned no result for ${leg.Email}`);
    return response!.UpdateMyAvatar!;
}

/** Runs a GraphQL operation AS the leg's user and returns the error message it threw ('' if it did not throw). */
async function gqlError(leg: AvatarUserLeg, query: string, variables: Record<string, unknown>): Promise<string> {
    try {
        await leg.Provider.ExecuteGQL(query, variables);
        return '';
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

/** The row as the database holds it now, read by the run's system identity on a fresh object. */
async function readRow(ctx: IntegrationCheckContext, userId: string): Promise<UserRow> {
    const row = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, ctx.User);
    Assert(await row.Load(userId), `could not load ${USERS_ENTITY} row ${userId}`);
    return row.GetAll();
}

/** Every column outside AVATAR_COLUMNS that differs between two reads of the same row. */
function changedNonAvatarColumns(before: UserRow, after: UserRow): string[] {
    return Object.keys(before).filter((k) => !AVATAR_COLUMNS.has(k) && String(before[k]) !== String(after[k]));
}

function avatarOf(row: UserRow): string {
    return `UserImageURL=${String(row.UserImageURL).slice(0, 40)}, UserImageIconClass=${String(row.UserImageIconClass)}`;
}

/** The leg's own permissions on MJ: Users, from the roles MJAPI reported for that identity. */
function usersPermissions(ctx: IntegrationCheckContext, leg: AvatarUserLeg): EntityUserPermissionInfo {
    const info = ctx.Provider.EntityByName(USERS_ENTITY);
    Assert(info != null, `'${USERS_ENTITY}' is not in the client metadata`);
    return info!.GetUserPermisions(leg.Provider.CurrentUser);
}

/** Sets the avatar through the mutation and asserts the stored row holds exactly that, nothing else moved. */
async function setAndVerify(
    ctx: IntegrationCheckContext,
    leg: AvatarUserLeg,
    imageURL: string | null,
    iconClass: string | null,
    checkId: string
): Promise<void> {
    const before = await readRow(ctx, leg.UserID);
    const result = await updateMyAvatar(leg, imageURL, iconClass);
    Assert(result.Success, `${checkId}: UpdateMyAvatar refused ${leg.Email}: ${result.ErrorMessage ?? '(no message)'}`);
    const after = await readRow(ctx, leg.UserID);
    AssertEqual(after.UserImageURL ?? null, imageURL, `${checkId}: stored UserImageURL for ${leg.Email}`);
    AssertEqual(after.UserImageIconClass ?? null, iconClass, `${checkId}: stored UserImageIconClass for ${leg.Email}`);
    const moved = changedNonAvatarColumns(before, after);
    Assert(moved.length === 0, `${checkId}: the avatar save also changed ${moved.join(', ')} on ${leg.Email}'s row`);
}

async function resolveUserId(ctx: IntegrationCheckContext, email: string): Promise<string | undefined> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: USERS_ENTITY, ExtraFilter: `Email = '${email}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
        ctx.User
    );
    return res.Success && res.Results.length === 1 ? res.Results[0].ID : undefined;
}

async function provisionLeg(ctx: IntegrationCheckContext, fx: SelfAvatarFixture, email: string, userId: string): Promise<AvatarUserLeg> {
    const snapshot = await readRow(ctx, userId);
    const rawKey = await MintFullAccessUserKey(ctx, fx, userId, `IT106 avatar ${email} (mj-integration-test)`);
    const provider = (await BuildUserKeyProviderWithRetry(rawKey)) as GraphQLDataProvider;
    return { Email: email, UserID: userId, Provider: provider, Snapshot: snapshot };
}

/** Puts a leg's avatar columns back to the Setup snapshot, as the run's system identity. Never throws. */
async function restoreAvatar(ctx: IntegrationCheckContext, leg: AvatarUserLeg | undefined): Promise<void> {
    if (!leg) {
        return;
    }
    try {
        const row = await ctx.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, ctx.User);
        if (await row.Load(leg.UserID)) {
            row.UserImageURL = (leg.Snapshot.UserImageURL as string | null) ?? null;
            row.UserImageIconClass = (leg.Snapshot.UserImageIconClass as string | null) ?? null;
            if (row.Dirty && !(await row.Save())) {
                console.error(`  ✖ ${BUNDLE} teardown could not restore ${leg.Email}'s avatar: ${row.LatestResult?.CompleteMessage ?? ''}`);
            }
        }
    } catch (e) {
        console.error(`  ✖ ${BUNDLE} teardown could not restore ${leg.Email}'s avatar: ${e instanceof Error ? e.message : String(e)}`);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: SelfAvatarFixture = { Usable: false, CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        fixture.Current = fx;
        if (!IsTierEnabled('mutation') && ctx.Config?.runMutationTests !== true) {
            fx.Reason = 'the mutation tier is off (RUN_MUTATION_TESTS)';
            return;
        }
        const lockedId = await resolveUserId(ctx, LOCKED_EMAIL);
        const editorId = await resolveUserId(ctx, EDITOR_EMAIL);
        if (!lockedId || !editorId) {
            fx.Reason = `seeded users ${LOCKED_EMAIL} / ${EDITOR_EMAIL} not found over the wire`;
            return;
        }
        fx.Locked = await provisionLeg(ctx, fx, LOCKED_EMAIL, lockedId);
        fx.Editor = await provisionLeg(ctx, fx, EDITOR_EMAIL, editorId);
        fx.Usable = true;
    },

    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = fixture.Current;
        fixture.Current = undefined;
        if (!fx) {
            return;
        }
        await restoreAvatar(ctx, fx.Locked);
        await restoreAvatar(ctx, fx.Editor);
        await DeleteMintedUserKeys(ctx, fx);
    }
});

// ─────────────────────────────────────────────────────────────────── checks

export const SelfAvatarClientChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.AV1`,
        Name: 'AV1: a user WITHOUT Update on MJ: Users sets their own image through UpdateMyAvatar',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV1');
            if (!fx) return;
            const leg = fx.Locked!;
            Assert(!usersPermissions(ctx, leg).CanUpdate,
                `AV1 precondition: ${leg.Email} must NOT hold Update on ${USERS_ENTITY}, or this check proves nothing`);
            await setAndVerify(ctx, leg, PNG_DATA_URI, null, 'AV1');
        }
    },
    {
        Id: `${BUNDLE}.AV2`,
        Name: 'AV2: an icon with a null image replaces the image',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV2');
            if (!fx) return;
            const leg = fx.Locked!;
            await setAndVerify(ctx, leg, PNG_DATA_URI, null, 'AV2 (arrange)');
            await setAndVerify(ctx, leg, null, ICON, 'AV2');
        }
    },
    {
        Id: `${BUNDLE}.AV3`,
        Name: 'AV3: the plain entity save is refused for that user — the mutation is the only door',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV3');
            if (!fx) return;
            const leg = fx.Locked!;
            const before = await readRow(ctx, leg.UserID);

            // Server-side door: the generated UpdateMJUser mutation, sent straight over the wire, so no
            // client-side permission check can be what refuses it.
            const serverError = await gqlError(
                leg,
                `mutation ($input: UpdateMJUserInput!) { UpdateMJUser(input: $input) { ID UserImageURL } }`,
                { input: { ID: leg.UserID, UserImageURL: PNG_DATA_URI, UserImageIconClass: null } }
            );
            Assert(serverError.length > 0, `AV3: UpdateMJUser SUCCEEDED for ${leg.Email}, who must not hold Update on ${USERS_ENTITY}`);
            Assert(/permission/i.test(serverError), `AV3: UpdateMJUser was refused, but not for permission — this proves nothing: ${serverError}`);

            // Client-side door: the entity save the browser used to make.
            const row = await leg.Provider.GetEntityObject<MJUserEntity>(USERS_ENTITY, leg.Provider.CurrentUser);
            Assert(await row.Load(leg.UserID), `AV3: ${leg.Email} could not load their own row (needs Read on ${USERS_ENTITY})`);
            row.UserImageURL = PNG_DATA_URI;
            row.UserImageIconClass = null;
            let saved = false;
            try {
                saved = await row.Save();
            } catch {
                saved = false;
            }
            Assert(!saved, `AV3: a plain entity Save() of ${leg.Email}'s own row SUCCEEDED`);

            const after = await readRow(ctx, leg.UserID);
            AssertEqual(avatarOf(after), avatarOf(before), 'AV3: the refused saves must not have changed the avatar');
        }
    },
    {
        Id: `${BUNDLE}.AV4`,
        Name: 'AV4: no other column and no other row can be changed through the mutation',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV4');
            if (!fx) return;
            const leg = fx.Locked!;

            for (const extra of ['Email: "attacker@example.com"', `UserID: "${fx.Editor!.UserID}"`, 'Name: "Owner"']) {
                const error = await gqlError(leg, `mutation { UpdateMyAvatar(ImageURL: null, IconClass: "${ICON}", ${extra}) { Success } }`, {});
                Assert(/Unknown argument/i.test(error), `AV4: UpdateMyAvatar accepted an extra argument (${extra}): ${error || 'no error'}`);
            }

            const lockedNow = await readRow(ctx, leg.UserID);
            const moved = changedNonAvatarColumns(leg.Snapshot, lockedNow);
            Assert(moved.length === 0, `AV4: ${leg.Email}'s ${moved.join(', ')} changed since Setup — only the avatar columns may move`);

            const editorNow = await readRow(ctx, fx.Editor!.UserID);
            const editorMoved = Object.keys(fx.Editor!.Snapshot).filter((k) => String(fx.Editor!.Snapshot[k]) !== String(editorNow[k]));
            Assert(editorMoved.length === 0, `AV4: another user's row (${fx.Editor!.Email}) changed: ${editorMoved.join(', ')}`);
        }
    },
    {
        Id: `${BUNDLE}.AV5`,
        Name: 'AV5: bad input is refused with a message and writes nothing',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV5');
            if (!fx) return;
            const leg = fx.Locked!;
            const oversize = `data:image/png;base64,${Buffer.alloc(200 * 1024 + 1, 7).toString('base64')}`;
            const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64')}`;
            const cases: Array<[string, string | null, string | null]> = [
                ['javascript: URL', 'javascript:alert(document.cookie)', null],
                ['SVG data URI', svg, null],
                ['text/html data URI', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', null],
                ['oversize image', oversize, null],
                ['malformed base64', 'data:image/png;base64,AA=A', null],
                ['relative URL', '/assets/user.png', null],
                ['icon with markup', null, 'fa-solid fa-user" onmouseover="alert(1)'],
                ['icon without an fa- class', null, 'glyphicon glyphicon-user'],
            ];
            const before = await readRow(ctx, leg.UserID);
            for (const [label, imageURL, iconClass] of cases) {
                const result = await updateMyAvatar(leg, imageURL, iconClass);
                Assert(!result.Success, `AV5: ${label} was ACCEPTED`);
                Assert(!!result.ErrorMessage, `AV5: ${label} was refused without a message`);
            }
            const after = await readRow(ctx, leg.UserID);
            AssertEqual(avatarOf(after), avatarOf(before), 'AV5: a refused request changed the avatar');
        }
    },
    {
        Id: `${BUNDLE}.AV6`,
        Name: 'AV6: a user WITH Update on MJ: Users can set and clear their avatar through the mutation too',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('AV6');
            if (!fx) return;
            const leg = fx.Editor!;
            Assert(usersPermissions(ctx, leg).CanUpdate,
                `AV6 precondition: ${leg.Email} must hold Update on ${USERS_ENTITY} for this leg to mean anything`);
            await setAndVerify(ctx, leg, PNG_DATA_URI, null, 'AV6');
            await setAndVerify(ctx, leg, null, null, 'AV6 (revert to default)');
        }
    }
];

for (const check of SelfAvatarClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
