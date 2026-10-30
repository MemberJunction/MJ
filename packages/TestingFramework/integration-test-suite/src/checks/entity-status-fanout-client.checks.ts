/**
 * Entity status push fan-out over WebSocket (IT148, client transport, mutating).
 *
 * Two sessions of one user each hold a `statusUpdates` subscription. A save in either session must
 * produce one `EntityObjectStatusMessage` with event type `save` in BOTH sessions, naming the saved
 * record: `ResolverBase.ListenForEntityMessages` relays to every active session of the user, not
 * only to the session whose call first created the listener.
 */
import type { UserInfo } from '@memberjunction/core';
import { MJUserSettingEntity } from '@memberjunction/core-entities';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck } from '@memberjunction/testing-integration';
import { CloseWireSession, OpenWireSession, Sleep } from './wire-sessions';

const BUNDLE = 'entity-status-fanout-client';
const ENTITY = 'MJ: User Settings';
/** How long a push is given to arrive after the save that raised it. */
const PUSH_WAIT_MS = 2_500;

interface StatusMessage {
    type?: string;
    entityName?: string;
    primaryKey?: unknown;
    eventType?: string;
}

interface Session {
    Provider: GraphQLDataProvider;
    Received: string[];
    Unsubscribe: () => void;
}

interface FanoutFixture {
    SessionA: Session;
    SessionB: Session;
    User: UserInfo;
    Tag: string;
    RecordIDs: string[];
}

let fixture: FanoutFixture | undefined;

function fx(): FanoutFixture {
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function openSubscribedSession(): Promise<Session> {
    const provider = await OpenWireSession(true);
    const received: string[] = [];
    const subscription = provider.PushStatusUpdates().subscribe(message => received.push(message));
    return { Provider: provider, Received: received, Unsubscribe: () => subscription.unsubscribe() };
}

/** The `save` pushes for `recordId` among `raw`, in arrival order. */
function savePushesFor(raw: string[], recordId: string): StatusMessage[] {
    const matches: StatusMessage[] = [];
    for (const text of raw) {
        try {
            const message = JSON.parse(text) as StatusMessage;
            if (message.type === 'EntityObjectStatusMessage'
                && message.entityName === ENTITY
                && message.eventType === 'save'
                && JSON.stringify(message.primaryKey).toLowerCase().includes(recordId.toLowerCase())) {
                matches.push(message);
            }
        } catch {
            // status text that is not JSON belongs to other producers
        }
    }
    return matches;
}

async function createSetting(session: Session, user: UserInfo, setting: string): Promise<string> {
    const entity = await session.Provider.GetEntityObject<MJUserSettingEntity>(ENTITY, user);
    entity.NewRecord();
    entity.UserID = user.ID;
    entity.Setting = setting;
    entity.Value = 'v0';
    Assert(await entity.Save(), `create failed: ${entity.LatestResult?.CompleteMessage ?? ''}`);
    fx().RecordIDs.push(entity.ID);
    return entity.ID;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async () => {
        const sessionA = await openSubscribedSession();
        const sessionB = await openSubscribedSession();
        const user = sessionA.Provider.CurrentUser;
        Assert(user != null, 'the system API key resolved no current user');
        // Give both sockets time to connect before the first save raises a push.
        await Sleep(PUSH_WAIT_MS);
        fixture = { SessionA: sessionA, SessionB: sessionB, User: user, Tag: `it148-${Date.now()}`, RecordIDs: [] };
    },
    Teardown: async () => {
        const f = fixture;
        fixture = undefined;
        if (!f) {
            return;
        }
        try {
            for (const id of f.RecordIDs) {
                const row = await f.SessionA.Provider.GetEntityObject<MJUserSettingEntity>(ENTITY, f.User);
                if (await row.Load(id)) {
                    await row.Delete();
                }
            }
        } finally {
            f.SessionA.Unsubscribe();
            f.SessionB.Unsubscribe();
            CloseWireSession(f.SessionA.Provider);
            CloseWireSession(f.SessionB.Provider);
        }
    }
});

async function checkSf1SavingSessionReceivesItsOwnPush(): Promise<void> {
    const f = fx();
    const id = await createSetting(f.SessionA, f.User, `${f.Tag}-A`);
    await Sleep(PUSH_WAIT_MS);
    Assert(savePushesFor(f.SessionA.Received, id).length === 1,
        `SF1: session A expected one save push for its own record, got ${savePushesFor(f.SessionA.Received, id).length} (raw ${f.SessionA.Received.length})`);
}

async function checkSf2OtherSessionOfSameUserReceivesPush(): Promise<void> {
    const f = fx();
    const id = await createSetting(f.SessionB, f.User, `${f.Tag}-B`);
    await Sleep(PUSH_WAIT_MS);
    AssertEqual(savePushesFor(f.SessionB.Received, id).length, 1, "SF2: session B's own save push");
    AssertEqual(savePushesFor(f.SessionA.Received, id).length, 1, "SF2: session A received B's save push (fan-out)");
}

async function checkSf3UpdateReachesBothSessionsOnce(): Promise<void> {
    const f = fx();
    const id = f.RecordIDs[f.RecordIDs.length - 1];
    const beforeA = f.SessionA.Received.length;
    const beforeB = f.SessionB.Received.length;
    const row = await f.SessionB.Provider.GetEntityObject<MJUserSettingEntity>(ENTITY, f.User);
    Assert(await row.Load(id), 'SF3: load failed');
    row.Value = 'v1';
    Assert(await row.Save(), `SF3: update failed: ${row.LatestResult?.CompleteMessage ?? ''}`);
    await Sleep(PUSH_WAIT_MS);
    AssertEqual(savePushesFor(f.SessionA.Received.slice(beforeA), id).length, 1, 'SF3: save pushes in session A for the update');
    AssertEqual(savePushesFor(f.SessionB.Received.slice(beforeB), id).length, 1, 'SF3: save pushes in session B for the update');
}

export const EntityStatusFanoutClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.SF1`, Name: 'SF1: the saving session receives one save push for its own record', Fn: checkSf1SavingSessionReceivesItsOwnPush, RequiresMutation: true },
    { Id: `${BUNDLE}.SF2`, Name: "SF2: a second session of the same user receives the other session's save push", Fn: checkSf2OtherSessionOfSameUserReceivesPush, RequiresMutation: true },
    { Id: `${BUNDLE}.SF3`, Name: 'SF3: an update reaches both sessions exactly once each', Fn: checkSf3UpdateReachesBothSessionsOnce, RequiresMutation: true }
];

for (const check of EntityStatusFanoutClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
