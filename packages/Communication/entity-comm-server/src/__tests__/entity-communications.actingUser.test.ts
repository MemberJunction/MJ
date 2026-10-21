import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * An entity communication reads recipient rows and related-entity rows and returns them (with the
 * rendered messages) to the caller, or merges them into mail. Every one of those reads must run
 * as the acting user, never the engine's own context user, and no field the acting user cannot
 * read may reach the recipient data, the context data, or a rendered message.
 */

const SYSTEM_USER = { ID: 'system-user', Name: 'System' };
const SENDER = { ID: 'sender-user', Name: 'Sender' };

type Row = Record<string, string>;
type CapturedRunView = { params: Record<string, unknown>; user: { ID: string } | undefined };

const captured: { runViews: CapturedRunView[]; sendUser: { ID: string } | undefined } = { runViews: [], sendUser: undefined };

/** What the database holds. A real provider narrows these per user; `narrowAtSource` toggles that. */
const CUSTOMERS: Row[] = [{ ID: 'c1', Email: 'c1@example.com', Salary: '250000' }];
const ORDERS: Row[] = [{ ID: 'o1', CustomerID: 'c1', Discount: '40%' }];
const DENIED_FOR_SENDER: Record<string, string[]> = { Customers: ['salary'], Orders: ['discount'] };
const state = { narrowAtSource: true };

function denied(entityName: string, user: { ID: string } | undefined): Set<string> {
    return new Set(user?.ID === SENDER.ID ? DENIED_FOR_SENDER[entityName] ?? [] : []);
}

function narrow(rows: Row[], entityName: string, user: { ID: string } | undefined): Row[] {
    if (!state.narrowAtSource) return rows.map(r => ({ ...r }));
    const d = denied(entityName, user);
    return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !d.has(k.toLowerCase()))));
}

function fakeEntity(name: string, fieldNames: string[]) {
    return {
        ID: name === 'Customers' ? 'customers-id' : 'orders-id',
        Name: name,
        EnableFieldLevelSecurity: true,
        Fields: fieldNames.map(n => ({ Name: n })),
        FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
        PreferredCommunicationField: '',
        GetDeniedReadFields: (user: { ID: string }) => denied(name, user),
    };
}
const ENTITIES = [fakeEntity('Customers', ['ID', 'Email', 'Salary']), fakeEntity('Orders', ['ID', 'CustomerID', 'Discount'])];

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    Metadata: vi.fn().mockImplementation(function () {
        return { Entities: ENTITIES, EntityByName: (n: string) => ENTITIES.find(e => e.Name === n) };
    }),
    RunView: vi.fn().mockImplementation(function () {
        return {
            RunView: async (params: Record<string, unknown>, user: { ID: string } | undefined) => {
                captured.runViews.push({ params, user });
                const isOrders = params.EntityName === 'Orders';
                return { Success: true, Results: isOrders ? narrow(ORDERS, 'Orders', user) : narrow(CUSTOMERS, 'Customers', user) };
            },
        };
    }),
}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => a === b,
}));

vi.mock('@memberjunction/communication-engine', () => ({
    CommunicationEngine: {
        Instance: {
            Config: vi.fn(),
            Providers: [{ Name: 'SendGrid', SupportsSending: true, MessageTypes: [{ Name: 'Email', CommunicationBaseMessageTypeID: 'bmt-email' }] }],
            SendMessages: vi.fn().mockImplementation(async (_p: string, _t: string, _m: unknown, recipients: { ContextData: object }[], _preview: boolean, _cred: unknown, user: { ID: string }) => {
                captured.sendUser = user;
                return recipients.map(r => ({ Success: true, Message: { ProcessedBody: JSON.stringify(r.ContextData) } }));
            }),
        },
    },
}));

vi.mock('@memberjunction/entity-communications-base', () => {
    class MockBase {
        protected ContextUser = SYSTEM_USER;
        protected TryThrowIfNotLoaded() { /* loaded */ }
        static getInstance() { return new MockBase(); }
        GetEntityCommunicationMessageTypes() {
            return [{ BaseMessageTypeID: 'bmt-email', CommunicationFields: [{ FieldName: 'Email', Priority: 1 }] }];
        }
        EntitySupportsCommunication() { return true; }
    }
    return { EntityCommunicationsEngineBase: MockBase };
});

import { EntityCommunicationsEngine } from '../entity-communications';
import type { EntityCommunicationParams } from '@memberjunction/entity-communications-base';
import type { UserInfo } from '@memberjunction/core';

function params(contextUser: { ID: string } | undefined): EntityCommunicationParams {
    const template = {
        Params: [
            { Name: 'rec', Type: 'Record' },
            { Name: 'orders', Type: 'Entity', Entity: 'Orders', LinkedParameterField: 'CustomerID' },
        ],
    };
    return {
        EntityID: 'customers-id',
        RunViewParams: { ViewID: 'view-1' },
        ProviderName: 'SendGrid',
        ProviderMessageTypeName: 'Email',
        Message: { BodyTemplate: template, HTMLBodyTemplate: null, SubjectTemplate: null },
        PreviewOnly: true,
        IncludeProcessedMessages: true,
        ContextUser: contextUser as unknown as UserInfo,
    } as unknown as EntityCommunicationParams;
}

describe('EntityCommunicationsEngine — runs as the acting user', () => {
    beforeEach(() => {
        captured.runViews = [];
        captured.sendUser = undefined;
        state.narrowAtSource = true;
    });

    it('fetches recipient and related rows as the passed user, not the engine context user', async () => {
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(SENDER));
        expect(result.Success).toBe(true);
        expect(captured.runViews).toHaveLength(2);
        for (const rv of captured.runViews) {
            expect(rv.user?.ID).toBe(SENDER.ID);
        }
        expect(captured.sendUser?.ID).toBe(SENDER.ID);
    });

    it('names the entity on the recipient view request', async () => {
        await new EntityCommunicationsEngine().RunEntityCommunication(params(SENDER));
        expect(captured.runViews[0].params.EntityName).toBe('Customers');
    });

    it('never puts a field the sender cannot read into recipient data, context data or rendered messages', async () => {
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(SENDER));
        const serialized = JSON.stringify(result.Results);
        expect(serialized).not.toContain('250000');
        expect(serialized).not.toContain('40%');
        expect(serialized).toContain('c1@example.com');
    });

    it('strips denied fields even when the rows come back wider than the sender may read', async () => {
        state.narrowAtSource = false;
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(SENDER));
        const serialized = JSON.stringify(result.Results);
        expect(serialized).not.toContain('250000');
        expect(serialized).not.toContain('40%');
    });

    it('refuses to run without an acting user', async () => {
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(undefined));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/ContextUser/);
        expect(captured.runViews).toHaveLength(0);
    });
});
