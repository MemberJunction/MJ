import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A recipient whose address field the sender cannot read is skipped, not sent to an empty address.
 * The skip is reported per recipient without revealing the address, the other recipients are still
 * sent, and a preview reports the same thing a send does.
 */

const SENDER = { ID: 'sender-user', Name: 'Sender' };

type Row = Record<string, string>;
type SentRecipient = { To: string; ContextData: object };

const captured: { sent: SentRecipient[][] } = { sent: [] };
const state: { preferredField: string; denied: string[]; rows: Row[] } = { preferredField: '', denied: [], rows: [] };

function narrow(rows: Row[]): Row[] {
    return rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !state.denied.includes(k.toLowerCase()))));
}

const CUSTOMERS = {
    ID: 'customers-id',
    Name: 'Customers',
    EnableFieldLevelSecurity: true,
    FieldLevelSecurityApplies: true,
    Fields: ['ID', 'PreferredField', 'Email', 'Phone'].map(n => ({ Name: n })),
    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
    get PreferredCommunicationField() { return state.preferredField; },
    GetDeniedReadFields: () => new Set(state.denied),
};

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    Metadata: vi.fn().mockImplementation(function () {
        return { Entities: [CUSTOMERS], EntityByName: () => CUSTOMERS };
    }),
    RunView: vi.fn().mockImplementation(function () {
        return { RunView: async () => ({ Success: true, Results: narrow(state.rows) }) };
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
            SendMessages: vi.fn().mockImplementation(async (_p: string, _t: string, _m: unknown, recipients: SentRecipient[]) => {
                captured.sent.push(recipients);
                return recipients.map(r => ({ Success: !!r.To, Error: r.To ? '' : 'No recipient address', Message: { To: r.To } }));
            }),
        },
    },
}));

vi.mock('@memberjunction/entity-communications-base', () => {
    class MockBase {
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

function params(previewOnly: boolean): EntityCommunicationParams {
    return {
        EntityID: 'customers-id',
        RunViewParams: { ViewID: 'view-1' },
        ProviderName: 'SendGrid',
        ProviderMessageTypeName: 'Email',
        Message: { Body: 'Hello', BodyTemplate: null, HTMLBodyTemplate: null, SubjectTemplate: null },
        PreviewOnly: previewOnly,
        IncludeProcessedMessages: true,
        ContextUser: SENDER as unknown as UserInfo,
    } as unknown as EntityCommunicationParams;
}

const SKIP_MESSAGE = /Recipient skipped: the sender cannot read the address field/;

describe.each([true, false])('EntityCommunicationsEngine — address the sender cannot read (previewOnly=%s)', (previewOnly) => {
    beforeEach(() => {
        captured.sent = [];
        state.preferredField = '';
        state.denied = [];
        state.rows = [
            { ID: 'c1', PreferredField: 'Email', Email: 'secret-1@example.com', Phone: '555-0001' },
            { ID: 'c2', PreferredField: 'Phone', Email: 'secret-2@example.com', Phone: '555-0002' },
        ];
    });

    it('skips every recipient when the entity-level address field is denied, sending nothing', async () => {
        state.denied = ['email'];
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(previewOnly));

        expect(captured.sent.flat()).toHaveLength(0);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(SKIP_MESSAGE);
        expect(result.Results).toHaveLength(2);
        for (const item of result.Results ?? []) {
            expect(item.Skipped).toBe(true);
            expect(item.SkipReason).toMatch(SKIP_MESSAGE);
        }
        expect(JSON.stringify(result)).not.toContain('secret-');
    });

    it('skips only the recipients whose preferred address field is denied, and sends the rest', async () => {
        state.preferredField = 'PreferredField';
        state.denied = ['email'];
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(previewOnly));

        expect(captured.sent.flat().map(r => r.To)).toEqual(['555-0002']);
        // A partial run succeeds so the preview shows what could be built; the skip is still reported.
        expect(result.Success).toBe(true);
        expect(result.ErrorMessage).toMatch(SKIP_MESSAGE);
        expect(result.Results).toHaveLength(2);
        const [first, second] = result.Results ?? [];
        expect(first.Skipped).toBe(true);
        expect(first.SkipReason).toMatch(SKIP_MESSAGE);
        expect(second.Skipped).toBeFalsy();
        expect(second.Message).toEqual({ To: '555-0002' });
        expect(JSON.stringify(result)).not.toContain('secret-');
    });

    it('skips a recipient when the field naming its preferred address is itself denied', async () => {
        state.preferredField = 'PreferredField';
        state.denied = ['preferredfield'];
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(previewOnly));

        expect(captured.sent.flat()).toHaveLength(0);
        expect((result.Results ?? []).every(r => r.Skipped)).toBe(true);
    });

    it('sends to everyone and reports no skip when the sender can read every address', async () => {
        const result = await new EntityCommunicationsEngine().RunEntityCommunication(params(previewOnly));

        expect(captured.sent.flat().map(r => r.To)).toEqual(['secret-1@example.com', 'secret-2@example.com']);
        expect(result.Success).toBe(true);
        expect((result.Results ?? []).some(r => r.Skipped)).toBe(false);
    });
});
