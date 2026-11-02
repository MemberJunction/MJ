/**
 * video-data-snapshot.checks.ts — the 'video-data-snapshot' bundle (VDS1–VDS3, IT154), VS-DAT-1.
 *
 * Deterministic, server-transport integration checks for `CaptureDataSnapshot` and
 * `LoadDataSnapshotValues` against the live Row-Level Security and entity-permission layer:
 *
 * - VDS1: Capturing a `View` binding on `MJ: AI Agent Runs` (`Fields: ['ID', 'UserID']`,
 *   `ExtraFilter` naming both fixture rows, `Shape: 'Table'`) as seeded user A (`it-rls-a`)
 *   returns only A's row; capturing as seeded user B (`it-rls-b`) returns only B's row.
 * - VDS2: Capturing the same binding as the seeded no-grant user (`it-nogrant`) does not
 *   throw, records an `'Error'` issue for the binding, and leaves no rows in `Values`.
 * - VDS3: Capturing as user A and reading back via `LoadDataSnapshotValues` returns values
 *   deep-equal to `Values`, `Snapshot.AsOf` parses as a valid ISO timestamp, and
 *   `Snapshot.Sources` equals `['View:MJ: AI Agent Runs']`.
 */
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    FindUserByEmail,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    NamedCheck,
    SEED_FIXTURES_COMMAND,
    SEEDED_NOGRANT_EMAIL,
    SEEDED_RLS_ENTITY,
    SEEDED_SCOPED_A_EMAIL,
    SEEDED_SCOPED_B_EMAIL,
} from '@memberjunction/testing-integration';
import { CaptureDataSnapshot, LoadDataSnapshotValues } from '@memberjunction/video-studio';
import type { DataTableValue, VideoDataBinding } from '@memberjunction/video-studio-core';
import { DeleteById } from './agent-live-shared';

const ECHO_AGENT_NAME = 'IT: Echo Agent';
const BINDING_KEY = 'agent.runs';

interface VideoDataSnapshotFixture {
    UserA: UserInfo;
    UserB: UserInfo;
    NoGrant: UserInfo;
    RunAId: string;
    RunBId: string;
}

let snapshotFixture: VideoDataSnapshotFixture | undefined;

function requireFixture(): VideoDataSnapshotFixture {
    Assert(
        snapshotFixture != null,
        `video-data-snapshot bundle fixture was not initialized by Setup (run \`${SEED_FIXTURES_COMMAND}\` if seeded fixtures are missing)`,
    );
    return snapshotFixture!;
}

function buildAgentRunsBinding(fx: VideoDataSnapshotFixture): VideoDataBinding {
    return {
        Key: BINDING_KEY,
        Source: {
            Kind: 'View',
            EntityName: SEEDED_RLS_ENTITY,
            Fields: ['ID', 'UserID'],
            ExtraFilter: `ID IN ('${EscapeSQLString(fx.RunAId)}', '${EscapeSQLString(fx.RunBId)}')`,
        },
        Shape: 'Table',
    };
}

export const VideoDataSnapshotChecks: NamedCheck[] = [
    {
        Id: 'video-data-snapshot.VDS1',
        Name: 'VDS1: (deterministic) CaptureDataSnapshot on MJ: AI Agent Runs enforces RLS per contextUser (user A sees only row A, user B sees only row B)',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const binding = buildAgentRunsBinding(fx);

            const resA = await CaptureDataSnapshot([binding], undefined, {
                ContextUser: fx.UserA,
                Provider: ctx.Provider,
            });
            const errorsA = resA.Issues.filter((i) => i.Severity === 'Error');
            AssertEqual(
                errorsA.length,
                0,
                `VDS1: capture as ${fx.UserA.Email} produced unexpected error(s): ${errorsA.map((e) => e.Message).join('; ')}`,
            );
            const rowsA = resA.Values[BINDING_KEY] as DataTableValue | undefined;
            Assert(Array.isArray(rowsA), 'VDS1: user A capture must produce a Table array');
            AssertEqual(rowsA!.length, 1, `VDS1: user A must see exactly 1 row, got ${rowsA!.length}`);
            Assert(
                UUIDsEqual(String(rowsA![0].ID ?? ''), fx.RunAId),
                `VDS1: user A row ID (${String(rowsA![0].ID)}) must match RunAId (${fx.RunAId})`,
            );
            Assert(
                UUIDsEqual(String(rowsA![0].UserID ?? ''), fx.UserA.ID),
                `VDS1: user A row UserID (${String(rowsA![0].UserID)}) must match UserA.ID (${fx.UserA.ID})`,
            );

            const resB = await CaptureDataSnapshot([binding], undefined, {
                ContextUser: fx.UserB,
                Provider: ctx.Provider,
            });
            const errorsB = resB.Issues.filter((i) => i.Severity === 'Error');
            AssertEqual(
                errorsB.length,
                0,
                `VDS1: capture as ${fx.UserB.Email} produced unexpected error(s): ${errorsB.map((e) => e.Message).join('; ')}`,
            );
            const rowsB = resB.Values[BINDING_KEY] as DataTableValue | undefined;
            Assert(Array.isArray(rowsB), 'VDS1: user B capture must produce a Table array');
            AssertEqual(rowsB!.length, 1, `VDS1: user B must see exactly 1 row, got ${rowsB!.length}`);
            Assert(
                UUIDsEqual(String(rowsB![0].ID ?? ''), fx.RunBId),
                `VDS1: user B row ID (${String(rowsB![0].ID)}) must match RunBId (${fx.RunBId})`,
            );
            Assert(
                UUIDsEqual(String(rowsB![0].UserID ?? ''), fx.UserB.ID),
                `VDS1: user B row UserID (${String(rowsB![0].UserID)}) must match UserB.ID (${fx.UserB.ID})`,
            );
        },
    },
    {
        Id: 'video-data-snapshot.VDS2',
        Name: 'VDS2: (deterministic) CaptureDataSnapshot as it-nogrant records an Error issue for the denied binding with no rows and no throw',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const binding = buildAgentRunsBinding(fx);

            const res = await CaptureDataSnapshot([binding], undefined, {
                ContextUser: fx.NoGrant,
                Provider: ctx.Provider,
            });

            const bindingErrors = res.Issues.filter(
                (i) => i.Severity === 'Error' && i.BindingKey === BINDING_KEY,
            );
            Assert(
                bindingErrors.length >= 1,
                `VDS2: capture as ${fx.NoGrant.Email} must record an Error issue for '${BINDING_KEY}', got issues: ${JSON.stringify(res.Issues)}`,
            );
            AssertEqual(
                res.Values[BINDING_KEY],
                undefined,
                `VDS2: denied binding '${BINDING_KEY}' must not populate Values (got ${JSON.stringify(res.Values[BINDING_KEY])})`,
            );
        },
    },
    {
        Id: 'video-data-snapshot.VDS3',
        Name: 'VDS3: (deterministic) CaptureDataSnapshot + LoadDataSnapshotValues round-trips Values, valid AsOf timestamp, and Sources list',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const fx = requireFixture();
            const binding = buildAgentRunsBinding(fx);

            const res = await CaptureDataSnapshot([binding], undefined, {
                ContextUser: fx.UserA,
                Provider: ctx.Provider,
            });
            Assert(res.Snapshot != null, 'VDS3: CaptureDataSnapshot must return a Snapshot');
            const snapshot = res.Snapshot!;

            const parsedAsOf = Date.parse(snapshot.AsOf);
            Assert(
                !Number.isNaN(parsedAsOf),
                `VDS3: Snapshot.AsOf ('${snapshot.AsOf}') must parse as a valid ISO timestamp`,
            );
            AssertEqual(
                JSON.stringify(snapshot.Sources),
                JSON.stringify([`View:${SEEDED_RLS_ENTITY}`]),
                `VDS3: Snapshot.Sources must equal ['View:${SEEDED_RLS_ENTITY}']`,
            );

            const loaded = await LoadDataSnapshotValues(snapshot, {
                ContextUser: fx.UserA,
                Provider: ctx.Provider,
            });
            AssertEqual(
                JSON.stringify(loaded),
                JSON.stringify(res.Values),
                'VDS3: LoadDataSnapshotValues must deep-equal the captured Values',
            );
        },
    },
];

for (const check of VideoDataSnapshotChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Bundle Lifecycle ────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('video-data-snapshot', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const cachedUsers = UserCache.Instance.Users ?? [];
        const userA = ctx.RlsFixture?.SeededScopedA ?? FindUserByEmail(cachedUsers, SEEDED_SCOPED_A_EMAIL);
        const userB = ctx.RlsFixture?.SeededScopedB ?? FindUserByEmail(cachedUsers, SEEDED_SCOPED_B_EMAIL);
        const noGrant = ctx.RlsFixture?.SeededNoGrant ?? FindUserByEmail(cachedUsers, SEEDED_NOGRANT_EMAIL);

        Assert(
            userA != null && userB != null && noGrant != null,
            `Seeded integration users (${SEEDED_SCOPED_A_EMAIL}, ${SEEDED_SCOPED_B_EMAIL}, ${SEEDED_NOGRANT_EMAIL}) not found in UserCache — run \`${SEED_FIXTURES_COMMAND}\` before running this suite.`,
        );

        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const agentRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `Name = '${EscapeSQLString(ECHO_AGENT_NAME)}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            ctx.User,
        );
        Assert(
            agentRes.Success && agentRes.Results.length > 0,
            `Seeded agent '${ECHO_AGENT_NAME}' not found — run \`${SEED_FIXTURES_COMMAND}\` before running this suite.`,
        );
        const echoAgentId = agentRes.Results[0].ID;

        const runA = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>(SEEDED_RLS_ENTITY, ctx.User);
        runA.NewRecord();
        runA.AgentID = echoAgentId;
        runA.UserID = userA!.ID;
        runA.Status = 'Completed';
        runA.StartedAt = new Date();
        Assert(
            await runA.Save(),
            `video-data-snapshot Setup failed saving runA: ${runA.LatestResult?.CompleteMessage ?? ''}`,
        );

        const runB = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>(SEEDED_RLS_ENTITY, ctx.User);
        runB.NewRecord();
        runB.AgentID = echoAgentId;
        runB.UserID = userB!.ID;
        runB.Status = 'Completed';
        runB.StartedAt = new Date();
        if (!(await runB.Save())) {
            await DeleteById(SEEDED_RLS_ENTITY, runA.ID, ctx.Provider, ctx.User).catch(() => undefined);
            Assert(
                false,
                `video-data-snapshot Setup failed saving runB: ${runB.LatestResult?.CompleteMessage ?? ''}`,
            );
        }

        snapshotFixture = {
            UserA: userA!,
            UserB: userB!,
            NoGrant: noGrant!,
            RunAId: runA.ID,
            RunBId: runB.ID,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = snapshotFixture;
        snapshotFixture = undefined;
        if (!fx) {
            return;
        }
        for (const runId of [fx.RunAId, fx.RunBId]) {
            await DeleteById(SEEDED_RLS_ENTITY, runId, ctx.Provider, ctx.User).catch((err: unknown) =>
                console.error(`[video-data-snapshot] cleanup failed for ${SEEDED_RLS_ENTITY} ${runId}:`, err),
            );
        }
    },
});
