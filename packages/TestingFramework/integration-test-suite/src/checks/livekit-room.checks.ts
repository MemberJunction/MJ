/**
 * livekit-room.checks.ts — the 'livekit-room' bundle (LKR1).
 *
 * TRANSPORT: **CLIENT** (needs a live MJAPI). The LiveKit room's server-authorized operations, driven over the GraphQL
 * wire through the typed `GraphQLLiveKitClient`, the client the meeting room uses; every observation of a server-side
 * effect (the audit rows) goes through `RunView` on the same wire.
 *
 * No LiveKit server is needed. The checks use a room nobody is in, so LiveKit refuses (or, when MJAPI has no LiveKit
 * credentials, the server does), and what is under test is everything around that refusal: who the server answers
 * for, and what it records.
 *
 * | Check | Proves |
 * |---|---|
 * | LKR1 | an agent-vision choice for a room the user is not in is refused with a reason, is answered for the signed-in user (no identity crosses the wire), and is audited either way: one Failed `Realtime Agent Vision Consent` row per call, about that user, with the room and the choice |
 *
 * The server writes audit rows, so LKR1 is `RequiresMutation`; Teardown deletes them.
 */
import { Metadata, RunView } from '@memberjunction/core';
import type { BaseEntity } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLLiveKitClient } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const AUDIT_LOG_ENTITY = 'MJ: Audit Logs';
const AUDIT_LOG_TYPE_ENTITY = 'MJ: Audit Log Types';
/** Seeded in `metadata/audit-log-types/.realtime-session-audit-types.json`. */
const CONSENT_AUDIT_TYPE = 'Realtime Agent Vision Consent';

/** A consent audit row, as the check reads it back. */
interface ConsentAuditRow {
    ID: string;
    UserID: string;
    RecordID: string | null;
    Status: string;
    Details: string | null;
}

/** Audit rows the bundle caused (deleted in Teardown). */
let createdAuditIds: string[] = [];

/** The real wire provider (the driver's `ctx.Provider` can be a facade — see realtime-session-verification.checks.ts). */
function resolveWireProvider(ctx: IntegrationCheckContext): GraphQLDataProvider | null {
    if (ctx.Provider instanceof GraphQLDataProvider) {
        return ctx.Provider;
    }
    const globalProvider = Metadata.Provider; // global-provider-ok: the client bootstrap installs the GraphQLDataProvider as the process global; the wire path deliberately resolves it
    return globalProvider instanceof GraphQLDataProvider ? globalProvider : null;
}

/** The consent audit log type's ID, or null when the deployment has not seeded it. */
async function consentAuditTypeId(ctx: IntegrationCheckContext): Promise<string | null> {
    const types = await new RunView().RunView<{ ID: string }>(
        { EntityName: AUDIT_LOG_TYPE_ENTITY, Fields: ['ID'], ExtraFilter: `Name='${EscapeSQLString(CONSENT_AUDIT_TYPE)}'`, ResultType: 'simple', BypassCache: true },
        ctx.User,
    );
    return types.Success ? (types.Results?.[0]?.ID ?? null) : null;
}

/** The consent audit rows that name this room. */
async function consentRowsFor(ctx: IntegrationCheckContext, typeId: string, roomName: string): Promise<ConsentAuditRow[]> {
    const rows = await new RunView().RunView<ConsentAuditRow>(
        {
            EntityName: AUDIT_LOG_ENTITY,
            Fields: ['ID', 'UserID', 'RecordID', 'Status', 'Details'],
            ExtraFilter: `AuditLogTypeID='${EscapeSQLString(typeId)}' AND Details LIKE '%"roomName":"${EscapeSQLString(roomName)}"%'`,
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User,
    );
    return rows.Success ? (rows.Results ?? []) : [];
}

export const LiveKitRoomChecks: NamedCheck[] = [
    {
        Id: 'livekit-room.LKR1',
        Name: 'LKR1: an agent-vision choice for a room the user is not in is refused, answered for the signed-in user, and audited',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const id = 'LKR1';
            const provider = resolveWireProvider(ctx);
            if (!provider) {
                console.warn(`  ⚠ ${id} SKIPPED — no GraphQL wire provider (this bundle runs on the client transport against a live MJAPI)`);
                return;
            }
            const typeId = await consentAuditTypeId(ctx);
            if (!typeId) {
                console.warn(`  ⚠ ${id} SKIPPED — audit log type '${CONSENT_AUDIT_TYPE}' is not seeded (push metadata/audit-log-types)`);
                return;
            }
            // A room nobody is in: LiveKit refuses, or the server does when it has no LiveKit credentials.
            const roomName = `mj-it-lkr-${Date.now().toString(36)}`;
            const client = new GraphQLLiveKitClient(provider);
            const allowed = await client.SetAgentVision(roomName, true);
            const withdrawn = await client.SetAgentVision(roomName, false);
            Assert(!allowed.Success && !!allowed.ErrorMessage, `allowing in a room the user is not in must be refused with a reason; got ${JSON.stringify(allowed)}`);
            Assert(!withdrawn.Success && !!withdrawn.ErrorMessage, `withdrawing in a room the user is not in must be refused with a reason; got ${JSON.stringify(withdrawn)}`);
            console.log(`      → refused: ${allowed.ErrorMessage}`);

            const rows = await consentRowsFor(ctx, typeId, roomName);
            createdAuditIds.push(...rows.map((r) => r.ID));
            AssertEqual(rows.length, 2, 'one consent audit row per call');
            for (const row of rows) {
                Assert(UUIDsEqual(row.UserID, ctx.User.ID) && UUIDsEqual(row.RecordID ?? '', ctx.User.ID), `the audit row is about the signed-in user (row ${row.ID})`);
                AssertEqual(row.Status, 'Failed', 'a refused change is audited as Failed');
            }
            const choices = rows.map((r) => (JSON.parse(r.Details ?? '{}') as { allow?: boolean }).allow).sort();
            AssertEqual(JSON.stringify(choices), JSON.stringify([false, true]), 'the rows record the choices made');
        },
    },
];

for (const check of LiveKitRoomChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/** Best-effort wire deletion of the audit rows this bundle caused. */
async function sweep(ctx: IntegrationCheckContext): Promise<void> {
    for (const auditId of createdAuditIds) {
        const rows = await new RunView().RunView<BaseEntity>(
            { EntityName: AUDIT_LOG_ENTITY, ExtraFilter: `ID='${EscapeSQLString(auditId)}'`, ResultType: 'entity_object', BypassCache: true },
            ctx.User,
        );
        for (const row of rows.Success ? (rows.Results ?? []) : []) {
            await row.Delete().catch(() => false);
        }
    }
    createdAuditIds = [];
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('livekit-room', {
    Setup: async () => {
        createdAuditIds = [];
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        await sweep(ctx);
    },
});
