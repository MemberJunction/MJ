/**
 * Mail retrieval on the MS Graph provider: what reaches Graph.
 *
 * WHY THESE PIN THE REQUEST. A caller that asks for reply headers through `ContextData.Expand` and
 * gets messages back without them sees nothing wrong in the payload: the messages are all there,
 * only the properties are missing. So the request itself is asserted: `$expand` is sent when asked
 * for and only then, and it does not displace the composed filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { shared, calls, setResponse, mockGraphApi } = await vi.hoisted(async () => {
    const shared = await import('./graph-mocks');
    return { shared, ...shared.createGraphApiMock() };
});

// The real filter helpers (GetMessages composes its OData with them); the shared mock for the rest.
vi.mock('@memberjunction/communication-types', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/communication-types')>()),
    ...shared.communicationTypesMock(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('env-var', () => shared.envVarMock());

vi.mock('@microsoft/microsoft-graph-client', () => ({
    Client: { initWithMiddleware: vi.fn().mockReturnValue({ api: mockGraphApi }) },
}));

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials', () => ({
    TokenCredentialAuthenticationProvider: vi.fn().mockImplementation(function () {
        return {};
    }),
}));

import { MSGraphProvider } from '../MSGraphProvider';

const EXPAND = "singleValueExtendedProperties($filter=id eq 'String 0x1042' or id eq 'Integer 0x0036')";

describe('GetMessages request', () => {
    let provider: MSGraphProvider;
    beforeEach(() => {
        calls.length = 0;
        setResponse({ value: [{ id: 'm1', subject: 'Quote', singleValueExtendedProperties: [{ id: 'String 0x1042', value: '<a@x>' }] }] });
        provider = new MSGraphProvider();
    });

    it('sends ContextData.Expand as $expand and returns the expanded properties in SourceData', async () => {
        const result = await provider.GetMessages({ Identifier: 'rep@example.com', NumMessages: 10, ContextData: { Expand: EXPAND } });
        expect(calls[0].expand).toBe(EXPAND);
        expect(result.SourceData?.[0]).toMatchObject({ singleValueExtendedProperties: [{ id: 'String 0x1042', value: '<a@x>' }] });
    });

    it('sends no $expand when none is asked for, or a blank one', async () => {
        await provider.GetMessages({ Identifier: 'rep@example.com', NumMessages: 10 });
        await provider.GetMessages({ Identifier: 'rep@example.com', NumMessages: 10, ContextData: { Expand: '   ' } });
        expect(calls.map((c) => c.expand)).toEqual([undefined, undefined]);
    });

    it('keeps the composed filter alongside $expand', async () => {
        await provider.GetMessages({
            Identifier: 'rep@example.com',
            NumMessages: 5,
            ReceivedAfter: new Date('2026-11-01T00:00:00Z'),
            ContextData: { Filter: "categories/any(c:c eq 'AIDP')", Expand: EXPAND },
        });
        expect(calls[0].filter).toContain('receivedDateTime ge 2026-11-01T00:00:00');
        expect(calls[0].filter).toContain("categories/any(c:c eq 'AIDP')");
        expect(calls[0].expand).toBe(EXPAND);
        expect(calls[0].top).toBe(5);
    });
});
